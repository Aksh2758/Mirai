'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { fetchJobs } from '@/lib/api'
import type { JobListing, JobsResponse } from '@/lib/types'

export default function InternshipsPage() {
  const router = useRouter()
  const [data, setData] = useState<JobsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<'all' | 'remote' | 'onsite'>('all')
  const [minMatch, setMinMatch] = useState(0)

  useEffect(() => {
    async function load() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      try {
        const result = await fetchJobs()
        setData(result)
      } catch (e: any) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  const filtered = data?.jobs.filter(job => {
    if (filter === 'remote' && !job.is_remote) return false
    if (filter === 'onsite' && job.is_remote) return false
    if (job.match_pct < minMatch) return false
    return true
  }) ?? []

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F5F2ED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#6B6B6B', fontSize: 14 }}>Finding opportunities matched to your Skill DNA...</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #E0DDD8', padding: '20px 28px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>Internships</h1>
          {data && (
            <p style={{ fontSize: 13, color: '#6B6B6B' }}>
              {data.total} opportunities matched to <strong>{data.role_searched}</strong>
              {data.cached && (
                <span style={{ marginLeft: 8, background: '#F0EDE8', color: '#6B6B6B', fontSize: 10, padding: '2px 8px', borderRadius: 20, fontWeight: 500 }}>
                  cached · {data.cache_age_hours}h ago
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {/* Profile incomplete warning */}
      {data && !data.role_searched && (
        <div style={{ background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: 10, padding: '14px 18px', margin: '20px 28px' }}>
          <p style={{ fontSize: 13, color: '#92400E' }}>
            Your profile is incomplete. <a href="/scanner" style={{ color: '#92400E', fontWeight: 600 }}>Complete the scanner</a> to see personalized job matches.
          </p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: 'calc(100vh - 80px)' }}>
        {/* Sidebar filters */}
        <div style={{ background: '#fff', borderRight: '1px solid #E0DDD8', padding: 20 }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B6B6B', marginBottom: 10 }}>Work Type</div>
            {(['all', 'remote', 'onsite'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', fontSize: 13,
                  border: `1px solid ${filter === f ? '#0D0D0D' : '#E0DDD8'}`,
                  borderRadius: 6, marginBottom: 6, cursor: 'pointer',
                  background: filter === f ? '#0D0D0D' : '#fff',
                  color: filter === f ? '#fff' : '#0D0D0D',
                }}
              >
                {f === 'all' ? 'All' : f === 'remote' ? 'Remote only' : 'On-site only'}
              </button>
            ))}
          </div>

          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B6B6B', marginBottom: 10 }}>
              Min Match: {minMatch}%
            </div>
            <input
              type="range" min={0} max={80} step={10} value={minMatch}
              onChange={e => setMinMatch(Number(e.target.value))}
              style={{ width: '100%' }}
            />
          </div>
        </div>

        {/* Job feed */}
        <div style={{ padding: 20 }}>
          {error && (
            <div style={{ background: '#FEE2E2', border: '1px solid #F09595', borderRadius: 8, padding: '12px 16px', marginBottom: 16, color: '#B91C1C', fontSize: 13 }}>
              {error}
            </div>
          )}

          {filtered.length === 0 && !error && (
            <div style={{ textAlign: 'center', padding: '60px 0', color: '#6B6B6B' }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
              <p style={{ fontSize: 14 }}>No jobs match your current filters.</p>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(job => (
              <JobCard key={job.job_id} job={job} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function JobCard({ job }: { job: JobListing }) {
  const isTopMatch = job.match_pct >= 80

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${isTopMatch ? '#1A6B3C' : '#E0DDD8'}`,
      borderRadius: 12, padding: '18px 20px', display: 'flex', gap: 16,
    }}>
      {/* Company logo placeholder */}
      <div style={{ width: 44, height: 44, borderRadius: 10, background: '#F0EDE8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
        🏢
      </div>

      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 }}>
          <div>
            {isTopMatch && (
              <div style={{ background: '#1A6B3C', color: '#fff', fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4, display: 'inline-block', marginBottom: 6 }}>
                Top Match
              </div>
            )}
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{job.title}</div>
            <div style={{ fontSize: 12, color: '#6B6B6B' }}>
              {job.company} · {job.is_remote ? 'Remote' : job.location}
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#1A6B3C', letterSpacing: -0.5 }}>{job.match_pct}%</div>
            <div style={{ fontSize: 9, color: '#6B6B6B', textTransform: 'uppercase', letterSpacing: 0.5 }}>Match</div>
          </div>
        </div>

        <p style={{ fontSize: 12, color: '#6B6B6B', lineHeight: 1.5, marginBottom: 10 }}>{job.description_snippet}</p>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
          {job.required_skills.map(skill => (
            <span key={skill} style={{ background: '#F0EDE8', color: '#6B6B6B', fontSize: 10, padding: '3px 8px', borderRadius: 20 }}>
              {skill}
            </span>
          ))}
        </div>

        <a
          href={job.apply_url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ display: 'inline-block', background: '#0D0D0D', color: '#fff', fontSize: 12, fontWeight: 600, padding: '7px 16px', borderRadius: 8, textDecoration: 'none' }}
        >
          Apply →
        </a>
      </div>
    </div>
  )
}
