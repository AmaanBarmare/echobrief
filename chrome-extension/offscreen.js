// EchoBrief Offscreen Document - Records tab audio (+ microphone when available)
// Runs in extension context, can use getUserMedia with chromeMediaSourceId
// Sends periodic heartbeat to keep the background service worker alive

const ECHOBRIEF_API_URL = 'https://qjhysesjocanowmdkeme.supabase.co/functions/v1';
const HEARTBEAT_INTERVAL_MS = 20000;
const CHUNK_FLUSH_COUNT = 30; // Flush to IndexedDB every ~30 seconds of audio
const IDB_NAME = 'echobrief-audio';
const IDB_STORE = 'chunks';

let recorderState = {
  stream: null,
  tabPlayback: null,
  micStream: null,
  audioContext: null,
  mediaRecorder: null,
  chunkBuffer: [],   // Small in-memory buffer, flushed periodically
  chunkIndex: 0,     // Monotonic index for ordering chunks in IndexedDB
  startTime: null,
  meetingTitle: '',
  meetingUrl: '',
  authToken: null
};

// --- IndexedDB helpers (moves audio data off the JS heap to disk) ---

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function flushChunks(chunks, startIndex) {
  if (chunks.length === 0) return;
  const db = await openDB();
  const tx = db.transaction(IDB_STORE, 'readwrite');
  const store = tx.objectStore(IDB_STORE);
  for (let i = 0; i < chunks.length; i++) {
    store.put({ id: startIndex + i, data: chunks[i] });
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function getAllChunks() {
  const db = await openDB();
  const tx = db.transaction(IDB_STORE, 'readonly');
  const store = tx.objectStore(IDB_STORE);
  const req = store.getAll();
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      db.close();
      const rows = req.result.sort((a, b) => a.id - b.id);
      resolve(rows.map((r) => r.data));
    };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function clearChunks() {
  const db = await openDB();
  const tx = db.transaction(IDB_STORE, 'readwrite');
  tx.objectStore(IDB_STORE).clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

let heartbeatInterval = null;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(() => {
    chrome.runtime.sendMessage({ type: 'OFFSCREEN_HEARTBEAT' }).catch(() => {});
  }, HEARTBEAT_INTERVAL_MS);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'start-recording') {
    startRecording(message.data).then(sendResponse).catch((err) => {
      console.error('Offscreen start error:', err);
      sendResponse({ error: err.message });
    });
    return true;
  }

  if (message.type === 'stop-recording') {
    stopRecording();
    sendResponse({ ok: true });
    return false;
  }
});

async function startRecording({ streamId, meetingTitle, meetingUrl, authToken }) {
  const tabStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  // tabCapture mutes the tab by default; pipe audio back to speakers
  // so the user can still hear the meeting while recording.
  const tabPlayback = new Audio();
  tabPlayback.srcObject = tabStream;
  tabPlayback.play().catch(() => {});

  let recordingStream = tabStream;
  let micStream = null;
  let audioContext = null;

  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false
    });

    audioContext = new AudioContext();
    const dest = audioContext.createMediaStreamDestination();
    audioContext.createMediaStreamSource(tabStream).connect(dest);
    audioContext.createMediaStreamSource(micStream).connect(dest);
    recordingStream = dest.stream;
    console.log('[EchoBrief] Microphone captured successfully; recording tab + mic audio');
  } catch (err) {
    console.warn('[EchoBrief] Microphone NOT available, recording tab audio only:', err.name, err.message);
    chrome.runtime.sendMessage({ type: 'MIC_PERMISSION_FAILED', error: err.name }).catch(() => {});
  }

  // Clear any stale chunks from a previous recording
  await clearChunks().catch(() => {});

  recorderState = {
    stream: tabStream,
    tabPlayback,
    micStream,
    audioContext,
    mediaRecorder: null,
    chunkBuffer: [],
    chunkIndex: 0,
    startTime: Date.now(),
    meetingTitle,
    meetingUrl,
    authToken
  };

  const mediaRecorder = new MediaRecorder(recordingStream, { mimeType: 'audio/webm;codecs=opus' });
  recorderState.mediaRecorder = mediaRecorder;

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recorderState.chunkBuffer.push(e.data);
      // Flush to IndexedDB periodically to keep JS heap small
      if (recorderState.chunkBuffer.length >= CHUNK_FLUSH_COUNT) {
        const toFlush = recorderState.chunkBuffer;
        const startIdx = recorderState.chunkIndex;
        recorderState.chunkBuffer = [];
        recorderState.chunkIndex += toFlush.length;
        flushChunks(toFlush, startIdx).catch((err) => {
          console.error('[EchoBrief] Failed to flush audio chunks to IndexedDB:', err);
        });
      }
    }
  };

  mediaRecorder.onstop = () => handleRecordingStopped();

  mediaRecorder.onerror = (event) => {
    console.error('MediaRecorder error:', event.error);
    stopHeartbeat();
    cleanupStreams();
    clearChunks().catch(() => {});
    chrome.runtime.sendMessage({ type: 'RECORDING_FAILED' }).catch(() => {});
    requestClose();
  };

  // If the tab's audio track ends (e.g. tab navigated away), stop gracefully
  tabStream.getTracks().forEach((track) => {
    track.addEventListener('ended', () => {
      console.warn('Tab audio track ended unexpectedly');
      if (recorderState.mediaRecorder && recorderState.mediaRecorder.state === 'recording') {
        recorderState.mediaRecorder.stop();
      }
    });
  });

  mediaRecorder.start(1000);
  startHeartbeat();
}

function stopRecording() {
  stopHeartbeat();
  if (recorderState.mediaRecorder && recorderState.mediaRecorder.state !== 'inactive') {
    recorderState.mediaRecorder.stop();
  }
  // Stream cleanup happens in handleRecordingStopped after final data is captured
}

function cleanupStreams() {
  if (recorderState.tabPlayback) {
    recorderState.tabPlayback.pause();
    recorderState.tabPlayback.srcObject = null;
    recorderState.tabPlayback = null;
  }
  if (recorderState.stream) {
    recorderState.stream.getTracks().forEach((t) => t.stop());
  }
  if (recorderState.micStream) {
    recorderState.micStream.getTracks().forEach((t) => t.stop());
  }
  if (recorderState.audioContext) {
    recorderState.audioContext.close().catch(() => {});
  }
}

function requestClose() {
  chrome.runtime.sendMessage({ type: 'CLOSE_OFFSCREEN' }).catch(() => {});
}

async function handleRecordingStopped() {
  stopHeartbeat();
  cleanupStreams();

  const authToken = recorderState.authToken;
  if (!authToken) {
    await clearChunks().catch(() => {});
    chrome.runtime.sendMessage({ type: 'RECORDING_FAILED' }).catch(() => {});
    requestClose();
    return;
  }

  // Flush any remaining in-memory chunks to IndexedDB
  if (recorderState.chunkBuffer.length > 0) {
    await flushChunks(recorderState.chunkBuffer, recorderState.chunkIndex).catch((err) => {
      console.error('[EchoBrief] Failed to flush final chunks:', err);
    });
    recorderState.chunkBuffer = [];
  }

  // Read all chunks back from IndexedDB (disk-backed, not in JS heap)
  let allChunks;
  try {
    allChunks = await getAllChunks();
  } catch (err) {
    console.error('[EchoBrief] Failed to read chunks from IndexedDB:', err);
    await clearChunks().catch(() => {});
    chrome.runtime.sendMessage({ type: 'RECORDING_FAILED' }).catch(() => {});
    requestClose();
    return;
  }

  const audioBlob = new Blob(allChunks, { type: 'audio/webm' });
  const durationSeconds = Math.floor((Date.now() - recorderState.startTime) / 1000);

  if (audioBlob.size < 1000 || durationSeconds < 5) {
    await clearChunks().catch(() => {});
    chrome.runtime.sendMessage({ type: 'RECORDING_FAILED' }).catch(() => {});
    requestClose();
    return;
  }

  try {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    formData.append('title', recorderState.meetingTitle);
    formData.append('source', 'chrome-extension');
    formData.append('meeting_url', recorderState.meetingUrl);
    formData.append('duration_seconds', durationSeconds.toString());

    const response = await fetch(`${ECHOBRIEF_API_URL}/upload-recording`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: formData
    });

    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);

    const result = await response.json();
    chrome.runtime.sendMessage({ type: 'RECORDING_COMPLETED', meetingId: result.meetingId }).catch(() => {});
  } catch (err) {
    console.error('Upload error:', err);
    chrome.runtime.sendMessage({ type: 'RECORDING_FAILED' }).catch(() => {});
  } finally {
    await clearChunks().catch(() => {});
    requestClose();
  }
}
