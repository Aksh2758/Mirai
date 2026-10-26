// Server-only helper for the Studio API routes. The key never reaches the browser.
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

export const DEEP_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

export class GroqError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function call(body: Record<string, unknown>) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new GroqError('Add GROQ_API_KEY to frontend/.env.local and restart the dev server.', 500)
  const res = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  }).catch(() => null)
  if (!res) throw new GroqError('The Groq API is unreachable. Check your internet and retry.', 502)
  if (!res.ok) {
    let message = `Groq error ${res.status}`
    try { message = (await res.json())?.error?.message || message } catch {}
    throw new GroqError(message, res.status)
  }
  return res.json()
}

/** One chat completion; returns the message text. If JSON mode is rejected, retries without it. */
export async function groqText(body: Record<string, unknown>): Promise<string> {
  try {
    const data = await call(body)
    return data?.choices?.[0]?.message?.content ?? ''
  } catch (e) {
    if (e instanceof GroqError && e.status === 400 && body.response_format) {
      const { response_format: _drop, ...rest } = body
      const data = await call(rest)
      return data?.choices?.[0]?.message?.content ?? ''
    }
    throw e
  }
}
