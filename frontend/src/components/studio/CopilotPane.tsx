'use client'
import { useRef, useEffect, useState, useCallback } from 'react'
import { useStudioStore } from '@/store/studioStore'
import { fetchChatHistory } from '@/lib/api'
import type { RoadmapStep, CopilotMessage, QuickAction, CodeBlock } from '@/lib/types'

const BASE = process.env.NEXT_PUBLIC_API_URL

interface Props {
  projectId: string
  currentStep: RoadmapStep | undefined
  currentCode: string
  allFilenames: string[]       // All open files — for context
  stepIndex: number
}

const QUICK_ACTIONS: { id: QuickAction; label: string; icon: string; color: string }[] = [
  { id: 'debug',      label: 'Debug',      icon: '🐛', color: '#F87171' },
  { id: 'explain',    label: 'Explain',    icon: '📖', color: '#60A5FA' },
  { id: 'optimize',   label: 'Optimize',   icon: '⚡', color: '#FACC15' },
  { id: 'next_hint',  label: 'Hint',       icon: '💡', color: '#4ADE80' },
]

export default function CopilotPane({
  projectId,
  currentStep,
  currentCode,
  allFilenames,
  stepIndex,
}: Props) {
  const [input, setInput] = useState('')
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [activeQuickAction, setActiveQuickAction] = useState<QuickAction | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const {
    messages, addMessage, appendToLastMessage,
    setLastMessageCodeBlocks,
    isStreaming, setIsStreaming,
    setShowCopilot,
    clearMessages,
  } = useStudioStore()

  // ── Auto-scroll on new messages ─────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Load persistent chat history on mount ───────────────────────────────
  useEffect(() => {
    if (historyLoaded || !projectId) return
    setHistoryLoaded(true)

    fetchChatHistory(projectId, undefined, 30)
      .then(({ messages: history }) => {
        if (history.length > 0 && messages.length === 0) {
          // Only restore if local store is empty (fresh page load)
          history.forEach((m: any) => {
            addMessage({
              role: m.role,
              content: m.content,
              timestamp: m.timestamp,
              step_id: m.step_id,
            })
          })
        }
      })
      .catch(() => {
        // Non-critical — if history fails, start fresh
      })
  }, [projectId, historyLoaded, messages.length, addMessage])

  // ── Send message (regular or quick action) ──────────────────────────────
  const sendMessage = useCallback(async (quickAction?: QuickAction) => {
    const text = quickAction ? `[${quickAction}]` : input.trim()
    if ((!text && !quickAction) || isStreaming) return

    // Show user message — for quick actions, show the label nicely
    const displayContent = quickAction
      ? QUICK_ACTIONS.find(a => a.id === quickAction)?.label + ' my code'
      : text

    const userMsg: CopilotMessage = {
      role: 'user',
      content: displayContent,
      timestamp: new Date().toISOString(),
      step_id: `step_${stepIndex + 1}`,
      is_quick_action: !!quickAction,
    }

    addMessage(userMsg)
    if (!quickAction) setInput('')
    setActiveQuickAction(quickAction || null)
    setIsStreaming(true)

    const assistantMsg: CopilotMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
      step_id: `step_${stepIndex + 1}`,
    }
    addMessage(assistantMsg)

    try {
      const { supabase } = await import('@/lib/supabaseClient')
      const { data: { session } } = await supabase.auth.getSession()

      // Build the messages array — all prior messages + current user message
      const priorMessages = messages
        .filter(m => m.content.trim())
        .map(m => ({ role: m.role, content: m.content }))

      // Add the actual content for quick actions
      const messagesPayload = quickAction
        ? [...priorMessages.slice(-8), { role: 'user', content: displayContent }]
        : [...priorMessages.slice(-10), { role: 'user', content: text }]

      const response = await fetch(`${BASE}/studio/copilot`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          project_id: projectId,
          messages: messagesPayload,
          current_code: currentCode,
          current_step_title: currentStep?.title ?? '',
          current_step_instructions: currentStep?.instructions ?? '',
          all_filenames: allFilenames,
          quick_action: quickAction ?? null,
        }),
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.detail || `Error ${response.status}`)
      }
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          const dataLine = event.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine) continue
          const data = dataLine.slice(6).trim()
          if (!data || data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data)

            if (parsed.content) {
              appendToLastMessage(parsed.content)
            }

            // code_blocks: multi-file apply fix
            if (parsed.code_blocks && Array.isArray(parsed.code_blocks)) {
              setLastMessageCodeBlocks(parsed.code_blocks as CodeBlock[])
            }
          } catch {}
        }
      }
    } catch (e: any) {
      appendToLastMessage(`\n\n⚠️ Error: ${e.message}`)
    } finally {
      setIsStreaming(false)
      setActiveQuickAction(null)
      inputRef.current?.focus()
    }
  }, [input, isStreaming, messages, projectId, currentCode, currentStep, allFilenames, stepIndex, addMessage, appendToLastMessage, setLastMessageCodeBlocks, setIsStreaming])

  // ── Apply Fix to specific file ──────────────────────────────────────────
  function applyCodeBlock(block: CodeBlock) {
    const editor = (window as any).__nirmaanEditor

    // If the code block targets a different file, switch to it first
    if (block.filename && block.filename !== (window as any).__nirmaanActiveFile) {
      const switchFile = (window as any).__nirmaanSwitchFile
      if (switchFile) switchFile(block.filename)
    }

    if (!editor) return
    const model = editor.getModel()
    if (!model) return

    editor.executeEdits('copilot-apply', [{
      range: model.getFullModelRange(),
      text: block.code,
    }])
    editor.focus()
  }

  // Legacy single code block apply (backward compat)
  function applyFix(code: string) {
    const editor = (window as any).__nirmaanEditor
    if (!editor) return
    const model = editor.getModel()
    if (!model) return
    editor.executeEdits('copilot', [{ range: model.getFullModelRange(), text: code }])
    editor.focus()
  }

  // ── Render markdown-ish message content ─────────────────────────────────
  function renderContent(content: string) {
    // Split on code fences
    const parts = content.split(/(```[\w./\-]*\n[\s\S]*?```)/g)
    return parts.map((part, i) => {
      const codeMatch = part.match(/```([\w./\-]*)\n([\s\S]*?)```/)
      if (codeMatch) {
        const lang = codeMatch[1]
        const code = codeMatch[2]
        return (
          <div key={i} style={{ margin: '8px 0', borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ background: '#1e1e1e', padding: '4px 10px', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              {lang || 'code'}
            </div>
            <pre style={{ margin: 0, padding: '10px 12px', background: '#141414', color: '#d4d4d4', fontSize: 12, fontFamily: 'monospace', overflowX: 'auto', lineHeight: 1.5 }}>
              {code}
            </pre>
          </div>
        )
      }
      // Regular text — render line breaks
      return (
        <span key={i} style={{ whiteSpace: 'pre-wrap' }}>
          {part}
        </span>
      )
    })
  }

  const isEmpty = messages.length === 0

  return (
    <div style={{ background: '#0f0f0f', borderLeft: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ background: '#161616', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 14 }}>✦</span>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: 1.5 }}>Copilot</span>
          {currentStep && (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: 10 }}>
              Step {stepIndex + 1}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {messages.length > 0 && (
            <button
              onClick={() => clearMessages()}
              title="Clear chat"
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 11, padding: '2px 6px', borderRadius: 4 }}
            >
              clear
            </button>
          )}
          <button
            onClick={() => setShowCopilot(false)}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Quick Action Buttons ────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, padding: '10px 12px 0', flexShrink: 0 }}>
        {QUICK_ACTIONS.map(action => (
          <button
            key={action.id}
            onClick={() => sendMessage(action.id)}
            disabled={isStreaming}
            title={action.label}
            style={{
              flex: 1,
              background: activeQuickAction === action.id
                ? `${action.color}22`
                : 'rgba(255,255,255,0.04)',
              border: `1px solid ${activeQuickAction === action.id ? action.color + '44' : 'rgba(255,255,255,0.07)'}`,
              borderRadius: 8,
              padding: '6px 4px',
              cursor: isStreaming ? 'not-allowed' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 2,
              opacity: isStreaming && activeQuickAction !== action.id ? 0.4 : 1,
              transition: 'all 0.15s',
            }}
          >
            <span style={{ fontSize: 14 }}>{action.icon}</span>
            <span style={{ fontSize: 9, fontWeight: 600, color: action.color, letterSpacing: 0.5 }}>
              {action.label.toUpperCase()}
            </span>
          </button>
        ))}
      </div>

      {/* ── Messages ────────────────────────────────────────────────────── */}
      <div
        style={{ flex: 1, overflowY: 'auto', padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        {isEmpty && (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 30, lineHeight: 1.8 }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>✦</div>
            Ask anything about this step<br />
            or use the quick actions above
            {currentStep && (
              <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '8px 12px', textAlign: 'left', fontSize: 11 }}>
                <div style={{ color: 'rgba(255,255,255,0.15)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 1, fontSize: 9 }}>Current Step</div>
                <div style={{ color: 'rgba(255,255,255,0.4)' }}>{currentStep.title}</div>
              </div>
            )}
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start', gap: 6 }}>

            {/* Role label */}
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'rgba(255,255,255,0.2)', textTransform: 'uppercase', marginBottom: 1 }}>
              {msg.role === 'user' ? 'You' : '✦ Copilot'}
              {msg.is_quick_action && (
                <span style={{ marginLeft: 6, color: 'rgba(255,255,255,0.15)', fontWeight: 400 }}>quick action</span>
              )}
            </div>

            {/* Message bubble */}
            <div style={{
              padding: '10px 13px',
              borderRadius: msg.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
              fontSize: 12.5,
              lineHeight: 1.65,
              background: msg.role === 'user'
                ? 'linear-gradient(135deg, #1A6B3C, #155a32)'
                : 'rgba(255,255,255,0.05)',
              color: msg.role === 'user' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.75)',
              maxWidth: '96%',
              border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.06)' : 'none',
            }}>
              {msg.role === 'assistant'
                ? renderContent(msg.content)
                : msg.content}
              {isStreaming && i === messages.length - 1 && msg.role === 'assistant' && msg.content === '' && (
                <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', padding: '2px 0' }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ADE80', animation: 'pulse 1s infinite' }} />
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ADE80', animation: 'pulse 1s 0.2s infinite' }} />
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4ADE80', animation: 'pulse 1s 0.4s infinite' }} />
                </span>
              )}
              {isStreaming && i === messages.length - 1 && msg.role === 'assistant' && msg.content !== '' && (
                <span style={{ animation: 'blink 1s infinite', opacity: 0.7, color: '#4ADE80' }}>▌</span>
              )}
            </div>

            {/* Apply Fix buttons for each code block */}
            {msg.role === 'assistant' && msg.code_blocks && msg.code_blocks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignSelf: 'flex-start' }}>
                {msg.code_blocks.map((block, bi) => (
                  <button
                    key={bi}
                    onClick={() => applyCodeBlock(block)}
                    style={{
                      background: 'rgba(74,222,128,0.12)',
                      color: '#4ADE80',
                      border: '1px solid rgba(74,222,128,0.25)',
                      borderRadius: 7,
                      padding: '5px 12px',
                      fontSize: 11,
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'all 0.15s',
                    }}
                  >
                    <span>⚡</span>
                    <span>Apply to {block.filename}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Legacy single code block */}
            {msg.role === 'assistant' && msg.code_block && !msg.code_blocks && (
              <button
                onClick={() => applyFix(msg.code_block!)}
                style={{
                  background: 'rgba(74,222,128,0.12)',
                  color: '#4ADE80',
                  border: '1px solid rgba(74,222,128,0.25)',
                  borderRadius: 7,
                  padding: '5px 12px',
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                ⚡ Apply Fix
              </button>
            )}
          </div>
        ))}

        <div ref={messagesEndRef} />
      </div>

      {/* ── Input Area ──────────────────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '10px 12px', background: '#161616', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => {
              setInput(e.target.value)
              // Auto-resize
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            placeholder={isStreaming ? 'Copilot is thinking...' : 'Ask anything... (Enter to send, Shift+Enter for newline)'}
            disabled={isStreaming}
            rows={1}
            style={{
              flex: 1,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 10,
              padding: '9px 13px',
              fontSize: 12.5,
              color: '#fff',
              outline: 'none',
              resize: 'none',
              fontFamily: 'inherit',
              lineHeight: 1.5,
              minHeight: 38,
              maxHeight: 120,
              overflowY: 'auto',
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={isStreaming || !input.trim()}
            style={{
              background: isStreaming
                ? 'rgba(255,255,255,0.08)'
                : input.trim()
                ? '#4ADE80'
                : 'rgba(255,255,255,0.06)',
              color: input.trim() && !isStreaming ? '#0D0D0D' : 'rgba(255,255,255,0.3)',
              border: 'none',
              borderRadius: 10,
              width: 38,
              height: 38,
              cursor: isStreaming || !input.trim() ? 'not-allowed' : 'pointer',
              fontWeight: 800,
              fontSize: 16,
              flexShrink: 0,
              transition: 'all 0.2s',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {isStreaming ? (
              <span style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#4ADE80', borderRadius: '50%', animation: 'spin 0.8s linear infinite', display: 'inline-block' }} />
            ) : '↑'}
          </button>
        </div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.12)', marginTop: 5, textAlign: 'right' }}>
          Chat history saved automatically
        </div>
      </div>

      <style>{`
        @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity: 0.3; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1.2); } }
      `}</style>
    </div>
  )
}
