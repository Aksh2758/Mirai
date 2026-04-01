'use client'
import type { SkillDNA } from '@/lib/types'

interface Props {
  dna: SkillDNA
}

export default function SkillDNACard({ dna }: Props) {
  const { role, level, pace_factor, skill_scores, summary } = dna

  return (
    <div style={{ background: '#FDFCFA', border: '1px solid #E0DDD8', borderRadius: 20, padding: 24, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#6B6B6B', background: '#F0EDE8', padding: '4px 8px', borderRadius: 4 }}>
            Skill Profile
          </span>
          <h2 style={{ fontSize: 24, fontWeight: 800, marginTop: 8, letterSpacing: -0.5 }}>{role}</h2>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#1A6B3C' }}>{level}</div>
          <div style={{ fontSize: 11, color: '#6B6B6B' }}>{pace_factor} pace</div>
        </div>
      </div>

      <p style={{ fontSize: 13, lineHeight: 1.6, color: '#4A4A4A', marginBottom: 24, borderLeft: '3px solid #E0DDD8', paddingLeft: 12 }}>
        {summary}
      </p>

      <div style={{ display: 'grid', gap: 14 }}>
        {Object.entries(skill_scores).map(([skill, score]) => (
          <div key={skill}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'capitalize' }}>{skill}</span>
              <span style={{ fontSize: 11, color: '#6B6B6B' }}>{score}%</span>
            </div>
            <div style={{ height: 6, background: '#F0EDE8', borderRadius: 10, overflow: 'hidden' }}>
              <div 
                style={{ 
                  height: '100%', 
                  width: `${score}%`, 
                  background: score > 70 ? '#1A6B3C' : score > 40 ? '#2E7D32' : '#616161',
                  borderRadius: 10,
                  transition: 'width 1s ease-out'
                }} 
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}