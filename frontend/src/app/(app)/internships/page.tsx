'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { fetchJobs } from '@/lib/api'
import type { InternshipWorkType, JobListing, JobsResponse } from '@/lib/types'

type WorkFilter = 'all' | InternshipWorkType
type LocationFilter = 'all' | 'remote' | 'bangalore' | 'mumbai' | 'delhi' | 'india'
type StackFilter = 'all' | 'profile' | 'gaps'
type DurationFilter = 'all' | 'short' | 'medium' | 'long'
type SortMode = 'match' | 'stipend' | 'recent'

export default function InternshipsPage() {
  const router = useRouter()
  const [data, setData] = useState<JobsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
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
      <main style={pageStyle}>
        <div style={loadingStyle}>Finding internships from JSearch and matching them to your Skill DNA...</div>
      </main>
    )
  }

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <button onClick={() => router.push('/dashboard')} style={backButtonStyle}>Dashboard</button>
          <div style={eyebrowStyle}>Nirmaan Internships</div>
          <h1 style={titleStyle}>Internships matched to your resume, project and Skill DNA.</h1>
          <p style={leadStyle}>Backend reads your stored profile role, skill scores and active project stack, fetches JSearch/RapidAPI listings, and returns a match percentage with reasons.</p>
          <div style={quickPillsStyle}>
            <span style={darkPillStyle}>{data?.role_searched || 'Scanner role pending'}</span>
            <span style={lightPillStyle}>{cacheLabel}</span>
            <span style={lightPillStyle}>{data?.total || 0} opportunities</span>
          </div>
        </div>
        <div style={heroPanelStyle}>
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, fontWeight: 900, letterSpacing: 1.2, textTransform: 'uppercase' }}>Best Match</span>
          <strong style={{ display: 'block', fontSize: 48, marginTop: 8, letterSpacing: -1.6 }}>{topMatch ? `${topMatch.match_pct}%` : '--'}</strong>
          <p style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.66)', fontSize: 13, lineHeight: 1.5 }}>{topMatch ? `${topMatch.title} at ${topMatch.company}` : 'Complete scanner to unlock personalized matches.'}</p>
        </div>
      </section>

      {error && <div style={alertStyle}>{error}</div>}
      {data && !data.role_searched && (
        <div style={warningStyle}>Complete the scanner first so the backend can match internships with your role, level and skills.</div>
      )}

      <section style={layoutStyle}>
        <aside style={filterPanelStyle}>
          <div style={panelHeaderStyle}>
            <span style={eyebrowStyle}>Filters</span>
            <button onClick={() => resetFilters(setWorkFilter, setLocationFilter, setStackFilter, setDurationFilter, setMinMatch, setMinStipend, setSortMode)} style={resetButtonStyle}>Reset</button>
          </div>

          <FilterGroup title="Work Type">
            {(['all', 'remote', 'hybrid', 'onsite'] as const).map((value) => (
              <FilterButton key={value} active={workFilter === value} onClick={() => setWorkFilter(value)} label={workLabel(value)} />
            ))}
          </FilterGroup>

          <FilterGroup title="Location">
            {(['all', 'remote', 'india', 'bangalore', 'mumbai', 'delhi'] as const).map((value) => (
              <FilterButton key={value} active={locationFilter === value} onClick={() => setLocationFilter(value)} label={locationLabel(value)} />
            ))}
          </FilterGroup>

          <FilterGroup title="Stack Match">
            <FilterButton active={stackFilter === 'all'} onClick={() => setStackFilter('all')} label="All roles" />
            <FilterButton active={stackFilter === 'profile'} onClick={() => setStackFilter('profile')} label="Your stack only" />
            <FilterButton active={stackFilter === 'gaps'} onClick={() => setStackFilter('gaps')} label="Has learning gaps" />
          </FilterGroup>

          <FilterGroup title={`Minimum Match: ${minMatch}%`}>
            <input type="range" min={0} max={90} step={5} value={minMatch} onChange={(event) => setMinMatch(Number(event.target.value))} style={rangeStyle} />
          </FilterGroup>

          <FilterGroup title={`Minimum Stipend: ${minStipend === 0 ? 'Any' : formatMoney(minStipend)}`}>
            <input type="range" min={0} max={50000} step={5000} value={minStipend} onChange={(event) => setMinStipend(Number(event.target.value))} style={rangeStyle} />
          </FilterGroup>

          <FilterGroup title="Duration">
            <FilterButton active={durationFilter === 'all'} onClick={() => setDurationFilter('all')} label="Any duration" />
            <FilterButton active={durationFilter === 'short'} onClick={() => setDurationFilter('short')} label="1-2 months" />
            <FilterButton active={durationFilter === 'medium'} onClick={() => setDurationFilter('medium')} label="3-6 months" />
            <FilterButton active={durationFilter === 'long'} onClick={() => setDurationFilter('long')} label="6+ months" />
          </FilterGroup>
        </aside>

        <section style={feedStyle}>
          <div style={feedHeaderStyle}>
            <div>
              <h2 style={{ margin: 0, fontSize: 26, letterSpacing: -0.8 }}>Matched internship feed</h2>
              <p style={{ margin: '5px 0 0', color: '#6F6B64', fontSize: 13 }}>Showing {filtered.length} listings after filters.</p>
            </div>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} style={selectStyle}>
              <option value="match">Sort by match</option>
              <option value="stipend">Sort by stipend</option>
              <option value="recent">Sort by newest</option>
            </select>
          </div>

          {filtered.length === 0 && !error ? (
            <div style={emptyStyle}>No internships match your current filters. Lower the minimum match or switch location/work type.</div>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {filtered.map((job) => <JobCard key={job.job_id || job.apply_url || job.title} job={job} />)}
            </div>
          )}
        </section>
      </section>
    </main>
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

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={filterTitleStyle}>{title}</div>
      {children}
    </div>
  )
}

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} style={{ ...filterButtonStyle, ...(active ? activeFilterButtonStyle : {}) }}>{label}</button>
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

const pageStyle: CSSProperties = { minHeight: '100vh', background: '#F4EFE6', color: '#141414', padding: '28px clamp(16px, 4vw, 42px)', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
const loadingStyle: CSSProperties = { minHeight: '80vh', display: 'grid', placeItems: 'center', color: '#6F6B64', fontSize: 14 }
const heroStyle: CSSProperties = { maxWidth: 1240, margin: '0 auto 20px', display: 'grid', gridTemplateColumns: '1fr 330px', gap: 20, alignItems: 'stretch' }
const backButtonStyle: CSSProperties = { border: '1px solid #E2DCD0', background: '#FFFDF8', borderRadius: 999, padding: '9px 14px', fontWeight: 900, cursor: 'pointer', marginBottom: 18 }
const eyebrowStyle: CSSProperties = { color: '#1E714A', fontSize: 11, fontWeight: 950, letterSpacing: 1.4, textTransform: 'uppercase' }
const titleStyle: CSSProperties = { margin: '8px 0 10px', fontSize: 'clamp(34px, 5vw, 58px)', letterSpacing: -2.4, lineHeight: 0.96, maxWidth: 820 }
const leadStyle: CSSProperties = { color: '#6F6B64', margin: 0, fontSize: 15, lineHeight: 1.6, maxWidth: 760 }
const quickPillsStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 18 }
const darkPillStyle: CSSProperties = { background: '#141414', color: '#fff', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 900 }
const lightPillStyle: CSSProperties = { background: '#FFFDF8', border: '1px solid #E2DCD0', color: '#5B554D', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 800 }
const heroPanelStyle: CSSProperties = { background: '#141414', color: '#fff', borderRadius: 26, padding: 24, boxShadow: '0 20px 60px rgba(20,20,20,0.18)' }
const alertStyle: CSSProperties = { maxWidth: 1240, margin: '0 auto 14px', background: '#FDE8E1', color: '#B42318', border: '1px solid #F8C9BD', borderRadius: 14, padding: 14, fontSize: 13 }
const warningStyle: CSSProperties = { maxWidth: 1240, margin: '0 auto 14px', background: '#FFF7D6', color: '#79570B', border: '1px solid #F2D675', borderRadius: 14, padding: 14, fontSize: 13 }
const layoutStyle: CSSProperties = { maxWidth: 1240, margin: '0 auto', display: 'grid', gridTemplateColumns: '280px 1fr', gap: 18, alignItems: 'start' }
const filterPanelStyle: CSSProperties = { background: '#FFFDF8', border: '1px solid #E2DCD0', borderRadius: 24, padding: 18, position: 'sticky', top: 20 }
const panelHeaderStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const resetButtonStyle: CSSProperties = { border: 'none', background: '#EFE9DE', borderRadius: 999, padding: '7px 10px', fontSize: 11, fontWeight: 900, cursor: 'pointer' }
const filterTitleStyle: CSSProperties = { color: '#6F6B64', fontSize: 11, fontWeight: 950, letterSpacing: 1.05, textTransform: 'uppercase', marginBottom: 8 }
const filterButtonStyle: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: '#FBF7EF', color: '#141414', border: '1px solid #ECE5D8', borderRadius: 12, padding: '10px 11px', fontSize: 13, fontWeight: 800, marginBottom: 7, cursor: 'pointer' }
const activeFilterButtonStyle: CSSProperties = { background: '#141414', color: '#fff', borderColor: '#141414' }
const rangeStyle: CSSProperties = { width: '100%', accentColor: '#141414' }
const feedStyle: CSSProperties = { minWidth: 0 }
const feedHeaderStyle: CSSProperties = { background: '#FFFDF8', border: '1px solid #E2DCD0', borderRadius: 22, padding: 18, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 14 }
const selectStyle: CSSProperties = { border: '1px solid #E2DCD0', background: '#FBF7EF', borderRadius: 12, padding: '10px 12px', fontWeight: 850, outline: 'none' }
const emptyStyle: CSSProperties = { background: '#FFFDF8', border: '1px solid #E2DCD0', borderRadius: 18, padding: 28, color: '#6F6B64', fontSize: 14 }
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
