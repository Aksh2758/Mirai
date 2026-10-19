'use client'

import type { CSSProperties } from 'react'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Play, Rocket, Save, Sparkles } from 'lucide-react'
import { completeStep, getProject } from '@/lib/api'
import { useStudioStore } from '@/store/studioStore'
import PsiModal from '@/components/studio/PsiModal'
import DeployModal from '@/components/studio/DeployModal'
import StudioIde from '@/components/studio/StudioIde'
import RoadmapPanel from '@/components/studio/RoadmapPanel'

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
        <RoadmapPanel project={project} currentStep={currentStep} onComplete={handleCompleteStep} completing={isCompleting} />
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
const mainStyle: CSSProperties = { height: '100%', display: 'grid', gridTemplateColumns: '340px minmax(0, 1fr)', minHeight: 0, overflow: 'hidden' }
const iconButtonStyle: CSSProperties = { width: 28, height: 28, border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, background: '#1f1f1f', color: '#d4d4d4', display: 'grid', placeItems: 'center', cursor: 'pointer' }
const statusPillStyle: CSSProperties = { height: 28, display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid #333', color: '#a6a6a6', borderRadius: 999, padding: '0 9px', fontSize: 11, fontWeight: 750 }
const topButtonStyle: CSSProperties = { height: 28, border: '1px solid #444', borderRadius: 5, background: '#1f1f1f', color: '#d4d4d4', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 9px', fontSize: 11, fontWeight: 750, cursor: 'pointer', whiteSpace: 'nowrap' }
const primaryButtonStyle: CSSProperties = { height: 28, border: '1px solid #238636', borderRadius: 5, background: '#238636', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 10px', fontSize: 11, fontWeight: 850, cursor: 'pointer', whiteSpace: 'nowrap' }
const footerStyle: CSSProperties = { position: 'absolute', left: 0, right: 0, bottom: 0, height: 24, background: '#007acc', display: 'flex', alignItems: 'center', gap: 14, padding: '0 10px', color: '#fff', fontSize: 11, fontWeight: 650, zIndex: 20, boxSizing: 'border-box' }