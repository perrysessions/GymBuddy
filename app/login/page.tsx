'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Mode = 'login' | 'signup' | 'forgot'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('login')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message || JSON.stringify(error))
      } else {
        router.push('/dashboard')
        router.refresh()
      }
    } else if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message || JSON.stringify(error))
      } else if (data.session) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setMessage('Account created! Check your email for a confirmation link, then log in.')
      }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      if (error) {
        setError(error.message || JSON.stringify(error))
      } else {
        setMessage('Password reset email sent! Check your inbox.')
      }
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">🏋️</div>
          <h1 className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>Gym Buddy</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Track your gains</p>
        </div>

        <div className="rounded-xl p-6 border" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
          {mode !== 'forgot' && (
            <div className="flex rounded-lg overflow-hidden mb-6" style={{ background: 'var(--background)' }}>
              {(['login', 'signup'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => { setMode(m); setError(''); setMessage('') }}
                  className="flex-1 py-2 text-sm font-medium transition-colors"
                  style={{
                    background: mode === m ? 'var(--accent)' : 'transparent',
                    color: mode === m ? '#fff' : 'var(--muted)',
                  }}
                >
                  {m === 'login' ? 'Log In' : 'Sign Up'}
                </button>
              ))}
            </div>
          )}

          {mode === 'forgot' && (
            <div className="mb-6">
              <button onClick={() => { setMode('login'); setError(''); setMessage('') }}
                className="text-sm" style={{ color: 'var(--muted)' }}>
                ← Back to log in
              </button>
              <h2 className="text-base font-semibold mt-2">Reset password</h2>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--muted)' }}>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-orange-500 transition-colors"
                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
                placeholder="you@example.com"
              />
            </div>
            {mode !== 'forgot' && (
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--muted)' }}>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-orange-500 transition-colors"
                  style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
                  placeholder="••••••••"
                />
              </div>
            )}

            {error && <p className="text-red-400 text-sm">{error}</p>}
            {message && <p className="text-green-400 text-sm">{message}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 rounded-lg font-semibold text-white transition-opacity disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {loading ? '...' : mode === 'login' ? 'Log In' : mode === 'signup' ? 'Create Account' : 'Send Reset Email'}
            </button>

            {mode === 'login' && (
              <button type="button" onClick={() => { setMode('forgot'); setError(''); setMessage('') }}
                className="w-full text-sm text-center" style={{ color: 'var(--muted)' }}>
                Forgot password?
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
