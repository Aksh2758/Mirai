'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { fetchJobs, fetchDashboardSummary } from '@/lib/api'
import Sidebar from '@/components/dashboard/Sidebar'
import type { InternshipWorkType, JobListing, JobsResponse } from '@/lib/types'

type WorkFilter = 'all' | InternshipWorkType
type LocationFilter = 'all' | 'remote' | 'bangalore' | 'mumbai' | 'delhi' | 'india'
type StackFilter = 'all' | 'profile' | 'gaps'
type DurationFilter = 'all' | 'short' | 'medium' | 'long'
type SortMode = 'match' | 'stipend' | 'recent'

function getInitials(name: string, email: string) {
  const src = name || email || 'AK'
  const parts = src.replace(/[^a-zA-Z\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

export default function InternshipsPage() {
  const router = useRouter()
  const [data, setData] = useState<JobsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [userProfile, setUserProfile] = useState<{ role?: string; name?: string; initials?: string }>({})
  const [workFilter, setWorkFilter] = useState<WorkFilter>('all')
  const [locationFilter, setLocationFilter] = useState<LocationFilter>('all')
  const [stackFilter, setStackFilter] = useState<StackFilter>('all')
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all')
  const [minMatch, setMinMatch] = useState(45)
  const [minStipend, setMinStipend] = useState(0)
  const [sortMode, setSortMode] = useState<SortMode>('match')

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      const fallbackName = session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || ''
      setUserProfile({
        name: fallbackName,
        initials: getInitials(fallbackName, session.user.email || ''),
      })

      fetchDashboardSummary().then((summary) => {
        if (!cancelled && summary?.user) {
          const name = summary.user.full_name || summary.user.email?.split('@')[0] || fallbackName
          setUserProfile({
            role: summary.user.role ?? undefined,
            name,
            initials: getInitials(name, summary.user.email || ''),
          })
        }
      }).catch(() => {})

      try {
        const result = await fetchJobs()
        if (!cancelled) setData(result)
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load internships')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [router])

  const filtered = useMemo(() => {
    const jobs = data?.jobs || []
    return jobs
      .filter((job) => {
        const workType = getWorkType(job)
        const location = job.location.toLowerCase()
        if (workFilter !== 'all' && workType !== workFilter) return false
        if (locationFilter === 'remote' && !job.is_remote) return false
        if (locationFilter !== 'all' && locationFilter !== 'remote' && !location.includes(locationFilter)) return false
        if (locationFilter === 'india' && !location.includes('india')) return false
        if (stackFilter === 'profile' && (job.matched_skills || []).length === 0) return false
        if (stackFilter === 'gaps' && (job.missing_skills || []).length === 0) return false
        if (job.match_pct < minMatch) return false
        if (minStipend > 0 && (job.stipend_min || 0) < minStipend) return false
        if (durationFilter === 'short' && (job.duration_months || 99) > 2) return false
        if (durationFilter === 'medium' && ((job.duration_months || 0) < 3 || (job.duration_months || 99) > 6)) return false
        if (durationFilter === 'long' && (job.duration_months || 0) < 6) return false
        return true
      })
      .sort((a, b) => {
        if (sortMode === 'stipend') return (b.stipend_min || 0) - (a.stipend_min || 0)
        if (sortMode === 'recent') return new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime()
        return b.match_pct - a.match_pct
      })
  }, [data, durationFilter, locationFilter, minMatch, minStipend, sortMode, stackFilter, workFilter])

  const topMatch = filtered[0]
  const cacheLabel = data?.cached ? `Cached ${data.cache_age_hours}h ago` : 'Fresh JSearch/RapidAPI response'

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F4EFE6' }}>
        <Sidebar role={userProfile.role} name={userProfile.name} initials={userProfile.initials} />
        <main style={{ marginLeft: 224, ...pageStyle }}>
          <div style={loadingStyle}>Finding internships from JSearch and matching them to your Skill DNA...</div>
        </main>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F4EFE6' }}>
      <Sidebar role={userProfile.role || data?.role_searched || undefined} name={userProfile.name} initials={userProfile.initials} />
      <main style={{ marginLeft: 224, ...pageStyle }}>
        {/* ── HERO ── */}
      <section style={heroStyle}>
        <button onClick={() => router.push('/dashboard')} style={backButtonStyle}>← Dashboard</button>
        <div style={eyebrowStyle}>Nirmaan · Internships</div>
        <h1 style={titleStyle}>Find internships that fit where you are — and where you&apos;re headed.</h1>
        <p style={leadStyle}>
          Every listing is scored against your skills, target role, and active project so you spend time on roles you can actually land — not ones that are out of reach.
        </p>

        {/* Inline stat strip — replaces the floating black card */}
        <div style={statStripStyle}>
          <div style={statItemStyle}>
            <span style={statValueStyle}>{topMatch ? `${topMatch.match_pct}%` : '—'}</span>
            <span style={statLabelStyle}>Best match</span>
          </div>
          <div style={statDivider} />
          <div style={statItemStyle}>
            <span style={statValueStyle}>{data?.total || 0}</span>
            <span style={statLabelStyle}>Opportunities</span>
          </div>
          <div style={statDivider} />
          <div style={statItemStyle}>
            <span style={statValueStyle}>{data?.role_searched || '—'}</span>
            <span style={statLabelStyle}>Your target role</span>
          </div>
          <div style={statDivider} />
          <div style={statItemStyle}>
            <span style={statValueStyle}>{data?.cached ? `${data.cache_age_hours}h` : 'Live'}</span>
            <span style={statLabelStyle}>{data?.cached ? 'Cached' : 'Fresh data'}</span>
          </div>
          {topMatch && (
            <>
              <div style={statDivider} />
              <div style={{ ...statItemStyle, flex: 2, minWidth: 0 }}>
                <span style={{ ...statValueStyle, fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {topMatch.title}
                </span>
                <span style={statLabelStyle}>{topMatch.company}</span>
              </div>
            </>
          )}
        </div>
      </section>

      {error && <div style={alertStyle}>{error}</div>}
      {data && !data.role_searched && (
        <div style={warningStyle}>Complete the scanner first so we can match internships to your role, level, and skills.</div>
      )}

      {/* ── COMPACT FILTER BAR ── */}
      <div style={filterBarStyle}>
        <div style={filterRowStyle}>
          <span style={filterGroupLabel}>Work type</span>
          {(['all', 'remote', 'hybrid', 'onsite'] as const).map((value) => (
            <ChipButton key={value} active={workFilter === value} onClick={() => setWorkFilter(value)} label={workLabel(value)} />
          ))}
          <div style={filterDivider} />
          <span style={filterGroupLabel}>Location</span>
          {(['all', 'remote', 'india', 'bangalore', 'mumbai', 'delhi'] as const).map((value) => (
            <ChipButton key={value} active={locationFilter === value} onClick={() => setLocationFilter(value)} label={locationLabel(value)} />
          ))}
          <div style={filterDivider} />
          <span style={filterGroupLabel}>Stack</span>
          <ChipButton active={stackFilter === 'all'} onClick={() => setStackFilter('all')} label="All" />
          <ChipButton active={stackFilter === 'profile'} onClick={() => setStackFilter('profile')} label="My stack" />
          <ChipButton active={stackFilter === 'gaps'} onClick={() => setStackFilter('gaps')} label="Has gaps" />
          <div style={filterDivider} />
          <span style={filterGroupLabel}>Duration</span>
          <ChipButton active={durationFilter === 'all'} onClick={() => setDurationFilter('all')} label="Any" />
          <ChipButton active={durationFilter === 'short'} onClick={() => setDurationFilter('short')} label="1–2 mo" />
          <ChipButton active={durationFilter === 'medium'} onClick={() => setDurationFilter('medium')} label="3–6 mo" />
          <ChipButton active={durationFilter === 'long'} onClick={() => setDurationFilter('long')} label="6+ mo" />
        </div>

        <div style={filterRowStyle}>
          <span style={filterGroupLabel}>Min match</span>
          <input type="range" min={0} max={90} step={5} value={minMatch} onChange={(e) => setMinMatch(Number(e.target.value))} style={rangeStyle} />
          <span style={rangeValueBadge}>{minMatch}%</span>
          <div style={filterDivider} />
          <span style={filterGroupLabel}>Min stipend</span>
          <input type="range" min={0} max={50000} step={5000} value={minStipend} onChange={(e) => setMinStipend(Number(e.target.value))} style={rangeStyle} />
          <span style={rangeValueBadge}>{minStipend === 0 ? 'Any' : formatMoney(minStipend)}</span>
          <div style={filterDivider} />
          <select value={sortMode} onChange={(e) => setSortMode(e.target.value as SortMode)} style={selectStyle}>
            <option value="match">Best match first</option>
            <option value="stipend">Highest stipend</option>
            <option value="recent">Most recent</option>
          </select>
          <button
            onClick={() => resetFilters(setWorkFilter, setLocationFilter, setStackFilter, setDurationFilter, setMinMatch, setMinStipend, setSortMode)}
            style={resetButtonStyle}
          >
            Reset all
          </button>
        </div>
      </div>

      {/* ── FEED ── */}
      <section style={feedStyle}>
        <div style={feedHeaderStyle}>
          <h2 style={{ margin: 0, fontSize: 22, letterSpacing: -0.6 }}>Matched internship feed</h2>
          <p style={{ margin: 0, color: '#6F6B64', fontSize: 13 }}>Showing {filtered.length} of {data?.total || 0} listings</p>
        </div>

        {filtered.length === 0 && !error ? (
          <div style={emptyStyle}>No internships match your current filters. Try lowering the minimum match % or expanding the location.</div>
        ) : (
          <div style={{ display: 'grid', gap: 14 }}>
            {filtered.map((job) => <JobCard key={job.job_id || job.apply_url || job.title} job={job} />)}
          </div>
        )}
      </section>
    </main>
  </div>
)
}

function JobCard({ job }: { job: JobListing }) {
  const isTopMatch = job.match_pct >= 80
  const workType = getWorkType(job)
  const matchedSkills = job.matched_skills || []
  const missingSkills = job.missing_skills || []
  const reasons = job.match_reasons || []

  return (
    <article style={{ ...jobCardStyle, borderColor: isTopMatch ? '#161616' : '#E4DFD5' }}>
      <div style={companyBadgeStyle}>{job.company.slice(0, 1).toUpperCase() || 'N'}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={jobTopRowStyle}>
          <div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 7 }}>
              {isTopMatch && <span style={blackBadgeStyle}>Top match</span>}
              <span style={softBadgeStyle}>{workLabel(workType)}</span>
              <span style={softBadgeStyle}>{job.source || 'JSearch/RapidAPI'}</span>
            </div>
            <h3 style={jobTitleStyle}>{job.title}</h3>
            <p style={mutedLineStyle}>{job.company} · {job.location || 'Location not specified'} · {formatDate(job.posted_at)}</p>
          </div>
          <div style={scoreBoxStyle}>
            <strong>{job.match_pct}%</strong>
            <span>match</span>
          </div>
        </div>

        <p style={snippetStyle}>{job.description_snippet || 'No job description snippet returned by source.'}</p>

        <div style={metaGridStyle}>
          <Metric label="Stipend" value={job.stipend_min ? formatMoney(job.stipend_min) : 'Not listed'} />
          <Metric label="Duration" value={job.duration_months ? `${job.duration_months} months` : 'Not listed'} />
          <Metric label="Missing skills" value={missingSkills.length ? missingSkills.slice(0, 3).join(', ') : 'None detected'} />
        </div>

        {reasons.length > 0 && (
          <div style={reasonBoxStyle}>
            {reasons.map((reason) => <span key={reason}>{reason}</span>)}
          </div>
        )}

        <div style={skillRowStyle}>
          {(matchedSkills.length ? matchedSkills : job.required_skills || []).slice(0, 8).map((skill) => <span key={skill} style={matchedSkillStyle}>{skill}</span>)}
          {missingSkills.slice(0, 4).map((skill) => <span key={skill} style={missingSkillStyle}>{skill}</span>)}
        </div>

        <a href={job.apply_url} target="_blank" rel="noopener noreferrer" style={applyButtonStyle}>Apply on source</a>
      </div>
    </article>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={metricStyle}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function ChipButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: active ? '1.5px solid #141414' : '1.5px solid #E2DCD0',
        background: active ? '#141414' : '#FFFDF8',
        color: active ? '#fff' : '#5B554D',
        borderRadius: 999,
        padding: '6px 13px',
        fontSize: 12.5,
        fontWeight: 700,
        cursor: 'pointer',
        whiteSpace: 'nowrap' as const,
        transition: 'all 0.15s ease',
      }}
    >
      {label}
    </button>
  )
}

function getWorkType(job: JobListing): InternshipWorkType {
  return job.work_type || (job.is_remote ? 'remote' : 'onsite')
}

function workLabel(value: WorkFilter) {
  if (value === 'all') return 'All work types'
  if (value === 'remote') return 'Remote'
  if (value === 'hybrid') return 'Hybrid'
  return 'On-site'
}

function locationLabel(value: LocationFilter) {
  if (value === 'all') return 'All locations'
  if (value === 'remote') return 'Remote'
  if (value === 'india') return 'India'
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function formatMoney(value: number) {
  return `₹${Math.round(value).toLocaleString('en-IN')}`
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Recently'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function resetFilters(
  setWorkFilter: (value: WorkFilter) => void,
  setLocationFilter: (value: LocationFilter) => void,
  setStackFilter: (value: StackFilter) => void,
  setDurationFilter: (value: DurationFilter) => void,
  setMinMatch: (value: number) => void,
  setMinStipend: (value: number) => void,
  setSortMode: (value: SortMode) => void,
) {
  setWorkFilter('all')
  setLocationFilter('all')
  setStackFilter('all')
  setDurationFilter('all')
  setMinMatch(45)
  setMinStipend(0)
  setSortMode('match')
}

/* ─── Page shell ─── */
const pageStyle: CSSProperties = {
  minHeight: '100vh', background: '#F4EFE6', color: '#141414',
  padding: '28px clamp(16px, 4vw, 42px)',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}
const loadingStyle: CSSProperties = { minHeight: '80vh', display: 'grid', placeItems: 'center', color: '#6F6B64', fontSize: 14 }

/* ─── Hero ─── */
const heroStyle: CSSProperties = { maxWidth: 1240, margin: '0 auto 24px' }
const backButtonStyle: CSSProperties = {
  border: '1px solid #E2DCD0', background: '#FFFDF8', borderRadius: 999,
  padding: '7px 14px', fontWeight: 700, cursor: 'pointer', marginBottom: 16,
  fontSize: 13, color: '#5B554D',
}
const eyebrowStyle: CSSProperties = { color: '#1E714A', fontSize: 11, fontWeight: 950, letterSpacing: 1.4, textTransform: 'uppercase' }
const titleStyle: CSSProperties = { margin: '8px 0 12px', fontSize: 'clamp(28px, 4vw, 48px)', letterSpacing: -1.8, lineHeight: 1.05, maxWidth: 820 }
const leadStyle: CSSProperties = { color: '#6F6B64', margin: 0, fontSize: 15, lineHeight: 1.65, maxWidth: 680 }

/* ─── Stat strip ─── */
const statStripStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0,
  background: '#FFFDF8', border: '1px solid #E2DCD0', borderRadius: 18,
  padding: '14px 20px', marginTop: 20,
}
const statItemStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, padding: '0 20px', flex: 1 }
const statValueStyle: CSSProperties = { fontSize: 20, fontWeight: 900, letterSpacing: -0.5, color: '#141414' }
const statLabelStyle: CSSProperties = { fontSize: 11, color: '#6F6B64', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }
const statDivider: CSSProperties = { width: 1, height: 36, background: '#E2DCD0', flexShrink: 0 }

/* ─── Alerts ─── */
const alertStyle: CSSProperties = { maxWidth: 1240, margin: '0 auto 14px', background: '#FDE8E1', color: '#B42318', border: '1px solid #F8C9BD', borderRadius: 14, padding: 14, fontSize: 13 }
const warningStyle: CSSProperties = { maxWidth: 1240, margin: '0 auto 14px', background: '#FFF7D6', color: '#79570B', border: '1px solid #F2D675', borderRadius: 14, padding: 14, fontSize: 13 }

/* ─── Compact horizontal filter bar ─── */
const filterBarStyle: CSSProperties = {
  maxWidth: 1240, margin: '0 auto 20px',
  background: '#FFFDF8', border: '1px solid #E2DCD0', borderRadius: 18,
  padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12,
}
const filterRowStyle: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
}
const filterGroupLabel: CSSProperties = {
  fontSize: 10.5, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase',
  color: '#9B9488', whiteSpace: 'nowrap' as const, marginRight: 2,
}
const filterDivider: CSSProperties = { width: 1, height: 22, background: '#E2DCD0', flexShrink: 0, margin: '0 4px' }
const rangeStyle: CSSProperties = { width: 120, accentColor: '#141414', cursor: 'pointer' }
const rangeValueBadge: CSSProperties = {
  background: '#EFE9DE', borderRadius: 999, padding: '4px 10px',
  fontSize: 12, fontWeight: 800, color: '#141414', whiteSpace: 'nowrap' as const,
}
const selectStyle: CSSProperties = {
  border: '1.5px solid #E2DCD0', background: '#FBF7EF', borderRadius: 999,
  padding: '6px 12px', fontWeight: 700, outline: 'none', fontSize: 12.5, cursor: 'pointer',
}
const resetButtonStyle: CSSProperties = {
  border: '1.5px solid #E2DCD0', background: 'transparent', borderRadius: 999,
  padding: '6px 13px', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#6F6B64',
}

/* ─── Feed ─── */
const feedStyle: CSSProperties = { maxWidth: 1240, margin: '0 auto' }
const feedHeaderStyle: CSSProperties = {
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
  marginBottom: 14, padding: '0 2px',
}
const emptyStyle: CSSProperties = { background: '#FFFDF8', border: '1px solid #E2DCD0', borderRadius: 18, padding: 28, color: '#6F6B64', fontSize: 14 }

/* ─── Job cards ─── */
const jobCardStyle: CSSProperties = { background: '#FFFDF8', border: '1px solid #E4DFD5', borderRadius: 24, padding: 18, display: 'flex', gap: 16, boxShadow: '0 12px 38px rgba(58,45,27,0.06)' }
const companyBadgeStyle: CSSProperties = { width: 52, height: 52, borderRadius: 16, background: '#DDEFE4', color: '#1E714A', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 950, flexShrink: 0 }
const jobTopRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 }
const blackBadgeStyle: CSSProperties = { background: '#141414', color: '#fff', borderRadius: 999, padding: '5px 8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 950 }
const softBadgeStyle: CSSProperties = { background: '#EFE9DE', color: '#5B554D', borderRadius: 999, padding: '5px 8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7, fontWeight: 950 }
const jobTitleStyle: CSSProperties = { margin: 0, fontSize: 21, letterSpacing: -0.6, lineHeight: 1.15 }
const mutedLineStyle: CSSProperties = { margin: '5px 0 0', color: '#6F6B64', fontSize: 12.5 }
const scoreBoxStyle: CSSProperties = { minWidth: 76, background: '#DDEFE4', color: '#1E714A', borderRadius: 18, padding: '10px 12px', textAlign: 'center', display: 'grid', gap: 1 }
const snippetStyle: CSSProperties = { color: '#5D5952', fontSize: 13, lineHeight: 1.6, margin: '13px 0' }
const metaGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 12 }
const metricStyle: CSSProperties = { background: '#FBF7EF', border: '1px solid #EFE9DE', borderRadius: 14, padding: 10, display: 'grid', gap: 3, fontSize: 11, color: '#6F6B64' }
const reasonBoxStyle: CSSProperties = { background: '#F4FAF6', border: '1px solid #CFE6D8', color: '#1E714A', borderRadius: 14, padding: 11, display: 'grid', gap: 5, fontSize: 12, fontWeight: 800, marginBottom: 12 }
const skillRowStyle: CSSProperties = { display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }
const matchedSkillStyle: CSSProperties = { background: '#DDEFE4', color: '#1E714A', borderRadius: 999, padding: '6px 9px', fontSize: 11, fontWeight: 900 }
const missingSkillStyle: CSSProperties = { background: '#FFF1E5', color: '#A34B00', borderRadius: 999, padding: '6px 9px', fontSize: 11, fontWeight: 900 }
const applyButtonStyle: CSSProperties = { display: 'inline-block', background: '#141414', color: '#fff', textDecoration: 'none', borderRadius: 12, padding: '10px 15px', fontSize: 13, fontWeight: 950 }
