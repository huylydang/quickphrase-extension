/**
 * QuickPhrase — Popup Script
 * Shows API status and provides Settings link.
 */

document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const providerInfo = document.getElementById('provider-info');
  const btnSettings = document.getElementById('btn-settings');

  // Load settings and check status
  chrome.storage.sync.get(null, (data) => {
    const provider = data.provider || 'gemini';
    const model = data.model || '—';
    const hasKey = Boolean(data.apiKey);

    if (hasKey) {
      statusDot.className = 'status-dot connected';
      statusText.textContent = 'Connected';
      providerInfo.textContent = `${capitalize(provider)} · ${model}`;
    } else {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = 'No API Key';
      providerInfo.textContent = 'Configure your API key in Settings';
    }
  });

  // Open settings
  btnSettings.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
});

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
