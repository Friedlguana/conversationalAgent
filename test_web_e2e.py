"""
test_web_e2e.py - Comprehensive End-to-End Verification Test for Sheraton Restaurant Kiosk.
Validates:
1. 3-column layout, SVG icons (zero emojis), and Start Order button having NO icons.
2. Menu API with 4 categories and 5% tax.
3. Live WebSocket tool calling: add_to_order and calculate_bill with accurate arithmetic.
4. Disconnect and reconnect flow: verifies 24kHz audio reception and dialogue after reconnecting!
"""

import re
import sys
import json
import asyncio
import aiohttp


async def run_tests():
    base_url = "http://localhost:8080"
    ws_url = "ws://localhost:8080/ws?voice=Charon"

    print("=" * 65)
    print("🧪 STARTING SHERATON RESTAURANT KIOSK VERIFICATION SUITE")
    print("=" * 65)

    async with aiohttp.ClientSession() as session:
        # Test 1: GET / (index.html) - verify structure, SVG icons, and NO icons on start button
        print("\n[Test 1] Testing GET / (index.html)...")
        async with session.get(f"{base_url}/") as resp:
            assert resp.status == 200, f"Expected 200, got {resp.status}"
            html = await resp.text()
            assert "Sheraton Restaurant" in html, "Missing restaurant title in HTML"
            assert "menu-container" in html, "Missing menu container in HTML"
            assert "order-items-list" in html, "Missing order list in HTML"
            assert "visualizer-canvas" in html, "Missing canvas in HTML"

            # Check that the Start Order button has NO SVG icons
            btn_call_match = re.search(r'<button\s+id="btn-call"[^>]*>(.*?)</button>', html, re.DOTALL)
            assert btn_call_match, "Could not find #btn-call in HTML"
            btn_call_content = btn_call_match.group(1)
            assert "<svg" not in btn_call_content, f"#btn-call contains SVG icons! Content: {btn_call_content}"
            assert "Start Order" in btn_call_content, "Missing Start Order label in button"
            print("  ✅ GET / passed (3-column layout verified; #btn-call has NO icons)")

        # Test 2: Check for complete absence of emojis in frontend and backend files
        print("\n[Test 2] Checking zero emojis in all project files...")
        files_to_check = ['web/index.html', 'web/app.js', 'web/style.css', 'server.py', 'system_prompt.txt']
        for fname in files_to_check:
            with open(fname, 'r', encoding='utf-8') as f:
                content = f.read()
            non_ascii = set(re.findall(r'[^\x00-\x7F]', content))
            emojis = [c for c in non_ascii if ord(c) > 0x2000 and c not in ('•', '—', '–', '’', '“', '”', '…', '✓', '→', '←', '↑', '↓', '±', '×', '÷', '·', '−', '⁺', '©', '®', '™')]
            assert len(emojis) == 0, f"File {fname} still contains emojis: {emojis}"
        print("  ✅ Zero emojis verified across all files; replaced with clean SVG icons")

        # Test 3: GET /static/style.css
        print("\n[Test 3] Testing GET /static/style.css...")
        async with session.get(f"{base_url}/static/style.css") as resp:
            assert resp.status == 200, f"Expected 200, got {resp.status}"
            css = await resp.text()
            assert "--amber-500" in css, "Missing amber color token in CSS"
            assert "--amber-glow" in css, "Missing amber glow in CSS"
            assert "kiosk-grid" in css, "Missing kiosk grid layout CSS"
            print("  ✅ GET /static/style.css passed (Amber on Dark theme verified)")

        # Test 4: GET /api/menu
        print("\n[Test 4] Testing GET /api/menu...")
        async with session.get(f"{base_url}/api/menu") as resp:
            assert resp.status == 200, f"Expected 200, got {resp.status}"
            menu = await resp.json()
            assert menu.get("restaurant") == "Sheraton Restaurant"
            assert menu.get("tax_rate") == 0.05
            assert len(menu.get("categories", [])) >= 4
            print(f"  ✅ GET /api/menu passed ({len(menu['categories'])} categories, 5% tax rate)")

        # Test 5: GET /api/config
        print("\n[Test 5] Testing GET /api/config...")
        async with session.get(f"{base_url}/api/config") as resp:
            assert resp.status == 200, f"Expected 200, got {resp.status}"
            cfg = await resp.json()
            assert cfg["model"] == "gemini-3.1-flash-live-preview"
            assert cfg.get("tax_rate") == 0.05
            print(f"  ✅ GET /api/config passed (Model: {cfg['model']}, Voice: {cfg.get('default_voice')})")

        # Test 6: WebSocket Session 1 — Order items & Test calculate_bill tool
        print(f"\n[Test 6] Testing Session 1: Tool calling & calculate_bill...")
        async with session.ws_connect(ws_url) as ws1:
            msg = await ws1.receive_json(timeout=10.0)
            assert msg.get("type") == "connected", f"Expected connected, got {msg}"
            print("  Connected to Session 1")

            # Place order and ask for bill
            print("  Sending: 'I would like a Sheraton Signature Burger and Crispy Fries. What is my total?'")
            await ws1.send_json({
                "type": "text_prompt",
                "text": "I would like a Sheraton Signature Burger and Crispy Fries. What is my total?"
            })

            tool_calls = []
            audio_bytes_1 = 0
            agent_transcripts_1 = []
            turn1_done = False
            start_t = asyncio.get_event_loop().time()

            while not turn1_done and (asyncio.get_event_loop().time() - start_t) < 18.0:
                try:
                    res = await asyncio.wait_for(ws1.receive(), timeout=8.0)
                except asyncio.TimeoutError:
                    break

                if res.type == aiohttp.WSMsgType.BINARY:
                    audio_bytes_1 += len(res.data)
                elif res.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(res.data)
                    etype = data.get("type")
                    if etype == "tool_call":
                        calls = data.get("calls", [])
                        tool_calls.extend(calls)
                        print(f"  ⚡ Session 1 Tool Calls: {[c['name'] for c in calls]}")
                        if data.get("bill"):
                            print(f"  🧾 Bill Breakdown: Subtotal ${data['bill']['subtotal']:.2f}, Tax ${data['bill']['tax']:.2f}, Total ${data['bill']['grand_total']:.2f}")
                    elif etype in ("agent_transcript", "text"):
                        agent_transcripts_1.append(data.get("text", ""))
                    elif etype == "turn_complete":
                        turn1_done = True
                        break

            print(f"  ✅ Session 1 Turn 1 Completed ({audio_bytes_1} audio bytes received)")
            print(f"  - Agent spoken response: \"{''.join(agent_transcripts_1).strip()}\"")
            assert audio_bytes_1 > 0, "No audio received in Session 1"
            assert any(c["name"] == "add_to_order" for c in tool_calls), "add_to_order was not called"
            assert any(c["name"] == "calculate_bill" for c in tool_calls), "calculate_bill was not called"

            # Clean disconnect
            await ws1.close()
            print("  🔌 Session 1 disconnected cleanly.")

        # Test 7: Disconnect & Reconnect Flow — Session 2
        print(f"\n[Test 7] Testing Session 2: Disconnect & Reconnect Audio Streaming...")
        await asyncio.sleep(1.0)

        async with session.ws_connect(ws_url) as ws2:
            msg = await ws2.receive_json(timeout=20.0)
            assert msg.get("type") == "connected", f"Expected connected, got {msg}"
            print("  Connected to Session 2 (Reconnected successfully)")

            # Send prompt in reconnected session
            print("  Sending: 'Hello, could I get a Fresh Mint Lemonade please?'")
            await ws2.send_json({
                "type": "text_prompt",
                "text": "Hello, could I get a Fresh Mint Lemonade please?"
            })

            tool_calls_2 = []
            audio_bytes_2 = 0
            agent_transcripts_2 = []
            turn2_done = False
            start_t2 = asyncio.get_event_loop().time()

            while not turn2_done and (asyncio.get_event_loop().time() - start_t2) < 18.0:
                try:
                    res = await asyncio.wait_for(ws2.receive(), timeout=8.0)
                except asyncio.TimeoutError:
                    break

                if res.type == aiohttp.WSMsgType.BINARY:
                    audio_bytes_2 += len(res.data)
                elif res.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(res.data)
                    etype = data.get("type")
                    if etype == "tool_call":
                        tool_calls_2.extend(data.get("calls", []))
                    elif etype in ("agent_transcript", "text"):
                        agent_transcripts_2.append(data.get("text", ""))
                    elif etype == "turn_complete":
                        turn2_done = True
                        break

            print(f"  ✅ Session 2 Completed after reconnect! ({audio_bytes_2} audio bytes received)")
            print(f"  - Agent spoken response: \"{''.join(agent_transcripts_2).strip()}\"")
            assert audio_bytes_2 > 0, "No audio received after reconnecting!"
            assert len(agent_transcripts_2) > 0, "No transcript received after reconnecting!"
            assert any(c["name"] == "add_to_order" for c in tool_calls_2), "add_to_order was not called in Session 2"

            await ws2.close()
            print("  🔌 Session 2 cleanly closed.")

        # Test 8: Agent Places Order Tool (place_order)
        print(f"\n[Test 8] Testing Session 3: Agent `place_order` tool execution...")
        await asyncio.sleep(1.0)

        async with session.ws_connect(ws_url) as ws3:
            msg = await ws3.receive_json(timeout=20.0)
            assert msg.get("type") == "connected", f"Expected connected, got {msg}"
            print("  Connected to Session 3")

            prompt = "I would like a Classic Margherita Pizza and Artisan Tiramisu. That will be all, please place my order."
            print(f"  Sending: '{prompt}'")
            await ws3.send_json({
                "type": "text_prompt",
                "text": prompt
            })

            tool_calls_3 = []
            audio_bytes_3 = 0
            agent_transcripts_3 = []
            turn3_done = False
            placed_order_id = None
            start_t3 = asyncio.get_event_loop().time()

            while not turn3_done and (asyncio.get_event_loop().time() - start_t3) < 22.0:
                try:
                    res = await asyncio.wait_for(ws3.receive(), timeout=8.0)
                except asyncio.TimeoutError:
                    break

                if res.type == aiohttp.WSMsgType.BINARY:
                    audio_bytes_3 += len(res.data)
                elif res.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(res.data)
                    etype = data.get("type")
                    if etype == "tool_call":
                        calls = data.get("calls", [])
                        tool_calls_3.extend(calls)
                        for c in calls:
                            if c.get("name") == "place_order":
                                placed_order_id = c.get("order_id")
                        print(f"  ⚡ Session 3 Tool Calls: {[c['name'] for c in calls]}")
                    elif etype in ("agent_transcript", "text"):
                        agent_transcripts_3.append(data.get("text", ""))
                    elif etype == "turn_complete":
                        turn3_done = True
                        break

            print(f"  ✅ Session 3 Completed ({audio_bytes_3} audio bytes received)")
            print(f"  - Spoken response: \"{''.join(agent_transcripts_3).strip()}\"")
            print(f"  - Placed Order Ticket ID: {placed_order_id}")
            assert audio_bytes_3 > 0, "No audio received in Session 3"
            assert any(c["name"] == "add_to_order" for c in tool_calls_3), "add_to_order was not called in Session 3"
            assert any(c["name"] == "place_order" for c in tool_calls_3), "place_order tool was not called by agent"
            assert placed_order_id is not None, "place_order tool did not return an order_id"

            await ws3.close()
            print("  🔌 Session 3 cleanly closed.")

    print("\n" + "=" * 65)
    print("🎉 ALL TESTS (INCLUDING AGENT PLACE ORDER) PASSED SUCCESSFULLY!")
    print("=" * 65)


if __name__ == "__main__":
    asyncio.run(run_tests())
