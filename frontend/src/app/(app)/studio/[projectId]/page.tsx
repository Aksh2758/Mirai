'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { getProject, completeStep } from '@/lib/api'
import { useStudioStore } from '@/store/studioStore'
import AdaptiveRoadmap from '@/components/studio/AdaptiveRoadmap'
import CopilotPane from '@/components/studio/CopilotPane'

// Monaco Editor must be loaded with ssr: false — it uses window APIs
const CodeEditor = dynamic(() => import('@/components/studio/CodeEditor'), { ssr: false })

export default function StudioPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string

  const { project, setProject, adaptiveMessage, setAdaptiveMessage, showCopilot, setShowCopilot } = useStudioStore()
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

      // Refresh project state from backend
      const updated = await getProject(projectId)
      setProject(updated)
    } catch (e: any) {
      alert(`Error completing step: ${e.message}`)
    } finally {
      setIsCompleting(false)
    }
  }

  if (!project) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0D0D0D', color: '#fff' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 12 }}>⚡</div>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>INITIALIZING STUDIO...</p>
        </div>
      </div>
    )
  }

  const currentStep = project.steps[project.current_step]
  const { activeFilename, codeFiles } = useStudioStore.getState()

  return (
    <div style={{ height: '100vh', display: 'grid', gridTemplateRows: '52px 1fr', background: '#0D0D0D', overflow: 'hidden', color: '#fff', fontFamily: 'sans-serif' }}>
      
      {/* NAVBAR */}
      <div style={{ background: '#141414', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 16 }}>
        <div 
          onClick={() => router.push('/dashboard')}
          style={{ cursor: 'pointer', fontWeight: 900, fontSize: 18, color: '#fff' }}
        >
          Nirmaan<span style={{ color: '#4ADE80' }}>.</span>
        </div>
        
        <div style={{ height: 20, width: 1, background: 'rgba(255,255,255,0.1)' }} />
        
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>{project.title}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Step {project.current_step + 1} of {project.steps.length}
          </span>
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button
            onClick={handleCompleteStep}
            disabled={isCompleting || currentStep?.status !== 'active'}
            style={{ 
              background: '#1A6B3C', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 16px', 
              fontSize: 11, fontWeight: 700, cursor: isCompleting ? 'not-allowed' : 'pointer',
              opacity: (isCompleting || currentStep?.status !== 'active') ? 0.6 : 1,
              transition: 'all 0.2s'
            }}
          >
            {isCompleting ? 'Completing...' : '✓ Complete Step'}
          </button>
          
          <button
            onClick={() => alert('Project Structure Intelligence (PSI) analysis coming soon!')}
            style={{ 
              background: 'rgba(255,87,51,0.15)', color: '#FF5733', border: 'none', 
              borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 600, cursor: 'pointer' 
            }}
          >
            ⚡ PSI
          </button>
          
          <button
            onClick={() => alert('Deployment pipeline initialization coming soon!')}
            style={{ 
              background: '#4ADE80', color: '#0D0D0D', border: 'none', 
              borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' 
            }}
          >
            🚀 Deploy
          </button>
          
          <button
            onClick={() => setShowCopilot(!showCopilot)}
            style={{ 
              background: showCopilot ? 'rgba(74,222,128,0.1)' : 'transparent', 
              color: showCopilot ? '#4ADE80' : 'rgba(255,255,255,0.4)', 
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' 
            }}
          >
            ✦ Copilot
          </button>
        </div>
      </div>

      {/* 3-PANE LAYOUT */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: showCopilot ? '260px 1fr 340px' : '260px 1fr', 
        overflow: 'hidden' 
      }}>
        {/* PANE A — ROADMAP */}
        <AdaptiveRoadmap
          steps={project.steps}
          currentStep={project.current_step}
          adaptiveMessage={adaptiveMessage}
        />

        {/* PANE B — CODE EDITOR */}
        <div style={{ position: 'relative', overflow: 'hidden' }}>
          <CodeEditor projectId={projectId} />
        </div>

        {/* PANE C — COPILOT */}
        {showCopilot && (
          <CopilotPane
            projectId={projectId}
            currentStep={currentStep}
            currentCode={codeFiles[activeFilename] ?? ''}
          />
        )}
      </div>
    </div>
  )
}
