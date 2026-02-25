// EchoBrief Background Service Worker
// Uses getMediaStreamId + offscreen document for tab capture (MV3 compatible)

const ECHOBRIEF_API_URL = 'https://qjhysesjocanowmdkeme.supabase.co/functions/v1';
const MEETING_URL_PATTERNS = [
  /^https:\/\/meet\.google\.com\/.+/,
  /^https:\/\/.*\.zoom\.us\/wc\/.+/,
  /^https:\/\/.*\.zoom\.us\/j\/.+/
];

let recordingState = {
  isRecording: false,
  tabId: null,
  meetingId: null,
  startTime: null,
  meetingTitle: '',
  meetingUrl: ''
};

function isMeetingUrl(url) {
  return MEETING_URL_PATTERNS.some((p) => p.test(url));
}

function getMeetingTitle(url) {
  try {
    const u = new URL(url);
    if (u.hostname === 'meet.google.com') return `Google Meet - ${u.pathname.slice(1)}`;
    if (u.hostname.includes('zoom.us')) return `Zoom Meeting - ${u.pathname.split('/').pop()}`;
  } catch (e) {}
  return 'Meeting Recording';
}

// Listen for tab updates - show notification only (no auto-start; requires user gesture)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab?.url && isMeetingUrl(tab.url) && !recordingState.isRecording) {
    chrome.tabs.sendMessage(tabId, {
      type: 'MEETING_DETECTED',
      url: tab.url,
      title: getMeetingTitle(tab.url)
    }).catch(() => {});
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (recordingState.tabId === tabId && recordingState.isRecording) {
    stopRecording();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'GET_RECORDING_STATUS':
      sendResponse({
        isRecording: recordingState.isRecording,
        meetingTitle: recordingState.meetingTitle,
        duration: recordingState.startTime
          ? Math.floor((Date.now() - recordingState.startTime) / 1000)
          : 0
      });
      break;

    case 'START_RECORDING':
      if (sender.tab) {
        startRecordingFromTab(sender.tab.id, sender.tab.url).then(sendResponse).catch((err) => {
          sendResponse({ error: err.message });
        });
      }
      return true;

    case 'START_RECORDING_WITH_STREAM_ID':
      startRecordingWithStreamId(message).then(sendResponse).catch((err) => {
        sendResponse({ error: err.message });
      });
      return true;

    case 'STOP_RECORDING':
      stopRecording();
      sendResponse({ success: true });
      break;

    case 'SET_AUTH_TOKEN':
      chrome.storage.local.set({ authToken: message.token });
      sendResponse({ success: true });
      break;

    case 'RECORDING_COMPLETED':
    case 'RECORDING_FAILED': {
      const tabId = recordingState.tabId;
      resetState();
      if (tabId) {
        chrome.tabs.sendMessage(tabId, {
          type: message.type === 'RECORDING_COMPLETED' ? 'RECORDING_UPLOADED' : 'RECORDING_ERROR',
          error: message.type === 'RECORDING_FAILED' ? 'Recording failed' : undefined,
          meetingId: message.meetingId
        }).catch(() => {});
      }
      break;
    }

    case 'CLOSE_OFFSCREEN':
      chrome.offscreen.hasDocument().then((has) => {
        if (has) chrome.offscreen.closeDocument();
      }).catch(() => {});
      break;
  }
  return true;
});

async function startRecordingFromTab(tabId, url) {
  if (recordingState.isRecording) return { error: 'Already recording' };
  if (!isMeetingUrl(url)) return { error: 'Not a meeting page' };

  const { authToken } = await chrome.storage.local.get('authToken');
  if (!authToken) return { error: 'Please log in to EchoBrief first' };

  let streamId;
  try {
    streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });
  } catch (err) {
    return { error: err.message || 'Tab capture not available. Make sure the meeting tab is active and you have not already granted capture to another app.' };
  }

  await startRecordingWithStreamId({ streamId, tabId, url });
  return { success: true };
}

async function startRecordingWithStreamId({ streamId, tabId, url }) {
  if (recordingState.isRecording) return;

  const meetingTitle = getMeetingTitle(url);
  recordingState = {
    isRecording: true,
    tabId,
    meetingId: null,
    startTime: Date.now(),
    meetingTitle,
    meetingUrl: url
  };

  const hasOffscreen = await chrome.offscreen.hasDocument();
  if (!hasOffscreen) {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Recording meeting audio via tabCapture'
    });
  }

  const { authToken } = await chrome.storage.local.get('authToken');

  chrome.runtime.sendMessage({
    target: 'offscreen',
    type: 'start-recording',
    data: { streamId, meetingTitle, meetingUrl: url, authToken }
  }).catch((err) => {
    console.error('Failed to start offscreen recording:', err);
    resetState();
    if (tabId) chrome.tabs.sendMessage(tabId, { type: 'RECORDING_ERROR', error: err.message }).catch(() => {});
  });

  chrome.tabs.sendMessage(tabId, { type: 'RECORDING_STARTED', title: meetingTitle }).catch(() => {});
}

function stopRecording() {
  if (!recordingState.isRecording) return;

  const tabId = recordingState.tabId;
  chrome.runtime.sendMessage({ target: 'offscreen', type: 'stop-recording' }).catch(() => {});
  chrome.tabs.sendMessage(tabId, { type: 'RECORDING_STOPPED' }).catch(() => {});
  resetState();
}

function resetState() {
  recordingState = {
    isRecording: false,
    tabId: null,
    meetingId: null,
    startTime: null,
    meetingTitle: '',
    meetingUrl: ''
  };
}
