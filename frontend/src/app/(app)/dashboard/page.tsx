'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { fetchDashboardSummary } from '@/lib/api'
import type { DashboardSummary } from '@/lib/types'

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

        // If scanner not done — send them to scanner
        if (!summary.scanner_completed) {
          router.push('/scanner')
          return
        }

        setData(summary)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>Loading your dashboard...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#0D0D0D', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ color: '#FF5733', fontSize: 14, marginBottom: 16 }}>Could not load dashboard: {error}</p>
          <button onClick={() => window.location.reload()} style={{ background: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, cursor: 'pointer' }}>
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (!data) return null

  // Derive display name — full_name first, then part before @ in email, then "there"
  const displayName = data.user.full_name
    || data.user.email?.split('@')[0]
    || 'there'

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      {/* TOP NAV BAR */}
      <div style={{
        background: '#0D0D0D',
        padding: '0 28px',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span style={{ fontFamily: 'sans-serif', fontSize: 18, fontWeight: 800, color: '#fff', letterSpacing: -0.5 }}>
          Nirmaan<span style={{ color: '#4ADE80' }}>.</span>
        </span>
        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <NavLink href="/dashboard" label="Dashboard" active />
          <NavLink href="/internships" label="Internships" />
          <XpBadge xp={data.user.xp} />
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push('/login') }}
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}
          >
            Sign out
          </button>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ maxWidth: 1040, margin: '0 auto', padding: '36px 24px' }}>

        {/* WELCOME ROW */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>
              Welcome back, {displayName}
            </h1>
            <p style={{ fontSize: 14, color: '#6B6B6B' }}>
              {data.user.role
                ? `${data.user.role} · ${data.user.level}`
                : 'Complete the scanner to get your Skill DNA'}
            </p>
          </div>
        </div>

        {/* MAIN GRID */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>

          {/* SKILL DNA CARD */}
          <SkillDnaCard user={data.user} />

          {/* ACTIVE PROJECT CARD */}
          <ProjectCard project={data.active_project} />

          {/* TOP INTERNSHIPS CARD */}
          <InternshipsCard jobs={data.top_internships} onViewAll={() => router.push('/internships')} />

        </div>

        {/* BOTTOM ROW */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

          {/* TO-DO / NEXT STEPS CARD */}
          <TodoCard project={data.active_project} onGoToStudio={() => {
            if (data.active_project) router.push(`/studio/${data.active_project.id}`)
          }} />

          {/* QUICK LINKS CARD */}
          <QuickLinksCard
            hasProject={!!data.active_project}
            onNewProject={() => router.push('/scanner')}
            onStudio={() => data.active_project && router.push(`/studio/${data.active_project.id}`)}
            onInternships={() => router.push('/internships')}
            onGrooming={() => router.push('/grooming')}
          />

        </div>
      </div>
    </div>
  )
}

// ─── SUB-COMPONENTS ───────────────────────────────────────────────────────────

function NavLink({ href, label, active }: { href: string; label: string; active?: boolean }) {
  return (
    <a href={href} style={{
      fontSize: 13, color: active ? '#fff' : 'rgba(255,255,255,0.4)',
      textDecoration: 'none', fontWeight: active ? 500 : 400,
      borderBottom: active ? '1px solid #4ADE80' : 'none',
      paddingBottom: 2,
    }}>
      {label}
    </a>
  )
}

function XpBadge({ xp }: { xp: number }) {
  return (
    <div style={{
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
      padding: '4px 12px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
    }}>
      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: 1, textTransform: 'uppercase' }}>XP</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: '#4ADE80', letterSpacing: -0.5 }}>
        {xp.toLocaleString()}
      </span>
    </div>
  )
}

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{
      background: '#FDFCFA',
      border: '1px solid #E0DDD8',
      borderRadius: 14,
      padding: '20px 22px',
      ...style,
    }}>
      {children}
    </div>
  )
}

function CardLabel({ text }: { text: string }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 1.5,
      textTransform: 'uppercase', color: '#6B6B6B', marginBottom: 14,
    }}>
      {text}
    </div>
  )
}

function SkillDnaCard({ user }: { user: DashboardSummary['user'] }) {
  if (!user.role) {
    return (
      <Card>
        <CardLabel text="Skill DNA" />
        <p style={{ fontSize: 13, color: '#6B6B6B', lineHeight: 1.6 }}>
          Your Skill DNA hasn't been generated yet.
        </p>
        <a href="/scanner" style={{ display: 'inline-block', marginTop: 12, fontSize: 12, color: '#1A6B3C', fontWeight: 600 }}>
          Complete Scanner →
        </a>
      </Card>
    )
  }

  const SCORE_COLOR = (s: number) => s >= 75 ? '#1A6B3C' : s >= 50 ? '#B45309' : '#B91C1C'

  return (
    <Card style={{ background: '#0D0D0D', borderColor: '#1A1A1A' }}>
      <CardLabel text="Skill DNA" />
      <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 2 }}>{user.role}</div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{user.level}</span>
        {user.pace_factor && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>· {user.pace_factor} pace</span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Object.entries(user.skill_scores).map(([key, val]) => (
          <div key={key}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', textTransform: 'capitalize' }}>{key}</span>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{val.score}%</span>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 3, height: 4 }}>
              <div style={{ width: `${val.score}%`, height: 4, borderRadius: 3, background: SCORE_COLOR(val.score), transition: 'width 0.8s ease' }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ProjectCard({ project }: { project: DashboardSummary['active_project'] }) {
  if (!project) {
    return (
      <Card>
        <CardLabel text="Active Project" />
        <p style={{ fontSize: 13, color: '#6B6B6B', lineHeight: 1.6 }}>
          You haven't started a project yet.
        </p>
        <a href="/scanner" style={{ display: 'inline-block', marginTop: 12, fontSize: 12, color: '#1A6B3C', fontWeight: 600 }}>
          Start Building →
        </a>
      </Card>
    )
  }

  return (
    <Card>
      <CardLabel text="Active Project" />
      <span style={{ background: '#E8F5EE', color: '#1A6B3C', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, display: 'inline-block', marginBottom: 10 }}>
        In Progress
      </span>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, lineHeight: 1.3 }}>{project.title}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
        {project.tech_stack.slice(0, 3).map(t => (
          <span key={t} style={{ background: '#F0EDE8', color: '#6B6B6B', fontSize: 10, padding: '2px 8px', borderRadius: 20 }}>{t}</span>
        ))}
      </div>
      {/* Progress bar */}
      <div style={{ background: '#F0EDE8', borderRadius: 4, height: 6, marginBottom: 5 }}>
        <div style={{ width: `${project.progress_pct}%`, height: 6, borderRadius: 4, background: '#1A6B3C', transition: 'width 0.8s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontSize: 11, color: '#6B6B6B' }}>Step {project.steps_done} of {project.steps_total}</span>
        <span style={{ fontSize: 11, color: '#1A6B3C', fontWeight: 600 }}>{project.progress_pct}%</span>
      </div>
      <a href={`/studio/${project.id}`} style={{
        display: 'block', background: '#0D0D0D', color: '#fff', textAlign: 'center',
        fontSize: 13, fontWeight: 600, padding: '10px 0', borderRadius: 8, textDecoration: 'none',
      }}>
        Continue Building →
      </a>
    </Card>
  )
}

function InternshipsCard({ jobs, onViewAll }: { jobs: DashboardSummary['top_internships']; onViewAll: () => void }) {
  return (
    <Card>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <CardLabel text="Top Matches" />
        <button onClick={onViewAll} style={{ background: 'none', border: 'none', fontSize: 11, color: '#1A6B3C', cursor: 'pointer', fontWeight: 600 }}>
          See all →
        </button>
      </div>
      {jobs.length === 0 ? (
        <p style={{ fontSize: 13, color: '#6B6B6B', lineHeight: 1.6 }}>
          Visit the <a href="/internships" style={{ color: '#1A6B3C' }}>Internships</a> page to load matches.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {jobs.map((job, i) => (
            <div key={job.job_id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderBottom: i < jobs.length - 1 ? '1px solid #F0EDE8' : 'none',
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                🏢
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{job.title}</div>
                <div style={{ fontSize: 11, color: '#6B6B6B' }}>{job.company} · {job.is_remote ? 'Remote' : job.location}</div>
              </div>
              <div style={{ background: '#E8F5EE', color: '#1A6B3C', fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, flexShrink: 0 }}>
                {job.match_pct}%
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function TodoCard({ project, onGoToStudio }: { project: DashboardSummary['active_project']; onGoToStudio: () => void }) {
  if (!project || project.current_step_todo.length === 0) {
    return (
      <Card>
        <CardLabel text="Next Steps" />
        <p style={{ fontSize: 13, color: '#6B6B6B', lineHeight: 1.6 }}>
          {project ? 'No tasks found for the current step.' : 'Start a project to see your next tasks here.'}
        </p>
      </Card>
    )
  }

  return (
    <Card>
      <CardLabel text="Next Steps" />
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: '#0D0D0D' }}>
        {project.current_step_title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 18 }}>
        {project.current_step_todo.map((task, i) => (
          <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <div style={{
              width: 18, height: 18, borderRadius: 5,
              border: '1.5px solid #E0DDD8',
              flexShrink: 0, marginTop: 1,
            }} />
            <span style={{ fontSize: 13, color: '#2a2a2a', lineHeight: 1.5 }}>{task}</span>
          </div>
        ))}
      </div>
      <button
        onClick={onGoToStudio}
        style={{ background: '#F0EDE8', color: '#0D0D0D', border: 'none', borderRadius: 8, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
      >
        Open in Studio →
      </button>
    </Card>
  )
}

function QuickLinksCard({ hasProject, onNewProject, onStudio, onInternships, onGrooming }: {
  hasProject: boolean
  onNewProject: () => void
  onStudio: () => void
  onInternships: () => void
  onGrooming: () => void
}) {
  const links = [
    { label: hasProject ? 'Continue in Studio' : 'Start a Project', desc: hasProject ? 'Pick up where you left off' : 'Build your first real project', action: hasProject ? onStudio : onNewProject, primary: true },
    { label: 'Internships', desc: 'Browse matched opportunities', action: onInternships, primary: false },
    { label: 'Grooming Lab', desc: 'Resume, mock interview, aptitude', action: onGrooming, primary: false },
    { label: 'New Project', desc: 'Start fresh with a new idea', action: onNewProject, primary: false },
  ]

  return (
    <Card>
      <CardLabel text="Quick Links" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {links.map((link, i) => (
          <button
            key={i}
            onClick={link.action}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: link.primary ? '#0D0D0D' : '#F0EDE8',
              color: link.primary ? '#fff' : '#0D0D0D',
              border: 'none', borderRadius: 10, padding: '12px 14px',
              cursor: 'pointer', textAlign: 'left',
            }}
          >
            <div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{link.label}</div>
              <div style={{ fontSize: 11, color: link.primary ? 'rgba(255,255,255,0.45)' : '#6B6B6B', marginTop: 1 }}>{link.desc}</div>
            </div>
            <span style={{ fontSize: 16, color: link.primary ? 'rgba(255,255,255,0.5)' : '#6B6B6B' }}>→</span>
          </button>
        ))}
      </div>
    </Card>
  )
}
