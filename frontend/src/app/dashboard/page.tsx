'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { fetchDashboardSummary } from '@/lib/api'
import type { DashboardSummary } from '@/lib/types'
import Sidebar from '@/components/dashboard/Sidebar'
import Topbar from '@/components/dashboard/Topbar'
import TodaysFocus from '@/components/dashboard/TodaysFocus'

/* ─── palette ─────────────────────────────────────────────── */
const c = {
  bg: '#F3F7F4',
  ink: '#0D1B14',
  muted: '#5C6B63',
  card: '#FFFFFF',
  line: '#E3EAE5',
  soft: '#EAF3EE',
  green: '#1A9D5A',
  greenBright: '#2FBF71',
  heroStart: '#0B2219',
  heroEnd: '#0E3328',
  accent: '#52D273',
}

type Job = DashboardSummary['top_internships'][number]

/* ─── helpers ─────────────────────────────────────────────── */
function getInitials(name: string, email: string) {
  const src = name || email || 'AK'
  const parts = src.replace(/[^a-zA-Z\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

/* ─── page ────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router = useRouter()
  const [data, setData] = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      try {
        const summary = await fetchDashboardSummary()
        if (!summary.scanner_completed) { router.push('/scanner'); return }
        setData(summary)
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  if (loading) return <Centered text="Loading your dashboard…" />
  if (error) return <Centered text={`Could not load: ${error}`} action={<button onClick={() => window.location.reload()} style={retryBtn}>Retry</button>} />
  if (!data) return null

  const displayName = data.user.full_name || data.user.email?.split('@')[0] || 'there'
  const initials = getInitials(displayName, data.user.email)
  const project = data.active_project
  const jobs: Job[] = data.top_internships || []
  const pct = project ? Math.min(project.progress_pct, 100) : 0
  const stack = project?.tech_stack || []
  const todo = project?.current_step_todo?.slice(0, 3) || []
  const goStudio = () => router.push(project ? `/studio/${project.id}` : '/scanner')
  const weekActivity = data.activity?.week_activity ?? [false, false, false, false, false, false, false]
  const streakDays = data.activity?.streak_days ?? 0
  const todayIndex = data.activity?.today_index ?? -1

  // skill scores for career readiness sidebar
  const skillEntries = Object.values(data.user.skill_scores || {})
  const topSkills = skillEntries.map(s => s.label).slice(0, 6)
  const avgScore = skillEntries.length
    ? Math.round(skillEntries.reduce((a, b) => a + b.score, 0) / skillEntries.length)
    : pct

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.ink, fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <Sidebar role={data.user.role ?? undefined} name={displayName} initials={initials} />

      <main style={{ marginLeft: 224, padding: '28px 32px 60px' }}>
        <Topbar displayName={displayName} xp={data.user.xp} initials={initials} />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 308px', gap: 22, alignItems: 'start' }}>

          {/* ── LEFT ── */}
          <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>

            {/* ACTIVE SPRINT HERO */}
            <section style={heroWrap}>
              <div style={heroBadgeRow}>
                <span style={sprintDot} />
                <span style={sprintLabel}>
                  ACTIVE SPRINT{project ? ` • STEP ${project.steps_done + 1} OF ${project.steps_total}` : ''}
                </span>
              </div>

              <div style={{ display: 'flex', gap: 28, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 240 }}>
                  <h2 style={heroTitle}>{project ? project.title : 'Start your first project'}</h2>
                  {project && (
                    <p style={heroSub}>
                      Step {project.steps_done + 1} of {project.steps_total}:{' '}
                      <span style={{ color: 'rgba(255,255,255,0.7)' }}>{project.current_step_title}</span>
                      {stack.length > 0 && (
                        <span> with <code style={codeChip}>{stack.slice(0, 2).join(' & ')}</code></span>
                      )}
                    </p>
                  )}

                  <div style={{ marginTop: 20, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button onClick={goStudio} style={heroPrimBtn}>
                      {project ? 'Continue in Studio' : 'Start scanner'} →
                    </button>
                    {project && (
                      <button onClick={() => router.push(`/studio/${project.id}`)} style={heroSecBtn}>
                        📄 View Project Spec
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress mini card */}
                <div style={heroProgressCard}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: 600, letterSpacing: 0.4, marginBottom: 10 }}>
                    Sprint Completion
                  </div>
                  <ProgressBar value={pct} track="rgba(255,255,255,0.15)" fill={c.accent} />
                  <div style={{ marginTop: 8, fontSize: 13, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>
                    {pct}% Finished
                  </div>
                  {project && (
                    <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                      {project.steps_done}/{project.steps_total} steps done
                    </div>
                  )}
                </div>
              </div>
            </section>

            {/* TODAY'S FOCUS + ACTIVE APPLICATIONS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* Today's Focus */}
              <TodaysFocus
                projectId={project?.id}
                projectTitle={project?.title}
                role={data.user.role}
                buildTasks={todo.length ? todo : ['Continue your next roadmap step in Studio']}
                jobs={jobs}
                onNavigate={(href) => router.push(href)}
              />

              {/* Active Applications */}
              <Card style={{ padding: 22 }}>
                <div style={cardHeaderRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* <span style={{ fontSize: 18 }}>💼</span> */}
                    <span style={sectionTitle}>Top Matches</span>
                  </div>
                  <button onClick={() => router.push('/discover/internships')} style={linkBtnStyle}>View All</button>
                </div>
                <p style={{ fontSize: 12, color: c.muted, margin: '8px 0 16px', lineHeight: 1.5 }}>
                  Fresh internships ranked against your skills.
                </p>

                {jobs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: c.muted, fontSize: 13 }}>
                    No matches yet.{' '}
                    <button onClick={() => router.push('/discover/internships')} style={linkBtnStyle}>Browse internships →</button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 0 }}>
                    {jobs.slice(0, 3).map((job, i) => (
                      <div key={job.job_id} style={{ ...appRow, borderBottom: i < jobs.length - 1 && i < 2 ? `1px solid ${c.line}` : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{job.title}</div>
                          <div style={{ fontSize: 11.5, color: c.muted, marginTop: 3 }}>
                            {job.company} · {job.is_remote ? 'Remote' : job.location}
                          </div>
                        </div>
                        <span style={job.match_pct >= 70 ? pillApplied : pillUpcoming}>
                          {job.match_pct}% Match
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 16, borderTop: `1px solid ${c.line}`, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {jobs.length > 0 && (
                    <span style={{ fontSize: 12, color: c.ink }}>
                      Best match:{' '}
                      <strong style={{ color: c.green }}>{jobs[0].match_pct}%</strong>
                    </span>
                  )}
                  <button onClick={() => router.push('/discover/internships')} style={linkBtnStyle}>
                    See all →
                  </button>
                </div>
              </Card>
            </div>

            {/* CURATED OPPORTUNITIES */}
            <Card style={{ padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Curated Opportunities For You</h3>
              </div>
              <p style={{ margin: '0 0 18px', fontSize: 12.5, color: c.muted }}>
                Tailored strictly to your{' '}
                <strong style={{ color: c.ink }}>{data.user.role || 'Developer'}</strong>{' '}
                skill profile and verified projects.
              </p>

              {/* Filter tabs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                {[
                  { label: 'All', count: `(${jobs.length + (project ? 1 : 0) + 1})` },
                  { label: 'Internships', count: `(${jobs.length})` },
                  { label: 'Projects', count: `(${project ? 1 : 0})` },
                  { label: 'Hackathons', count: '(1)' },
                ].map((tab, i) => (
                  <button
                    key={tab.label}
                    onClick={() => {
                      if (tab.label === 'Internships') router.push('/discover/internships')
                      else if (tab.label === 'Hackathons') router.push('/discover/hackathons')
                      else if (tab.label === 'Projects') goStudio()
                    }}
                    style={i === 0 ? filterTabActive : filterTab}
                  >
                    {tab.label} <span style={{ opacity: 0.65, fontSize: 11 }}>{tab.count}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
                {/* Internship cards */}
                {jobs.slice(0, 2).map((job) => (
                  <OpCard
                    key={job.job_id}
                    kind="INTERNSHIP"
                    pct={job.match_pct}
                    title={job.title}
                    sub={`${job.company} · ${job.is_remote ? 'Remote' : job.location}`}
                    cta="Apply Now"
                    onClick={() => router.push('/discover/internships')}
                    kindColor="#1A9D5A"
                  />
                ))}
                {/* Active project */}
                {project && (
                  <OpCard
                    kind="PORTFOLIO PROJECT"
                    pct={pct}
                    title={project.title}
                    sub={stack.slice(0, 3).join(' · ')}
                    cta="Continue Build"
                    onClick={goStudio}
                    kindColor="#7C3AED"
                  />
                )}
                {/* Hackathon from Discovery */}
                <OpCard
                  kind="HACKATHON"
                  label="Upcoming"
                  title="Live Hackathons"
                  sub="See what's running in Discovery Hub"
                  cta="Explore"
                  onClick={() => router.push('/discover/hackathons')}
                  kindColor="#D97706"
                />
              </div>
            </Card>
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <aside style={{ display: 'grid', gap: 16 }}>

            {/* Career Readiness */}
            <Card style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: c.ink, letterSpacing: 0.5 }}>CAREER READINESS</span>
                <span style={pillActiveTrack}>Active Track</span>
              </div>

              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 18 }}>
                <Ring value={avgScore} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{data.user.role || 'Project Builder'}</div>
                  <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
                    {skillEntries.length > 0
                      ? `${skillEntries.filter(s => s.score >= 70).length} of ${skillEntries.length} tracked skills at 70%+`
                      : 'Run the scanner to see your skill levels'}
                  </div>
                </div>
              </div>

              {topSkills.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: c.muted, marginBottom: 10 }}>Top Skills</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {topSkills.map((s) => <span key={s} style={skillChip}>{s}</span>)}
                  </div>
                </>
              )}
            </Card>

            {/* Streak + XP */}
            <Card style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>🔥</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>
                      {streakDays > 0 ? `${streakDays}-day streak` : 'No streak yet'}
                    </div>
                    <div style={{ fontSize: 11, color: c.muted }}>
                      {streakDays > 0 ? 'Saving or running code counts' : 'Save or run code in Studio to start one'}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.green }}>+{Math.min(data.user.xp, 999)} XP</div>
                  <div style={{ fontSize: 11, color: c.muted }}>Total earned</div>
                </div>
              </div>

              {/* Day dots */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, marginBottom: 14 }}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                  <div key={`day-${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 10, color: c.muted, fontWeight: 600 }}>{d}</div>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: weekActivity[i] ? c.green : 'rgba(0,0,0,0.06)',
                      outline: i === todayIndex ? `2px solid ${c.green}` : 'none', outlineOffset: 2,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {weekActivity[i] ? (
                        <span style={{ color: '#fff', fontSize: 11 }}>✓</span>
                      ) : (
                        <span style={{ color: c.muted, fontSize: 11 }}>·</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Upcoming deadline */}
              <div style={deadlineNotice}>
                <span style={{ fontSize: 16 }}>⏰</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#B45309' }}>Up next:</div>
                  <div style={{ fontSize: 11.5, color: '#92400E', marginTop: 2, lineHeight: 1.4 }}>
                    {project
                      ? `Complete Step ${project.steps_done + 1} of ${project.title}`
                      : 'Start your first project sprint'}
                  </div>
                </div>
              </div>
            </Card>

            {/* Guiding Principle */}
            <div style={guidingCard}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: c.accent, marginBottom: 14 }}>
                GUIDING PRINCIPLE
              </div>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: 'rgba(255,255,255,0.88)', lineHeight: 1.65 }}>
                &ldquo;Discipline today builds the technical freedom and career opportunities you want tomorrow.&rdquo;
              </p>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Nirmaan Community</span>
                <span style={{ fontSize: 12, color: c.accent, fontWeight: 600 }}>#BuildInPublic</span>
              </div>
            </div>

          </aside>
        </div>
      </main>
    </div>
  )
}

/* ─── small components ─────────────────────────────────────── */

function Centered({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0B0B0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: action ? 16 : 0 }}>{text}</p>
        {action}
      </div>
    </div>
  )
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: c.card, border: `1px solid ${c.line}`, borderRadius: 16, boxShadow: '0 1px 4px rgba(13,27,20,0.05)', ...style }}>
      {children}
    </div>
  )
}

function ProgressBar({ value, track, fill }: { value: number; track: string; fill: string }) {
  return (
    <div style={{ height: 6, background: track, borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', background: fill, borderRadius: 999, transition: 'width 0.6s ease' }} />
    </div>
  )
}

function Ring({ value }: { value: number }) {
  const r = 34, circ = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
      <svg width="84" height="84" viewBox="0 0 84 84" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="42" cy="42" r={r} fill="none" stroke={c.soft} strokeWidth="8" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={c.green} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - value / 100)} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{value}%</div>
      </div>
    </div>
  )
}

function OpCard({ kind, pct, label, title, sub, cta, onClick, kindColor }: {
  kind: string; pct?: number; label?: string; title: string; sub: string
  cta: string; onClick: () => void; kindColor: string
}) {
  return (
    <div style={{ border: `1px solid ${c.line}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 6, background: '#FAFCFB' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.1, color: kindColor }}>{kind}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: kindColor }}>
          {pct !== undefined ? `${pct}%` : (label || '')}
          {pct !== undefined && <span style={{ fontSize: 10, fontWeight: 500, color: c.muted }}>{' '}Match</span>}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, color: c.ink }}>{title}</div>
      <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.4, flex: 1 }}>{sub}</div>
      <button onClick={onClick} style={opCardBtn}>{cta} →</button>
    </div>
  )
}

/* ─── styles ───────────────────────────────────────────────── */

const heroWrap: CSSProperties = {
  background: `linear-gradient(135deg, ${c.heroStart} 0%, ${c.heroEnd} 100%)`,
  borderRadius: 18, padding: '26px 30px', position: 'relative', overflow: 'hidden',
}
const heroBadgeRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }
const sprintDot: CSSProperties = { width: 8, height: 8, borderRadius: '50%', background: c.accent, boxShadow: `0 0 6px ${c.accent}` }
const sprintLabel: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }
const heroTitle: CSSProperties = { margin: 0, fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: -0.6, lineHeight: 1.15 }
const heroSub: CSSProperties = { margin: '10px 0 0', fontSize: 13.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }
const codeChip: CSSProperties = { background: 'rgba(255,255,255,0.12)', color: c.accent, padding: '2px 7px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace' }
const heroPrimBtn: CSSProperties = {
  background: c.accent, color: '#041A0C', border: 'none', borderRadius: 999,
  padding: '11px 22px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer',
}
const heroSecBtn: CSSProperties = {
  background: 'rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.85)',
  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999,
  padding: '11px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const heroProgressCard: CSSProperties = {
  width: 200, flexShrink: 0, border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 14, padding: 18, background: 'rgba(255,255,255,0.04)',
}
const cardHeaderRow: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const sectionTitle: CSSProperties = { fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }
const pillGreen: CSSProperties = { background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }
const pillActiveTrack: CSSProperties = { background: '#D1FAE5', color: '#065F46', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }
const pillReview: CSSProperties = { background: '#FEF3C7', color: '#92400E', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' as const }
const pillApplied: CSSProperties = { background: '#DBEAFE', color: '#1E40AF', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' as const }
const pillUpcoming: CSSProperties = { background: '#F3E8FF', color: '#6B21A8', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' as const }


const appRow: CSSProperties = { display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0' }
const linkBtnStyle: CSSProperties = { background: 'transparent', border: 'none', color: c.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }

const filterTab: CSSProperties = {
  background: '#F3F7F4', border: `1px solid ${c.line}`, borderRadius: 999,
  padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: c.muted,
}
const filterTabActive: CSSProperties = {
  ...filterTab, background: c.green, color: '#fff', border: `1px solid ${c.green}`,
}
const skillChip: CSSProperties = { background: c.soft, color: '#2B5A43', fontSize: 11.5, padding: '4px 11px', borderRadius: 999, fontWeight: 600 }
const opCardBtn: CSSProperties = {
  marginTop: 6, background: c.ink, color: '#fff', border: 'none',
  borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' as const,
}
const deadlineNotice: CSSProperties = {
  background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
  padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start',
}
const guidingCard: CSSProperties = {
  background: `linear-gradient(135deg, ${c.heroStart} 0%, #1A3D2E 100%)`,
  borderRadius: 16, padding: 22,
}
const retryBtn: CSSProperties = { background: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, cursor: 'pointer' }