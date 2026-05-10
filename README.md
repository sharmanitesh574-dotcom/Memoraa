# Memoraa 🧠

> Your private, voice-first AI memory companion.

---

## Stack
- React 18 + Vite
- Vercel Edge Functions (API proxy — keeps your key server-side)
- Web Speech API (voice input + TTS)
- Claude claude-sonnet-4-20250514 via Anthropic API
- PWA-ready (installable on home screen)
- localStorage for on-device memory persistence

---

## Deploy to Vercel (5 minutes)

### Step 1 — Push to GitHub
```bash
git init
git add .
git commit -m "init memoraa"
git remote add origin https://github.com/YOUR_USERNAME/memoraa.git
git push -u origin main
```

### Step 2 — Import to Vercel
1. Go to [vercel.com](https://vercel.com) → New Project
2. Import your GitHub repo
3. Framework: **Vite** (auto-detected)
4. Build command: `npm run build`
5. Output directory: `dist`

### Step 3 — Add Environment Variable
In Vercel → Project Settings → Environment Variables:
```
ANTHROPIC_API_KEY = sk-ant-xxxxxxxxxxxxxxxx
```

### Step 4 — Deploy
Click Deploy. Done. 🚀

---

## Local Development

```bash
npm install

# Create .env.local
echo "ANTHROPIC_API_KEY=your_key_here" > .env.local

npm run dev
```

> Note: Voice input requires HTTPS in production (Vercel handles this automatically).
> For local dev, `localhost` also works.

---

## Features
- 🎤 Tap the orb → speak → Memoraa replies
- 🧠 Memories extracted automatically from conversation
- 🌐 Hindi + English + Hinglish supported
- 📱 PWA installable — "Add to Home Screen"
- 🔒 All memories stay on your device (localStorage)
- ✨ Auto Dream banner when 5+ memories saved

---

## File Structure
```
memoraa/
├── api/
│   └── chat.js          # Vercel edge function — Anthropic proxy
├── public/
│   └── favicon.svg
├── src/
│   ├── App.jsx           # Main app
│   ├── index.css         # Global styles + animations
│   └── main.jsx          # React entry
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```
