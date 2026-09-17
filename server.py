"""
server.py - High-Performance Web Server & Real-Time Gemini Live WebSocket Bridge.
Interactive Restaurant Ordering Kiosk for The Sheraton with Real-Time Tool Calling
and Server-Side Arithmetic Bill Calculation (5% Tax).
"""

import os
import sys
import json
import random
import asyncio
from aiohttp import web
from dotenv import load_dotenv

load_dotenv()

from google import genai
from google.genai import types

# Ensure API Key is available
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("\n[Error] GEMINI_API_KEY not found in environment or .env!")
    print("Please set GEMINI_API_KEY in /Users/rijul/projects/conversationalAgent/.env\n")
    sys.exit(1)

genai_client = genai.Client(api_key=GEMINI_API_KEY)
DEFAULT_VOICE = os.getenv("GEMINI_VOICE", "Charon")
LIVE_MODEL = "gemini-3.1-flash-live-preview"

STATIC_DIR = os.path.join(os.path.dirname(__file__), "web")

RESTAURANT_NAME = "The Sheraton"
TAX_RATE = 0.05  # 5% tax

MENU = [
    {
        "category": "Mains",
        "icon": "mains",
        "items": [
            {
                "id": "main-1",
                "name": "Sheraton Signature Burger",
                "price": 650.0,
                "description": "Brioche bun, prime angus beef, aged white cheddar, caramelized onions, house truffle aioli",
                "badge": "Signature",
            },
            {
                "id": "main-2",
                "name": "Grilled Ribeye Steak",
                "price": 1450.0,
                "description": "10oz prime ribeye, garlic herb butter, grilled asparagus",
                "badge": "Chef's Choice",
            },
            {
                "id": "main-3",
                "name": "Tuscan Grilled Chicken",
                "price": 750.0,
                "description": "Marinated chicken breast, sundried tomatoes, creamy basil pesto",
            },
            {
                "id": "main-4",
                "name": "Classic Margherita Pizza",
                "price": 550.0,
                "description": "San Marzano tomato sauce, fresh buffalo mozzarella, fresh basil",
            },
            {
                "id": "main-5",
                "name": "Pan-Seared Salmon",
                "price": 1250.0,
                "description": "Atlantic salmon fillet, lemon-dill butter, roasted seasonal vegetables",
            },
            {
                "id": "main-6",
                "name": "Creamy Truffle Penne",
                "price": 650.0,
                "description": "Al dente penne, wild mushrooms, parmesan cream sauce, black truffle oil",
                "badge": "Vegetarian",
            },
        ],
    },
    {
        "category": "Sides",
        "icon": "sides",
        "items": [
            {
                "id": "side-1",
                "name": "Crispy Seasoned Fries",
                "price": 250.0,
                "description": "Golden russet potatoes, sea salt, fresh rosemary",
                "badge": "Popular",
            },
            {
                "id": "side-2",
                "name": "Truffle Parmesan Fries",
                "price": 350.0,
                "description": "Hand-cut fries, white truffle oil, grated aged parmesan",
            },
            {
                "id": "side-3",
                "name": "Classic Caesar Salad",
                "price": 350.0,
                "description": "Crisp romaine hearts, garlic sourdough croutons, shaved parmesan",
            },
            {
                "id": "side-4",
                "name": "Garlic Butter Breadsticks",
                "price": 220.0,
                "description": "Warm hearth-baked breadsticks, roasted garlic herb butter",
            },
            {
                "id": "side-5",
                "name": "Crispy Onion Rings",
                "price": 250.0,
                "description": "Golden beer-battered jumbo onion rings, chipotle aioli",
            },
        ],
    },
    {
        "category": "Beverages",
        "icon": "beverages",
        "items": [
            {
                "id": "bev-1",
                "name": "Fresh Mint Lemonade",
                "price": 180.0,
                "description": "Freshly squeezed lemon juice, crushed garden mint, pure cane sugar",
                "badge": "Refreshing",
            },
            {
                "id": "bev-2",
                "name": "Iced Caramel Macchiato",
                "price": 250.0,
                "description": "Double espresso, velvety cold milk, vanilla syrup, caramel drizzle",
            },
            {
                "id": "bev-3",
                "name": "Artisan Peach Iced Tea",
                "price": 200.0,
                "description": "Slow-brewed black tea infused with natural peach and citrus",
            },
            {
                "id": "bev-4",
                "name": "San Pellegrino Sparkling",
                "price": 250.0,
                "description": "500ml chilled Italian sparkling mineral water",
            },
            {
                "id": "bev-5",
                "name": "Craft Soda",
                "price": 150.0,
                "description": "Choice of Artisan Cola, Diet Cola, Ginger Ale, or Sprite",
            },
        ],
    },
    {
        "category": "Desserts",
        "icon": "desserts",
        "items": [
            {
                "id": "des-1",
                "name": "Warm Molten Lava Cake",
                "price": 350.0,
                "description": "Decadent dark chocolate cake with warm molten center & vanilla gelato",
                "badge": "Best Seller",
            },
            {
                "id": "des-2",
                "name": "New York Cheesecake",
                "price": 350.0,
                "description": "Velvety smooth classic cheesecake with fresh strawberry compote",
            },
            {
                "id": "des-3",
                "name": "Artisan Tiramisu",
                "price": 380.0,
                "description": "Espresso-dipped ladyfingers, whipped mascarpone cream, Dutch cocoa",
            },
        ],
    },
]

# Tool declarations for Gemini Live order management & arithmetic calculation
ORDER_TOOLS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="add_to_order",
                description="Add an item from the menu to the customer's order ticket. Call this whenever the customer says they want or would like an item.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "item_name": types.Schema(
                            type="STRING",
                            description="Exact or closest matching name of the menu item (e.g. 'Sheraton Signature Burger', 'Crispy Seasoned Fries', 'Fresh Mint Lemonade').",
                        ),
                        "quantity": types.Schema(
                            type="INTEGER",
                            description="Quantity of the item to add. Defaults to 1 if not specified.",
                        ),
                        "notes": types.Schema(
                            type="STRING",
                            description="Optional special instructions, customizations, or preparation requests (e.g. 'make it spicy', 'no onions', 'extra crispy').",
                        ),
                    },
                    required=["item_name"],
                ),
            ),
            types.FunctionDeclaration(
                name="update_item_notes",
                description="Update special instructions, customizations, or preparation notes for an item already on the order ticket (e.g. 'make that burger spicy', 'no onions on the pizza').",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "item_name": types.Schema(
                            type="STRING",
                            description="Name of the menu item to customize or add notes to.",
                        ),
                        "notes": types.Schema(
                            type="STRING",
                            description="The customization or note to attach to the item (e.g. 'spicy', 'extra crispy', 'no onions').",
                        ),
                    },
                    required=["item_name", "notes"],
                ),
            ),
            types.FunctionDeclaration(
                name="remove_from_order",
                description="Remove an item from the customer's current order ticket.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "item_name": types.Schema(
                            type="STRING",
                            description="Name of the menu item to remove.",
                        ),
                        "quantity": types.Schema(
                            type="INTEGER",
                            description="Quantity to remove. If omitted or 0, removes the entire quantity of that item.",
                        ),
                    },
                    required=["item_name"],
                ),
            ),
            types.FunctionDeclaration(
                name="clear_order",
                description="Clear and empty the customer's entire current order ticket when they ask to restart, cancel, or clear everything.",
                parameters=types.Schema(
                    type="OBJECT",
                    properties={},
                ),
            ),
            types.FunctionDeclaration(
                name="calculate_bill",
                description=(
                    "Calculate the accurate itemized bill, subtotal, 5% tax, and final grand total for the customer's order. "
                    "Call this whenever the customer asks for their bill, total, price check, or before confirming checkout. "
                    "Never do mental math yourself."
                ),
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "notes": types.Schema(
                            type="STRING",
                            description="Optional note on customer request, e.g. 'customer asked for total'.",
                        )
                    },
                ),
            ),
            types.FunctionDeclaration(
                name="place_order",
                description=(
                    "Submit and officially place the customer's current order to the kitchen. "
                    "Call this when the customer confirms they want to place their order, checkout, "
                    "says 'place the order', 'confirm order', 'that will be all', or agrees to the final bill."
                ),
                parameters=types.Schema(
                    type="OBJECT",
                    properties={
                        "customer_name": types.Schema(
                            type="STRING",
                            description="Optional customer name or table identifier if provided.",
                        ),
                        "notes": types.Schema(
                            type="STRING",
                            description="Optional order notes or dining preferences.",
                        ),
                    },
                ),
            ),
        ]
    )
]


def find_menu_item(query: str):
    """Matches a query string to the closest menu item in MENU."""
    if not query:
        return None
    q = query.strip().lower()

    # Exact match
    for cat in MENU:
        for item in cat["items"]:
            if item["name"].lower() == q:
                return item

    # Substring / contains match
    for cat in MENU:
        for item in cat["items"]:
            name_lower = item["name"].lower()
            if q in name_lower or name_lower in q:
                return item

    # Word match
    tokens = [t for t in q.split() if len(t) > 2]
    if tokens:
        for cat in MENU:
            for item in cat["items"]:
                name_lower = item["name"].lower()
                if any(tok in name_lower for tok in tokens):
                    return item

    return None


def compute_order_bill(session_order: dict):
    """Computes exact subtotal, 5% tax, grand total, and breakdown from session_order dict."""
    subtotal = sum(item["price"] * item["quantity"] for item in session_order.values())
    subtotal = round(subtotal, 2)
    tax = round(subtotal * TAX_RATE, 2)
    grand_total = round(subtotal + tax, 2)
    breakdown = [
        {
            "item": item["name"],
            "quantity": item["quantity"],
            "unit_price": f"₹{item['price']:.2f}",
            "line_total": f"₹{(item['price'] * item['quantity']):.2f}",
        }
        for item in session_order.values()
    ]
    return subtotal, tax, grand_total, breakdown


def load_system_prompt() -> str:
    """Reads system_prompt.txt or fallback."""
    prompt_file = os.path.join(os.path.dirname(__file__), "system_prompt.txt")
    if os.path.exists(prompt_file):
        try:
            with open(prompt_file, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    return content
        except Exception as e:
            print(f"[Notice] Error reading system_prompt.txt: {e}")

    env_prompt = os.getenv("SYSTEM_PROMPT", "").strip()
    if env_prompt:
        return env_prompt

    return (
        "You are the receptionist and order-taker for The Sheraton. "
        "Keep your responses calm, professional, and concise (1 to 2 sentences max). "
        "Always use add_to_order, remove_from_order, and calculate_bill to manage orders and totals."
    )


async def handle_landing(request):
    """Serves the new multi-demo landing page."""
    return web.FileResponse(os.path.join(STATIC_DIR, "landing.html"))


async def handle_index(request):
    """Serves index.html (Demo 1 Voice Ordering Kiosk)."""
    return web.FileResponse(os.path.join(STATIC_DIR, "index.html"))


async def handle_demo2(request):
    """Serves demo2.html (Medical Transcript)."""
    return web.FileResponse(os.path.join(STATIC_DIR, "demo2.html"))


async def handle_menu(request):
    """Returns restaurant menu data and kiosk settings."""
    return web.json_response({
        "restaurant": RESTAURANT_NAME,
        "tax_rate": TAX_RATE,
        "categories": MENU,
    })


async def handle_config(request):
    """Returns current active config (voice, system prompt, model, menu)."""
    return web.json_response({
        "restaurant": RESTAURANT_NAME,
        "tax_rate": TAX_RATE,
        "model": LIVE_MODEL,
        "default_voice": DEFAULT_VOICE,
        "available_voices": ["Charon", "Aoede", "Puck", "Fenrir", "Kore"],
        "system_prompt": load_system_prompt(),
    })


async def handle_update_prompt(request):
    """Saves updated system prompt to system_prompt.txt."""
    try:
        data = await request.json()
        new_prompt = data.get("system_prompt", "").strip()
        if new_prompt:
            prompt_file = os.path.join(os.path.dirname(__file__), "system_prompt.txt")
            with open(prompt_file, "w", encoding="utf-8") as f:
                f.write(new_prompt)
            return web.json_response({"status": "success", "system_prompt": new_prompt})
        return web.json_response({"status": "error", "message": "Empty prompt"}, status=400)
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)


async def handle_websocket(request):
    """
    WebSocket bridge between browser Web Audio API and Gemini Live API.
    - Receives 16kHz PCM audio bytes from browser mic.
    - Streams 24kHz PCM audio bytes, transcription events, and tool calls to browser.
    - Manages live session order ticket and responds to calculate_bill and order tools with exact arithmetic.
    """
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    print("[WebSocket] Client connected")

    voice_name = request.query.get("voice", DEFAULT_VOICE)
    system_prompt = load_system_prompt()
    session_active = True

    # Per-session order tracking dictionary: item_name -> { name, price, quantity, notes }
    session_order = {}

    # Build Gemini Live session configuration with tools and live transcriptions
    config = types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        thinking_config=types.ThinkingConfig(thinking_budget=0),
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=voice_name
                )
            )
        ),
        tools=ORDER_TOOLS,
        output_audio_transcription=types.AudioTranscriptionConfig(),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        system_instruction=types.Content(
            parts=[types.Part.from_text(text=system_prompt)]
        ),
    )

    try:
        async with genai_client.aio.live.connect(model=LIVE_MODEL, config=config) as session:
            print(f"[Gemini Live] Session established (Model: {LIVE_MODEL}, Voice: {voice_name})")
            await ws.send_json({
                "type": "connected",
                "model": LIVE_MODEL,
                "voice": voice_name,
                "restaurant": RESTAURANT_NAME,
                "tax_rate": TAX_RATE,
            })

            # Background task to receive from Gemini Live and stream to client
            async def gemini_receiver():
                while session_active and not ws.closed:
                    try:
                        async for response in session.receive():
                            if not session_active or ws.closed:
                                break

                            # 1. Handle Tool Calls from Gemini Live
                            if response.tool_call:
                                function_calls = response.tool_call.function_calls
                                calls_data = []
                                fn_responses = []

                                for fc in function_calls:
                                    fname = fc.name
                                    fargs = fc.args or {}
                                    print(f"[Tool Call] {fname} -> {fargs}")
                                    calls_data.append({
                                        "name": fname,
                                        "args": fargs,
                                        "id": fc.id,
                                    })

                                    if fname == "add_to_order":
                                        item_query = fargs.get("item_name", "")
                                        qty_raw = fargs.get("quantity", 1)
                                        notes = fargs.get("notes", "")

                                        matched = find_menu_item(item_query)
                                        canonical_name = matched["name"] if matched else item_query
                                        price = matched["price"] if matched else 450.0

                                        if canonical_name in session_order:
                                            qty = int(qty_raw) if qty_raw is not None else 1
                                            if qty > 0:
                                                session_order[canonical_name]["quantity"] += qty
                                            if notes:
                                                session_order[canonical_name]["notes"] = notes
                                        else:
                                            qty = max(1, int(qty_raw) if qty_raw is not None else 1)
                                            session_order[canonical_name] = {
                                                "name": canonical_name,
                                                "price": price,
                                                "quantity": qty,
                                                "notes": notes,
                                            }

                                        subtotal, tax, grand_total, breakdown = compute_order_bill(session_order)
                                        fn_responses.append(
                                            types.FunctionResponse(
                                                name=fname,
                                                id=fc.id,
                                                response={
                                                    "status": "success",
                                                    "item_added": f"{qty}x {canonical_name}",
                                                    "unit_price": f"₹{price:.2f}",
                                                    "notes": notes,
                                                    "current_order_subtotal": f"₹{subtotal:.2f}",
                                                    "tax_5_percent": f"₹{tax:.2f}",
                                                    "current_grand_total": f"₹{grand_total:.2f}",
                                                    "item_count": sum(i["quantity"] for i in session_order.values()),
                                                    "message": f"Successfully added {qty}x {canonical_name} to the order" + (f" (notes: '{notes}')." if notes else "."),
                                                },
                                            )
                                        )

                                    elif fname == "update_item_notes":
                                        item_query = fargs.get("item_name", "")
                                        notes = fargs.get("notes", "")

                                        target_key = None
                                        for key in session_order.keys():
                                            if (
                                                key.lower() == item_query.lower()
                                                or item_query.lower() in key.lower()
                                                or key.lower() in item_query.lower()
                                            ):
                                                target_key = key
                                                break

                                        if target_key:
                                            session_order[target_key]["notes"] = notes
                                            subtotal, tax, grand_total, breakdown = compute_order_bill(session_order)
                                            fn_responses.append(
                                                types.FunctionResponse(
                                                    name=fname,
                                                    id=fc.id,
                                                    response={
                                                        "status": "success",
                                                        "item": target_key,
                                                        "notes": notes,
                                                        "message": f"Updated notes for {target_key}: '{notes}'.",
                                                    },
                                                )
                                            )
                                        else:
                                            matched = find_menu_item(item_query)
                                            canonical_name = matched["name"] if matched else item_query
                                            price = matched["price"] if matched else 450.0
                                            session_order[canonical_name] = {
                                                "name": canonical_name,
                                                "price": price,
                                                "quantity": 1,
                                                "notes": notes,
                                            }
                                            subtotal, tax, grand_total, breakdown = compute_order_bill(session_order)
                                            fn_responses.append(
                                                types.FunctionResponse(
                                                    name=fname,
                                                    id=fc.id,
                                                    response={
                                                        "status": "success",
                                                        "item": canonical_name,
                                                        "notes": notes,
                                                        "message": f"Added {canonical_name} with note '{notes}'.",
                                                    },
                                                )
                                            )

                                    elif fname == "remove_from_order":
                                        item_query = fargs.get("item_name", "")
                                        qty = int(fargs.get("quantity", 0))

                                        # Find matching key in session_order
                                        target_key = None
                                        for key in session_order.keys():
                                            if (
                                                key.lower() == item_query.lower()
                                                or item_query.lower() in key.lower()
                                                or key.lower() in item_query.lower()
                                            ):
                                                target_key = key
                                                break

                                        removed_msg = ""
                                        if target_key:
                                            if qty <= 0 or qty >= session_order[target_key]["quantity"]:
                                                removed_msg = f"Removed all {session_order[target_key]['name']} from order."
                                                del session_order[target_key]
                                            else:
                                                session_order[target_key]["quantity"] -= qty
                                                removed_msg = f"Reduced {session_order[target_key]['name']} by {qty}."
                                        else:
                                            removed_msg = f"{item_query} was not in the current order."

                                        subtotal, tax, grand_total, breakdown = compute_order_bill(session_order)
                                        fn_responses.append(
                                            types.FunctionResponse(
                                                name=fname,
                                                id=fc.id,
                                                response={
                                                    "status": "success",
                                                    "message": removed_msg,
                                                    "current_order_subtotal": f"₹{subtotal:.2f}",
                                                    "tax_5_percent": f"₹{tax:.2f}",
                                                    "current_grand_total": f"₹{grand_total:.2f}",
                                                    "item_count": sum(i["quantity"] for i in session_order.values()),
                                                },
                                            )
                                        )

                                    elif fname == "clear_order":
                                        session_order.clear()
                                        fn_responses.append(
                                            types.FunctionResponse(
                                                name=fname,
                                                id=fc.id,
                                                response={
                                                    "status": "success",
                                                    "message": "The customer's entire order has been cleared.",
                                                    "current_order_subtotal": "₹0.00",
                                                    "tax_5_percent": "₹0.00",
                                                    "current_grand_total": "₹0.00",
                                                    "item_count": 0,
                                                },
                                            )
                                        )

                                    elif fname == "calculate_bill":
                                        # Accurate arithmetic tool response requested by user
                                        subtotal, tax, grand_total, breakdown = compute_order_bill(session_order)
                                        item_count = sum(i["quantity"] for i in session_order.values())

                                        if item_count == 0:
                                            spoken = "The order is currently empty. There are no items to bill."
                                        else:
                                            spoken = (
                                                f"Your subtotal is ₹{subtotal:.2f}, with 5% GST of ₹{tax:.2f}, "
                                                f"bringing your grand total to ₹{grand_total:.2f}."
                                            )

                                        fn_responses.append(
                                            types.FunctionResponse(
                                                name=fname,
                                                id=fc.id,
                                                response={
                                                    "status": "success",
                                                    "subtotal": f"₹{subtotal:.2f}",
                                                    "tax_rate": "5% GST",
                                                    "tax_amount": f"₹{tax:.2f}",
                                                    "grand_total": f"₹{grand_total:.2f}",
                                                    "item_count": item_count,
                                                    "itemized_breakdown": breakdown,
                                                    "spoken_summary": spoken,
                                                },
                                            )
                                        )

                                    elif fname == "place_order":
                                        subtotal, tax, grand_total, breakdown = compute_order_bill(session_order)
                                        item_count = sum(i["quantity"] for i in session_order.values())

                                        if item_count == 0:
                                            fn_responses.append(
                                                types.FunctionResponse(
                                                    name=fname,
                                                    id=fc.id,
                                                    response={
                                                        "status": "error",
                                                        "message": "The order ticket is currently empty. Ask the customer what they would like to order before placing it.",
                                                    },
                                                )
                                            )
                                        else:
                                            order_id = f"SH-{random.randint(1000, 9999)}"
                                            calls_data[-1]["order_id"] = order_id
                                            fn_responses.append(
                                                types.FunctionResponse(
                                                    name=fname,
                                                    id=fc.id,
                                                    response={
                                                        "status": "success",
                                                        "order_id": order_id,
                                                        "item_count": item_count,
                                                        "subtotal": f"₹{subtotal:.2f}",
                                                        "tax_amount": f"₹{tax:.2f}",
                                                        "grand_total": f"₹{grand_total:.2f}",
                                                        "message": (
                                                            f"Order #{order_id} has been officially placed and submitted to the kitchen! "
                                                            f"Grand total is ₹{grand_total:.2f} with 5% GST included. "
                                                            f"Thank the customer and inform them their meal is being prepared."
                                                        ),
                                                    },
                                                )
                                            )

                                    else:
                                        # Generic tool fallback
                                        fn_responses.append(
                                            types.FunctionResponse(
                                                name=fname,
                                                id=fc.id,
                                                response={"status": "success", "result": "Action completed."},
                                            )
                                        )

                                # Forward tool call event and updated bill calculations to client browser
                                subtotal, tax, grand_total, breakdown = compute_order_bill(session_order)
                                await ws.send_json({
                                    "type": "tool_call",
                                    "calls": calls_data,
                                    "bill": {
                                        "subtotal": subtotal,
                                        "tax": tax,
                                        "grand_total": grand_total,
                                        "item_count": sum(i["quantity"] for i in session_order.values()),
                                        "breakdown": breakdown,
                                    },
                                })

                                # Send tool responses back to Gemini session so speech continues seamlessly
                                try:
                                    await session.send_tool_response(function_responses=fn_responses)
                                except Exception as err:
                                    print(f"[Notice] Error sending tool response to Gemini: {err}")

                            # 2. Handle Server Content (audio, transcripts, barge-in)
                            server_content = response.server_content
                            if server_content is not None:
                                # Interruption event (barge-in)
                                if server_content.interrupted:
                                    await ws.send_json({"type": "interrupted"})
                                    continue

                                # User speech transcription from Gemini Live ASR
                                if server_content.input_transcription and server_content.input_transcription.text:
                                    await ws.send_json({
                                        "type": "user_transcript",
                                        "text": server_content.input_transcription.text,
                                    })

                                # Agent speech transcription from Gemini Live
                                if server_content.output_transcription and server_content.output_transcription.text:
                                    await ws.send_json({
                                        "type": "agent_transcript",
                                        "text": server_content.output_transcription.text,
                                    })

                                model_turn = server_content.model_turn
                                if model_turn is not None:
                                    for part in model_turn.parts:
                                        # Send text if available
                                        if part.text and not getattr(part, "thought", False):
                                            await ws.send_json({
                                                "type": "text",
                                                "text": part.text,
                                            })
                                        # Send 24kHz PCM audio chunk to browser
                                        if part.inline_data and part.inline_data.data:
                                            await ws.send_bytes(part.inline_data.data)

                                if server_content.turn_complete:
                                    await ws.send_json({"type": "turn_complete"})

                    except asyncio.CancelledError:
                        break
                    except Exception as e:
                        if "1000" in str(e):
                            break
                        if session_active and not ws.closed:
                            print(f"[Gemini Receiver Notice] {e}")
                        await asyncio.sleep(0.05)

            recv_task = asyncio.create_task(gemini_receiver())

            # Read incoming messages from client browser
            async for msg in ws:
                if msg.type == web.WSMsgType.BINARY:
                    # Raw 16kHz PCM audio bytes from user's microphone
                    pcm_bytes = msg.data
                    if pcm_bytes and session_active:
                        await session.send_realtime_input(
                            audio=types.Blob(
                                data=pcm_bytes,
                                mime_type="audio/pcm;rate=16000",
                            )
                        )

                elif msg.type == web.WSMsgType.TEXT:
                    try:
                        event = json.loads(msg.data)
                        event_type = event.get("type")

                        if event_type == "change_voice":
                            new_voice = event.get("voice")
                            if new_voice:
                                voice_name = new_voice
                                print(f"[Voice] Changed to: {voice_name}")

                        elif event_type == "text_prompt":
                            # Client sent text input directly (e.g. testing)
                            user_text = event.get("text", "")
                            if user_text:
                                await session.send_client_content(
                                    turns=[types.Content(role="user", parts=[types.Part.from_text(text=user_text)])],
                                    turn_complete=True,
                                )

                        elif event_type == "sync_order":
                            # Client synced order items from manual UI clicks
                            items_sync = event.get("items", [])
                            session_order.clear()
                            for itm in items_sync:
                                name = itm.get("name")
                                if name:
                                    session_order[name] = {
                                        "name": name,
                                        "price": float(itm.get("price", 9.99)),
                                        "quantity": int(itm.get("quantity", 1)),
                                        "notes": itm.get("notes", ""),
                                    }

                    except Exception as err:
                        print(f"[WebSocket] Error handling client event: {err}")

                elif msg.type in (web.WSMsgType.CLOSE, web.WSMsgType.ERROR):
                    break

            session_active = False
            recv_task.cancel()
            try:
                await recv_task
            except (asyncio.CancelledError, Exception):
                pass

    except Exception as e:
        print(f"[Session Error] {e}")
        if not ws.closed:
            await ws.send_json({"type": "error", "message": str(e)})

    finally:
        session_active = False
        print("[WebSocket] Client disconnected")

    return ws
DEMO2_TRANSCRIPT = ""

async def handle_transcribe_ws(request):
    """Demo 2 WebSocket for Live Transcription."""
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    global DEMO2_TRANSCRIPT
    DEMO2_TRANSCRIPT = ""  # Reset on new connection
    
    config = types.LiveConnectConfig(
        response_modalities=["TEXT"],
    )
    
    try:
        async with genai_client.aio.live.connect(model="gemini-3.5-transcribe-live", config=config) as session:
            async def receiver():
                global DEMO2_TRANSCRIPT
                try:
                    async for response in session.receive():
                        if ws.closed:
                            break
                        if response.server_content:
                            sc = response.server_content
                            # Check interim streaming transcription
                            if sc.interim_input_transcription and sc.interim_input_transcription.text:
                                await ws.send_json({
                                    "type": "interim_transcript",
                                    "text": sc.interim_input_transcription.text
                                })
                            # Check finalized committed utterance
                            if sc.input_transcription and sc.input_transcription.text:
                                final_text = sc.input_transcription.text.strip()
                                if final_text:
                                    DEMO2_TRANSCRIPT += final_text + "\n"
                                    await ws.send_json({
                                        "type": "final_transcript",
                                        "text": final_text
                                    })
                except Exception as e:
                    print(f"[Demo 2 Receiver Error] {e}")
            
            recv_task = asyncio.create_task(receiver())
            
            async for msg in ws:
                if msg.type == web.WSMsgType.BINARY:
                    if msg.data:
                        await session.send_realtime_input(
                            audio=types.Blob(
                                data=msg.data,
                                mime_type="audio/pcm;rate=16000"
                            )
                        )
                elif msg.type == web.WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                        if data.get("type") == "add_text":
                            txt = data.get("text", "").strip()
                            if txt:
                                DEMO2_TRANSCRIPT += txt + "\n"
                                await ws.send_json({
                                    "type": "final_transcript",
                                    "text": txt
                                })
                        elif data.get("type") == "clear":
                            DEMO2_TRANSCRIPT = ""
                            await ws.send_json({"type": "cleared"})
                    except Exception as err:
                        print(f"[Demo 2 Client Msg Error] {err}")
                elif msg.type in (web.WSMsgType.CLOSE, web.WSMsgType.ERROR):
                    break
                    
            recv_task.cancel()
    except Exception as e:
        print(f"[Demo 2 WS Error] {e}")
    finally:
        return ws


async def handle_transcribe_audio(request):
    """Audio transcription endpoint using gemini-3.5-transcribe with native diarization."""
    global DEMO2_TRANSCRIPT
    try:
        audio_bytes = None
        mime_type = "audio/wav"

        if request.content_type.startswith("multipart/"):
            reader = await request.multipart()
            while True:
                part = await reader.next()
                if part is None:
                    break
                if part.name in ("audio", "file"):
                    audio_bytes = await part.read()
                    if part.headers.get("Content-Type"):
                        mime_type = part.headers.get("Content-Type")
                    elif part.filename:
                        ext = os.path.splitext(part.filename)[1].lower()
                        if ext == ".mp3":
                            mime_type = "audio/mp3"
                        elif ext == ".webm":
                            mime_type = "audio/webm"
                        elif ext == ".ogg":
                            mime_type = "audio/ogg"
                        elif ext in (".m4a", ".mp4"):
                            mime_type = "audio/mp4"
                        elif ext == ".wav":
                            mime_type = "audio/wav"
                    break
        else:
            audio_bytes = await request.read()
            mime_type = request.content_type or "audio/wav"

        if not audio_bytes:
            return web.json_response({"status": "error", "message": "No audio data received in request."}, status=400)

        # Normalize mime type
        mime_type = mime_type.split(";")[0].strip().lower()
        if mime_type == "audio/x-wav":
            mime_type = "audio/wav"

        print(f"[Transcribe Audio] Processing {len(audio_bytes)} bytes ({mime_type}) with gemini-3.5-transcribe...")

        # 1. Call gemini-3.5-transcribe with speaker diarization & timestamps
        response = await genai_client.aio.models.generate_content(
            model="gemini-3.5-transcribe",
            contents=[types.Part.from_bytes(data=audio_bytes, mime_type=mime_type)],
            config=types.GenerateContentConfig(
                audio_transcription_config=types.AudioTranscriptionConfig(
                    diarization=True,
                    word_timestamp=True,
                )
            )
        )

        utterances = []
        if response.candidates and response.candidates[0].content and response.candidates[0].content.parts:
            for p in response.candidates[0].content.parts:
                at = getattr(p, "audio_transcription", None)
                if at and at.text and at.text.strip():
                    start_t = at.words[0].start_offset if at.words else "0s"
                    end_t = at.words[-1].end_offset if at.words else "0s"
                    utterances.append({
                        "speaker_label": at.speaker_label or "spk:0",
                        "text": at.text.strip(),
                        "start": start_t,
                        "end": end_t,
                    })

        if not utterances:
            raw_text = response.text.strip() if response.text else ""
            if raw_text:
                utterances.append({
                    "speaker_label": "spk:0",
                    "text": raw_text,
                    "start": "0s",
                    "end": "0s",
                    "role": "doctor",
                })
            else:
                return web.json_response({
                    "status": "error",
                    "message": "No speech detected in audio."
                })

        # 2. Map speaker labels to doctor / patient
        distinct_speakers = sorted(list(set(u["speaker_label"] for u in utterances)))
        mapping = {s: "doctor" if i == 0 else "patient" for i, s in enumerate(distinct_speakers)}

        if len(distinct_speakers) > 1:
            try:
                raw_lines = [f"{u['speaker_label']}: {u['text']}" for u in utterances]
                role_prompt = (
                    "In this clinical consultation dialogue, determine which speaker is the doctor and which is the patient:\n"
                    + "\n".join(raw_lines)
                    + "\nReturn a JSON object mapping each speaker label to either 'doctor' or 'patient', e.g.: {\"spk:0\": \"doctor\", \"spk:1\": \"patient\"}"
                )
                role_res = await genai_client.aio.models.generate_content(
                    model="gemini-3.5-flash-lite",
                    contents=role_prompt,
                    config=types.GenerateContentConfig(response_mime_type="application/json")
                )
                if role_res.text:
                    parsed_mapping = json.loads(role_res.text.strip())
                    mapping.update(parsed_mapping)
            except Exception as role_err:
                print(f"[Role Mapping Notice] {role_err}")

        for u in utterances:
            u["role"] = mapping.get(u["speaker_label"], "patient").lower()

        # Build full transcript
        full_dialogue = "\n".join(f"{u['role'].capitalize()}: {u['text']}" for u in utterances)
        DEMO2_TRANSCRIPT = full_dialogue

        # 3. Strict Keyword Extraction using system_prompt_medical.txt
        prompt_file = os.path.join(os.path.dirname(__file__), "system_prompt_medical.txt")
        with open(prompt_file, "r") as f:
            sys_prompt = f.read()

        ext_res = await genai_client.aio.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=f"Transcript:\n{full_dialogue}",
            config=types.GenerateContentConfig(
                system_instruction=sys_prompt,
                response_mime_type="application/json"
            )
        )

        ext_data = {}
        try:
            res_txt = ext_res.text.strip()
            if res_txt.startswith("```json"):
                res_txt = res_txt[7:-3].strip()
            elif res_txt.startswith("```"):
                res_txt = res_txt[3:-3].strip()
            ext_data = json.loads(res_txt)
        except Exception as json_err:
            print(f"[Keywords JSON Parse Error] {json_err}")

        return web.json_response({
            "status": "success",
            "utterances": utterances,
            "transcript": full_dialogue,
            "data": ext_data
        })

    except Exception as e:
        print(f"[Audio Transcription Error] {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)


async def handle_extract(request):
    """Manual extraction endpoint for Demo 2."""
    global DEMO2_TRANSCRIPT
    
    transcript = ""
    try:
        body = await request.json()
        transcript = body.get("transcript", "").strip()
    except Exception:
        pass
        
    if not transcript:
        transcript = DEMO2_TRANSCRIPT.strip()
        
    if not transcript:
        return web.json_response({
            "status": "error",
            "message": "No transcript available. Please record or enter dialogue first."
        })
        
    prompt_file = os.path.join(os.path.dirname(__file__), "system_prompt_medical.txt")
    with open(prompt_file, "r") as f:
        sys_prompt = f.read()
        
    prompt = f"Transcript:\n{transcript}"
    
    try:
        response = await genai_client.aio.models.generate_content(
            model="gemini-3.5-flash-lite",
            contents=prompt,
            config=types.GenerateContentConfig(
                system_instruction=sys_prompt,
                response_mime_type="application/json"
            )
        )
        
        result_text = response.text.strip()
        if result_text.startswith("```json"):
            result_text = result_text[7:-3].strip()
        elif result_text.startswith("```"):
            result_text = result_text[3:-3].strip()
            
        data = json.loads(result_text)
        return web.json_response({"status": "success", "data": data, "transcript": transcript})
    except Exception as e:
        print(f"[Extraction Error] {e}")
        return web.json_response({"status": "error", "message": str(e)})


async def handle_clear_transcript(request):
    """Clears Demo 2 accumulated transcript."""
    global DEMO2_TRANSCRIPT
    DEMO2_TRANSCRIPT = ""
    return web.json_response({"status": "success"})


def create_app():
    """Initializes aiohttp web application."""
    app = web.Application()
    app.router.add_get("/", handle_landing)
    app.router.add_get("/demo1", handle_index)
    app.router.add_get("/demo2", handle_demo2)
    app.router.add_get("/api/menu", handle_menu)
    app.router.add_get("/api/config", handle_config)
    app.router.add_post("/api/update_prompt", handle_update_prompt)
    app.router.add_post("/api/transcribe_audio", handle_transcribe_audio)
    app.router.add_post("/api/extract", handle_extract)
    app.router.add_post("/api/clear_transcript", handle_clear_transcript)
    app.router.add_get("/ws", handle_websocket)
    app.router.add_get("/ws/transcribe", handle_transcribe_ws)

    # Static files (CSS, JS, assets)
    app.router.add_static("/static/", STATIC_DIR)
    return app


def main():
    port = int(os.getenv("PORT", 8080))
    host = os.getenv("HOST", "0.0.0.0")
    app = create_app()

    print("\n" + "=" * 65)
    print(f"  [SERVER] {RESTAURANT_NAME.upper()} — VOICE ORDERING KIOSK")
    print(f"  - Model: {LIVE_MODEL}")
    print(f"  - Voice: {DEFAULT_VOICE}")
    print(f"  - Tax Rate: {TAX_RATE * 100:.1f}%")
    print(f"  - Local URL: http://localhost:{port}")
    print("=" * 65 + "\n")

    web.run_app(app, host=host, port=port)


if __name__ == "__main__":
    main()
