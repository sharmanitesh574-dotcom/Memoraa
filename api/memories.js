import { verifyToken } from '@clerk/backend'
import { neon } from '@neondatabase/serverless'

export const config = { runtime: 'edge' }

const sql = neon(process.env.DATABASE_URL)

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

async function userIdFromRequest(req) {
  const auth = req.headers.get('authorization') || ''
  if (!auth.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  try {
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    })
    return payload.sub || null
  } catch {
    return null
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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

  const userId = await userIdFromRequest(req)
  if (!userId) return json({ error: 'unauthorized' }, 401)

  try {
    await ensureSchema()
  } catch (err) {
    return json({ error: 'db_unavailable', detail: err.message }, 500)
  }

  const url = new URL(req.url)

  try {
    if (req.method === 'GET') {
      const rows = await sql`
        SELECT id, fact, created_at
        FROM memories
        WHERE user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 200
      `
      return json({ memories: rows })
    }

    if (req.method === 'POST') {
      const body = await req.json()

      // Bulk insert (used for one-time localStorage migration)
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
        return json({ memories: rows })
      }

      const fact = (body.fact || '').toString().trim()
      if (fact.length < 5) return json({ error: 'fact too short' }, 400)
      const [row] = await sql`
        INSERT INTO memories (user_id, fact)
        VALUES (${userId}, ${fact})
        RETURNING id, fact, created_at
      `
      return json({ memory: row })
    }

    if (req.method === 'DELETE') {
      if (url.searchParams.get('all') === '1') {
        await sql`DELETE FROM memories WHERE user_id = ${userId}`
        return json({ ok: true })
      }
      const id = parseInt(url.searchParams.get('id') || '', 10)
      if (!id) return json({ error: 'missing id' }, 400)
      await sql`DELETE FROM memories WHERE id = ${id} AND user_id = ${userId}`
      return json({ ok: true })
    }

    return new Response('Method not allowed', { status: 405, headers: corsHeaders })
  } catch (err) {
    return json({ error: 'server_error', detail: err.message }, 500)
  }
}
