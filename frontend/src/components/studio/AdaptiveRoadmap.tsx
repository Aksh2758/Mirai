'use client'
import type { RoadmapStep } from '@/lib/types'

interface Props {
  steps: RoadmapStep[]
  currentStep: number
  adaptiveMessage: string | null
}

export default function AdaptiveRoadmap({ steps, currentStep, adaptiveMessage }: Props) {
  return (
    <div style={{
      padding: '14px 16px',
      overflowY: 'auto',
      maxHeight: '280px',   // Compact — leave room for InstructionPanel below
    }}>
      <div style={{
        fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.2)', marginBottom: 10,
      }}>
        Progress
      </div>

      {steps.map((step, i) => (
        <div key={step.id} style={{ display: 'flex', gap: 8, marginBottom: 4, position: 'relative' }}>
          {/* Connector line between dots */}
          {i < steps.length - 1 && (
            <div style={{
              position: 'absolute', left: 8, top: 20, bottom: -4, width: 1,
              background: 'rgba(255,255,255,0.05)',
            }} />
          )}

          {/* Dot */}
          <div style={{
            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 700, zIndex: 1, marginTop: 1,
            background: step.status === 'done'
              ? '#1A6B3C'
              : step.status === 'active'
              ? '#4ADE80'
              : 'rgba(255,255,255,0.06)',
            color: step.status === 'done'
              ? '#fff'
              : step.status === 'active'
              ? '#0D0D0D'
              : 'rgba(255,255,255,0.2)',
          }}>
            {step.status === 'done' ? '✓' : i + 1}
          </div>

          {/* Title */}
          <div style={{
            fontSize: 11,
            lineHeight: 1.4,
            paddingBottom: 8,
            color: step.status === 'active'
              ? '#fff'
              : step.status === 'done'
              ? 'rgba(255,255,255,0.35)'
              : 'rgba(255,255,255,0.18)',
            fontWeight: step.status === 'active' ? 600 : 400,
          }}>
            {step.title}
          </div>
        </div>
      ))}

      {/* Adaptive message — shown if AI set one */}
      {adaptiveMessage && (
        <div style={{
          marginTop: 10,
          background: 'rgba(74,222,128,0.08)',
          border: '1px solid rgba(74,222,128,0.15)',
          borderRadius: 6,
          padding: '7px 10px',
        }}>
          <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#4ADE80', marginBottom: 2 }}>
            AI adapting
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5 }}>
            {adaptiveMessage}
          </div>
        </div>
      )}
    </div>
  )
}
