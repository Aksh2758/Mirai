// ─── Auth / User ─────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string
  github_username: string | null
  github_token: string | null
  scanner_method: 'github' | 'pdf' | 'manual' | 'combined' | null
  scanner_completed: boolean
  role: string | null
  level: 'Beginner' | 'Intermediate' | 'Advanced' | null
  skill_scores: Record<string, number>    // e.g. { "backend": 85, "frontend": 42 }
  pace_factor: 'slow' | 'normal' | 'fast' | null
  active_project_id: string | null
  xp_score: number
  created_at: string
  updated_at: string
}

// ─── Scanner ─────────────────────────────────────────────────────────────────

export interface GithubData {
  username: string
  repo_count: number
  top_languages: Record<string, number>   // e.g. { "Python": 60, "JavaScript": 40 }
  commit_frequency: 'low' | 'medium' | 'high'
  account_age_years: number
  top_repos: Array<{
    name: string
    description: string | null
    language: string | null
    stars: number
  }>
}

export interface ExtractedPdfData {
  raw_text: string
  detected_skills: string[]
  detected_experience_years: number
  detected_job_titles: string[]
  detected_technologies: string[]
}

export interface ManualAnswer {
  question_id: number
  question: string
  answer: string
}

export interface User extends UserProfile {}

export interface SkillScore {
  label: string          // e.g. "Python", "React", "SQL"
  score: number          // 0–100
  category: string       // "Languages" | "Frameworks" | "Databases" | "Domain Skills" | "Tools" | "DevOps"
}

export interface SkillDna {
  role: string
  level: 'Beginner' | 'Intermediate' | 'Advanced'
  pace_factor: 'slow' | 'normal' | 'fast'
  skill_scores: Record<string, SkillScore>   // key is label_1, label_2 etc — use Object.values() to get the array
  summary: string
  strengths: string[]
  gaps: string[]
}

export interface ProjectSuggestion {
  title: string
  brief: string
  full_explanation: string
  tech_stack: string[]
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced'
  estimated_hours: number
  outcome: string
  new_skills_introduced: string[]
}

export interface AnalyzerResult {
  skill_dna: SkillDna
  projects: [ProjectSuggestion, ProjectSuggestion, ProjectSuggestion]
}

// ─── Studio ──────────────────────────────────────────────────────────────────

export interface RoadmapStep {
  id: string
  title: string
  instructions: string                  // Markdown
  starter_code: string
  starter_filename: string
  status: 'locked' | 'active' | 'done'
  started_at: string | null
  completed_at: string | null
}

export interface CodeFile {
  filename: string
  content: string
  updated_at: string
}

export interface Project {
  _id: string
  user_id: string
  title: string
  brief: string
  tech_stack: string[]
  difficulty: string
  current_step: number
  status: 'active' | 'completed'
  steps: RoadmapStep[]
  code_files: CodeFile[]
  created_at: string
  updated_at: string
}

export interface Job {
  id: string
  company: string
  role: string
  location: string
  salary: string
  skills: string[]
  link: string
}

export interface CopilotMessage {
  role: 'user' | 'assistant'
  content: string
  code_block?: string                   // If AI returned a code block to apply
  timestamp: string
}

// ─── PSI Analysis ─────────────────────────────────────────────────────────────

export interface PsiDimension {
  name: string          // "Code Quality" | "Security" | "Performance" | "Industry Fit"
  score: number         // 0–100
}

export interface PsiImprovement {
  severity: 'high' | 'medium' | 'low'
  title: string         // Short title, under 10 words
  description: string   // 1–2 sentence explanation
}

export interface PsiResult {
  score: number                   // 0–100, overall weighted score
  dimensions: PsiDimension[]      // Always exactly 4 items in this order:
                                  // Code Quality, Security, Performance, Industry Fit
  improvements: PsiImprovement[]  // 2–5 items, sorted high → medium → low severity
  compliments: string[]           // 2–3 short strings, things the student did well
}

// ─── Deploy Flow ──────────────────────────────────────────────────────────────

export type DeployStatus = 'pending' | 'running' | 'done' | 'error'

export interface DeployStep {
  id: number            // Sequential integer starting at 1
  label: string         // e.g. "Bundling project files"
  status: DeployStatus
  detail?: string       // Optional — shown as sub-text when status is 'done' or 'error'
}

export interface DeployResult {
  success: boolean
  live_url: string      // e.g. "https://rest-api-auth-a3f2.nirmaan.app"
  github_url: string    // e.g. "https://github.com/user/rest-api-auth"
  steps: DeployStep[]
}

// ─── Jobs / Internships ───────────────────────────────────────────────────────

export interface JobListing {
  job_id: string
  title: string
  company: string
  location: string      // e.g. "Bangalore, India" or "Remote"
  is_remote: boolean
  apply_url: string
  description_snippet: string   // First 200 chars of job description
  required_skills: string[]     // Extracted from description
  match_pct: number             // 0–100, calculated by backend against user's skill_scores
  posted_at: string             // ISO date string
}

export interface JobsResponse {
  jobs: JobListing[]
  role_searched: string         // The role string used to query JSearch
  cached: boolean               // true if response came from Supabase cache
  cache_age_hours: number       // How old the cache is. 0 if fresh fetch.
  total: number
}

// ─── Instruction Panel ────────────────────────────────────────────────────────

export interface InstructionPanelProps {
  step: RoadmapStep           // The currently active step
  userLevel: string           // 'Beginner' | 'Intermediate' | 'Advanced'
  stepIndex: number           // 0-based current step index
  totalSteps: number          // Total number of steps
  onComplete: () => void      // Called when user clicks "Complete Step"
  completing: boolean         // True while complete-step API call is in flight
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export interface DashboardUser {
  full_name: string | null      // null if not set — UI shows email username as fallback
  email: string
  role: string | null
  level: 'Beginner' | 'Intermediate' | 'Advanced' | null
  xp: number
  skill_scores: Record<string, SkillScore>   // e.g. { "backend": { label: "Backend", score: 85, category: "Domain" } }
  pace_factor: 'slow' | 'normal' | 'fast' | null
}

export interface DashboardProject {
  id: string                    // MongoDB _id as string
  title: string
  tech_stack: string[]
  progress_pct: number          // 0–100, calculated server-side
  current_step_title: string    // title of the active step
  steps_done: number            // count of steps with status === 'done'
  steps_total: number           // total number of steps
  current_step_todo: string[]   // 2–3 bullet strings from the active step instructions
}

export interface DashboardInternship {
  job_id: string
  title: string
  company: string
  location: string
  is_remote: boolean
  match_pct: number
  apply_url: string
}

export interface DashboardSummary {
  user: DashboardUser
  active_project: DashboardProject | null    // null if no project selected yet
  top_internships: DashboardInternship[]     // always 0–3 items, never errors if jobs fail
  scanner_completed: boolean
}
