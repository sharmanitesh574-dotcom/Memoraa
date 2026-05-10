import { verifyToken } from '@clerk/backend'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

async function userIdFromRequest(req) {
  const auth = req.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY })
    return payload.sub || null
  } catch {
    return null
  }
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders },
  })

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  }

  const userId = await userIdFromRequest(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
  if (!gatewayKey) return json({ error: 'AI Gateway not configured' }, 500)

  let inForm
  try { inForm = await req.formData() } catch { return json({ error: 'bad_multipart' }, 400) }

  const file = inForm.get('file')
  if (!file || typeof file === 'string') return json({ error: 'missing file' }, 400)

  const language = (inForm.get('language') || '').toString().split('-')[0] // 'en-US' -> 'en'

  const upstreamForm = new FormData()
  upstreamForm.append('file', file, file.name || 'audio.webm')
  upstreamForm.append('model', 'openai/whisper-1')
  if (language) upstreamForm.append('language', language)
  // Useful for shaping the model toward the kind of speech we expect
  upstreamForm.append('prompt', 'Casual conversation. May include English, Hindi, Hinglish, or other languages.')

  let upstream
  try {
    upstream = await fetch('https://ai-gateway.vercel.sh/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${gatewayKey}` },
      body: upstreamForm,
    })
  } catch (err) {
    return json({ error: 'upstream_fetch_failed', detail: err.message }, 502)
  }

  let data
  try { data = await upstream.json() } catch {
    const txt = await upstream.text().catch(() => '')
    return json({ error: 'upstream_bad_json', detail: txt.slice(0, 500) }, 502)
  }

  if (!upstream.ok) {
    return json({ error: 'transcribe_failed', status: upstream.status, detail: data }, 502)
  }

  return json({ text: (data.text || '').trim() })
}
