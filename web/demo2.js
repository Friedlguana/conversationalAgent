// demo2.js - The Sheraton Medical Scribe & Consultation Dialogue
// Powered by gemini-3.5-transcribe (Native Speaker Diarization) & gemini-3.5-flash-lite (Clinical Extraction)

let isRecording = false;
let audioContext = null;
let mediaStream = null;
let scriptProcessor = null;
let analyserNode = null;
let visualizerAnimId = null;
let timerInterval = null;
let startTime = null;
let recordedAudioChunks = [];
let dialogueHistory = [];

// DOM Elements
const btnRecord = document.getElementById('btn-record');
const labelRecord = document.getElementById('label-record');
const btnUpload = document.getElementById('btn-upload');
const labelUpload = document.getElementById('label-upload');
const fileAudioUpload = document.getElementById('file-audio-upload');
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
  setupUpload();
  setupSampleAudio();
  setupAudioPlayback();
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
    if (chip.id === 'btn-run-sample-audio') return;
    chip.addEventListener('click', () => {
      const text = chip.dataset.text;
      if (text) {
        addManualDialogue(text);
      }
    });
  });
}

function setupUpload() {
  if (btnUpload && fileAudioUpload) {
    btnUpload.addEventListener('click', () => {
      fileAudioUpload.click();
    });

    fileAudioUpload.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      await processAudioFile(file, file.name);
      fileAudioUpload.value = '';
    });
  }
}

function setupSampleAudio() {
  const sampleBtn = document.getElementById('btn-run-sample-audio');
  if (sampleBtn) {
    sampleBtn.addEventListener('click', async () => {
      // Stop playback if playing
      const audioElem = document.getElementById('sample-audio-player');
      if (audioElem && !audioElem.paused) {
        audioElem.pause();
      }

      updateStatus('recording', 'Loading Sample Consultation Audio...');
      try {
        const res = await fetch('/static/sample_dialogue.wav');
        if (!res.ok) throw new Error('Sample audio not found on server.');
        const blob = await res.blob();
        await processAudioFile(blob, 'sample_dialogue.wav');
      } catch (err) {
        console.error('Failed to load sample audio:', err);
        alert('Could not load sample audio: ' + err.message);
        updateStatus('ready', 'Microphone Idle');
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Audio Playback for Sample Audio (Listen feature)
// ---------------------------------------------------------------------------
let playbackSourceNode = null;

function setupAudioPlayback() {
  const audioElem = document.getElementById('sample-audio-player');
  const btnHeader = document.getElementById('btn-play-audio-header');
  const btnPrompt = document.getElementById('btn-play-sample-prompt');

  async function togglePlay() {
    if (!audioElem) return;

    if (!audioElem.paused) {
      audioElem.pause();
    } else {
      // If currently recording microphone, stop first
      if (isRecording) {
        stopRecordingAndTranscribe();
      }

      // Initialize or resume Web Audio Context
      try {
        if (!audioContext || audioContext.state === 'closed') {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }

        if (!analyserNode) {
          analyserNode = audioContext.createAnalyser();
          analyserNode.fftSize = 256;
          analyserNode.smoothingTimeConstant = 0.8;
        }

        // Connect media element source to analyser so visualizer reacts
        if (!playbackSourceNode) {
          try {
            playbackSourceNode = audioContext.createMediaElementSource(audioElem);
            playbackSourceNode.connect(analyserNode);
            analyserNode.connect(audioContext.destination);
          } catch (connErr) {
            console.warn('Media element source already connected or note:', connErr);
          }
        }
      } catch (ctxErr) {
        console.warn('AudioContext setup for playback note:', ctxErr);
      }

      try {
        await audioElem.play();
      } catch (err) {
        console.error('Audio playback error:', err);
        alert('Playback error: ' + err.message);
      }
    }
  }

  if (btnHeader) btnHeader.addEventListener('click', togglePlay);
  if (btnPrompt) btnPrompt.addEventListener('click', togglePlay);

  if (audioElem) {
    audioElem.addEventListener('play', () => {
      setPlaybackUIState(true);
      if (visualizerCard) visualizerCard.classList.add('active-recording');
      if (visualizerLabel) visualizerLabel.textContent = 'Audio Playback • Sample Consultation';
      updateStatus('recording', 'Playing Sample Consultation Audio...');
      if (!visualizerAnimId) {
        drawLiveVisualizer();
      }
    });

    audioElem.addEventListener('pause', () => {
      setPlaybackUIState(false);
      if (visualizerCard) visualizerCard.classList.remove('active-recording');
      if (visualizerLabel) visualizerLabel.textContent = 'Microphone Idle';
      updateStatus('ready', 'Microphone Idle');
      if (visualizerAnimId) {
        cancelAnimationFrame(visualizerAnimId);
        visualizerAnimId = null;
      }
      initVisualizerIdle();
    });

    audioElem.addEventListener('ended', () => {
      setPlaybackUIState(false);
      if (visualizerCard) visualizerCard.classList.remove('active-recording');
      if (visualizerLabel) visualizerLabel.textContent = 'Microphone Idle';
      updateStatus('ready', 'Microphone Idle');
      if (visualizerAnimId) {
        cancelAnimationFrame(visualizerAnimId);
        visualizerAnimId = null;
      }
      initVisualizerIdle();
    });

    audioElem.addEventListener('timeupdate', () => {
      if (audioElem.duration) {
        const cur = Math.floor(audioElem.currentTime);
        const dur = Math.floor(audioElem.duration);
        const curM = String(Math.floor(cur / 60)).padStart(2, '0');
        const curS = String(cur % 60).padStart(2, '0');
        const durM = String(Math.floor(dur / 60)).padStart(2, '0');
        const durS = String(dur % 60).padStart(2, '0');
        const labelHeader = document.getElementById('label-play-header');
        const labelPrompt = document.getElementById('label-play-prompt');
        if (labelHeader && !audioElem.paused) labelHeader.textContent = `Pause (${curM}:${curS})`;
        if (labelPrompt && !audioElem.paused) labelPrompt.textContent = `Pause Audio (${curM}:${curS} / ${durM}:${durS})`;
      }
    });
  }
}

function setPlaybackUIState(isPlaying) {
  const btnHeader = document.getElementById('btn-play-audio-header');
  const btnPrompt = document.getElementById('btn-play-sample-prompt');
  const labelHeader = document.getElementById('label-play-header');
  const labelPrompt = document.getElementById('label-play-prompt');

  [btnHeader, btnPrompt].forEach(btn => {
    if (!btn) return;
    const playIcon = btn.querySelector('.play-icon');
    const pauseIcon = btn.querySelector('.pause-icon');

    if (isPlaying) {
      btn.classList.add('playing');
      if (playIcon) playIcon.classList.add('hidden');
      if (pauseIcon) pauseIcon.classList.remove('hidden');
    } else {
      btn.classList.remove('playing');
      if (playIcon) playIcon.classList.remove('hidden');
      if (pauseIcon) pauseIcon.classList.add('hidden');
    }
  });

  if (!isPlaying) {
    if (labelHeader) labelHeader.textContent = 'Play Sample Audio';
    if (labelPrompt) labelPrompt.textContent = 'Listen to Sample Audio (12s)';
  }
}

// ---------------------------------------------------------------------------
// Record Button Flow (gemini-3.5-transcribe)
// ---------------------------------------------------------------------------
btnRecord.addEventListener('click', () => {
  if (isRecording) {
    stopRecordingAndTranscribe();
  } else {
    startRecording();
  }
});

async function startRecording() {
  try {
    overlayConnecting.classList.remove('hidden');
    recordedAudioChunks = [];

    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: 16000,
        echoCancellation: true,
        noiseSuppression: true,
      },
    });

    overlayConnecting.classList.add('hidden');
    isRecording = true;

    // Update UI state
    btnRecord.classList.add('recording');
    labelRecord.textContent = 'Stop & Transcribe';
    visualizerCard.classList.add('active-recording');
    visualizerLabel.textContent = 'Microphone Active • Recording';

    updateStatus('recording', 'Recording Consultation...');

    // Start Session Timer
    startTime = Date.now();
    clearInterval(timerInterval);
    timerInterval = setInterval(updateTimer, 1000);

    // Setup Web Audio Pipeline
    startAudioPipeline(mediaStream);

  } catch (err) {
    console.error('Microphone access denied or error:', err);
    overlayConnecting.classList.add('hidden');
    alert('Microphone access is required. Please check your browser microphone permissions.');
  }
}

async function stopRecordingAndTranscribe() {
  isRecording = false;

  btnRecord.classList.remove('recording');
  labelRecord.textContent = 'Processing Audio...';
  btnRecord.disabled = true;

  visualizerCard.classList.remove('active-recording');
  visualizerLabel.textContent = 'Microphone Idle';
  audioMeterFill.style.width = '0%';
  meterDb.textContent = '0%';

  clearInterval(timerInterval);

  // Stop Audio Hardware
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

  // Combine PCM Chunks and encode to 16kHz Mono WAV
  const totalLength = recordedAudioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
  if (totalLength < 1600) { // Less than 0.1s
    labelRecord.textContent = 'Start Recording';
    btnRecord.disabled = false;
    updateStatus('ready', 'Recording too short');
    return;
  }

  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (const chunk of recordedAudioChunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  recordedAudioChunks = [];

  const wavBlob = encodeWav(merged, 16000);
  await processAudioFile(wavBlob, 'recorded_consultation.wav');

  btnRecord.disabled = false;
  labelRecord.textContent = 'Start Recording';
}

// ---------------------------------------------------------------------------
// Audio File Processing via /api/transcribe_audio
// ---------------------------------------------------------------------------
async function processAudioFile(fileOrBlob, filename = 'audio.wav') {
  updateStatus('recording', 'Transcribing with gemini-3.5-transcribe...');

  const formData = new FormData();
  formData.append('audio', fileOrBlob, filename);

  try {
    const res = await fetch('/api/transcribe_audio', {
      method: 'POST',
      body: formData,
    });

    const result = await res.json();
    if (result.status === 'success') {
      // Clear welcome message
      if (welcomeMessage) {
        welcomeMessage.style.display = 'none';
      }

      // Reset and display utterances
      transcriptContainer.innerHTML = '';
      dialogueHistory = [];

      if (result.utterances && result.utterances.length > 0) {
        result.utterances.forEach(u => {
          renderUtteranceCard(u);
        });
      }

      // Render clinical summary keywords
      if (result.data && result.data.keywords) {
        renderExtractedSummary(result.data.keywords);
      }

      updateStatus('ready', 'Consultation Transcribed & Extracted');
      btnExtract.disabled = false;

    } else {
      console.error('Transcription error:', result.message);
      alert(`Transcription error: ${result.message || 'Unknown error'}`);
      updateStatus('error', 'Transcription Failed');
    }
  } catch (err) {
    console.error('Failed to send audio to server:', err);
    alert('Failed to connect to transcription service: ' + err.message);
    updateStatus('error', 'Network Error');
  }
}

function renderUtteranceCard(u) {
  const role = (u.role || (u.speaker_label === 'spk:0' ? 'doctor' : 'patient')).toLowerCase();
  const isDoc = role === 'doctor';
  const speakerName = isDoc ? 'Dr. Physician' : 'Patient';

  const timeRange = (u.start && u.end) ? `[${formatOffset(u.start)} - ${formatOffset(u.end)}]` : '';

  const card = document.createElement('div');
  card.className = `utterance-card ${isDoc ? 'doctor' : 'patient'}`;

  card.innerHTML = `
    <div class="utterance-meta">
      <div class="speaker-badge-wrap">
        <span class="speaker-pill">${speakerName}</span>
        ${timeRange ? `<span class="utterance-time-range">${timeRange}</span>` : ''}
      </div>
      <button class="btn-toggle-speaker" title="Switch between Doctor and Patient">
        Switch Role
      </button>
    </div>
    <div class="utterance-text">${escapeHtml(u.text)}</div>
  `;

  // Toggle speaker role listener
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

  dialogueHistory.push({
    speaker: isDoc ? 'doctor' : 'patient',
    text: u.text,
  });
}

function formatOffset(offsetStr) {
  if (!offsetStr) return '00:00';
  const sec = parseFloat(offsetStr.replace('s', '')) || 0;
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
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

  // ScriptProcessor to buffer audio samples
  scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
  source.connect(scriptProcessor);
  scriptProcessor.connect(audioContext.destination);

  scriptProcessor.onaudioprocess = (e) => {
    if (!isRecording) return;
    const inputData = e.inputBuffer.getChannelData(0);
    recordedAudioChunks.push(new Float32Array(inputData));
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
// 16kHz Mono WAV Encoder
// ---------------------------------------------------------------------------
function encodeWav(samples, sampleRate = 16000) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  // RIFF chunk
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, 'WAVE');

  // fmt chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // Linear PCM
  view.setUint16(22, 1, true); // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // Byte rate
  view.setUint16(32, 2, true); // Block align
  view.setUint16(34, 16, true); // 16-bit

  // data chunk
  writeString(view, 36, 'data');
  view.setUint32(40, samples.length * 2, true);

  // Write 16-bit PCM audio samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
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
// Manual Input & Text Handling
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
}

function appendDialogueLine(text, forcedSpeaker = null) {
  if (welcomeMessage) {
    welcomeMessage.style.display = 'none';
  }

  let speaker = forcedSpeaker;
  let cleanText = text;

  if (!speaker) {
    const lower = text.toLowerCase();
    if (lower.startsWith('doctor:') || lower.startsWith('dr:')) {
      speaker = 'doctor';
      cleanText = text.replace(/^(doctor|dr):/i, '').trim();
    } else if (lower.startsWith('patient:')) {
      speaker = 'patient';
      cleanText = text.replace(/^patient:/i, '').trim();
    } else {
      const docKeywords = ['prescribe', 'take', 'twice', 'daily', 'mg', 'diagnosis', 'symptom', 'how long'];
      const isDoc = docKeywords.some(kw => lower.includes(kw));
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
        <span class="utterance-time-range">${timeStr}</span>
      </div>
      <button class="btn-toggle-speaker" title="Switch between Doctor and Patient">
        Switch Role
      </button>
    </div>
    <div class="utterance-text">${escapeHtml(cleanText)}</div>
  `;

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

  dialogueHistory.push({ speaker, text: cleanText });
  btnExtract.disabled = false;
}

// ---------------------------------------------------------------------------
// Manual Extraction Action (Gemini 3.5 Flash Lite)
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
  } else {
    symptomsContainer.innerHTML = '<p class="empty-state">No symptoms reported.</p>';
    printSymptoms.innerHTML = 'None reported';
  }

  // 2. Duration
  if (keywords.duration) {
    textDuration.textContent = keywords.duration;
    textDuration.classList.remove('empty-state');
    printDuration.textContent = keywords.duration;
  } else {
    textDuration.textContent = 'Not specified';
    textDuration.classList.add('empty-state');
    printDuration.textContent = 'Not specified';
  }

  // 3. Diagnosis / Root Cause
  if (keywords.root_cause) {
    textDiagnosis.textContent = keywords.root_cause;
    textDiagnosis.classList.remove('empty-state');
    printDiagnosis.textContent = keywords.root_cause;
  } else {
    textDiagnosis.textContent = 'None explicitly diagnosed';
    textDiagnosis.classList.add('empty-state');
    printDiagnosis.textContent = 'None explicitly diagnosed';
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
        <strong>${escapeHtml(p.drug)}</strong> — ${escapeHtml(p.dose || '')} (${escapeHtml(p.frequency || '')})
      </div>
    `).join('');
  } else {
    prescriptionsContainer.innerHTML = '<p class="empty-state">No prescriptions issued.</p>';
    printPrescriptions.innerHTML = 'None issued';
  }

  // 5. Advice / Next Steps
  if (keywords.advice && keywords.advice.length > 0) {
    adviceContainer.innerHTML = `
      <ul class="advice-bullet-list">
        ${keywords.advice.map(a => `<li>${escapeHtml(a)}</li>`).join('')}
      </ul>
    `;
    printAdvice.innerHTML = keywords.advice.map(a => `✔ ${escapeHtml(a)}`).join('<br>');
  } else {
    adviceContainer.innerHTML = '<p class="empty-state">No specific advice given.</p>';
    printAdvice.innerHTML = 'None';
  }
}

// ---------------------------------------------------------------------------
// Reset / Clear
// ---------------------------------------------------------------------------
btnClear.addEventListener('click', async () => {
  if (confirm('Clear the current consultation dialogue and clinical summary?')) {
    dialogueHistory = [];
    resetDialogueFeed();

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
  symptomsContainer.innerHTML = '<p class="empty-state">No symptoms extracted yet. Record or upload dialogue to extract.</p>';
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

