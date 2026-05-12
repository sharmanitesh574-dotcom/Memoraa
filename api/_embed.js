const EMBED_MODEL = 'text-embedding-3-small'

export async function embedTexts(texts) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || !texts.length) return null
  try {
    const r = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    })
    if (!r.ok) {
      console.warn('embed failed', r.status, await r.text().catch(() => ''))
      return null
    }
    const data = await r.json()
    return data.data.map(d => d.embedding)
  } catch (err) {
    console.warn('embed threw', err.message)
    return null
  }
}

export const vecLiteral = arr => '[' + arr.join(',') + ']'
