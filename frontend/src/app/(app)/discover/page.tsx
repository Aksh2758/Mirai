'use client'

import type { CSSProperties } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { fetchDiscoveryHub } from '@/lib/api'
import type { DiscoveryHubResponse, HackathonListing, JobListing } from '@/lib/types'

type Tab = 'internships' | 'hackathons'
type WorkFilter = 'all' | 'remote' | 'onsite'

export default function DiscoveryHubPage() {
  const router = useRouter()
  const [data, setData] = useState<DiscoveryHubResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('internships')
  const [workFilter, setWorkFilter] = useState<WorkFilter>('all')
  const [minMatch, setMinMatch] = useState(0)

  async function load(refresh = false) {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const result = await fetchDiscoveryHub(refresh)
      setData(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load Discovery Hub')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const internships = useMemo(() => {
    const jobs = data?.internships || []
    return jobs.filter((job) => {
      if (workFilter === 'remote' && !job.is_remote) return false
      if (workFilter === 'onsite' && job.is_remote) return false
      if (job.match_pct < minMatch) return false
      return true
    })
  }, [data, minMatch, workFilter])

  const hackathons = data?.hackathons || []

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <button onClick={() => router.push('/dashboard')} style={backButtonStyle}>← Dashboard</button>

        <section style={heroStyle}>
          <div>
            <div style={eyebrowStyle}>Discovery Hub</div>
            <h1 style={{ margin: '8px 0 10px', fontSize: 42, letterSpacing: -1.7, lineHeight: 1.04 }}>Internships and hackathons from the internet.</h1>
            <p style={leadStyle}>Internships come through the backend JSearch integration. Hackathons come from Devfolio, Unstop and India-filtered Hack Club events and are cached by FastAPI.</p>
          </div>
          <div style={heroCardStyle}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.52)', textTransform: 'uppercase', letterSpacing: 1.3 }}>Live Discovery</div>
            <div style={{ fontSize: 44, fontWeight: 950, marginTop: 8 }}>{(data?.internships.length || 0) + hackathons.length}</div>
            <div style={{ color: 'rgba(255,255,255,0.56)', fontSize: 13, lineHeight: 1.5 }}>Fetched through backend endpoints, with cache metadata shown below each section.</div>
          </div>
        </section>

        <section style={tabBarStyle}>
          <button onClick={() => setTab('internships')} style={{ ...tabButtonStyle, ...(tab === 'internships' ? activeTabStyle : {}) }}>
            Internships <span style={tabCountStyle}>{data?.internship_meta.total || data?.internships.length || 0}</span>
          </button>
          <button onClick={() => setTab('hackathons')} style={{ ...tabButtonStyle, ...(tab === 'hackathons' ? activeTabStyle : {}) }}>
            Hackathons <span style={tabCountStyle}>{data?.hackathon_meta.total || hackathons.length}</span>
          </button>
          <button onClick={() => load(true)} disabled={refreshing} style={refreshButtonStyle}>{refreshing ? 'Refreshing...' : 'Refresh internet data'}</button>
        </section>

        {error && <div style={alertStyle}>{error}</div>}

        {loading ? (
          <div style={panelStyle}><p style={mutedTextStyle}>Fetching opportunities from backend...</p></div>
        ) : tab === 'internships' ? (
          <InternshipSection
            data={data}
            jobs={internships}
            workFilter={workFilter}
            minMatch={minMatch}
            onWorkFilter={setWorkFilter}
            onMinMatch={setMinMatch}
          />
        ) : (
          <HackathonSection data={data} hackathons={hackathons} />
        )}
      </div>
    </main>
  )
}

function InternshipSection({ data, jobs, workFilter, minMatch, onWorkFilter, onMinMatch }: {
  data: DiscoveryHubResponse | null
  jobs: JobListing[]
  workFilter: WorkFilter
  minMatch: number
  onWorkFilter: (filter: WorkFilter) => void
  onMinMatch: (value: number) => void
}) {
  return (
    <section style={contentGridStyle}>
      <aside style={panelStyle}>
        <div style={eyebrowStyle}>Filters</div>
        <h2 style={{ margin: '6px 0 16px', fontSize: 22, letterSpacing: -0.7 }}>Internship matches</h2>
        <div style={metaBoxStyle}>
          <strong>{data?.internship_meta.role_searched || 'Role not detected'}</strong>
          <span>{data?.internship_meta.cached ? `Cached · ${data.internship_meta.cache_age_hours}h old` : 'Fresh internet/API fetch'}</span>
        </div>
        {data?.internships_error && <div style={alertStyle}>{data.internships_error}</div>}
        <div style={{ marginTop: 18 }}>
          <div style={labelStyle}>Work Type</div>
          {(['all', 'remote', 'onsite'] as const).map((filter) => (
            <button key={filter} onClick={() => onWorkFilter(filter)} style={{ ...filterButtonStyle, ...(workFilter === filter ? activeFilterStyle : {}) }}>
              {filter === 'all' ? 'All' : filter === 'remote' ? 'Remote only' : 'On-site only'}
            </button>
          ))}
        </div>
        <div style={{ marginTop: 18 }}>
          <div style={labelStyle}>Minimum match: {minMatch}%</div>
          <input type="range" min={0} max={90} step={10} value={minMatch} onChange={(event) => onMinMatch(Number(event.target.value))} style={{ width: '100%' }} />
        </div>
      </aside>

      <div style={{ display: 'grid', gap: 12 }}>
        {jobs.length === 0 ? (
          <EmptyState text="No internships found for your filters. Refresh or lower the match filter." />
        ) : jobs.map((job) => <JobCard key={job.job_id || job.apply_url} job={job} />)}
      </div>
    </section>
  )
}

function HackathonSection({ data, hackathons }: { data: DiscoveryHubResponse | null; hackathons: HackathonListing[] }) {
  return (
    <section style={panelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start', marginBottom: 16 }}>
        <div>
          <div style={eyebrowStyle}>Hackathons</div>
          <h2 style={{ margin: '6px 0 4px', fontSize: 26, letterSpacing: -0.8 }}>Upcoming competitions</h2>
          <p style={{ ...mutedTextStyle, margin: 0 }}>Source: {data?.hackathon_meta.source || 'Multiple India hackathon sources'}</p>
        </div>
        <span style={pillStyle}>{data?.hackathon_meta.cached ? `Cached · ${data.hackathon_meta.cache_age_hours}h` : 'Fresh fetch'}</span>
      </div>

      {data?.hackathons_error && <div style={alertStyle}>{data.hackathons_error}</div>}

      {hackathons.length === 0 ? (
        <EmptyState text="No hackathons returned by the external source right now." />
      ) : (
        <div style={hackathonGridStyle}>
          {hackathons.map((hackathon) => <HackathonCard key={`${hackathon.source}-${hackathon.id}`} hackathon={hackathon} />)}
        </div>
      )}
    </section>
  )
}

function JobCard({ job }: { job: JobListing }) {
  const isTopMatch = job.match_pct >= 80
  return (
    <article style={{ ...cardStyle, borderColor: isTopMatch ? '#197247' : '#E1DDD4' }}>
      <div style={{ display: 'flex', gap: 14 }}>
        <div style={companyIconStyle}>{job.company.slice(0, 1).toUpperCase() || 'J'}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <div>
              {isTopMatch && <span style={topMatchStyle}>Top Match</span>}
              <h3 style={{ margin: '4px 0 3px', fontSize: 18, letterSpacing: -0.45 }}>{job.title}</h3>
              <div style={{ color: '#6F6B64', fontSize: 12 }}>{job.company} · {job.is_remote ? 'Remote' : job.location}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 950, color: '#197247' }}>{job.match_pct}%</div>
              <div style={{ fontSize: 9, color: '#6F6B64', textTransform: 'uppercase', letterSpacing: 0.8 }}>Match</div>
            </div>
          </div>
          <p style={snippetStyle}>{job.description_snippet}</p>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }}>
            {job.required_skills.slice(0, 8).map((skill) => <span key={skill} style={tagStyle}>{skill}</span>)}
          </div>
          <a href={job.apply_url} target="_blank" rel="noopener noreferrer" style={primaryLinkStyle}>Apply on source →</a>
        </div>
      </div>
    </article>
  )
}

function HackathonCard({ hackathon }: { hackathon: HackathonListing }) {
  return (
    <article style={cardStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
        <span style={topMatchStyle}>{hackathon.status}</span>
        <span style={{ color: '#6F6B64', fontSize: 12 }}>{hackathon.is_online ? 'Online' : hackathon.location}</span>
      </div>
      <h3 style={{ margin: 0, fontSize: 19, letterSpacing: -0.5 }}>{hackathon.title}</h3>
      <p style={{ ...mutedTextStyle, margin: '8px 0 12px' }}>{hackathon.organizer} · Starts {formatDate(hackathon.start_date)}</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 14 }}>
        {hackathon.themes.map((theme) => <span key={theme} style={tagStyle}>{theme}</span>)}
      </div>
      <a href={hackathon.url} target="_blank" rel="noopener noreferrer" style={primaryLinkStyle}>Open hackathon →</a>
    </article>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div style={cardStyle}><p style={{ ...mutedTextStyle, margin: 0 }}>{text}</p></div>
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'TBA'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const pageStyle: CSSProperties = { minHeight: '100vh', background: '#F5F1EA', color: '#0D0D0D', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
const shellStyle: CSSProperties = { maxWidth: 1160, margin: '0 auto', padding: '28px 24px 44px' }
const backButtonStyle: CSSProperties = { border: '1px solid #E1DDD4', background: '#FFFDF9', borderRadius: 999, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', marginBottom: 20 }
const heroStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 320px', gap: 22, alignItems: 'stretch', marginBottom: 18 }
const heroCardStyle: CSSProperties = { background: '#0D0D0D', color: '#fff', borderRadius: 18, padding: 22, boxShadow: '0 18px 45px rgba(13,13,13,0.18)' }
const eyebrowStyle: CSSProperties = { color: '#197247', fontSize: 11, fontWeight: 950, letterSpacing: 1.5, textTransform: 'uppercase' }
const leadStyle: CSSProperties = { margin: 0, color: '#6F6B64', fontSize: 15, lineHeight: 1.6, maxWidth: 690 }
const tabBarStyle: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }
const tabButtonStyle: CSSProperties = { border: '1px solid #E1DDD4', background: '#FFFDF9', borderRadius: 12, padding: '11px 14px', fontSize: 13, fontWeight: 900, cursor: 'pointer', color: '#0D0D0D' }
const activeTabStyle: CSSProperties = { background: '#0D0D0D', borderColor: '#0D0D0D', color: '#fff' }
const tabCountStyle: CSSProperties = { marginLeft: 8, opacity: 0.7 }
const refreshButtonStyle: CSSProperties = { marginLeft: 'auto', border: 'none', background: '#197247', color: '#fff', borderRadius: 12, padding: '11px 14px', fontSize: 13, fontWeight: 900, cursor: 'pointer' }
const contentGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '250px 1fr', gap: 14, alignItems: 'start' }
const panelStyle: CSSProperties = { background: '#FFFDF9', border: '1px solid #E1DDD4', borderRadius: 18, padding: 20 }
const cardStyle: CSSProperties = { background: '#FFFDF9', border: '1px solid #E1DDD4', borderRadius: 16, padding: 18 }
const metaBoxStyle: CSSProperties = { background: '#FBF8F2', border: '1px solid #EEEAE2', borderRadius: 12, padding: 12, display: 'grid', gap: 4, color: '#6F6B64', fontSize: 12 }
const labelStyle: CSSProperties = { fontSize: 11, fontWeight: 950, letterSpacing: 1.1, textTransform: 'uppercase', color: '#6F6B64', marginBottom: 9 }
const filterButtonStyle: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', padding: '9px 10px', fontSize: 13, border: '1px solid #E1DDD4', borderRadius: 9, marginBottom: 7, cursor: 'pointer', background: '#FFFDF9', color: '#0D0D0D' }
const activeFilterStyle: CSSProperties = { background: '#0D0D0D', color: '#fff', borderColor: '#0D0D0D' }
const hackathonGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }
const companyIconStyle: CSSProperties = { width: 44, height: 44, borderRadius: 13, background: '#DFF1E8', color: '#197247', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 950, flexShrink: 0 }
const topMatchStyle: CSSProperties = { background: '#DFF1E8', color: '#197247', borderRadius: 999, padding: '4px 8px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 950 }
const snippetStyle: CSSProperties = { color: '#6F6B64', fontSize: 12.5, lineHeight: 1.55, margin: '12px 0' }
const tagStyle: CSSProperties = { background: '#EEEAE2', color: '#5D5952', borderRadius: 999, padding: '5px 9px', fontSize: 10.5, fontWeight: 800 }
const primaryLinkStyle: CSSProperties = { display: 'inline-block', background: '#0D0D0D', color: '#fff', textDecoration: 'none', borderRadius: 9, padding: '9px 14px', fontSize: 12, fontWeight: 900 }
const pillStyle: CSSProperties = { background: '#DFF1E8', color: '#197247', borderRadius: 999, padding: '6px 10px', fontSize: 11, fontWeight: 900 }
const alertStyle: CSSProperties = { background: '#FDE8E1', color: '#B42318', border: '1px solid #F8C9BD', borderRadius: 12, padding: 12, marginBottom: 12, fontSize: 13 }
const mutedTextStyle: CSSProperties = { color: '#6F6B64', fontSize: 13, lineHeight: 1.5 }
