import { NextRequest, NextResponse } from 'next/server'
import { DEEP_MODEL, GroqError, groqText } from '@/components/studio/lab/groqServer'

export async function POST(req: NextRequest) {
  try {
    const { code, line, language, lineText } = await req.json()
    if (!code || typeof line !== 'number') {
      return NextResponse.json({ error: 'Code and line number are required' }, { status: 400 })
    }

    const actualLineText = lineText || code.split('\n')[line - 1] || ''
    if (!actualLineText.trim()) {
      return NextResponse.json({ explanation: 'This line is empty.', concept: 'Blank Space' })
    }

    const systemPrompt = `You are a code analyst. Explain the specific target line of code.

RULES:
1. EXTREMELY BRIEF: Max 2 short sentences.
2. Focus ONLY on the target line.
3. State the core programming concept it uses.

Code Context (${language}):
${code}

Target Line Number: ${line}
Target Line Text: \`${actualLineText}\`

Return EXACTLY this JSON structure and nothing else:
{
  "explanation": "string (the short explanation)",
  "concept": "string (1-3 words)"
}`

    const text = await groqText({
      model: DEEP_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Please explain line ${line}: \`${actualLineText}\`` },
      ],
      reasoning_effort: 'low',
      temperature: 0.1,
      response_format: { type: 'json_object' },
    })

    // Tolerate a code fence or extra words around the JSON
    const match = text.match(/\{[\s\S]*\}/)
    const result = JSON.parse(match ? match[0] : '{}')
    return NextResponse.json(result)
  } catch (error: unknown) {
    const status = error instanceof GroqError ? error.status : 500
    const message = error instanceof Error ? error.message : 'Explain line failed'
    return NextResponse.json({ error: message }, { status })
  }
}
