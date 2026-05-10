import { verifyToken } from '@clerk/backend'
import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
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
  await sql`CREATE TABLE IF NOT EXISTS memories (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    fact TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`CREATE INDEX IF NOT EXISTS memories_user_id_idx ON memories(user_id)`
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
        SELECT id, fact, created_at
        FROM memories
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 200
      `
      return res.status(200).json({ memories: rows })
    }

    if (req.method === 'POST') {
      const body = req.body || {}

      if (Array.isArray(body.facts)) {
        const facts = body.facts
          .filter(f => typeof f === 'string' && f.trim().length > 4)
          .map(f => f.trim())
          .slice(0, 200)
        for (const fact of facts) {
          await sql`INSERT INTO memories (user_id, fact) VALUES (${userId}, ${fact})`
        }
        const rows = await sql`
          SELECT id, fact, created_at FROM memories
          WHERE user_id = ${userId}
          ORDER BY created_at DESC LIMIT 200
        `
        return res.status(200).json({ memories: rows })
      }

      const fact = (body.fact || '').toString().trim()
      if (fact.length < 5) return res.status(400).json({ error: 'fact too short' })
      const [row] = await sql`
        INSERT INTO memories (user_id, fact)
        VALUES (${userId}, ${fact})
        RETURNING id, fact, created_at
      `
      return res.status(200).json({ memory: row })
    }

    if (req.method === 'DELETE') {
      const all = req.query?.all === '1'
      if (all) {
        await sql`DELETE FROM memories WHERE user_id = ${userId}`
        return res.status(200).json({ ok: true })
      }
      const id = parseInt(req.query?.id || '', 10)
      if (!id) return res.status(400).json({ error: 'missing id' })
      await sql`DELETE FROM memories WHERE id = ${id} AND user_id = ${userId}`
      return res.status(200).json({ ok: true })
    }

    return res.status(405).send('Method not allowed')
  } catch (err) {
    return res.status(500).json({ error: 'server_error', detail: err.message })
  }
}
