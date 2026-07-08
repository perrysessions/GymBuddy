'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useState } from 'react'

const links = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/log', label: 'Log', icon: '✏️' },
  { href: '/exercise', label: 'Exercises', icon: '💪' },
  { href: '/chat', label: 'AI Chat', icon: '🤖' },
  { href: '/import', label: 'Import', icon: '📥' },
]

export default function Nav({ isAiEnabled }: { isAiEnabled: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [profileOpen, setProfileOpen] = useState(false)
  const [changingPw, setChangingPw] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwDone, setPwDone] = useState(false)
  const [pwLoading, setPwLoading] = useState(false)

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwError('')
    if (newPw !== confirmPw) { setPwError('Passwords do not match'); return }
    if (newPw.length < 6) { setPwError('Must be at least 6 characters'); return }
    setPwLoading(true)
    const { error } = await supabase.auth.updateUser({ password: newPw })
    if (error) { setPwError(error.message) }
    else { setPwDone(true); setNewPw(''); setConfirmPw('') }
    setPwLoading(false)
  }

  function closeProfile() {
    setProfileOpen(false)
    setChangingPw(false)
    setPwError('')
    setPwDone(false)
    setNewPw('')
    setConfirmPw('')
  }

  const visibleLinks = isAiEnabled ? links : links.filter(l => l.href !== '/chat')

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-52 min-h-screen border-r px-3 py-6 shrink-0"
        style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
        <div className="text-xl font-bold mb-8 px-2" style={{ color: 'var(--accent)' }}>🏋️ Gym Buddy</div>
        <div className="flex flex-col gap-1 flex-1">
          {visibleLinks.map(({ href, label, icon }) => (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: pathname.startsWith(href) ? 'var(--accent)' : 'transparent',
                color: pathname.startsWith(href) ? '#fff' : 'var(--muted)',
              }}
            >
              <span>{icon}</span> {label}
            </Link>
          ))}
        </div>
        <div className="relative">
          <button
            onClick={() => setProfileOpen(v => !v)}
            className="w-full text-sm px-3 py-2 rounded-lg text-left transition-colors flex items-center gap-2"
            style={{ color: 'var(--muted)' }}
          >
            <span>👤</span> Profile
          </button>
          {profileOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border p-4 z-50"
              style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
              {!changingPw ? (
                <div className="flex flex-col gap-2">
                  <button onClick={() => setChangingPw(true)}
                    className="text-sm px-3 py-2 rounded-lg text-left transition-colors hover:opacity-80"
                    style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
                    Change Password
                  </button>
                  <button onClick={signOut}
                    className="text-sm px-3 py-2 rounded-lg text-left transition-colors hover:opacity-80"
                    style={{ background: 'var(--background)', color: '#ef4444' }}>
                    Sign Out
                  </button>
                  <button onClick={closeProfile} className="text-xs text-center mt-1" style={{ color: 'var(--muted)' }}>
                    Cancel
                  </button>
                </div>
              ) : (
                <div>
                  <button onClick={() => { setChangingPw(false); setPwError(''); setPwDone(false) }}
                    className="text-xs mb-3 block" style={{ color: 'var(--muted)' }}>← Back</button>
                  {pwDone ? (
                    <p className="text-green-400 text-xs">Password updated!</p>
                  ) : (
                    <form onSubmit={changePassword} className="space-y-2">
                      <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                        placeholder="New password" required
                        className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none"
                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
                      <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                        placeholder="Confirm password" required
                        className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none"
                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
                      {pwError && <p className="text-red-400 text-xs">{pwError}</p>}
                      <button type="submit" disabled={pwLoading}
                        className="w-full py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-50"
                        style={{ background: 'var(--accent)' }}>
                        {pwLoading ? '...' : 'Update Password'}
                      </button>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t flex justify-around py-2 z-50"
        style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
        {visibleLinks.map(({ href, label, icon }) => (
          <Link
            key={href}
            href={href}
            className="flex flex-col items-center gap-0.5 text-xs px-2"
            style={{ color: pathname.startsWith(href) ? 'var(--accent)' : 'var(--muted)' }}
          >
            <span className="text-lg">{icon}</span>
            {label}
          </Link>
        ))}
        <button
          onClick={() => setProfileOpen(v => !v)}
          className="flex flex-col items-center gap-0.5 text-xs px-2"
          style={{ color: 'var(--muted)' }}
        >
          <span className="text-lg">👤</span>
          Profile
        </button>
      </nav>

      {/* Mobile profile sheet */}
      {profileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={closeProfile} />
          <div className="relative rounded-t-2xl p-6 border-t"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
            <h3 className="text-base font-semibold mb-4">Profile</h3>
            {!changingPw ? (
              <div className="flex flex-col gap-3">
                <button onClick={() => setChangingPw(true)}
                  className="w-full text-sm px-4 py-3 rounded-xl text-left font-medium"
                  style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
                  Change Password
                </button>
                <button onClick={signOut}
                  className="w-full text-sm px-4 py-3 rounded-xl text-left font-medium"
                  style={{ background: 'var(--background)', color: '#ef4444' }}>
                  Sign Out
                </button>
                <button onClick={closeProfile} className="text-sm text-center mt-1" style={{ color: 'var(--muted)' }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div>
                <button onClick={() => { setChangingPw(false); setPwError(''); setPwDone(false) }}
                  className="text-sm mb-4 block" style={{ color: 'var(--muted)' }}>← Back</button>
                {pwDone ? (
                  <p className="text-green-400 text-sm">Password updated!</p>
                ) : (
                  <form onSubmit={changePassword} className="space-y-3">
                    <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)}
                      placeholder="New password" required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                      style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
                    <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                      placeholder="Confirm password" required
                      className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none"
                      style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
                    {pwError && <p className="text-red-400 text-sm">{pwError}</p>}
                    <button type="submit" disabled={pwLoading}
                      className="w-full py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                      style={{ background: 'var(--accent)' }}>
                      {pwLoading ? '...' : 'Update Password'}
                    </button>
                  </form>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}
