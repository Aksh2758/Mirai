'use client'
import { useState } from 'react'
import { scanGithub } from '@/lib/api'
import type { GithubData } from '@/lib/types'

interface Props {
  onDataFetched: (data: GithubData) => void
  fetched: boolean
}

export default function GithubTab({ onDataFetched, fetched }: Props) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fetchedData, setFetchedData] = useState<GithubData | null>(null)

  async function handleFetch() {
    if (!url.includes('github.com/')) {
      setError('Please enter a valid GitHub profile URL (e.g. https://github.com/username)')
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await scanGithub(url)
      setFetchedData(data)
      onDataFetched(data)
    } catch (e: any) {
      setError(`Could not fetch: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (fetchedData || fetched) {
    return (
      <div style={{ background: '#E8F5EE', border: '1px solid #1A6B3C', borderRadius: 12, padding: '16px 20px' }}>
        <p style={{ color: '#1A6B3C', fontWeight: 600, fontSize: 14 }}>✓ GitHub profile fetched successfully</p>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E0DDD8', borderRadius: 12, padding: '24px' }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>GitHub Profile URL</h3>
      <p style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 20 }}>Paste your GitHub profile link to analyze your repository activity.</p>
      
      <div style={{ display: 'flex', gap: 10 }}>
        <input
          type="text"
          placeholder="https://github.com/yourusername"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          style={{
            flex: 1, padding: '10px 14px', borderRadius: 8, border: '1px solid #E0DDD8',
            fontSize: 14, outline: 'none',
          }}
        />
        <button
          onClick={handleFetch}
          disabled={loading || !url}
          style={{
            padding: '0 20px', background: '#0D0D0D', color: '#fff', border: 'none',
            borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Fetching...' : 'Fetch'}
        </button>
      </div>
      {error && <p style={{ color: '#B91C1C', fontSize: 12, marginTop: 8 }}>{error}</p>}
    </div>
  )
}
