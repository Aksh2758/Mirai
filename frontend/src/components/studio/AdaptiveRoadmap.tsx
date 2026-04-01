'use client'
import type { RoadmapStep } from '@/lib/types'

interface Props {
  steps: RoadmapStep[]
  currentStep: number
  adaptiveMessage: string | null
}

export default function AdaptiveRoadmap({ steps, currentStep, adaptiveMessage }: Props) {
  return (
    <div style={{ background: '#161616', borderRight: '1px solid rgba(255,255,255,0.06)', overflowY: 'auto', padding: 16 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'rgba(255,255,255,0.2)', marginBottom: 20 }}>
        Adaptive Roadmap
      </div>

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {steps.map((step, i) => (
          <div key={step.id} style={{ display: 'flex', gap: 14, marginBottom: 4, position: 'relative' }}>
            {/* Connector line */}
            {i < steps.length - 1 && (
              <div style={{ position: 'absolute', left: 10, top: 22, bottom: -4, width: 1, background: 'rgba(255,255,255,0.06)' }} />
            )}

            {/* Step dot */}
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, fontWeight: 700, marginTop: 2, zIndex: 1,
              background: step.status === 'done' ? '#1A6B3C' : step.status === 'active' ? '#4ADE80' : 'rgba(255,255,255,0.08)',
              color: step.status === 'done' ? '#fff' : step.status === 'active' ? '#0D0D0D' : 'rgba(255,255,255,0.2)',
              border: step.status === 'active' ? '2px solid rgba(74,222,128,0.3)' : 'none',
              boxShadow: step.status === 'active' ? '0 0 15px rgba(74,222,128,0.15)' : 'none',
            }}>
              {step.status === 'done' ? '✓' : i + 1}
            </div>

            {/* Step content */}
            <div style={{ paddingBottom: 20 }}>
              <div style={{
                fontSize: 13, fontWeight: step.status === 'active' ? 600 : 400, lineHeight: 1.4,
                color: step.status === 'active' ? '#fff' : step.status === 'done' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.25)',
              }}>
                {step.title}
              </div>
              {step.status === 'done' && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 4 }}>Completed</div>
              )}
              {step.status === 'active' && (
                <div style={{ fontSize: 10, color: '#4ADE80', marginTop: 4 }}>In progress</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Adaptive message */}
      {adaptiveMessage && (
        <div style={{ marginTop: 14, background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', borderRadius: 8, padding: '10px 12px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: '#4ADE80', marginBottom: 4 }}>
            AI Adapting
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{adaptiveMessage}</div>
        </div>
      )}
    </div>
  )
}
