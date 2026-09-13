# Real-Time Conversational Agent (Google Gemini Live API)

A pure, real-time native speech-to-speech conversational AI agent powered by **Google Gemini 3.1 Flash Live**.

## Features

- **True Native Speech-to-Speech**: No separate STT and TTS cascading. The multimodal model processes microphone audio directly and responds with 24kHz studio-quality voice.
- **Sub-Second Latency (~500ms TTFA)**: Powered by `gemini-3.1-flash-live-preview`.
- **Continuous Multi-Turn Memory**: Seamless conversation across unlimited turns without drops.
- **Customizable System Prompt**: Easily define agent persona, tone, rules, and scenarios via `system_prompt.txt` or `.env`.
- **Echo Cancellation & Echo Suppression**: Automatically avoids speaker feedback loops when using laptop speakers.
- **Instant Barge-In**: Server-side interruption detection.
- **100% Free Tier**: Runs via Google AI Studio API key.
- **Cross-Platform**: Works natively on **macOS**, **Linux**, and **Windows**.

---

## 🚀 Setup & Installation by OS

### Prerequisites
- **Python 3.10, 3.11, or 3.12** installed
- **Microphone & Speakers** connected
- A free **Google Gemini API Key** from [Google AI Studio](https://aistudio.google.com/apikey)

---

### 🍎 macOS Setup

1. **Install PortAudio (System Audio Library)**:
   ```bash
   brew install portaudio
   ```
   *(If you don't use Homebrew, prebuilt wheels often install automatically via pip).*

2. **Create and Activate Virtual Environment**:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install Dependencies**:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. **Permissions Note**:
   Ensure your terminal (Terminal, iTerm, or VS Code) has microphone access in:
   *System Settings → Privacy & Security → Microphone*.

---

### 🐧 Linux Setup (Ubuntu / Debian / Fedora / Arch)

1. **Install System Audio Libraries (PortAudio & Python headers)**:
   - **Ubuntu / Debian**:
     ```bash
     sudo apt update
     sudo apt install -y portaudio19-dev python3-pyaudio python3-dev python3-venv build-essential
     ```
   - **Fedora / RHEL**:
     ```bash
     sudo dnf install -y portaudio-devel python3-devel gcc
     ```
   - **Arch Linux**:
     ```bash
     sudo pacman -S portaudio python
     ```

2. **Create and Activate Virtual Environment**:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. **Install Dependencies**:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. **Audio Group & Permissions**:
   Ensure your user has access to audio devices:
   ```bash
   sudo usermod -aG audio $USER
   ```
   *(Log out and log back in for group changes to take effect).*

---

### 🪟 Windows Setup

1. **Open Command Prompt (CMD) or PowerShell** as a regular user.

2. **Create and Activate Virtual Environment**:
   - **In Command Prompt (cmd)**:
     ```cmd
     python -m venv .venv
     .venv\Scripts\activate
     ```
   - **In PowerShell**:
     ```powershell
     python -m venv .venv
     # If script execution is restricted on your machine, allow it for this session:
     Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
     .\.venv\Scripts\Activate.ps1
     ```

3. **Install Dependencies**:
   ```cmd
   python -m pip install --upgrade pip
   pip install -r requirements.txt
   ```
   *(Note: If `pip install pyaudio` fails on Windows due to missing C++ compilers, run `pip install pipwin` followed by `pipwin install pyaudio`).*

4. **Permissions Note**:
   Ensure microphone permissions are enabled:
   *Windows Settings → Privacy & Security → Microphone → Enable "Let desktop apps access your microphone"*.

---

## ⚙️ Configuration

1. **Create your `.env` file**:
   - **macOS / Linux**:
     ```bash
     cp .env.example .env
     ```
   - **Windows (CMD)**:
     ```cmd
     copy .env.example .env
     ```
   - **Windows (PowerShell)**:
     ```powershell
     Copy-Item .env.example .env
     ```

2. **Edit `.env`** with your API key:
   ```env
   GEMINI_API_KEY=your_actual_gemini_api_key_here
   GEMINI_VOICE=Charon
   ECHO_CANCELLATION=true
   ```

### Available Voices (`GEMINI_VOICE`):
- `Charon` (Default): Deep, calm, confident male voice.
- `Aoede`: Warm, engaging, lively female voice.
- `Puck`: Playful, energetic, upbeat tone.
- `Fenrir`: Bold, authoritative, rich male voice.
- `Kore`: Gentle, soothing, serene female voice.

### Echo Cancellation Tip:
- **Using Laptop / Desktop Speakers**: Keep `ECHO_CANCELLATION=true` to prevent the speaker sound from echoing back into the microphone.
- **Wearing Headphones or Earphones**: You can set `ECHO_CANCELLATION=false` for full-duplex live barge-in.

---

## 🎭 Customizing the System Prompt

You can edit the agent's persona, knowledge, rules, or tone directly in **`system_prompt.txt`**:

```text
You are a witty, knowledgeable tech co-founder.
Speak naturally with genuine energy and humor, like talking over coffee.
Keep responses concise (1 to 2 sentences max) for spoken conversation.
```

*(The agent reads from `system_prompt.txt` on every startup. You can also specify `SYSTEM_PROMPT="..."` in your `.env` file).*

---

## 🎙️ Running the Agent

### 🌐 Mode 1: Modern Web UI (Default)
Run the web application server:

```bash
python agent.py
# or: python server.py
```

Then open your browser at **`http://localhost:8080`**.

#### Web UI Highlights:
- **Interactive 3D Visualizer**: Reactive canvas orb and waveform responding dynamically to both microphone speech and agent voice.
- **Voice Selector Dropdown**: Switch effortlessly between *Charon*, *Aoede*, *Puck*, *Fenrir*, and *Kore*.
- **Live System Prompt Modal**: Edit agent persona and rules on the fly and save directly to `system_prompt.txt`.
- **Slide-Over Transcript Drawer**: Review complete turn-by-turn conversation logs with timestamps.
- **Hardware Echo Cancellation**: Built-in browser audio processing for clean, feedback-free acoustics.
- **Gapless 24kHz Audio Playback**: Sub-second speech response scheduling via Web Audio API.

---

### 💻 Mode 2: Terminal CLI (Backup Mode)
If you prefer running directly in your terminal with PyAudio:

```bash
python agent.py --cli
# or: python cli_agent.py
```

Speak into your microphone naturally. Press **`Ctrl + C`** anytime to exit.

---

## 🧪 Testing & Verification

### 1. End-to-End Web UI & WebSocket Verification
Runs a full automated suite verifying HTTP routes, static assets, configuration, prompt persistence, binary PCM audio streaming, and multi-turn live conversation:

```bash
python test_web_e2e.py
```

### 2. Multi-Turn Latency Benchmark
Tests consecutive conversational turns and verifies sub-second Time-To-First-Audio (~500ms TTFA):

```bash
python test_gemini_multiturn.py
```
