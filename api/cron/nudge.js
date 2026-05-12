import { neon } from '@neondatabase/serverless'

const sql = neon(process.env.DATABASE_URL)

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
  await sql`CREATE TABLE IF NOT EXISTS nudges (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    prompt TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ
  )`
  await sql`ALTER TABLE nudges ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'checkin'`
  await sql`CREATE INDEX IF NOT EXISTS nudges_user_pending_idx ON nudges(user_id) WHERE delivered_at IS NULL`
  schemaReady = true
}

async function generateNudge(userId) {
  // Look for memories with due_at in the last ~24 hours OR coming up in the next 24h —
  // these are the ones that warrant a real follow-up question, not a generic check-in.
  const dueMemories = await sql`
    SELECT fact, category, due_at FROM memories
    WHERE user_id = ${userId}
      AND due_at IS NOT NULL
      AND due_at BETWEEN NOW() - INTERVAL '24 hours' AND NOW() + INTERVAL '24 hours'
    ORDER BY due_at ASC
    LIMIT 5
  `

  const recentMemories = await sql`
    SELECT fact, category, due_at FROM memories
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
    LIMIT 30
  `

  if (recentMemories.length === 0) return null

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null

  const isFollowup = dueMemories.length > 0
  const kind = isFollowup ? 'followup' : 'checkin'

  let system, userMsg
  if (isFollowup) {
    const due = dueMemories[0]
    const dueDate = new Date(due.due_at).toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    system = `You are Memoraa, a warm AI memory companion following up on a specific thing the person mentioned.
- Today is ${today}. The person previously said something with date ${dueDate}.
- Ask a direct, warm follow-up question about that specific item.
- If it was in the past (e.g. an appointment, an event), ask how it went.
- If it is today or tomorrow, gently check on it.
- 1-2 sentences max. Friend-like, not robotic.
- Do NOT greet ("Hey", "Hi"). Output ONLY the question.`
    userMsg = `Follow up on this fact (the one that matters most right now):\n"${due.fact}" (${due.category || 'unknown'}, ${dueDate})\n\nOther context about this person:\n${recentMemories.slice(0, 10).map(m => `- ${m.fact}`).join('\n')}\n\nWrite the follow-up question now.`
  } else {
    system = `You are Memoraa, a warm AI memory companion writing a single short check-in question for someone you remember well.
- Reference ONE specific thing from their memories worth following up on (a goal, an event, a feeling, a plan).
- 1-2 sentences max. Sound like a friend, not a survey.
- Do NOT start with "Hey", "Hi", or any greeting.
- Output ONLY the question itself — no preamble, no quotes, no commentary.`
    userMsg = `Here is what you remember about this person:\n${recentMemories.map((m, i) => `${i + 1}. ${m.fact}`).join('\n')}\n\nWrite the check-in question now.`
  }

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system,
      messages: [{ role: 'user', content: userMsg }],
    }),
  })

  if (!r.ok) {
    console.warn('nudge gen failed', r.status, await r.text().catch(() => ''))
    return null
  }

  const data = await r.json()
  const text = data?.content?.[0]?.text?.trim()
  return text ? { prompt: text, kind } : null
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
            AND n.created_at > NOW() - INTERVAL '20 hours'
        )
    `
  } catch (err) {
    return res.status(500).json({ error: 'eligibility_query_failed', detail: err.message })
  }

  let generated = 0
  const failures = []
  for (const { user_id } of eligible) {
    try {
      const result = await generateNudge(user_id)
      if (!result) {
        failures.push({ user_id, reason: 'empty' })
        continue
      }
      await sql`INSERT INTO nudges (user_id, prompt, kind) VALUES (${user_id}, ${result.prompt}, ${result.kind})`
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
