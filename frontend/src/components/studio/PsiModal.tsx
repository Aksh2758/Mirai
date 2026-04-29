'use client'
import { useStudioStore } from '@/store/studioStore'
import { runPSIAnalysis } from '@/lib/api'

interface Props {
  projectId: string
}

const SEVERITY_COLORS = {
  high:   { bar: '#FF5733', bg: '#FEF2F2', text: '#B91C1C' },
  medium: { bar: '#F59E0B', bg: '#FFFBEB', text: '#92400E' },
  low:    { bar: '#1A6B3C', bg: '#F0FDF4', text: '#166534' },
}

const SCORE_COLOR = (score: number) => {
  if (score >= 90) return '#16A34A'
  if (score >= 75) return '#1A6B3C'
  if (score >= 50) return '#B45309'
  return '#B91C1C'
}

export default function PsiModal({ projectId }: Props) {
  const {
    showPsiModal, setShowPsiModal,
    psiResult, setPsiResult,
    psiLoading, setPsiLoading,
  } = useStudioStore()

  if (!showPsiModal) return null

  async function handleRun() {
    setPsiLoading(true)
    setPsiResult(null)
    try {
      const result = await runPSIAnalysis(projectId)
      setPsiResult(result)
    } catch (e: any) {
      alert(`PSI analysis failed: ${e.message}`)
    } finally {
      setPsiLoading(false)
    }
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
      onClick={(e) => { if (e.target === e.currentTarget) setShowPsiModal(false) }}
    >
      <div style={{ background: '#FDFCFA', borderRadius: 16, padding: '32px', maxWidth: 540, width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: '#6B6B6B', marginBottom: 6 }}>Practical Skill Index</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>Code Analysis</h2>
          </div>
          <button
            onClick={() => setShowPsiModal(false)}
            style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#6B6B6B', lineHeight: 1 }}
          >×</button>
        </div>

        {/* Not yet run */}
        {!psiResult && !psiLoading && (
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚡</div>
            <p style={{ fontSize: 14, color: '#6B6B6B', marginBottom: 24, lineHeight: 1.6 }}>
              PSI scans your entire codebase and compares it against industry standards.<br />
              Get a score, find what to fix, and know where you stand.
            </p>
            <button
              onClick={handleRun}
              style={{ background: '#0D0D0D', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 32px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              Run Analysis →
            </button>
          </div>
        )}

        {/* Loading */}
        {psiLoading && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: 14, color: '#6B6B6B' }}>Analyzing your code...</div>
            <div style={{ marginTop: 12, fontSize: 12, color: '#9CA3AF' }}>This takes 5–10 seconds</div>
          </div>
        )}

        {/* Results */}
        {psiResult && (
          <>
            {/* Overall score */}
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div style={{ fontSize: 72, fontWeight: 800, letterSpacing: -3, lineHeight: 1, color: SCORE_COLOR(psiResult.score) }}>
                {psiResult.score}
                <span style={{ fontSize: 24, color: '#6B6B6B', fontWeight: 400 }}>/100</span>
              </div>
              <div style={{ fontSize: 13, color: SCORE_COLOR(psiResult.score), fontWeight: 500, marginTop: 6 }}>
                {psiResult.score >= 90 ? 'Excellent — Production Ready'
                  : psiResult.score >= 75 ? 'Strong — Minor fixes needed'
                  : psiResult.score >= 50 ? 'Developing — Several things to fix'
                  : 'Needs Work — Focus on the high-priority items below'}
              </div>
            </div>

            {/* Dimensions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
              {psiResult.dimensions.map(dim => (
                <div key={dim.name} style={{ background: '#F0EDE8', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, color: '#6B6B6B', marginBottom: 6 }}>
                    {dim.name}
                  </div>
                  <div style={{ background: '#E0DDD8', borderRadius: 4, height: 4, marginBottom: 6 }}>
                    <div style={{ width: `${dim.score}%`, height: 4, borderRadius: 4, background: SCORE_COLOR(dim.score), transition: 'width 0.8s ease' }} />
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: SCORE_COLOR(dim.score) }}>{dim.score}</div>
                </div>
              ))}
            </div>

            {/* Improvements */}
            <div style={{ marginBottom: 20 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>What to fix</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {psiResult.improvements.map((imp, i) => {
                  const colors = SEVERITY_COLORS[imp.severity]
                  return (
                    <div key={i} style={{ display: 'flex', gap: 10, background: '#fff', border: '1px solid #E0DDD8', borderRadius: 8, padding: 12 }}>
                      <div style={{ width: 4, borderRadius: 2, background: colors.bar, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{imp.title}</div>
                        <div style={{ fontSize: 11, color: '#6B6B6B', lineHeight: 1.5 }}>{imp.description}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Compliments */}
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>What you did well</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {psiResult.compliments.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 13, color: '#2a2a2a', alignItems: 'flex-start' }}>
                    <span style={{ color: '#1A6B3C', flexShrink: 0 }}>✓</span>
                    <span>{c}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleRun}
                style={{ flex: 1, background: '#F0EDE8', color: '#0D0D0D', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
              >
                Re-run Analysis
              </button>
              <button
                onClick={() => setShowPsiModal(false)}
                style={{ flex: 1, background: '#0D0D0D', color: '#fff', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Back to Studio
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
