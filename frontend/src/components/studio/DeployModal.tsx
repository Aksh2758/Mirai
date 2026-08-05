'use client'
import { useState } from 'react'
import { useStudioStore } from '@/store/studioStore'
import { deployProject, saveVercelToken, syncStudioWorkspace } from '@/lib/api'
import type { DeployStep } from '@/lib/types'

interface Props {
  projectId: string
  psiScore?: number   // Pass if PSI was run — used in LinkedIn post
}

const INITIAL_STEPS: DeployStep[] = [
  { id: 1, label: 'Reading project files',       status: 'pending' },
  { id: 2, label: 'Checking GitHub credentials', status: 'pending' },
  { id: 3, label: 'Creating GitHub repository',  status: 'pending' },
  { id: 4, label: 'Pushing code to GitHub',      status: 'pending' },
  { id: 5, label: 'Deploying to Vercel',          status: 'pending' },
  { id: 6, label: 'Generating LinkedIn post',    status: 'pending' },
  { id: 7, label: 'Saving deploy record',        status: 'pending' },
]

export default function DeployModal({ projectId, psiScore }: Props) {
  const {
    showDeployModal, setShowDeployModal,
    deploySteps, setDeploySteps, updateDeployStep,
    deployResult, setDeployResult,
  } = useStudioStore()

  const [showLinkedIn, setShowLinkedIn] = useState(false)
  const [copied, setCopied] = useState(false)
  const [vercelTokenInput, setVercelTokenInput] = useState('')
  const [savingVercel, setSavingVercel] = useState(false)
  const [vercelSaved, setVercelSaved] = useState(false)

  if (!showDeployModal) return null

  const isDeploying = deploySteps.some(s => s.status === 'running')
  const isDone = !!deployResult

  async function handleDeploy() {
    setDeploySteps(INITIAL_STEPS)
    setDeployResult(null)
    setShowLinkedIn(false)
    setCopied(false)

    try {
      await syncStudioWorkspace(projectId).catch(() => null)
      const response = await deployProject(projectId, psiScore)
      if (!response.body) throw new Error('No response body')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''

        for (const event of events) {
          const dataLine = event.split('\n').find(l => l.startsWith('data: '))
          if (!dataLine) continue
          const data = dataLine.slice(6).trim()
          if (!data) continue

          try {
            const parsed = JSON.parse(data)
            if (parsed.done) {
              setDeployResult({
                success: !parsed.error,
                live_url: parsed.live_url || '',
                github_url: parsed.github_url || '',
                steps: [],
                demo_mode: parsed.demo_mode,
                linkedin_post: parsed.linkedin_post,
                linkedin_headline: parsed.linkedin_headline,
                linkedin_hashtags: parsed.linkedin_hashtags,
              })
            } else {
              updateDeployStep(parsed.step_id, {
                status: parsed.status as DeployStep['status'],
                label: parsed.label,
                detail: parsed.detail,
              })
            }
          } catch {
            console.warn('Failed to parse SSE event:', data)
          }
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      alert(`Deploy failed: ${message}`)
      setDeploySteps(INITIAL_STEPS)
    }
  }

  async function handleSaveVercelToken() {
    if (!vercelTokenInput.trim()) return
    setSavingVercel(true)
    try {
      await saveVercelToken(vercelTokenInput.trim())
      setVercelSaved(true)
      setVercelTokenInput('')
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      alert(`Failed to save token: ${message}`)
    } finally {
      setSavingVercel(false)
    }
  }

  async function handleCopyPost() {
    if (!deployResult?.linkedin_post) return
    await navigator.clipboard.writeText(deployResult.linkedin_post)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const STATUS_ICON = (status: DeployStep['status']) => {
    if (status === 'done')    return <span style={{ color: '#4ADE80', fontSize: 14 }}>✓</span>
    if (status === 'running') return <span style={{ fontSize: 12, color: '#FACC15', display: 'inline-block', animation: 'spin 1s linear infinite' }}>↻</span>
    if (status === 'error')   return <span style={{ color: '#F87171', fontSize: 14 }}>✗</span>
    return <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#2a2a2a', display: 'inline-block' }} />
  }

  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .deploy-scroll::-webkit-scrollbar { width: 4px; }
        .deploy-scroll::-webkit-scrollbar-track { background: transparent; }
        .deploy-scroll::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
      `}</style>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24 }}
        onClick={(e) => { if (e.target === e.currentTarget && !isDeploying) setShowDeployModal(false) }}
      >
        <div
          className="deploy-scroll"
          style={{ background: '#0D0D0D', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16, padding: '32px', maxWidth: 500, width: '100%', maxHeight: '90vh', overflowY: 'auto', color: '#fff' }}
        >

          {/* ── Header ── */}
          <div style={{ marginBottom: 24 }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, marginBottom: 6 }}>
              {isDone
                ? deployResult?.success ? '🚀 Deployed!' : '⚠️ Deploy Incomplete'
                : 'Deploy Project'}
            </h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
              {isDone
                ? deployResult?.demo_mode
                  ? 'Connected GitHub via OAuth to push real code next time.'
                  : 'Your project is live. Copy the LinkedIn post to share your work.'
                : isDeploying
                ? 'Pushing your code to GitHub and deploying...'
                : 'Push code to GitHub + deploy live + generate a LinkedIn post.'}
            </p>
          </div>

          {/* ── Vercel Token Setup (shown before deploy if not deploying) ── */}
          {!isDeploying && !isDone && (
            <div style={{ background: 'rgba(250,204,21,0.06)', border: '1px solid rgba(250,204,21,0.15)', borderRadius: 10, padding: '14px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#FACC15', marginBottom: 8 }}>
                Optional: Add Vercel Token for Live URL
              </div>
              {vercelSaved ? (
                <div style={{ fontSize: 12, color: '#4ADE80' }}>✓ Vercel token saved — live deploy enabled!</div>
              ) : (
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="password"
                    placeholder="vercel_token_..."
                    value={vercelTokenInput}
                    onChange={e => setVercelTokenInput(e.target.value)}
                    style={{ flex: 1, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '7px 10px', color: '#fff', fontSize: 12, outline: 'none' }}
                  />
                  <button
                    onClick={handleSaveVercelToken}
                    disabled={savingVercel || !vercelTokenInput.trim()}
                    style={{ background: '#FACC15', color: '#0D0D0D', border: 'none', borderRadius: 6, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  >
                    {savingVercel ? '...' : 'Save'}
                  </button>
                </div>
              )}
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 6 }}>
                Get token at vercel.com/account/tokens — or skip to push GitHub only
              </div>
            </div>
          )}

          {/* ── Deploy Button ── */}
          {!isDeploying && !isDone && deploySteps.every(s => s.status === 'pending') && (
            <button
              onClick={handleDeploy}
              style={{ width: '100%', background: '#4ADE80', color: '#0D0D0D', border: 'none', borderRadius: 10, padding: '13px 0', fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16 }}
            >
              🚀 Deploy Now
            </button>
          )}

          {/* ── Build Log ── */}
          {(isDeploying || deploySteps.some(s => s.status !== 'pending')) && (
            <div style={{ background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
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
                        color: step.status === 'running' ? '#fff' : step.status === 'done' ? 'rgba(255,255,255,0.55)' : step.status === 'error' ? '#F87171' : 'rgba(255,255,255,0.18)',
                        fontFamily: 'monospace',
                      }}>
                        {step.label}
                        {step.status === 'running' && <span style={{ color: '#4ADE80' }}> ...</span>}
                      </div>
                      {step.detail && step.status !== 'pending' && (
                        <div style={{ fontSize: 10, color: step.status === 'error' ? '#F87171' : 'rgba(255,255,255,0.22)', marginTop: 1 }}>{step.detail}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Done State — URLs + LinkedIn ── */}
          {isDone && deployResult && (
            <div style={{ animation: 'fadeIn 0.4s ease', display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>

              {/* Demo mode notice */}
              {deployResult.demo_mode && (
                <div style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)', borderRadius: 10, padding: '12px 16px', fontSize: 12, color: '#FACC15' }}>
                  ⚡ Demo Mode — Log in with GitHub OAuth to enable real code push
                </div>
              )}

              {/* Live URL */}
              {deployResult.live_url && (
                <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#4ADE80', marginBottom: 6 }}>
                    {deployResult.demo_mode ? 'Demo URL' : '🌐 Live URL'}
                  </div>
                  <a
                    href={deployResult.live_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 13, color: '#4ADE80', textDecoration: 'none', wordBreak: 'break-all' }}
                  >
                    {deployResult.live_url}
                  </a>
                </div>
              )}

              {/* GitHub URL */}
              {deployResult.github_url && (
                <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>
                    💻 GitHub Repo
                  </div>
                  <a
                    href={deployResult.github_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', textDecoration: 'none', wordBreak: 'break-all' }}
                  >
                    {deployResult.github_url}
                  </a>
                </div>
              )}

              {/* LinkedIn Post */}
              {deployResult.linkedin_post && (
                <div style={{ border: '1px solid rgba(10,102,194,0.4)', borderRadius: 10, overflow: 'hidden' }}>
                  <button
                    onClick={() => setShowLinkedIn(!showLinkedIn)}
                    style={{ width: '100%', background: 'rgba(10,102,194,0.12)', border: 'none', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', color: '#fff' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 16 }}>in</span>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>LinkedIn Post Ready</span>
                      {deployResult.linkedin_headline && (
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          — {deployResult.linkedin_headline}
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{showLinkedIn ? '▲' : '▼'}</span>
                  </button>

                  {showLinkedIn && (
                    <div style={{ background: '#0a0a0a', padding: '14px 16px' }}>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, whiteSpace: 'pre-wrap', marginBottom: 12 }}>
                        {deployResult.linkedin_post}
                      </div>
                      {deployResult.linkedin_hashtags && deployResult.linkedin_hashtags.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                          {deployResult.linkedin_hashtags.map((tag, i) => (
                            <span key={i} style={{ background: 'rgba(10,102,194,0.15)', color: '#60A5FA', borderRadius: 4, padding: '2px 8px', fontSize: 11 }}>
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          onClick={handleCopyPost}
                          style={{ flex: 1, background: copied ? '#4ADE80' : 'rgba(10,102,194,0.5)', color: copied ? '#0D0D0D' : '#fff', border: 'none', borderRadius: 8, padding: '9px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'background 0.2s' }}
                        >
                          {copied ? '✓ Copied!' : '📋 Copy Post'}
                        </button>
                        <a
                          href="https://www.linkedin.com/feed/"
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ flex: 1, background: 'rgba(10,102,194,0.3)', color: '#fff', borderRadius: 8, padding: '9px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >
                          Open LinkedIn →
                        </a>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Close / Cancel ── */}
          <button
            onClick={() => setShowDeployModal(false)}
            disabled={isDeploying}
            style={{ width: '100%', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: 'none', borderRadius: 10, padding: '10px 0', fontSize: 13, cursor: isDeploying ? 'not-allowed' : 'pointer' }}
          >
            {isDone ? 'Close' : isDeploying ? 'Deploying...' : 'Cancel'}
          </button>
        </div>
      </div>
    </>
  )
}
