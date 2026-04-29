'use client'
import { useStudioStore } from '@/store/studioStore'
import { deployProject } from '@/lib/api'
import type { DeployStep } from '@/lib/types'

interface Props {
  projectId: string
}

const INITIAL_STEPS: DeployStep[] = [
  { id: 1, label: 'Reading project files',       status: 'pending' },
  { id: 2, label: 'Bundling source code',         status: 'pending' },
  { id: 3, label: 'Running dependency check',     status: 'pending' },
  { id: 4, label: 'Building Docker container',    status: 'pending' },
  { id: 5, label: 'Pushing to Nirmaan cloud',     status: 'pending' },
  { id: 6, label: 'Starting application server',  status: 'pending' },
  { id: 7, label: 'Creating GitHub repository',   status: 'pending' },
  { id: 8, label: 'Pushing code to GitHub',       status: 'pending' },
]

export default function DeployModal({ projectId }: Props) {
  const {
    showDeployModal, setShowDeployModal,
    deploySteps, setDeploySteps, updateDeployStep,
    deployResult, setDeployResult,
  } = useStudioStore()

  if (!showDeployModal) return null

  const isDeploying = deploySteps.some(s => s.status === 'running')
  const isDone = !!deployResult

  async function handleDeploy() {
    setDeploySteps(INITIAL_STEPS)
    setDeployResult(null)

    try {
      const response = await deployProject(projectId)
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''    // ← Buffer accumulates incomplete lines

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Append new chunk to buffer
        buffer += decoder.decode(value, { stream: true })

        // Split on double newline (SSE event separator)
        const events = buffer.split('\n\n')

        // Last element may be incomplete — keep it in the buffer
        buffer = events.pop() ?? ''

        for (const event of events) {
          // Each event starts with "data: "
          const dataLine = event.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine) continue
          const data = dataLine.slice(6).trim()
          if (!data) continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.done) {
              setDeployResult({
                success: true,
                live_url: parsed.live_url,
                github_url: parsed.github_url,
                steps: [],
              })
            } else {
              updateDeployStep(parsed.step_id, {
                status: parsed.status as DeployStep['status'],
                label: parsed.label,
                detail: parsed.detail,
              })
            }
          } catch (parseErr) {
            console.warn('Failed to parse SSE event:', data)
          }
        }
      }
    } catch (e: any) {
      alert(`Deploy failed: ${e.message}`)
      setDeploySteps(INITIAL_STEPS)
    }
  }

  const STATUS_ICON = (status: DeployStep['status']) => {
    if (status === 'done') return <span style={{ color: '#1A6B3C', fontSize: 14 }}>✓</span>
    if (status === 'running') return <span style={{ fontSize: 12, color: '#F59E0B', display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span>
    if (status === 'error') return <span style={{ color: '#B91C1C', fontSize: 14 }}>✗</span>
    return <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#E0DDD8', display: 'inline-block' }} />
  }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
      `}</style>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
        onClick={(e) => { if (e.target === e.currentTarget && !isDeploying) setShowDeployModal(false) }}
      >
        <div style={{ background: '#0D0D0D', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '32px', maxWidth: 460, width: '100%', color: '#fff' }}>

          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginBottom: 6 }}>
              {isDone ? 'Deployed ✓' : 'Deploy Project'}
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
              {isDone
                ? 'Your project is live. Share it with anyone.'
                : isDeploying
                ? 'Deploying your project to Nirmaan Cloud...'
                : 'Push your project to GitHub and deploy it live.'}
            </p>
          </div>

          {/* Not started */}
          {!isDeploying && !isDone && deploySteps.every(s => s.status === 'pending') && (
            <button
              onClick={handleDeploy}
              style={{ width: '100%', background: '#4ADE80', color: '#0D0D0D', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}
            >
              🚀 Deploy Now
            </button>
          )}

          {/* Step list — shown during and after deploy */}
          {(isDeploying || deploySteps.some(s => s.status !== 'pending')) && (
            <div style={{ background: '#161616', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 12 }}>Build Log</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {deploySteps.map(step => (
                  <div key={step.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ width: 16, flexShrink: 0, marginTop: 1, textAlign: 'center' }}>
                      {STATUS_ICON(step.status)}
                    </div>
                    <div>
                      <div style={{
                        fontSize: 12,
                        color: step.status === 'running' ? '#fff' : step.status === 'done' ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)',
                        fontFamily: 'monospace',
                      }}>
                        {step.label}
                        {step.status === 'running' && <span style={{ color: '#4ADE80' }}> ...</span>}
                      </div>
                      {step.detail && step.status === 'done' && (
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{step.detail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Done state — show URLs */}
          {isDone && deployResult && (
            <div style={{ animation: 'fadeIn 0.4s ease', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#4ADE80', marginBottom: 6 }}>Live URL</div>
                <a
                  href={deployResult.live_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: '#4ADE80', textDecoration: 'none', wordBreak: 'break-all' }}
                >
                  {deployResult.live_url}
                </a>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>GitHub Repo</div>
                <a
                  href={deployResult.github_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textDecoration: 'none', wordBreak: 'break-all' }}
                >
                  {deployResult.github_url}
                </a>
              </div>
            </div>
          )}

          <button
            onClick={() => setShowDeployModal(false)}
            disabled={isDeploying}
            style={{ width: '100%', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, cursor: isDeploying ? 'not-allowed' : 'pointer' }}
          >
            {isDone ? 'Close' : 'Cancel'}
          </button>
        </div>
      </div>
    </>
  )
}
