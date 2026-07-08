'use client'

import { useState, useRef, useEffect } from 'react'

interface Message { role: 'user' | 'assistant'; content: string }

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

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [usedToday, setUsedToday] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setUsedToday(getDailyUsage())
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return
    setInput('')
    setError('')

    const newMessages: Message[] = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    setLoading(true)

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

    setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    setUsedToday(incrementDailyUsage())
  }

  const remaining = Math.max(0, DAILY_LIMIT - usedToday)
  const pct = Math.min(100, (usedToday / DAILY_LIMIT) * 100)
  const barColor = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f97316' : 'var(--accent)'

  return (
    <div className="max-w-2xl mx-auto flex flex-col h-[calc(100vh-8rem)]">
      <div className="shrink-0 mb-4 space-y-1.5">
        <h1 className="text-2xl font-bold">AI Chat</h1>
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--muted)' }}>
          <span>{remaining} of {DAILY_LIMIT} chats remaining today</span>
          <span>{usedToday} used</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--card-border)' }}>
          <div
            className="h-full rounded-full transition-all duration-300"
            style={{ width: `${pct}%`, background: barColor }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
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
            <div
              className="max-w-[85%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap"
              style={{
                background: m.role === 'user' ? 'var(--accent)' : 'var(--card)',
                color: m.role === 'user' ? '#fff' : 'var(--foreground)',
                borderRadius: m.role === 'user' ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
              }}
            >
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
        <button
          onClick={() => send()}
          disabled={!input.trim() || loading}
          className="px-4 py-2.5 rounded-xl text-white font-semibold text-sm disabled:opacity-40"
          style={{ background: 'var(--accent)' }}>
          Send
        </button>
      </div>
    </div>
  )
}
