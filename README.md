# Real-Time Conversational Agent (Google Gemini Live API)

A pure, real-time native speech-to-speech conversational AI agent powered by **Google Gemini 3.1 Flash Live**.

## Features

- **True Native Speech-to-Speech**: No cascading through separate STT and TTS models. The multimodal model processes microphone audio directly and responds with 24kHz studio-quality voice.
- **Sub-Second Latency (~500ms TTFA)**: Powered by `gemini-3.1-flash-live-preview`.
- **Continuous Multi-Turn Memory**: Seamless conversation across unlimited turns without drops.
- **Customizable System Prompt**: Easily define agent persona, tone, rules, and scenarios via `system_prompt.txt` or `.env`.
- **Echo Cancellation & Echo Suppression**: Automatically avoids speaker feedback loops when using laptop speakers.
- **Instant Barge-In**: Server-side interruption detection.
- **100% Free Tier**: Runs via Google AI Studio API key.

---

## Quick Start

### 1. Configure `.env`
Ensure your [Google AI Studio API key](https://aistudio.google.com/apikey) is set in `.env`:
```env
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_VOICE=Charon
ECHO_CANCELLATION=true
```

### 2. Available Voices (`GEMINI_VOICE`):
- `Charon` (Default): Deep, calm, confident male voice.
- `Aoede`: Warm, engaging, lively female voice.
- `Puck`: Playful, energetic, upbeat tone.
- `Fenrir`: Bold, authoritative, rich male voice.
- `Kore`: Gentle, soothing, serene female voice.

### 3. Customizing the System Prompt
You can edit the agent's persona, role, or speaking style directly in **`system_prompt.txt`**:
```text
You are a witty, knowledgeable tech co-founder.
Speak naturally with genuine energy and humor, like talking over coffee.
Keep responses concise (1 to 2 sentences max) for spoken conversation.
```
*(The agent automatically reads from `system_prompt.txt` on startup. You can also set `SYSTEM_PROMPT="..."` in `.env`).*

### 4. Run the Agent
```bash
source .venv/bin/activate
python agent.py
```
*(Speak naturally into your microphone. Press `Ctrl+C` to exit).*

---

## Testing & Diagnostics

To run the automated multi-turn latency and verification test:
```bash
python test_gemini_multiturn.py
```
