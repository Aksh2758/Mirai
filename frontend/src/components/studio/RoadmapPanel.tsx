'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, CheckCircle2, Compass, Lock } from 'lucide-react'
import type { Project, RoadmapStep } from '@/lib/types'

/* ───────── helpers ───────── */

/** Renders `code` and **bold** inside plain text. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, i) => {
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i} style={codeStyle}>{part.slice(1, -1)}</code>
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i} style={{ color: '#e6edf3' }}>{part.slice(2, -2)}</strong>
    return <span key={i}>{part}</span>
  })
}

/** Splits the mentor text into a description, bullet tasks and the "you'll know this works when" check. */
function parseInstructions(raw: string | undefined) {
  const text = (raw || '').trim()
  const marker = /\*\*\s*You['’]ll know this works when\.{0,3}\s*\*\*/i
  const m = text.match(marker)
  let body = text
  let check = ''
  if (m && m.index !== undefined) {
    body = text.slice(0, m.index).trim()
    check = text.slice(m.index + m[0].length).trim()
    check = check.charAt(0).toUpperCase() + check.slice(1)
  }
  const parts = body.split(/\n\s*[-*•]\s+|\s-\s+(?=[A-Z`])/)
  const description = (parts.shift() || '').trim()
  const bullets = parts.map((s) => s.trim()).filter(Boolean)
  return { description, bullets, check }
}

/* ───────── component ───────── */

interface Props {
  project: Project
  currentStep: RoadmapStep | undefined
  onComplete: () => void
  completing: boolean
}

export default function RoadmapPanel({ project, onComplete, completing }: Props) {
  const total = project.steps.length
  const completed = project.steps.filter((s) => s.status === 'done').length
  const progress = total ? Math.round((completed / total) * 100) : 0
  const activeRef = useRef<HTMLDivElement | null>(null)
  const [open, setOpen] = useState<Record<string, boolean>>({})

  // keep the active step in view when the step changes
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [project.current_step])

  return (
    <aside style={panelStyle}>
      <style>{`@keyframes rp-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}`}</style>

      <div style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={pillStyle}><Compass size={12} /> Project Roadmap</span>
          <span style={{ color: '#7d8590', fontSize: 11 }}>Step {Math.min(project.current_step + 1, total)} of {total}</span>
        </div>
        <div style={{ color: '#f0f6fc', fontSize: 18, fontWeight: 800, lineHeight: 1.25, marginTop: 14 }}>{project.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, fontSize: 11, color: '#8b949e' }}>
          <span>Course Progression</span>
          <strong style={{ color: '#38bdf8' }}>{progress}%</strong>
        </div>
        <div style={trackStyle}>
          <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,#1e9bff,#38bdf8)', borderRadius: 999, transition: 'width .6s' }} />
        </div>
      </div>

      <div style={listStyle}>
        {project.steps.map((step, index) => {
          const active = index === project.current_step && step.status !== 'done'
          const done = step.status === 'done'
          const locked = step.status === 'locked'
          const expanded = active || !!open[step.id]
          const number = String(index + 1).padStart(2, '0')
          const info = parseInstructions(step.instructions)

          if (locked) {
            return (
              <div key={step.id} style={{ ...cardStyle, opacity: 0.55 }}>
                <div style={rowStyle}>
                  <span style={lockBoxStyle}><Lock size={14} color="#6e7681" /></span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: '#8b949e', fontSize: 14, fontWeight: 700 }}>{step.title}</div>
                    <div style={statusTextStyle('#6e7681')}>Locked</div>
                  </div>
                </div>
              </div>
            )
          }

          return (
            <div
              key={step.id}
              ref={active ? activeRef : undefined}
              style={{ ...cardStyle, ...(active ? activeCardStyle : {}) }}
            >
              <div
                role={active ? undefined : 'button'}
                onClick={active ? undefined : () => setOpen((o) => ({ ...o, [step.id]: !o[step.id] }))}
                style={{ ...rowStyle, cursor: active ? 'default' : 'pointer' }}
              >
                {done ? (
                  <span style={{ ...lockBoxStyle, borderColor: 'rgba(63,185,80,0.4)', background: 'rgba(63,185,80,0.1)' }}><CheckCircle2 size={16} color="#3fb950" /></span>
                ) : (
                  <span style={{ ...lockBoxStyle, borderColor: 'rgba(56,189,248,0.5)', background: 'rgba(30,155,255,0.15)' }}><ChevronRight size={15} color="#38bdf8" /></span>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  {active && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <span style={{ color: '#6e7681', fontSize: 10, fontWeight: 800, letterSpacing: 1 }}>STEP {number}</span>
                      <span style={activeTagStyle}>Active</span>
                      <span style={{ marginLeft: 'auto', color: '#38bdf8', fontSize: 10, fontWeight: 800, letterSpacing: 0.6, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#38bdf8' }} /> IN PROGRESS
                      </span>
                    </div>
                  )}
                  <div style={{ color: '#f0f6fc', fontSize: active ? 15 : 14, fontWeight: 800 }}>{step.title}</div>
                  {done && <div style={statusTextStyle('#3fb950')}>Completed</div>}
                  {!done && !active && <div style={statusTextStyle('#8b949e')}>Ready</div>}
                </div>
                {!active && (expanded ? <ChevronDown size={15} color="#6e7681" /> : <ChevronRight size={15} color="#6e7681" />)}
              </div>

              {expanded && (
                <div style={{ marginTop: 12, animation: 'rp-in .2s ease both' }}>
                  {info.description ? (
                    <p style={{ margin: 0, color: '#adbac7', fontSize: 13, lineHeight: 1.65 }}>{inline(info.description)}</p>
                  ) : (
                    <p style={{ margin: 0, color: '#6e7681', fontSize: 13 }}>No instructions for this step yet.</p>
                  )}
                  {info.bullets.length > 0 && (
                    <ul style={{ margin: '10px 0 0', paddingLeft: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
                      {info.bullets.map((b, i) => (
                        <li key={i} style={{ display: 'flex', gap: 9, color: '#adbac7', fontSize: 13, lineHeight: 1.55 }}>
                          <span style={{ color: '#38bdf8', marginTop: 1 }}>•</span>
                          <span>{inline(b)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {info.check && (
                    <div style={checkBoxStyle}>
                      <strong style={{ color: '#e6edf3' }}>Acceptance check:</strong>{' '}
                      <span style={{ color: '#8b949e' }}>{inline(info.check)}</span>
                    </div>
                  )}
                  {active && (
                    <button onClick={onComplete} disabled={completing} style={{ ...checkButtonStyle, opacity: completing ? 0.65 : 1 }}>
                      {completing ? 'Checking...' : 'Check step & Continue'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </aside>
  )
}

/* ───────── styles ───────── */

const panelStyle: CSSProperties = { height: '100%', background: '#0a0f1a', borderRight: '1px solid #1c2736', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }
const headerStyle: CSSProperties = { padding: '16px 18px 18px', borderBottom: '1px solid #1c2736', flexShrink: 0 }
const pillStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid rgba(56,189,248,0.35)', background: 'rgba(30,155,255,0.08)', color: '#38bdf8', borderRadius: 999, padding: '4px 11px', fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }
const trackStyle: CSSProperties = { height: 4, borderRadius: 999, background: '#1c2736', marginTop: 8, overflow: 'hidden' }
const listStyle: CSSProperties = { flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'grid', gap: 10, alignContent: 'start' }
const cardStyle: CSSProperties = { background: '#0e1522', border: '1px solid #1c2736', borderRadius: 12, padding: '12px 14px' }
const activeCardStyle: CSSProperties = { border: '1px solid rgba(56,189,248,0.55)', background: 'linear-gradient(180deg, rgba(14,99,156,0.18), #0e1522 55%)', boxShadow: '0 0 0 1px rgba(56,189,248,0.08), 0 8px 24px rgba(0,0,0,0.35)', padding: 16 }
const rowStyle: CSSProperties = { display: 'flex', alignItems: 'center', gap: 12 }
const lockBoxStyle: CSSProperties = { width: 30, height: 30, borderRadius: 8, border: '1px solid #243244', background: '#111a28', display: 'grid', placeItems: 'center', flexShrink: 0 }
const statusTextStyle = (color: string): CSSProperties => ({ color, fontSize: 10, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 3 })
const activeTagStyle: CSSProperties = { background: 'rgba(30,155,255,0.18)', color: '#58a6ff', borderRadius: 6, padding: '2px 8px', fontSize: 10, fontWeight: 700 }
const codeStyle: CSSProperties = { background: 'rgba(110,118,129,0.2)', color: '#79c0ff', borderRadius: 5, padding: '1px 6px', fontSize: 12, fontFamily: 'Menlo, Monaco, Consolas, monospace' }
const checkBoxStyle: CSSProperties = { marginTop: 14, background: '#0a111d', border: '1px solid #1c2736', borderLeft: '2px solid #38bdf8', borderRadius: 8, padding: '10px 12px', fontSize: 12, lineHeight: 1.6 }
const checkButtonStyle: CSSProperties = { width: '100%', marginTop: 14, height: 38, border: 'none', borderRadius: 9, background: 'linear-gradient(90deg,#1e8ae6,#1e9bff)', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 4px 14px rgba(30,155,255,0.3)' }