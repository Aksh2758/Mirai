'use client'
import { useState } from 'react'
import type { ProjectSuggestion } from '@/lib/types'

interface Props {
  project: ProjectSuggestion
  onSelect: (project: ProjectSuggestion) => void
  disabled?: boolean
}

export default function ProjectCard({ project, onSelect, disabled }: Props) {
  const [isExpanded, setIsExpanded] = useState(false)
  const { title, brief, full_explanation, tech_stack, difficulty } = project

  return (
    <div 
      style={{ 
        background: '#fff', 
        border: '1px solid #E0DDD8', 
        borderRadius: 16, 
        padding: 20, 
        marginBottom: 16,
        transition: 'all 0.2s',
        boxShadow: isExpanded ? '0 10px 15px -3px rgba(0,0,0,0.1)' : 'none',
        borderColor: isExpanded ? '#0D0D0D' : '#E0DDD8',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{title}</h3>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6B6B6B', background: '#F0EDE8', padding: '2px 8px', borderRadius: 4 }}>
          {difficulty}
        </span>
      </div>

      <p style={{ fontSize: 14, color: '#4A4A4A', lineHeight: 1.5, marginBottom: 16 }}>
        {brief}
      </p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
        {tech_stack.map(tech => (
          <span 
            key={tech} 
            style={{ fontSize: 10, fontWeight: 600, color: '#6B6B6B', background: '#F5F2ED', padding: '4px 8px', borderRadius: 6, border: '1px solid #E0DDD8' }}
          >
            {tech}
          </span>
        ))}
      </div>

      {isExpanded && (
        <div style={{ 
          marginTop: 16, 
          paddingTop: 16, 
          borderTop: '1px solid #F0EDE8', 
          fontSize: 13, 
          lineHeight: 1.6, 
          color: '#4A4A4A',
          animation: 'fadeIn 0.3s ease-out'
        }}>
          <p>{full_explanation}</p>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          style={{ 
            fontSize: 13, 
            fontWeight: 600, 
            color: '#0D0D0D', 
            background: 'none', 
            border: 'none', 
            cursor: 'pointer',
            padding: '8px 0'
          }}
        >
          {isExpanded ? 'Show less' : 'View Details'}
        </button>
        <button 
          onClick={() => onSelect(project)}
          disabled={disabled}
          style={{ 
            flex: 1,
            marginLeft: 'auto',
            background: '#0D0D0D', 
            color: '#fff', 
            border: 'none', 
            borderRadius: 8, 
            padding: '10px 20px', 
            fontSize: 13, 
            fontWeight: 700, 
            cursor: disabled ? 'not-allowed' : 'pointer'
          }}
        >
          Build Project →
        </button>
      </div>
    </div>
  )
}
