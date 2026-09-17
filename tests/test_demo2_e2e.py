"""
tests/test_demo2_e2e.py - End-to-End Test Suite for Demo 2 (Medical Scribe & Keyword Extraction)
Validates:
1. Static routes & asset availability (landing, demo1, demo2, css, js).
2. Live WebSocket audio transcription with gemini-3.5-transcribe-live.
3. Live WebSocket text input simulation.
4. Structured keyword extraction with gemini-3.5-flash-lite.
5. Transcript reset and clear endpoints.
"""

import os
import json
import asyncio
import aiohttp

BASE_URL = "http://localhost:8080"
WS_URL = "ws://localhost:8080"


async def test_01_http_routes_and_assets():
    """Verify landing, demo1, demo2, and static assets load successfully."""
    async with aiohttp.ClientSession() as session:
        # 1. Landing Page
        async with session.get(f"{BASE_URL}/") as resp:
            assert resp.status == 200
            html = await resp.text()
            assert "AI Experiences" in html or "Multi-Demo" in html
            assert "/demo1" in html
            assert "/demo2" in html

        # 2. Demo 1 (Kiosk)
        async with session.get(f"{BASE_URL}/demo1") as resp:
            assert resp.status == 200
            html = await resp.text()
            assert "The Sheraton" in html
            assert "btn-call" in html

        # 3. Demo 2 (Medical Scribe)
        async with session.get(f"{BASE_URL}/demo2") as resp:
            assert resp.status == 200
            html = await resp.text()
            assert "Medical Scribe" in html
            assert "audio-visualizer" in html
            assert "btn-record" in html
            assert "btn-extract" in html
            assert "btn-print" in html
            assert "symptoms-container" in html
            assert "prescriptions-container" in html

        # 4. Static Assets
        for asset in ["/static/demo2.css", "/static/demo2.js", "/static/style.css"]:
            async with session.get(f"{BASE_URL}{asset}") as resp:
                assert resp.status == 200, f"Failed to load {asset}"


async def test_02_websocket_audio_streaming():
    """Verify streaming 16kHz PCM audio yields interim and final transcriptions."""
    wav_path = "web/sample_dialogue.wav"
    assert os.path.exists(wav_path), "web/sample_dialogue.wav must exist for audio e2e test"

    with open(wav_path, "rb") as f:
        wav_data = f.read()
    pcm_data = wav_data[44:]  # skip WAV header

    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(f"{WS_URL}/ws/transcribe") as ws:
            interim_received = []
            final_received = []

            async def receiver():
                async for msg in ws:
                    if msg.type == aiohttp.WSMsgType.TEXT:
                        data = json.loads(msg.data)
                        mtype = data.get("type")
                        if mtype == "interim_transcript":
                            interim_received.append(data.get("text"))
                        elif mtype == "final_transcript":
                            final_received.append(data.get("text"))
                    elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                        break

            recv_task = asyncio.create_task(receiver())

            # Send audio chunks in 100ms segments
            chunk_size = 3200
            for i in range(0, len(pcm_data), chunk_size):
                await ws.send_bytes(pcm_data[i:i+chunk_size])
                await asyncio.sleep(0.08)

            # Trailing silence to allow VAD to detect turn completion
            silence = b"\x00" * 3200
            for _ in range(25):
                await ws.send_bytes(silence)
                await asyncio.sleep(0.08)

            await asyncio.sleep(2)
            await ws.close()
            await recv_task

            # Verification
            assert len(interim_received) > 0, "Expected at least one interim transcription event"
            assert len(final_received) > 0, "Expected at least one final transcription event"

            final_text = " ".join(final_received).lower()
            print(f"\n[E2E Audio Test] Transcribed: {final_text}")
            assert "headache" in final_text or "nausea" in final_text or "doctor" in final_text


async def test_03_websocket_text_injection():
    """Verify client text messages can be injected into the consultation transcript."""
    async with aiohttp.ClientSession() as session:
        async with session.ws_connect(f"{WS_URL}/ws/transcribe") as ws:
            test_line = "Doctor: I will prescribe Sumatriptan 50mg for migraine relief."
            await ws.send_str(json.dumps({"type": "add_text", "text": test_line}))

            response_received = None
            async for msg in ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    if data.get("type") == "final_transcript":
                        response_received = data.get("text")
                        break

            assert response_received == test_line
            await ws.close()


async def test_04_extract_summary_clinical_keywords():
    """Verify Gemini 3.5 Flash Lite extracts symptoms, diagnosis, prescriptions, and advice."""
    sample_dialogue = """
Doctor: Good morning, what symptoms are you having today?
Patient: Hello Doctor. I have had a severe sore throat, ear pain, and a 102 fever for the last 4 days.
Doctor: Let me examine you. Your tonsils are swollen with white exudate, confirming acute bacterial tonsillitis.
Doctor: I am prescribing Amoxicillin 500mg to take three times daily for 10 days. Also take Ibuprofen 400mg every 6 hours as needed for throat pain and fever.
Doctor: Please drink plenty of fluids, gargle with warm salt water, and get lots of bed rest. Come back if fever persists after 3 days.
"""

    async with aiohttp.ClientSession() as session:
        payload = {"transcript": sample_dialogue}
        async with session.post(f"{BASE_URL}/api/extract", json=payload) as resp:
            assert resp.status == 200
            res = await resp.json()
            assert res.get("status") == "success"

            data = res.get("data", {})
            keywords = data.get("keywords", {})

            symptoms = [s.lower() for s in keywords.get("symptoms", [])]
            duration = keywords.get("duration", "").lower()
            diagnosis = (keywords.get("root_cause") or "").lower()
            prescriptions = keywords.get("prescriptions", [])
            advice = keywords.get("advice", [])

            print("\n[E2E Extraction Test Results]:")
            print("Symptoms:", symptoms)
            print("Duration:", duration)
            print("Diagnosis:", diagnosis)
            print("Prescriptions:", prescriptions)
            print("Advice:", advice)

            # Assertions on extracted content
            assert any("throat" in s for s in symptoms) or any("fever" in s for s in symptoms)
            assert "4" in duration or "day" in duration
            assert "tonsillitis" in diagnosis or "bacterial" in diagnosis or "infection" in diagnosis
            assert len(prescriptions) >= 1
            # Check prescription structure
            p0 = prescriptions[0]
            assert "drug" in p0 and "dose" in p0 and "frequency" in p0
            assert len(advice) >= 1


async def test_05_clear_transcript():
    """Verify clearing the transcript resets state correctly."""
    async with aiohttp.ClientSession() as session:
        # Clear
        async with session.post(f"{BASE_URL}/api/clear_transcript") as resp:
            assert resp.status == 200
            res = await resp.json()
            assert res.get("status") == "success"

        # Try extract with empty state
        async with session.post(f"{BASE_URL}/api/extract", json={}) as resp:
            assert resp.status == 200
            res = await resp.json()
            assert res.get("status") == "error"
            assert "No transcript available" in res.get("message")


if __name__ == "__main__":
    asyncio.run(test_01_http_routes_and_assets())
    print("Test 1 passed!")
    asyncio.run(test_02_websocket_audio_streaming())
    print("Test 2 passed!")
    asyncio.run(test_03_websocket_text_injection())
    print("Test 3 passed!")
    asyncio.run(test_04_extract_summary_clinical_keywords())
    print("Test 4 passed!")
    asyncio.run(test_05_clear_transcript())
    print("Test 5 passed!")
    print("\nALL END-TO-END TESTS PASSED PERFECTLY!")
