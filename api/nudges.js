import { verifyToken } from '@clerk/backend'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

let schemaReady = false
async function ensureSchema() {
  if (schemaReady) return
  await sql`CREATE TABLE IF NOT EXISTS nudges (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ
  )`
  schemaReady = true
}

export default async function handler(req, res) {
  setCors(res)
  if (req.method === 'OPTIONS') return res.status(200).end()

  const userId = await userIdFromRequest(req)
  if (!userId) return res.status(401).json({ error: 'unauthorized' })

  try {
    await ensureSchema()
  } catch (err) {
    return res.status(500).json({ error: 'db_unavailable', detail: err.message })
  }

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, prompt, created_at
        FROM nudges
        WHERE user_id = ${userId}
          AND delivered_at IS NULL
          AND dismissed_at IS NULL
        ORDER BY id DESC
        LIMIT 1
      `
      return res.status(200).json({ nudge: rows[0] || null })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const id = parseInt(body.id, 10)
      const action = body.action
      if (!id || (action !== 'delivered' && action !== 'dismissed')) {
        return res.status(400).json({ error: 'invalid_args' })
      }
      if (action === 'delivered') {
        await sql`UPDATE nudges SET delivered_at = NOW() WHERE id = ${id} AND user_id = ${userId}`
      } else {
        await sql`UPDATE nudges SET dismissed_at = NOW() WHERE id = ${id} AND user_id = ${userId}`
      }
      return res.status(200).json({ ok: true })
    }

    return res.status(405).send('Method not allowed')
  } catch (err) {
    return res.status(500).json({ error: 'server_error', detail: err.message })
  }
}
