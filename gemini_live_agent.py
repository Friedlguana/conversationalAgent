"""
gemini_live_agent.py - Compatibility wrapper pointing to agent.py.
"""

from agent import GeminiLiveAgent, asyncio, os

if __name__ == "__main__":
    voice = os.getenv("GEMINI_VOICE", "Charon")
    agent = GeminiLiveAgent(voice_name=voice)
    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        pass
