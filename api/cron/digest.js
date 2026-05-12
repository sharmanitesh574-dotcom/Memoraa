import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

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
  await sql`ALTER TABLE nudges ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'checkin'`
  schemaReady = true
}

async function generateDigest(userId) {
  const memories = await sql`
    SELECT fact, category FROM memories
    WHERE user_id = ${userId}
      AND created_at > NOW() - INTERVAL '7 days'
    ORDER BY created_at ASC
    LIMIT 100
  `
  if (memories.length < 3) return null

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const list = memories.map((m, i) => `${i + 1}. ${m.fact}${m.category ? ` [${m.category}]` : ''}`).join('\n')

  const system = `You are Memoraa, a warm AI memory companion writing a short weekly reflection for the person.
- 3-4 sentences. Read like a kind friend noticing patterns and growth.
- Reference 2-3 specific themes or moments from the facts below.
- Acknowledge feelings, celebrate wins, name what changed.
- Address the person in second person ("you").
- Do NOT greet, do NOT use bullet points, do NOT mention you are an AI.
- Output ONLY the reflection itself.`

  const userMsg = `Here is what was shared with you in the past 7 days:\n${list}\n\nWrite the weekly reflection now.`

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })

  if (!r.ok) {
    console.warn('digest gen failed', r.status, await r.text().catch(() => ''))
    return null
  }

  const data = await r.json()
  return data?.content?.[0]?.text?.trim() || null
}

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.authorization || ''
    if (auth !== `Bearer ${secret}`) {
      return res.status(401).json({ error: 'unauthorized' })
    }
  }

  try {
    await ensureSchema()
  } catch (err) {
    return res.status(500).json({ error: 'db_unavailable', detail: err.message })
  }

  let eligible
  try {
    eligible = await sql`
      SELECT p.user_id
      FROM user_prefs p
      WHERE p.nudge_enabled = TRUE
        AND NOT EXISTS (
          SELECT 1 FROM nudges n
          WHERE n.user_id = p.user_id
            AND n.kind = 'digest'
            AND n.created_at > NOW() - INTERVAL '6 days'
        )
    `
  } catch (err) {
    return res.status(500).json({ error: 'eligibility_query_failed', detail: err.message })
  }

  let generated = 0
  const failures = []
  for (const { user_id } of eligible) {
    try {
      const prompt = await generateDigest(user_id)
      if (!prompt) {
        failures.push({ user_id, reason: 'empty_or_insufficient' })
        continue
      }
      await sql`INSERT INTO nudges (user_id, prompt, kind) VALUES (${user_id}, ${prompt}, 'digest')`
      generated++
    } catch (err) {
      failures.push({ user_id, reason: err.message })
    }
  }

  return res.status(200).json({
    eligible: eligible.length,
    generated,
    failures: failures.length,
  })
}
