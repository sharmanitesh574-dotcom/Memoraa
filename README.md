# Memoraa 🧠

> Your private, voice-first AI memory companion.

---

## Stack
- React 18 + Vite (PWA-installable)
- Vercel serverless functions in `api/` (Node runtime)
- **STT:** OpenAI Whisper (`whisper-1`)
- **TTS:** OpenAI `tts-1` (sentence-streamed, voice picked per language)
- **LLM:** Anthropic Claude (`claude-haiku-4-5-20251001`), streaming SSE
- **Auth:** Clerk (email or phone OTP, username + handle)
- **Storage:** Neon Postgres (per-user `memories` table) via `@neondatabase/serverless`
- Browser `SpeechRecognition` / `speechSynthesis` only as fallbacks

---

## Environment variables

All five are required in production. Set them in **Vercel → Project → Settings → Environment Variables** and in `.env.local` for `npm run dev`.

| Variable | Where it's used | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `api/chat.js` | `sk-ant-…` |
| `OPENAI_API_KEY` | `api/transcribe.js`, `api/tts.js` | Whisper + tts-1 |
| `DATABASE_URL` | `api/memories.js` | Neon Postgres connection string |
| `CLERK_SECRET_KEY` | every API handler | server-side token verification |
| `VITE_CLERK_PUBLISHABLE_KEY` | `src/main.jsx` (build-time) | `pk_test_…` / `pk_live_…` |

The `memories` table is auto-created on first request (`CREATE TABLE IF NOT EXISTS`).

---

## Deploy to Vercel

```bash
git init
git add .
git commit -m "init memoraa"
git remote add origin https://github.com/YOUR_USERNAME/memoraa.git
git push -u origin main
```

1. **vercel.com → New Project →** import the repo (framework: Vite, auto-detected).
2. Add the five env vars above.
3. Deploy.

---

## Local development

```bash
npm install

cat > .env.local <<'EOF'
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
DATABASE_URL=postgres://...neon.tech/...
CLERK_SECRET_KEY=sk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
EOF

npm run dev
```

Voice capture needs HTTPS in production (Vercel handles this). `localhost` is treated as secure for dev.

---

## Features

- 🎤 **Tap orb → speak → reply.** Recording auto-stops on ~1.4 s of silence (AnalyserNode RMS), or tap again to stop manually.
- 🔊 **Streaming voice.** Sentences are sent to TTS as Claude streams them, so audio starts before the full reply is generated. A sequenced queue keeps playback in order even when fetches race.
- 🌐 **14 languages** — voice picked per language (e.g. `fable` for en-GB, `shimmer` for hi-IN/ja-JP, `onyx` for ar-SA/ru-RU).
- 🧠 **Auto memory.** Claude emits a `MEMORY_JSON` tail when the user shares anything personal — facts are deduped and persisted to Postgres, scoped to the signed-in user.
- 📜 **Bounded context.** Only the last 16 chat messages are sent each turn — long-term info lives in memories.
- 🛑 **Barge-in.** Tap during `speaking`/`thinking` to abort the SSE stream, kill pending TTS fetches, and flush the audio queue.
- 📱 **PWA** — installable on iOS/Android home screen, offline shell via Workbox.
- 🔒 **Per-user data.** Every API call verifies a Clerk JWT; rows are filtered by `user_id`.

---

## File structure

```
memoraa/
├── api/
│   ├── chat.js         # Anthropic proxy (streams SSE through)
│   ├── transcribe.js   # raw audio bytes → Whisper → text
│   ├── tts.js          # text → OpenAI tts-1 mp3 stream
│   └── memories.js     # GET/POST/DELETE per-user memories (Neon)
├── public/
│   └── favicon.svg
├── src/
│   ├── App.jsx         # Orb, voice pipeline, memories view
│   ├── Auth.jsx        # Clerk sign-up / sign-in (email or phone OTP)
│   ├── index.css       # Styles + animations
│   └── main.jsx        # ClerkProvider + React mount
├── index.html
├── vite.config.js
├── vercel.json
└── package.json
```
