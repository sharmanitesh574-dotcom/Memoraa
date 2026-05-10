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

  let body
  try { body = await req.json() } catch { return json({ error: 'bad_json' }, 400) }

  const text = (body.text || '').toString().trim()
  if (!text) return json({ error: 'missing text' }, 400)
  if (text.length > 4000) return json({ error: 'text too long' }, 400)

  const voice = (body.voice || 'nova').toString()
  const model = (body.model || 'openai/tts-1').toString()

  const gatewayKey = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN
  if (!gatewayKey) return json({ error: 'AI Gateway not configured' }, 500)

  let upstream
  try {
    upstream = await fetch('https://ai-gateway.vercel.sh/v1/audio/speech', {
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
    return json({ error: 'upstream_fetch_failed', detail: err.message }, 502)
  }

  if (!upstream.ok) {
    let detail = ''
    try { detail = await upstream.text() } catch {}
    return json({ error: 'tts_failed', status: upstream.status, detail: detail.slice(0, 500) }, 502)
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
      'Cache-Control': 'no-store',
      ...corsHeaders,
    },
  })
}
