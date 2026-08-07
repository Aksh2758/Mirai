'use client'

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { connectToTechRadarPost, createTechRadarPost, fetchTechRadarPosts } from '@/lib/api'
import type { TechRadarMode, TechRadarPost } from '@/lib/types'

const modes: Array<{
  id: TechRadarMode
  title: string
  subtitle: string
  action: string
}> = [
  { id: 'buddy', title: 'Find a learning buddy', subtitle: 'Pair with someone learning the same stack or project path.', action: 'Create buddy post' },
  { id: 'team', title: 'Group up for competitions', subtitle: 'Build a small team for hackathons, sprints, and hiring challenges.', action: 'Start team callout' },
  { id: 'doubt', title: 'Ask or answer doubts', subtitle: 'Post blockers and get help from peers who already solved them.', action: 'Ask a doubt' },
]

export default function TechRadarPage() {
  const router = useRouter()
  const [activeMode, setActiveMode] = useState<TechRadarMode>('buddy')
  const [posts, setPosts] = useState<TechRadarPost[]>([])
  const [counts, setCounts] = useState<Record<TechRadarMode, number>>({ buddy: 0, team: 0, doubt: 0 })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDetails, setDraftDetails] = useState('')
  const [draftTags, setDraftTags] = useState('')

  const active = useMemo(() => modes.find((mode) => mode.id === activeMode) || modes[0], [activeMode])
  const activePosts = posts.filter((post) => post.mode === activeMode)
  const liveCount = counts.buddy + counts.team + counts.doubt

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const result = await fetchTechRadarPosts()
        if (!cancelled) {
          setPosts(result.posts)
          setCounts(result.counts)
        }
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load Tech Radar')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function publishPost() {
    if (!draftTitle.trim() || !draftDetails.trim()) {
      setNotice('Add a title and details before publishing.')
      return
    }
    setSaving(true)
    setNotice(null)
    try {
      const created = await createTechRadarPost({
        mode: activeMode,
        title: draftTitle,
        body: draftDetails,
        tags: draftTags.split(',').map((tag) => tag.trim()).filter(Boolean),
      })
      setPosts((current) => [created, ...current])
      setCounts((current) => ({ ...current, [created.mode]: current[created.mode] + 1 }))
      setDraftTitle('')
      setDraftDetails('')
      setDraftTags('')
      setNotice('Post published and saved to backend.')
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Could not publish post')
    } finally {
      setSaving(false)
    }
  }

  async function connect(postId: string) {
    setNotice(null)
    try {
      await connectToTechRadarPost(postId)
      setPosts((current) => current.map((post) => post.id === postId ? { ...post, connections_count: post.connections_count + 1 } : post))
      setNotice('Connection request saved.')
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Could not connect to post')
    }
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <button onClick={() => router.push('/dashboard')} style={backButtonStyle}>← Dashboard</button>
        <section style={heroStyle}>
          <div>
            <div style={eyebrowStyle}>Tech Radar</div>
            <h1 style={{ margin: '8px 0 10px', fontSize: 42, letterSpacing: -1.7, lineHeight: 1.04 }}>Find people for the next thing you want to build.</h1>
            <p style={leadStyle}>A backend-backed networking space for Nirmaan learners to find buddies, form teams, and solve doubts faster.</p>
          </div>
          <div style={heroCardStyle}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.52)', textTransform: 'uppercase', letterSpacing: 1.3 }}>Live Posts</div>
            <div style={{ fontSize: 44, fontWeight: 950, marginTop: 8 }}>{liveCount}</div>
            <div style={{ color: 'rgba(255,255,255,0.56)', fontSize: 13, lineHeight: 1.5 }}>Posts are loaded from the FastAPI + MongoDB Tech Radar endpoints.</div>
          </div>
        </section>

        <section style={modeGridStyle}>
          {modes.map((mode) => (
            <button key={mode.id} onClick={() => setActiveMode(mode.id)} style={{ ...modeCardStyle, ...(mode.id === activeMode ? activeModeCardStyle : {}) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 15, fontWeight: 900 }}>{mode.title}</span>
                <span style={{ opacity: 0.7 }}>{counts[mode.id]}</span>
              </div>
              <p style={{ margin: '7px 0 0', color: mode.id === activeMode ? 'rgba(255,255,255,0.66)' : '#6F6B64', fontSize: 12, lineHeight: 1.45 }}>{mode.subtitle}</p>
            </button>
          ))}
        </section>

        {error && <div style={alertStyle}>{error}</div>}
        {notice && <div style={noticeStyle}>{notice}</div>}

        <section style={contentGridStyle}>
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>{active.title}</div>
                <h2 style={{ margin: '5px 0 0', fontSize: 24, letterSpacing: -0.7 }}>{active.action}</h2>
              </div>
              <span style={pillStyle}>{activePosts.length} active</span>
            </div>

            {loading ? (
              <p style={mutedTextStyle}>Loading posts from backend...</p>
            ) : activePosts.length === 0 ? (
              <EmptyState text="No posts in this section yet. Create the first one and it will be stored in MongoDB." />
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {activePosts.map((post) => (
                  <article key={post.id} style={postCardStyle}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                      <div>
                        <h3 style={{ margin: 0, fontSize: 17, letterSpacing: -0.35 }}>{post.title}</h3>
                        <div style={{ color: '#6F6B64', fontSize: 12, marginTop: 4 }}>{post.author_name} · {post.author_role} · {formatDate(post.created_at)}</div>
                      </div>
                      <button onClick={() => connect(post.id)} style={connectButtonStyle}>Connect</button>
                    </div>
                    <p style={{ margin: '12px 0', color: '#38342E', fontSize: 13, lineHeight: 1.55 }}>{post.body}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {post.tags.map((tag) => <span key={tag} style={tagStyle}>{tag}</span>)}
                      </div>
                      <span style={{ color: '#6F6B64', fontSize: 11 }}>{post.connections_count} requests</span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>

          <aside style={panelStyle}>
            <div style={eyebrowStyle}>Quick Post</div>
            <h2 style={{ margin: '6px 0 14px', fontSize: 22, letterSpacing: -0.7 }}>{active.action}</h2>
            <label style={labelStyle}>What do you need?</label>
            <input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} placeholder="Example: Need a React buddy" style={inputStyle} />
            <label style={labelStyle}>Details</label>
            <textarea value={draftDetails} onChange={(event) => setDraftDetails(event.target.value)} placeholder="Share your stack, timing, goal, and how people should join." style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }} />
            <label style={labelStyle}>Tags, comma separated</label>
            <input value={draftTags} onChange={(event) => setDraftTags(event.target.value)} placeholder="React, Evening, Remote" style={inputStyle} />
            <button onClick={publishPost} disabled={saving} style={{ ...primaryButtonStyle, opacity: saving ? 0.55 : 1 }}>{saving ? 'Publishing...' : 'Publish post'}</button>
            <p style={{ margin: '12px 0 0', color: '#6F6B64', fontSize: 12, lineHeight: 1.45 }}>This form calls POST /tech-radar/posts. Connect calls are stored through POST /tech-radar/posts/:id/connect.</p>
          </aside>
        </section>
      </div>
    </main>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ ...postCardStyle, color: '#6F6B64', fontSize: 13, lineHeight: 1.5 }}>{text}</div>
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
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
const alertStyle: CSSProperties = { background: '#FDE8E1', color: '#B42318', border: '1px solid #F8C9BD', borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 13 }
const noticeStyle: CSSProperties = { background: '#DFF1E8', color: '#197247', border: '1px solid #BCE2CC', borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 13 }
const mutedTextStyle: CSSProperties = { color: '#6F6B64', fontSize: 13, lineHeight: 1.5 }
