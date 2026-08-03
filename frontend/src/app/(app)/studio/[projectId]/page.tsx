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
  PanelRightClose,
  Play,
  RefreshCw,
  Rocket,
  Save,
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
        background: active ? 'rgba(0,122,204,0.22)' : 'transparent',
        border: active ? '1px solid rgba(0,122,204,0.42)' : '1px solid transparent',
        opacity: locked ? 0.46 : 1,
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
            fontWeight: active ? 700 : 500,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {step.title}
        </div>
        <div style={{ color: '#6e7681', fontSize: 10, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>
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
        background: '#181818',
        borderRight: '1px solid #2b2b2b',
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
      }}
    >
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #2b2b2b' }}>
        <div style={{ color: '#969696', fontSize: 10, fontWeight: 700, letterSpacing: 1.4, textTransform: 'uppercase' }}>
          Nirmaan Roadmap
        </div>
        <div style={{ color: '#e6edf3', fontSize: 14, fontWeight: 800, marginTop: 8, lineHeight: 1.35 }}>
          {project.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 999, background: '#2d2d2d', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#007acc' }} />
          </div>
          <span style={{ color: '#969696', fontSize: 10, fontWeight: 700 }}>{progress}%</span>
        </div>
      </div>

      <div style={{ padding: 10, overflowY: 'auto', flex: 1 }}>
        {project.steps.map((step, index) => (
          <StepStatus key={step.id} step={step} active={index === project.current_step} />
        ))}
      </div>

      <div style={{ borderTop: '1px solid #2b2b2b', padding: 14, background: '#1f1f1f' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c9d1d9', fontSize: 12, fontWeight: 800 }}>
          <BookOpen size={15} color="#58a6ff" />
          Step focus
        </div>
        <div style={{ color: '#8b949e', fontSize: 11.5, lineHeight: 1.6, marginTop: 9, maxHeight: 130, overflowY: 'auto' }}>
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
            fontWeight: 800,
            cursor: completing || !currentStep ? 'not-allowed' : 'pointer',
          }}
        >
          {completing ? 'Checking...' : 'Check step'}
        </button>
      </div>
    </aside>
  )
}

function ActivityBar({ activeMode, setActiveMode }: { activeMode: StudioMode; setActiveMode: (mode: StudioMode) => void }) {
  return (
    <nav
      style={{
        background: '#333333',
        borderRight: '1px solid #252526',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        paddingTop: 10,
        gap: 8,
      }}
    >
      <button
        onClick={() => setActiveMode('server')}
        title="VS Code workspace"
        style={{
          width: 42,
          height: 42,
          border: 'none',
          borderLeft: activeMode === 'server' ? '2px solid #fff' : '2px solid transparent',
          background: 'transparent',
          color: activeMode === 'server' ? '#fff' : '#c5c5c5',
          cursor: 'pointer',
        }}
      >
        <Code2 size={23} />
      </button>
      <button
        onClick={() => setActiveMode('setup')}
        title="Code-server setup"
        style={{
          width: 42,
          height: 42,
          border: 'none',
          borderLeft: activeMode === 'setup' ? '2px solid #fff' : '2px solid transparent',
          background: 'transparent',
          color: activeMode === 'setup' ? '#fff' : '#c5c5c5',
          cursor: 'pointer',
        }}
      >
        <Terminal size={22} />
      </button>
      <div style={{ flex: 1 }} />
      <Sparkles size={20} color="#c5c5c5" style={{ marginBottom: 14 }} />
    </nav>
  )
}

function CodeServerPanel({ iframeSrc, mode, onRetry }: { iframeSrc: string | null; mode: StudioMode; onRetry: () => void }) {
  if (mode === 'setup' || !iframeSrc) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center', background: '#1e1e1e', color: '#d4d4d4', padding: 28 }}>
        <div style={{ width: 'min(760px, 100%)', border: '1px solid #3c3c3c', borderRadius: 12, background: '#252526', overflow: 'hidden' }}>
          <div style={{ padding: '14px 18px', borderBottom: '1px solid #3c3c3c', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Code2 size={18} color="#58a6ff" />
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Connect an open VS Code server</div>
              <div style={{ fontSize: 11, color: '#969696', marginTop: 2 }}>Nirmaan Studio now embeds real browser VS Code instead of Monaco.</div>
            </div>
          </div>
          <div style={{ padding: 20, display: 'grid', gap: 16 }}>
            <div style={{ color: '#c9d1d9', fontSize: 13, lineHeight: 1.6 }}>
              Start code-server for the generated project workspace, then expose the URL to the frontend with the env vars below. Restart Next.js after editing the env file.
            </div>
            <pre style={{ margin: 0, padding: 16, borderRadius: 8, background: '#111111', border: '1px solid #3c3c3c', color: '#9cdcfe', fontSize: 12, lineHeight: 1.7, overflowX: 'auto' }}>{`# frontend/.env.local
NEXT_PUBLIC_CODE_SERVER_URL=http://localhost:8080
NEXT_PUBLIC_CODE_SERVER_FOLDER=/workspace/nirmaan-project

# example local launch
code-server --bind-addr 0.0.0.0:8080 --auth none /workspace/nirmaan-project`}</pre>
            <div style={{ display: 'grid', gap: 8, color: '#969696', fontSize: 12, lineHeight: 1.55 }}>
              <div>1. The iframe uses the exact code-server UI: Explorer, editor tabs, extensions, integrated terminal, command palette, and source control.</div>
              <div>2. If your deployment blocks iframes, the “Open VS Code” button still launches the same workspace in a new tab.</div>
              <div>3. Keep Nirmaan Mentor open on the right for roadmap-aware guidance while coding inside VS Code.</div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', background: '#1e1e1e', position: 'relative' }}>
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
          bottom: 30,
          width: 34,
          height: 34,
          borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(37,37,38,0.9)',
          color: '#d4d4d4',
          display: 'grid',
          placeItems: 'center',
          cursor: 'pointer',
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
        display: 'grid',
        gridTemplateRows: '34px 1fr 22px',
        background: '#1e1e1e',
        color: '#d4d4d4',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <header
        style={{
          background: '#3c3c3c',
          borderBottom: '1px solid #2b2b2b',
          display: 'grid',
          gridTemplateColumns: 'auto 1fr auto',
          alignItems: 'center',
          gap: 12,
          padding: '0 10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => router.push('/dashboard')}
            title="Back to dashboard"
            style={{ width: 26, height: 26, border: 'none', background: 'transparent', color: '#d4d4d4', display: 'grid', placeItems: 'center', cursor: 'pointer' }}
          >
            <ArrowLeft size={16} />
          </button>
          <span style={{ color: '#fff', fontSize: 12, fontWeight: 700 }}>Nirmaan Studio</span>
        </div>

        <div style={{ textAlign: 'center', color: '#d4d4d4', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {project.title} — Visual Studio Code Server
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
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
            <PanelRightClose size={13} /> Mentor
          </button>
        </div>
      </header>

      <main
        style={{
          display: 'grid',
          gridTemplateColumns: `48px 286px 1fr ${mentorWidth}px`,
          minHeight: 0,
          transition: 'grid-template-columns 180ms ease',
        }}
      >
        <ActivityBar activeMode={activeMode} setActiveMode={setActiveMode} />
        <RoadmapSidebar project={project} currentStep={currentStep} onComplete={handleCompleteStep} completing={isCompleting} />

        <section style={{ display: 'grid', gridTemplateRows: '35px 1fr', minWidth: 0, minHeight: 0 }}>
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
            }}
          >
            <span style={{ color: '#d4d4d4', fontWeight: 700 }}>Workspace</span>
            <span style={{ color: '#5a5a5a' }}>/</span>
            <span>{CODE_SERVER_FOLDER || 'code-server'}</span>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Save size={12} /> autosave inside VS Code</span>
              <span style={{ color: '#5a5a5a' }}>|</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Terminal size={12} /> integrated terminal</span>
              <span style={{ color: '#5a5a5a' }}>|</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Play size={12} /> run from terminal</span>
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
          background: '#007acc',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '0 10px',
          color: '#fff',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <span>Nirmaan</span>
        <span>Step {project.current_step + 1}/{project.steps.length}</span>
        <span>{project.difficulty}</span>
        <span>{project.tech_stack.slice(0, 4).join('  ·  ')}</span>
        {adaptiveMessage && <span style={{ marginLeft: 'auto', opacity: 0.95 }}>{adaptiveMessage}</span>}
      </footer>

      <PsiModal projectId={projectId} />
      <DeployModal projectId={projectId} psiScore={psiResult?.score} />
    </div>
  )
}

function topButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 24,
    border: '1px solid #555',
    borderRadius: 4,
    background: disabled ? '#3c3c3c' : '#2d2d2d',
    color: disabled ? '#777' : '#d4d4d4',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '0 8px',
    fontSize: 11,
    fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer',
  }
}

const primaryButtonStyle: React.CSSProperties = {
  height: 24,
  border: '1px solid #238636',
  borderRadius: 4,
  background: '#238636',
  color: '#fff',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 5,
  padding: '0 9px',
  fontSize: 11,
  fontWeight: 800,
  cursor: 'pointer',
}
