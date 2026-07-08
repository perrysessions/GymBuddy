'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

interface Message { id?: string; role: 'user' | 'assistant'; content: string }
interface Session { id: string; title: string; updated_at: string }

const SUGGESTED = [
  'How is my bench press progressing?',
  'Which exercises have I plateaued on?',
  'What does my left arm imbalance look like in hammer curls?',
  'How has my body weight changed?',
  'What should I focus on this week?',
]

const DAILY_LIMIT = 50

function getDailyUsage(): number {
  const key = `chat_usage_${new Date().toISOString().slice(0, 10)}`
  return parseInt(localStorage.getItem(key) ?? '0', 10)
}
function incrementDailyUsage(): number {
  const key = `chat_usage_${new Date().toISOString().slice(0, 10)}`
  const next = getDailyUsage() + 1
  localStorage.setItem(key, String(next))
  return next
}

function formatSessionDate(iso: string) {
  const d = new Date(iso)
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' })
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ChatPage() {
  const supabase = createClient()
  const [sessions, setSessions] = useState<Session[]>([])
  const [sessionSearch, setSessionSearch] = useState('')
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [error, setError] = useState('')
  const [usedToday, setUsedToday] = useState(0)
  const [showSidebar, setShowSidebar] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setUsedToday(getDailyUsage()) }, [])
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const fetchSessions = useCallback(async () => {
    const { data } = await supabase
      .from('chat_sessions')
      .select('id, title, updated_at')
      .order('updated_at', { ascending: false })
    setSessions(data ?? [])
  }, [])

  useEffect(() => { fetchSessions() }, [fetchSessions])

  async function loadSession(sessionId: string) {
    setCurrentSessionId(sessionId)
    setShowSidebar(false)
    setError('')
    setLoadingMessages(true)
    const { data } = await supabase
      .from('chat_messages')
      .select('id, role, content')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true })
    setMessages((data ?? []) as Message[])
    setLoadingMessages(false)
  }

  function newChat() {
    setCurrentSessionId(null)
    setMessages([])
    setError('')
    setShowSidebar(false)
  }

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')
    setError('')

    const userMsg: Message = { role: 'user', content }
    const optimisticMessages = [...messages, userMsg]
    setMessages(optimisticMessages)
    setLoading(true)

    // Create session on first message
    let sessionId = currentSessionId
    if (!sessionId) {
      const title = content.length > 60 ? content.slice(0, 57) + '…' : content
      const { data: newSession } = await supabase
        .from('chat_sessions')
        .insert({ title })
        .select('id')
        .single()
      if (!newSession) { setError('Failed to create chat session'); setLoading(false); return }
      sessionId = newSession.id
      setCurrentSessionId(sessionId)
      fetchSessions()
    }

    // Save user message
    await supabase.from('chat_messages').insert({ session_id: sessionId, role: 'user', content })

    // Update session timestamp
    await supabase.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId)

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: content, history: messages }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
      return
    }

    const assistantMsg: Message = { role: 'assistant', content: data.reply }
    setMessages(prev => [...prev, assistantMsg])
    setUsedToday(incrementDailyUsage())

    // Save assistant message
    await supabase.from('chat_messages').insert({ session_id: sessionId, role: 'assistant', content: data.reply })
    await supabase.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId)
    fetchSessions()
  }

  async function deleteSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation()
    await supabase.from('chat_sessions').delete().eq('id', sessionId)
    if (currentSessionId === sessionId) newChat()
    fetchSessions()
  }

  const filteredSessions = sessionSearch.trim()
    ? sessions.filter(s => s.title.toLowerCase().includes(sessionSearch.toLowerCase()))
    : sessions

  const remaining = Math.max(0, DAILY_LIMIT - usedToday)
  const pct = Math.min(100, (usedToday / DAILY_LIMIT) * 100)
  const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f97316' : 'var(--accent)'

  const Sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <button onClick={newChat}
          className="flex-1 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}>
          + New Chat
        </button>
      </div>
      <input
        type="text"
        value={sessionSearch}
        onChange={e => setSessionSearch(e.target.value)}
        placeholder="Search chats…"
        className="px-3 py-2 rounded-lg border text-sm outline-none mb-3"
        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
      />
      <div className="flex-1 overflow-y-auto space-y-1">
        {filteredSessions.length === 0 && (
          <p className="text-xs text-center py-4" style={{ color: 'var(--muted)' }}>
            {sessionSearch ? 'No chats match' : 'No chats yet'}
          </p>
        )}
        {filteredSessions.map(s => (
          <div key={s.id}
            onClick={() => loadSession(s.id)}
            className="group flex items-start gap-1 px-3 py-2 rounded-lg cursor-pointer transition-colors hover:opacity-80"
            style={{
              background: currentSessionId === s.id ? 'rgba(232,93,4,0.15)' : 'var(--background)',
              border: currentSessionId === s.id ? '1px solid var(--accent)' : '1px solid transparent',
            }}>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{s.title}</p>
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{formatSessionDate(s.updated_at)}</p>
            </div>
            <button
              onClick={e => deleteSession(s.id, e)}
              className="opacity-0 group-hover:opacity-100 text-xs px-1 shrink-0 transition-opacity"
              style={{ color: 'var(--muted)' }}>
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4 max-w-5xl mx-auto">

      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col w-64 shrink-0 rounded-xl border p-3"
        style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
        {Sidebar}
      </div>

      {/* Mobile sidebar overlay */}
      {showSidebar && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSidebar(false)} />
          <div className="relative rounded-t-2xl p-4 border-t h-[70vh] flex flex-col"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
            {Sidebar}
          </div>
        </div>
      )}

      {/* Main chat */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="shrink-0 mb-3 space-y-1.5">
          <div className="flex items-center gap-3">
            <button className="md:hidden text-sm px-3 py-1.5 rounded-lg border"
              style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}
              onClick={() => setShowSidebar(true)}>
              ☰ Chats
            </button>
            <h1 className="text-xl font-bold flex-1">
              {currentSessionId
                ? (sessions.find(s => s.id === currentSessionId)?.title ?? 'Chat')
                : 'AI Chat'}
            </h1>
            <button className="md:hidden text-sm px-3 py-1.5 rounded-lg text-white"
              style={{ background: 'var(--accent)' }}
              onClick={newChat}>
              + New
            </button>
          </div>
          <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
            <span>{remaining} of {DAILY_LIMIT} chats remaining today</span>
            <span>{usedToday} used</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--card-border)' }}>
            <div className="h-full rounded-full transition-all duration-300"
              style={{ width: `${pct}%`, background: barColor }} />
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4 pb-4">
          {loadingMessages && (
            <p className="text-sm text-center py-8" style={{ color: 'var(--muted)' }}>Loading…</p>
          )}

          {!loadingMessages && messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Ask me anything about your workouts. I have access to your full training history.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED.map(s => (
                  <button key={s} onClick={() => send(s)}
                    className="px-3 py-1.5 rounded-full text-xs border transition-colors hover:opacity-80"
                    style={{ borderColor: 'var(--card-border)', color: 'var(--accent)', background: 'var(--card)' }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className="max-w-[85%] px-4 py-2.5 text-sm whitespace-pre-wrap"
                style={{
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--card)',
                  color: m.role === 'user' ? '#fff' : 'var(--foreground)',
                  borderRadius: m.role === 'user' ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
                }}>
                {m.content}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="px-4 py-2.5 rounded-2xl text-sm" style={{ background: 'var(--card)', color: 'var(--muted)' }}>
                Thinking...
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="shrink-0 flex gap-2 pt-2 border-t" style={{ borderColor: 'var(--card-border)' }}>
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send()}
            placeholder="Ask about your workouts..."
            className="flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
          />
          <button onClick={() => send()} disabled={!input.trim() || loading}
            className="px-4 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
            style={{ background: 'var(--accent)' }}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
