'use client'
import type { Project } from '@/lib/types'
import AdaptiveRoadmap from './AdaptiveRoadmap'
import InstructionPanel from './InstructionPanel'

interface Props {
  project: Project
  adaptiveMessage: string | null
  onComplete: () => void
  completing: boolean
}

// Full-width "welcome tab" view — combines the step list and the active
// step's instructions side by side, the way VS Code's Welcome/Getting
// Started tab fills the whole editor pane instead of living in a sidebar.
export default function RoadmapTab({ project, adaptiveMessage, onComplete, completing }: Props) {
  const currentStep = project.steps[project.current_step]

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '300px 1fr',
      height: '100%',
      overflow: 'hidden',
      background: '#0f0f0f',
    }}>
      {/* Left: step list */}
      <div style={{
        borderRight: '1px solid rgba(255,255,255,0.06)',
        overflowY: 'auto',
        background: '#111111',
      }}>
        <div style={{ padding: '20px 16px 4px' }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', marginBottom: 2 }}>
            Project
          </div>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#fff', lineHeight: 1.3 }}>
            {project.title}
          </div>
        </div>
        <AdaptiveRoadmap
          steps={project.steps}
          currentStep={project.current_step}
          adaptiveMessage={adaptiveMessage}
        />
      </div>

      {/* Right: full instructions for the active step */}
      <div style={{ overflow: 'hidden' }}>
        {currentStep ? (
          <InstructionPanel
            step={currentStep}
            userLevel={project.difficulty}
            stepIndex={project.current_step}
            totalSteps={project.steps.length}
            onComplete={onComplete}
            completing={completing}
          />
        ) : (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'rgba(255,255,255,0.25)', fontSize: 13,
          }}>
            🎉 All steps completed
          </div>
        )}
      </div>
    </div>
  )
}
