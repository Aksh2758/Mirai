'use client'

import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', mark: '▦', active: true },
  { label: 'Studio', href: '/scanner', mark: '🔨' },
  { label: 'Internships', href: '/discover/internships', mark: '▣' },
  { label: 'Hackathons', href: '/discover/hackathons', mark: '◉' },
  { label: 'Tech Radar', href: '/tech-radar', mark: '◒' },
]

export default function Sidebar({ role }: { role?: string }) {
  const router = useRouter()

  return (
    <aside style={sidebarStyle}>
      <div style={{ height: 70, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 21, fontWeight: 950, color: '#fff', letterSpacing: -1.2 }}>
          Nirmaan<span style={{ color: '#52D273' }}>.</span>
        </div>
      </div>

      <nav style={{ paddingTop: 18 }}>
        {navItems.map((item) => (
          <a key={item.label} href={item.href} style={{ ...sidebarLinkStyle, ...(item.active ? sidebarLinkActiveStyle : {}) }}>
            <span style={{ width: 18, color: item.active ? '#fff' : 'rgba(255,255,255,0.32)' }}>{item.mark}</span>
            <span>{item.label}</span>
          </a>
        ))}
      </nav>

      <div style={{ marginTop: 'auto', padding: 16, borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 10, letterSpacing: 1.4, color: 'rgba(255,255,255,0.22)', textTransform: 'uppercase', marginBottom: 8 }}>Role Target</div>
        <div style={{ color: '#fff', fontSize: 12, fontWeight: 650 }}>{role || 'Project Builder'}</div>
        <button
          onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
          style={{ marginTop: 14, width: '100%', border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.55)', borderRadius: 10, padding: '9px 10px', fontSize: 12, cursor: 'pointer' }}
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}

const sidebarStyle: CSSProperties = {
  position: 'fixed',
  left: 0,
  top: 0,
  bottom: 0,
  width: 198,
  background: '#101010',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '18px 0 36px rgba(13,13,13,0.08)',
  zIndex: 10,
}

const sidebarLinkStyle: CSSProperties = {
  height: 38,
  padding: '0 15px',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  color: 'rgba(255,255,255,0.38)',
  textDecoration: 'none',
  fontSize: 12,
  borderRight: '3px solid transparent',
}

const sidebarLinkActiveStyle: CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  color: '#fff',
  borderRightColor: '#54D37A',
}
