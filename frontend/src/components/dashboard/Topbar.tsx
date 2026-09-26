'use client'

import type { CSSProperties } from 'react'

const palette = {
  ink: '#0D0D0D',
  mutedInk: '#6F6B64',
  paper: '#F5F1EA',
  card: '#FFFDF9',
  line: '#E1DDD4',
  soft: '#EEEAE2',
  green: '#197247',
  greenSoft: '#DFF1E8',
  amber: '#D99A22',
}

interface TopbarProps {
  onDeployClick: () => void
  hasActiveProject: boolean
  xp: number
  initials: string
}

export default function Topbar({ onDeployClick, hasActiveProject, xp, initials }: TopbarProps) {
  return (
    <div style={topActionBarStyle}>
      <button onClick={onDeployClick} style={deployButtonStyle}>
        {hasActiveProject ? 'Open Studio' : 'Start Project'}
        <span style={{ opacity: 0.75 }}>↗</span>
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: palette.mutedInk, fontSize: 12 }}>
        <span style={{ color: palette.amber }}>●</span> Light
      </div>
      <XpScore xp={xp} />
      <div style={avatarStyle}>{initials}</div>
    </div>
  )
}

function XpScore({ xp }: { xp: number }) {
  return (
    <div style={{ background: palette.ink, color: '#fff', borderRadius: 9, padding: '6px 16px 7px', minWidth: 80, textAlign: 'center', boxShadow: '0 10px 22px rgba(13,13,13,0.18)' }}>
      <div style={{ fontSize: 8, color: 'rgba(255,255,255,0.42)', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 1 }}>XP Score</div>
      <div style={{ fontSize: 18, fontWeight: 950, letterSpacing: 0.5, lineHeight: 1 }}>{xp.toLocaleString()}</div>
    </div>
  )
}

const topActionBarStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 28,
  height: 58,
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  zIndex: 8,
}

const deployButtonStyle: CSSProperties = {
  background: palette.ink,
  color: '#fff',
  border: 'none',
  borderRadius: '0 0 10px 10px',
  minWidth: 204,
  height: 42,
  padding: '0 18px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  fontSize: 13,
  fontWeight: 800,
  cursor: 'pointer',
}

const avatarStyle: CSSProperties = {
  width: 34,
  height: 34,
  borderRadius: 9,
  background: palette.greenSoft,
  color: palette.green,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 900,
}
