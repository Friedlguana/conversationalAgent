"""
test_gemini_multiturn.py - End-to-end verification of continuous multi-turn conversations
with Gemini Live API.
"""

import asyncio
import os
import time
from dotenv import load_dotenv

load_dotenv()

from google import genai
from google.genai import types

async def run_multiturn_test():
    client = genai.Client(api_key=os.getenv("GEMINI_API_KEY"))
    model = "gemini-3.1-flash-live-preview"
    
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        thinking_config=types.ThinkingConfig(thinking_budget=0),
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name="Aoede"
                )
            )
        )
    )

    print(f"Connecting to {model}...")
    async with client.aio.live.connect(model=model, config=config) as session:
        print("Connected!")
        
        turn_queue = asyncio.Queue()
        is_running = True
        
        async def receive_worker():
            """Continuously receives across turns using while is_running loop."""
            turns_seen = 0
            while is_running:
                try:
                    async for response in session.receive():
                        if not is_running:
                            break
                        sc = response.server_content
                        if sc:
                            if sc.model_turn:
                                for part in sc.model_turn.parts:
                                    if part.inline_data and part.inline_data.data:
                                        turn_queue.put_nowait(("audio", len(part.inline_data.data)))
                                    if part.text and not getattr(part, "thought", False):
                                        print(part.text, end="", flush=True)
                            if sc.turn_complete:
                                turns_seen += 1
                                print(f"\n[Turn {turns_seen} Complete!]")
                                turn_queue.put_nowait(("turn_complete", turns_seen))
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    if "1000" in str(e):
                        break
                    print(f"Receive error: {e}")
                    await asyncio.sleep(0.05)

        recv_task = asyncio.create_task(receive_worker())

        # Test 3 consecutive turns
        test_prompts = [
            "Say the word 'Alpha' and nothing else.",
            "Say the word 'Bravo' and nothing else.",
            "Say the word 'Charlie' and nothing else."
        ]

        for i, prompt in enumerate(test_prompts, 1):
            print(f"\n--- Testing Turn {i}: '{prompt}' ---")
            t0 = time.time()
            await session.send_client_content(
                turns=[types.Content(role="user", parts=[types.Part.from_text(text=prompt)])],
                turn_complete=True
            )
            
            # Wait for turn_complete event
            audio_bytes_total = 0
            while True:
                evt_type, data = await asyncio.wait_for(turn_queue.get(), timeout=15.0)
                if evt_type == "audio":
                    audio_bytes_total += data
                elif evt_type == "turn_complete":
                    elapsed = time.time() - t0
                    print(f"✅ Turn {i} passed in {elapsed:.2f}s! Received {audio_bytes_total} audio bytes.")
                    break
            
            await asyncio.sleep(0.5)

        is_running = False
        recv_task.cancel()
        print("\n🎉 ALL 3 CONSECUTIVE TURNS PASSED PERFECTLY!")

if __name__ == "__main__":
    asyncio.run(run_multiturn_test())
