import { NextResponse } from 'next/server'
import { DEEP_MODEL, GroqError, groqText } from '@/components/studio/lab/groqServer'

// C++ and Java cannot run in the browser, so the model predicts the terminal output.
export async function POST(req: Request) {
  try {
    const { language, code } = await req.json()
    const output = await groqText({
      model: DEEP_MODEL,
      messages: [
        {
          role: 'system',
          content:
            'You are a perfect, deterministic compiler and execution engine. Predict the exact stdout terminal output of the provided code. If there is a compilation error, syntax error, or runtime exception, output the exact error message that a standard compiler would produce. RETURN ONLY the raw terminal output. Do not include markdown formatting, backticks, or any conversational explanations.',
        },
        { role: 'user', content: `Language: ${language}\n\nCode:\n${code}` },
      ],
      reasoning_effort: 'low',
      temperature: 0.1,
    })
    return NextResponse.json({ output })
  } catch (error: unknown) {
    const status = error instanceof GroqError ? error.status : 500
    const message = error instanceof Error ? error.message : 'unknown error'
    return NextResponse.json({ message: 'Output prediction failed: ' + message }, { status })
  }
}
