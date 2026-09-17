'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { fetchHackathons } from '@/lib/api'
import type { HackathonListing, HackathonsResponse } from '@/lib/types'

type ModeFilter = 'all' | 'online' | 'offline'
type DurationFilter = 'all' | 'weekend' | 'week' | 'long'
type TeamFilter = 'all' | 'solo' | 'small' | 'large'
type SortMode = 'soon' | 'duration' | 'team'

export default function HackathonsPage() {
  const router = useRouter()
  const [data, setData] = useState<HackathonsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [modeFilter, setModeFilter] = useState<ModeFilter>('all')
  const [durationFilter, setDurationFilter] = useState<DurationFilter>('all')
  const [teamFilter, setTeamFilter] = useState<TeamFilter>('all')
  const [locationQuery, setLocationQuery] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('soon')

  async function load(refresh = false) {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    setError(null)
    try {
      const result = await fetchHackathons({
        refresh,
        mode: modeFilter === 'all' ? undefined : modeFilter,
        location: locationQuery,
        maxDurationDays: durationFilter === 'weekend' ? 3 : durationFilter === 'week' ? 7 : undefined,
        minTeamSize: teamFilter === 'small' ? 2 : teamFilter === 'large' ? 3 : undefined,
      })
      setData(result)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load hackathons')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
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
        const result = await fetchHackathons()
        if (!cancelled) setData(result)
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load hackathons')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    bootstrap()
    return () => { cancelled = true }
  }, [router])

  const filtered = useMemo(() => {
    const hackathons = data?.hackathons || []
    return hackathons
      .filter((hackathon) => {
        const location = hackathon.location.toLowerCase()
        if (modeFilter === 'online' && !hackathon.is_online) return false
        if (modeFilter === 'offline' && hackathon.is_online) return false
        if (locationQuery.trim() && !location.includes(locationQuery.trim().toLowerCase())) return false
        if (durationFilter === 'weekend' && (hackathon.duration_days || 999) > 3) return false
        if (durationFilter === 'week' && (hackathon.duration_days || 999) > 7) return false
        if (durationFilter === 'long' && (hackathon.duration_days || 0) < 8) return false
        if (teamFilter === 'solo' && (hackathon.team_size_max || 1) > 1) return false
        if (teamFilter === 'small' && ((hackathon.team_size_max || 0) < 2 || (hackathon.team_size_max || 99) > 2)) return false
        if (teamFilter === 'large' && (hackathon.team_size_max || 0) <= 2) return false
        return true
      })
      .sort((a, b) => {
        if (sortMode === 'duration') return (a.duration_hours || 9999) - (b.duration_hours || 9999)
        if (sortMode === 'team') return (b.team_size_max || 0) - (a.team_size_max || 0)
        return new Date(a.start_date || '9999-12-31').getTime() - new Date(b.start_date || '9999-12-31').getTime()
      })
  }, [data, durationFilter, locationQuery, modeFilter, sortMode, teamFilter])

  if (loading) {
    return <main style={pageStyle}><div style={loadingStyle}>Fetching Hack Club hackathons from backend...</div></main>
  }

  return (
    <main style={pageStyle}>
      <section style={heroStyle}>
        <div>
          <button onClick={() => router.push('/dashboard')} style={backButtonStyle}>Dashboard</button>
          <div style={eyebrowStyle}>Hackathons</div>
          <h1 style={titleStyle}>Find competitions and build a team through Tech Radar.</h1>
          <p style={leadStyle}>Hackathons are fetched from Hack Club through FastAPI, cached in MongoDB, then filtered by duration, location, online/offline mode and team size.</p>
          <div style={pillRowStyle}>
            <span style={darkPillStyle}>{data?.meta.total || 0} hackathons</span>
            <span style={lightPillStyle}>{data?.meta.cached ? `Cached ${data.meta.cache_age_hours}h ago` : 'Fresh Hack Club fetch'}</span>
            <button onClick={() => load(true)} disabled={refreshing} style={refreshButtonStyle}>{refreshing ? 'Refreshing...' : 'Refresh'}</button>
          </div>
        </div>
        <div style={heroCardStyle}>
          <span style={{ color: 'rgba(255,255,255,0.56)', fontSize: 12, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1.1 }}>Team Finder</span>
          <strong style={{ display: 'block', fontSize: 44, marginTop: 8 }}>{filtered.filter((item) => (item.team_size_max || 0) > 2).length}</strong>
          <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.64)', fontSize: 13, lineHeight: 1.5 }}>Events with team size above two show a Tech Radar CTA with prefilled post details.</p>
        </div>
      </section>

      {error && <div style={alertStyle}>{error}</div>}

      <section style={layoutStyle}>
        <aside style={filterPanelStyle}>
          <div style={panelHeaderStyle}>
            <span style={eyebrowStyle}>Filters</span>
            <button onClick={resetFilters} style={resetButtonStyle}>Reset</button>
          </div>

          <FilterGroup title="Mode">
            {(['all', 'online', 'offline'] as const).map((value) => (
              <FilterButton key={value} active={modeFilter === value} onClick={() => setModeFilter(value)} label={modeLabel(value)} />
            ))}
          </FilterGroup>

          <FilterGroup title="Location">
            <input value={locationQuery} onChange={(event) => setLocationQuery(event.target.value)} placeholder="City, country, online" style={inputStyle} />
          </FilterGroup>

          <FilterGroup title="Duration">
            <FilterButton active={durationFilter === 'all'} onClick={() => setDurationFilter('all')} label="Any duration" />
            <FilterButton active={durationFilter === 'weekend'} onClick={() => setDurationFilter('weekend')} label="Weekend / 1-3 days" />
            <FilterButton active={durationFilter === 'week'} onClick={() => setDurationFilter('week')} label="Up to 1 week" />
            <FilterButton active={durationFilter === 'long'} onClick={() => setDurationFilter('long')} label="Long format" />
          </FilterGroup>

          <FilterGroup title="Team Size">
            <FilterButton active={teamFilter === 'all'} onClick={() => setTeamFilter('all')} label="Any team size" />
            <FilterButton active={teamFilter === 'solo'} onClick={() => setTeamFilter('solo')} label="Solo friendly" />
            <FilterButton active={teamFilter === 'small'} onClick={() => setTeamFilter('small')} label="Pairs" />
            <FilterButton active={teamFilter === 'large'} onClick={() => setTeamFilter('large')} label="3+ members" />
          </FilterGroup>
        </aside>

        <section style={feedStyle}>
          <div style={feedHeaderStyle}>
            <div>
              <h2 style={{ margin: 0, fontSize: 26, letterSpacing: -0.8 }}>Upcoming hackathons</h2>
              <p style={{ margin: '5px 0 0', color: '#6F6B64', fontSize: 13 }}>Showing {filtered.length} results from Hack Club.</p>
            </div>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)} style={selectStyle}>
              <option value="soon">Starting soon</option>
              <option value="duration">Shortest duration</option>
              <option value="team">Largest team size</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div style={emptyStyle}>No hackathons match these filters. Try all modes or remove the location filter.</div>
          ) : (
            <div style={gridStyle}>{filtered.map((hackathon) => <HackathonCard key={`${hackathon.source}-${hackathon.id}`} hackathon={hackathon} routerPush={router.push} />)}</div>
          )}
        </section>
      </section>
    </main>
  )

  function resetFilters() {
    setModeFilter('all')
    setDurationFilter('all')
    setTeamFilter('all')
    setLocationQuery('')
    setSortMode('soon')
  }
}

function HackathonCard({ hackathon, routerPush }: { hackathon: HackathonListing; routerPush: (href: string) => void }) {
  const teamMax = hackathon.team_size_max
  const canFindTeam = Boolean(teamMax && teamMax > 2 && hackathon.teammate_prefill)

  function openTeamFinder() {
    const prefill = hackathon.teammate_prefill
    const params = new URLSearchParams({
      mode: 'team',
      title: prefill?.title || `Need teammates for ${hackathon.title}`,
      body: prefill?.body || `I want to join ${hackathon.title}. Looking for teammates from Nirmaan. Hackathon link: ${hackathon.url}`,
      tags: (prefill?.tags || ['Hackathon', 'Team']).join(','),
    })
    routerPush(`/tech-radar?${params.toString()}`)
  }

  return (
    <article style={cardStyle}>
      <div style={cardTopStyle}>
        <span style={statusStyle}>{hackathon.status}</span>
        <span style={modeStyle}>{hackathon.is_online ? 'Online' : 'Offline'}</span>
      </div>
      <h3 style={cardTitleStyle}>{hackathon.title}</h3>
      <p style={mutedTextStyle}>{hackathon.organizer} · {hackathon.location}</p>
      <div style={metaGridStyle}>
        <Metric label="Starts" value={formatDate(hackathon.start_date)} />
        <Metric label="Duration" value={hackathon.duration_days ? `${hackathon.duration_days} days` : 'TBA'} />
        <Metric label="Team" value={teamMax ? `Up to ${teamMax}` : 'TBA'} />
      </div>
      <div style={tagRowStyle}>{hackathon.themes.map((theme) => <span key={theme} style={tagStyle}>{theme}</span>)}</div>
      <div style={actionRowStyle}>
        <a href={hackathon.url} target="_blank" rel="noopener noreferrer" style={primaryLinkStyle}>Open hackathon</a>
        {canFindTeam && <button onClick={openTeamFinder} style={teamButtonStyle}>Need a teammate?</button>}
      </div>
    </article>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div style={metricStyle}><span>{label}</span><strong>{value}</strong></div>
}

function FilterGroup({ title, children }: { title: string; children: ReactNode }) {
  return <div style={{ marginTop: 18 }}><div style={filterTitleStyle}>{title}</div>{children}</div>
}

function FilterButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return <button onClick={onClick} style={{ ...filterButtonStyle, ...(active ? activeFilterStyle : {}) }}>{label}</button>
}

function modeLabel(value: ModeFilter) {
  if (value === 'all') return 'All modes'
  if (value === 'online') return 'Online only'
  return 'Offline only'
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'TBA'
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

const pageStyle: CSSProperties = { minHeight: '100vh', background: '#F4EFE6', color: '#141414', padding: '28px clamp(16px, 4vw, 42px)', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
const loadingStyle: CSSProperties = { minHeight: '80vh', display: 'grid', placeItems: 'center', color: '#6F6B64', fontSize: 14 }
const heroStyle: CSSProperties = { maxWidth: 1240, margin: '0 auto 20px', display: 'grid', gridTemplateColumns: '1fr 330px', gap: 20, alignItems: 'stretch' }
const backButtonStyle: CSSProperties = { border: '1px solid #E2DCD0', background: '#FFFDF8', borderRadius: 999, padding: '9px 14px', fontWeight: 900, cursor: 'pointer', marginBottom: 18 }
const eyebrowStyle: CSSProperties = { color: '#1E714A', fontSize: 11, fontWeight: 950, letterSpacing: 1.4, textTransform: 'uppercase' }
const titleStyle: CSSProperties = { margin: '8px 0 10px', fontSize: 'clamp(34px, 5vw, 58px)', letterSpacing: -2.4, lineHeight: 0.96, maxWidth: 820 }
const leadStyle: CSSProperties = { color: '#6F6B64', margin: 0, fontSize: 15, lineHeight: 1.6, maxWidth: 760 }
const pillRowStyle: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 18, alignItems: 'center' }
const darkPillStyle: CSSProperties = { background: '#141414', color: '#fff', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 900 }
const lightPillStyle: CSSProperties = { background: '#FFFDF8', border: '1px solid #E2DCD0', color: '#5B554D', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 800 }
const refreshButtonStyle: CSSProperties = { border: 'none', background: '#1E714A', color: '#fff', borderRadius: 999, padding: '8px 12px', fontSize: 12, fontWeight: 900, cursor: 'pointer' }
const heroCardStyle: CSSProperties = { background: '#141414', color: '#fff', borderRadius: 26, padding: 24, boxShadow: '0 20px 60px rgba(20,20,20,0.18)' }
const alertStyle: CSSProperties = { maxWidth: 1240, margin: '0 auto 14px', background: '#FDE8E1', color: '#B42318', border: '1px solid #F8C9BD', borderRadius: 14, padding: 14, fontSize: 13 }
const layoutStyle: CSSProperties = { maxWidth: 1240, margin: '0 auto', display: 'grid', gridTemplateColumns: '280px 1fr', gap: 18, alignItems: 'start' }
const filterPanelStyle: CSSProperties = { background: '#FFFDF8', border: '1px solid #E2DCD0', borderRadius: 24, padding: 18, position: 'sticky', top: 20 }
const panelHeaderStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const resetButtonStyle: CSSProperties = { border: 'none', background: '#EFE9DE', borderRadius: 999, padding: '7px 10px', fontSize: 11, fontWeight: 900, cursor: 'pointer' }
const filterTitleStyle: CSSProperties = { color: '#6F6B64', fontSize: 11, fontWeight: 950, letterSpacing: 1.05, textTransform: 'uppercase', marginBottom: 8 }
const filterButtonStyle: CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: '#FBF7EF', color: '#141414', border: '1px solid #ECE5D8', borderRadius: 12, padding: '10px 11px', fontSize: 13, fontWeight: 800, marginBottom: 7, cursor: 'pointer' }
const activeFilterStyle: CSSProperties = { background: '#141414', color: '#fff', borderColor: '#141414' }
const inputStyle: CSSProperties = { width: '100%', border: '1px solid #ECE5D8', background: '#FBF7EF', borderRadius: 12, padding: '11px 12px', boxSizing: 'border-box', outline: 'none' }
const feedStyle: CSSProperties = { minWidth: 0 }
const feedHeaderStyle: CSSProperties = { background: '#FFFDF8', border: '1px solid #E2DCD0', borderRadius: 22, padding: 18, display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 14 }
const selectStyle: CSSProperties = { border: '1px solid #E2DCD0', background: '#FBF7EF', borderRadius: 12, padding: '10px 12px', fontWeight: 850, outline: 'none' }
const emptyStyle: CSSProperties = { background: '#FFFDF8', border: '1px solid #E2DCD0', borderRadius: 18, padding: 28, color: '#6F6B64', fontSize: 14 }
const gridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 14 }
const cardStyle: CSSProperties = { background: '#FFFDF8', border: '1px solid #E4DFD5', borderRadius: 24, padding: 18, boxShadow: '0 12px 38px rgba(58,45,27,0.06)' }
const cardTopStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 12 }
const statusStyle: CSSProperties = { background: '#DDEFE4', color: '#1E714A', borderRadius: 999, padding: '6px 9px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 950 }
const modeStyle: CSSProperties = { background: '#EFE9DE', color: '#5B554D', borderRadius: 999, padding: '6px 9px', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 950 }
const cardTitleStyle: CSSProperties = { margin: 0, fontSize: 22, letterSpacing: -0.7, lineHeight: 1.12 }
const mutedTextStyle: CSSProperties = { margin: '8px 0 12px', color: '#6F6B64', fontSize: 13, lineHeight: 1.5 }
const metaGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 12 }
const metricStyle: CSSProperties = { background: '#FBF7EF', border: '1px solid #EFE9DE', borderRadius: 14, padding: 10, display: 'grid', gap: 3, fontSize: 11, color: '#6F6B64' }
const tagRowStyle: CSSProperties = { display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 14 }
const tagStyle: CSSProperties = { background: '#EFE9DE', color: '#5B554D', borderRadius: 999, padding: '6px 9px', fontSize: 11, fontWeight: 900 }
const actionRowStyle: CSSProperties = { display: 'flex', gap: 9, flexWrap: 'wrap' }
const primaryLinkStyle: CSSProperties = { display: 'inline-block', background: '#141414', color: '#fff', textDecoration: 'none', borderRadius: 12, padding: '10px 15px', fontSize: 13, fontWeight: 950 }
const teamButtonStyle: CSSProperties = { border: '1px solid #1E714A', background: '#DDEFE4', color: '#1E714A', borderRadius: 12, padding: '10px 15px', fontSize: 13, fontWeight: 950, cursor: 'pointer' }
