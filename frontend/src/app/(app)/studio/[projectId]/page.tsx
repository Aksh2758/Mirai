'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Code2,
  ExternalLink,
  Play,
  RefreshCw,
  Rocket,
  Save,
  Settings,
  Sparkles,
  Terminal,
} from 'lucide-react'
import { completeStep, getProject } from '@/lib/api'
import { useStudioStore } from '@/store/studioStore'
import CopilotPane from '@/components/studio/CopilotPane'
import PsiModal from '@/components/studio/PsiModal'
import DeployModal from '@/components/studio/DeployModal'
import type { Project, RoadmapStep } from '@/lib/types'

const CODE_SERVER_URL = process.env.NEXT_PUBLIC_CODE_SERVER_URL?.trim()
const CODE_SERVER_FOLDER = process.env.NEXT_PUBLIC_CODE_SERVER_FOLDER?.trim()

type StudioMode = 'server' | 'setup'

function buildCodeServerUrl() {
  if (!CODE_SERVER_URL) return null

  try {
    const url = new URL(CODE_SERVER_URL)
    if (CODE_SERVER_FOLDER && !url.searchParams.has('folder') && !url.searchParams.has('workspace')) {
      url.searchParams.set('folder', CODE_SERVER_FOLDER)
    }
    return url.toString()
  } catch {
    return CODE_SERVER_URL
  }
}

function StepStatus({ step, active }: { step: RoadmapStep; active: boolean }) {
  const done = step.status === 'done'
  const locked = step.status === 'locked'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '18px 1fr',
        gap: 10,
        padding: '9px 10px',
        borderRadius: 8,
        background: active ? '#04395e' : 'transparent',
        border: active ? '1px solid #0e639c' : '1px solid transparent',
        opacity: locked ? 0.42 : 1,
      }}
    >
      <div
        style={{
          width: 16,
          height: 16,
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: done ? '#3fb950' : active ? '#007acc' : 'transparent',
          border: done || active ? 'none' : '1px solid #6e7681',
          marginTop: 1,
        }}
      >
        {done ? <CheckCircle2 size={12} color="#0d1117" /> : active ? <ChevronRight size={12} color="#fff" /> : null}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            color: active ? '#fff' : '#c9d1d9',
            fontSize: 12,
            fontWeight: active ? 750 : 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {step.title}
        </div>
        <div style={{ color: '#7d8590', fontSize: 10, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
          {done ? 'Completed' : locked ? 'Locked' : active ? 'In progress' : 'Ready'}
        </div>
      </div>
    </div>
  )
}

function RoadmapSidebar({ project, currentStep, onComplete, completing }: {
  project: Project
  currentStep: RoadmapStep | undefined
  onComplete: () => void
  completing: boolean
}) {
  const completed = project.steps.filter((step) => step.status === 'done').length
  const progress = project.steps.length ? Math.round((completed / project.steps.length) * 100) : 0

  return (
    <aside
      style={{
        height: '100%',
        background: '#141414',
        borderRight: '1px solid #2b2b2b',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #2b2b2b', flexShrink: 0 }}>
        <div style={{ color: '#969696', fontSize: 10, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase' }}>
          Project Roadmap
        </div>
        <div style={{ color: '#e6edf3', fontSize: 14, fontWeight: 850, marginTop: 8, lineHeight: 1.35 }}>
          {project.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 999, background: '#2d2d2d', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#007acc' }} />
          </div>
          <span style={{ color: '#969696', fontSize: 10, fontWeight: 800 }}>{progress}%</span>
        </div>
      </div>

      <div style={{ padding: 10, overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {project.steps.map((step, index) => (
          <StepStatus key={step.id} step={step} active={index === project.current_step} />
        ))}
      </div>

      <div style={{ borderTop: '1px solid #2b2b2b', padding: 14, background: '#1f1f1f', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c9d1d9', fontSize: 12, fontWeight: 850 }}>
          <BookOpen size={15} color="#58a6ff" />
          Step focus
        </div>
        <div style={{ color: '#8b949e', fontSize: 11.5, lineHeight: 1.6, marginTop: 9, maxHeight: 118, overflowY: 'auto' }}>
          {currentStep?.instructions || 'Load the project to see current mentor instructions.'}
        </div>
        <button
          onClick={onComplete}
          disabled={completing || !currentStep}
          style={{
            width: '100%',
            marginTop: 12,
            height: 34,
            border: 'none',
            borderRadius: 7,
            background: completing ? '#30363d' : '#007acc',
            color: '#fff',
            fontSize: 12,
            fontWeight: 850,
            cursor: completing || !currentStep ? 'not-allowed' : 'pointer',
          }}
        >
          {completing ? 'Checking...' : 'Check step'}
        </button>
      </div>
    </aside>
  )
}

function CodeServerPanel({ iframeSrc, mode, onRetry }: { iframeSrc: string | null; mode: StudioMode; onRetry: () => void }) {
  if (mode === 'setup' || !iframeSrc) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', background: '#1e1e1e', color: '#d4d4d4', padding: 28 }}>
        <div style={{ width: 'min(760px, 100%)', border: '1px solid #3c3c3c', borderRadius: 12, background: '#252526', overflow: 'hidden', boxShadow: '0 24px 80px rgba(0,0,0,0.35)' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #3c3c3c', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Code2 size={18} color="#58a6ff" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 850, color: '#fff' }}>Connect an open VS Code server</div>
              <div style={{ fontSize: 11, color: '#969696', marginTop: 2 }}>Nirmaan embeds the real VS Code Web UI inside the Studio workspace.</div>
            </div>
          </div>
          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            <div style={{ color: '#c9d1d9', fontSize: 13, lineHeight: 1.6 }}>
              Start code-server for the generated project workspace, then expose that URL to the frontend. Restart Next.js after editing the env file.
            </div>
            <pre style={{ margin: 0, padding: 16, borderRadius: 8, background: '#111111', border: '1px solid #3c3c3c', color: '#9cdcfe', fontSize: 12, lineHeight: 1.7, overflowX: 'auto' }}>{`# frontend/.env.local
NEXT_PUBLIC_CODE_SERVER_URL=http://localhost:8080
NEXT_PUBLIC_CODE_SERVER_FOLDER=/workspace/nirmaan-project

# optional backend sync for PSI/deploy from VS Code files
CODE_SERVER_WORKSPACE_ROOT=/workspace/nirmaan-project

# example local launch
code-server --bind-addr 0.0.0.0:8080 --auth none /workspace/nirmaan-project`}</pre>
            <div style={{ display: 'grid', gap: 8, color: '#969696', fontSize: 12, lineHeight: 1.55 }}>
              <div>1. VS Code provides the Explorer, tabs, terminal, source control, command palette, and extensions.</div>
              <div>2. Nirmaan keeps the roadmap and mentor outside the iframe so they stay visible and do not disturb VS Code.</div>
              <div>3. The top navbar and bottom Nirmaan status bar are fixed outside VS Code and will not move with the iframe.</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', background: '#1e1e1e', position: 'relative', overflow: 'hidden' }}>
      <iframe
        key={iframeSrc}
        src={iframeSrc}
        title="Nirmaan VS Code Workspace"
        allow="clipboard-read; clipboard-write; fullscreen"
        style={{ width: '100%', height: '100%', border: 0, display: 'block', background: '#1e1e1e' }}
      />
      <button
        onClick={onRetry}
        title="Reload VS Code iframe"
        style={{
          position: 'absolute',
          right: 14,
          bottom: 14,
          width: 34,
          height: 34,
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(37,37,38,0.92)',
          color: '#d4d4d4',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        }}
      >
        <RefreshCw size={15} />
      </button>
    </div>
  )
}

export default function StudioPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string

  const {
    project,
    setProject,
    adaptiveMessage,
    setAdaptiveMessage,
    showCopilot,
    setShowCopilot,
    setShowPsiModal,
    setShowDeployModal,
    psiResult,
    activeFilename,
    codeFiles,
  } = useStudioStore()

  const [isCompleting, setIsCompleting] = useState(false)
  const [activeMode, setActiveMode] = useState<StudioMode>('server')
  const [reloadKey, setReloadKey] = useState(0)
  const iframeSrc = useMemo(() => {
    const url = buildCodeServerUrl()
    if (!url) return null
    return reloadKey ? `${url}${url.includes('?') ? '&' : '?'}nirmaanReload=${reloadKey}` : url
  }, [reloadKey])

  useEffect(() => {
    if (!projectId) return
    getProject(projectId)
      .then(setProject)
      .catch((err) => {
        console.error('Failed to load project:', err)
        router.push('/scanner')
      })
  }, [projectId, setProject, router])

  async function handleCompleteStep() {
    if (!project || isCompleting) return
    const activeStep = project.steps[project.current_step]
    if (!activeStep) return

    setIsCompleting(true)
    try {
      const result = await completeStep(projectId, activeStep.id)
      setAdaptiveMessage(result.adaptive_message)
      const updated = await getProject(projectId)
      setProject(updated)
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      alert(`Error completing step: ${message}`)
    } finally {
      setIsCompleting(false)
    }
  }

  if (!project) {
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center', background: '#1e1e1e', color: '#d4d4d4' }}>
        <div style={{ textAlign: 'center' }}>
          <RefreshCw size={28} color="#58a6ff" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 14px' }} />
          <p style={{ fontSize: 12, color: '#969696', letterSpacing: 1.2, textTransform: 'uppercase' }}>Initializing Studio</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    )
  }

  const currentStep = project.steps[project.current_step]
  const currentCode = codeFiles[activeFilename] ?? ''
  const filenames = Object.keys(codeFiles)
  const mentorWidth = showCopilot ? 360 : 0

  return (
    <div
      style={{
        height: '100vh',
        position: 'relative',
        background: '#1e1e1e',
        color: '#d4d4d4',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        paddingTop: 48,
        paddingBottom: 24,
        boxSizing: 'border-box',
      }}
    >
      <header
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 48,
          background: '#111111',
          borderBottom: '1px solid #2b2b2b',
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, auto) 1fr auto',
          alignItems: 'center',
          gap: 12,
          padding: '0 12px',
          zIndex: 20,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button onClick={() => router.push('/dashboard')} title="Back to dashboard" style={iconButtonStyle}>
            <ArrowLeft size={16} />
          </button>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 850, whiteSpace: 'nowrap' }}>Nirmaan Studio</div>
            <div style={{ color: '#8b949e', fontSize: 10, whiteSpace: 'nowrap' }}>VS Code workspace</div>
          </div>
        </div>

        <div style={{ textAlign: 'center', color: '#d4d4d4', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.title}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <button onClick={() => setActiveMode('setup')} style={topButtonStyle(false)} title="Code-server setup">
            <Settings size={13} /> Setup
          </button>
          <button
            onClick={() => window.open(iframeSrc || CODE_SERVER_URL || undefined, '_blank')}
            disabled={!iframeSrc && !CODE_SERVER_URL}
            style={topButtonStyle(!iframeSrc && !CODE_SERVER_URL)}
            title="Open VS Code server in a new tab"
          >
            <ExternalLink size={13} /> Open VS Code
          </button>
          <button onClick={() => setReloadKey((key) => key + 1)} style={topButtonStyle(false)} title="Reload workspace">
            <RefreshCw size={13} /> Reload
          </button>
          <button onClick={() => setShowPsiModal(true)} style={topButtonStyle(false)} title="Run Project Skill Index review">
            <Sparkles size={13} /> PSI
          </button>
          <button onClick={() => setShowDeployModal(true)} style={primaryButtonStyle} title="Deploy project">
            <Rocket size={13} /> Deploy
          </button>
          <button onClick={() => setShowCopilot(!showCopilot)} style={topButtonStyle(false)} title="Toggle mentor">
            <Sparkles size={13} /> Mentor
          </button>
        </div>
      </header>

      <main
        style={{
          height: '100%',
          display: 'grid',
          gridTemplateColumns: `288px minmax(0, 1fr) ${mentorWidth}px`,
          minHeight: 0,
          transition: 'grid-template-columns 180ms ease',
          overflow: 'hidden',
        }}
      >
        <RoadmapSidebar project={project} currentStep={currentStep} onComplete={handleCompleteStep} completing={isCompleting} />

        <section style={{ display: 'grid', gridTemplateRows: '32px minmax(0, 1fr)', minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
          <div
            style={{
              background: '#252526',
              borderBottom: '1px solid #2b2b2b',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '0 10px',
              color: '#969696',
              fontSize: 12,
              minWidth: 0,
              overflow: 'hidden',
            }}
          >
            <span style={{ color: '#d4d4d4', fontWeight: 750, whiteSpace: 'nowrap' }}>Workspace</span>
            <span style={{ color: '#5a5a5a' }}>/</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{CODE_SERVER_FOLDER || 'code-server'}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Save size={12} /> VS Code autosave</span>
              <span style={{ color: '#5a5a5a' }}>|</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Terminal size={12} /> terminal</span>
              <span style={{ color: '#5a5a5a' }}>|</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Play size={12} /> run</span>
            </div>
          </div>

          <CodeServerPanel iframeSrc={iframeSrc} mode={activeMode} onRetry={() => setReloadKey((key) => key + 1)} />
        </section>

        {showCopilot && (
          <CopilotPane
            projectId={projectId}
            currentStep={currentStep}
            currentCode={currentCode}
            allFilenames={filenames}
            stepIndex={project.current_step}
          />
        )}
      </main>

      <footer
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: 24,
          background: '#007acc',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '0 10px',
          color: '#fff',
          fontSize: 11,
          fontWeight: 650,
          zIndex: 20,
          boxSizing: 'border-box',
        }}
      >
        <span>Nirmaan</span>
        <span>Step {project.current_step + 1}/{project.steps.length}</span>
        <span>{project.difficulty}</span>
        <span>{project.tech_stack.slice(0, 4).join('  -  ')}</span>
        {adaptiveMessage && <span style={{ marginLeft: 'auto', opacity: 0.95, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adaptiveMessage}</span>}
      </footer>

      <PsiModal projectId={projectId} />
      <DeployModal projectId={projectId} psiScore={psiResult?.score} />
    </div>
  )
}

const iconButtonStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 6,
  background: '#1f1f1f',
  color: '#d4d4d4',
  display: 'grid',
  placeItems: 'center',
  cursor: 'pointer',
}

function topButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 28,
    border: '1px solid #444',
    borderRadius: 5,
    background: disabled ? '#262626' : '#1f1f1f',
    color: disabled ? '#777' : '#d4d4d4',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '0 9px',
    fontSize: 11,
    fontWeight: 750,
    cursor: disabled ? 'not-allowed' : 'pointer',
    whiteSpace: 'nowrap',
  }
}

const primaryButtonStyle: React.CSSProperties = {
  height: 28,
  border: '1px solid #238636',
  borderRadius: 5,
  background: '#238636',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '0 10px',
  fontSize: 11,
  fontWeight: 850,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}
