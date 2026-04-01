'use client'
import { useRef, useEffect, useState } from 'react'
import { useStudioStore } from '@/store/studioStore'
import type { RoadmapStep, CopilotMessage } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_API_URL

interface Props {
  projectId: string
  currentStep: RoadmapStep | undefined
  currentCode: string
}

export default function CopilotPane({ projectId, currentStep, currentCode }: Props) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const { messages, addMessage, appendToLastMessage, setLastMessageCodeBlock, isStreaming, setIsStreaming, setShowCopilot } = useStudioStore()

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function sendMessage() {
    if (!input.trim() || isStreaming) return

    const userMsg: CopilotMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date().toISOString(),
    }

    addMessage(userMsg)
    setInput('')
    setIsStreaming(true)

    // Add empty assistant message to stream into
    const assistantMsg: CopilotMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }
    addMessage(assistantMsg)

    try {
      // Get auth token
      const { supabase } = await import('@/lib/supabaseClient')
      const { data: { session } } = await supabase.auth.getSession()

      const response = await fetch(`${BASE}/studio/copilot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          project_id: projectId,
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          current_code: currentCode,
          current_step_title: currentStep?.title ?? '',
          current_step_instructions: currentStep?.instructions ?? '',
        }),
      })

      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') break
            try {
              const parsed = JSON.parse(data)
              if (parsed.content) {
                appendToLastMessage(parsed.content)
                fullContent += parsed.content
              }
            } catch {}
          }
        }
      }

      // Extract code block from the full response for "Apply Fix"
      const codeBlockMatch = fullContent.match(/```[\w.]*\n([\s\S]*?)```/)
      if (codeBlockMatch) {
        setLastMessageCodeBlock(codeBlockMatch[1])
      }
    } catch (e: any) {
      appendToLastMessage(`\n\nError: ${e.message}`)
    } finally {
      setIsStreaming(false)
    }
  }

  function applyFix(code: string) {
    const editor = (window as any).__nirmaanEditor
    if (!editor) return

    // Replace entire editor content with the fix
    const model = editor.getModel()
    if (!model) return

    editor.executeEdits('copilot', [{
      range: model.getFullModelRange(),
      text: code,
    }])
  }

  return (
    <div style={{ background: '#111', borderLeft: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ background: '#1A1A1A', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: 1 }}>✦ Copilot</span>
        <button
          onClick={() => setShowCopilot(false)}
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 18 }}
        >
          ×
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {messages.length === 0 && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 40, lineHeight: 1.6 }}>
            Ask anything about this step.<br />
            I can write code directly into your editor.
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
            <div style={{
              padding: '12px 14px', borderRadius: 12, fontSize: 13, lineHeight: 1.6,
              background: msg.role === 'user' ? '#1A6B3C' : 'rgba(255,255,255,0.05)',
              color: 'rgba(255,255,255,0.8)',
              maxWidth: '90%',
              whiteSpace: 'pre-wrap',
            }}>
              {msg.content}
              {isStreaming && i === messages.length - 1 && msg.role === 'assistant' && (
                <span style={{ animation: 'blink 1s infinite', opacity: 0.7 }}>▌</span>
              )}
            </div>

            {/* Apply Fix button — only shown on assistant messages with code */}
            {msg.role === 'assistant' && msg.code_block && (
              <button
                onClick={() => applyFix(msg.code_block!)}
                style={{
                  marginTop: 8, background: '#4ADE80', color: '#0D0D0D', border: 'none',
                  borderRadius: 8, padding: '6px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'transform 0.1s active',
                }}
              >
                ⚡ Apply Fix
              </button>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: 16, display: 'flex', gap: 10, background: '#1A1A1A', flexShrink: 0 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="Ask anything..."
          disabled={isStreaming}
          style={{
            flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#fff', outline: 'none'
          }}
        />
        <button
          onClick={sendMessage}
          disabled={isStreaming || !input.trim()}
          style={{ 
            background: isStreaming ? 'rgba(255,255,255,0.1)' : '#4ADE80', 
            color: '#0D0D0D', border: 'none', borderRadius: 10, padding: '0 14px', 
            cursor: 'pointer', fontWeight: 800, fontSize: 16,
            transition: 'all 0.2s'
          }}
        >
          ↑
        </button>
      </div>
      <style>{`@keyframes blink { 0% { opacity: 1; } 50% { opacity: 0; } 100% { opacity: 1; } }`}</style>
    </div>
  )
}
