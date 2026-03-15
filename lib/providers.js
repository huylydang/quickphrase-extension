/**
 * QuickPhrase — AI Provider Adapters
 * Each provider: { getEndpoint(model, apiKey), buildHeaders(apiKey), buildBody(text, styleInstruction, model), parseResponse(data) }
 */

const SYSTEM_PROMPT_BASE = `You are a paraphrasing assistant.
Return ONLY a JSON array with exactly 3 paraphrased versions.
No explanation. No markdown. No code fences.
Example: ["variant1","variant2","variant3"]`;

/**
 * Build the system prompt with style instruction and output language.
 * @param {string} styleInstruction - The style instruction text from the user's saved style
 * @param {string} outputLanguage - Language code or 'auto'
 */
function buildSystemPrompt(styleInstruction, outputLanguage) {
  let prompt = SYSTEM_PROMPT_BASE;

  if (styleInstruction) {
    prompt += `\nStyle instruction: ${styleInstruction}`;
  }

  if (outputLanguage && outputLanguage !== 'auto') {
    const langMap = { en: 'English', vi: 'Vietnamese', es: 'Spanish', fr: 'French', de: 'German', ja: 'Japanese', ko: 'Korean', zh: 'Chinese' };
    const langName = langMap[outputLanguage] || outputLanguage;
    prompt += `\nOutput language: Respond in ${langName}.`;
  }

  return prompt;
}

function buildUserPrompt(text) {
  return `Paraphrase this text: "${text}"`;
}

/**
 * Parse the AI response to extract exactly 3 variants.
 * Handles various response formats robustly.
 */
function parseVariants(text) {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
  cleaned = cleaned.trim();

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length >= 3) {
      return parsed.slice(0, 3).map(v => String(v).trim());
    }
    if (Array.isArray(parsed) && parsed.length > 0) {
      while (parsed.length < 3) parsed.push(parsed[parsed.length - 1]);
      return parsed.slice(0, 3).map(v => String(v).trim());
    }
  } catch {
    const match = cleaned.match(/\[[\s\S]*\]/);
    if (match) {
      try {
        const arr = JSON.parse(match[0]);
        if (Array.isArray(arr) && arr.length > 0) {
          while (arr.length < 3) arr.push(arr[arr.length - 1]);
          return arr.slice(0, 3).map(v => String(v).trim());
        }
      } catch { /* fall through */ }
    }
  }

  throw new Error('Failed to parse AI response. Expected a JSON array of 3 strings.');
}

// ─── Gemini ──────────────────────────────────────────────────────────────────

const gemini = {
  getEndpoint(model, apiKey) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  },

  buildHeaders() {
    return { 'Content-Type': 'application/json' };
  },

  buildBody(text, styleInstruction, model, outputLanguage) {
    const systemPrompt = buildSystemPrompt(styleInstruction, outputLanguage);
    return {
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${buildUserPrompt(text)}` }],
        },
      ],
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 1024,
      },
    };
  },

  parseResponse(data) {
    if (data.error) {
      throw new Error(data.error.message || 'Gemini API error');
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Empty response from Gemini');
    return parseVariants(text);
  },
};

// ─── OpenAI-compatible (Groq, OpenAI, Custom) ───────────────────────────────

function buildOpenAICompatible(defaultEndpoint) {
  return {
    getEndpoint(model, apiKey, customEndpoint) {
      return customEndpoint || defaultEndpoint;
    },

    buildHeaders(apiKey) {
      return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      };
    },

    buildBody(text, styleInstruction, model, outputLanguage) {
      const systemPrompt = buildSystemPrompt(styleInstruction, outputLanguage);
      return {
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: buildUserPrompt(text) },
        ],
        temperature: 0.8,
        max_tokens: 1024,
      };
    },

    parseResponse(data) {
      if (data.error) {
        throw new Error(data.error.message || 'API error');
      }
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error('Empty response from API');
      return parseVariants(text);
    },
  };
}

const groq = buildOpenAICompatible('https://api.groq.com/openai/v1/chat/completions');
const openai = buildOpenAICompatible('https://api.openai.com/v1/chat/completions');
const custom = buildOpenAICompatible('');

// ─── Provider Registry ──────────────────────────────────────────────────────

const providers = { gemini, groq, openai, custom };

export function getProvider(name) {
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown provider: ${name}`);
  return provider;
}

/**
 * Call the AI provider to get 3 paraphrase variants.
 * @param {object} settings - Full settings from chrome.storage.sync
 * @param {string} text - Selected text to paraphrase
 * @param {string} styleInstruction - The resolved style instruction text
 * @returns {Promise<string[]>} Array of 3 variants
 */
export async function generateParaphrases(settings, text, styleInstruction) {
  const {
    provider: providerName,
    apiKey,
    model,
    customEndpoint,
    outputLanguage,
  } = settings;

  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const provider = getProvider(providerName || 'gemini');

  const endpoint = provider.getEndpoint(model, apiKey, customEndpoint);
  const headers = provider.buildHeaders(apiKey);
  const body = provider.buildBody(text, styleInstruction || '', model, outputLanguage);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  if (response.status === 429) {
    throw new Error('RATE_LIMIT');
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error('INVALID_KEY');
  }

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error?.message || `API error: ${response.status}`);
  }

  const data = await response.json();
  return provider.parseResponse(data);
}

/**
 * Test connection to the configured provider.
 * @param {object} settings
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function testConnection(settings) {
  try {
    const variants = await generateParaphrases(settings, 'Hello, how are you?', 'Paraphrase naturally.');
    if (variants && variants.length === 3) {
      return { success: true };
    }
    return { success: false, error: 'Unexpected response format' };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Default settings for first-time users.
 */
export const DEFAULT_SETTINGS = {
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-2.5-flash',
  customEndpoint: '',
  defaultStyleId: 'native',
  styles: [
    { id: 'default', title: 'Default', instruction: 'Paraphrase naturally, no special constraints.' },
    { id: 'formal', title: 'Formal', instruction: 'Use formal, polished, and respectful language.' },
    { id: 'professional', title: 'Professional', instruction: 'Use clear, concise, professional language suitable for a work environment.' },
    { id: 'native', title: 'Native', instruction: 'Rephrase as a native English speaker would naturally say it.' },
  ],
  outputLanguage: 'auto',
};
