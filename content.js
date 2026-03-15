/**
 * QuickPhrase — Content Script
 * Handles popup rendering (Shadow DOM), Replace, and Copy actions.
 */

(() => {
  // ─── State ──────────────────────────────────────────────────────────────────

  let popupHost = null;
  let shadowRoot = null;
  let savedSelection = null;
  let savedRange = null;
  let savedSelectionRect = null;
  let savedActiveElement = null;
  let savedInputStart = 0;
  let savedInputEnd = 0;
  let mouseX = 0;
  let mouseY = 0;

  // Track mouse position for popup placement
  document.addEventListener('mouseup', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }, true);

  // Close popup on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') removePopup();
  });

  // Save selection before context menu appears (right-click clears selection in some browsers)
  document.addEventListener('mousedown', (e) => {
    if (e.button === 2) { // right-click
      saveCurrentSelection();
    }
  }, true);

  // ─── Message Listener ─────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'QUICKPHRASE_LOADING':
        showLoadingPopup();
        break;

      case 'QUICKPHRASE_RESULT':
        showResultPopup(message.variants, message.originalText);
        break;

      case 'QUICKPHRASE_ERROR':
        showErrorPopup(message.message, message.error);
        break;
    }
    sendResponse({ received: true });
  });

  // ─── Selection Management ─────────────────────────────────────────────────

  function saveCurrentSelection() {
    // First check if the active element is an input/textarea with selected text
    const active = getActiveElement();
    if (active && (active.tagName === 'TEXTAREA' || (active.tagName === 'INPUT' && active.type === 'text'))) {
      const start = active.selectionStart;
      const end = active.selectionEnd;
      if (start !== end) {
        savedActiveElement = active;
        savedInputStart = start;
        savedInputEnd = end;
        savedRange = null;
        // Use the input element's rect as anchor
        savedSelectionRect = active.getBoundingClientRect();
        return;
      }
    }

    // Otherwise, handle normal DOM selection (contenteditable, regular text)
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && sel.toString().trim()) {
      savedSelection = sel;
      savedRange = sel.getRangeAt(0).cloneRange();
      savedActiveElement = null;
      // Save the exact bounding rect of the selected text
      savedSelectionRect = savedRange.getBoundingClientRect();
    }
  }

  function getActiveElement() {
    let el = document.activeElement;
    // Traverse shadow DOMs
    while (el && el.shadowRoot && el.shadowRoot.activeElement) {
      el = el.shadowRoot.activeElement;
    }
    return el;
  }

  function isEditable() {
    const active = getActiveElement();
    if (!active) return false;

    // Standard inputs
    if (active.tagName === 'INPUT' && active.type === 'text') return true;
    if (active.tagName === 'TEXTAREA') return true;

    // Content editable
    if (active.isContentEditable) return true;

    // Check if selection is inside a contenteditable
    if (savedRange) {
      let node = savedRange.commonAncestorContainer;
      while (node && node !== document) {
        if (node.isContentEditable) return true;
        if (node.tagName === 'TEXTAREA' || (node.tagName === 'INPUT' && node.type === 'text')) return true;
        node = node.parentNode;
      }
    }

    return false;
  }

  // ─── Popup Creation ───────────────────────────────────────────────────────

  function createPopupHost() {
    removePopup();

    popupHost = document.createElement('div');
    popupHost.id = 'quickphrase-host';
    popupHost.style.cssText = 'all: initial; position: fixed; z-index: 2147483647; pointer-events: none;';
    document.body.appendChild(popupHost);

    shadowRoot = popupHost.attachShadow({ mode: 'closed' });

    // Inject styles into shadow DOM
    const style = document.createElement('style');
    style.textContent = getPopupStyles();
    shadowRoot.appendChild(style);

    return shadowRoot;
  }

  function positionPopup(container) {
    const gap = 6;
    const margin = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pw = 360;
    const ph = container.offsetHeight || 300;

    // Anchor rect: selected text or fallback to mouse point
    const r = (savedSelectionRect && (savedSelectionRect.width > 0 || savedSelectionRect.height > 0))
      ? savedSelectionRect
      : { left: mouseX, right: mouseX, top: mouseY, bottom: mouseY, width: 0, height: 0 };

    // Available space in each direction from the selection
    const spaceBelow = vh - r.bottom;
    const spaceAbove = r.top;
    const spaceRight = vw - r.right;
    const spaceLeft = r.left;

    let x, y;

    // Step 1: Pick vertical direction (below or above)
    if (spaceBelow >= ph + gap + margin) {
      // Below the text
      y = r.bottom + gap;
      x = r.left + r.width / 2 - pw / 2;
    } else if (spaceAbove >= ph + gap + margin) {
      // Above the text
      y = r.top - ph - gap;
      x = r.left + r.width / 2 - pw / 2;
    } else if (spaceRight >= pw + gap + margin) {
      // Right of the text
      x = r.right + gap;
      y = r.top;
    } else if (spaceLeft >= pw + gap + margin) {
      // Left of the text
      x = r.left - pw - gap;
      y = r.top;
    } else {
      // Fallback: center of viewport
      x = (vw - pw) / 2;
      y = (vh - ph) / 2;
    }

    // Step 2: Clamp to viewport (never go off-screen)
    if (x < margin) x = margin;
    if (y < margin) y = margin;
    if (x + pw > vw - margin) x = vw - pw - margin;
    if (y + ph > vh - margin) y = vh - ph - margin;

    container.style.left = `${x}px`;
    container.style.top = `${y}px`;
  }

  // ─── Loading State ────────────────────────────────────────────────────────

  function showLoadingPopup() {
    const root = createPopupHost();

    const container = document.createElement('div');
    container.className = 'qp-popup';
    container.innerHTML = `
      <div class="qp-header">
        <span class="qp-title">QuickPhrase</span>
        <button class="qp-close" aria-label="Close">✕</button>
      </div>
      <div class="qp-loading">
        <div class="qp-spinner"></div>
        <span>Generating paraphrases...</span>
      </div>
    `;

    root.appendChild(container);
    positionPopup(container);

    container.querySelector('.qp-close').addEventListener('click', removePopup);

    // Animate in
    requestAnimationFrame(() => container.classList.add('qp-visible'));
  }

  // ─── Result Popup ─────────────────────────────────────────────────────────

  function showResultPopup(variants, originalText) {
    const root = createPopupHost();

    const container = document.createElement('div');
    container.className = 'qp-popup';

    const variantsHTML = variants.map((variant, i) => `
      <div class="qp-variant">
        <div class="qp-variant-number">${i + 1}</div>
        <div class="qp-variant-content">
          <p class="qp-variant-text">${escapeHtml(variant)}</p>
          <div class="qp-variant-actions">
            <button class="qp-btn qp-btn-copy" data-index="${i}" title="Copy to clipboard">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              Copy
            </button>
            <button class="qp-btn qp-btn-replace" data-index="${i}" title="Replace selected text">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              Replace
            </button>
          </div>
        </div>
      </div>
    `).join('');

    container.innerHTML = `
      <div class="qp-header">
        <span class="qp-title">QuickPhrase</span>
        <button class="qp-close" aria-label="Close">✕</button>
      </div>
      <div class="qp-variants">${variantsHTML}</div>
    `;

    root.appendChild(container);
    positionPopup(container);

    // Event listeners
    container.querySelector('.qp-close').addEventListener('click', removePopup);

    container.querySelectorAll('.qp-btn-copy').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.index);
        copyToClipboard(variants[idx], btn);
      });
    });

    container.querySelectorAll('.qp-btn-replace').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.dataset.index);
        replaceText(variants[idx]);
        removePopup();
      });
    });

    // Animate in
    requestAnimationFrame(() => container.classList.add('qp-visible'));
  }

  // ─── Error Popup ──────────────────────────────────────────────────────────

  function showErrorPopup(message, errorCode) {
    const root = createPopupHost();

    const container = document.createElement('div');
    container.className = 'qp-popup';

    const isSettingsError = errorCode === 'NO_API_KEY' || errorCode === 'INVALID_KEY';

    container.innerHTML = `
      <div class="qp-header">
        <span class="qp-title">QuickPhrase</span>
        <button class="qp-close" aria-label="Close">✕</button>
      </div>
      <div class="qp-error">
        <div class="qp-error-icon"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#dc2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
        <p class="qp-error-message">${escapeHtml(message)}</p>
        ${isSettingsError ? '<button class="qp-btn qp-btn-settings">Open Settings</button>' : ''}
      </div>
    `;

    root.appendChild(container);
    positionPopup(container);

    container.querySelector('.qp-close').addEventListener('click', removePopup);

    const settingsBtn = container.querySelector('.qp-btn-settings');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_SETTINGS' });
        removePopup();
      });
    }

    requestAnimationFrame(() => container.classList.add('qp-visible'));
  }

  // ─── Actions ──────────────────────────────────────────────────────────────

  async function copyToClipboard(text, button) {
    try {
      await navigator.clipboard.writeText(text);
      // Show success feedback
      const originalHTML = button.innerHTML;
      button.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        Copied!
      `;
      button.classList.add('qp-btn-success');
      setTimeout(() => {
        removePopup();
      }, 600);
    } catch (err) {
      console.warn('QuickPhrase: clipboard write failed', err);
    }
  }

  function replaceText(newText) {
    // Handle input/textarea using saved element and offsets
    if (savedActiveElement && (savedActiveElement.tagName === 'TEXTAREA' || 
        (savedActiveElement.tagName === 'INPUT' && savedActiveElement.type === 'text'))) {
      try {
        savedActiveElement.focus();
        savedActiveElement.selectionStart = savedInputStart;
        savedActiveElement.selectionEnd = savedInputEnd;

        // Try execCommand first for undo support
        if (!document.execCommand('insertText', false, newText)) {
          // Fallback: manual replacement
          const value = savedActiveElement.value;
          savedActiveElement.value = value.slice(0, savedInputStart) + newText + value.slice(savedInputEnd);
          savedActiveElement.selectionStart = savedActiveElement.selectionEnd = savedInputStart + newText.length;
        }

        // Trigger events for React/Vue/etc.
        savedActiveElement.dispatchEvent(new Event('input', { bubbles: true }));
        savedActiveElement.dispatchEvent(new Event('change', { bubbles: true }));
      } catch (err) {
        console.warn('QuickPhrase: input replace failed', err);
      }
      return;
    }

    // Handle contenteditable using savedRange
    if (!savedRange) return;

    try {
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);

      // Try insertText command first (better undo support)
      if (document.execCommand('insertText', false, newText)) {
        return;
      }

      // Fallback: manual range replacement
      savedRange.deleteContents();
      savedRange.insertNode(document.createTextNode(newText));
    } catch (err) {
      console.warn('QuickPhrase: replace failed', err);
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  function removePopup() {
    if (popupHost) {
      // Capture references so the timeout removes the correct element,
      // not a new popup created in the meantime
      const oldHost = popupHost;
      const oldRoot = shadowRoot;
      popupHost = null;
      shadowRoot = null;

      const popup = oldRoot?.querySelector('.qp-popup');
      if (popup) {
        popup.classList.remove('qp-visible');
        popup.classList.add('qp-hiding');
        setTimeout(() => {
          oldHost?.remove();
        }, 200);
      } else {
        oldHost.remove();
      }
    }
  }

  // ─── Utilities ────────────────────────────────────────────────────────────

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ─── Inline Styles (Shadow DOM) ───────────────────────────────────────────

  function getPopupStyles() {
    return `
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap');

      :host {
        all: initial;
      }

      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }

      .qp-popup {
        position: fixed;
        width: 360px;
        max-height: 480px;
        overflow-y: auto;
        background: #ffffff;
        border: 1px solid #e0e0e0;
        border-radius: 16px;
        box-shadow:
          0 24px 48px rgba(0, 0, 0, 0.12),
          0 0 0 1px rgba(0, 0, 0, 0.04);
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 14px;
        color: #1a1a1a;
        pointer-events: auto;
        opacity: 0;
        transform: translateY(8px) scale(0.96);
        transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                    transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        z-index: 2147483647;
      }

      .qp-popup.qp-visible {
        opacity: 1;
        transform: translateY(0) scale(1);
      }

      .qp-popup.qp-hiding {
        opacity: 0;
        transform: translateY(4px) scale(0.98);
        transition-duration: 0.15s;
      }

      .qp-popup::-webkit-scrollbar {
        width: 6px;
      }
      .qp-popup::-webkit-scrollbar-track {
        background: transparent;
      }
      .qp-popup::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,0.12);
        border-radius: 3px;
      }

      /* ─── Header ─── */
      .qp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 16px 12px;
        border-bottom: 1px solid #f0f0f0;
      }

      .qp-title {
        font-weight: 600;
        font-size: 14px;
        color: #111;
        letter-spacing: -0.01em;
      }

      .qp-close {
        width: 28px;
        height: 28px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #f5f5f5;
        border: none;
        border-radius: 8px;
        color: #999;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .qp-close:hover {
        background: #eee;
        color: #333;
      }

      /* ─── Variants ─── */
      .qp-variants {
        padding: 4px 0;
      }

      .qp-variant {
        display: flex;
        gap: 12px;
        padding: 14px 16px;
        border-bottom: 1px solid #f5f5f5;
        transition: background 0.15s ease;
      }
      .qp-variant:last-child {
        border-bottom: none;
      }
      .qp-variant:hover {
        background: #fafafa;
      }

      .qp-variant-number {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #06b6d4, #10b981);
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        color: #fff;
        margin-top: 1px;
      }

      .qp-variant-content {
        flex: 1;
        min-width: 0;
      }

      .qp-variant-text {
        font-size: 13.5px;
        line-height: 1.55;
        color: #333;
        margin-bottom: 10px;
        word-wrap: break-word;
      }

      .qp-variant-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      /* ─── Buttons ─── */
      .qp-btn {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 6px 12px;
        border: none;
        border-radius: 8px;
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s ease;
        white-space: nowrap;
      }

      .qp-btn-copy {
        background: #f5f5f5;
        color: #666;
      }
      .qp-btn-copy:hover {
        background: #eee;
        color: #333;
      }

      .qp-btn-replace {
        background: linear-gradient(135deg, #06b6d4, #10b981);
        color: #fff;
      }
      .qp-btn-replace:hover {
        box-shadow: 0 2px 12px rgba(6, 182, 212, 0.3);
      }

      .qp-btn-success {
        background: #f0fdf4 !important;
        color: #16a34a !important;
      }

      .qp-btn-settings {
        background: linear-gradient(135deg, #06b6d4, #10b981);
        color: #fff;
        padding: 8px 20px;
        border-radius: 10px;
        margin-top: 4px;
      }
      .qp-btn-settings:hover {
        box-shadow: 0 2px 12px rgba(6, 182, 212, 0.3);
      }

      /* ─── Loading ─── */
      .qp-loading {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 14px;
        padding: 32px 16px;
        color: #888;
        font-size: 13px;
      }

      .qp-spinner {
        width: 28px;
        height: 28px;
        border: 3px solid #eee;
        border-top-color: #06b6d4;
        border-radius: 50%;
        animation: qp-spin 0.7s linear infinite;
      }

      @keyframes qp-spin {
        to { transform: rotate(360deg); }
      }

      /* ─── Error ─── */
      .qp-error {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        padding: 28px 20px;
        text-align: center;
      }

      .qp-error-icon {
        font-size: 28px;
      }

      .qp-error-message {
        font-size: 13px;
        line-height: 1.5;
        color: #dc2626;
      }
    `;
  }

})();
