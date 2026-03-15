/**
 * QuickPhrase — Background Service Worker
 * Handles context menu setup, API calls, and message routing.
 * Uses the new array-based styles system from storage.
 */

import { generateParaphrases, testConnection, DEFAULT_SETTINGS } from './lib/providers.js';

// ─── Context Menu Setup ─────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(() => {
  // Initialize default settings if not set
  chrome.storage.sync.get(null, (data) => {
    if (!data.provider) {
      chrome.storage.sync.set(DEFAULT_SETTINGS);
    }
    buildContextMenus(data.styles || DEFAULT_SETTINGS.styles);
  });
});

// Rebuild context menu whenever settings change (e.g. styles added/removed)
chrome.storage.onChanged.addListener((changes) => {
  if (changes.styles) {
    const newStyles = changes.styles.newValue || DEFAULT_SETTINGS.styles;
    buildContextMenus(newStyles);
  }
});

function buildContextMenus(styles) {
  chrome.contextMenus.removeAll(() => {
    // Primary quick action (uses default style)
    chrome.contextMenus.create({
      id: 'quickphrase-quick',
      title: 'QuickPhrase',
      contexts: ['selection'],
    });

    // Style submenu parent
    chrome.contextMenus.create({
      id: 'quickphrase-styles',
      title: 'QuickPhrase with Style',
      contexts: ['selection'],
    });

    // Dynamic style submenu items from user's styles
    styles.forEach((style) => {
      chrome.contextMenus.create({
        id: `quickphrase-style-${style.id}`,
        parentId: 'quickphrase-styles',
        title: `${style.title || 'Untitled'}`,
        contexts: ['selection'],
      });
    });
  });
}

// ─── Context Menu Click Handler ─────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const menuId = info.menuItemId;
  const selectedText = info.selectionText;

  if (!selectedText) return;

  // Determine which style was clicked
  let styleId = null;

  if (menuId === 'quickphrase-quick') {
    styleId = null; // will use default
  } else if (menuId === 'quickphrase-styles') {
    return; // parent menu, ignore
  } else if (typeof menuId === 'string' && menuId.startsWith('quickphrase-style-')) {
    styleId = menuId.replace('quickphrase-style-', '');
  } else {
    return; // not our menu
  }

  try {
    // Send loading state to content script
    await sendToTab(tab.id, { type: 'QUICKPHRASE_LOADING' });

    // Get settings
    const settings = await getSettings();

    if (!settings.apiKey) {
      await sendToTab(tab.id, {
        type: 'QUICKPHRASE_ERROR',
        error: 'NO_API_KEY',
        message: 'No API key configured. Click to open Settings.',
      });
      return;
    }

    // Resolve the style instruction
    const styles = settings.styles || DEFAULT_SETTINGS.styles;
    const targetStyleId = styleId || settings.defaultStyleId || 'default';
    const style = styles.find(s => s.id === targetStyleId) || styles[0];
    const styleInstruction = style?.instruction || '';

    // If a specific style was selected from submenu, optionally save as new default
    if (styleId && styleId !== settings.defaultStyleId) {
      await chrome.storage.sync.set({ defaultStyleId: styleId });
    }

    // Generate paraphrases
    const variants = await generateParaphrases(settings, selectedText, styleInstruction);

    // Send results to content script
    await sendToTab(tab.id, {
      type: 'QUICKPHRASE_RESULT',
      variants,
      originalText: selectedText,
    });

  } catch (error) {
    const errorInfo = getErrorInfo(error);
    await sendToTab(tab.id, {
      type: 'QUICKPHRASE_ERROR',
      error: errorInfo.code,
      message: errorInfo.message,
    });
  }
});

// ─── Message Handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TEST_CONNECTION') {
    // Use settings from the message (current form values) if provided
    const settingsPromise = message.settings
      ? Promise.resolve({ ...DEFAULT_SETTINGS, ...message.settings })
      : getSettings();

    settingsPromise.then(settings => {
      return testConnection(settings);
    }).then(result => {
      sendResponse(result);
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true; // async response
  }

  if (message.type === 'OPEN_SETTINGS') {
    chrome.runtime.openOptionsPage();
    sendResponse({ ok: true });
    return false;
  }
});

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (data) => {
      resolve({ ...DEFAULT_SETTINGS, ...data });
    });
  });
}

async function sendToTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js'],
      });
      await chrome.tabs.sendMessage(tabId, message);
    } catch {
      console.warn('QuickPhrase: Cannot communicate with this page.');
    }
  }
}

function getErrorInfo(error) {
  const message = error.message || '';

  if (message === 'NO_API_KEY') {
    return { code: 'NO_API_KEY', message: 'No API key configured. Click to open Settings.' };
  }
  if (message === 'RATE_LIMIT') {
    return { code: 'RATE_LIMIT', message: 'Rate limit reached. Try again in a moment.' };
  }
  if (message === 'INVALID_KEY') {
    return { code: 'INVALID_KEY', message: 'API key is invalid. Check your Settings.' };
  }
  if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
    return { code: 'NETWORK', message: 'Connection failed. Check your internet connection.' };
  }
  return { code: 'UNKNOWN', message: message || 'An unexpected error occurred.' };
}
