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
  if (!userId) return res.status(401).json({ error: { message: 'unauthorized' } })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: { message: 'API key not configured' } })

  const isStream = req.body?.stream === true

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    })

    if (!isStream) {
      const data = await response.json()
      return res.status(response.status).json(data)
    }

    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.status(response.status)

    if (response.body && Readable.fromWeb) {
      Readable.fromWeb(response.body).pipe(res)
    } else {
      const buf = Buffer.from(await response.arrayBuffer())
      res.end(buf)
    }
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: { message: err.message } })
    } else {
      try { res.end() } catch {}
    }
  }
}
