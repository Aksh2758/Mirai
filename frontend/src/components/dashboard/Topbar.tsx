'use client'

import type { CSSProperties } from 'react'

interface TopbarProps {
  displayName: string
  xp: number
  initials: string
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Topbar({ displayName, xp, initials }: TopbarProps) {
  const first = displayName.split(/\s+/)[0]
  return (
    <header style={headerWrap}>
      {/* Left: greeting */}
      <div>
        <h1 style={greetH1}>
          {greeting()},{' '}
          <span style={{ color: '#0D1B14' }}>{first}</span>
        </h1>
        <p style={greetSub}>Every small step builds your data portfolio.</p>
      </div>

      {/* Right: search + status + XP + avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={searchWrap}>
          <span style={{ color: '#9CA3AF', fontSize: 14 }}>🔍</span>
          <input
            placeholder="Search tasks, datasets, specs…"
            style={searchInput}
          />
          <span style={kbdBadge}>⌘K</span>
        </div>

        {/* Online dot */}
        <div style={onlineDot} title="Online" />

        {/* XP badge */}
        <div style={xpBadge}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, color: 'rgba(255,255,255,0.55)', display: 'block' }}>XP</span>
          <span style={{ fontSize: 18, fontWeight: 800, lineHeight: 1 }}>{xp.toLocaleString()}</span>
        </div>

        {/* Avatar */}
        <div style={avatarStyle} title={displayName}>{initials.slice(0, 1)}</div>
      </div>
    </header>
  )
}

const headerWrap: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  gap: 24, marginBottom: 24,
}
const greetH1: CSSProperties = {
  margin: 0, fontSize: 24, fontWeight: 800, letterSpacing: -0.5, color: '#0D1B14',
}
const greetSub: CSSProperties = {
  margin: '5px 0 0', color: '#5C6B63', fontSize: 13.5, lineHeight: 1.4,
}
const searchWrap: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8,
  background: '#fff', border: '1px solid #E3EAE5', borderRadius: 10,
  padding: '0 12px', height: 40, minWidth: 240,
}
const searchInput: CSSProperties = {
  border: 'none', outline: 'none', background: 'transparent',
  fontSize: 13, color: '#0D1B14', flex: 1, minWidth: 0,
}
const kbdBadge: CSSProperties = {
  background: '#F3F7F4', border: '1px solid #E3EAE5', borderRadius: 5,
  padding: '2px 6px', fontSize: 10, color: '#5C6B63', fontWeight: 600, whiteSpace: 'nowrap',
}
const onlineDot: CSSProperties = {
  width: 10, height: 10, borderRadius: '50%', background: '#22C55E',
  boxShadow: '0 0 0 3px rgba(34,197,94,0.2)',
}
const xpBadge: CSSProperties = {
  background: '#0B0B0B', color: '#fff', borderRadius: 10,
  padding: '8px 18px', textAlign: 'center',
}
const avatarStyle: CSSProperties = {
  width: 38, height: 38, borderRadius: '50%', background: '#0B0B0B', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 15, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
}