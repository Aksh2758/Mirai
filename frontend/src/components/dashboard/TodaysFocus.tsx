'use client'

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'

export interface FocusJob { job_id: string | number; title: string; company: string; match_pct: number }

interface Props {
  projectId?: string | number | null
  projectTitle?: string | null
  role?: string | null
  /** To-dos for the current Studio roadmap step. */
  buildTasks: string[]
  /** Top internship matches, turned into "apply" tasks. */
  jobs: FocusJob[]
  onNavigate: (href: string) => void
}

type Kind = 'build' | 'career' | 'mine'
type Filter = 'all' | Kind
interface Task { key: string; kind: Kind; text: string; sub: string; href?: string; cta?: string }
interface Custom { id: string; text: string }

const palette = { ink: '#0D1B14', muted: '#5C6B63', card: '#FFFFFF', line: '#E3EAE5', soft: '#EAF3EE', green: '#1A9D5A' }
const KIND_LABEL: Record<Kind, string> = { build: 'Build', career: 'Career', mine: 'Mine' }
const KIND_STYLE: Record<Kind, CSSProperties> = {
  build: { background: '#EAF3EE', color: '#2B5A43' },
  career: { background: '#DBEAFE', color: '#1E40AF' },
  mine: { background: '#F3E8FF', color: '#6B21A8' },
}
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' }, { id: 'build', label: 'Build' }, { id: 'career', label: 'Career' }, { id: 'mine', label: 'Mine' },
]

/** localStorage-backed state that is safe when storage is blocked. */
function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial)
  const ready = useRef(false)
  useEffect(() => {
    try { const raw = window.localStorage.getItem(key); if (raw !== null) setValue(JSON.parse(raw) as T) } catch { /* ignore */ }
    ready.current = true
  }, [key])
  useEffect(() => {
    if (!ready.current) return
    try { window.localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
  }, [key, value])
  return [value, setValue] as const
}

/** Shows `code` spans as chips instead of raw backticks. */
function rich(text: string) {
  return text.split(/(`[^`]+`)/g).filter(Boolean).map((p, i) =>
    p.startsWith('`') && p.endsWith('`')
      ? <code key={i} style={codeStyle}>{p.slice(1, -1)}</code>
      : <span key={i}>{p}</span>,
  )
}

export default function TodaysFocus({ projectId, projectTitle, role, buildTasks, jobs, onNavigate }: Props) {
  const [done, setDone] = useStored<Record<string, boolean>>('nd-done-tasks', {})
  const [custom, setCustom] = useStored<Custom[]>('nd-custom-tasks', [])
  const [filter, setFilter] = useState<Filter>('all')
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const tasks: Task[] = useMemo(() => {
    const build: Task[] = buildTasks.slice(0, 2).map((t) => ({
      key: `${projectId ?? 'none'}:${t}`, kind: 'build', text: t, sub: projectTitle || 'Project workflow',
    }))
    const career: Task[] = jobs.slice(0, 2).map((j) => ({
      key: `job:${j.job_id}`, kind: 'career', text: `Apply to ${j.title}`, sub: `${j.company} · ${j.match_pct}% match`,
      href: '/discover/internships', cta: 'Open',
    }))
    if (!career.length) {
      career.push({ key: 'career:browse', kind: 'career', text: 'Find 3 internships worth applying to', sub: 'Discovery Hub', href: '/discover/internships', cta: 'Browse' })
    }
    // interleave so applying is always visible next to building
    const mixed: Task[] = []
    for (let i = 0; i < Math.max(build.length, career.length); i++) {
      if (build[i]) mixed.push(build[i])
      if (career[i]) mixed.push(career[i])
    }
    const mine: Task[] = custom.map((c) => ({ key: `custom:${c.id}`, kind: 'mine', text: c.text, sub: 'Added by you' }))
    return [...mixed, ...mine]
  }, [buildTasks, jobs, custom, projectId, projectTitle])

  const doneCount = tasks.filter((t) => done[t.key]).length
  const careerCount = tasks.filter((t) => t.kind === 'career').length
  const visible = tasks.filter((t) => filter === 'all' || t.kind === filter)
  const toggle = (key: string) => setDone((d) => ({ ...d, [key]: !d[key] }))

  function addTask() {
    const text = draft.trim()
    if (!text) { setAdding(false); return }
    setCustom((c) => [...c, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, text: text.slice(0, 120) }])
    setDraft('')
    setFilter('all')
    inputRef.current?.focus()
  }

  function removeCustom(key: string) {
    setCustom((c) => c.filter((x) => `custom:${x.id}` !== key))
    setDone((d) => { const n = { ...d }; delete n[key]; return n })
  }

  return (
    <div style={cardStyle}>
      <div style={headRow}>
        <span style={titleStyle}>Today&apos;s Focus</span>
        <span style={pillGreen}>{doneCount} of {tasks.length} Done</span>
      </div>
      <p style={{ fontSize: 12, color: palette.muted, margin: '8px 0 12px', lineHeight: 1.5 }}>
        Build your project and keep applying for your {role || 'target'} role.
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)} style={filter === f.id ? tabActive : tab}>{f.label}</button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {visible.length === 0 && <div style={{ fontSize: 12.5, color: palette.muted, padding: '6px 0' }}>Nothing here yet. Add your own task below.</div>}
        {visible.map((t) => {
          const isDone = !!done[t.key]
          return (
            <div
              key={t.key}
              role="checkbox"
              aria-checked={isDone}
              tabIndex={0}
              onClick={() => toggle(t.key)}
              onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(t.key) } }}
              style={{ display: 'flex', gap: 12, alignItems: 'flex-start', cursor: 'pointer' }}
            >
              <div style={{ ...checkBox, ...(isDone ? checkDone : {}) }}>{isDone && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.35, color: isDone ? palette.muted : palette.ink, textDecoration: isDone ? 'line-through' : 'none' }}>
                  {rich(t.text)}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, minWidth: 0 }}>
                  <span style={{ ...kindChip, ...KIND_STYLE[t.kind] }}>{KIND_LABEL[t.kind]}</span>
                  <span style={{ fontSize: 11, color: palette.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.sub}</span>
                </div>
              </div>
              {t.href && (
                <button onClick={(e) => { e.stopPropagation(); onNavigate(t.href!) }} style={linkBtn}>{t.cta} →</button>
              )}
              {t.kind === 'mine' && (
                <button
                  aria-label="Remove task"
                  title="Remove task"
                  onClick={(e) => { e.stopPropagation(); removeCustom(t.key) }}
                  style={{ ...linkBtn, color: palette.muted, fontSize: 16, lineHeight: 1 }}
                >×</button>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ marginTop: 18, borderTop: `1px solid ${palette.line}`, paddingTop: 14 }}>
        {adding ? (
          <form onSubmit={(e) => { e.preventDefault(); addTask() }} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              ref={inputRef}
              autoFocus
              value={draft}
              maxLength={120}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setDraft(''); setAdding(false) } }}
              placeholder="e.g. Update resume, message a recruiter"
              style={inputStyle}
            />
            <button type="submit" style={addBtn}>Add</button>
            <button type="button" onClick={() => { setDraft(''); setAdding(false) }} style={{ ...linkBtn, color: palette.muted }}>Cancel</button>
          </form>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11.5, color: palette.muted }}>
              {careerCount} career task{careerCount === 1 ? '' : 's'} alongside your project
            </span>
            <button onClick={() => setAdding(true)} style={{ ...linkBtn, fontSize: 12.5 }}>+ Add Custom Task</button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ───────── styles (same palette as the dashboard page) ───────── */
const cardStyle: CSSProperties = { background: palette.card, border: `1px solid ${palette.line}`, borderRadius: 16, boxShadow: '0 1px 4px rgba(13,27,20,0.05)', padding: 22 }
const headRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const titleStyle: CSSProperties = { fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }
const pillGreen: CSSProperties = { background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }
const tab: CSSProperties = { background: '#F3F7F4', border: `1px solid ${palette.line}`, borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', color: palette.muted }
const tabActive: CSSProperties = { ...tab, background: palette.green, color: '#fff', border: `1px solid ${palette.green}` }
const checkBox: CSSProperties = { width: 18, height: 18, borderRadius: 5, border: `1.8px solid ${palette.green}`, flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff' }
const checkDone: CSSProperties = { background: palette.green }
const kindChip: CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: 0.4, padding: '1px 7px', borderRadius: 999, flexShrink: 0 }
const codeStyle: CSSProperties = { background: palette.soft, color: '#2B5A43', borderRadius: 5, padding: '1px 6px', fontSize: 12, fontFamily: 'Menlo, Consolas, monospace' }
const linkBtn: CSSProperties = { background: 'transparent', border: 'none', color: palette.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }
const inputStyle: CSSProperties = { flex: 1, minWidth: 0, height: 36, borderRadius: 9, border: `1px solid ${palette.green}`, background: '#fff', color: palette.ink, padding: '0 12px', fontSize: 13, outline: 'none' }
const addBtn: CSSProperties = { height: 36, padding: '0 14px', borderRadius: 9, border: 'none', background: palette.ink, color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
