'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useState, useEffect } from 'react'
import {
  LayoutDashboard, PenLine, Dumbbell, Bot, Upload, User, Sun, Moon,
} from 'lucide-react'

const links = [
  { href: '/dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { href: '/log',       label: 'Log',       Icon: PenLine },
  { href: '/exercise',  label: 'Exercises', Icon: Dumbbell },
  { href: '/chat',      label: 'AI Chat',   Icon: Bot },
  { href: '/import',    label: 'Import',    Icon: Upload },
]

export default function Nav({ isAiEnabled }: { isAiEnabled: boolean }) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const [profileOpen, setProfileOpen] = useState(false)
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('theme')
    if (saved === 'light') setTheme('light')
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('theme', next)
    if (next === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
  }
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
        <div className="flex items-center gap-2 text-xl font-bold mb-8 px-2" style={{ color: 'var(--accent)' }}>
          <Dumbbell size={22} />
          Gym Buddy
        </div>
        <div className="flex flex-col gap-1 flex-1">
          {visibleLinks.map(({ href, label, Icon }) => (
            <Link key={href} href={href}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: pathname.startsWith(href) ? 'var(--accent)' : 'transparent',
                color: pathname.startsWith(href) ? '#fff' : 'var(--muted)',
              }}>
              <Icon size={16} />
              {label}
            </Link>
          ))}
        </div>
        <div className="relative">
          <button onClick={() => setProfileOpen(v => !v)}
            className="w-full text-sm px-3 py-2 rounded-lg text-left transition-colors flex items-center gap-2.5"
            style={{ color: 'var(--muted)' }}>
            <User size={16} />
            Profile
          </button>
          {profileOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 rounded-xl border p-4 z-50"
              style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
              {!changingPw ? (
                <div className="flex flex-col gap-2">
                  <button onClick={toggleTheme}
                    className="text-sm px-3 py-2 rounded-lg text-left hover:opacity-80 flex items-center gap-2"
                    style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
                    {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                    {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                  </button>
                  <button onClick={() => setChangingPw(true)}
                    className="text-sm px-3 py-2 rounded-lg text-left hover:opacity-80"
                    style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
                    Change Password
                  </button>
                  <button onClick={signOut}
                    className="text-sm px-3 py-2 rounded-lg text-left hover:opacity-80"
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
        {visibleLinks.map(({ href, label, Icon }) => (
          <Link key={href} href={href}
            className="flex flex-col items-center gap-0.5 text-xs px-2"
            style={{ color: pathname.startsWith(href) ? 'var(--accent)' : 'var(--muted)' }}>
            <Icon size={20} />
            {label}
          </Link>
        ))}
        <button onClick={() => setProfileOpen(v => !v)}
          className="flex flex-col items-center gap-0.5 text-xs px-2"
          style={{ color: 'var(--muted)' }}>
          <User size={20} />
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
                <button onClick={toggleTheme}
                  className="w-full text-sm px-4 py-3 rounded-xl text-left font-medium flex items-center gap-2"
                  style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </button>
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
