import { supabase } from '@/lib/supabaseClient'
import type { TechRadarMode } from '@/lib/types'

/**
 * Tech Radar API client.
 * ONE THING TO CHECK: API_BASE and the auth header below must match how your existing `@/lib/api` calls FastAPI.
 * If your api.ts already has a shared request helper, replace `request()` with it and everything else stays as is.
 */
const API_BASE = (process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000').replace(/\/$/, '')

export interface RadarPost {
  id: string
  mode: TechRadarMode
  title: string
  body: string
  tags: string[]
  author_name: string
  author_role: string
  connections_count: number
  replies_count: number
  is_mine: boolean
  created_at: string
  match_pct?: number
  match_terms?: string[]
}

export interface RadarReply {
  id: string
  post_id: string
  body: string
  author_name: string
  author_role: string
  is_mine: boolean
  is_post_author: boolean
  created_at: string
}

export interface RadarList {
  posts: RadarPost[]
  counts: Record<TechRadarMode, number>
  total: number
  has_more: boolean
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession()
  const res = await fetch(`${API_BASE}/tech-radar${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
      else if (Array.isArray(body?.detail) && body.detail[0]?.msg) detail = body.detail[0].msg
    } catch { /* keep default */ }
    throw new Error(detail)
  }
  return res.json() as Promise<T>
}

export function listPosts(opts: { mode?: TechRadarMode | null; q?: string; mine?: boolean; sort?: 'new' | 'for_you'; offset?: number; limit?: number } = {}) {
  const p = new URLSearchParams()
  if (opts.mode) p.set('mode', opts.mode)
  if (opts.q?.trim()) p.set('q', opts.q.trim())
  if (opts.mine) p.set('mine', 'true')
  if (opts.sort === 'for_you') p.set('sort', 'for_you')
  p.set('offset', String(opts.offset ?? 0))
  p.set('limit', String(opts.limit ?? 30))
  return request<RadarList>(`/posts?${p.toString()}`)
}

export const createPost = (body: { mode: TechRadarMode; title: string; body: string; tags: string[] }) =>
  request<RadarPost>('/posts', { method: 'POST', body: JSON.stringify(body) })

export const deletePost = (id: string) => request<{ ok: boolean }>(`/posts/${id}`, { method: 'DELETE' })

export const connectToPost = (id: string, message?: string) =>
  request<{ ok: boolean }>(`/posts/${id}/connect`, { method: 'POST', body: JSON.stringify({ message: message || null }) })

export const listReplies = (id: string) => request<{ replies: RadarReply[] }>(`/posts/${id}/replies`)

export const createReply = (id: string, body: string) =>
  request<RadarReply>(`/posts/${id}/replies`, { method: 'POST', body: JSON.stringify({ body }) })

export const deleteReply = (postId: string, replyId: string) =>
  request<{ ok: boolean }>(`/posts/${postId}/replies/${replyId}`, { method: 'DELETE' })