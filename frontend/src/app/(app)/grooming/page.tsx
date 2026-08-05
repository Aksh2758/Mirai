'use client'

import type { CSSProperties } from 'react'
import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'

type LabKey = 'resume' | 'mock' | 'aptitude' | 'interview'

const labs: Array<{ key: LabKey; title: string; subtitle: string; metric: string }> = [
  { key: 'resume', title: 'Resume Builder', subtitle: 'Convert projects into recruiter-ready impact bullets.', metric: 'JD fit' },
  { key: 'mock', title: 'Mock Interview', subtitle: 'Practice behavioral and project deep-dive questions.', metric: 'AI panel' },
  { key: 'aptitude', title: 'Aptitude Prep', subtitle: 'Timed quantitative, logic, and verbal practice paths.', metric: '20 min' },
  { key: 'interview', title: 'Interview Prep', subtitle: 'DSA, system design basics, HR, and follow-up plans.', metric: 'Roadmap' },
]

const prepPaths: Record<LabKey, Array<{ title: string; detail: string; time: string }>> = {
  resume: [
    { title: 'Profile headline', detail: 'Write a target-role headline using your scanner role and strongest skills.', time: '5 min' },
    { title: 'Project impact bullets', detail: 'Turn Nirmaan Studio work into measurable STAR bullets.', time: '15 min' },
    { title: 'JD keyword match', detail: 'Compare your resume language with one job description before applying.', time: '10 min' },
  ],
  mock: [
    { title: 'Project walkthrough', detail: 'Explain problem, architecture, tradeoffs, PSI improvements, and deployment.', time: '12 min' },
    { title: 'Behavioral round', detail: 'Practice teamwork, ownership, failure, and learning velocity stories.', time: '15 min' },
    { title: 'Feedback loop', detail: 'Receive scorecard and repeat weak question categories.', time: '8 min' },
  ],
  aptitude: [
    { title: 'Quant basics', detail: 'Percentages, ratios, time-work, profit-loss, and speed-distance drills.', time: '20 min' },
    { title: 'Logic sets', detail: 'Arrangements, syllogisms, directions, series, and data interpretation.', time: '20 min' },
    { title: 'Verbal practice', detail: 'Reading comprehension, grammar, sentence correction, and para jumbles.', time: '15 min' },
  ],
  interview: [
    { title: 'Technical recap', detail: 'Revise core stack concepts based on your active project tech stack.', time: '25 min' },
    { title: 'DSA warm-up', detail: 'Arrays, strings, hash maps, stacks, queues, and two-pointer patterns.', time: '30 min' },
    { title: 'HR readiness', detail: 'Prepare intro, strengths, weakness, relocation, salary, and closing questions.', time: '20 min' },
  ],
}

export default function GroomingLabPage() {
  const router = useRouter()
  const [activeLab, setActiveLab] = useState<LabKey>('resume')
  const [role, setRole] = useState('Backend Engineer')
  const [project, setProject] = useState('REST API with Auth')

  const active = useMemo(() => labs.find((lab) => lab.key === activeLab) || labs[0], [activeLab])
  const bullets = useMemo(() => buildResumeBullets(role, project), [role, project])

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <button onClick={() => router.push('/dashboard')} style={backButtonStyle}>← Dashboard</button>

        <section style={heroStyle}>
          <div>
            <div style={eyebrowStyle}>Grooming Lab</div>
            <h1 style={{ margin: '8px 0 10px', fontSize: 42, letterSpacing: -1.8, lineHeight: 1.04 }}>Prepare for the job beyond code.</h1>
            <p style={leadStyle}>Resume building, mock interviews, aptitude prep, interview readiness, and career polish now live directly inside Nirmaan.</p>
          </div>
          <aside style={scoreCardStyle}>
            <div style={{ color: 'rgba(255,255,255,0.52)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.4 }}>Readiness Score</div>
            <div style={{ fontSize: 50, fontWeight: 950, margin: '6px 0 2px' }}>72</div>
            <div style={{ color: 'rgba(255,255,255,0.58)', fontSize: 13 }}>Complete resume and one mock interview to unlock deployment-ready career score.</div>
          </aside>
        </section>

        <section style={labGridStyle}>
          {labs.map((lab) => (
            <button key={lab.key} onClick={() => setActiveLab(lab.key)} style={{ ...labCardStyle, ...(lab.key === activeLab ? activeLabCardStyle : {}) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div style={{ fontSize: 15, fontWeight: 900 }}>{lab.title}</div>
                <span style={{ ...smallPillStyle, ...(lab.key === activeLab ? activeSmallPillStyle : {}) }}>{lab.metric}</span>
              </div>
              <p style={{ margin: '8px 0 0', color: lab.key === activeLab ? 'rgba(255,255,255,0.64)' : '#6F6B64', fontSize: 12, lineHeight: 1.45 }}>{lab.subtitle}</p>
            </button>
          ))}
        </section>

        <section style={contentGridStyle}>
          <div style={panelStyle}>
            <div style={eyebrowStyle}>{active.title}</div>
            <h2 style={{ margin: '6px 0 16px', fontSize: 26, letterSpacing: -0.85 }}>Your guided prep path</h2>
            <div style={{ display: 'grid', gap: 12 }}>
              {prepPaths[activeLab].map((step, index) => (
                <article key={step.title} style={pathCardStyle}>
                  <div style={stepNumberStyle}>{index + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <h3 style={{ margin: 0, fontSize: 16, letterSpacing: -0.35 }}>{step.title}</h3>
                      <span style={{ color: '#197247', fontSize: 11, fontWeight: 900 }}>{step.time}</span>
                    </div>
                    <p style={{ margin: '5px 0 0', color: '#6F6B64', fontSize: 13, lineHeight: 1.5 }}>{step.detail}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside style={panelStyle}>
            <div style={eyebrowStyle}>Smart Resume Draft</div>
            <h2 style={{ margin: '6px 0 14px', fontSize: 22, letterSpacing: -0.7 }}>Project to resume bullets</h2>
            <label style={labelStyle}>Target role</label>
            <input value={role} onChange={(event) => setRole(event.target.value)} style={inputStyle} />
            <label style={labelStyle}>Project name</label>
            <input value={project} onChange={(event) => setProject(event.target.value)} style={inputStyle} />
            <div style={draftBoxStyle}>
              {bullets.map((bullet) => <p key={bullet} style={{ margin: '0 0 10px', fontSize: 12.5, lineHeight: 1.5 }}>• {bullet}</p>)}
            </div>
            <button style={primaryButtonStyle}>Save readiness plan</button>
            <p style={{ margin: '12px 0 0', color: '#6F6B64', fontSize: 12, lineHeight: 1.45 }}>This is a native Nirmaan version of Grooming Lab. It can later connect to AI scoring, resume export, and interview transcripts.</p>
          </aside>
        </section>
      </div>
    </main>
  )
}

function buildResumeBullets(role: string, project: string) {
  const cleanRole = role.trim() || 'Software Engineer'
  const cleanProject = project.trim() || 'Nirmaan project'
  return [
    `Built ${cleanProject} aligned to ${cleanRole} expectations, covering authentication, clean architecture, and deployment readiness.`,
    'Improved production readiness through PSI feedback, code quality checks, security review, and structured project documentation.',
    'Practiced interview storytelling by explaining project scope, tradeoffs, debugging decisions, and measurable learning outcomes.',
  ]
}

const pageStyle: CSSProperties = { minHeight: '100vh', background: '#F5F1EA', color: '#0D0D0D', fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }
const shellStyle: CSSProperties = { maxWidth: 1120, margin: '0 auto', padding: '28px 24px 44px' }
const backButtonStyle: CSSProperties = { border: '1px solid #E1DDD4', background: '#FFFDF9', borderRadius: 999, padding: '9px 14px', fontWeight: 800, cursor: 'pointer', marginBottom: 20 }
const heroStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 310px', gap: 22, alignItems: 'stretch', marginBottom: 20 }
const eyebrowStyle: CSSProperties = { color: '#197247', fontSize: 11, fontWeight: 950, letterSpacing: 1.5, textTransform: 'uppercase' }
const leadStyle: CSSProperties = { margin: 0, color: '#6F6B64', fontSize: 15, lineHeight: 1.6, maxWidth: 650 }
const scoreCardStyle: CSSProperties = { background: '#0D0D0D', color: '#fff', borderRadius: 18, padding: 22, boxShadow: '0 18px 45px rgba(13,13,13,0.18)' }
const labGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 14 }
const labCardStyle: CSSProperties = { background: '#FFFDF9', border: '1px solid #E1DDD4', borderRadius: 16, padding: 16, textAlign: 'left', cursor: 'pointer' }
const activeLabCardStyle: CSSProperties = { background: '#0D0D0D', color: '#fff', borderColor: '#0D0D0D' }
const smallPillStyle: CSSProperties = { background: '#DFF1E8', color: '#197247', borderRadius: 999, padding: '4px 8px', fontSize: 10, fontWeight: 900 }
const activeSmallPillStyle: CSSProperties = { background: 'rgba(255,255,255,0.12)', color: '#fff' }
const contentGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 370px', gap: 14 }
const panelStyle: CSSProperties = { background: '#FFFDF9', border: '1px solid #E1DDD4', borderRadius: 18, padding: 20 }
const pathCardStyle: CSSProperties = { border: '1px solid #EEEAE2', background: '#FBF8F2', borderRadius: 15, padding: 16, display: 'flex', gap: 14 }
const stepNumberStyle: CSSProperties = { width: 30, height: 30, borderRadius: 10, background: '#DFF1E8', color: '#197247', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 950, flexShrink: 0 }
const labelStyle: CSSProperties = { display: 'block', fontSize: 12, fontWeight: 850, margin: '12px 0 6px' }
const inputStyle: CSSProperties = { width: '100%', border: '1px solid #E1DDD4', borderRadius: 11, padding: '11px 12px', background: '#FBF8F2', color: '#0D0D0D', outline: 'none', boxSizing: 'border-box', font: 'inherit', fontSize: 13 }
const draftBoxStyle: CSSProperties = { marginTop: 14, background: '#FBF8F2', border: '1px solid #EEEAE2', borderRadius: 14, padding: 14, color: '#38342E' }
const primaryButtonStyle: CSSProperties = { width: '100%', marginTop: 14, background: '#0D0D0D', color: '#fff', border: 'none', borderRadius: 11, padding: '12px 14px', fontSize: 13, fontWeight: 900, cursor: 'pointer' }
