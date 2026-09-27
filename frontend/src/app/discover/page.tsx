'use client'

import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'

export default function DiscoverPage() {
  const router = useRouter()
  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div style={eyebrowStyle}>Discovery Hub</div>
        <h1 style={titleStyle}>Choose the opportunity track you want.</h1>
        <p style={leadStyle}>Internships and hackathons now live in separate routes because their filters, data shapes, and matching logic are different.</p>
        <div style={gridStyle}>
          <button onClick={() => router.push('/discover/internships')} style={cardStyle}>
            <span style={tagStyle}>JSearch/RapidAPI</span>
            <strong>Internships</strong>
            <p>Skill-match scoring against your profile, scanner role, and active project stack.</p>
          </button>
          <button onClick={() => router.push('/discover/hackathons')} style={cardStyle}>
            <span style={tagStyle}>Devfolio + Unstop + Hack Club</span>
            <strong>Hackathons</strong>
            <p>India-first competitions with filters for team size, date, duration, and online/offline mode.</p>
          </button>
        </div>
      </section>
    </main>
  )
}

const pageStyle: CSSProperties = { minHeight: '100vh', background: '#F4EFE6', color: '#141414', padding: '40px clamp(18px, 5vw, 64px)', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
const heroStyle: CSSProperties = { maxWidth: 980, margin: '0 auto' }
const eyebrowStyle: CSSProperties = { color: '#1E714A', fontSize: 11, fontWeight: 950, letterSpacing: 1.4, textTransform: 'uppercase' }
const titleStyle: CSSProperties = { margin: '8px 0 10px', fontSize: 'clamp(36px, 6vw, 64px)', letterSpacing: -2.4, lineHeight: 0.96 }
const leadStyle: CSSProperties = { color: '#6F6B64', margin: 0, fontSize: 15, lineHeight: 1.6, maxWidth: 720 }
const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 18, marginTop: 28 }
const cardStyle: CSSProperties = { background: '#FFFDF8', border: '1px solid #E2DCD0', borderRadius: 24, padding: 24, textAlign: 'left', cursor: 'pointer', minHeight: 220, display: 'flex', flexDirection: 'column', gap: 12, color: '#141414' }
const tagStyle: CSSProperties = { alignSelf: 'flex-start', background: '#DDEFE4', color: '#1E714A', borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 900 }
