'use client'
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { scanGithub, analyze } from '@/lib/api'
import GithubTab from '@/components/scanner/GithubTab'
import PdfTab from '@/components/scanner/PdfTab'
import ManualTab from '@/components/scanner/ManualTab'
import type { GithubData, ExtractedPdfData, AnalyzerResult } from '@/lib/types'

export default function ScannerPage() {
  const router = useRouter()
  const [isGithubUser, setIsGithubUser] = useState(false)
  const [quizOpen, setQuizOpen] = useState(false)

  // Collected data from each source
  const [githubData, setGithubData] = useState<GithubData | null>(null)
  const [pdfData, setPdfData] = useState<ExtractedPdfData | null>(null)
  const [manualData, setManualData] = useState<ExtractedPdfData | null>(null)

  const [loading, setLoading] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const provider = session?.user?.app_metadata?.provider
      setIsGithubUser(provider === 'github')

      // GitHub login: fetch their data right away (backend uses the stored token)
      if (provider === 'github') {
        setLoadingMessage('Fetching your GitHub profile...')
        setLoading(true)
        try {
          const data = await scanGithub('')
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

  const sourceCount = [githubData, pdfData, manualData].filter(Boolean).length
  const strength = [
    { label: 'Add one source to start', color: '#D9D4CA' },
    { label: 'Good', color: '#D99A22' },
    { label: 'Better', color: '#4C9F70' },
    { label: 'Best', color: '#1A6B3C' },
  ][sourceCount]

  async function handleAnalyze() {
    if (sourceCount === 0) {
      setError('Add at least one source: a GitHub link, a resume, or the quick quiz.')
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
      if (manualData?.learning_goal) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          try {
            const key = `nirmaan-roadmap:${session.user.email || 'user'}`
            const saved = JSON.parse(localStorage.getItem(key) || '{}')
            localStorage.setItem(key, JSON.stringify({ ...saved, goal: manualData.learning_goal }))
          } catch { /* analysis must still complete if local storage is unavailable */ }
        }
      }
      sessionStorage.setItem('analyzerResult', JSON.stringify(result))
      router.push('/scanner/results')
    } catch (e: any) {
      setError(`Analysis failed: ${e.message}`)
    } finally {
      setLoading(false)
      setLoadingMessage('')
    }
  }

  if (loading && sourceCount === 0) {
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
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 6,color: '#000000' }}>Scan Your Profile</h1>
        <p style={{ color: '#6B6B6B', marginBottom: 8 }}>We figure out who you are. You figure out who you can become.</p>
        <p style={{ color: '#6B6B6B', fontSize: 14, marginBottom: 28 }}>
          You only need <strong>one</strong> of the options below. Add more if you like, and your result gets more accurate.
        </p>

        {/* Option 1: GitHub */}
        <Section
          title="GitHub"
          badge="Recommended"
          done={!!githubData}
        >
          {isGithubUser ? (
            githubData ? (
              <p style={{ margin: 0, color: '#1A6B3C', fontWeight: 600, fontSize: 14 }}>
                ✓ Connected from your login: {githubData.repo_count} repositories · Top language: {Object.keys(githubData.top_languages)[0]}
              </p>
            ) : (
              <p style={{ margin: 0, color: '#6B6B6B', fontSize: 14 }}>Fetching your GitHub profile...</p>
            )
          ) : (
            <GithubTab onDataFetched={(data) => setGithubData(data)} fetched={!!githubData} />
          )}
        </Section>

        <Divider text="or" />

        {/* Option 2: Resume */}
        <Section title="Upload your resume" done={!!pdfData}>
          <PdfTab onDataExtracted={(data) => setPdfData(data)} />
        </Section>

        <Divider text="no GitHub or resume?" />

        {/* Option 3: Quiz (kept mounted so answers are not lost when collapsed) */}
        <div style={{ ...cardStyle, borderStyle: quizOpen ? 'solid' : 'dashed', borderColor: manualData ? '#1A6B3C' : '#CFC9BE' }}>
          <button onClick={() => setQuizOpen((o) => !o)} style={quizToggle} aria-expanded={quizOpen}>
            <span>
              <strong style={{ fontSize: 15 ,color: '#000000ff'}}>Take a quick quiz</strong>
              <span style={{ display: 'block', color: '#6B6B6B', fontSize: 13, marginTop: 2 }}>
                A few questions about your skills, no account links needed
              </span>
            </span>
            <span style={{ fontSize: 13, color: manualData ? '#1A6B3C' : '#6B6B6B', fontWeight: 600 }}>
              {manualData ? '✓ Done' : quizOpen ? 'Hide ↑' : 'Start →'}
            </span>
          </button>
          <div hidden={!quizOpen} style={{ marginTop: quizOpen ? 18 : 0 }}>
            <ManualTab onDataProcessed={(data) => setManualData(data)} />
          </div>
        </div>

        {/* Strength meter */}
        <div style={{ marginTop: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
            <span style={{ color: '#6B6B6B' }}>Profile strength</span>
            <strong style={{ color: strength.color === '#D9D4CA' ? '#6B6B6B' : strength.color }}>{strength.label}</strong>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[1, 2, 3].map((n) => (
              <div key={n} style={{ flex: 1, height: 6, borderRadius: 999, background: n <= sourceCount ? strength.color : '#E6E1D8', transition: 'background .3s' }} />
            ))}
          </div>
          {sourceCount === 1 && (
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6B6B6B' }}>Tip: add a second source for a more accurate result.</p>
          )}
        </div>

        {error && (
          <div style={{ background: '#FEE2E2', border: '1px solid #F09595', borderRadius: 8, padding: '12px 16px', marginTop: 20, color: '#B91C1C', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          onClick={handleAnalyze}
          disabled={loading || sourceCount === 0}
          style={{
            marginTop: 20, width: '100%', background: loading ? '#999' : sourceCount === 0 ? '#B8B3A8' : '#0D0D0D',
            color: '#fff', border: 'none', borderRadius: 10, padding: '14px 0',
            fontSize: 15, fontWeight: 700, cursor: loading || sourceCount === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? loadingMessage : 'Analyze My Profile →'}
        </button>
      </div>
    </div>
  )
}

function Section({ title, badge, done, children }: { title: string; badge?: string; done: boolean; children: ReactNode }) {
  return (
    <section style={{ ...cardStyle, borderColor: done ? '#1A6B3C' : '#E6E1D8' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800,color: '#000000ce' }}>{title}</h2>
        {badge && <span style={{ background: '#E8F5EE', color: '#1A6B3C', fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999 }}>{badge}</span>}
        {done && <span style={{ marginLeft: 'auto', color: '#1A6B3C', fontSize: 13, fontWeight: 600 }}>✓ Added</span>}
      </div>
      {children}
    </section>
  )
}

function Divider({ text }: { text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0', color: '#8A857B', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>
      <div style={{ flex: 1, height: 1, background: '#DDD8CE' }} />
      {text}
      <div style={{ flex: 1, height: 1, background: '#DDD8CE' }} />
    </div>
  )
}

const cardStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid #E6E1D8',
  borderRadius: 14,
  padding: 20,
  transition: 'border-color .2s',
}

const quizToggle: CSSProperties = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  background: 'transparent',
  border: 'none',
  padding: 0,
  textAlign: 'left',
  cursor: 'pointer',
  color: 'inherit',
}
