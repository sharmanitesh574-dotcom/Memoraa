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
  await sql`CREATE TABLE IF NOT EXISTS user_prefs (
    user_id TEXT PRIMARY KEY,
    nudge_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    nudge_local_hour SMALLINT NOT NULL DEFAULT 9,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`
  schemaReady = true
}

const DEFAULTS = { nudge_enabled: false, nudge_local_hour: 9, timezone: 'UTC' }

function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz.length) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

function clampHour(v) {
  const n = parseInt(v, 10)
  if (!Number.isFinite(n)) return null
  return Math.max(0, Math.min(23, n))
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
        SELECT nudge_enabled, nudge_local_hour, timezone
        FROM user_prefs WHERE user_id = ${userId}
      `
      return res.status(200).json({ prefs: rows[0] || DEFAULTS })
    }

    if (req.method === 'POST') {
      const body = req.body || {}
      const enabled = typeof body.nudge_enabled === 'boolean' ? body.nudge_enabled : null
      const hour = body.nudge_local_hour != null ? clampHour(body.nudge_local_hour) : null
      const tz = body.timezone

      if (tz != null && !isValidTimezone(tz)) {
        return res.status(400).json({ error: 'invalid_timezone' })
      }

      const existing = await sql`
        SELECT nudge_enabled, nudge_local_hour, timezone
        FROM user_prefs WHERE user_id = ${userId}
      `
      const cur = existing[0] || DEFAULTS

      const newEnabled = enabled !== null ? enabled : cur.nudge_enabled
      const newHour = hour !== null ? hour : cur.nudge_local_hour
      const newTz = tz != null ? tz : cur.timezone

      await sql`
        INSERT INTO user_prefs (user_id, nudge_enabled, nudge_local_hour, timezone, updated_at)
        VALUES (${userId}, ${newEnabled}, ${newHour}, ${newTz}, NOW())
        ON CONFLICT (user_id) DO UPDATE
        SET nudge_enabled = EXCLUDED.nudge_enabled,
            nudge_local_hour = EXCLUDED.nudge_local_hour,
            timezone = EXCLUDED.timezone,
            updated_at = NOW()
      `

      return res.status(200).json({
        prefs: {
          nudge_enabled: newEnabled,
          nudge_local_hour: newHour,
          timezone: newTz,
        },
      })
    }

    return res.status(405).send('Method not allowed')
  } catch (err) {
    return res.status(500).json({ error: 'server_error', detail: err.message })
  }
}
