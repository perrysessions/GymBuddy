'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

interface ParsedSet {
  set_number: number
  weight_lbs: number | null
  reps: number | null
}

interface ParsedSession {
  date: string | null
  date_label: string
  sets: ParsedSet[]
  max_weight: number | null
  avg_reps: number | null
  session_notes: string | null
  injury_flag: boolean
}

interface ParsedExercise {
  user_name: string
  official_name: string
  youtube_urls: string[]
  sessions: ParsedSession[]
}

interface Chunk {
  exerciseNames: string[]
  text: string
}

type Step = 'paste' | 'chunks' | 'parsing' | 'preview' | 'done'

const MAX_CHUNK_CHARS = 12000

// Matches lines that start with a date: "Jan 3", "January 3", "Mar 14, 2025:", "July 9, 2025:" etc.
const DATE_LINE_RE = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i

function splitIntoChunks(rawText: string): Chunk[] {
  const lines = rawText.split('\n')
  const exercises: { name: string; lines: string[] }[] = []
  let current: { name: string; lines: string[] } | null = null

  // Detect format: if there are dash lines, use Apple Notes mode; otherwise plain text mode
  const dashLines = lines.filter(l => /^[\s]*[-–—*]\s+\S/.test(l))
  const isAppleNotes = dashLines.length > 0

  if (isAppleNotes) {
    // Apple Notes: find minimum indentation among dash lines — those are exercise headers
    const minIndent = Math.min(...dashLines.map(l => l.match(/^(\s*)/)?.[1].length ?? 0))
    for (const line of lines) {
      const dashMatch = line.match(/^(\s*)([-–—])\s+(.+)/)
      if (dashMatch && dashMatch[1].length === minIndent) {
        if (current) exercises.push(current)
        const name = dashMatch[3].split(/\s+https?:\/\//)[0].trim()
        current = { name, lines: [line] }
        continue
      }
      if (current) current.lines.push(line)
    }
  } else {
    // Plain text: a line is an exercise header if it's non-empty, doesn't start with a date,
    // and isn't a continuation of session data (no colon-after-date pattern)
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        // Blank line — keep it under current exercise as separator
        if (current) current.lines.push(line)
        continue
      }
      const isDateLine = DATE_LINE_RE.test(trimmed)
      const isSessionLine = isDateLine || /^\d/.test(trimmed) // starts with month name or digit
      if (!isSessionLine) {
        // Looks like an exercise name
        if (current) exercises.push(current)
        const name = trimmed.split(/\s+https?:\/\//)[0]
        current = { name, lines: [line] }
        continue
      }
      if (current) current.lines.push(line)
    }
  }

  if (current) exercises.push(current)

  const chunks: Chunk[] = []
  let chunkNames: string[] = []
  let chunkLines: string[] = []
  let chunkSize = 0

  for (const ex of exercises) {
    const exText = ex.lines.join('\n')
    if (chunkSize + exText.length > MAX_CHUNK_CHARS && chunkLines.length > 0) {
      chunks.push({ exerciseNames: chunkNames, text: chunkLines.join('\n') })
      chunkNames = []
      chunkLines = []
      chunkSize = 0
    }
    chunkNames.push(ex.name)
    chunkLines.push(...ex.lines)
    chunkSize += exText.length + 1
  }
  if (chunkLines.length > 0) {
    chunks.push({ exerciseNames: chunkNames, text: chunkLines.join('\n') })
  }

  return chunks
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

export default function ImportPage() {
  const [step, setStep] = useState<Step>('paste')
  const [rawText, setRawText] = useState('')
  const [chunks, setChunks] = useState<Chunk[]>([])
  const [parseProgress, setParseProgress] = useState({ current: 0, total: 0 })
  const [exercises, setExercises] = useState<ParsedExercise[]>([])
  const [saving, setSaving] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [savedCount, setSavedCount] = useState(0)
  const [error, setError] = useState('')
  const supabase = createClient()

  function handlePrepare() {
    setError('')
    const prepared = splitIntoChunks(rawText)
    if (prepared.length === 0) {
      setError('No exercises found. Make sure exercise names start at the left margin with "- ".')
      return
    }
    setChunks(prepared)
    setStep('chunks')
  }

  async function handleParseWithAI() {
    setError('')
    setStep('parsing')
    setParseProgress({ current: 0, total: chunks.length })

    const allExercises: ParsedExercise[] = []

    for (let i = 0; i < chunks.length; i++) {
      setParseProgress({ current: i + 1, total: chunks.length })
      try {
        const res = await fetch('/api/parse-notes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rawNotes: chunks[i].text }),
        })
        const data = await res.json()
        if (!res.ok) {
          setError(`Chunk ${i + 1} failed: ${data.error}${data.detail ? ` — ${data.detail}` : ''}`)
          setStep('chunks')
          return
        }
        if (Array.isArray(data)) allExercises.push(...data)
      } catch (err) {
        setError(`Chunk ${i + 1} network error: ${String(err)}`)
        setStep('chunks')
        return
      }
    }

    setExercises(allExercises)
    setStep('preview')
  }

  async function handleClearData() {
    if (!confirm('This will delete ALL your workout sessions, sets, and body weight entries. Are you sure?')) return
    setClearing(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setClearing(false); return }

    await supabase.from('workout_sets').delete().neq('id', '00000000-0000-0000-0000-000000000000')
    await supabase.from('workout_sessions').delete().eq('user_id', user.id)
    await supabase.from('body_weight').delete().eq('user_id', user.id)
    setClearing(false)
    alert('All data cleared. You can now re-import.')
  }

  async function handleImport() {
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in'); setSaving(false); return }

    const { data: existingExercises } = await supabase.from('exercises').select('id, name')
    const existingMap: Record<string, string> = {}
    existingExercises?.forEach(e => { existingMap[e.name.toLowerCase()] = e.id })

    for (const ex of exercises) {
      const officialName = ex.official_name || ex.user_name
      const key = officialName.toLowerCase()
      const altKey = ex.user_name.toLowerCase()
      if (!existingMap[key] && !existingMap[altKey]) {
        const { data: created } = await supabase
          .from('exercises')
          .insert({ name: officialName, category: 'other' })
          .select().single()
        if (created) existingMap[key] = created.id
      } else {
        existingMap[key] = existingMap[key] || existingMap[altKey]
      }
    }

    let count = 0
    for (const ex of exercises) {
      const officialName = ex.official_name || ex.user_name
      const exerciseId = existingMap[officialName.toLowerCase()] || existingMap[ex.user_name.toLowerCase()]
      if (!exerciseId) continue

      const datedSessions = ex.sessions.filter(s => s.date)
      for (const session of datedSessions) {
        let sessionId: string
        const { data: existing } = await supabase
          .from('workout_sessions').select('id')
          .eq('user_id', user.id).eq('date', session.date!).single()

        if (existing) {
          sessionId = existing.id
        } else {
          const { data: created } = await supabase
            .from('workout_sessions')
            .insert({ user_id: user.id, date: session.date, notes: session.session_notes || null })
            .select().single()
          if (!created) continue
          sessionId = created.id
        }

        const setsToInsert = session.sets.map(s => ({
          session_id: sessionId,
          exercise_id: exerciseId,
          set_number: s.set_number,
          weight_lbs: s.weight_lbs,
          reps: s.reps,
          notes: session.injury_flag
            ? `⚠️ ${session.session_notes || 'injury/fatigue noted'}`
            : session.session_notes || null,
        }))

        if (setsToInsert.length > 0) {
          await supabase.from('workout_sets').insert(setsToInsert)
          count++
        }
      }
    }

    setSavedCount(count)
    setStep('done')
    setSaving(false)
  }

  if (step === 'done') {
    return (
      <div className="max-w-xl mx-auto text-center py-16 space-y-4">
        <div className="text-5xl">🎉</div>
        <h1 className="text-2xl font-bold">Import Complete!</h1>
        <p style={{ color: 'var(--muted)' }}>
          Imported {savedCount} exercise sessions across {exercises.length} exercises.
        </p>
        <a href="/dashboard"
          className="inline-block mt-4 px-6 py-2 rounded-lg text-white font-semibold"
          style={{ background: 'var(--accent)' }}>
          View Dashboard
        </a>
      </div>
    )
  }

  if (step === 'parsing') {
    return (
      <div className="max-w-xl mx-auto py-16 space-y-6 text-center">
        <div className="text-4xl animate-spin inline-block">⚙️</div>
        <h1 className="text-2xl font-bold">Parsing with AI...</h1>
        <p className="text-3xl font-bold" style={{ color: 'var(--accent)' }}>
          {parseProgress.current} / {parseProgress.total}
        </p>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          chunks sent to Gemini — each chunk is a batch of exercises
        </p>
      </div>
    )
  }

  if (step === 'chunks') {
    const totalExercises = chunks.reduce((sum, c) => sum + c.exerciseNames.length, 0)
    return (
      <div className="max-w-2xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Review Chunks</h1>
          <button onClick={() => setStep('paste')} className="text-sm" style={{ color: 'var(--muted)' }}>← Back</button>
        </div>

        <p className="text-sm" style={{ color: 'var(--muted)' }}>
          Found <strong style={{ color: 'var(--foreground)' }}>{totalExercises} exercises</strong> split into{' '}
          <strong style={{ color: 'var(--foreground)' }}>{chunks.length} chunk{chunks.length !== 1 ? 's' : ''}</strong>.
          Each chunk is one Gemini API call. Verify no exercise is cut in the middle, then parse.
        </p>

        <div className="space-y-3">
          {chunks.map((chunk, ci) => (
            <div key={ci} className="rounded-xl border overflow-hidden"
              style={{ borderColor: 'var(--card-border)', background: 'var(--card)' }}>
              <div className="px-4 py-3 flex items-center justify-between"
                style={{ borderBottom: '1px solid var(--card-border)' }}>
                <span className="font-semibold text-sm">Chunk {ci + 1}</span>
                <span className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--card-border)', color: 'var(--muted)' }}>
                  {chunk.exerciseNames.length} exercises · {Math.round(chunk.text.length / 1000)}k chars
                </span>
              </div>
              <div className="px-4 py-3 flex flex-wrap gap-1.5">
                {chunk.exerciseNames.map((name, ni) => (
                  <span key={ni} className="text-xs px-2 py-0.5 rounded-full border"
                    style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>
                    {name.length > 40 ? name.slice(0, 40) + '…' : name}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button onClick={handleParseWithAI}
          className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
          style={{ background: 'var(--accent)' }}>
          🤖 Parse {chunks.length} chunk{chunks.length !== 1 ? 's' : ''} with AI
        </button>
      </div>
    )
  }

  if (step === 'preview') {
    const totalSessions = exercises.reduce((sum, e) => sum + e.sessions.filter(s => s.date).length, 0)
    const skipped = exercises.reduce((sum, e) => sum + e.sessions.filter(s => !s.date).length, 0)
    const injuryCount = exercises.reduce((sum, e) => sum + e.sessions.filter(s => s.injury_flag).length, 0)

    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Review AI Import</h1>
          <button onClick={() => setStep('chunks')} className="text-sm" style={{ color: 'var(--muted)' }}>← Back</button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Exercises', exercises.length],
            ['Sessions', totalSessions],
            ['Injury flags', injuryCount],
            ['Skipped (no date)', skipped],
          ].map(([label, val]) => (
            <div key={label as string} className="rounded-xl border p-4 text-center"
              style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
              <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{val}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>{label}</p>
            </div>
          ))}
        </div>

        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          "Skipped" are "Week N" entries with no calendar date — can't be placed on a timeline.
        </p>

        <div className="space-y-3">
          {exercises.map((ex, ei) => {
            const dated = ex.sessions.filter(s => s.date)
            return (
              <div key={ei} className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--card-border)' }}>
                <div className="px-4 py-3 flex items-start justify-between gap-2"
                  style={{ background: 'var(--card)' }}>
                  <div>
                    <p className="font-semibold text-sm">{ex.official_name || ex.user_name}</p>
                    {ex.official_name && ex.official_name !== ex.user_name && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        Your name: &ldquo;{ex.user_name}&rdquo;
                      </p>
                    )}
                    {ex.youtube_urls?.length > 0 && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        📎 {ex.youtube_urls.length} YouTube link{ex.youtube_urls.length > 1 ? 's' : ''} saved
                      </p>
                    )}
                  </div>
                  <span className="text-xs shrink-0 px-2 py-0.5 rounded-full"
                    style={{ background: 'var(--card-border)', color: 'var(--muted)' }}>
                    {dated.length} sessions
                  </span>
                </div>

                {dated.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs" style={{ borderTop: '1px solid var(--card-border)' }}>
                      <thead>
                        <tr style={{ background: 'var(--background)', color: 'var(--muted)' }}>
                          <th className="text-left px-4 py-2 font-medium">Date</th>
                          <th className="text-right px-3 py-2 font-medium">Sets</th>
                          <th className="text-right px-3 py-2 font-medium">Max wt</th>
                          <th className="text-right px-3 py-2 font-medium">Avg reps</th>
                          <th className="text-left px-3 py-2 font-medium">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dated.map((s, si) => (
                          <tr key={si}
                            style={{
                              borderTop: '1px solid var(--card-border)',
                              background: s.injury_flag ? 'rgba(239,68,68,0.06)' : 'var(--card)',
                            }}>
                            <td className="px-4 py-2 font-medium"
                              style={{ color: s.injury_flag ? '#f87171' : 'var(--foreground)' }}>
                              {s.injury_flag ? '⚠️ ' : ''}{formatDate(s.date!)}
                            </td>
                            <td className="px-3 py-2 text-right" style={{ color: 'var(--muted)' }}>
                              {s.sets.length}
                            </td>
                            <td className="px-3 py-2 text-right font-medium" style={{ color: 'var(--accent)' }}>
                              {s.max_weight != null ? `${s.max_weight} lbs` : '—'}
                            </td>
                            <td className="px-3 py-2 text-right" style={{ color: 'var(--muted)' }}>
                              {s.avg_reps != null ? Number(s.avg_reps).toFixed(1) : '—'}
                            </td>
                            <td className="px-3 py-2" style={{ color: 'var(--muted)', maxWidth: 220 }}>
                              <span className="truncate block">{s.session_notes || ''}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button onClick={handleImport} disabled={saving}
          className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}>
          {saving ? 'Saving to database...' : `Import ${totalSessions} sessions`}
        </button>
      </div>
    )
  }

  // Paste step
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Import Workout Notes</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          Paste your Apple Notes text, then hit Prepare to split it into chunks automatically.
        </p>
      </div>

      <div className="rounded-xl border p-4 text-sm space-y-1"
        style={{ background: 'var(--card)', borderColor: 'var(--card-border)', color: 'var(--muted)' }}>
        <p className="font-medium" style={{ color: 'var(--foreground)' }}>Format tips</p>
        <p>• Exercise names must start at the left margin: <code className="text-xs px-1 rounded" style={{ background: 'var(--background)' }}>- Bench press</code></p>
        <p>• Session entries should be indented below them</p>
        <p>• The app will group exercises into chunks automatically before sending to AI</p>
      </div>

      <textarea
        value={rawText}
        onChange={e => setRawText(e.target.value)}
        rows={20}
        placeholder="Paste your workout notes here..."
        className="w-full px-4 py-3 rounded-xl border text-sm outline-none font-mono"
        style={{ background: 'var(--card)', borderColor: 'var(--card-border)', color: 'var(--foreground)', resize: 'vertical' }}
      />

      {error && <p className="text-red-400 text-sm">{error}</p>}

      <button
        onClick={handlePrepare}
        disabled={!rawText.trim()}
        className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-30"
        style={{ background: 'var(--accent)' }}>
        Prepare Notes →
      </button>

      <div className="rounded-xl border p-4 space-y-2"
        style={{ borderColor: '#3a1a1a', background: '#1a0f0f' }}>
        <p className="text-sm font-semibold text-red-400">Danger zone</p>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>
          If a previous import left bad data, clear everything and start fresh.
        </p>
        <button
          onClick={handleClearData}
          disabled={clearing}
          className="px-4 py-1.5 rounded-lg text-sm font-medium border border-red-800 text-red-400 disabled:opacity-50">
          {clearing ? 'Clearing...' : 'Clear all my workout data'}
        </button>
      </div>
    </div>
  )
}
