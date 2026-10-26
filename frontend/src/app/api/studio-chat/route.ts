import { NextRequest, NextResponse } from 'next/server'

// Studio copilot proxy. The Groq key stays on the server (GROQ_API_KEY, never NEXT_PUBLIC_).
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const FAST_MODEL = process.env.GROQ_FAST_MODEL || 'openai/gpt-oss-20b'
const DEEP_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

export async function POST(req: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Add GROQ_API_KEY to frontend/.env.local and restart the dev server.' }, { status: 500 })
  }

  let body: { messages?: unknown; speed?: string; stream?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!Array.isArray(body.messages)) {
    return NextResponse.json({ error: 'Messages are required' }, { status: 400 })
  }

  const model = body.speed === 'fast' ? FAST_MODEL : DEEP_MODEL
  const upstream = await fetch(GROQ_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: body.messages, stream: !!body.stream }),
  }).catch(() => null)

  if (!upstream) {
    return NextResponse.json({ error: 'The Groq API is unreachable. Check your internet and retry.' }, { status: 502 })
  }
  if (!upstream.ok) {
    const detail = await upstream.text()
    let message = `Groq error ${upstream.status}`
    try { message = JSON.parse(detail)?.error?.message || message } catch {}
    return NextResponse.json({ error: message }, { status: upstream.status })
  }

  if (!body.stream) return NextResponse.json(await upstream.json())

  // Turn Groq's SSE stream into plain text chunks, which is what the copilot reads.
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  const stream = new ReadableStream({
    async start(controller) {
      const reader = upstream.body!.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const t = line.trim()
            if (!t.startsWith('data:')) continue
            const data = t.slice(5).trim()
            if (data === '[DONE]') continue
            try {
              const text = JSON.parse(data)?.choices?.[0]?.delta?.content
              if (text) controller.enqueue(encoder.encode(text))
            } catch {}
          }
        }
        controller.close()
      } catch (e) {
        controller.error(e)
      }
    },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' } })
}
