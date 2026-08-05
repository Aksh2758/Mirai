'use client'

import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type RadarMode = 'buddy' | 'team' | 'doubt'

const modes: Array<{
  id: RadarMode
  title: string
  subtitle: string
  action: string
}> = [
  {
    id: 'buddy',
    title: 'Find a learning buddy',
    subtitle: 'Pair with someone learning the same stack or project path.',
    action: 'Create buddy post',
  },
  {
    id: 'team',
    title: 'Group up for competitions',
    subtitle: 'Build a small team for hackathons, sprints, and hiring challenges.',
    action: 'Start team callout',
  },
  {
    id: 'doubt',
    title: 'Ask or answer doubts',
    subtitle: 'Post blockers and get help from peers who already solved them.',
    action: 'Ask a doubt',
  },
]

const samplePosts: Record<RadarMode, Array<{ name: string; role: string; title: string; body: string; tags: string[]; time: string }>> = {
  buddy: [
    { name: 'Meera', role: 'Frontend learner', title: 'React + TypeScript accountability partner', body: 'Looking for someone to build mini projects with 4 days a week and review each other pull requests.', tags: ['React', 'TypeScript', 'Evening'], time: '12 min ago' },
    { name: 'Rohit', role: 'Backend learner', title: 'FastAPI and PostgreSQL study pair', body: 'I am following the API roadmap and want to discuss architecture and deployment every weekend.', tags: ['FastAPI', 'PostgreSQL', 'Weekend'], time: '34 min ago' },
  ],
  team: [
    { name: 'Aisha', role: 'AI builder', title: 'Need 2 members for a student hackathon', body: 'We have a designer and ML person. Need backend and frontend members for an education product sprint.', tags: ['Hackathon', 'Backend', 'Frontend'], time: '1 hr ago' },
    { name: 'Kabir', role: 'Full-stack dev', title: 'Open source sprint team', body: 'Creating a 3-person group to contribute to beginner-friendly Python issues this month.', tags: ['Open Source', 'Python', 'Remote'], time: '2 hrs ago' },
  ],
  doubt: [
    { name: 'Tanya', role: 'Project builder', title: 'JWT refresh token flow doubt', body: 'My access token refresh works locally but fails after deployment. Need someone to review the flow.', tags: ['Auth', 'JWT', 'Deployment'], time: '8 min ago' },
    { name: 'Dev', role: 'Interview prep', title: 'SQL join explanation needed', body: 'I can solve basic joins but get confused with subqueries in interview problems.', tags: ['SQL', 'Interview', 'Beginner'], time: '27 min ago' },
  ],
}

export default function TechRadarPage() {
  const router = useRouter()
  const [activeMode, setActiveMode] = useState<RadarMode>('buddy')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDetails, setDraftDetails] = useState('')

  const active = useMemo(() => modes.find((mode) => mode.id === activeMode) || modes[0], [activeMode])

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <button onClick={() => router.push('/dashboard')} style={backButtonStyle}>← Dashboard</button>
        <section style={heroStyle}>
          <div>
            <div style={eyebrowStyle}>Tech Radar</div>
            <h1 style={{ margin: '8px 0 10px', fontSize: 42, letterSpacing: -1.7, lineHeight: 1.04 }}>Find people for the next thing you want to build.</h1>
            <p style={leadStyle}>A lightweight networking space for Nirmaan learners to find a buddy, form competition teams, and solve doubts faster.</p>
          </div>
          <div style={heroCardStyle}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.52)', textTransform: 'uppercase', letterSpacing: 1.3 }}>Live Rooms</div>
            <div style={{ fontSize: 44, fontWeight: 950, marginTop: 8 }}>24</div>
            <div style={{ color: 'rgba(255,255,255,0.56)', fontSize: 13, lineHeight: 1.5 }}>Active learners available for discussions, hackathon matching, and roadmap accountability.</div>
          </div>
        </section>

        <section style={modeGridStyle}>
          {modes.map((mode) => (
            <button key={mode.id} onClick={() => setActiveMode(mode.id)} style={{ ...modeCardStyle, ...(mode.id === activeMode ? activeModeCardStyle : {}) }}>
              <div style={{ fontSize: 15, fontWeight: 900 }}>{mode.title}</div>
              <p style={{ margin: '7px 0 0', color: mode.id === activeMode ? 'rgba(255,255,255,0.66)' : '#6F6B64', fontSize: 12, lineHeight: 1.45 }}>{mode.subtitle}</p>
            </button>
          ))}
        </section>

        <section style={contentGridStyle}>
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>{active.title}</div>
                <h2 style={{ margin: '5px 0 0', fontSize: 24, letterSpacing: -0.7 }}>{active.action}</h2>
              </div>
              <span style={pillStyle}>{samplePosts[activeMode].length} active</span>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
              {samplePosts[activeMode].map((post) => (
                <article key={`${post.name}-${post.title}`} style={postCardStyle}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                      <h3 style={{ margin: 0, fontSize: 17, letterSpacing: -0.35 }}>{post.title}</h3>
                      <div style={{ color: '#6F6B64', fontSize: 12, marginTop: 4 }}>{post.name} · {post.role} · {post.time}</div>
                    </div>
                    <button style={connectButtonStyle}>Connect</button>
                  </div>
                  <p style={{ margin: '12px 0', color: '#38342E', fontSize: 13, lineHeight: 1.55 }}>{post.body}</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {post.tags.map((tag) => <span key={tag} style={tagStyle}>{tag}</span>)}
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside style={panelStyle}>
            <div style={eyebrowStyle}>Quick Post</div>
            <h2 style={{ margin: '6px 0 14px', fontSize: 22, letterSpacing: -0.7 }}>{active.action}</h2>
            <label style={labelStyle}>What do you need?</label>
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Example: Need a React buddy" style={inputStyle} />
            <label style={labelStyle}>Details</label>
            <textarea value={draftDetails} onChange={(event) => setDraftDetails(event.target.value)} placeholder="Share your stack, timing, goal, and how people should join." style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} />
            <button style={primaryButtonStyle}>Publish prototype post</button>
            <p style={{ margin: '12px 0 0', color: '#6F6B64', fontSize: 12, lineHeight: 1.45 }}>This page is ready as a product prototype. The next step is connecting posts to Supabase or MongoDB for persistence.</p>
          </aside>
        </section>
      </div>
    </main>
  )
}

const pageStyle: CSSProperties = { minHeight: '100vh', background: '#F5F1EA', color: '#0D0D0D', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
const shellStyle: CSSProperties = { maxWidth: 1120, margin: '0 auto', padding: '28px 24px 44px' }
const backButtonStyle: CSSProperties = { border: '1px solid #E1DDD4', background: '#FFFDF9', borderRadius: 999, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', marginBottom: 20 }
const heroStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 300px', gap: 22, alignItems: 'stretch', marginBottom: 20 }
const heroCardStyle: CSSProperties = { background: '#0D0D0D', color: '#fff', borderRadius: 18, padding: 22, boxShadow: '0 18px 45px rgba(13,13,13,0.18)' }
const eyebrowStyle: CSSProperties = { color: '#197247', fontSize: 11, fontWeight: 950, letterSpacing: 1.5, textTransform: 'uppercase' }
const leadStyle: CSSProperties = { margin: 0, color: '#6F6B64', fontSize: 15, lineHeight: 1.6, maxWidth: 650 }
const modeGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 14 }
const modeCardStyle: CSSProperties = { background: '#FFFDF9', border: '1px solid #E1DDD4', borderRadius: 16, padding: 18, textAlign: 'left', cursor: 'pointer' }
const activeModeCardStyle: CSSProperties = { background: '#0D0D0D', color: '#fff', borderColor: '#0D0D0D' }
const contentGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 360px', gap: 14 }
const panelStyle: CSSProperties = { background: '#FFFDF9', border: '1px solid #E1DDD4', borderRadius: 18, padding: 20 }
const panelHeaderStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }
const pillStyle: CSSProperties = { background: '#DFF1E8', color: '#197247', borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 900 }
const postCardStyle: CSSProperties = { border: '1px solid #EEEAE2', background: '#FBF8F2', borderRadius: 15, padding: 16 }
const connectButtonStyle: CSSProperties = { alignSelf: 'flex-start', background: '#0D0D0D', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 850, cursor: 'pointer' }
const tagStyle: CSSProperties = { background: '#DFF1E8', color: '#197247', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 800 }
const labelStyle: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 850, margin: '12px 0 6px' }
const inputStyle: CSSProperties = { width: '100%', border: '1px solid #E1DDD4', borderRadius: 11, padding: '11px 12px', background: '#FBF8F2', color: '#0D0D0D', outline: 'none', boxSizing: 'border-box', font: 'inherit', fontSize: 13 }
const primaryButtonStyle: CSSProperties = { width: '100%', marginTop: 14, background: '#0D0D0D', color: '#fff', border: 'none', borderRadius: 11, padding: '12px 14px', fontSize: 13, fontWeight: 900, cursor: 'pointer' }
