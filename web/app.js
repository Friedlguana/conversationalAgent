/**
 * app.js - The Sheraton AI Voice Ordering Kiosk
 * Real-time full duplex Web Audio API streaming with Google Gemini 3.1 Flash Live.
 * Features native tool calling for order tracking and arithmetic calculation (5% tax),
 * live audio visualizer (amber theme), SVG icons, and bulletproof audio reconnection.
 */

// ============================================================================
// SVG Icon Catalog (Replacing all emojis)
// ============================================================================
const CATEGORY_ICONS = {
  mains: `<svg class="cat-svg-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4V2"/><path d="M4 18h16"/><path d="M4 18a8 8 0 0 1 16 0"/><path d="M2 20h20"/></svg>`,
  sides: `<svg class="cat-svg-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h20"/><path d="M20 12c0 5-4 9-9 9s-9-4-9-9"/><path d="M8 8a4 4 0 0 1 8 0"/><path d="M12 4v4"/></svg>`,
  beverages: `<svg class="cat-svg-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" y1="2" x2="6" y2="4"/><line x1="10" y1="2" x2="10" y2="4"/><line x1="14" y1="2" x2="14" y2="4"/></svg>`,
  desserts: `<svg class="cat-svg-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8"/><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1"/><path d="M2 21h20"/><path d="M7 8v3"/><path d="M12 8v3"/><path d="M17 8v3"/></svg>`
};

// ============================================================================
// DOM Elements
// ============================================================================
const voiceSelect = document.getElementById('voice-select');
const btnPromptModal = document.getElementById('btn-prompt-modal');
const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');

const visualizerCanvas = document.getElementById('visualizer-canvas');
const orbCore = document.querySelector('.orb-core');
const captionBox = document.getElementById('caption-box');
const captionTag = document.getElementById('caption-tag');
const liveCaption = document.getElementById('live-caption');

// Start Order button has NO icons
const btnCall = document.getElementById('btn-call');
const labelCall = document.getElementById('label-call');

const btnMute = document.getElementById('btn-mute');
const iconMicOn = document.getElementById('icon-mic-on');
const iconMicOff = document.getElementById('icon-mic-off');
const labelMute = document.getElementById('label-mute');

// Menu elements
const menuContainer = document.getElementById('menu-container');
const categoryTabs = document.getElementById('category-tabs');

// Order elements
const orderItemsList = document.getElementById('order-items-list');
const orderEmptyState = document.getElementById('order-empty-state');
const orderBadge = document.getElementById('order-badge');
const btnClearOrder = document.getElementById('btn-clear-order');
const orderSubtotalEl = document.getElementById('order-subtotal');
const orderTaxEl = document.getElementById('order-tax');
const orderTotalEl = document.getElementById('order-total');
const btnPlaceOrder = document.getElementById('btn-place-order');

// Modals
const promptModal = document.getElementById('prompt-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const btnSavePrompt = document.getElementById('btn-save-prompt');
const promptTextarea = document.getElementById('prompt-textarea');

const successModal = document.getElementById('success-modal');
const successTicketId = document.getElementById('success-ticket-id');
const successReceiptSummary = document.getElementById('success-receipt-summary');
const btnNewOrder = document.getElementById('btn-new-order');
const toast = document.getElementById('toast');

// ============================================================================
// Application State
// ============================================================================
let isConnected = false;
let isConnecting = false;
let isMuted = false;
let isAgentSpeaking = false;

let menuData = [];
let allMenuItems = [];
let taxRate = 0.05; // 5% tax

// Order items: array of { id, name, price, quantity, notes }
let orderItems = [];

let ws = null;
let audioContextIn = null;
let audioContextOut = null;
let micStream = null;
let scriptProcessor = null;
let analyserIn = null;
let analyserOut = null;

// Audio scheduling jitter buffer & pre-roll audio buffer
let scheduledPlaybackTime = 0;
let activeAudioNodes = [];
let preRollBuffer = [];
let currentAgentTurnText = "";

// Visualizer Particles (Amber theme)
const ctx = visualizerCanvas.getContext('2d');
let animFrameId = null;
let particles = [];
const PARTICLE_COUNT = 50;

for (let i = 0; i < PARTICLE_COUNT; i++) {
  particles.push({
    angle: Math.random() * Math.PI * 2,
    radius: 75 + Math.random() * 65,
    baseRadius: 75 + Math.random() * 65,
    speed: (Math.random() * 0.007 + 0.003) * (Math.random() > 0.5 ? 1 : -1),
    size: Math.random() * 2.5 + 1.0,
    alpha: Math.random() * 0.6 + 0.25,
  });
}

// ============================================================================
// UI & Toast Helpers
// ============================================================================

function showToast(message, duration = 3000) {
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, duration);
}

function setStatus(stateClass, message) {
  statusPill.className = `status-pill ${stateClass}`;
  statusText.textContent = message;
}

function updateCaption(speaker, text, isSpeaking = false) {
  if (speaker === 'user') {
    captionTag.textContent = 'Customer';
    captionTag.style.color = '#38bdf8';
  } else if (speaker === 'assistant') {
    captionTag.textContent = 'Receptionist';
    captionTag.style.color = '#fbbf24';
  } else {
    captionTag.textContent = speaker;
  }

  liveCaption.textContent = text;
  if (isSpeaking) {
    captionBox.classList.add('speaking');
  } else {
    captionBox.classList.remove('speaking');
  }
}

// ============================================================================
// Menu Fetching & Rendering (Using Clean SVG Icons)
// ============================================================================

async function fetchMenu() {
  try {
    const res = await fetch('/api/menu');
    if (res.ok) {
      const data = await res.json();
      menuData = data.categories || [];
      taxRate = data.tax_rate !== undefined ? data.tax_rate : 0.05;

      // Flatten items for easy searching
      allMenuItems = [];
      menuData.forEach(cat => {
        cat.items.forEach(item => {
          allMenuItems.push({
            ...item,
            category: cat.category,
          });
        });
      });

      renderMenu('all');
    } else {
      menuContainer.innerHTML = '<div class="menu-loading"><p>Failed to load menu.</p></div>';
    }
  } catch (e) {
    console.error('Error fetching menu:', e);
    menuContainer.innerHTML = '<div class="menu-loading"><p>Error connecting to menu server.</p></div>';
  }
}

function renderMenu(categoryFilter = 'all') {
  if (!menuData || menuData.length === 0) {
    menuContainer.innerHTML = '<div class="menu-loading"><p>No menu items available.</p></div>';
    return;
  }

  let html = '';

  menuData.forEach(cat => {
    if (categoryFilter !== 'all' && cat.category.toLowerCase() !== categoryFilter.toLowerCase()) {
      return;
    }

    const catKey = (cat.icon || cat.category || 'mains').toLowerCase();
    const iconSvg = CATEGORY_ICONS[catKey] || CATEGORY_ICONS.mains;

    html += `
      <div class="category-section">
        <h3 class="category-heading">
          ${iconSvg}
          <span>${escapeHtml(cat.category)}</span>
        </h3>
        <div class="category-items">
    `;

    cat.items.forEach(item => {
      const badgeHtml = item.badge ? `<span class="menu-badge">${escapeHtml(item.badge)}</span>` : '';
      html += `
        <div class="menu-card" data-item-id="${item.id}" onclick="handleMenuCardClick('${item.id}')">
          <div class="menu-item-info">
            <div class="menu-item-title-row">
              <span class="menu-item-name">${escapeHtml(item.name)}</span>
              ${badgeHtml}
            </div>
            <p class="menu-item-desc">${escapeHtml(item.description || '')}</p>
          </div>
          <div class="menu-item-action">
            <span class="menu-item-price">₹${item.price.toFixed(2)}</span>
            <button class="btn-add-item" onclick="event.stopPropagation(); addItemToOrder('${item.id}', 1)" title="Add to Order">+</button>
          </div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  menuContainer.innerHTML = html;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
}

categoryTabs.addEventListener('click', (e) => {
  if (e.target.classList.contains('tab-btn')) {
    categoryTabs.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    e.target.classList.add('active');
    const category = e.target.dataset.category;
    renderMenu(category);
  }
});

function handleMenuCardClick(itemId) {
  addItemToOrder(itemId, 1);
}

// ============================================================================
// Order State & Cart Management
// ============================================================================

function findMenuItemByName(name) {
  if (!name) return null;
  const clean = name.trim().toLowerCase();

  // 1. Exact match
  let found = allMenuItems.find(i => i.name.toLowerCase() === clean);
  if (found) return found;

  // 2. Contains match
  found = allMenuItems.find(i => i.name.toLowerCase().includes(clean) || clean.includes(i.name.toLowerCase()));
  if (found) return found;

  // 3. Keyword token match
  const tokens = clean.split(/\s+/).filter(t => t.length > 2);
  if (tokens.length > 0) {
    found = allMenuItems.find(i => {
      const itemLower = i.name.toLowerCase();
      return tokens.some(tok => itemLower.includes(tok));
    });
  }

  return found;
}

function syncOrderWithServer() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({
        type: 'sync_order',
        items: orderItems,
      }));
    } catch (e) {
      console.warn('Could not sync order with server:', e);
    }
  }
}

function addItemToOrder(itemIdentifier, quantity = 1, notes = "") {
  let menuItem = null;

  if (
    typeof itemIdentifier === 'string' &&
    (itemIdentifier.startsWith('main-') ||
     itemIdentifier.startsWith('side-') ||
     itemIdentifier.startsWith('bev-') ||
     itemIdentifier.startsWith('des-'))
  ) {
    menuItem = allMenuItems.find(i => i.id === itemIdentifier);
  } else {
    menuItem = findMenuItemByName(itemIdentifier);
  }

  if (!menuItem) {
    menuItem = {
      id: 'item-' + Date.now(),
      name: itemIdentifier,
      price: 450.0,
      description: 'Special Order',
    };
  }

  const existing = orderItems.find(i => i.id === menuItem.id);
  if (existing) {
    const qtyToAdd = parseInt(quantity);
    if (!isNaN(qtyToAdd) && qtyToAdd > 0) {
      existing.quantity += qtyToAdd;
    }
    if (notes) existing.notes = notes;
  } else {
    orderItems.push({
      id: menuItem.id,
      name: menuItem.name,
      price: menuItem.price,
      quantity: Math.max(1, parseInt(quantity) || 1),
      notes: notes || "",
    });
  }

  renderOrder(menuItem.id);
  syncOrderWithServer();
  showToast(`Added ${quantity > 1 ? quantity + 'x ' : ''}${menuItem.name}${notes ? ` ("${notes}")` : ''} to order`);
}

function updateItemNotes(itemIdentifier, notes = "") {
  let itemIndex = -1;
  const targetName = (typeof itemIdentifier === 'string' ? itemIdentifier : '').trim().toLowerCase();

  itemIndex = orderItems.findIndex(i => {
    if (i.id === itemIdentifier) return true;
    const nameLower = i.name.toLowerCase();
    return nameLower === targetName || nameLower.includes(targetName) || targetName.includes(nameLower);
  });

  if (itemIndex !== -1) {
    orderItems[itemIndex].notes = notes;
    renderOrder(orderItems[itemIndex].id);
    syncOrderWithServer();
    showToast(`Note updated for ${orderItems[itemIndex].name}: "${notes}"`);
  } else {
    addItemToOrder(itemIdentifier, 1, notes);
  }
}

function removeItemFromOrder(itemIdentifier, quantity = 0) {
  let itemIndex = -1;
  const targetName = (typeof itemIdentifier === 'string' ? itemIdentifier : '').trim().toLowerCase();

  itemIndex = orderItems.findIndex(i => {
    if (i.id === itemIdentifier) return true;
    const nameLower = i.name.toLowerCase();
    return nameLower === targetName || nameLower.includes(targetName) || targetName.includes(nameLower);
  });

  if (itemIndex === -1) {
    console.warn(`Item "${itemIdentifier}" not in current order.`);
    return;
  }

  const item = orderItems[itemIndex];
  const removeQty = parseInt(quantity) || 0;

  if (removeQty <= 0 || removeQty >= item.quantity) {
    orderItems.splice(itemIndex, 1);
    showToast(`Removed ${item.name} from order`);
  } else {
    item.quantity -= removeQty;
    showToast(`Updated ${item.name} quantity to ${item.quantity}`);
  }

  renderOrder();
  syncOrderWithServer();
}

function clearOrder() {
  orderItems = [];
  renderOrder();
  syncOrderWithServer();
  showToast('Order cleared');
}

function renderOrder(highlightItemId = null) {
  const totalItemCount = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  orderBadge.textContent = `${totalItemCount} item${totalItemCount === 1 ? '' : 's'}`;

  if (orderItems.length === 0) {
    orderEmptyState.style.display = 'flex';
    btnClearOrder.style.display = 'none';
    btnPlaceOrder.disabled = true;

    const existingCards = orderItemsList.querySelectorAll('.order-ticket-item');
    existingCards.forEach(c => c.remove());

    orderSubtotalEl.textContent = '₹0.00';
    orderTaxEl.textContent = '₹0.00';
    orderTotalEl.textContent = '₹0.00';
    return;
  }

  orderEmptyState.style.display = 'none';
  btnClearOrder.style.display = 'block';
  btnPlaceOrder.disabled = false;

  const existingCards = orderItemsList.querySelectorAll('.order-ticket-item');
  existingCards.forEach(c => c.remove());

  let subtotal = 0;

  orderItems.forEach(item => {
    const itemSubtotal = item.price * item.quantity;
    subtotal += itemSubtotal;

    const itemCard = document.createElement('div');
    itemCard.className = `order-ticket-item ${item.id === highlightItemId ? 'highlight-new' : ''}`;
    itemCard.dataset.itemId = item.id;

    itemCard.innerHTML = `
      <div class="ticket-item-details">
        <span class="ticket-item-name">${escapeHtml(item.name)}</span>
        <span class="ticket-item-price-unit">₹${item.price.toFixed(2)} each</span>
        ${item.notes ? `<span class="ticket-item-notes">"${escapeHtml(item.notes)}"</span>` : ''}
      </div>

      <div class="ticket-item-qty-controls">
        <button class="qty-btn" onclick="updateItemQuantity('${item.id}', -1)" title="Decrease">&minus;</button>
        <span class="qty-number">${item.quantity}</span>
        <button class="qty-btn" onclick="updateItemQuantity('${item.id}', 1)" title="Increase">&plus;</button>
      </div>

      <span class="ticket-item-subtotal">₹${itemSubtotal.toFixed(2)}</span>

      <button class="ticket-item-remove" onclick="removeItemFromOrder('${item.id}', 0)" title="Remove item">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    orderItemsList.appendChild(itemCard);
  });

  // Calculate Math with exact 5% tax (GST)
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  orderSubtotalEl.textContent = `₹${subtotal.toFixed(2)}`;
  orderTaxEl.textContent = `₹${tax.toFixed(2)}`;
  orderTotalEl.textContent = `₹${total.toFixed(2)}`;

  if (highlightItemId) {
    setTimeout(() => {
      const el = orderItemsList.querySelector(`[data-item-id="${highlightItemId}"]`);
      if (el) el.classList.remove('highlight-new');
    }, 1500);
  }
}

function updateItemQuantity(itemId, delta) {
  const item = orderItems.find(i => i.id === itemId);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    removeItemFromOrder(itemId, 0);
  } else {
    renderOrder();
    syncOrderWithServer();
  }
}

btnClearOrder.addEventListener('click', clearOrder);

// ============================================================================
// Order Placement & Success Modal
// ============================================================================

function displayOrderSuccess(orderId, bill) {
  const finalOrderNum = orderId ? orderId.replace(/^#/, '') : ('SH-' + Math.floor(1000 + Math.random() * 9000));
  successTicketId.textContent = '#' + finalOrderNum;

  let receiptHtml = '';
  if (orderItems.length > 0) {
    orderItems.forEach(i => {
      receiptHtml += `
        <div class="receipt-row">
          <span>${i.quantity}x ${escapeHtml(i.name)}</span>
          <span>₹${(i.price * i.quantity).toFixed(2)}</span>
        </div>
      `;
    });
  } else if (bill && Array.isArray(bill.breakdown)) {
    bill.breakdown.forEach(b => {
      receiptHtml += `
        <div class="receipt-row">
          <span>${escapeHtml(b)}</span>
        </div>
      `;
    });
  }

  const grandTotalStr = bill ? `₹${bill.grand_total.toFixed(2)}` : orderTotalEl.textContent;
  receiptHtml += `
    <div class="receipt-row bold">
      <span>Total (incl. 5% GST)</span>
      <span>${grandTotalStr.startsWith('₹') ? grandTotalStr : '₹' + grandTotalStr}</span>
    </div>
  `;

  successReceiptSummary.innerHTML = receiptHtml;
  successModal.classList.remove('hidden');

  playConfirmationChime();
  showToast(`Order #${finalOrderNum} submitted to kitchen!`);
}

btnPlaceOrder.addEventListener('click', () => {
  if (orderItems.length === 0) return;
  displayOrderSuccess(null, null);
});

btnNewOrder.addEventListener('click', () => {
  successModal.classList.add('hidden');
  clearOrder();
  updateCaption('assistant', "Order placed! How else can I help you today?");
});

function playConfirmationChime() {
  try {
    const ctxChime = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctxChime.currentTime;
    [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
      const osc = ctxChime.createOscillator();
      const gain = ctxChime.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.001, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.6);

      osc.connect(gain);
      gain.connect(ctxChime.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.6);
    });
  } catch (e) {}
}

function playReadyChime() {
  try {
    const ctxChime = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctxChime.currentTime;
    [587.33, 880.00].forEach((freq, idx) => {
      const osc = ctxChime.createOscillator();
      const gain = ctxChime.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.09);

      gain.gain.setValueAtTime(0.001, now + idx * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.35);

      osc.connect(gain);
      gain.connect(ctxChime.destination);
      osc.start(now + idx * 0.09);
      osc.stop(now + idx * 0.09 + 0.35);
    });
  } catch (e) {}
}

// ============================================================================
// Audio Downsampling (Mic to 16kHz PCM)
// ============================================================================

function downsampleTo16k(inputBuffer, inputSampleRate) {
  if (inputSampleRate === 16000) {
    const pcm16 = new Int16Array(inputBuffer.length);
    for (let i = 0; i < inputBuffer.length; i++) {
      let s = Math.max(-1, Math.min(1, inputBuffer[i]));
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm16.buffer;
  }

  const ratio = inputSampleRate / 16000;
  const newLength = Math.round(inputBuffer.length / ratio);
  const pcm16 = new Int16Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const originIndex = Math.floor(i * ratio);
    let s = Math.max(-1, Math.min(1, inputBuffer[originIndex] || 0));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return pcm16.buffer;
}

// ============================================================================
// Audio Playback Queue (Bulletproof Reconnection & Low Latency)
// ============================================================================

function stopAllAgentAudio() {
  for (const node of activeAudioNodes) {
    try {
      node.stop();
      node.disconnect();
    } catch (e) {}
  }
  activeAudioNodes = [];

  if (audioContextOut && audioContextOut.state !== 'closed') {
    scheduledPlaybackTime = audioContextOut.currentTime;
  } else {
    scheduledPlaybackTime = 0;
  }

  isAgentSpeaking = false;
  captionBox.classList.remove('speaking');
}

function play24kPcmChunk(arrayBuffer) {
  if (!audioContextOut || audioContextOut.state === 'closed') return;

  if (audioContextOut.state === 'suspended') {
    audioContextOut.resume();
  }

  const int16 = new Int16Array(arrayBuffer);
  if (int16.length === 0) return;

  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0;
  }

  // Create AudioBuffer at 24000 Hz
  const audioBuffer = audioContextOut.createBuffer(1, float32.length, 24000);
  audioBuffer.getChannelData(0).set(float32);

  const source = audioContextOut.createBufferSource();
  source.buffer = audioBuffer;

  if (analyserOut) {
    source.connect(analyserOut);
    analyserOut.connect(audioContextOut.destination);
  } else {
    source.connect(audioContextOut.destination);
  }

  const now = audioContextOut.currentTime;

  // Jitter buffer scheduling for gapless audio playback:
  // If scheduledPlaybackTime is behind current time (queue dried up or session restarted),
  // schedule next chunk immediately (with a small 25ms jitter safety margin).
  // Otherwise, queue it gaplessly right after the currently queued audio.
  if (scheduledPlaybackTime < now) {
    scheduledPlaybackTime = now + 0.025;
  }

  source.start(scheduledPlaybackTime);
  scheduledPlaybackTime += audioBuffer.duration;
  activeAudioNodes.push(source);

  isAgentSpeaking = true;
  captionBox.classList.add('speaking');
  setStatus('status-speaking', 'Receptionist is speaking...');

  source.onended = () => {
    const idx = activeAudioNodes.indexOf(source);
    if (idx !== -1) activeAudioNodes.splice(idx, 1);
    if (activeAudioNodes.length === 0) {
      isAgentSpeaking = false;
      captionBox.classList.remove('speaking');
      if (isConnected) {
        setStatus('status-listening', 'Listening to you... Speak now!');
      }
    }
  };
}

// ============================================================================
// Tool Call Event Handler (Real-time order tracking & arithmetic calculation)
// ============================================================================

function handleServerToolCalls(calls, bill) {
  if (!Array.isArray(calls)) return;

  calls.forEach(call => {
    const { name, args } = call;
    console.log(`[Tool Call Event] ${name}`, args);

    if (name === 'add_to_order') {
      const itemName = args.item_name || args.name || "Special Item";
      const quantity = args.quantity !== undefined ? args.quantity : 1;
      const notes = args.notes || "";
      addItemToOrder(itemName, quantity, notes);
      setStatus('status-order-updated', `Added ${itemName}${notes ? ` ("${notes}")` : ''} to your ticket`);

    } else if (name === 'update_item_notes') {
      const itemName = args.item_name || args.name || "";
      const notes = args.notes || "";
      updateItemNotes(itemName, notes);
      setStatus('status-order-updated', `Updated notes for ${itemName}`);

    } else if (name === 'remove_from_order') {
      const itemName = args.item_name || args.name || "";
      const quantity = args.quantity || 0;
      removeItemFromOrder(itemName, quantity);
      setStatus('status-order-updated', `Updated ticket for ${itemName}`);

    } else if (name === 'clear_order') {
      clearOrder();
      setStatus('status-order-updated', 'Order ticket reset');

    } else if (name === 'calculate_bill') {
      // Visual feedback when arithmetic tool is invoked
      const totalStr = bill ? `₹${bill.grand_total.toFixed(2)}` : orderTotalEl.textContent;
      setStatus('status-order-updated', `Bill calculated: ${totalStr} (5% GST incl.)`);
      showToast(`Total calculated: ${totalStr}`);

      // Flash highlight on the checkout deck
      const checkoutDeck = document.querySelector('.order-checkout-deck');
      if (checkoutDeck) {
        checkoutDeck.classList.add('highlight-new');
        setTimeout(() => checkoutDeck.classList.remove('highlight-new'), 2000);
      }

    } else if (name === 'place_order') {
      const orderId = call.order_id || (args && args.order_id) || null;
      displayOrderSuccess(orderId, bill);
      setStatus('status-order-updated', `Order #${orderId || 'submitted'} sent to kitchen!`);
    }
  });

  // If server sent exact bill calculation, sync directly with displayed totals
  if (bill && bill.subtotal !== undefined) {
    orderSubtotalEl.textContent = `₹${bill.subtotal.toFixed(2)}`;
    orderTaxEl.textContent = `₹${bill.tax.toFixed(2)}`;
    orderTotalEl.textContent = `₹${bill.grand_total.toFixed(2)}`;
  }

  setTimeout(() => {
    if (isConnected && !isAgentSpeaking) {
      setStatus('status-listening', 'Listening to you... Speak now!');
    }
  }, 2200);
}

// ============================================================================
// WebSocket Connection & Voice Session
// ============================================================================

async function startSession() {
  if (isConnected || isConnecting) return;
  isConnecting = true;
  isConnected = false;

  btnCall.disabled = true;
  btnCall.classList.add('connecting');
  labelCall.textContent = 'Connecting...';
  setStatus('status-connecting', 'Connecting to The Sheraton Receptionist...');

  // Ensure any previous session audio and sockets are completely cleanly released
  stopAllAgentAudio();
  if (ws) {
    try {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onerror = null;
      ws.onclose = null;
      ws.close();
    } catch (e) {}
    ws = null;
  }

  // RESET TIMING AND NODES UPON START
  scheduledPlaybackTime = 0;
  activeAudioNodes = [];
  preRollBuffer = [];

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContextIn = new AudioContextClass();
    audioContextOut = new AudioContextClass({ sampleRate: 24000 });

    if (audioContextIn.state === 'suspended') await audioContextIn.resume();
    if (audioContextOut.state === 'suspended') await audioContextOut.resume();

    micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      }
    });

    const micSource = audioContextIn.createMediaStreamSource(micStream);
    analyserIn = audioContextIn.createAnalyser();
    analyserIn.fftSize = 256;
    analyserIn.smoothingTimeConstant = 0.8;

    analyserOut = audioContextOut.createAnalyser();
    analyserOut.fftSize = 256;
    analyserOut.smoothingTimeConstant = 0.8;

    micSource.connect(analyserIn);

    scriptProcessor = audioContextIn.createScriptProcessor(4096, 1, 1);
    micSource.connect(scriptProcessor);
    scriptProcessor.connect(audioContextIn.destination);

    scriptProcessor.onaudioprocess = (e) => {
      if (isMuted || !ws || ws.readyState !== WebSocket.OPEN) return;
      const inputChannel = e.inputBuffer.getChannelData(0);

      // Pre-roll audio buffer: if customer speaks while Gemini Live session is handshaking,
      // preserve the frames in a ring buffer and flush them immediately once connected
      if (isConnecting) {
        const pcm16Buffer = downsampleTo16k(inputChannel, audioContextIn.sampleRate);
        preRollBuffer.push(pcm16Buffer);
        if (preRollBuffer.length > 8) preRollBuffer.shift();
        return;
      }

      if (!isConnected) return;

      // Echo suppression: prevent speaker audio from bleeding into microphone and triggering
      // self-interruption or secondary Gemini responses while the agent is speaking.
      // If customer wants to speak over, user speech with normal volume passes through,
      // but low-to-medium ambient/speaker bleed is gated out.
      if (isAgentSpeaking) {
        // Calculate RMS of incoming mic frame
        let sumSq = 0;
        for (let i = 0; i < inputChannel.length; i++) {
          sumSq += inputChannel[i] * inputChannel[i];
        }
        const rms = Math.sqrt(sumSq / inputChannel.length);
        // If acoustic energy is below barge-in threshold (speaker bleed), don't transmit to Gemini
        if (rms < 0.045) {
          return;
        }
      }

      const pcm16Buffer = downsampleTo16k(inputChannel, audioContextIn.sampleRate);
      ws.send(pcm16Buffer);
    };

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const selectedVoice = voiceSelect.value || 'Charon';
    const wsUrl = `${protocol}//${window.location.host}/ws?voice=${encodeURIComponent(selectedVoice)}`;

    ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      // WebSocket open with backend; awaiting Gemini Live session readiness confirmation
      setStatus('status-connecting', 'Securing voice line with Receptionist...');
      syncOrderWithServer();
    };

    ws.onmessage = (event) => {
      // Binary chunk -> 24kHz audio from Gemini Live
      if (event.data instanceof ArrayBuffer) {
        play24kPcmChunk(event.data);
        return;
      }

      // JSON events
      try {
        const msg = JSON.parse(event.data);

        if (msg.type === 'connected') {
          console.log('[WebSocket] Gemini Live session connected:', msg);
          if (msg.tax_rate !== undefined) taxRate = msg.tax_rate;

          isConnected = true;
          isConnecting = false;
          btnCall.disabled = false;
          btnCall.classList.remove('connecting');
          btnCall.classList.add('in-call');

          // Start Order button has NO icons, text only
          labelCall.textContent = 'End Order';
          btnMute.disabled = false;

          // Reset playback time right when connected
          scheduledPlaybackTime = audioContextOut ? audioContextOut.currentTime : 0;

          // Clear signal to customer that the receptionist is ready and listening
          setStatus('status-listening', 'Listening to you... Speak now!');
          updateCaption('assistant', "Connected! How may I take your order today?");
          playReadyChime();
          showToast(`Connected to The Sheraton Receptionist (${selectedVoice})`);

          // Flush any pre-roll audio frames captured during handshake so no words were missed
          if (preRollBuffer.length > 0) {
            for (const chunk of preRollBuffer) {
              try { ws.send(chunk); } catch (e) {}
            }
            preRollBuffer = [];
          }

        } else if (msg.type === 'tool_call') {
          handleServerToolCalls(msg.calls, msg.bill);

        } else if (msg.type === 'user_transcript') {
          updateCaption('user', `"${msg.text}"`);

        } else if (msg.type === 'agent_transcript') {
          currentAgentTurnText += msg.text;
          updateCaption('assistant', `"${currentAgentTurnText}"`, true);

        } else if (msg.type === 'text') {
          currentAgentTurnText += msg.text;
          updateCaption('assistant', `"${currentAgentTurnText}"`, true);

        } else if (msg.type === 'interrupted') {
          console.log('[Gemini Live] Interrupted by customer');
          stopAllAgentAudio();
          updateCaption('assistant', '(Listening...)');
          setStatus('status-listening', 'Listening to you...');

        } else if (msg.type === 'turn_complete') {
          currentAgentTurnText = "";
          captionBox.classList.remove('speaking');
          if (isConnected) {
            setStatus('status-listening', 'Listening to you... Speak now!');
          }

        } else if (msg.type === 'error') {
          console.error('[Server Error]', msg.message);
          showToast(`Notice: ${msg.message}`);
        }
      } catch (err) {
        console.error('[WebSocket] JSON parse error:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[WebSocket] Error:', err);
      showToast('WebSocket connection error');
    };

    ws.onclose = () => {
      console.log('[WebSocket] Connection closed');
      endSession();
    };

  } catch (err) {
    console.error('Failed to start session:', err);
    showToast(`Microphone or audio error: ${err.message}`);
    endSession();
  }
}

function endSession() {
  isConnected = false;
  isConnecting = false;
  isAgentSpeaking = false;
  stopAllAgentAudio();

  // RESET TIMING TO 0 FOR CLEAN RECONNECT
  scheduledPlaybackTime = 0;
  activeAudioNodes = [];

  if (ws) {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close();
    }
    ws = null;
  }

  if (micStream) {
    micStream.getTracks().forEach((track) => track.stop());
    micStream = null;
  }

  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (audioContextIn && audioContextIn.state !== 'closed') {
    audioContextIn.close();
    audioContextIn = null;
  }
  if (audioContextOut && audioContextOut.state !== 'closed') {
    audioContextOut.close();
    audioContextOut = null;
  }

  btnCall.disabled = false;
  btnCall.classList.remove('connecting');
  btnCall.classList.remove('in-call');
  labelCall.textContent = 'Start Order';
  preRollBuffer = [];

  btnMute.disabled = true;
  if (isMuted) toggleMute();

  setStatus('status-ready', 'Click "Start Order" to begin speaking');
  updateCaption('assistant', '"Press Start Order and tell me what you\'d like today!"');
}

function toggleMute() {
  if (!isConnected && !isMuted) return;
  isMuted = !isMuted;

  if (micStream) {
    micStream.getAudioTracks().forEach((t) => (t.enabled = !isMuted));
  }

  if (isMuted) {
    btnMute.classList.add('active-mute');
    iconMicOn.classList.add('hidden');
    iconMicOff.classList.remove('hidden');
    labelMute.textContent = 'Unmute';
    showToast('Microphone muted');
  } else {
    btnMute.classList.remove('active-mute');
    iconMicOn.classList.remove('hidden');
    iconMicOff.classList.add('hidden');
    labelMute.textContent = 'Mute';
    showToast('Microphone unmuted');
  }
}

btnCall.addEventListener('click', () => {
  if (isConnected) {
    endSession();
  } else {
    startSession();
  }
});

btnMute.addEventListener('click', toggleMute);

// ============================================================================
// System Prompt Modal
// ============================================================================

async function fetchInitialConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const data = await res.json();
      if (data.default_voice && voiceSelect) {
        voiceSelect.value = data.default_voice;
      }
      if (data.system_prompt && promptTextarea) {
        promptTextarea.value = data.system_prompt;
      }
      if (data.tax_rate !== undefined) {
        taxRate = data.tax_rate;
      }
    }
  } catch (err) {
    console.warn('Could not load initial server config:', err);
  }
}

btnPromptModal.addEventListener('click', () => {
  promptModal.classList.remove('hidden');
  promptTextarea.focus();
});

btnCloseModal.addEventListener('click', () => promptModal.classList.add('hidden'));
btnCancelModal.addEventListener('click', () => promptModal.classList.add('hidden'));

btnSavePrompt.addEventListener('click', async () => {
  const newPrompt = promptTextarea.value.trim();
  if (!newPrompt) return showToast('Prompt cannot be empty');

  try {
    const res = await fetch('/api/update_prompt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system_prompt: newPrompt }),
    });
    if (res.ok) {
      promptModal.classList.add('hidden');
      showToast('Receptionist instructions saved!');
    }
  } catch (e) {
    showToast('Failed to save prompt');
  }
});

// ============================================================================
// 3D-Styled Reactive Canvas Visualizer Loop (Warm Amber / Gold Glow)
// ============================================================================

function renderVisualizer() {
  animFrameId = requestAnimationFrame(renderVisualizer);

  const width = visualizerCanvas.width;
  const height = visualizerCanvas.height;
  const centerX = width / 2;
  const centerY = height / 2;

  ctx.clearRect(0, 0, width, height);

  let freqData = null;
  let activeEnergy = 0;

  if (isAgentSpeaking && analyserOut) {
    freqData = new Uint8Array(analyserOut.frequencyBinCount);
    analyserOut.getByteFrequencyData(freqData);
  } else if (isConnected && !isMuted && analyserIn) {
    freqData = new Uint8Array(analyserIn.frequencyBinCount);
    analyserIn.getByteFrequencyData(freqData);
  }

  if (freqData) {
    let sum = 0;
    const len = Math.min(freqData.length, 64);
    for (let i = 0; i < len; i++) sum += freqData[i];
    activeEnergy = sum / len / 255.0; // 0.0 to 1.0
  }

  const time = Date.now() * 0.002;
  const baseRadius = 78;
  const expansion = activeEnergy * 38;
  const currentRadius = baseRadius + expansion;

  // Sync orb core pulse
  if (orbCore) {
    const scale = 1.0 + activeEnergy * 0.38;
    orbCore.style.transform = `scale(${scale})`;
    if (isAgentSpeaking) {
      orbCore.style.filter = `blur(${10 + activeEnergy * 16}px) brightness(1.35)`;
    } else if (isConnected) {
      orbCore.style.filter = `blur(${12 + activeEnergy * 10}px) brightness(1.1)`;
    } else {
      orbCore.style.filter = 'blur(12px) brightness(0.85)';
    }
  }

  // 1. Draw Floating Orbital Amber Particles
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    p.angle += p.speed;

    const dynamicRadius = p.baseRadius + activeEnergy * 44;
    const px = centerX + Math.cos(p.angle) * dynamicRadius;
    const py = centerY + Math.sin(p.angle) * dynamicRadius;

    ctx.beginPath();
    ctx.arc(px, py, p.size + activeEnergy * 1.8, 0, Math.PI * 2);

    if (isAgentSpeaking) {
      ctx.fillStyle = `rgba(251, 191, 36, ${p.alpha + activeEnergy * 0.45})`;
      ctx.shadowColor = '#fbbf24';
    } else if (isConnected) {
      ctx.fillStyle = `rgba(245, 158, 11, ${p.alpha + activeEnergy * 0.35})`;
      ctx.shadowColor = '#f59e0b';
    } else {
      ctx.fillStyle = `rgba(168, 162, 158, ${p.alpha * 0.4})`;
      ctx.shadowColor = 'transparent';
    }
    ctx.shadowBlur = activeEnergy > 0.08 ? 9 : 0;
    ctx.fill();
  }

  // 2. Draw Reactive Ripple Waves (Warm Gold)
  const ringCount = 3;
  for (let r = 1; r <= ringCount; r++) {
    const ringRadius = currentRadius + r * (16 + activeEnergy * 14);
    ctx.beginPath();
    ctx.arc(centerX, centerY, ringRadius, 0, Math.PI * 2);
    ctx.lineWidth = 1.4;

    if (isAgentSpeaking) {
      ctx.strokeStyle = `rgba(251, 191, 36, ${(0.4 / r) * (0.6 + activeEnergy)})`;
    } else if (isConnected) {
      ctx.strokeStyle = `rgba(245, 158, 11, ${(0.35 / r) * (0.6 + activeEnergy)})`;
    } else {
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.04 / r})`;
    }
    ctx.stroke();
  }

  // 3. Draw Reactive Morphing Frequency Ring
  const points = 64;
  ctx.beginPath();
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * Math.PI * 2;
    let waveOffset = Math.sin(angle * 6 + time * 3) * (3 + activeEnergy * 15);
    if (freqData && i < freqData.length) {
      waveOffset += (freqData[i % 32] / 255.0) * 20;
    }

    const r = currentRadius + waveOffset;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;

    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();

  // Amber to Gold Gradient Border Stroke
  const gradient = ctx.createLinearGradient(0, centerY - currentRadius, width, centerY + currentRadius);
  if (isAgentSpeaking) {
    gradient.addColorStop(0, '#fef08a');
    gradient.addColorStop(0.5, '#fbbf24');
    gradient.addColorStop(1, '#d97706');
  } else if (isConnected) {
    gradient.addColorStop(0, '#fbbf24');
    gradient.addColorStop(0.5, '#f59e0b');
    gradient.addColorStop(1, '#b45309');
  } else {
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.15)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0.04)');
  }

  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2.4;
  ctx.shadowColor = isAgentSpeaking ? '#fbbf24' : isConnected ? '#f59e0b' : 'transparent';
  ctx.shadowBlur = 14;
  ctx.stroke();
  ctx.shadowBlur = 0;
}

// Window Load Initialization
window.addEventListener('DOMContentLoaded', () => {
  fetchMenu();
  fetchInitialConfig();
  renderVisualizer();
});
