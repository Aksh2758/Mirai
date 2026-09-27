'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { initStudio } from '@/lib/api'
import type { AnalyzerResult, ProjectSuggestion, SkillScore } from '@/lib/types'

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

// Maps difficulty string to a color used in the badge
const DIFFICULTY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  Beginner:     { bg: '#EAF3DE', text: '#3B6D11', border: '#97C459' },
  Intermediate: { bg: '#FAEEDA', text: '#633806', border: '#EF9F27' },
  Advanced:     { bg: '#FCEBEB', text: '#791F1F', border: '#F09595' },
}

// Maps category to a short color dot shown next to skill bars
const CATEGORY_COLORS: Record<string, string> = {
  'Languages':     '#378ADD',
  'Frameworks':    '#1D9E75',
  'Databases':     '#EF9F27',
  'Domain Skills': '#7F77DD',
  'Tools':         '#D85A30',
  'DevOps':        '#D4537E',
}

const PACE_LABELS: Record<string, { label: string; description: string }> = {
  slow:   { label: 'Steady',  description: 'Taking your time — quality over speed' },
  normal: { label: 'On Track', description: 'Consistent growth pace' },
  fast:   { label: 'Fast',    description: 'Moving quickly — keep the momentum' },
}

// ─── SMALL HELPER COMPONENTS ──────────────────────────────────────────────────

// Single skill bar row — shows label, category dot, and animated bar
function SkillBar({ skill }: { skill: SkillScore }) {
  const dotColor = CATEGORY_COLORS[skill.category] ?? '#888780'
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          {/* Category color dot */}
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 500, color: '#1a1a1a' }}>{skill.label}</span>
          <span style={{ fontSize: 11, color: '#888780', background: '#F1EFE8', padding: '1px 7px', borderRadius: 20 }}>
            {skill.category}
          </span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#1a1a1a' }}>{skill.score}%</span>
      </div>
      {/* Bar track */}
      <div style={{ height: 6, background: '#E0DDD8', borderRadius: 4, overflow: 'hidden' }}>
        {/* Bar fill — width set inline so it animates from 0 via CSS transition */}
        <div
          style={{
            height: '100%',
            width: `${skill.score}%`,
            background: dotColor,
            borderRadius: 4,
            transition: 'width 0.9s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      </div>
    </div>
  )
}

// Difficulty badge pill
function DifficultyBadge({ difficulty }: { difficulty: string }) {
  const colors = DIFFICULTY_COLORS[difficulty] ?? DIFFICULTY_COLORS.Intermediate
  return (
    <span style={{
      fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
      background: colors.bg, color: colors.text, border: `1px solid ${colors.border}`,
      whiteSpace: 'nowrap',
    }}>
      {difficulty}
    </span>
  )
}

// Tech stack pill
function TechPill({ tech }: { tech: string }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '3px 10px', borderRadius: 20,
      background: '#F1EFE8', color: '#444441', border: '1px solid #E0DDD8',
      whiteSpace: 'nowrap',
    }}>
      {tech}
    </span>
  )
}

// Hours estimate display
function HoursLabel({ hours }: { hours: number }) {
  // Convert hours to a human-friendly string
  const text = hours < 24
    ? `~${hours} hours`
    : `~${Math.round(hours / 8)} days`
  return (
    <span style={{ fontSize: 12, color: '#888780', display: 'flex', alignItems: 'center', gap: 4 }}>
      ⏱ {text}
    </span>
  )
}

// ─── PROJECT CARD ─────────────────────────────────────────────────────────────

interface ProjectCardProps {
  project: ProjectSuggestion
  index: number
  onSelect: (project: ProjectSuggestion) => void
  isSelecting: boolean
}

function ProjectCard({ project, index, onSelect, isSelecting }: ProjectCardProps) {
  const [expanded, setExpanded] = useState(false)

  // Labels for the 3 cards based on position
  const CARD_LABELS = ['Recommended Start', 'Stretch Goal', 'Big Challenge']
  const cardLabel = CARD_LABELS[index] ?? ''

  // First card gets a highlighted border to signal it's recommended
  const isRecommended = index === 0

  return (
    <div
      style={{
        background: '#FDFCFA',
        border: `1.5px solid ${isRecommended ? '#1A6B3C' : '#E0DDD8'}`,
        borderRadius: 14,
        overflow: 'hidden',
        // Subtle top accent line on recommended card
        borderTop: isRecommended ? '3px solid #1A6B3C' : `1.5px solid #E0DDD8`,
      }}
    >
      {/* ── Card Header ── */}
      <div style={{ padding: '20px 22px 0' }}>
        {/* Top row: card label + difficulty badge + hours */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          {isRecommended && (
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
              background: '#1A6B3C', color: '#fff', padding: '2px 8px', borderRadius: 4,
            }}>
              ★ {cardLabel}
            </span>
          )}
          {!isRecommended && (
            <span style={{
              fontSize: 10, fontWeight: 600, color: '#888780', background: '#F1EFE8',
              padding: '2px 8px', borderRadius: 4,
            }}>
              {cardLabel}
            </span>
          )}
          <DifficultyBadge difficulty={project.difficulty} />
          <HoursLabel hours={project.estimated_hours} />
        </div>

        {/* Project title */}
        <h3 style={{ fontSize: 17, fontWeight: 700, color: '#0D0D0D', marginBottom: 8, lineHeight: 1.3 }}>
          {project.title}
        </h3>

        {/* Brief — always visible, 2 sentences */}
        <p style={{ fontSize: 13.5, color: '#444441', lineHeight: 1.65, marginBottom: 12 }}>
          {project.brief}
        </p>

        {/* Tech stack row */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {project.tech_stack.map(tech => (
            <TechPill key={tech} tech={tech} />
          ))}
        </div>

        {/* Outcome preview — what they can say in interviews */}
        <div style={{
          background: '#F5F2ED', borderRadius: 8, padding: '10px 14px', marginBottom: 16,
          borderLeft: '3px solid #1A6B3C',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#1A6B3C', marginBottom: 3 }}>
            Interview Outcome
          </div>
          <p style={{ fontSize: 12.5, color: '#444441', lineHeight: 1.5, margin: 0 }}>
            {project.outcome}
          </p>
        </div>
      </div>

      {/* ── Expandable Section (full explanation + new skills) ── */}
      {expanded && (
        <div style={{ padding: '0 22px 16px', borderTop: '1px solid #F0EDE8', paddingTop: 16 }}>
          <h4 style={{ fontSize: 12, fontWeight: 700, color: '#444441', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            What you will build
          </h4>
          <p style={{ fontSize: 13, color: '#444441', lineHeight: 1.7, marginBottom: 16 }}>
            {project.full_explanation}
          </p>

          {/* New skills you will learn */}
          {project.new_skills_introduced && project.new_skills_introduced.length > 0 && (
            <div>
              <h4 style={{ fontSize: 12, fontWeight: 700, color: '#444441', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                New skills you will learn
              </h4>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {project.new_skills_introduced.map(skill => (
                  <span key={skill} style={{
                    fontSize: 11, padding: '3px 10px', borderRadius: 20,
                    background: '#EAF3DE', color: '#3B6D11', border: '1px solid #97C459',
                  }}>
                    + {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Card Footer: action buttons ── */}
      <div style={{
        padding: '12px 22px',
        borderTop: '1px solid #F0EDE8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#FDFCFA',
      }}>
        {/* Toggle details */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'transparent', border: '1px solid #E0DDD8', borderRadius: 8,
            padding: '7px 14px', fontSize: 12, fontWeight: 500, color: '#444441',
            cursor: 'pointer',
          }}
        >
          {expanded ? '↑ Less info' : '↓ Full details'}
        </button>

        {/* Build this button */}
        <button
          onClick={() => onSelect(project)}
          disabled={isSelecting}
          style={{
            background: isSelecting ? '#888780' : '#0D0D0D',
            color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 20px', fontSize: 13, fontWeight: 600,
            cursor: isSelecting ? 'not-allowed' : 'pointer',
            transition: 'background 0.15s',
          }}
        >
          {isSelecting ? 'Starting...' : 'Build this →'}
        </button>
      </div>
    </div>
  )
}

// ─── SKILL DNA CARD ───────────────────────────────────────────────────────────

function SkillDnaCard({ skill_dna }: { skill_dna: AnalyzerResult['skill_dna'] }) {
  // Convert skill_scores from Record<string, SkillScore> to array for rendering
  const skillArray = Object.values(skill_dna.skill_scores)
  const pace = PACE_LABELS[skill_dna.pace_factor] ?? PACE_LABELS.normal

  // Level badge color
  const LEVEL_COLORS: Record<string, string> = {
    Beginner:     '#4ADE80',
    Intermediate: '#EF9F27',
    Advanced:     '#F09595',
  }
  const levelColor = LEVEL_COLORS[skill_dna.level] ?? '#4ADE80'

  return (
    <div style={{
      background: '#0D0D0D',
      borderRadius: 16,
      padding: '28px 32px',
      color: '#fff',
    }}>
      {/* Top label */}
      <div style={{
        fontSize: 10, letterSpacing: 2, textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.35)', marginBottom: 16,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ADE80', display: 'inline-block' }} />
        Skill DNA · Nirmaan Analysis
      </div>

      {/* Role + Level row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -0.5, lineHeight: 1.1 }}>
          {skill_dna.role}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {/* Level badge */}
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
            background: `${levelColor}20`, color: levelColor,
            border: `1px solid ${levelColor}40`,
          }}>
            {skill_dna.level}
          </span>
          {/* Pace badge */}
          <span style={{
            fontSize: 12, fontWeight: 500, padding: '4px 12px', borderRadius: 20,
            background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)',
          }}>
            {pace.label} pace
          </span>
        </div>
      </div>

      {/* Summary */}
      <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, marginBottom: 24 }}>
        {skill_dna.summary}
      </p>

      {/* Skill bars — now with real labels */}
      <div style={{ marginBottom: 20 }}>
        {skillArray.map(skill => (
          <div key={skill.label} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: CATEGORY_COLORS[skill.category] ?? '#888780',
                  flexShrink: 0,
                }} />
                <span style={{ fontSize: 12.5, color: 'rgba(255,255,255,0.7)' }}>{skill.label}</span>
              </div>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{skill.score}%</span>
            </div>
            <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', borderRadius: 3 }}>
              <div style={{
                height: '100%',
                width: `${skill.score}%`,
                borderRadius: 3,
                background: CATEGORY_COLORS[skill.category] ?? '#4ADE80',
                transition: 'width 0.9s cubic-bezier(0.4, 0, 0.2, 1)',
              }} />
            </div>
          </div>
        ))}
      </div>

      {/* Strengths and Gaps — two columns */}
      {(skill_dna.strengths?.length > 0 || skill_dna.gaps?.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          {skill_dna.strengths?.length > 0 && (
            <div style={{ background: 'rgba(74,222,128,0.06)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(74,222,128,0.12)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#4ADE80', marginBottom: 8 }}>
                Your strengths
              </div>
              {skill_dna.strengths.map((s, i) => (
                <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 4, paddingLeft: 10, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: '#4ADE80' }}>✓</span>
                  {s}
                </div>
              ))}
            </div>
          )}
          {skill_dna.gaps?.length > 0 && (
            <div style={{ background: 'rgba(239,159,39,0.06)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(239,159,39,0.12)' }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#EF9F27', marginBottom: 8 }}>
                Next to learn
              </div>
              {skill_dna.gaps.map((g, i) => (
                <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginBottom: 4, paddingLeft: 10, position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 0, color: '#EF9F27' }}>→</span>
                  {g}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── LEGEND ───────────────────────────────────────────────────────────────────
// Shows what each color dot means in the skill bars

function SkillLegend() {
  return (
    <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 12 }}>
      {Object.entries(CATEGORY_COLORS).map(([category, color]) => (
        <div key={category} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 11, color: '#888780' }}>{category}</span>
        </div>
      ))}
    </div>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const router = useRouter()
  const [result, setResult] = useState<AnalyzerResult | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Read the analyzer result that the scanner page saved to sessionStorage
    // If it's not there, the user came here directly — send them back to scanner
    const stored = sessionStorage.getItem('analyzerResult')
    if (!stored) {
      router.push('/scanner')
      return
    }
    try {
      const parsed = JSON.parse(stored)
      setResult(parsed)
    } catch {
      router.push('/scanner')
    }
  }, [router])

  async function handleSelectProject(project: ProjectSuggestion) {
    setSelecting(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { project_id } = await initStudio(project, result!.skill_dna.level)

      // Clean up sessionStorage now that we've used the result
      sessionStorage.removeItem('analyzerResult')

      router.push(`/studio/${project_id}`)
    } catch (e: any) {
      setError(`Could not start project: ${e.message}`)
      setSelecting(false)
    }
  }

  // While loading from sessionStorage
  if (!result) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#F5F2ED',
      }}>
        <p style={{ color: '#888780', fontSize: 14 }}>Loading your results...</p>
      </div>
    )
  }

  const { skill_dna, projects } = result

  return (
    <div style={{ minHeight: '100vh', background: '#F5F2ED' }}>
      {/* ── Page Header ── */}
      <div style={{ background: '#0D0D0D', padding: '28px 24px 24px', textAlign: 'center' }}>
        <h1 style={{
          fontFamily: 'sans-serif', fontSize: 32, fontWeight: 800, color: '#fff',
          letterSpacing: -1, marginBottom: 6,
        }}>
          Your Skill DNA is ready.
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15 }}>
          Based on your background, here are your best-fit projects.
        </p>
      </div>

      {/* ── Main Content ── */}
      <div style={{ maxWidth: 1000, margin: '0 auto', padding: '32px 20px' }}>

        {/* Error state */}
        {error && (
          <div style={{
            background: '#FCEBEB', border: '1px solid #F09595', borderRadius: 10,
            padding: '12px 16px', marginBottom: 20, color: '#791F1F', fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* ── Two-column layout: Skill DNA left, Projects right ── */}
        <div style={{
          display: 'grid',
          // On wide screens: 380px for DNA card, rest for projects
          // The minmax handles narrow screens gracefully
          gridTemplateColumns: 'minmax(0, 380px) minmax(0, 1fr)',
          gap: 24,
          alignItems: 'start',
        }}>

          {/* LEFT COLUMN: Skill DNA card */}
          <div style={{ position: 'sticky', top: 20 }}>
            <SkillDnaCard skill_dna={skill_dna} />
            {/* Legend below the card */}
            <div style={{ background: '#FDFCFA', borderRadius: 10, padding: '14px 16px', marginTop: 12, border: '1px solid #E0DDD8' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#888780', marginBottom: 8 }}>
                Skill bar legend
              </div>
              <SkillLegend />
            </div>
            {/* Rescan link */}
            <div style={{ textAlign: 'center', marginTop: 14 }}>
              <button
                onClick={() => router.push('/scanner')}
                style={{ background: 'none', border: 'none', fontSize: 12, color: '#888780', cursor: 'pointer', textDecoration: 'underline' }}
              >
                ← Rescan with different data
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN: Project cards */}
          <div>
            {/* Section label */}
            <div style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0D0D0D', marginBottom: 4 }}>
                Pick your first project
              </h2>
              <p style={{ fontSize: 13, color: '#888780' }}>
                Matched to your <strong style={{ color: '#0D0D0D' }}>{skill_dna.level}</strong> level.
                All 3 are in your detected domain — start with the first one if you are unsure.
              </p>
            </div>

            {/* 3 project cards stacked vertically */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {projects.map((project, i) => (
                <ProjectCard
                  key={project.title}
                  project={project}
                  index={i}
                  onSelect={handleSelectProject}
                  isSelecting={selecting}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
