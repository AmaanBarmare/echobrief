// EchoBrief Offscreen Document - Records tab audio via getMediaStreamId
// Runs in extension context, can use getUserMedia with chromeMediaSourceId

const ECHOBRIEF_API_URL = 'https://qjhysesjocanowmdkeme.supabase.co/functions/v1';

let recorderState = {
  stream: null,
  mediaRecorder: null,
  audioChunks: [],
  startTime: null,
  meetingTitle: '',
  meetingUrl: '',
  authToken: null
};

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
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    },
    video: false
  });

  recorderState = {
    stream,
    mediaRecorder: null,
    audioChunks: [],
    startTime: Date.now(),
    meetingTitle,
    meetingUrl,
    authToken
  };

  const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
  recorderState.mediaRecorder = mediaRecorder;

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recorderState.audioChunks.push(e.data);
  };

  mediaRecorder.onstop = () => handleRecordingStopped();

  mediaRecorder.start(1000);
}

function stopRecording() {
  if (recorderState.mediaRecorder && recorderState.mediaRecorder.state !== 'inactive') {
    recorderState.mediaRecorder.stop();
  }
  if (recorderState.stream) {
    recorderState.stream.getTracks().forEach((t) => t.stop());
  }
}

function requestClose() {
  chrome.runtime.sendMessage({ type: 'CLOSE_OFFSCREEN' }).catch(() => {});
}

async function handleRecordingStopped() {
  const authToken = recorderState.authToken;
  if (!authToken) {
    chrome.runtime.sendMessage({ type: 'RECORDING_FAILED' }).catch(() => {});
    requestClose();
    return;
  }

  const audioBlob = new Blob(recorderState.audioChunks, { type: 'audio/webm' });
  const durationSeconds = Math.floor((Date.now() - recorderState.startTime) / 1000);

  if (audioBlob.size < 1000 || durationSeconds < 5) {
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
    requestClose();
  }
}
