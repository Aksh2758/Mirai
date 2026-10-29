'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { fetchDashboardSummary, getCachedDashboardSummary } from '@/lib/api'
import type { DashboardSummary } from '@/lib/types'
import type { ProjectSuggestion } from '@/lib/types'
import { initStudio } from '@/lib/api'
import Sidebar from '@/components/dashboard/Sidebar'
import Topbar from '@/components/dashboard/Topbar'

/* ─── palette ─────────────────────────────────────────────── */
const c = {
  bg:         '#F3F7F4',
  ink:        '#0D1B14',
  muted:      '#5C6B63',
  card:       '#FFFFFF',
  line:       '#E3EAE5',
  soft:       '#EAF3EE',
  green:      '#1A9D5A',
  greenBright:'#2FBF71',
  heroStart:  '#0B2219',
  heroEnd:    '#0E3328',
  accent:     '#52D273',
}

type Job     = DashboardSummary['top_internships'][number]

interface RoadmapLearningStep { title: string; category: string; detail: string; skills: string[] }

function makeLearningRoadmap(role: string, level: string, scores: Array<{ label: string; score: number; category?: string }>, goal: string): RoadmapLearningStep[] {
  const normalizedRole = role.toLowerCase()
  const dataRole = normalizedRole.includes('data') || normalizedRole.includes('machine')
  const frontendRole = normalizedRole.includes('frontend') || normalizedRole.includes('front-end')
  const backendRole = normalizedRole.includes('backend') || normalizedRole.includes('back-end')
  const primaryLanguage = scores.find(item => item.category === 'Languages')?.label || (dataRole || backendRole ? 'Python' : 'JavaScript')
  const gaps = scores.filter(item => item.score < 65).sort((a, b) => a.score - b.score).slice(0, 3).map(item => item.label)
  const roleModules: RoadmapLearningStep[] = dataRole
    ? [
        { title: 'SQL and relational data', category: 'Data foundations', detail: 'Write SELECT queries, joins, aggregations, and reason about tables and keys.', skills: ['SQL', 'Data modeling'] },
        { title: 'Data analysis with Python', category: 'Role skills', detail: 'Load, clean, transform, and validate real datasets with pandas and NumPy.', skills: ['Python', 'pandas', 'NumPy'] },
        { title: 'Statistics and model evaluation', category: 'Role skills', detail: 'Use train/test splits, baselines, precision, recall, and error analysis before trusting a model.', skills: ['Statistics', 'Model evaluation'] },
        { title: 'Communicate data with visualizations', category: 'Role skills', detail: 'Choose charts that answer a question, label them clearly, and explain what the data cannot prove.', skills: ['Data visualization'] },
      ]
    : frontendRole
      ? [
          { title: 'HTML, CSS, responsive layout, and accessibility', category: 'Frontend skills', detail: 'Build semantic pages that work with a keyboard, screen reader, and small screens.', skills: ['HTML', 'CSS', 'Accessibility'] },
          { title: 'JavaScript in the browser', category: 'Frontend skills', detail: 'Work with the DOM, events, forms, async requests, and browser errors.', skills: ['JavaScript', 'DOM', 'Async'] },
          { title: 'React and TypeScript', category: 'Frontend skills', detail: 'Compose components, model state, type props, and keep UI behavior predictable.', skills: ['React', 'TypeScript'] },
          { title: 'Routing, forms, APIs, and loading states', category: 'Frontend skills', detail: 'Connect screens to APIs and handle validation, waiting, empty, error, and success states.', skills: ['Routing', 'API integration'] },
        ]
      : backendRole
        ? [
            { title: 'HTTP and API design', category: 'Backend skills', detail: 'Design resource routes, status codes, validation, pagination, and consistent errors.', skills: ['HTTP', 'REST APIs'] },
            { title: 'Databases and data modeling', category: 'Backend skills', detail: 'Model relationships, write joins, use constraints, and understand indexes and transactions.', skills: ['SQL', 'Data modeling'] },
            { title: 'Authentication and application security', category: 'Backend skills', detail: 'Protect routes, validate input, handle secrets, and understand authorization boundaries.', skills: ['Authentication', 'Security'] },
            { title: 'Background work and performance', category: 'Backend skills', detail: 'Use caching, queues, timeouts, and profiling to keep services reliable under load.', skills: ['Caching', 'Performance'] },
          ]
        : [
            { title: 'Web fundamentals and APIs', category: 'Role skills', detail: 'Understand how browsers, HTTP requests, and services work together.', skills: ['Web', 'HTTP', 'APIs'] },
            { title: 'Build a complete feature', category: 'Role skills', detail: 'Connect an interface, application logic, and persistent data into one user flow.', skills: ['Frontend', 'Backend', 'Database'] },
            { title: 'Data modeling and SQL', category: 'Role skills', detail: 'Choose data shapes, write queries, and protect consistency with constraints.', skills: ['SQL', 'Data modeling'] },
            { title: 'Authentication and application security', category: 'Role skills', detail: 'Add sign-in, access rules, input validation, and safe handling of secrets.', skills: ['Authentication', 'Security'] },
          ]

  const base: RoadmapLearningStep[] = [
    { title: `Strengthen ${primaryLanguage}`, category: 'Language', detail: level === 'Beginner' ? `Practice ${primaryLanguage} values, conditions, loops, functions, collections, and readable naming.` : `Deepen ${primaryLanguage} with modules, types, error handling, async work, and idiomatic patterns.`, skills: [primaryLanguage] },
    { title: 'Git, debugging, and reading error messages', category: 'Engineering habits', detail: 'Make small commits, reproduce a bug, inspect the stack trace, and verify the fix.', skills: ['Git', 'Debugging'] },
    { title: 'DSA: complexity, arrays, and strings', category: 'Data structures & algorithms', detail: 'Estimate time and space, then solve traversal, counting, and two-pointer problems.', skills: ['Big-O', 'Arrays', 'Strings'] },
    { title: 'DSA: hash maps, sets, stacks, and queues', category: 'Data structures & algorithms', detail: 'Choose the right structure for lookups, matching, ordering, and breadth-first work.', skills: ['Hash maps', 'Sets', 'Stacks', 'Queues'] },
    ...roleModules,
    ...(gaps.length ? [{ title: `Close your analyzed gaps: ${gaps.join(', ')}`, category: 'Profile-specific focus', detail: `Your analysis marked these skills as the biggest growth areas. Learn each concept in a small exercise, then use it in a project aimed at: ${goal}.`, skills: gaps }] : []),
    { title: 'Testing, code review, and clean structure', category: 'Engineering methods', detail: 'Write unit and integration checks, handle edge cases, and explain why code is organized the way it is.', skills: ['Testing', 'Code quality'] },
    { title: level === 'Advanced' ? 'Trees, graphs, dynamic programming, and trade-offs' : 'Sorting, binary search, recursion, and trees', category: 'Data structures & algorithms', detail: 'Move from core patterns to the level-appropriate problems used in interviews and real systems.', skills: ['Algorithms', 'Trees', 'Problem solving'] },
    { title: 'Ship and explain a capstone', category: 'Career goal', detail: `Build, test, document, and present a project that demonstrates your progress toward “${goal}”.`, skills: ['Deployment', 'Documentation', 'Communication'] },
  ]
  return base
}

function createRoadmapProjects(role: string, level: string, targetLevel: string, goal: string, scores: Array<{ label: string; score: number }>): ProjectSuggestion[] {
  const normalizedRole = role.toLowerCase()
  const gap = scores.filter(item => item.score < 65).sort((a, b) => a.score - b.score).slice(0, 2).map(item => item.label)
  const dataRole = normalizedRole.includes('data') || normalizedRole.includes('machine')
  const frontendRole = normalizedRole.includes('frontend') || normalizedRole.includes('front-end')
  const backendRole = normalizedRole.includes('backend') || normalizedRole.includes('back-end')
  const dsaGoal = /\b(dsa|algorithms?|data structures?|coding interview|problem solving)\b/i.test(goal)
  const family = dsaGoal
    ? { type: 'algorithms', stack: ['Python', 'JavaScript', 'Testing', 'Complexity analysis'], titles: ['Pattern Practice CLI', 'Algorithm Visualizer', 'Interview Problem Workbench'] }
    : dataRole
    ? { type: 'data', stack: ['Python', 'pandas', 'SQL', 'Streamlit'], titles: ['Dataset Explorer', 'Insight Dashboard', 'Model Evaluation Workbench'] }
    : frontendRole
      ? { type: 'frontend', stack: ['React', 'TypeScript', 'CSS', 'Testing'], titles: ['Accessible Responsive App', 'Role-focused Interactive Portal', 'Production-ready Product Dashboard'] }
      : backendRole
        ? { type: 'backend', stack: ['Python', 'FastAPI', 'SQL', 'pytest'], titles: ['Validated REST API', 'Authenticated Data Service', 'Reliable Scalable API'] }
        : { type: 'full-stack', stack: ['React', 'TypeScript', 'FastAPI', 'SQL'], titles: ['Working Feature Slice', 'Goal-focused Full-stack App', 'Production-ready Learning Platform'] }
  const orderedGaps = gap.length ? gap : ['Testing', 'Project structure']
  const levelOrder: ProjectSuggestion['difficulty'][] = ['Beginner', 'Intermediate', 'Advanced']
  const startingIndex = levelOrder.indexOf(level as ProjectSuggestion['difficulty'])
  const targetIndex = Math.max(startingIndex, levelOrder.indexOf(targetLevel as ProjectSuggestion['difficulty']))
  const levels = [0, 1, 2].map(index => levelOrder[Math.round(startingIndex + ((targetIndex - startingIndex) * index) / 2)])
  return family.titles.map((title, index) => {
    const projectSkills = [...new Set([...orderedGaps.slice(0, index + 1), ...family.stack.slice(0, 2 + index)])]
    const stage = ['Foundation build', 'Skill bridge', 'Goal capstone'][index]
    const brief = `${stage} for your ${role} path: make a ${family.type} product that advances “${goal}”. ${index === 0 ? `Practice ${projectSkills.slice(0, 2).join(' and ')} with a small working feature.` : `Apply ${projectSkills.slice(0, 3).join(', ')} with tests and a clear user workflow.`}`
    return {
      title,
      brief,
      full_explanation: `${title} is the ${stage.toLowerCase()} in your roadmap from ${level} toward ${targetLevel}. It covers ${projectSkills.join(', ')} through milestones that start with a small feature and add complexity gradually. Each milestone is designed to teach the concepts before expanding the code. You will test edge cases, document your decisions, and finish with a working ${family.type} app. It directly supports your goal: ${goal}.`,
      tech_stack: projectSkills,
      difficulty: levels[index],
      estimated_hours: [6, 12, 24][index],
      outcome: `Show a tested ${family.type} project that demonstrates ${projectSkills.slice(0, 3).join(', ')} and moves you toward ${goal}.`,
      new_skills_introduced: orderedGaps.slice(0, index + 1),
    }
  })
}

/* ─── helpers ─────────────────────────────────────────────── */
function getInitials(name: string, email: string) {
  const src   = name || email || 'AK'
  const parts = src.replace(/[^a-zA-Z\s]/g, ' ').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return src.slice(0, 2).toUpperCase()
}

/* ─── page ────────────────────────────────────────────────── */
export default function DashboardPage() {
  const router  = useRouter()
  const [data, setData]       = useState<DashboardSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState<string | null>(null)
  const [startingProject, setStartingProject] = useState<string | null>(null)
  const [roadmapError, setRoadmapError] = useState<string | null>(null)
  const [roadmapOpen, setRoadmapOpen] = useState(false)
  const [targetGoal, setTargetGoal] = useState('')
  const [targetLevel, setTargetLevel] = useState<'Beginner' | 'Intermediate' | 'Advanced'>('Intermediate')
  const [roadmapDone, setRoadmapDone] = useState<Record<string, boolean>>({})
  const [goalSaved, setGoalSaved] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const cached = getCachedDashboardSummary(session.user.id)
      if (cached) {
        setData(cached)
        setLoading(false)
      }
      try {
        const summary = await fetchDashboardSummary()
        if (!summary.scanner_completed) { router.push('/scanner'); return }
        setData(summary)
      } catch (e: unknown) {
        if (!cached) setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  useEffect(() => {
    if (!data) return
    const key = `nirmaan-roadmap:${data.user.email || 'user'}`
    const nextLevelValue: 'Beginner' | 'Intermediate' | 'Advanced' = data.user.level === 'Beginner' ? 'Intermediate' : data.user.level === 'Intermediate' ? 'Advanced' : 'Advanced'
    try {
      const saved = JSON.parse(window.localStorage.getItem(key) || 'null') as { goal?: string; level?: 'Beginner' | 'Intermediate' | 'Advanced'; done?: Record<string, boolean> } | null
      setTargetGoal(saved?.goal || `Become job-ready as a ${data.user.role || 'software developer'}`)
      setTargetLevel(saved?.level || nextLevelValue)
      setRoadmapDone(saved?.done || {})
    } catch {
      setTargetGoal(`Become job-ready as a ${data.user.role || 'software developer'}`)
      setTargetLevel(nextLevelValue)
    }
  }, [data?.user.email, data?.user.role, data?.user.level])

  if (loading) return <Centered text="Loading your dashboard…" />
  if (error)   return <Centered text={`Could not load: ${error}`} action={<button onClick={() => window.location.reload()} style={retryBtn}>Retry</button>} />
  if (!data)   return null

  const displayName = data.user.full_name || data.user.email?.split('@')[0] || 'there'
  const initials    = getInitials(displayName, data.user.email)
  const project     = data.active_project
  const jobs: Job[] = data.top_internships || []
  const pct         = project ? Math.min(project.progress_pct, 100) : 0
  const stack       = project?.tech_stack || []
  const todo        = project?.current_step_todo?.slice(0, 3) || []
  const focus       = todo.length ? todo : ['Review your roadmap step', 'Continue building in Studio', 'Run a final PSI check']
  const goStudio    = () => router.push(project ? `/studio?projectId=${encodeURIComponent(project.id)}` : '/scanner')

  // skill scores for career readiness sidebar
  const skillEntries = Object.values(data.user.skill_scores || {})
  const topSkills    = skillEntries.map(s => s.label).slice(0, 6)
  const avgScore     = skillEntries.length
    ? Math.round(skillEntries.reduce((a, b) => a + b.score, 0) / skillEntries.length)
    : pct

  const roadmapKnown = skillEntries.filter(skill => skill.score >= 65).sort((a, b) => b.score - a.score).slice(0, 5)
  const roadmapGaps = skillEntries.filter(skill => skill.score < 65).sort((a, b) => a.score - b.score).slice(0, 4)
  const goal = targetGoal || `Become job-ready as a ${data.user.role || 'software developer'}`
  const roadmapLearningSteps = makeLearningRoadmap(data.user.role || 'Software Developer', data.user.level || 'Beginner', skillEntries, goal)
  const roadmapProjects = createRoadmapProjects(data.user.role || 'Software Developer', data.user.level || 'Beginner', targetLevel, goal, skillEntries)
  const roadmapPhases = [
    { title: '01 · Foundation', subtitle: 'Language, tools, and problem-solving basics', steps: roadmapLearningSteps.slice(0, 4) },
    { title: '02 · Role skills', subtitle: `Focused skills for ${data.user.role || 'your target role'}`, steps: roadmapLearningSteps.slice(4, 8) },
    { title: '03 · Engineering practice', subtitle: 'Testing, reliability, and the final stretch to your goal', steps: roadmapLearningSteps.slice(8) },
  ].filter(phase => phase.steps.length > 0)
  const completedRoadmapCount = roadmapLearningSteps.filter(step => roadmapDone[step.title]).length
  const roadmapStorageKey = `nirmaan-roadmap:${data.user.email || 'user'}`

  function saveRoadmapGoal() {
    window.localStorage.setItem(roadmapStorageKey, JSON.stringify({ goal: targetGoal.trim() || goal, level: targetLevel, done: roadmapDone }))
    setGoalSaved(true)
    window.setTimeout(() => setGoalSaved(false), 1800)
  }

  function toggleRoadmapStep(title: string) {
    const next = { ...roadmapDone, [title]: !roadmapDone[title] }
    setRoadmapDone(next)
    window.localStorage.setItem(roadmapStorageKey, JSON.stringify({ goal, level: targetLevel, done: next }))
  }

  async function startRoadmapProject(project: ProjectSuggestion) {
    setStartingProject(project.title)
    setRoadmapError(null)
    try {
      const { project_id } = await initStudio(project, data!.user.level || 'Beginner')
      router.push(`/studio?projectId=${encodeURIComponent(project_id)}`)
    } catch (e) {
      setRoadmapError(e instanceof Error ? e.message : 'Could not start this project')
      setStartingProject(null)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: c.bg, color: c.ink, fontFamily: "'Inter', ui-sans-serif, system-ui, sans-serif" }}>
      <Sidebar role={data.user.role ?? undefined} name={displayName} initials={initials} />

      <main style={{ marginLeft: 224, padding: '28px 32px 60px' }}>
        <Topbar displayName={displayName} xp={data.user.xp} initials={initials} />

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 308px', gap: 22, alignItems: 'start' }}>

          {/* ── LEFT ── */}
          <div style={{ display: 'grid', gap: 18, minWidth: 0 }}>

            {/* PROFILE & STRENGTHS — click the card to open the full written roadmap */}
            <section style={{ ...heroWrap, padding: 26 }} aria-label="Profile and strengths roadmap">
              <button onClick={() => setRoadmapOpen(open => !open)} aria-expanded={roadmapOpen} aria-controls="profile-learning-roadmap" style={{ display: 'block', width: '100%', background: 'transparent', border: 0, color: 'inherit', padding: 0, textAlign: 'left', cursor: 'pointer' }}>
                <div style={{ ...heroBadgeRow, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={sprintDot} /><span style={sprintLabel}>PROFILE & STRENGTHS</span></span>
                  <span style={{ color: 'rgba(255,255,255,.62)', fontSize: 10 }}>{data.user.level || 'Beginner'} now → {targetLevel} goal</span>
                </div>
                <h2 style={{ ...heroTitle, marginTop: 13, marginBottom: 7 }}>Your {data.user.role || 'developer'} profile</h2>
                <p style={{ ...heroSub, marginTop: 0, maxWidth: 760 }}>See what your analysis says you already know, where to grow next, and the written steps to reach “{goal}”. Click this card to {roadmapOpen ? 'close' : 'open'} your complete roadmap.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10, marginTop: 18 }}>
                  {[
                    { title: 'Current level', body: data.user.level || 'Beginner' },
                    { title: 'Profile strengths', body: roadmapKnown.length ? roadmapKnown.slice(0, 2).map(s => `${s.label} ${s.score}%`).join(' · ') : 'Ready to build your first verified skills' },
                    { title: 'Growth areas', body: roadmapGaps.length ? roadmapGaps.slice(0, 2).map(s => `${s.label} ${s.score}%`).join(' · ') : `Next: ${roadmapLearningSteps[0]?.skills[0] || 'core fundamentals'}` },
                  ].map((item, i) => <div key={item.title} style={{ border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', borderRadius: 12, padding: 13 }}><div style={{ color: c.accent, fontSize: 10, fontWeight: 800 }}>0{i + 1} · PROFILE</div><div style={{ color: '#fff', fontSize: 13, fontWeight: 750, marginTop: 6 }}>{item.title}</div><div style={{ color: 'rgba(255,255,255,.68)', fontSize: 11, lineHeight: 1.5, marginTop: 4 }}>{item.body}</div></div>)}
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 14, color: c.accent, fontSize: 12, fontWeight: 800 }}>{roadmapOpen ? 'Hide the complete roadmap' : 'Click to read your complete roadmap'} <span aria-hidden="true">{roadmapOpen ? '↑' : '↓'}</span></span>
              </button>
              {roadmapOpen && <div style={{ marginTop: 18, padding: 16, border: '1px solid rgba(255,255,255,.14)', borderRadius: 14, background: 'rgba(0,0,0,.18)' }}>
                <div id="profile-learning-roadmap" style={{ color: '#fff', fontSize: 15, fontWeight: 850, marginBottom: 5 }}>Your roadmap, written step by step</div>
                <p style={{ margin: '0 0 14px', color: 'rgba(255,255,255,.62)', fontSize: 11, lineHeight: 1.55 }}>Start with the first unchecked step. Learn the listed concepts, practise them with small exercises, then use the project recommendations below to apply them toward your goal.</p>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px,1fr) 180px auto', gap: 10, alignItems: 'end', marginBottom: 15 }}>
                  <label style={{ color: 'rgba(255,255,255,.72)', fontSize: 10, fontWeight: 700 }}>YOUR GOAL
                    <input value={targetGoal} onChange={event => setTargetGoal(event.target.value)} placeholder="e.g. Get a frontend internship" style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, padding: '9px 10px', background: 'rgba(255,255,255,.08)', color: '#fff', fontSize: 12 }} />
                  </label>
                  <label style={{ color: 'rgba(255,255,255,.72)', fontSize: 10, fontWeight: 700 }}>TARGET LEVEL
                    <select value={targetLevel} onChange={event => setTargetLevel(event.target.value as 'Beginner' | 'Intermediate' | 'Advanced')} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, border: '1px solid rgba(255,255,255,.2)', borderRadius: 8, padding: '9px 10px', background: '#123326', color: '#fff', fontSize: 12 }}><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select>
                  </label>
                  <button onClick={saveRoadmapGoal} style={{ ...heroPrimBtn, padding: '10px 14px', fontSize: 11 }}>{goalSaved ? 'Saved ✓' : 'Save goal'}</button>
                </div>
                {roadmapPhases.map(phase => <div key={phase.title} style={{ marginTop: 15 }}>
                  <div style={{ marginBottom: 8 }}><div style={{ color: c.accent, fontSize: 11, fontWeight: 900 }}>{phase.title}</div><div style={{ color: 'rgba(255,255,255,.5)', fontSize: 10, marginTop: 3 }}>{phase.subtitle}</div></div>
                  <div style={{ display: 'grid', gap: 7 }}>{phase.steps.map((step, index) => <label key={step.title} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', border: '1px solid rgba(255,255,255,.09)', borderRadius: 10, padding: '10px 11px', background: 'rgba(255,255,255,.035)', cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!roadmapDone[step.title]} onChange={() => toggleRoadmapStep(step.title)} style={{ marginTop: 2, accentColor: c.accent }} />
                    <span style={{ flex: 1 }}><span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}><strong style={{ color: roadmapDone[step.title] ? 'rgba(255,255,255,.5)' : '#fff', fontSize: 12 }}>{step.title}</strong><span style={{ color: c.accent, fontSize: 9, fontWeight: 700 }}>{step.category}</span></span><span style={{ display: 'block', color: 'rgba(255,255,255,.62)', fontSize: 10, lineHeight: 1.5, marginTop: 4 }}>{step.detail}</span><span style={{ display: 'block', color: 'rgba(255,255,255,.42)', fontSize: 9, marginTop: 5 }}>Learn: {step.skills.join(' · ')}</span></span>
                  </label>)}</div>
                </div>)}
                <div style={{ marginTop: 15, color: 'rgba(255,255,255,.6)', fontSize: 10 }}>Analyzed strengths: {roadmapKnown.length ? roadmapKnown.map(s => s.label).join(' · ') : 'No verified strengths yet'}<br />Priority gaps: {roadmapGaps.length ? roadmapGaps.map(s => s.label).join(' · ') : 'No low-scoring gaps found'}</div>
              </div>}
            </section>

            {/* PROJECTS — separate section directly below the profile roadmap card */}
            <Card style={{ padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap' }}>
                <div><div style={{ color: c.green, fontSize: 10, fontWeight: 900, letterSpacing: 1.2 }}>PROJECTS FOR YOUR GOAL</div><h2 style={{ margin: '5px 0', color: c.ink, fontSize: 19, fontWeight: 850 }}>Build these in order</h2><p style={{ margin: 0, color: c.muted, fontSize: 11, lineHeight: 1.5 }}>Each project covers skills from your roadmap. Choose one to open it in Studio.</p></div>
                {project && <button onClick={() => router.push(`/studio?projectId=${encodeURIComponent(project.id)}`)} style={{ ...heroPrimBtn, padding: '10px 14px', fontSize: 11 }}>Continue {project.title} →</button>}
              </div>
              {roadmapError && <p style={{ color: '#b91c1c', fontSize: 12 }}>{roadmapError}</p>}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
                {roadmapProjects.map((suggestion, i) => <button key={suggestion.title} disabled={!!startingProject} onClick={() => startRoadmapProject(suggestion)} style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${i === 0 ? '#9bd8b1' : c.line}`, background: i === 0 ? '#F0FAF3' : '#FAFCFB', borderRadius: 12, padding: 14, color: c.ink, opacity: startingProject && startingProject !== suggestion.title ? .55 : 1 }}><div style={{ color: c.green, textTransform: 'uppercase', fontSize: 9, fontWeight: 900 }}>{['01 · FOUNDATION', '02 · SKILL BRIDGE', '03 · CAPSTONE'][i]} · {suggestion.difficulty}</div><div style={{ fontSize: 13, fontWeight: 850, marginTop: 7 }}>{startingProject === suggestion.title ? 'Preparing Studio…' : suggestion.title}</div><div style={{ fontSize: 11, color: c.muted, lineHeight: 1.5, marginTop: 6 }}>{suggestion.brief}</div><div style={{ fontSize: 10, color: '#35634a', marginTop: 8 }}>{suggestion.tech_stack.join(' · ')}</div><div style={{ fontSize: 10, fontWeight: 800, color: c.green, marginTop: 12 }}>Open in Studio →</div></button>)}
              </div>
            </Card>

            {/* TODAY'S FOCUS + ACTIVE APPLICATIONS */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              {/* Today's Focus */}
              <Card style={{ padding: 22 }}>
                <div style={cardHeaderRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* <span style={{ fontSize: 18 }}>📋</span> */}
                    <span style={sectionTitle}>Today&apos;s Focus</span>
                  </div>
                  <span style={pillGreen}>{1} of {focus.length} Done</span>
                </div>
                <p style={{ fontSize: 12, color: c.muted, margin: '8px 0 16px', lineHeight: 1.5 }}>
                  Key execution tasks for your {data.user.role || 'project'} sprint today.
                </p>

                <div style={{ display: 'grid', gap: 10 }}>
                  {focus.map((task, i) => (
                    <div key={`focus-${i}`} style={focusRow}>
                      <div style={{ ...focusCheck, ...(i === 0 ? focusCheckDone : {}) }}>
                        {i === 0 && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 600,
                          color: i === 0 ? c.muted : c.ink,
                          textDecoration: i === 0 ? 'line-through' : 'none',
                          lineHeight: 1.3,
                        }}>
                          {task}
                        </div>
                        {project && (
                          <div style={{ fontSize: 11, color: c.muted, marginTop: 3 }}>
                            {project.title}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${c.line}`, paddingTop: 14 }}>
                  <span style={{ fontSize: 11.5, color: c.muted }}>Next sprint sync in 4 hours</span>
                  <button onClick={goStudio} style={linkBtnStyle}>+ Add Custom Task</button>
                </div>
              </Card>

              {/* Active Applications */}
              <Card style={{ padding: 22 }}>
                <div style={cardHeaderRow}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {/* <span style={{ fontSize: 18 }}>💼</span> */}
                    <span style={sectionTitle}>Active Applications</span>
                  </div>
                  <button onClick={() => router.push('/discover/internships')} style={linkBtnStyle}>View All</button>
                </div>
                <p style={{ fontSize: 12, color: c.muted, margin: '8px 0 16px', lineHeight: 1.5 }}>
                  Roles you have bookmarked or submitted applications for.
                </p>

                {jobs.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: c.muted, fontSize: 13 }}>
                    No active applications yet.{' '}
                    <button onClick={() => router.push('/discover/internships')} style={linkBtnStyle}>Browse internships →</button>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gap: 0 }}>
                    {jobs.slice(0, 3).map((job, i) => (
                      <div key={job.job_id} style={{ ...appRow, borderBottom: i < jobs.length - 1 && i < 2 ? `1px solid ${c.line}` : 'none' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>{job.title}</div>
                          <div style={{ fontSize: 11.5, color: c.muted, marginTop: 3 }}>
                            {job.company} · {job.is_remote ? 'Remote' : job.location}
                          </div>
                        </div>
                        <span style={i === 0 ? pillReview : i === 1 ? pillApplied : pillUpcoming}>
                          {i === 0 ? 'In Review' : i === 1 ? 'Applied' : `${job.match_pct}% Match`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 16, borderTop: `1px solid ${c.line}`, paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  {jobs.length > 0 && (
                    <span style={{ fontSize: 12, color: c.ink }}>
                      Resume Match Rate:{' '}
                      <strong style={{ color: c.green }}>{jobs[0].match_pct}%</strong>
                    </span>
                  )}
                  <button onClick={() => router.push('/discover/internships')} style={linkBtnStyle}>
                    Manage Pipeline →
                  </button>
                </div>
              </Card>
            </div>

            {/* CURATED OPPORTUNITIES */}
            <Card style={{ padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, letterSpacing: -0.3 }}>Curated Opportunities For You</h3>
              </div>
              <p style={{ margin: '0 0 18px', fontSize: 12.5, color: c.muted }}>
                Tailored strictly to your{' '}
                <strong style={{ color: c.ink }}>{data.user.role || 'Developer'}</strong>{' '}
                skill profile and verified projects.
              </p>

              {/* Filter tabs */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
                {[
                  { label: 'All', count: `(${jobs.length + (project ? 1 : 0) + 1})` },
                  { label: 'Internships', count: `(${jobs.length})` },
                  { label: 'Projects', count: `(${project ? 1 : 0})` },
                  { label: 'Hackathons', count: '(1)' },
                ].map((tab, i) => (
                  <button
                    key={tab.label}
                    onClick={() => {
                      if (tab.label === 'Internships') router.push('/discover/internships')
                      else if (tab.label === 'Hackathons') router.push('/discover/hackathons')
                      else if (tab.label === 'Projects') goStudio()
                    }}
                    style={i === 0 ? filterTabActive : filterTab}
                  >
                    {tab.label} <span style={{ opacity: 0.65, fontSize: 11 }}>{tab.count}</span>
                  </button>
                ))}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 14 }}>
                {/* Internship cards */}
                {jobs.slice(0, 2).map((job) => (
                  <OpCard
                    key={job.job_id}
                    kind="INTERNSHIP"
                    pct={job.match_pct}
                    title={job.title}
                    sub={`${job.company} · ${job.is_remote ? 'Remote' : job.location}`}
                    cta="Apply Now"
                    onClick={() => router.push('/discover/internships')}
                    kindColor="#1A9D5A"
                  />
                ))}
                {/* Active project */}
                {project && (
                  <OpCard
                    kind="PORTFOLIO PROJECT"
                    pct={pct}
                    title={project.title}
                    sub={stack.slice(0, 3).join(' · ')}
                    cta="Continue Build"
                    onClick={goStudio}
                    kindColor="#7C3AED"
                  />
                )}
                {/* Hackathon from Discovery */}
                <OpCard
                  kind="HACKATHON"
                  label="Upcoming"
                  title="Live Hackathons"
                  sub="See what's running in Discovery Hub"
                  cta="Explore"
                  onClick={() => router.push('/discover/hackathons')}
                  kindColor="#D97706"
                />
              </div>
            </Card>
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <aside style={{ display: 'grid', gap: 16 }}>

            {/* Career Readiness */}
            <Card style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: c.ink, letterSpacing: 0.5 }}>CAREER READINESS</span>
                <span style={pillActiveTrack}>Active Track</span>
              </div>

              <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 18 }}>
                <Ring value={avgScore} />
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>{data.user.role || 'Project Builder'}</div>
                  <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.5 }}>
                    {skillEntries.filter(s => s.score >= 70).length} of {Math.max(skillEntries.length, 12)} core competencies acquired
                  </div>
                </div>
              </div>

              {topSkills.length > 0 && (
                <>
                  <div style={{ fontSize: 12, fontWeight: 600, color: c.muted, marginBottom: 10 }}>Top Verified Skills</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {topSkills.map((s) => <span key={s} style={skillChip}>{s}</span>)}
                  </div>
                </>
              )}
            </Card>

            {/* Streak + XP */}
            <Card style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20 }}>🔥</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>Active Streak</div>
                    <div style={{ fontSize: 11, color: c.muted }}>Keep building daily</div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: c.green }}>+{Math.min(data.user.xp, 999)} XP</div>
                  <div style={{ fontSize: 11, color: c.muted }}>Total earned</div>
                </div>
              </div>

              {/* Day dots */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 5, marginBottom: 14 }}>
                {['M','T','W','T','F','S','S'].map((d, i) => (
                  <div key={`day-${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <div style={{ fontSize: 10, color: c.muted, fontWeight: 600 }}>{d}</div>
                    <div style={{
                      width: 26, height: 26, borderRadius: '50%',
                      background: i < 4 ? c.green : 'rgba(0,0,0,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {i < 4 ? (
                        <span style={{ color: '#fff', fontSize: 11 }}>✓</span>
                      ) : (
                        <span style={{ color: c.muted, fontSize: 11 }}>·</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Upcoming deadline */}
              <div style={deadlineNotice}>
                <span style={{ fontSize: 16 }}>⏰</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#B45309' }}>Upcoming Deadline:</div>
                  <div style={{ fontSize: 11.5, color: '#92400E', marginTop: 2, lineHeight: 1.4 }}>
                    {project
                      ? `Complete Step ${project.steps_done + 1} of ${project.title}`
                      : 'Start your first project sprint'}
                  </div>
                </div>
              </div>
            </Card>

            {/* Guiding Principle */}
            <div style={guidingCard}>
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: c.accent, marginBottom: 14 }}>
                GUIDING PRINCIPLE
              </div>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 500, color: 'rgba(255,255,255,0.88)', lineHeight: 1.65 }}>
                &ldquo;Discipline today builds the technical freedom and career opportunities you want tomorrow.&rdquo;
              </p>
              <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Nirmaan Community</span>
                <span style={{ fontSize: 12, color: c.accent, fontWeight: 600 }}>#BuildInPublic</span>
              </div>
            </div>

          </aside>
        </div>
      </main>
    </div>
  )
}

/* ─── small components ─────────────────────────────────────── */

function Centered({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#0B0B0B', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 14, marginBottom: action ? 16 : 0 }}>{text}</p>
        {action}
      </div>
    </div>
  )
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: c.card, border: `1px solid ${c.line}`, borderRadius: 16, boxShadow: '0 1px 4px rgba(13,27,20,0.05)', ...style }}>
      {children}
    </div>
  )
}

function ProgressBar({ value, track, fill }: { value: number; track: string; fill: string }) {
  return (
    <div style={{ height: 6, background: track, borderRadius: 999, overflow: 'hidden' }}>
      <div style={{ width: `${value}%`, height: '100%', background: fill, borderRadius: 999, transition: 'width 0.6s ease' }} />
    </div>
  )
}

function Ring({ value }: { value: number }) {
  const r = 34, circ = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: 84, height: 84, flexShrink: 0 }}>
      <svg width="84" height="84" viewBox="0 0 84 84" style={{ transform: 'rotate(-90deg)' }}>
        <circle cx="42" cy="42" r={r} fill="none" stroke={c.soft} strokeWidth="8" />
        <circle cx="42" cy="42" r={r} fill="none" stroke={c.green} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - value / 100)} />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>{value}%</div>
      </div>
    </div>
  )
}

function OpCard({ kind, pct, label, title, sub, cta, onClick, kindColor }: {
  kind: string; pct?: number; label?: string; title: string; sub: string
  cta: string; onClick: () => void; kindColor: string
}) {
  return (
    <div style={{ border: `1px solid ${c.line}`, borderRadius: 14, padding: 16, display: 'flex', flexDirection: 'column', gap: 6, background: '#FAFCFB' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.1, color: kindColor }}>{kind}</span>
        <span style={{ fontSize: 13, fontWeight: 800, color: kindColor }}>
          {pct !== undefined ? `${pct}%` : (label || '')}
          {pct !== undefined && <span style={{ fontSize: 10, fontWeight: 500, color: c.muted }}>{' '}Match</span>}
        </span>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3, color: c.ink }}>{title}</div>
      <div style={{ fontSize: 12, color: c.muted, lineHeight: 1.4, flex: 1 }}>{sub}</div>
      <button onClick={onClick} style={opCardBtn}>{cta} →</button>
    </div>
  )
}

/* ─── styles ───────────────────────────────────────────────── */

const heroWrap: CSSProperties = {
  background: `linear-gradient(135deg, ${c.heroStart} 0%, ${c.heroEnd} 100%)`,
  borderRadius: 18, padding: '26px 30px', position: 'relative', overflow: 'hidden',
}
const heroBadgeRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }
const sprintDot: CSSProperties   = { width: 8, height: 8, borderRadius: '50%', background: c.accent, boxShadow: `0 0 6px ${c.accent}` }
const sprintLabel: CSSProperties = { fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase' }
const heroTitle: CSSProperties   = { margin: 0, fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: -0.6, lineHeight: 1.15 }
const heroSub: CSSProperties     = { margin: '10px 0 0', fontSize: 13.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }
const codeChip: CSSProperties    = { background: 'rgba(255,255,255,0.12)', color: c.accent, padding: '2px 7px', borderRadius: 6, fontSize: 12, fontFamily: 'monospace' }
const heroPrimBtn: CSSProperties = {
  background: c.accent, color: '#041A0C', border: 'none', borderRadius: 999,
  padding: '11px 22px', fontSize: 13.5, fontWeight: 800, cursor: 'pointer',
}
const heroSecBtn: CSSProperties  = {
  background: 'rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.85)',
  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 999,
  padding: '11px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const heroProgressCard: CSSProperties = {
  width: 200, flexShrink: 0, border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: 14, padding: 18, background: 'rgba(255,255,255,0.04)',
}
const cardHeaderRow: CSSProperties  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' }
const sectionTitle: CSSProperties   = { fontSize: 16, fontWeight: 800, letterSpacing: -0.2 }
const pillGreen: CSSProperties      = { background: '#DCFCE7', color: '#166534', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }
const pillActiveTrack: CSSProperties= { background: '#D1FAE5', color: '#065F46', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999 }
const pillReview: CSSProperties     = { background: '#FEF3C7', color: '#92400E', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' as const }
const pillApplied: CSSProperties    = { background: '#DBEAFE', color: '#1E40AF', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' as const }
const pillUpcoming: CSSProperties   = { background: '#F3E8FF', color: '#6B21A8', fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' as const }

const focusRow: CSSProperties       = { display: 'flex', gap: 12, alignItems: 'flex-start' }
const focusCheck: CSSProperties     = {
  width: 18, height: 18, borderRadius: 5, border: `1.8px solid ${c.green}`,
  flexShrink: 0, marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff',
}
const focusCheckDone: CSSProperties = { background: c.green, borderColor: c.green }

const appRow: CSSProperties         = { display: 'flex', gap: 12, alignItems: 'center', padding: '10px 0' }
const linkBtnStyle: CSSProperties   = { background: 'transparent', border: 'none', color: c.green, fontSize: 12, fontWeight: 700, cursor: 'pointer', padding: 0 }

const filterTab: CSSProperties      = {
  background: '#F3F7F4', border: `1px solid ${c.line}`, borderRadius: 999,
  padding: '6px 14px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', color: c.muted,
}
const filterTabActive: CSSProperties= {
  ...filterTab, background: c.green, color: '#fff', border: `1px solid ${c.green}`,
}
const skillChip: CSSProperties      = { background: c.soft, color: '#2B5A43', fontSize: 11.5, padding: '4px 11px', borderRadius: 999, fontWeight: 600 }
const opCardBtn: CSSProperties      = {
  marginTop: 6, background: c.ink, color: '#fff', border: 'none',
  borderRadius: 8, padding: '9px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', textAlign: 'center' as const,
}
const deadlineNotice: CSSProperties = {
  background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10,
  padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start',
}
const guidingCard: CSSProperties    = {
  background: `linear-gradient(135deg, ${c.heroStart} 0%, #1A3D2E 100%)`,
  borderRadius: 16, padding: 22,
}
const retryBtn: CSSProperties       = { background: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 13, cursor: 'pointer' }
