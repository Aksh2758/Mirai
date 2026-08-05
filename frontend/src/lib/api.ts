import { createBrowserClient } from '@supabase/ssr'
import type { 
  GithubData, 
  ExtractedPdfData, 
  ManualAnswer, 
  AnalyzerResult, 
  ProjectSuggestion, 
  Project,
  PsiResult,
  JobsResponse,
  DashboardSummary,
  RoadmapStep,
  CopilotMessage
} from './types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

// ─── Generic fetch wrapper with Auth ──────────────────────────────────────────

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { session } } = await supabase.auth.getSession()
  
  const headers = new Headers(init?.headers)
  if (session?.access_token) {
    headers.set('Authorization', `Bearer ${session.access_token}`)
  }

  if (!headers.has('Content-Type') && !(init?.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json')
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
  })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail || res.statusText || 'API Request Failed')
  }

  return res.json() as Promise<T>
}

// ─── Scanner API ────────────────────────────────────────────────────────────

export async function scanGithub(url: string): Promise<GithubData> {
  return request<GithubData>('/scanner/github', {
    method: 'POST',
    body: JSON.stringify({ github_url: url }),
  })
}

export async function scanPdf(file: File): Promise<ExtractedPdfData> {
  const formData = new FormData()
  formData.append('file', file)

  return request<ExtractedPdfData>('/scanner/pdf', {
    method: 'POST',
    body: formData,
  })
}

export async function scanManual(answers: ManualAnswer[]): Promise<ExtractedPdfData> {
  return request<ExtractedPdfData>('/scanner/manual', {
    method: 'POST',
    body: JSON.stringify({ answers }),
  })
}

export async function analyze(data: {
  github_data: GithubData | null
  pdf_data: ExtractedPdfData | null
  manual_data: ExtractedPdfData | null
}): Promise<AnalyzerResult> {
  return request<AnalyzerResult>('/analyzer/analyze', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

// ─── Studio API ─────────────────────────────────────────────────────────────

export async function initStudio(project: ProjectSuggestion, userLevel: string): Promise<{ project_id: string; project: Project }> {
  return request<{ project_id: string; project: Project }>('/studio/init', {
    method: 'POST',
    body: JSON.stringify({
      project_title: project.title,
      project_brief: project.brief,
      tech_stack: project.tech_stack,
      difficulty: project.difficulty,
      user_level: userLevel,
    }),
  })
}

export async function getProject(projectId: string): Promise<Project> {
  return request<Project>(`/studio/${projectId}`, { method: 'GET' })
}

export async function saveCode(projectId: string, filename: string, content: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/studio/save-code', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, filename, content }),
  })
}

export async function createFile(projectId: string, filename: string, content: string = ''): Promise<{ ok: boolean; filename: string }> {
  return request<{ ok: boolean; filename: string }>('/studio/create-file', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, filename, content }),
  })
}

export async function deleteFile(projectId: string, filename: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/studio/delete-file', {
    method: 'DELETE',
    body: JSON.stringify({ project_id: projectId, filename }),
  })
}

export async function renameFile(projectId: string, oldFilename: string, newFilename: string): Promise<{ ok: boolean; new_filename: string }> {
  return request<{ ok: boolean; new_filename: string }>('/studio/rename-file', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, old_filename: oldFilename, new_filename: newFilename }),
  })
}

export async function completeStep(projectId: string, stepId: string): Promise<{ next_step: RoadmapStep | null; adaptive_message: string; xp_gained: number }> {
  return request<{ next_step: RoadmapStep | null; adaptive_message: string; xp_gained: number }>('/studio/complete-step', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId, step_id: stepId }),
  })
}

export async function fetchChatHistory(
  projectId: string,
  stepId?: string,
  limit: number = 50,
): Promise<{ messages: CopilotMessage[]; total: number }> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (stepId) params.set('step_id', stepId)
  return request<{ messages: CopilotMessage[]; total: number }>(
    `/studio/${projectId}/chat-history?${params.toString()}`
  )
}

export async function syncStudioWorkspace(projectId: string): Promise<{ ok: boolean; synced: boolean; file_count: number; reason?: string }> {
  return request<{ ok: boolean; synced: boolean; file_count: number; reason?: string }>('/studio/sync-workspace', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId }),
  })
}

export async function fetchJobs(): Promise<JobsResponse> {
  // No params — backend reads user's role and skills from their Supabase profile
  return request<JobsResponse>('/jobs/search', { method: 'GET' })
}

// ─── PSI ──────────────────────────────────────────────────────────────────────

export async function runPSIAnalysis(projectId: string): Promise<PsiResult> {
  return request<PsiResult>('/studio/psi', {
    method: 'POST',
    body: JSON.stringify({ project_id: projectId }),
  })
}

// ─── DEPLOY ───────────────────────────────────────────────────────────────────

/**
 * Deploy returns a streaming SSE response.
 * Handle this with fetch + ReadableStream in the component, not this function.
 * This function just returns the raw Response so the component can stream it.
 * psiScore is optional — pass it if PSI was run so the LinkedIn post can mention it.
 */
export async function deployProject(projectId: string, psiScore?: number): Promise<Response> {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: { session } } = await supabase.auth.getSession()

  const res = await fetch(`${BASE_URL}/studio/deploy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ project_id: projectId, psi_score: psiScore ?? null }),
  })
  
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.detail || res.statusText || 'Deploy failed')
  }
  
  return res
}

// ─── Auth / Token Management ──────────────────────────────────────────────────

export async function saveVercelToken(token: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/auth/save-vercel-token', {
    method: 'POST',
    body: JSON.stringify({ vercel_token: token }),
  })
}

export async function removeVercelToken(): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/auth/vercel-token', {
    method: 'DELETE',
  })
}

// ─── Legacy / Admin ──────────────────────────────────────────────────────────

export const updatePace = async () => ({ status: 'ok' })

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return request<DashboardSummary>('/dashboard/summary')
}
