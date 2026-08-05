'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { fetchDashboardSummary } from '@/lib/api'
import type { DashboardSummary } from '@/lib/types'

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

const navItems = [
  { label: 'Dashboard', href: '/dashboard', mark: '▦', active: true },
  { label: 'Studio', href: '/scanner', mark: '⌁' },
  { label: 'Internships', href: '/internships', mark: '▣' },
  { label: 'Hackathons', href: '/tech-radar', mark: '◉' },
  { label: 'Grooming Lab', href: '/grooming', mark: '✂' },
  { label: 'Tech Radar', href: '/tech-radar', mark: '◒' },
]

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

        if (!summary.scanner_completed) {
          router.push('/scanner')
          return
        }

        setData(summary)
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Unknown dashboard error'
        setError(message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  if (loading) {
    return <CenteredState text="Loading your dashboard..." />
  }

  if (error) {
    return (
      <CenteredState
        text={`Could not load dashboard: ${error}`}
        action={<button onClick={() => window.location.reload()} style={retryButtonStyle}>Retry</button>}
      />
    )
  }

  if (!data) return null

  const displayName = data.user.full_name
    || data.user.email?.split('@')[0]
    || 'there'
  const initials = getInitials(displayName, data.user.email)

  return (
    <div style={{ minHeight: '100vh', background: palette.paper, color: palette.ink, fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}>
      <aside style={sidebarStyle}>
        <div style={{ height: 70, display: 'flex', alignItems: 'center', padding: '0 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 21, fontWeight: 950, color: '#fff', letterSpacing: -1.2 }}>Nirmaan<span style={{ color: '#52D273' }}>.</span></div>
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
          <div style={{ color: '#fff', fontSize: 12, fontWeight: 650 }}>{data.user.role || 'Project Builder'}</div>
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            style={{ marginTop: 14, width: '100%', border: '1px solid rgba(255,255,255,0.09)', background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.55)', borderRadius: 10, padding: '9px 10px', fontSize: 12, cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main style={mainStyle}>
        <div style={topActionBarStyle}>
          <button
            onClick={() => data.active_project ? router.push(`/studio/${data.active_project.id}`) : router.push('/scanner')}
            style={deployButtonStyle}
          >
            {data.active_project ? 'Open Studio' : 'Start Project'}
            <span style={{ opacity: 0.75 }}>↗</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: palette.mutedInk, fontSize: 12 }}>
            <span style={{ color: palette.amber }}>●</span> Light
          </div>
          <XpScore xp={data.user.xp} />
          <div style={avatarStyle}>{initials}</div>
        </div>

        <section style={{ marginBottom: 26 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 950, letterSpacing: -0.9, lineHeight: 1.1 }}>
            Welcome back, <span style={{ color: palette.green }}>{displayName}</span>
          </h1>
          <p style={{ margin: '8px 0 0', color: palette.mutedInk, fontSize: 13 }}>
            Build today, connect with peers, and prepare for the next interview milestone.
          </p>
        </section>

        <section style={gridStyle}>
          <TodoCard project={data.active_project} onEdit={() => data.active_project ? router.push(`/studio/${data.active_project.id}`) : router.push('/scanner')} />
          <TopMatchesCard jobs={data.top_internships} onViewAll={() => router.push('/internships')} />
          <CurrentProjectCard project={data.active_project} onOpen={() => data.active_project ? router.push(`/studio/${data.active_project.id}`) : router.push('/scanner')} />
          <HackathonsCard onOpen={() => router.push('/tech-radar')} />
          <GroomingLabCard onOpen={() => router.push('/grooming')} />
        </section>
      </main>
    </div>
  )
}

function CenteredState({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: palette.ink, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 14, marginBottom: action ? 16 : 0 }}>{text}</p>
        {action}
      </div>
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

function DashboardCard({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...cardStyle, ...style }}>{children}</div>
}

function CardHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 13 }}>
      <h2 style={cardTitleStyle}>{title}</h2>
      {action && <button onClick={onAction} style={textActionStyle}>{action}</button>}
    </div>
  )
}

function TodoCard({ project, onEdit }: { project: DashboardSummary['active_project']; onEdit: () => void }) {
  const tasks = project?.current_step_todo?.slice(0, 4) || []
  const fallbackTasks = ['Review the current roadmap step', 'Open Studio and continue building', 'Run PSI check before deployment']
  const visibleTasks = tasks.length > 0 ? tasks : fallbackTasks

  return (
    <DashboardCard>
      <CardHeader title="To Do" action="Edit" onAction={onEdit} />
      <div>
        {visibleTasks.map((task, index) => {
          const checked = index === 0 && Boolean(project)
          return (
            <div key={`${task}-${index}`} style={{ display: 'flex', gap: 10, padding: '10px 0', borderBottom: index < visibleTasks.length - 1 ? `1px solid ${palette.soft}` : 'none' }}>
              <span style={{ ...checkboxStyle, ...(checked ? checkboxDoneStyle : {}) }}>{checked ? '' : null}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, color: checked ? palette.mutedInk : palette.ink, textDecoration: checked ? 'line-through' : 'none', lineHeight: 1.25 }}>{task}</div>
                <div style={{ fontSize: 10.5, color: checked ? palette.mutedInk : palette.green, fontWeight: index === 1 ? 700 : 500, marginTop: 2 }}>
                  {index === 1 ? 'Due today' : project?.current_step_title || 'Project workflow'}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </DashboardCard>
  )
}

function TopMatchesCard({ jobs, onViewAll }: { jobs: DashboardSummary['top_internships']; onViewAll: () => void }) {
  const visibleJobs = jobs.slice(0, 3)
  return (
    <DashboardCard>
      <CardHeader title="Top Matches" action="See All →" onAction={onViewAll} />
      {visibleJobs.length === 0 ? (
        <EmptyBlock title="No matches yet" text="Open Internships to fetch role-based opportunities." action="Find internships" onAction={onViewAll} />
      ) : (
        <div>
          {visibleJobs.map((job, index) => (
            <div key={job.job_id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: index < visibleJobs.length - 1 ? `1px solid ${palette.soft}` : 'none' }}>
              <div style={matchIconStyle}>{job.company.slice(0, 1).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.title}</div>
                <div style={{ fontSize: 10.5, color: palette.mutedInk, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.is_remote ? 'Remote' : job.location} · {job.company}</div>
              </div>
              <span style={matchBadgeStyle}>{job.match_pct}%</span>
            </div>
          ))}
        </div>
      )}
    </DashboardCard>
  )
}

function CurrentProjectCard({ project, onOpen }: { project: DashboardSummary['active_project']; onOpen: () => void }) {
  if (!project) {
    return (
      <DashboardCard>
        <CardHeader title="Current Project" />
        <EmptyBlock title="No project active" text="Run the scanner to receive your first build path." action="Start scanner" onAction={onOpen} />
      </DashboardCard>
    )
  }

  const stackLabel = project.tech_stack[0] || 'Project'
  return (
    <DashboardCard>
      <CardHeader title="Current Project" />
      <span style={stackPillStyle}>{stackLabel}</span>
      <h3 style={{ margin: '13px 0 5px', fontSize: 19, letterSpacing: -0.45, lineHeight: 1.15 }}>{project.title}</h3>
      <p style={{ margin: 0, color: palette.mutedInk, fontSize: 12, lineHeight: 1.45 }}>
        {project.tech_stack.slice(0, 4).join(' + ') || 'Guided project'} learning path with mentor support.
      </p>
      <div style={{ height: 5, background: palette.soft, borderRadius: 999, overflow: 'hidden', marginTop: 18 }}>
        <div style={{ width: `${Math.min(project.progress_pct, 100)}%`, height: '100%', background: palette.green, borderRadius: 999 }} />
      </div>
      <div style={{ marginTop: 8, color: palette.mutedInk, fontSize: 11 }}>Step {project.steps_done} of {project.steps_total} · {project.progress_pct}% complete</div>
      <button onClick={onOpen} style={primaryButtonStyle}>Open in Studio →</button>
    </DashboardCard>
  )
}

function HackathonsCard({ onOpen }: { onOpen: () => void }) {
  const events = [
    { tag: 'Devfolio · Online · 5 days left', title: 'HackIndia 2025', desc: 'Build backend, AI, or full-stack tracks with a peer team.' },
    { tag: 'MLH · In-person · Bangalore', title: 'PyCon Sprint', desc: 'Python focused sprint for students and new contributors.' },
  ]

  return (
    <DashboardCard style={{ gridColumn: 'span 3' }}>
      <CardHeader title="Hackathons" action="Find Team →" onAction={onOpen} />
      <div style={{ display: 'grid', gap: 12 }}>
        {events.map((event) => (
          <button key={event.title} onClick={onOpen} style={eventCardStyle}>
            <div style={{ color: 'rgba(255,255,255,0.34)', textTransform: 'uppercase', letterSpacing: 1.25, fontSize: 9 }}>{event.tag}</div>
            <div style={{ color: '#fff', fontWeight: 850, marginTop: 6, fontSize: 15 }}>{event.title}</div>
            <div style={{ color: 'rgba(255,255,255,0.45)', marginTop: 4, fontSize: 11 }}>{event.desc}</div>
          </button>
        ))}
      </div>
    </DashboardCard>
  )
}

function GroomingLabCard({ onOpen }: { onOpen: () => void }) {
  const labs = [
    { title: 'Resume Builder', detail: 'Tailor to any JD in 30s', mark: 'CV' },
    { title: 'Mock Interview', detail: 'Based on your project', mark: 'MI' },
    { title: 'Aptitude Prep', detail: '20 questions · 15 min', mark: 'AP' },
  ]

  return (
    <DashboardCard style={{ gridColumn: 'span 3' }}>
      <CardHeader title="Grooming Lab" action="Open →" onAction={onOpen} />
      <div style={{ display: 'grid', gap: 10 }}>
        {labs.map((lab) => (
          <button key={lab.title} onClick={onOpen} style={labRowStyle}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 820 }}>{lab.title}</div>
              <div style={{ fontSize: 11, color: palette.mutedInk, marginTop: 2 }}>{lab.detail}</div>
            </div>
            <span style={{ color: '#9B6ED6', fontSize: 11, fontWeight: 900 }}>{lab.mark}</span>
          </button>
        ))}
      </div>
    </DashboardCard>
  )
}

function EmptyBlock({ title, text, action, onAction }: { title: string; text: string; action: string; onAction: () => void }) {
  return (
    <div style={{ background: palette.soft, borderRadius: 14, padding: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 850, marginBottom: 5 }}>{title}</div>
      <p style={{ margin: 0, color: palette.mutedInk, fontSize: 12, lineHeight: 1.45 }}>{text}</p>
      <button onClick={onAction} style={{ ...textActionStyle, marginTop: 12, padding: 0 }}>{action} →</button>
    </div>
  )
}

function getInitials(name: string, email: string) {
  const source = name || email || 'AK'
  const parts = source.replace(/[^a-zA-Z\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
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

const mainStyle: CSSProperties = {
  marginLeft: 198,
  minHeight: '100vh',
  padding: '30px 28px 34px',
  maxWidth: 1030,
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

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
  gap: 14,
}

const cardStyle: CSSProperties = {
  background: palette.card,
  border: `1px solid ${palette.line}`,
  borderRadius: 11,
  padding: '15px 16px',
  boxShadow: '0 1px 0 rgba(13,13,13,0.02)',
  gridColumn: 'span 2',
}

const cardTitleStyle: CSSProperties = {
  margin: 0,
  textTransform: 'uppercase',
  letterSpacing: 1.65,
  color: '#5D5952',
  fontSize: 11,
  fontWeight: 850,
}

const textActionStyle: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: palette.green,
  fontSize: 10.5,
  fontWeight: 800,
  textDecoration: 'underline',
  cursor: 'pointer',
}

const checkboxStyle: CSSProperties = {
  width: 14,
  height: 14,
  borderRadius: 4,
  border: `1.4px solid ${palette.green}`,
  flexShrink: 0,
  marginTop: 1,
  background: '#fff',
}

const checkboxDoneStyle: CSSProperties = {
  background: palette.green,
  borderColor: palette.green,
}

const matchIconStyle: CSSProperties = {
  width: 30,
  height: 30,
  borderRadius: 9,
  background: palette.soft,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: palette.green,
  fontWeight: 900,
  fontSize: 12,
  flexShrink: 0,
}

const matchBadgeStyle: CSSProperties = {
  background: palette.greenSoft,
  color: palette.green,
  fontSize: 10,
  fontWeight: 900,
  padding: '3px 8px',
  borderRadius: 999,
  flexShrink: 0,
}

const stackPillStyle: CSSProperties = {
  display: 'block',
  width: '100%',
  background: palette.greenSoft,
  color: palette.green,
  borderRadius: 999,
  padding: '4px 10px',
  fontSize: 9.5,
  fontWeight: 950,
  textTransform: 'uppercase',
}

const primaryButtonStyle: CSSProperties = {
  width: '100%',
  marginTop: 18,
  background: palette.ink,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '10px 12px',
  fontSize: 13,
  fontWeight: 850,
  cursor: 'pointer',
}

const eventCardStyle: CSSProperties = {
  width: '100%',
  background: palette.ink,
  border: 'none',
  borderRadius: 8,
  padding: '14px 14px',
  textAlign: 'left',
  cursor: 'pointer',
}

const labRowStyle: CSSProperties = {
  width: '100%',
  background: palette.soft,
  border: 'none',
  borderRadius: 8,
  padding: '13px 14px',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  textAlign: 'left',
  cursor: 'pointer',
}

const retryButtonStyle: CSSProperties = {
  background: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '8px 20px',
  fontSize: 13,
  cursor: 'pointer',
}
