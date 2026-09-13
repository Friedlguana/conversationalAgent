"""
agent.py - Real-Time Multimodal Conversational Agent using Google Gemini Live API.
True native speech-to-speech with sub-second latency, continuous multi-turn memory,
and studio-grade human voices.
"""

import os
import sys
import time
import queue
import asyncio
import threading
import numpy as np
import pyaudio
from dotenv import load_dotenv

load_dotenv()

from google import genai
from google.genai import types

# Audio Format Configurations
INPUT_SAMPLE_RATE = 16000
INPUT_CHUNK_SIZE = 512
OUTPUT_SAMPLE_RATE = 24000
OUTPUT_CHUNK_SIZE = 1024


class GeminiLiveAgent:
    """Manages low-latency full-duplex conversational audio with Gemini 3.1 Live API."""

    def __init__(self, voice_name: str | None = None, system_prompt: str | None = None):
        self.api_key = os.getenv("GEMINI_API_KEY")
        if not self.api_key:
            print("\n❌ Error: GEMINI_API_KEY not found in .env!")
            print("Please add GEMINI_API_KEY=your_key_here to .env")
            print("Get a free key from: https://aistudio.google.com/apikey\n")
            sys.exit(1)

        self.client = genai.Client(api_key=self.api_key)
        self.voice_name = voice_name or os.getenv("GEMINI_VOICE") or "Aoede"
        self.echo_cancellation = os.getenv("ECHO_CANCELLATION", "true").lower() == "true"
        self.system_prompt = system_prompt or self._load_system_prompt()
        self.pyaudio = pyaudio.PyAudio()
        
        # Thread-safe audio queues
        self.mic_queue = queue.Queue(maxsize=100)
        self.speaker_queue = queue.Queue()
        
        self.is_running = False
        self.is_agent_speaking = False
        self.model = "gemini-3.1-flash-live-preview"

    def _load_system_prompt(self) -> str:
        """Loads system prompt from system_prompt.txt, .env, or default fallback."""
        prompt_file = os.path.join(os.path.dirname(__file__), "system_prompt.txt")
        if os.path.exists(prompt_file):
            try:
                with open(prompt_file, "r", encoding="utf-8") as f:
                    content = f.read().strip()
                    if content:
                        return content
            except Exception as e:
                print(f"[Notice] Could not read system_prompt.txt: {e}")

        env_prompt = os.getenv("SYSTEM_PROMPT", "").strip()
        if env_prompt:
            return env_prompt

        return (
            "You are a warm, lively, and witty conversational voice companion. "
            "Speak naturally with genuine emotion and humor, like chatting with a close friend. "
            "Keep your responses concise and punchy (1 to 2 sentences max) for real-time spoken dialogue."
        )

    def _mic_thread_worker(self, input_stream):
        """Dedicated background thread continuously capturing microphone audio."""
        while self.is_running:
            try:
                data = input_stream.read(INPUT_CHUNK_SIZE, exception_on_overflow=False)
                if data:
                    # Echo suppression: if agent is currently speaking through speakers,
                    # prevent speaker sound from leaking back into mic and causing self-interruption
                    if self.is_agent_speaking and self.echo_cancellation:
                        continue

                    try:
                        self.mic_queue.put_nowait(data)
                    except queue.Full:
                        try:
                            self.mic_queue.get_nowait()
                            self.mic_queue.put_nowait(data)
                        except (queue.Empty, queue.Full):
                            pass
            except Exception:
                time.sleep(0.01)

    def _speaker_thread_worker(self, output_stream):
        """Dedicated background thread playing received 24kHz PCM audio chunks."""
        while self.is_running:
            try:
                chunk = self.speaker_queue.get(timeout=0.04)
                if chunk:
                    self.is_agent_speaking = True
                    output_stream.write(chunk)
                    self.speaker_queue.task_done()
                    if self.speaker_queue.empty():
                        self.is_agent_speaking = False
            except queue.Empty:
                self.is_agent_speaking = False
                continue
            except Exception:
                self.is_agent_speaking = False

    async def _audio_input_loop(self, session):
        """Streams microphone audio chunks to Gemini Live WebSocket with zero queue lag."""
        while self.is_running:
            try:
                # Drain all available mic chunks to avoid queue latency
                chunks = []
                while not self.mic_queue.empty():
                    try:
                        chunks.append(self.mic_queue.get_nowait())
                    except queue.Empty:
                        break
                
                if chunks:
                    data = b"".join(chunks)
                    await session.send_realtime_input(
                        audio=types.Blob(
                            data=data,
                            mime_type=f"audio/pcm;rate={INPUT_SAMPLE_RATE}"
                        )
                    )
                else:
                    await asyncio.sleep(0.005)
            except Exception as e:
                if self.is_running:
                    print(f"\n[Mic Stream Notice] {e}")
                await asyncio.sleep(0.01)

    async def _receive_loop(self, session):
        """
        Continuously receives server responses across ALL turns.
        Persists indefinitely using an outer loop so conversation never dies.
        """
        while self.is_running:
            try:
                async for response in session.receive():
                    if not self.is_running:
                        break

                    server_content = response.server_content
                    if server_content is not None:
                        # Server-side interruption (barge-in)
                        if server_content.interrupted:
                            print("\n⚡ [Barge-in] Stopping agent audio.")
                            self.is_agent_speaking = False
                            while not self.speaker_queue.empty():
                                try:
                                    self.speaker_queue.get_nowait()
                                except queue.Empty:
                                    break
                            continue

                        # Extract audio chunks & spoken text
                        model_turn = server_content.model_turn
                        if model_turn is not None:
                            for part in model_turn.parts:
                                if part.text and not getattr(part, "thought", False):
                                    print(part.text, end="", flush=True)
                                if part.inline_data and part.inline_data.data:
                                    self.speaker_queue.put(part.inline_data.data)

                        if server_content.turn_complete:
                            print()
                            await asyncio.sleep(0.05)

            except asyncio.CancelledError:
                break
            except Exception as e:
                if "1000" in str(e):
                    break
                if self.is_running:
                    print(f"\n[Receive Notice] {e}")
                await asyncio.sleep(0.05)

    async def run(self):
        """Starts the full-duplex live session."""
        prompt_preview = (self.system_prompt[:55] + "...") if len(self.system_prompt) > 55 else self.system_prompt
        print("\n" + "=" * 60)
        print("  ✨ GOOGLE GEMINI 3.1 FLASH LIVE (Native Speech-to-Speech)")
        print(f"  - Model: {self.model} (~500ms TTFA)")
        print(f"  - Voice: {self.voice_name} (Aoede / Puck / Charon / Fenrir / Kore)")
        print(f"  - System Prompt: \"{prompt_preview}\"")
        print(f"  - Echo Cancellation: {'Enabled' if self.echo_cancellation else 'Disabled'}")
        print("  - Multi-Turn: Continuous conversational memory enabled")
        print("=" * 60 + "\n")

        # Open dedicated PyAudio streams
        input_stream = self.pyaudio.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=INPUT_SAMPLE_RATE,
            input=True,
            frames_per_buffer=INPUT_CHUNK_SIZE,
        )

        output_stream = self.pyaudio.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=OUTPUT_SAMPLE_RATE,
            output=True,
            frames_per_buffer=OUTPUT_CHUNK_SIZE,
        )

        self.is_running = True

        # Start dedicated background audio threads
        mic_thread = threading.Thread(target=self._mic_thread_worker, args=(input_stream,), daemon=True)
        speaker_thread = threading.Thread(target=self._speaker_thread_worker, args=(output_stream,), daemon=True)
        mic_thread.start()
        speaker_thread.start()

        # Configure Gemini Live session
        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            thinking_config=types.ThinkingConfig(thinking_budget=0),
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=self.voice_name
                    )
                )
            ),
            system_instruction=types.Content(
                parts=[types.Part.from_text(text=self.system_prompt)]
            )
        )

        print("🎧 Connecting to Gemini Live API... Speak into your mic once connected!\n")

        try:
            async with self.client.aio.live.connect(model=self.model, config=config) as session:
                print("🟢 Connected! Start speaking into your mic... (Press Ctrl+C to exit)\n")

                input_task = asyncio.create_task(self._audio_input_loop(session))
                receive_task = asyncio.create_task(self._receive_loop(session))

                await asyncio.gather(input_task, receive_task)

        except KeyboardInterrupt:
            print("\n👋 Stopping Gemini Live session. Goodbye!")
        finally:
            self.is_running = False
            input_stream.stop_stream()
            input_stream.close()
            output_stream.stop_stream()
            output_stream.close()
            self.pyaudio.terminate()


def main():
    voice = os.getenv("GEMINI_VOICE", "Charon")
    agent = GeminiLiveAgent(voice_name=voice)
    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        print("\n👋 Session ended.")


if __name__ == "__main__":
    main()
