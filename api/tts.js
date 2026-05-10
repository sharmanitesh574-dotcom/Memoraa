import { verifyToken } from '@clerk/backend'
import { Readable } from 'node:stream'

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

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  const userId = await userIdFromRequest(req)
  if (!userId) return res.status(401).json({ error: 'unauthorized' })

  const body = req.body || {}
  const text = (body.text || '').toString().trim()
  if (!text) return res.status(400).json({ error: 'missing text' })
  if (text.length > 4000) return res.status(400).json({ error: 'text too long' })

  const voice = (body.voice || 'nova').toString()
  const model = (body.model || 'openai/tts-1').toString()

  const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
  if (!gatewayKey) return res.status(500).json({ error: 'AI Gateway not configured' })

  const url = 'https://ai-gateway.vercel.sh/v1/audio/speech'
  const usingOidc = !process.env.AI_GATEWAY_API_KEY && !!process.env.VERCEL_OIDC_TOKEN
  let upstream
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${gatewayKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: text,
        voice,
        response_format: 'mp3',
      }),
    })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[tts] upstream fetch threw:', err.message, { url, usingOidc })
    return res.status(502).json({ error: 'upstream_fetch_failed', detail: err.message })
  }

  if (!upstream.ok) {
    let detail = ''
    try { detail = await upstream.text() } catch {}
    // eslint-disable-next-line no-console
    console.error('[tts] upstream rejected:', {
      url,
      status: upstream.status,
      statusText: upstream.statusText,
      usingOidc,
      model,
      voice,
      detail: detail.slice(0, 1000),
    })
    return res.status(502).json({ error: 'tts_failed', status: upstream.status, detail: detail.slice(0, 500) })
  }

  res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg')
  res.setHeader('Cache-Control', 'no-store')
  res.status(200)

  if (upstream.body && Readable.fromWeb) {
    Readable.fromWeb(upstream.body).pipe(res)
  } else {
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.end(buf)
  }
}
