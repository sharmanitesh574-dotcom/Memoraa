import { verifyToken } from '@clerk/backend'
import { neon } from '@neondatabase/serverless'
import { embedTexts, vecLiteral } from './_embed.js'

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

const CATEGORIES = new Set([
  'person', 'event', 'preference', 'goal', 'feeling', 'todo', 'health', 'other',
])

let schemaReady = false
async function ensureSchema() {
  if (schemaReady) return
  await sql`CREATE EXTENSION IF NOT EXISTS vector`
  await sql`CREATE TABLE IF NOT EXISTS memories (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    fact TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS embedding vector(1536)`
  await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS category TEXT`
  await sql`ALTER TABLE memories ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ`
  await sql`CREATE INDEX IF NOT EXISTS memories_user_id_idx ON memories(user_id)`
  await sql`CREATE INDEX IF NOT EXISTS memories_due_at_idx ON memories(user_id, due_at) WHERE due_at IS NOT NULL`
  await sql`CREATE INDEX IF NOT EXISTS memories_embedding_idx ON memories USING hnsw (embedding vector_cosine_ops)`
  schemaReady = true
}

function normCategory(c) {
  if (typeof c !== 'string') return null
  const lower = c.trim().toLowerCase()
  return CATEGORIES.has(lower) ? lower : null
}

function normDueAt(d) {
  if (typeof d !== 'string' || !d.trim()) return null
  const ms = Date.parse(d)
  if (!Number.isFinite(ms)) return null
  return new Date(ms).toISOString()
}

async function backfillBatch(userId, limit = 5) {
  const stale = await sql`
    SELECT id, fact FROM memories
    WHERE user_id = ${userId} AND embedding IS NULL
    LIMIT ${limit}
  `
  if (!stale.length) return
  const embeds = await embedTexts(stale.map(r => r.fact))
  if (!embeds) return
  for (let i = 0; i < stale.length; i++) {
    await sql`UPDATE memories SET embedding = ${vecLiteral(embeds[i])}::vector WHERE id = ${stale[i].id}`
  }
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
      const q = (req.query?.q || '').toString().trim()
      if (q) {
        const embeds = await embedTexts([q])
        if (embeds) {
          const rows = await sql`
            SELECT id, fact, category, due_at, created_at,
                   1 - (embedding <=> ${vecLiteral(embeds[0])}::vector) AS similarity
            FROM memories
            WHERE user_id = ${userId} AND embedding IS NOT NULL
            ORDER BY embedding <=> ${vecLiteral(embeds[0])}::vector
            LIMIT 30
          `
          return res.status(200).json({ memories: rows })
        }
        // fall through to recent if embedding fails
      }
      await backfillBatch(userId)
      const rows = await sql`
        SELECT id, fact, category, due_at, created_at
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
        const embeds = await embedTexts(facts)
        for (let i = 0; i < facts.length; i++) {
          const emb = embeds ? embeds[i] : null
          if (emb) {
            await sql`INSERT INTO memories (user_id, fact, embedding) VALUES (${userId}, ${facts[i]}, ${vecLiteral(emb)}::vector)`
          } else {
            await sql`INSERT INTO memories (user_id, fact) VALUES (${userId}, ${facts[i]})`
          }
        }
        const rows = await sql`
          SELECT id, fact, category, due_at, created_at FROM memories
          WHERE user_id = ${userId}
          ORDER BY created_at DESC LIMIT 200
        `
        return res.status(200).json({ memories: rows })
      }

      const fact = (body.fact || '').toString().trim()
      if (fact.length < 5) return res.status(400).json({ error: 'fact too short' })
      const category = normCategory(body.category)
      const dueAt = normDueAt(body.due_at)
      const embeds = await embedTexts([fact])
      const emb = embeds ? embeds[0] : null

      const [row] = await sql`
        INSERT INTO memories (user_id, fact, embedding, category, due_at)
        VALUES (
          ${userId},
          ${fact},
          ${emb ? vecLiteral(emb) : null}::vector,
          ${category},
          ${dueAt}
        )
        RETURNING id, fact, category, due_at, created_at
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
