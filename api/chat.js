import { verifyToken } from '@clerk/backend'
import { Readable } from 'node:stream'
import { neon } from '@neondatabase/serverless'
import { embedTexts, vecLiteral } from './_embed.js'

const sql = neon(process.env.DATABASE_URL)

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

function lastUserText(messages) {
  if (!Array.isArray(messages)) return null
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.role !== 'user') continue
    if (typeof m.content === 'string') return m.content
    if (Array.isArray(m.content)) {
      const text = m.content.find(c => c?.type === 'text')?.text
      if (text) return text
    }
  }
  return null
}

async function retrieveMemories(userId, queryText) {
  const recentP = sql`
    SELECT id, fact FROM memories
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 4
  `

  let semanticP = Promise.resolve([])
  if (queryText) {
    const embeds = await embedTexts([queryText])
    if (embeds) {
      semanticP = sql`
        SELECT id, fact FROM memories
        WHERE user_id = ${userId} AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vecLiteral(embeds[0])}::vector
        LIMIT 8
      `
    }
  }

  const [semantic, recent] = await Promise.all([semanticP, recentP])
  const seen = new Set()
  const merged = []
  for (const r of [...semantic, ...recent]) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    merged.push(r.fact)
  }
  return merged
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).send('Method not allowed')

  const userId = await userIdFromRequest(req)
  if (!userId) return res.status(401).json({ error: { message: 'unauthorized' } })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: { message: 'API key not configured' } })

  const body = { ...req.body }
  const isStream = body?.stream === true

  try {
    const queryText = lastUserText(body.messages)
    const facts = await retrieveMemories(userId, queryText)
    if (facts.length > 0) {
      const block = '\n\nWhat you remember about this person:\n' +
        facts.map((f, i) => `${i + 1}. ${f}`).join('\n')
      const baseSys = typeof body.system === 'string' ? body.system : ''
      body.system = baseSys + block
    }
  } catch (err) {
    console.warn('memory injection failed', err.message)
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
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
