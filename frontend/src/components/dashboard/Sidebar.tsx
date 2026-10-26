'use client'

import type { CSSProperties, ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

const icon = (d: ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: icon(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>) },
  { label: 'Studio', href: '/studio', icon: icon(<><path d="M8 7l-5 5 5 5" /><path d="M16 7l5 5-5 5" /></>) },
  { label: 'Internships', href: '/discover/internships', icon: icon(<><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" /></>) },
  { label: 'Hackathons', href: '/discover/hackathons', icon: icon(<><path d="M8 21h8M12 17v4" /><path d="M7 4h10v5a5 5 0 01-10 0V4z" /><path d="M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3" /></>) },
  { label: 'Tech Radar', href: '/tech-radar', icon: icon(<><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3 3-5 6-5s6 2 6 5" /><path d="M16 5a3 3 0 010 6M18 15c2 .6 3 2.2 3 5" /></>) },
]

export default function Sidebar({ role, name, initials }: { role?: string; name?: string; initials?: string }) {
  const router = useRouter()
  const pathname = usePathname()

  return (
    <aside style={sidebarStyle}>
      <div style={{ height: 84, display: 'flex', alignItems: 'center', padding: '0 26px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: -0.8 }}>
          Nirmaan<span style={{ color: '#52D273' }}>.</span>
        </div>
      </div>

      <nav style={{ padding: '20px 0' }}>
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href))
          return (
            <Link key={item.label} href={item.href} style={{ ...linkStyle, ...(active ? linkActiveStyle : {}) }}>
              <span style={{ display: 'flex', color: active ? '#52D273' : 'rgba(255,255,255,0.55)' }}>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <div style={{ marginTop: 'auto' }}>
        <div style={{ padding: '18px 26px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 10, letterSpacing: 1.4, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginBottom: 8 }}>Role Target</div>
          <div style={{ color: '#fff', fontSize: 13, fontWeight: 650 }}>{role || 'Project Builder'}</div>
        </div>
        <div style={{ padding: '16px 20px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={avatarCircle}>{initials || 'A'}</div>
          <div style={{ flex: 1, minWidth: 0, color: '#fff', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          <button
            title="Sign out"
            onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 16 }}
          >
            ⎋
          </button>
        </div>
      </div>
    </aside>
  )
}

const sidebarStyle: CSSProperties = {
  position: 'fixed', left: 0, top: 0, bottom: 0, width: 224, background: '#0B0B0B',
  display: 'flex', flexDirection: 'column', zIndex: 10,
}
const linkStyle: CSSProperties = {
  height: 44, margin: '2px 14px', padding: '0 14px', display: 'flex', alignItems: 'center', gap: 14,
  color: 'rgba(255,255,255,0.78)', textDecoration: 'none', fontSize: 14, borderRadius: 8,
}
const linkActiveStyle: CSSProperties = {
  background: 'rgba(82,210,115,0.12)', color: '#fff', boxShadow: 'inset -3px 0 0 #52D273',
}
const avatarCircle: CSSProperties = {
  width: 36, height: 36, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,0.7)', color: '#fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0,
}
