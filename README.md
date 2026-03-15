# QuickPhrase

> Select any text. Right-click. Get 3 AI paraphrase suggestions. Replace or copy instantly.

QuickPhrase is a Chrome extension that brings AI-powered text paraphrasing directly into your browser. No tab-switching, no copy-paste gymnastics — just highlight, right-click, and pick your favorite variant.

## Features

- **Instant Paraphrasing** — Select text anywhere, right-click, get 3 AI-generated alternatives
- **Replace in Place** — One-click replacement for text in inputs, textareas, and contenteditable fields
- **Copy to Clipboard** — Quick copy with visual confirmation
- **Unlimited Custom Styles** — Default, Formal, Professional, Native, or create your own
- **BYOK (Bring Your Own Key)** — Works with Gemini, Groq, OpenAI, or any OpenAI-compatible API
- **Privacy First** — Your API key stays local. No data sent to our servers. Ever.

## Quick Start

### 1. Install (Developer Mode)

1. Clone or download this repo
2. Open `chrome://extensions/` in Chrome
3. Enable **Developer mode** (top-right toggle)
4. Click **Load unpacked** and select the project folder
5. The QuickPhrase icon will appear in your extensions bar

### 2. Get an API Key

| Provider | Free Tier | Get Key |
|----------|-----------|---------|
| **Gemini** | ~1,000 req/day | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| **Groq** | ~1,000 req/day | [console.groq.com/keys](https://console.groq.com/keys) |
| **OpenAI** | Paid | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| **Custom** | Varies | Your own endpoint |

### 3. Configure

1. Click the QuickPhrase icon in your toolbar, then click **Settings**
2. Pick your AI provider
3. Paste your API key
4. Click **Test Connection** to verify (settings auto-save on success)
5. Done! Start paraphrasing

## Styles

QuickPhrase comes with 4 built-in styles, and you can create unlimited custom styles:

| Style | Description |
|-------|-------------|
| **Default** | Natural paraphrase, no constraints |
| **Formal** | Polished, respectful language |
| **Professional** | Clear, concise, work-appropriate |
| **Native** | Natural as a native speaker |

All styles are fully editable. You can also add custom styles with your own instructions (e.g., "casual Slack tone" or "academic writing").

**Quick access:** Right-click selected text → "QuickPhrase" uses your default style.
**Style picker:** Right-click → "QuickPhrase with Style" opens the style submenu.

## Development

```bash
# Clone the repo
git clone git@github.com:huylydang/quickphrase-extension.git
cd quickphrase-extension

# Load in Chrome
# 1. Open chrome://extensions/
# 2. Enable Developer mode
# 3. Click "Load unpacked" → select this folder

# Make changes → click reload on chrome://extensions/
```

### File Structure

```
quickphrase-extension/
├── manifest.json          # Manifest V3 config
├── background.js          # Service worker: menus + API calls
├── content.js             # Popup rendering (Shadow DOM)
├── content.css            # Host element styles
├── lib/
│   └── providers.js       # AI provider adapters
├── popup/
│   ├── popup.html         # Extension popup
│   └── popup.js
├── settings/
│   ├── settings.html      # Settings page
│   ├── settings.js
│   └── settings.css
└── icons/                 # Extension icons
```

## License

[MIT](LICENSE) — use it, fork it, ship it.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.
