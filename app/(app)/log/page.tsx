'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'

interface Exercise { id: string; name: string; category: string }
interface SetEntry { weight: string; reps: string; notes: string }
interface ExerciseEntry { exerciseId: string; exerciseName: string; sets: SetEntry[] }

const emptySet = (): SetEntry => ({ weight: '', reps: '', notes: '' })

export default function LogPage() {
  const supabase = createClient()
  const searchParams = useSearchParams()
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [sessionNotes, setSessionNotes] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [entries, setEntries] = useState<ExerciseEntry[]>([])
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [newSession, setNewSession] = useState(false)

  useEffect(() => {
    supabase.from('exercises').select('id, name, category').order('name')
      .then(({ data }) => {
        const list = data ?? []
        setExercises(list)
        // Pre-populate from ?exercise= query param
        const preId = searchParams.get('exercise')
        if (preId) {
          const ex = list.find((e: Exercise) => e.id === preId)
          if (ex) setEntries([{ exerciseId: ex.id, exerciseName: ex.name, sets: [emptySet()] }])
        }
      })
  }, [])

  const filteredExercises = exercises.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase())
  )

  function addExercise(ex: Exercise) {
    setEntries(prev => [...prev, { exerciseId: ex.id, exerciseName: ex.name, sets: [emptySet()] }])
    setSearch('')
    setShowSearch(false)
  }

  async function createNewExercise() {
    const name = search.trim()
    if (!name) return
    const { data, error } = await supabase.from('exercises')
      .insert({ name, category: 'other' }).select().single()
    if (data) {
      setExercises(prev => [...prev, data])
      addExercise(data)
    } else {
      setError(error?.message ?? 'Failed to create exercise')
    }
  }

  function updateSet(entryIdx: number, setIdx: number, field: keyof SetEntry, value: string) {
    setEntries(prev => prev.map((e, ei) =>
      ei !== entryIdx ? e : {
        ...e,
        sets: e.sets.map((s, si) => si !== setIdx ? s : { ...s, [field]: value })
      }
    ))
  }

  function addSet(entryIdx: number) {
    setEntries(prev => prev.map((e, i) =>
      i !== entryIdx ? e : { ...e, sets: [...e.sets, emptySet()] }
    ))
  }

  function removeEntry(entryIdx: number) {
    setEntries(prev => prev.filter((_, i) => i !== entryIdx))
  }

  async function save() {
    setSaving(true)
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setError('Not logged in'); setSaving(false); return }

    let sessionId: string

    if (!newSession) {
      // Try to find an existing session for this date
      const { data: existing } = await supabase
        .from('workout_sessions')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', date)
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

      if (existing) {
        sessionId = existing.id
        // Append session notes if provided
        if (sessionNotes) {
          await supabase.from('workout_sessions').update({ notes: sessionNotes }).eq('id', sessionId)
        }
      } else {
        const { data: session, error: sessionErr } = await supabase
          .from('workout_sessions')
          .insert({ user_id: user.id, date, notes: sessionNotes || null })
          .select().single()
        if (sessionErr || !session) { setError(sessionErr?.message ?? 'Failed to save session'); setSaving(false); return }
        sessionId = session.id
      }
    } else {
      const { data: session, error: sessionErr } = await supabase
        .from('workout_sessions')
        .insert({ user_id: user.id, date, notes: sessionNotes || null })
        .select().single()
      if (sessionErr || !session) { setError(sessionErr?.message ?? 'Failed to save session'); setSaving(false); return }
      sessionId = session.id
    }

    // Find the max set_number already in this session for each exercise, then append
    const setsToInsert = entries.flatMap(entry =>
      entry.sets.map((s, i) => ({
        session_id: sessionId,
        exercise_id: entry.exerciseId,
        set_number: i + 1,
        weight_lbs: s.weight ? parseFloat(s.weight) : null,
        reps: s.reps ? parseFloat(s.reps) : null,
        notes: s.notes || null,
      }))
    )

    if (setsToInsert.length > 0) {
      const { error: setsErr } = await supabase.from('workout_sets').insert(setsToInsert)
      if (setsErr) { setError(setsErr.message); setSaving(false); return }
    }

    setSaved(true)
    setEntries([])
    setSessionNotes('')
    setSaving(false)
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <h1 className="text-2xl font-bold">Log Workout</h1>

      {saved && <p className="text-green-400 text-sm">✓ Workout saved!</p>}
      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Date + session notes */}
      <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Date</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg border text-sm outline-none"
            style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
        </div>
        <div>
          <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Session notes (optional)</label>
          <input type="text" value={sessionNotes} onChange={e => setSessionNotes(e.target.value)}
            placeholder="e.g. felt tired, after leg day, wrist brace..."
            className="w-full px-3 py-1.5 rounded-lg border text-sm outline-none"
            style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={newSession}
            onChange={e => setNewSession(e.target.checked)}
            className="w-4 h-4 accent-orange-500"
          />
          <span className="text-xs" style={{ color: 'var(--muted)' }}>
            New separate session (creates a second workout entry for this date)
          </span>
        </label>
      </div>

      {/* Exercise entries */}
      {entries.map((entry, ei) => (
        <div key={ei} className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="font-semibold text-sm">{entry.exerciseName}</p>
            <button onClick={() => removeEntry(ei)} className="text-xs" style={{ color: 'var(--muted)' }}>Remove</button>
          </div>

          <div className="space-y-2">
            {entry.sets.map((set, si) => (
              <div key={si} className="flex gap-2 items-center">
                <span className="text-xs w-8 shrink-0 text-right" style={{ color: 'var(--muted)' }}>S{si + 1}</span>
                <input
                  type="number" step="0.5" placeholder="lbs" value={set.weight}
                  onChange={e => updateSet(ei, si, 'weight', e.target.value)}
                  className="w-20 px-2 py-1.5 rounded-lg border text-sm outline-none text-center"
                  style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
                />
                <span className="text-xs" style={{ color: 'var(--muted)' }}>×</span>
                <input
                  type="number" step="0.5" placeholder="reps" value={set.reps}
                  onChange={e => updateSet(ei, si, 'reps', e.target.value)}
                  className="w-20 px-2 py-1.5 rounded-lg border text-sm outline-none text-center"
                  style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
                />
                <input
                  type="text" placeholder="note" value={set.notes}
                  onChange={e => updateSet(ei, si, 'notes', e.target.value)}
                  className="flex-1 px-2 py-1.5 rounded-lg border text-sm outline-none"
                  style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
                />
              </div>
            ))}
          </div>
          <button onClick={() => addSet(ei)}
            className="mt-3 text-xs px-3 py-1 rounded-lg border"
            style={{ borderColor: 'var(--card-border)', color: 'var(--accent)' }}>
            + Add set
          </button>
        </div>
      ))}

      {/* Add exercise */}
      <div className="rounded-xl border p-4" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
        {showSearch ? (
          <div>
            <input
              autoFocus
              type="text" placeholder="Search or type new exercise name..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none mb-2"
              style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
            />
            <div className="max-h-48 overflow-y-auto space-y-1">
              {filteredExercises.slice(0, 8).map(ex => (
                <button key={ex.id} onClick={() => addExercise(ex)}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-sm transition-colors hover:opacity-80"
                  style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
                  {ex.name}
                </button>
              ))}
              {search.trim() && !exercises.find(e => e.name.toLowerCase() === search.toLowerCase()) && (
                <button onClick={createNewExercise}
                  className="w-full text-left px-3 py-1.5 rounded-lg text-sm"
                  style={{ color: 'var(--accent)' }}>
                  + Create &ldquo;{search.trim()}&rdquo;
                </button>
              )}
            </div>
            <button onClick={() => setShowSearch(false)} className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>Cancel</button>
          </div>
        ) : (
          <button onClick={() => setShowSearch(true)}
            className="w-full text-sm font-medium py-1"
            style={{ color: 'var(--accent)' }}>
            + Add exercise
          </button>
        )}
      </div>

      {entries.length > 0 && (
        <button onClick={save} disabled={saving}
          className="w-full py-3 rounded-xl font-semibold text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}>
          {saving ? 'Saving...' : 'Save Workout'}
        </button>
      )}
    </div>
  )
}
