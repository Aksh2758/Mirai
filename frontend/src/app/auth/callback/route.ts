import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/scanner'

  if (code) {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: CookieOptions) {
            cookieStore.set({ name, value, ...options })
          },
          remove(name: string, options: CookieOptions) {
            cookieStore.set({ name, value: '', ...options })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const { data: { user }, error: userError } = await supabase.auth.getUser()

      if (user && !userError) {
        // ── Save GitHub token to user profile via backend ──────────────
        // The session contains the provider_token (GitHub OAuth token)
        const { data: { session } } = await supabase.auth.getSession()
        const githubToken = session?.provider_token   // GitHub OAuth token
        const githubUsername = user.user_metadata?.user_name || user.user_metadata?.login || null

        if (githubToken || githubUsername) {
          try {
            // Call our backend to save the GitHub token + username
            const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
            await fetch(`${backendUrl}/auth/save-github-token`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session?.access_token}`,
              },
              body: JSON.stringify({
                github_token: githubToken,
                github_username: githubUsername,
              }),
            })
          } catch (e) {
            // Non-critical — user can still continue
            console.error('Failed to save GitHub token:', e)
          }
        }

        // ── Check if scanner completed → redirect to dashboard ──────────
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('scanner_completed')
          .eq('id', user.id)
          .single()

        if (profile?.scanner_completed) {
          return NextResponse.redirect(`${origin}/dashboard`)
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/auth-error`)
}
