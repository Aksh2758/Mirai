'use client'
import type { InstructionPanelProps } from '@/lib/types'

// Simple markdown to JSX renderer — handles the subset we use
// Supports: ## headings, **bold**, `code`, - bullet lists, numbered lists, blank lines
function renderMarkdown(md: string): React.ReactNode[] {
  const lines = md.split('\n')
  const nodes: React.ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    // H2 heading
    if (line.startsWith('## ')) {
      nodes.push(
        <h2 key={i} style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginTop: 16, marginBottom: 6, letterSpacing: 0.2 }}>
          {line.slice(3)}
        </h2>
      )
      i++; continue
    }

    // H3 heading
    if (line.startsWith('### ')) {
      nodes.push(
        <h3 key={i} style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.7)', marginTop: 12, marginBottom: 4 }}>
          {line.slice(4)}
        </h3>
      )
      i++; continue
    }

    // Unordered list item
    if (line.startsWith('- ') || line.startsWith('* ')) {
      nodes.push(
        <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
          <span style={{ color: '#4ADE80', flexShrink: 0, marginTop: 1 }}>·</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
            {renderInlineMarkdown(line.slice(2))}
          </span>
        </div>
      )
      i++; continue
    }

    // Numbered list item (matches "1. " "2. " etc)
    if (/^\d+\.\s/.test(line)) {
      const numMatch = line.match(/^(\d+)\.\s(.*)$/)
      if (numMatch) {
        nodes.push(
          <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
            <span style={{ color: '#4ADE80', fontWeight: 700, fontSize: 12, flexShrink: 0, minWidth: 16 }}>
              {numMatch[1]}.
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>
              {renderInlineMarkdown(numMatch[2])}
            </span>
          </div>
        )
      }
      i++; continue
    }

    // Code block (``` ... ```)
    if (line.startsWith('```')) {
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      nodes.push(
        <pre key={i} style={{
          background: 'rgba(0,0,0,0.4)', borderRadius: 6, padding: '10px 12px',
          fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: '#4ADE80',
          overflowX: 'auto', marginTop: 8, marginBottom: 8, lineHeight: 1.6,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {codeLines.join('\n')}
        </pre>
      )
      i++; continue
    }

    // Empty line → spacer
    if (line.trim() === '') {
      nodes.push(<div key={i} style={{ height: 6 }} />)
      i++; continue
    }

    // Regular paragraph text
    nodes.push(
      <p key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginBottom: 4 }}>
        {renderInlineMarkdown(line)}
      </p>
    )
    i++
  }

  return nodes
}

// Renders inline markdown: **bold**, `code`, plain text
function renderInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  // Split on **bold** and `code` patterns
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    // Text before match
    if (match.index > last) {
      parts.push(text.slice(last, match.index))
    }
    const token = match[1]
    if (token.startsWith('**')) {
      parts.push(
        <strong key={match.index} style={{ color: '#fff', fontWeight: 600 }}>
          {token.slice(2, -2)}
        </strong>
      )
    } else if (token.startsWith('`')) {
      parts.push(
        <code key={match.index} style={{
          background: 'rgba(74,222,128,0.12)', color: '#4ADE80',
          fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5,
          padding: '1px 5px', borderRadius: 4,
        }}>
          {token.slice(1, -1)}
        </code>
      )
    }
    last = match.index + token.length
  }

  // Remaining text
  if (last < text.length) {
    parts.push(text.slice(last))
  }

  return parts.length === 1 ? parts[0] : <>{parts}</>
}

export default function InstructionPanel({
  step,
  userLevel,
  stepIndex,
  totalSteps,
  onComplete,
  completing,
}: InstructionPanelProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Step header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
            Step {stepIndex + 1} of {totalSteps}
          </div>
          <div style={{
            fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
            letterSpacing: 0.5, textTransform: 'uppercase',
            background: userLevel === 'Beginner'
              ? 'rgba(59,130,246,0.15)' : userLevel === 'Advanced'
              ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.15)',
            color: userLevel === 'Beginner'
              ? '#60A5FA' : userLevel === 'Advanced'
              ? '#F87171' : '#FCD34D',
          }}>
            {userLevel}
          </div>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', lineHeight: 1.3 }}>
          {step.title}
        </div>
      </div>

      {/* Instructions — scrollable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
        {renderMarkdown(step.instructions)}
      </div>

      {/* Complete step button — always visible at bottom */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
        <button
          onClick={onComplete}
          disabled={completing || step.status !== 'active'}
          style={{
            width: '100%',
            background: completing ? 'rgba(255,255,255,0.1)' : step.status === 'done' ? '#1A6B3C' : '#4ADE80',
            color: step.status === 'done' ? '#fff' : '#0D0D0D',
            border: 'none',
            borderRadius: 8,
            padding: '10px 0',
            fontSize: 13,
            fontWeight: 700,
            cursor: completing ? 'not-allowed' : step.status !== 'active' ? 'default' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {completing ? 'Marking done...' : step.status === 'done' ? '✓ Completed' : 'Complete Step →'}
        </button>

        {/* Adaptive hint based on level */}
        {userLevel === 'Beginner' && step.status === 'active' && (
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'center', marginTop: 8, lineHeight: 1.5 }}>
            Stuck? Ask the Copilot — it can write code directly into your editor.
          </p>
        )}
      </div>
    </div>
  )
}
