// demo2.js - The Sheraton Medical Scribe & Consultation Dialogue
let isRecording = false;
let ws = null;
let audioContext = null;
let mediaStream = null;
let scriptProcessor = null;
let analyserNode = null;
let visualizerAnimId = null;
let timerInterval = null;
let startTime = null;
let dialogueHistory = [];

// DOM Elements
const btnRecord = document.getElementById('btn-record');
const labelRecord = document.getElementById('label-record');
const btnExtract = document.getElementById('btn-extract');
const labelExtract = document.getElementById('label-extract');
const btnPrint = document.getElementById('btn-print');
const btnClear = document.getElementById('btn-clear');
const timerDisplay = document.getElementById('session-timer');
const statusPill = document.getElementById('status-pill');
const statusText = document.getElementById('status-text');
const transcriptContainer = document.getElementById('transcript-container');
const welcomeMessage = document.getElementById('welcome-message');
const interimBox = document.getElementById('interim-preview-box');
const interimText = document.getElementById('interim-text');
const overlayConnecting = document.getElementById('overlay-connecting');

// Audio Visualizer Elements
const visualizerCard = document.getElementById('audio-visualizer-card');
const visualizerCanvas = document.getElementById('audio-visualizer');
const visualizerCtx = visualizerCanvas.getContext('2d');
const visualizerLabel = document.getElementById('visualizer-label');
const meterDb = document.getElementById('meter-db');
const audioMeterFill = document.getElementById('audio-meter-fill');

// Manual Input Elements
const manualInput = document.getElementById('manual-input');
const speakerSelect = document.getElementById('speaker-select');
const btnSendManual = document.getElementById('btn-send-manual');

// Clinical Summary DOM Elements
const symptomsContainer = document.getElementById('symptoms-container');
const textDuration = document.getElementById('text-duration');
const textDiagnosis = document.getElementById('text-diagnosis');
const prescriptionsContainer = document.getElementById('prescriptions-container');
const adviceContainer = document.getElementById('advice-container');

// Print Elements
const printDate = document.getElementById('print-date');
const printRef = document.getElementById('print-ref');
const printSymptoms = document.getElementById('print-symptoms');
const printDuration = document.getElementById('print-duration');
const printDiagnosis = document.getElementById('print-diagnosis');
const printPrescriptions = document.getElementById('print-prescriptions');
const printAdvice = document.getElementById('print-advice');

// ---------------------------------------------------------------------------
// Initialization & Event Listeners
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initVisualizerIdle();
  setupMobileTabs();
  setupExamples();
});

function setupMobileTabs() {
  const tabs = document.querySelectorAll('.tab-bar-item');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const targetId = tab.dataset.target;
      document.querySelectorAll('.demo2-column').forEach(col => {
        col.classList.remove('mobile-active');
      });
      const targetCol = document.getElementById(targetId);
      if (targetCol) {
        targetCol.classList.add('mobile-active');
      }
    });
  });
}

function setupExamples() {
  document.querySelectorAll('.chip-sample').forEach(chip => {
    chip.addEventListener('click', () => {
      const text = chip.dataset.text;
      if (text) {
        addManualDialogue(text);
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Record Button Flow
// ---------------------------------------------------------------------------
btnRecord.addEventListener('click', () => {
  if (isRecording) {
    stopRecording();
  } else {
    startRecording();
  }
});

async function startRecording() {
  try {
    overlayConnecting.classList.remove('hidden');
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws/transcribe`);

    ws.onopen = () => {
      isRecording = true;
      overlayConnecting.classList.add('hidden');

      // Update UI state
      btnRecord.classList.add('recording');
      labelRecord.textContent = 'Stop Recording';
      btnExtract.disabled = false;
      visualizerCard.classList.add('active-recording');
      visualizerLabel.textContent = 'Microphone Active • Live Stream';

      updateStatus('recording', 'Listening & Transcribing...');

      // Start Session Timer
      startTime = Date.now();
      clearInterval(timerInterval);
      timerInterval = setInterval(updateTimer, 1000);

      // Setup Web Audio & Visualizer
      startAudioPipeline(mediaStream);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleServerMessage(data);
      } catch (err) {
        console.error('Error parsing server message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      updateStatus('error', 'Connection Error');
    };

    ws.onclose = () => {
      if (isRecording) {
        stopRecording(false);
      }
    };

  } catch (err) {
    console.error('Microphone access denied or error:', err);
    overlayConnecting.classList.add('hidden');
    alert('Microphone access is required. Please check your browser microphone permissions.');
  }
}

function stopRecording(closeWs = true) {
  isRecording = false;

  btnRecord.classList.remove('recording');
  labelRecord.textContent = 'Start Recording';
  visualizerCard.classList.remove('active-recording');
  visualizerLabel.textContent = 'Microphone Idle';
  audioMeterFill.style.width = '0%';
  meterDb.textContent = '0%';

  updateStatus('ready', 'Microphone Idle');
  clearInterval(timerInterval);

  if (interimBox) {
    interimBox.classList.add('hidden');
    interimText.textContent = '';
  }

  // Stop Audio Nodes
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
  if (scriptProcessor) {
    scriptProcessor.disconnect();
    scriptProcessor = null;
  }
  if (analyserNode) {
    analyserNode.disconnect();
    analyserNode = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
    audioContext.close();
    audioContext = null;
  }
  if (visualizerAnimId) {
    cancelAnimationFrame(visualizerAnimId);
    visualizerAnimId = null;
  }
  initVisualizerIdle();

  if (closeWs && ws) {
    ws.close();
    ws = null;
  }
}

function updateTimer() {
  const elapsed = Math.floor((Date.now() - startTime) / 1000);
  const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const s = String(elapsed % 60).padStart(2, '0');
  timerDisplay.textContent = `${m}:${s}`;
}

function updateStatus(state, msg) {
  statusPill.className = `status-pill status-${state}`;
  statusText.textContent = msg;
}

// ---------------------------------------------------------------------------
// Web Audio Pipeline & Real-Time Canvas Audio Visualizer
// ---------------------------------------------------------------------------
function startAudioPipeline(stream) {
  audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
  const source = audioContext.createMediaStreamSource(stream);

  // Analyser Node for Visualizer
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 256;
  analyserNode.smoothingTimeConstant = 0.8;
  source.connect(analyserNode);

  // ScriptProcessor for PCM Streaming
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);

  scriptProcessor.onaudioprocess = (e) => {
    if (!isRecording || !ws || ws.readyState !== WebSocket.OPEN) return;

    const inputData = e.inputBuffer.getChannelData(0);
    const pcmData = new Int16Array(inputData.length);
    for (let i = 0; i < inputData.length; i++) {
      const s = Math.max(-1, Math.min(1, inputData[i]));
      pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    ws.send(pcmData.buffer);
  };

  // Start Visualizer Canvas Loop
  drawLiveVisualizer();
}

function drawLiveVisualizer() {
  if (!analyserNode) return;

  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyserNode.getByteFrequencyData(dataArray);

  // Compute Volume / Peak
  let sum = 0;
  for (let i = 0; i < bufferLength; i++) {
    sum += dataArray[i];
  }
  const avg = sum / bufferLength;
  const percent = Math.min(100, Math.round((avg / 128) * 100));

  audioMeterFill.style.width = `${percent}%`;
  meterDb.textContent = `${percent}%`;

  const width = visualizerCanvas.width;
  const height = visualizerCanvas.height;

  visualizerCtx.clearRect(0, 0, width, height);

  // Draw Dynamic Spectrum Bars
  const barCount = 48;
  const barWidth = (width / barCount) - 3;
  const step = Math.floor(bufferLength / barCount);

  for (let i = 0; i < barCount; i++) {
    const val = dataArray[i * step] || 0;
    const barHeight = Math.max(4, (val / 255) * (height - 10));
    const x = i * (barWidth + 3);
    const y = (height - barHeight) / 2;

    // Gradient bar styling
    const grad = visualizerCtx.createLinearGradient(0, y, 0, y + barHeight);
    grad.addColorStop(0, '#14b8a6');
    grad.addColorStop(0.5, '#2dd4bf');
    grad.addColorStop(1, '#0d9488');

    visualizerCtx.fillStyle = grad;
    visualizerCtx.shadowColor = 'rgba(20, 184, 166, 0.4)';
    visualizerCtx.shadowBlur = 6;

    // Rounded rectangle
    roundRect(visualizerCtx, x, y, barWidth, barHeight, 3);
    visualizerCtx.fill();
  }

  visualizerAnimId = requestAnimationFrame(drawLiveVisualizer);
}

function initVisualizerIdle() {
  const width = visualizerCanvas.width;
  const height = visualizerCanvas.height;
  visualizerCtx.clearRect(0, 0, width, height);

  // Draw gentle center resting baseline
  visualizerCtx.beginPath();
  visualizerCtx.moveTo(0, height / 2);
  visualizerCtx.lineTo(width, height / 2);
  visualizerCtx.strokeStyle = 'rgba(20, 184, 166, 0.25)';
  visualizerCtx.lineWidth = 2;
  visualizerCtx.stroke();
}

function roundRect(ctx, x, y, w, h, r) {
  if (w < 2 * r) r = w / 2;
  if (h < 2 * r) r = h / 2;
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------------------------------
// Server Message & Transcript Handler
// ---------------------------------------------------------------------------
function handleServerMessage(data) {
  if (data.type === 'interim_transcript') {
    if (interimBox && data.text) {
      interimBox.classList.remove('hidden');
      interimText.textContent = data.text;
      transcriptContainer.scrollTop = transcriptContainer.scrollHeight;
    }
  } else if (data.type === 'final_transcript') {
    if (interimBox) {
      interimBox.classList.add('hidden');
      interimText.textContent = '';
    }
    if (data.text && data.text.trim()) {
      appendDialogueLine(data.text.trim());
    }
  } else if (data.type === 'cleared') {
    resetDialogueFeed();
  }
}

function appendDialogueLine(text, forcedSpeaker = null) {
  if (welcomeMessage) {
    welcomeMessage.style.display = 'none';
  }

  let speaker = forcedSpeaker;
  let cleanText = text;

  // Detect explicit speaker prefix like "Doctor: ..." or "Patient: ..."
  if (!speaker) {
    const lower = text.toLowerCase();
    if (lower.startsWith('doctor:') || lower.startsWith('dr:')) {
      speaker = 'doctor';
      cleanText = text.replace(/^(doctor|dr):/i, '').trim();
    } else if (lower.startsWith('patient:')) {
      speaker = 'patient';
      cleanText = text.replace(/^patient:/i, '').trim();
    } else {
      // Heuristic: questions and prescription language typically doctor, symptoms patient
      const docKeywords = ['prescribe', 'take', 'twice', 'daily', 'mg', 'diagnosis', 'symptom', 'how long', 'fever'];
      const isDoc = docKeywords.some(kw => lower.includes(kw) && (lower.includes('prescribe') || lower.includes('take') || lower.includes('you should')));
      speaker = isDoc ? 'doctor' : (speakerSelect ? speakerSelect.value : 'patient');
    }
  }

  const now = new Date();
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const card = document.createElement('div');
  card.className = `utterance-card ${speaker}`;

  card.innerHTML = `
    <div class="utterance-meta">
      <div class="speaker-badge-wrap">
        <span class="speaker-pill">${speaker === 'doctor' ? 'Dr. Physician' : 'Patient'}</span>
        <span class="utterance-time">${timeStr}</span>
      </div>
      <button class="btn-toggle-speaker" title="Switch between Doctor and Patient">
        Switch Role
      </button>
    </div>
    <div class="utterance-text">${escapeHtml(cleanText)}</div>
  `;

  // Toggle speaker listener
  const toggleBtn = card.querySelector('.btn-toggle-speaker');
  toggleBtn.addEventListener('click', () => {
    if (card.classList.contains('doctor')) {
      card.classList.remove('doctor');
      card.classList.add('patient');
      card.querySelector('.speaker-pill').textContent = 'Patient';
    } else {
      card.classList.remove('patient');
      card.classList.add('doctor');
      card.querySelector('.speaker-pill').textContent = 'Dr. Physician';
    }
  });

  transcriptContainer.appendChild(card);
  transcriptContainer.scrollTop = transcriptContainer.scrollHeight;

  // Add to in-memory dialogue history
  dialogueHistory.push({ speaker, text: cleanText });
  btnExtract.disabled = false;
}

// ---------------------------------------------------------------------------
// Manual Input & Test Prompt Handling
// ---------------------------------------------------------------------------
btnSendManual.addEventListener('click', () => submitManualInput());
manualInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    submitManualInput();
  }
});

function submitManualInput() {
  const text = manualInput.value.trim();
  if (!text) return;
  const speaker = speakerSelect.value;
  addManualDialogue(`${speaker === 'doctor' ? 'Doctor' : 'Patient'}: ${text}`, speaker);
  manualInput.value = '';
}

function addManualDialogue(fullLine, explicitSpeaker = null) {
  appendDialogueLine(fullLine, explicitSpeaker);

  // Also sync with server WebSocket if active
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'add_text',
      text: fullLine,
    }));
  }
}

// ---------------------------------------------------------------------------
// Extraction Action (Gemini 3.5 Flash Lite)
// ---------------------------------------------------------------------------
btnExtract.addEventListener('click', async () => {
  const fullTranscript = compileTranscriptText();
  if (!fullTranscript.trim()) {
    alert('Please record or enter consultation dialogue before extracting.');
    return;
  }

  btnExtract.disabled = true;
  labelExtract.textContent = 'Extracting...';

  try {
    const res = await fetch('/api/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transcript: fullTranscript,
      }),
    });

    const result = await res.json();
    if (result.status === 'success' && result.data) {
      renderExtractedSummary(result.data.keywords);
    } else {
      alert(`Extraction failed: ${result.message || 'Unknown error'}`);
    }
  } catch (err) {
    console.error('Extraction request failed:', err);
    alert('Failed to connect to extraction service.');
  } finally {
    btnExtract.disabled = false;
    labelExtract.textContent = 'Extract Summary';
  }
});

function compileTranscriptText() {
  // Read all utterance cards from DOM
  const cards = transcriptContainer.querySelectorAll('.utterance-card');
  if (cards.length > 0) {
    const lines = [];
    cards.forEach(card => {
      const isDoc = card.classList.contains('doctor');
      const textElem = card.querySelector('.utterance-text');
      const txt = textElem ? textElem.textContent.trim() : '';
      if (txt) {
        lines.push(`${isDoc ? 'Doctor' : 'Patient'}: ${txt}`);
      }
    });
    return lines.join('\n');
  }

  // Fallback to in-memory history
  return dialogueHistory.map(d => `${d.speaker === 'doctor' ? 'Doctor' : 'Patient'}: ${d.text}`).join('\n');
}

function renderExtractedSummary(keywords) {
  if (!keywords) return;

  // 1. Symptoms
  if (keywords.symptoms && keywords.symptoms.length > 0) {
    symptomsContainer.innerHTML = `
      <div class="symptom-tags-list">
        ${keywords.symptoms.map(s => `<span class="symptom-pill">${escapeHtml(s)}</span>`).join('')}
      </div>
    `;
    printSymptoms.innerHTML = keywords.symptoms.map(s => `• ${escapeHtml(s)}`).join('<br>');
  }

  // 2. Duration
  if (keywords.duration) {
    textDuration.textContent = keywords.duration;
    textDuration.classList.remove('empty-state');
    printDuration.textContent = keywords.duration;
  }

  // 3. Diagnosis / Root Cause
  if (keywords.root_cause) {
    textDiagnosis.textContent = keywords.root_cause;
    textDiagnosis.classList.remove('empty-state');
    printDiagnosis.textContent = keywords.root_cause;
  }

  // 4. Prescriptions
  if (keywords.prescriptions && keywords.prescriptions.length > 0) {
    prescriptionsContainer.innerHTML = `
      <div class="prescriptions-table">
        ${keywords.prescriptions.map(p => `
          <div class="prescription-row">
            <div class="rx-info">
              <span class="rx-drug">${escapeHtml(p.drug || 'Medication')}</span>
              <span class="rx-freq">${escapeHtml(p.frequency || 'As directed')}</span>
            </div>
            <span class="rx-dose-badge">${escapeHtml(p.dose || 'Standard Dose')}</span>
          </div>
        `).join('')}
      </div>
    `;

    printPrescriptions.innerHTML = keywords.prescriptions.map(p => `
      <div class="print-rx-item">
        <strong>${escapeHtml(p.drug)}</strong> — ${escapeHtml(p.dose)} (${escapeHtml(p.frequency)})
      </div>
    `).join('');
  }

  // 5. Advice / Next Steps
  if (keywords.advice && keywords.advice.length > 0) {
    adviceContainer.innerHTML = `
      <ul class="advice-bullet-list">
        ${keywords.advice.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
      </ul>
    `;

    printAdvice.innerHTML = keywords.advice.map(a => `✔ ${escapeHtml(a)}`).join('<br>');
  }
}

// ---------------------------------------------------------------------------
// Reset / Clear
// ---------------------------------------------------------------------------
btnClear.addEventListener('click', async () => {
  if (confirm('Clear the current consultation dialogue and clinical summary?')) {
    if (isRecording) {
      stopRecording();
    }
    dialogueHistory = [];
    resetDialogueFeed();

    // Call server clear endpoint
    try {
      await fetch('/api/clear_transcript', { method: 'POST' });
    } catch (err) {
      console.warn('Clear transcript request error:', err);
    }
  }
});

function resetDialogueFeed() {
  transcriptContainer.innerHTML = '';
  if (welcomeMessage) {
    welcomeMessage.style.display = 'block';
    transcriptContainer.appendChild(welcomeMessage);
  }
  btnExtract.disabled = true;
  timerDisplay.textContent = '00:00';

  // Reset summary cards
  symptomsContainer.innerHTML = '<p class="empty-state">No symptoms extracted yet. Record dialogue and click "Extract Summary".</p>';
  textDuration.textContent = 'Not specified';
  textDuration.classList.add('empty-state');
  textDiagnosis.textContent = 'Awaiting extraction';
  textDiagnosis.classList.add('empty-state');
  prescriptionsContainer.innerHTML = '<p class="empty-state">No prescriptions extracted yet.</p>';
  adviceContainer.innerHTML = '<p class="empty-state">No advice extracted yet.</p>';
}

// ---------------------------------------------------------------------------
// Print / Export PDF Action
// ---------------------------------------------------------------------------
btnPrint.addEventListener('click', () => {
  // Populate print date and reference
  const now = new Date();
  printDate.textContent = now.toLocaleDateString() + ' ' + now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  printRef.textContent = 'SH-MED-' + Math.floor(100000 + Math.random() * 900000);
  window.print();
});

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
