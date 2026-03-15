/**
 * QuickPhrase — Settings Page Logic
 * Handles API config, unlimited editable styles, and general settings.
 */

// ─── Model Options ──────────────────────────────────────────────────────────

const MODEL_OPTIONS = {
  gemini: [
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash (Recommended)' },
    { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite (Free)' },
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
  groq: [
    { value: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Free)' },
    { value: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Free)' },
    { value: 'gemma2-9b-it', label: 'Gemma 2 9B' },
    { value: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B' },
  ],
  openai: [
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano (Cheapest)' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
  ],
  custom: [
    { value: 'custom', label: 'Custom Model (enter name)' },
  ],
};

const API_HINTS = {
  gemini: 'Get your key at <a href="https://aistudio.google.com/apikey" target="_blank">aistudio.google.com/apikey</a>',
  groq: 'Get your key at <a href="https://console.groq.com/keys" target="_blank">console.groq.com/keys</a>',
  openai: 'Get your key at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys</a>',
  custom: 'Enter the API key for your custom endpoint',
};

// ─── Default Styles ─────────────────────────────────────────────────────────

const BUILT_IN_STYLES = [
  { id: 'default', title: 'Default', instruction: 'Paraphrase naturally, no special constraints.' },
  { id: 'formal', title: 'Formal', instruction: 'Use formal, polished, and respectful language.' },
  { id: 'professional', title: 'Professional', instruction: 'Use clear, concise, professional language suitable for a work environment.' },
  { id: 'native', title: 'Native', instruction: 'Rephrase as a native English speaker would naturally say it.' },
];

const DEFAULT_SETTINGS = {
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-2.5-flash',
  customEndpoint: '',
  defaultStyleId: 'native',
  styles: BUILT_IN_STYLES,
  outputLanguage: 'auto',
};

// ─── State ──────────────────────────────────────────────────────────────────

let currentStyles = [];
let defaultStyleId = 'native';

// ─── DOM Elements ───────────────────────────────────────────────────────────

const els = {
  provider: document.getElementById('provider'),
  apiKey: document.getElementById('api-key'),
  toggleKey: document.getElementById('toggle-key'),
  apiHint: document.getElementById('api-hint'),
  model: document.getElementById('model'),
  customEndpointField: document.getElementById('custom-endpoint-field'),
  customEndpoint: document.getElementById('custom-endpoint'),
  stylesList: document.getElementById('styles-list'),
  btnAddStyle: document.getElementById('btn-add-style'),
  outputLanguage: document.getElementById('output-language'),
  btnTest: document.getElementById('btn-test'),
  testText: document.getElementById('test-text'),
  testResult: document.getElementById('test-result'),
  btnSave: document.getElementById('btn-save'),
  saveStatus: document.getElementById('save-status'),
};

// ─── Load Settings ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  chrome.storage.sync.get(null, (data) => {
    const settings = { ...DEFAULT_SETTINGS, ...data };

    els.provider.value = settings.provider;
    els.apiKey.value = settings.apiKey;
    els.customEndpoint.value = settings.customEndpoint || '';
    els.outputLanguage.value = settings.outputLanguage;

    updateProviderUI(settings.provider, settings.model);

    // Load styles
    currentStyles = settings.styles && settings.styles.length > 0
      ? settings.styles
      : [...BUILT_IN_STYLES];
    defaultStyleId = settings.defaultStyleId || 'default';

    renderStyles();
  });
});

// ─── Provider ───────────────────────────────────────────────────────────────

els.provider.addEventListener('change', () => {
  updateProviderUI(els.provider.value);
  clearTestResult();
});

function updateProviderUI(provider, selectedModel) {
  const models = MODEL_OPTIONS[provider] || [];
  els.model.innerHTML = models.map(m =>
    `<option value="${m.value}">${m.label}</option>`
  ).join('');

  if (selectedModel && models.some(m => m.value === selectedModel)) {
    els.model.value = selectedModel;
  }

  els.customEndpointField.style.display = provider === 'custom' ? 'block' : 'none';
  els.apiHint.innerHTML = API_HINTS[provider] || '';
}

// ─── Styles Manager ─────────────────────────────────────────────────────────

function renderStyles() {
  els.stylesList.innerHTML = '';

  currentStyles.forEach((style, index) => {
    const isDefault = style.id === defaultStyleId;
    const item = document.createElement('div');
    item.className = `style-item${isDefault ? ' is-default' : ''}`;
    item.dataset.index = index;

    item.innerHTML = `
      <div class="style-item-header">
        <input type="text" class="style-title-input" value="${escapeHtml(style.title)}" placeholder="Style name" data-field="title">
        ${isDefault ? '<span class="default-badge">Default</span>' : ''}
        <div class="style-item-actions">
          ${!isDefault ? `<button class="btn-set-default" title="Set as default" data-index="${index}">&#9733;</button>` : ''}
          <button class="btn-delete" title="Delete style" data-index="${index}">&times;</button>
        </div>
      </div>
      <textarea class="style-instruction" placeholder="Describe the style... e.g., 'Write in a friendly, casual Slack tone'" data-field="instruction">${escapeHtml(style.instruction)}</textarea>
    `;

    // Title change
    const titleInput = item.querySelector('.style-title-input');
    titleInput.addEventListener('input', () => {
      currentStyles[index].title = titleInput.value;
    });

    // Instruction change
    const textarea = item.querySelector('.style-instruction');
    textarea.addEventListener('input', () => {
      currentStyles[index].instruction = textarea.value;
    });

    // Set as default
    const setDefaultBtn = item.querySelector('.btn-set-default');
    if (setDefaultBtn) {
      setDefaultBtn.addEventListener('click', () => {
        defaultStyleId = currentStyles[index].id;
        renderStyles();
      });
    }

    // Delete
    const deleteBtn = item.querySelector('.btn-delete');
    deleteBtn.addEventListener('click', () => {
      if (currentStyles.length <= 1) return; // keep at least one
      const wasDefault = currentStyles[index].id === defaultStyleId;
      currentStyles.splice(index, 1);
      if (wasDefault && currentStyles.length > 0) {
        defaultStyleId = currentStyles[0].id;
      }
      renderStyles();
    });

    els.stylesList.appendChild(item);
  });
}

// Add new style
els.btnAddStyle.addEventListener('click', () => {
  const id = 'custom_' + Date.now();
  currentStyles.push({
    id,
    title: '',
    instruction: '',
  });
  renderStyles();

  // Focus the new title input
  const inputs = els.stylesList.querySelectorAll('.style-title-input');
  const lastInput = inputs[inputs.length - 1];
  if (lastInput) lastInput.focus();
});

// ─── Toggle Key Visibility ──────────────────────────────────────────────────

let keyVisible = false;
els.toggleKey.addEventListener('click', () => {
  keyVisible = !keyVisible;
  els.apiKey.type = keyVisible ? 'text' : 'password';
  els.toggleKey.title = keyVisible ? 'Hide key' : 'Show key';
});

// ─── Test Connection ────────────────────────────────────────────────────────

els.btnTest.addEventListener('click', async () => {
  els.btnTest.classList.add('testing');
  els.testText.textContent = 'Testing...';
  clearTestResult();

  try {
    // Send current form values so the test uses what the user typed, not what's saved
    const currentSettings = {
      provider: els.provider.value,
      apiKey: els.apiKey.value.trim(),
      model: els.model.value,
      customEndpoint: els.customEndpoint.value.trim(),
    };

    const result = await new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type: 'TEST_CONNECTION', settings: currentSettings }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });

    if (result.success) {
      // Auto-save all settings on successful test
      saveSettings();
      showTestResult('Connection successful! Settings saved.', 'success');
    } else {
      showTestResult(`${result.error || 'Connection failed'}`, 'error');
    }
  } catch (err) {
    showTestResult(`${err.message}`, 'error');
  } finally {
    els.btnTest.classList.remove('testing');
    els.testText.textContent = 'Test Connection';
  }
});

function showTestResult(message, type) {
  els.testResult.textContent = message;
  els.testResult.className = `test-result ${type}`;
}

function clearTestResult() {
  els.testResult.className = 'test-result';
  els.testResult.textContent = '';
}

// ─── Save Settings ──────────────────────────────────────────────────────────

els.btnSave.addEventListener('click', () => {
  // Clean up styles: remove empty ones
  const cleanedStyles = currentStyles.filter(s => s.title.trim() || s.instruction.trim());
  if (cleanedStyles.length === 0) {
    cleanedStyles.push(...BUILT_IN_STYLES);
  }

  // Ensure defaultStyleId is valid
  if (!cleanedStyles.some(s => s.id === defaultStyleId)) {
    defaultStyleId = cleanedStyles[0].id;
  }

  const settings = {
    provider: els.provider.value,
    apiKey: els.apiKey.value.trim(),
    model: els.model.value,
    customEndpoint: els.customEndpoint.value.trim(),
    defaultStyleId,
    styles: cleanedStyles,
    outputLanguage: els.outputLanguage.value,
  };

  chrome.storage.sync.set(settings, () => {
    currentStyles = cleanedStyles;
    renderStyles();

    els.saveStatus.textContent = '✓ Settings saved';
    els.saveStatus.classList.add('visible');

    setTimeout(() => {
      els.saveStatus.classList.remove('visible');
    }, 3000);
  });
});

// ─── Utilities ──────────────────────────────────────────────────────────────

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}
