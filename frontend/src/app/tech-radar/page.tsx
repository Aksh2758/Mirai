'use client'

import type { CSSProperties } from 'react'
import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import type { TechRadarMode } from '@/lib/types'
import {
  connectToPost, createPost, createReply, deletePost, deleteReply, listPosts, listReplies,
  type RadarPost, type RadarReply,
} from '@/lib/techRadarApi'

const MODES: Array<{ id: TechRadarMode; title: string; short: string; subtitle: string; action: string; placeholder: string }> = [
  { id: 'buddy', title: 'Find a learning buddy', short: 'Buddy', subtitle: 'Pair with someone learning the same stack or project path.', action: 'Create buddy post', placeholder: 'Example: Need a React buddy' },
  { id: 'team', title: 'Group up for competitions', short: 'Team', subtitle: 'Build a small team for hackathons, sprints, and hiring challenges.', action: 'Start team callout', placeholder: 'Example: 2 more for a Smart India Hackathon team' },
  { id: 'doubt', title: 'Ask or answer doubts', short: 'Doubt', subtitle: 'Post blockers and get help from peers who already solved them.', action: 'Ask a doubt', placeholder: 'Example: pandas merge gives KeyError' },
]
const MODE_COLOR: Record<TechRadarMode, { bg: string; fg: string }> = {
  buddy: { bg: '#DFF1E8', fg: '#197247' },
  team: { bg: '#F3E8FF', fg: '#6B21A8' },
  doubt: { bg: '#FEF3C7', fg: '#92400E' },
}
const PAGE = 30

function TechRadarInner() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // feed state
  const [filter, setFilter] = useState<TechRadarMode | null>(null) // null = all categories
  const [query, setQuery] = useState('')
  const [debounced, setDebounced] = useState('')
  const [mineOnly, setMineOnly] = useState(false)
  const [forYou, setForYou] = useState(false)
  const [posts, setPosts] = useState<RadarPost[]>([])
  const [counts, setCounts] = useState<Record<TechRadarMode, number>>({ buddy: 0, team: 0, doubt: 0 })
  const [liveTotal, setLiveTotal] = useState<number | null>(null)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // composer
  const [composeMode, setComposeMode] = useState<TechRadarMode>('buddy')
  const [draftTitle, setDraftTitle] = useState('')
  const [draftDetails, setDraftDetails] = useState('')
  const [draftTags, setDraftTags] = useState('')
  const [saving, setSaving] = useState(false)
  const composerRef = useRef<HTMLElement | null>(null)

  // threads
  const [openThread, setOpenThread] = useState<string | null>(null)
  const [replies, setReplies] = useState<Record<string, RadarReply[]>>({})
  const [threadLoading, setThreadLoading] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const [replySending, setReplySending] = useState<string | null>(null)
  const [connected, setConnected] = useState<Record<string, boolean>>({})

  const composeInfo = MODES.find((m) => m.id === composeMode) || MODES[0]
  const searching = debounced.trim().length > 0

  // prefill from other pages (e.g. "find teammates" links)
  useEffect(() => {
    const mode = searchParams.get('mode')
    const title = searchParams.get('title')
    const body = searchParams.get('body')
    const tags = searchParams.get('tags')
    if (mode === 'buddy' || mode === 'team' || mode === 'doubt') { setComposeMode(mode); setFilter(mode) }
    if (title) setDraftTitle(title)
    if (body) setDraftDetails(body)
    if (tags) setDraftTags(tags)
    if (mode || title || body || tags) setNotice('Post details are prefilled. Review and publish when ready.')
  }, [searchParams])

  // debounce the search box
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 300)
    return () => clearTimeout(t)
  }, [query])

  // (re)load the feed whenever category, search or "my posts" changes
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    listPosts({ mode: filter, q: debounced, mine: mineOnly, sort: forYou ? 'for_you' : 'new', limit: PAGE })
      .then((r) => {
        if (cancelled) return
        setPosts(r.posts); setCounts(r.counts); setTotal(r.total); setHasMore(r.has_more)
        if (!debounced.trim() && !mineOnly) setLiveTotal(r.counts.buddy + r.counts.team + r.counts.doubt)
      })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load Tech Radar') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [filter, debounced, mineOnly, forYou])

  async function loadMore() {
    setLoadingMore(true)
    try {
      const r = await listPosts({ mode: filter, q: debounced, mine: mineOnly, sort: forYou ? 'for_you' : 'new', offset: posts.length, limit: PAGE })
      setPosts((cur) => {
        const seen = new Set(cur.map((p) => p.id))
        return [...cur, ...r.posts.filter((p) => !seen.has(p.id))]
      })
      setHasMore(r.has_more)
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Could not load more posts')
    } finally {
      setLoadingMore(false)
    }
  }

  async function publish() {
    if (draftTitle.trim().length < 3) { setNotice('Add a title (at least 3 characters).'); return }
    if (draftDetails.trim().length < 10) { setNotice('Add some details (at least 10 characters).'); return }
    setSaving(true); setNotice(null)
    try {
      const created = await createPost({
        mode: composeMode, title: draftTitle.trim(), body: draftDetails.trim(),
        tags: draftTags.split(',').map((t) => t.trim()).filter(Boolean),
      })
      // show it immediately if it belongs in the current view
      const visibleNow = (!filter || filter === created.mode) && !searching
      if (visibleNow) { setPosts((cur) => [created, ...cur]); setTotal((n) => n + 1) }
      setCounts((c) => ({ ...c, [created.mode]: c[created.mode] + 1 }))
      setLiveTotal((n) => (n === null ? n : n + 1))
      setDraftTitle(''); setDraftDetails(''); setDraftTags('')
      setNotice(visibleNow ? 'Post published.' : `Post published in ${MODES.find((m) => m.id === created.mode)?.short}. Clear your filter or search to see it.`)
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Could not publish post')
    } finally {
      setSaving(false)
    }
  }

  async function removePost(post: RadarPost) {
    if (!window.confirm('Delete this post?')) return
    try {
      await deletePost(post.id)
      setPosts((cur) => cur.filter((p) => p.id !== post.id))
      setTotal((n) => Math.max(0, n - 1))
      setCounts((c) => ({ ...c, [post.mode]: Math.max(0, c[post.mode] - 1) }))
      setLiveTotal((n) => (n === null ? n : Math.max(0, n - 1)))
      if (openThread === post.id) setOpenThread(null)
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Could not delete post')
    }
  }

  async function connect(post: RadarPost) {
    setNotice(null)
    try {
      await connectToPost(post.id)
      setConnected((c) => ({ ...c, [post.id]: true }))
      setPosts((cur) => cur.map((p) => (p.id === post.id && !connected[post.id] ? { ...p, connections_count: p.connections_count + 1 } : p)))
      setNotice('Connection request sent.')
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Could not connect to post')
    }
  }

  const toggleThread = useCallback(async (postId: string) => {
    if (openThread === postId) { setOpenThread(null); return }
    setOpenThread(postId)
    if (replies[postId]) return
    setThreadLoading(postId)
    try {
      const r = await listReplies(postId)
      setReplies((cur) => ({ ...cur, [postId]: r.replies }))
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Could not load replies')
    } finally {
      setThreadLoading(null)
    }
  }, [openThread, replies])

  async function sendReply(postId: string) {
    const text = (replyDraft[postId] || '').trim()
    if (!text) return
    setReplySending(postId)
    try {
      const reply = await createReply(postId, text)
      setReplies((cur) => ({ ...cur, [postId]: [...(cur[postId] || []), reply] }))
      setPosts((cur) => cur.map((p) => (p.id === postId ? { ...p, replies_count: p.replies_count + 1 } : p)))
      setReplyDraft((d) => ({ ...d, [postId]: '' }))
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Could not send reply')
    } finally {
      setReplySending(null)
    }
  }

  async function removeReply(postId: string, replyId: string) {
    try {
      await deleteReply(postId, replyId)
      setReplies((cur) => ({ ...cur, [postId]: (cur[postId] || []).filter((r) => r.id !== replyId) }))
      setPosts((cur) => cur.map((p) => (p.id === postId ? { ...p, replies_count: Math.max(0, p.replies_count - 1) } : p)))
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Could not delete reply')
    }
  }

  function startPost() {
    composerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const feedTitle = filter ? (MODES.find((m) => m.id === filter)?.title || '') : 'All posts'
  const matchTotal = counts.buddy + counts.team + counts.doubt

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <button onClick={() => router.push('/dashboard')} style={backButtonStyle}>← Dashboard</button>

        <section style={heroStyle}>
          <div>
            <div style={eyebrowStyle}>Tech Radar</div>
            <h1 style={{ margin: '8px 0 10px', fontSize: 42, letterSpacing: -1.7, lineHeight: 1.04 }}>Find people for the next thing you want to build.</h1>
            <p style={leadStyle}>Search what other learners are posting, reply to their threads, or start your own: find a buddy, form a team, or get a doubt solved.</p>
          </div>
          <div style={heroCardStyle}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.52)', textTransform: 'uppercase', letterSpacing: 1.3 }}>Live Posts</div>
            <div style={{ fontSize: 44, fontWeight: 950, marginTop: 8 }}>{liveTotal ?? '–'}</div>
            <button onClick={startPost} style={heroButtonStyle}>+ New post</button>
          </div>
        </section>

        {/* search */}
        <div style={searchWrap}>
          <span style={{ fontSize: 15, opacity: 0.6 }}>🔍</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts, tags (React, pandas, hackathon) or people"
            aria-label="Search Tech Radar"
            style={searchInput}
          />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search" style={clearBtn}>×</button>}
        </div>

        {/* categories double as filters; none selected = everything */}
        <section style={modeGridStyle}>
          {MODES.map((m) => {
            const on = filter === m.id
            return (
              <button key={m.id} onClick={() => { setFilter(on ? null : m.id); if (!on) setComposeMode(m.id) }} style={{ ...modeCardStyle, ...(on ? activeModeCardStyle : {}) }} aria-pressed={on}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                  <span style={{ fontSize: 15, fontWeight: 900 }}>{m.title}</span>
                  <span style={{ opacity: 0.7 }}>{counts[m.id]}</span>
                </div>
                <p style={{ margin: '7px 0 0', color: on ? 'rgba(255,255,255,0.66)' : '#6F6B64', fontSize: 12, lineHeight: 1.45 }}>{m.subtitle}</p>
              </button>
            )
          })}
        </section>

        {error && <div style={alertStyle}>{error}</div>}
        {notice && <div style={noticeStyle}>{notice}</div>}

        <section style={contentGridStyle}>
          {/* ───── feed ───── */}
          <div style={panelStyle}>
            <div style={panelHeaderStyle}>
              <div>
                <div style={eyebrowStyle}>{mineOnly ? 'My posts' : feedTitle}</div>
                <h2 style={{ margin: '5px 0 0', fontSize: 24, letterSpacing: -0.7 }}>
                  {searching ? `Results for “${debounced.trim()}”` : mineOnly ? 'Posts you created' : 'Community posts'}
                </h2>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button onClick={() => setForYou((v) => !v)} style={forYou ? chipOn : chipOff} title="AI ranking: posts most similar to your role and skills">For you</button>
                <button onClick={() => setMineOnly((v) => !v)} style={mineOnly ? chipOn : chipOff}>My posts</button>
                <span style={pillStyle}>{loading ? '…' : `${posts.length}${total > posts.length ? ` of ${total}` : ''} shown`}</span>
              </div>
            </div>

            {loading ? (
              <p style={mutedTextStyle}>Loading posts…</p>
            ) : posts.length === 0 ? (
              <div style={{ ...postCardStyle, color: '#6F6B64', fontSize: 13, lineHeight: 1.6 }}>
                {searching
                  ? <>No posts match “{debounced.trim()}”{filter ? ' in this category' : ''}. {matchTotal > 0 && filter ? 'Other categories have matches. ' : ''}<button onClick={() => { setQuery(''); setFilter(null) }} style={inlineLink}>Clear search</button></>
                  : mineOnly ? 'You have not posted yet. Use the form to create your first post.'
                  : 'No posts here yet. Be the first to post.'}
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 12 }}>
                {posts.map((post) => {
                  const col = MODE_COLOR[post.mode]
                  const open = openThread === post.id
                  const thread = replies[post.id] || []
                  return (
                    <article key={post.id} style={postCardStyle}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ ...modeBadge, background: col.bg, color: col.fg }}>{MODES.find((m) => m.id === post.mode)?.short}</span>
                          {forYou && typeof post.match_pct === 'number' && (
                            <span style={{ ...modeBadge, marginLeft: 6, background: '#E8F5EC', color: '#1D6B3A' }} title={post.match_terms?.length ? `Shared: ${post.match_terms.join(', ')}` : undefined}>
                              {post.match_pct}% match
                            </span>
                          )}
                          <h3 style={{ margin: '6px 0 0', fontSize: 17, letterSpacing: -0.35 }}>{post.title}</h3>
                          <div style={{ color: '#6F6B64', fontSize: 12, marginTop: 4 }}>{post.is_mine ? 'You' : post.author_name} · {post.author_role} · {formatDate(post.created_at)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-start' }}>
                          {post.is_mine ? (
                            <button onClick={() => removePost(post)} style={ghostButton}>Delete</button>
                          ) : post.mode !== 'doubt' && (
                            <button onClick={() => connect(post)} disabled={connected[post.id]} style={{ ...connectButtonStyle, opacity: connected[post.id] ? 0.55 : 1 }}>
                              {connected[post.id] ? 'Requested' : 'Connect'}
                            </button>
                          )}
                        </div>
                      </div>
                      <p style={{ margin: '12px 0', color: '#38342E', fontSize: 13, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{post.body}</p>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {post.tags.map((tag) => (
                            <button key={tag} onClick={() => setQuery(tag)} title={`Search ${tag}`} style={tagStyle}>{tag}</button>
                          ))}
                        </div>
                        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                          {post.mode !== 'doubt' && <span style={{ color: '#6F6B64', fontSize: 11 }}>{post.connections_count} requests</span>}
                          <button onClick={() => toggleThread(post.id)} style={replyToggle} aria-expanded={open}>
                            💬 {post.replies_count} {post.replies_count === 1 ? 'reply' : 'replies'} {open ? '▴' : '▾'}
                          </button>
                        </div>
                      </div>

                      {open && (
                        <div style={threadBox}>
                          {threadLoading === post.id ? (
                            <div style={mutedTextStyle}>Loading replies…</div>
                          ) : thread.length === 0 ? (
                            <div style={{ ...mutedTextStyle, marginBottom: 10 }}>No replies yet. {post.mode === 'doubt' ? 'Know the answer? Help out.' : 'Say hello.'}</div>
                          ) : (
                            <div style={{ display: 'grid', gap: 10, marginBottom: 12 }}>
                              {thread.map((r) => (
                                <div key={r.id} style={replyStyle}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                                    <div style={{ fontSize: 12, fontWeight: 800 }}>
                                      {r.is_mine ? 'You' : r.author_name}
                                      {r.is_post_author && <span style={authorTag}>Author</span>}
                                      <span style={{ color: '#6F6B64', fontWeight: 500 }}> · {formatDate(r.created_at)}</span>
                                    </div>
                                    {r.is_mine && <button onClick={() => removeReply(post.id, r.id)} style={{ ...inlineLink, color: '#B42318' }}>Delete</button>}
                                  </div>
                                  <div style={{ fontSize: 13, lineHeight: 1.5, marginTop: 4, whiteSpace: 'pre-wrap' }}>{r.body}</div>
                                </div>
                              ))}
                            </div>
                          )}
                          <form onSubmit={(e) => { e.preventDefault(); sendReply(post.id) }} style={{ display: 'flex', gap: 8 }}>
                            <input
                              value={replyDraft[post.id] || ''}
                              onChange={(e) => setReplyDraft((d) => ({ ...d, [post.id]: e.target.value }))}
                              placeholder={post.mode === 'doubt' ? 'Write an answer or a hint…' : 'Write a reply…'}
                              maxLength={800}
                              style={{ ...inputStyle, flex: 1 }}
                            />
                            <button type="submit" disabled={replySending === post.id || !(replyDraft[post.id] || '').trim()} style={{ ...connectButtonStyle, opacity: (replyDraft[post.id] || '').trim() ? 1 : 0.5 }}>
                              {replySending === post.id ? '…' : 'Reply'}
                            </button>
                          </form>
                        </div>
                      )}
                    </article>
                  )
                })}
                {hasMore && (
                  <button onClick={loadMore} disabled={loadingMore} style={primaryButtonStyle}>{loadingMore ? 'Loading…' : 'Load more posts'}</button>
                )}
              </div>
            )}
          </div>

          {/* ───── composer: post in any category, regardless of the current filter ───── */}
          <aside style={panelStyle} ref={composerRef}>
            <div style={eyebrowStyle}>New post</div>
            <h2 style={{ margin: '6px 0 12px', fontSize: 22, letterSpacing: -0.7 }}>{composeInfo.action}</h2>

            <label style={labelStyle}>Category</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {MODES.map((m) => (
                <button key={m.id} onClick={() => setComposeMode(m.id)} aria-pressed={composeMode === m.id} style={composeMode === m.id ? segOn : segOff}>{m.short}</button>
              ))}
            </div>

            <label style={labelStyle}>{composeMode === 'doubt' ? 'What are you stuck on?' : 'What do you need?'}</label>
            <input value={draftTitle} maxLength={120} onChange={(e) => setDraftTitle(e.target.value)} placeholder={composeInfo.placeholder} style={inputStyle} />
            <label style={labelStyle}>Details</label>
            <textarea
              value={draftDetails}
              maxLength={1200}
              onChange={(e) => setDraftDetails(e.target.value)}
              placeholder={composeMode === 'doubt' ? 'What did you try, what error do you see, which stack?' : 'Share your stack, timing, goal, and how people should join.'}
              style={{ ...inputStyle, minHeight: 120, resize: 'vertical' }}
            />
            <label style={labelStyle}>Tags, comma separated</label>
            <input value={draftTags} onChange={(e) => setDraftTags(e.target.value)} placeholder="React, Evening, Remote" style={inputStyle} />
            <button onClick={publish} disabled={saving} style={{ ...primaryButtonStyle, opacity: saving ? 0.55 : 1 }}>{saving ? 'Publishing…' : 'Publish post'}</button>
            <p style={{ margin: '12px 0 0', color: '#6F6B64', fontSize: 12, lineHeight: 1.45 }}>
              Posts are public to all Nirmaan learners. Tags help others find you with search.
            </p>
          </aside>
        </section>
      </div>
    </main>
  )
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  const mins = Math.floor((Date.now() - date.getTime()) / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  if (mins < 60 * 24) return `${Math.floor(mins / 60)}h ago`
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/* ───────── styles ───────── */
const pageStyle: CSSProperties = { minHeight: '100vh', background: '#F5F1EA', color: '#0D0D0D', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
const shellStyle: CSSProperties = { maxWidth: 1120, margin: '0 auto', padding: '28px 24px 44px' }
const backButtonStyle: CSSProperties = { border: '1px solid #E1DDD4', background: '#FFFDF9', borderRadius: 999, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', marginBottom: 20 }
const heroStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 300px', gap: 22, alignItems: 'stretch', marginBottom: 20 }
const heroCardStyle: CSSProperties = { background: '#0D0D0D', color: '#fff', borderRadius: 18, padding: 22, boxShadow: '0 18px 45px rgba(13,13,13,0.18)' }
const heroButtonStyle: CSSProperties = { marginTop: 12, background: '#fff', color: '#0D0D0D', border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 13, fontWeight: 900, cursor: 'pointer' }
const eyebrowStyle: CSSProperties = { color: '#197247', fontSize: 11, fontWeight: 950, letterSpacing: 1.5, textTransform: 'uppercase' }
const leadStyle: CSSProperties = { margin: 0, color: '#6F6B64', fontSize: 15, lineHeight: 1.6, maxWidth: 650 }
const searchWrap: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, background: '#FFFDF9', border: '1px solid #E1DDD4', borderRadius: 14, padding: '0 14px', marginBottom: 12, height: 50 }
const searchInput: CSSProperties = { flex: 1, border: 'none', outline: 'none', background: 'transparent', font: 'inherit', fontSize: 14, color: '#0D0D0D' }
const clearBtn: CSSProperties = { border: 'none', background: '#EEEAE2', borderRadius: 999, width: 22, height: 22, cursor: 'pointer', fontSize: 14, lineHeight: 1 }
const modeGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, marginBottom: 14 }
const modeCardStyle: CSSProperties = { background: '#FFFDF9', border: '1px solid #E1DDD4', borderRadius: 16, padding: 18, textAlign: 'left', cursor: 'pointer' }
const activeModeCardStyle: CSSProperties = { background: '#0D0D0D', color: '#fff', borderColor: '#0D0D0D' }
const contentGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 14, alignItems: 'start' }
const panelStyle: CSSProperties = { background: '#FFFDF9', border: '1px solid #E1DDD4', borderRadius: 18, padding: 20 }
const panelHeaderStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 16 }
const pillStyle: CSSProperties = { background: '#DFF1E8', color: '#197247', borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 900, whiteSpace: 'nowrap' }
const chipOff: CSSProperties = { background: '#FBF8F2', color: '#38342E', border: '1px solid #E1DDD4', borderRadius: 999, padding: '6px 11px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }
const chipOn: CSSProperties = { ...chipOff, background: '#0D0D0D', color: '#fff', borderColor: '#0D0D0D' }
const postCardStyle: CSSProperties = { border: '1px solid #EEEAE2', background: '#FBF8F2', borderRadius: 15, padding: 16 }
const modeBadge: CSSProperties = { display: 'inline-block', borderRadius: 999, padding: '2px 9px', fontSize: 10, fontWeight: 900, letterSpacing: 0.6, textTransform: 'uppercase' }
const connectButtonStyle: CSSProperties = { background: '#0D0D0D', color: '#fff', border: 'none', borderRadius: 9, padding: '8px 12px', fontSize: 12, fontWeight: 850, cursor: 'pointer' }
const ghostButton: CSSProperties = { background: 'transparent', color: '#B42318', border: '1px solid #F8C9BD', borderRadius: 9, padding: '7px 11px', fontSize: 12, fontWeight: 800, cursor: 'pointer' }
const tagStyle: CSSProperties = { background: '#DFF1E8', color: '#197247', borderRadius: 999, padding: '5px 9px', fontSize: 11, fontWeight: 800, border: 'none', cursor: 'pointer' }
const replyToggle: CSSProperties = { background: 'transparent', border: 'none', color: '#0D0D0D', fontSize: 12, fontWeight: 800, cursor: 'pointer', padding: 0 }
const threadBox: CSSProperties = { marginTop: 14, paddingTop: 14, borderTop: '1px solid #EEEAE2' }
const replyStyle: CSSProperties = { background: '#FFFDF9', border: '1px solid #EEEAE2', borderRadius: 12, padding: '10px 12px' }
const authorTag: CSSProperties = { marginLeft: 6, background: '#DFF1E8', color: '#197247', borderRadius: 999, padding: '1px 7px', fontSize: 10, fontWeight: 900 }
const inlineLink: CSSProperties = { background: 'transparent', border: 'none', color: '#197247', fontWeight: 800, fontSize: 12, cursor: 'pointer', padding: 0 }
const labelStyle: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 850, margin: '12px 0 6px' }
const inputStyle: CSSProperties = { width: '100%', border: '1px solid #E1DDD4', borderRadius: 11, padding: '11px 12px', background: '#FBF8F2', color: '#0D0D0D', outline: 'none', boxSizing: 'border-box', font: 'inherit', fontSize: 13 }
const segOff: CSSProperties = { border: '1px solid #E1DDD4', background: '#FBF8F2', borderRadius: 10, padding: '9px 0', fontSize: 12, fontWeight: 800, cursor: 'pointer', color: '#38342E' }
const segOn: CSSProperties = { ...segOff, background: '#0D0D0D', color: '#fff', borderColor: '#0D0D0D' }
const primaryButtonStyle: CSSProperties = { width: '100%', marginTop: 14, background: '#0D0D0D', color: '#fff', border: 'none', borderRadius: 11, padding: '12px 14px', fontSize: 13, fontWeight: 900, cursor: 'pointer' }
const alertStyle: CSSProperties = { background: '#FDE8E1', color: '#B42318', border: '1px solid #F8C9BD', borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 13 }
const noticeStyle: CSSProperties = { background: '#DFF1E8', color: '#197247', border: '1px solid #BCE2CC', borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 13 }
const mutedTextStyle: CSSProperties = { color: '#6F6B64', fontSize: 13, lineHeight: 1.5 }

export default function TechRadarPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', background: '#FDFAF4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6F6B64', fontSize: 14 }}>Loading Tech Radar…</div>}>
      <TechRadarInner />
    </Suspense>
  )
}