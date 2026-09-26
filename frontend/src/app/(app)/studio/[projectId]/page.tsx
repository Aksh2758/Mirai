'use client'

import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, Play, Rocket, Save, Sparkles } from 'lucide-react'
import { completeStep, getProject } from '@/lib/api'
import { useStudioStore } from '@/store/studioStore'
import PsiModal from '@/components/studio/PsiModal'
import DeployModal from '@/components/studio/DeployModal'
import StudioIde from '@/components/studio/StudioIde'
import type { Project, RoadmapStep } from '@/lib/types'

function StepStatus({ step, active }: { step: RoadmapStep; active: boolean }) {
  const done = step.status === 'done'
  const locked = step.status === 'locked'

  return (
    <div style={{ ...stepStyle, ...(active ? activeStepStyle : {}), opacity: locked ? 0.44 : 1 }}>
      <div style={{ ...stepDotStyle, background: done ? '#3fb950' : active ? '#007acc' : 'transparent', border: done || active ? 'none' : '1px solid #6e7681' }}>
        {done ? <CheckCircle2 size={12} color="#0d1117" /> : active ? <ChevronRight size={12} color="#fff" /> : null}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ color: active ? '#fff' : '#c9d1d9', fontSize: 12, fontWeight: active ? 800 : 550, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{step.title}</div>
        <div style={{ color: '#7d8590', fontSize: 10, marginTop: 3, textTransform: 'uppercase', letterSpacing: 0.4 }}>{done ? 'Completed' : locked ? 'Locked' : active ? 'In progress' : 'Ready'}</div>
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
    <aside style={roadmapStyle}>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid #2b2b2b', flexShrink: 0 }}>
        <div style={eyebrowStyle}>Project Roadmap</div>
        <div style={{ color: '#e6edf3', fontSize: 14, fontWeight: 850, marginTop: 8, lineHeight: 1.35 }}>{project.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 999, background: '#2d2d2d', overflow: 'hidden' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#007acc' }} />
          </div>
          <span style={{ color: '#969696', fontSize: 10, fontWeight: 800 }}>{progress}%</span>
        </div>
      </div>

      <div style={{ padding: 10, overflowY: 'auto', flex: 1, minHeight: 0 }}>
        {project.steps.map((step, index) => <StepStatus key={step.id} step={step} active={index === project.current_step} />)}
      </div>

      <div style={{ borderTop: '1px solid #2b2b2b', padding: 14, background: '#1f1f1f', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#c9d1d9', fontSize: 12, fontWeight: 850 }}>
          <BookOpen size={15} color="#58a6ff" /> Step focus
        </div>
        <div style={{ color: '#8b949e', fontSize: 11.5, lineHeight: 1.6, marginTop: 9, maxHeight: 118, overflowY: 'auto' }}>
          {currentStep?.instructions || 'Load the project to see current mentor instructions.'}
        </div>
        <button onClick={onComplete} disabled={completing || !currentStep} style={{ ...completeButtonStyle, opacity: completing || !currentStep ? 0.55 : 1 }}>
          {completing ? 'Checking...' : 'Check step'}
        </button>
      </div>
    </aside>
  )
}

export default function StudioPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const { project, setProject, adaptiveMessage, setAdaptiveMessage, setShowPsiModal, setShowDeployModal, psiResult } = useStudioStore()
  const [isCompleting, setIsCompleting] = useState(false)

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
      alert(`Error completing step: ${e instanceof Error ? e.message : 'Unknown error'}`)
    } finally {
      setIsCompleting(false)
    }
  }

  if (!project) {
    return <div style={loadingStyle}>Initializing Studio...</div>
  }

  const currentStep = project.steps[project.current_step]

  return (
    <div style={pageStyle}>
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <button onClick={() => router.push('/dashboard')} title="Back to dashboard" style={iconButtonStyle}><ArrowLeft size={16} /></button>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: '#fff', fontSize: 13, fontWeight: 850, whiteSpace: 'nowrap' }}>Nirmaan Studio</div>
            <div style={{ color: '#8b949e', fontSize: 10, whiteSpace: 'nowrap' }}>Monaco + WebContainer IDE</div>
          </div>
        </div>

        <div style={{ textAlign: 'center', color: '#d4d4d4', fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.title}</div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={statusPillStyle}><Save size={12} /> MongoDB files</span>
          <span style={statusPillStyle}><Play size={12} /> WebContainers</span>
          <button onClick={() => setShowPsiModal(true)} style={topButtonStyle} title="Run Project Skill Index review"><Sparkles size={13} /> PSI</button>
          <button onClick={() => setShowDeployModal(true)} style={primaryButtonStyle} title="Deploy project"><Rocket size={13} /> Deploy</button>
        </div>
      </header>

      <main style={mainStyle}>
        <RoadmapSidebar project={project} currentStep={currentStep} onComplete={handleCompleteStep} completing={isCompleting} />
        <StudioIde projectId={projectId} projectTitle={project.title} />
      </main>

      <footer style={footerStyle}>
        <span>Nirmaan</span>
        <span>Step {project.current_step + 1}/{project.steps.length}</span>
        <span>{project.difficulty}</span>
        <span>{project.tech_stack.slice(0, 4).join(' - ')}</span>
        {adaptiveMessage && <span style={{ marginLeft: 'auto', opacity: 0.95, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{adaptiveMessage}</span>}
      </footer>

      <PsiModal projectId={projectId} />
      <DeployModal projectId={projectId} psiScore={psiResult?.score} />
    </div>
  )
}

const pageStyle: CSSProperties = { height: '100vh', position: 'relative', background: '#1e1e1e', color: '#d4d4d4', overflow: 'hidden', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', paddingTop: 48, paddingBottom: 24, boxSizing: 'border-box' }
const loadingStyle: CSSProperties = { height: '100vh', display: 'grid', placeItems: 'center', background: '#1e1e1e', color: '#d4d4d4' }
const headerStyle: CSSProperties = { position: 'absolute', top: 0, left: 0, right: 0, height: 48, background: '#111111', borderBottom: '1px solid #2b2b2b', display: 'grid', gridTemplateColumns: 'minmax(220px, auto) 1fr auto', alignItems: 'center', gap: 12, padding: '0 12px', zIndex: 20, boxSizing: 'border-box' }
const mainStyle: CSSProperties = { height: '100%', display: 'grid', gridTemplateColumns: '288px minmax(0, 1fr)', minHeight: 0, overflow: 'hidden' }
const roadmapStyle: CSSProperties = { height: '100%', background: '#141414', borderRight: '1px solid #2b2b2b', display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden' }
const eyebrowStyle: CSSProperties = { color: '#969696', fontSize: 10, fontWeight: 800, letterSpacing: 1.4, textTransform: 'uppercase' }
const stepStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '18px 1fr', gap: 10, padding: '9px 10px', borderRadius: 8, border: '1px solid transparent' }
const activeStepStyle: CSSProperties = { background: '#04395e', border: '1px solid #0e639c' }
const stepDotStyle: CSSProperties = { width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }
const completeButtonStyle: CSSProperties = { width: '100%', marginTop: 12, height: 34, border: 'none', borderRadius: 7, background: '#007acc', color: '#fff', fontSize: 12, fontWeight: 850, cursor: 'pointer' }
const iconButtonStyle: CSSProperties = { width: 28, height: 28, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, background: '#1f1f1f', color: '#d4d4d4', display: 'grid', placeItems: 'center', cursor: 'pointer' }
const statusPillStyle: CSSProperties = { height: 28, display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #333', color: '#a6a6a6', borderRadius: 999, padding: '0 9px', fontSize: 11, fontWeight: 750 }
const topButtonStyle: CSSProperties = { height: 28, border: '1px solid #444', borderRadius: 5, background: '#1f1f1f', color: '#d4d4d4', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 9px', fontSize: 11, fontWeight: 750, cursor: 'pointer', whiteSpace: 'nowrap' }
const primaryButtonStyle: CSSProperties = { height: 28, border: '1px solid #238636', borderRadius: 5, background: '#238636', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 10px', fontSize: 11, fontWeight: 850, cursor: 'pointer', whiteSpace: 'nowrap' }
const footerStyle: CSSProperties = { position: 'absolute', left: 0, right: 0, bottom: 0, height: 24, background: '#007acc', display: 'flex', alignItems: 'center', gap: 14, padding: '0 10px', color: '#fff', fontSize: 11, fontWeight: 650, zIndex: 20, boxSizing: 'border-box' }
