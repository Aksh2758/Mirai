'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { scanGithub, scanPdf, scanManual, analyze } from '@/lib/api'
import GithubTab from '@/components/scanner/GithubTab'
import PdfTab from '@/components/scanner/PdfTab'
import ManualTab from '@/components/scanner/ManualTab'
import type { GithubData, ExtractedPdfData, AnalyzerResult } from '@/lib/types'

type ScannerTab = 'github' | 'pdf' | 'manual'

export default function ScannerPage() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<ScannerTab>('github')
  const [isGithubUser, setIsGithubUser] = useState(false)

  // Collected data from each scanner tab
  const [githubData, setGithubData] = useState<GithubData | null>(null)
  const [pdfData, setPdfData] = useState<ExtractedPdfData | null>(null)
  const [manualData, setManualData] = useState<ExtractedPdfData | null>(null)

  // Loading and error states
  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      // Check if they logged in via GitHub
      const provider = session?.user?.app_metadata?.provider
      setIsGithubUser(provider === 'github')

      // If GitHub user, auto-fetch their GitHub data now (no URL needed)
      if (provider === 'github') {
        setLoadingMessage('Fetching your GitHub profile...')
        setLoading(true)
        try {
          const data = await scanGithub('') // Empty URL — backend uses token from profile
          setGithubData(data)
        } catch (e: any) {
          setError(`Could not fetch GitHub data: ${e.message}`)
        } finally {
          setLoading(false)
          setLoadingMessage('')
        }
      }
    }
    checkAuth()
  }, [router])

  async function handleAnalyze() {
    // Validation: must have at least one data source
    if (!githubData && !pdfData && !manualData) {
      setError('Please complete at least one section (GitHub, PDF upload, or Manual Quiz)')
      return
    }

    setLoading(true)
    setError(null)
    setLoadingMessage('Analyzing your profile...')

    try {
      const result: AnalyzerResult = await analyze({
        github_data: githubData,
        pdf_data: pdfData,
        manual_data: manualData,
      })

      // Save result to sessionStorage so the results page can read it
      sessionStorage.setItem('analyzerResult', JSON.stringify(result))
      router.push('/scanner/results')
    } catch (e: any) {
      setError(`Analysis failed: ${e.message}`)
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }

  if (loading && !githubData && !pdfData && !manualData) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0D0D0D' }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚡</div>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>{loadingMessage}</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED', padding: '48px 24px' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 6 }}>Scan Your Profile</h1>
        <p style={{ color: '#6B6B6B', marginBottom: 36 }}>We figure out who you are. You figure out who you can become.</p>

        {isGithubUser ? (
          <div>
            {githubData && (
              <div style={{ background: '#E8F5EE', border: '1px solid #1A6B3C', borderRadius: 12, padding: '14px 18px', marginBottom: 24 }}>
                <p style={{ color: '#1A6B3C', fontWeight: 600, fontSize: 14 }}>
                  ✓ GitHub profile fetched — {githubData.repo_count} repositories · Top language: {Object.keys(githubData.top_languages)[0]}
                </p>
              </div>
            )}
            <PdfTab onDataExtracted={(data) => setPdfData(data)} />
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', background: '#F0EDE8', borderRadius: 10, padding: 4, marginBottom: 28, width: 'fit-content' }}>
              {(['github', 'pdf', 'manual'] as ScannerTab[]).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  style={{
                    padding: '8px 20px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
                    background: activeTab === tab ? '#fff' : 'transparent',
                    color: activeTab === tab ? '#0D0D0D' : '#6B6B6B',
                    boxShadow: activeTab === tab ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  }}
                >
                  {tab === 'github' ? 'GitHub URL' : tab === 'pdf' ? 'PDF Upload' : 'Manual Quiz'}
                </button>
              ))}
            </div>

            {activeTab === 'github' && (
              <GithubTab
                onDataFetched={(data) => setGithubData(data)}
                fetched={!!githubData}
              />
            )}
            {activeTab === 'pdf' && (
              <PdfTab onDataExtracted={(data) => setPdfData(data)} />
            )}
            {activeTab === 'manual' && (
              <ManualTab onDataProcessed={(data) => setManualData(data)} />
            )}
          </div>
        )}

        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #F09595', borderRadius: 8, padding: '12px 16px', marginTop: 20, color: '#B91C1C', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleAnalyze}
          disabled={loading || (!githubData && !pdfData && !manualData)}
          style={{
            marginTop: 28, width: '100%', background: loading ? '#999' : '#0D0D0D',
            color: '#fff', border: 'none', borderRadius: 10, padding: '14px 0',
            fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? loadingMessage : 'Analyze My Profile →'}
        </button>
      </div>
    </div>
  )
}
