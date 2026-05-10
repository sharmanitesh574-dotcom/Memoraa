import { verifyToken } from '@clerk/backend'

export const config = {
  api: { bodyParser: false }, // we read raw audio bytes ourselves
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

function setCors(res) {
  for (const [k, v] of Object.entries(corsHeaders)) res.setHeader(k, v)
}

async function userIdFromRequest(req) {
  const auth = req.headers.authorization || ''
  if (!auth.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY })
    return payload.sub || null
  } catch {
    return null
  }
}

async function readBody(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  return Buffer.concat(chunks)
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  const userId = await userIdFromRequest(req)
  if (!userId) return res.status(401).json({ error: 'unauthorized' })

  const openaiKey = process.env.OPENAI_API_KEY
  if (!openaiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY not configured' })
  }

  const audioMime = req.headers['content-type'] || 'audio/webm'
  const language = ((req.query?.language || '').toString().split('-')[0]) || ''
  const ext = audioMime.includes('mp4') ? 'mp4'
    : audioMime.includes('ogg') ? 'ogg'
    : audioMime.includes('mpeg') ? 'mp3'
    : audioMime.includes('wav') ? 'wav'
    : 'webm'

  let audio
  try {
    audio = await readBody(req)
  } catch (err) {
    return res.status(400).json({ error: 'bad_body', detail: err.message })
  }
  if (!audio || audio.length < 1000) {
    return res.status(400).json({ error: 'audio too small' })
  }

  const form = new FormData()
  form.append('file', new Blob([audio], { type: audioMime }), `audio.${ext}`)
  form.append('model', 'whisper-1')
  if (language) form.append('language', language)
  form.append('prompt', 'Casual conversation. May include English, Hindi, Hinglish, or other languages.')

  const url = 'https://api.openai.com/v1/audio/transcriptions'
  let upstream
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[transcribe] upstream fetch threw:', err.message, { url, audioMime, bytes: audio.length })
    return res.status(502).json({ error: 'upstream_fetch_failed', detail: err.message })
  }

  let data
  let rawText = ''
  try {
    rawText = await upstream.text()
    data = JSON.parse(rawText)
  } catch {
    // eslint-disable-next-line no-console
    console.error('[transcribe] upstream non-json:', { status: upstream.status, body: rawText.slice(0, 500) })
    return res.status(502).json({ error: 'upstream_bad_json', detail: rawText.slice(0, 500) })
  }

  if (!upstream.ok) {
    // eslint-disable-next-line no-console
    console.error('[transcribe] upstream rejected:', {
      url,
      status: upstream.status,
      statusText: upstream.statusText,
      audioMime,
      bytes: audio.length,
      detail: data,
    })
    return res.status(502).json({ error: 'transcribe_failed', status: upstream.status, detail: data })
  }

  return res.status(200).json({ text: (data.text || '').trim() })
}
