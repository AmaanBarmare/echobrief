// Minimal bridge for the EchoBrief web app
// Allows the web app to detect the extension and exchange messages
// No recording UI — that only runs on meeting pages via content.js

function isExtensionContextValid() {
  try { return !!chrome.runtime?.id; } catch { return false; }
}

if (isExtensionContextValid()) {
  // Marker so the web app can detect the extension is installed
  const marker = document.createElement('div');
  marker.id = 'echobrief-extension-marker';
  marker.style.display = 'none';
  marker.dataset.extensionId = chrome.runtime.id;
  document.body.appendChild(marker);

  // Relay messages between the web app and the extension
  window.addEventListener('message', (event) => {
    if (event.source !== window || !isExtensionContextValid()) return;

    if (event.data?.type === 'ECHOBRIEF_EXTENSION_PING') {
      window.postMessage({
        type: 'ECHOBRIEF_EXTENSION_PONG',
        extensionId: chrome.runtime.id
      }, '*');
    }

    if (event.data?.type === 'ECHOBRIEF_GET_STATUS') {
      try {
        chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATUS' }, (response) => {
          window.postMessage({
            type: 'ECHOBRIEF_STATUS_RESPONSE',
            status: response || { isRecording: false }
          }, '*');
        });
      } catch {
        window.postMessage({
          type: 'ECHOBRIEF_STATUS_RESPONSE',
          status: { isRecording: false }
        }, '*');
      }
    }

    if (event.data?.type === 'ECHOBRIEF_SET_TOKEN' && event.data.token) {
      try {
        chrome.runtime.sendMessage({ type: 'SET_AUTH_TOKEN', token: event.data.token });
      } catch {}
    }
  });
}
