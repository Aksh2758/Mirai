'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // After any successful login, check profile and redirect
  async function handlePostLogin() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Fetch their profile from Supabase
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('scanner_completed, active_project_id')
      .eq('id', user.id)
      .single()

    if (profile?.scanner_completed && profile?.active_project_id) {
      router.push(`/studio/${profile.active_project_id}`)
    } else {
      router.push('/scanner')
    }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: authError } = isSignUp
      ? await supabase.auth.signUp({ 
          email, 
          password, 
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` } 
        })
      : await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      console.error('Auth error full details:', authError)
      setError(authError.message)
      setLoading(false)
      return
    }

    await handlePostLogin()
    setLoading(false)
  }

  async function handleGitHubLogin() {
    setLoading(true)
    setError(null)
    try {
      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: 'read:user repo',
        },
      })
      if (authError) {
        console.error('GitHub Auth error:', authError)
        setError(authError.message)
      }
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0D0D0D' }}>
      <div style={{ background: '#1A1A1A', border: '1px solid #2a2a2a', borderRadius: 16, padding: '40px 36px', width: '100%', maxWidth: 400 }}>
        <h1 style={{ fontFamily: 'sans-serif', fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 6, letterSpacing: -1 }}>
          Nirmaan<span style={{ color: '#4ADE80' }}>.</span>
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14, marginBottom: 32 }}>
          {isSignUp ? 'Create your account' : 'Welcome back'}
        </p>

        {/* GitHub OAuth Button */}
        <button
          onClick={handleGitHubLogin}
          disabled={loading}
          style={{ width: '100%', background: '#fff', color: '#0D0D0D', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
        >
          Continue with GitHub
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>or</span>
          <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.08)' }} />
        </div>

        {error && (
          <div style={{ background: 'rgba(255, 87, 51, 0.1)', border: '1px solid #FF5733', borderRadius: 8, padding: '12px', marginBottom: 20 }}>
            <p style={{ color: '#FF5733', fontSize: 13, margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Email / Password Form */}
        <form onSubmit={handleEmailAuth}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, marginBottom: 10, boxSizing: 'border-box' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '10px 14px', color: '#fff', fontSize: 14, marginBottom: 16, boxSizing: 'border-box' }}
          />

          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', background: '#1A6B3C', color: '#fff', border: 'none', borderRadius: 10, padding: '12px 0', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 16 }}
          >
            {loading ? 'Loading...' : (isSignUp ? 'Create Account' : 'Sign In')}
          </button>
        </form>

        <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, textAlign: 'center', cursor: 'pointer' }}
          onClick={() => setIsSignUp(!isSignUp)}>
          {isSignUp ? 'Already have an account? Sign in' : "Don't have an account? Sign up"}
        </p>
      </div>
    </div>
  )
}
