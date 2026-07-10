'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'

interface SetData {
  id: string
  set_number: number
  weight_lbs: number | null
  reps: number | null
  notes: string | null
}

interface ExerciseData {
  exerciseId: string
  name: string
  sets: SetData[]
}

interface Props {
  session: { id: string; date: string; notes: string | null }
  exercises: ExerciseData[]
  compliments: string[]
  bodyWeight: number | null
}

interface EditSetRow {
  id: string | null
  weight_lbs: string
  reps: string
  notes: string
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default function SessionClient({ session, exercises: initialExercises, compliments, bodyWeight }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [exercises, setExercises] = useState<ExerciseData[]>(initialExercises)
  const [editingExId, setEditingExId] = useState<string | null>(null)
  const [editSets, setEditSets] = useState<EditSetRow[]>([])
  const [saving, setSaving] = useState(false)
  const [deletingExId, setDeletingExId] = useState<string | null>(null)
  const [showDeleteSession, setShowDeleteSession] = useState(false)
  const [deletingSession, setDeletingSession] = useState(false)
  const [showMerge, setShowMerge] = useState(false)
  const [mergeSessions, setMergeSessions] = useState<{ id: string; date: string; notes: string | null; exercise_names: string[] }[]>([])
  const [mergeTarget, setMergeTarget] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)
  const [error, setError] = useState('')

  function startEdit(ex: ExerciseData) {
    setEditingExId(ex.exerciseId)
    setEditSets(ex.sets.map(s => ({
      id: s.id,
      weight_lbs: s.weight_lbs != null ? String(s.weight_lbs) : '',
      reps: s.reps != null ? String(s.reps) : '',
      notes: s.notes ?? '',
    })))
    setError('')
  }

  function cancelEdit() {
    setEditingExId(null)
    setEditSets([])
    setError('')
  }

  function updateEditSet(i: number, field: 'weight_lbs' | 'reps' | 'notes', value: string) {
    setEditSets(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s))
  }

  function addEditSet() {
    const last = editSets[editSets.length - 1]
    setEditSets(prev => [...prev, { id: null, weight_lbs: last?.weight_lbs ?? '', reps: '', notes: '' }])
  }

  function removeEditSet(i: number) {
    setEditSets(prev => prev.filter((_, idx) => idx !== i))
  }

  async function saveEdit(ex: ExerciseData) {
    setSaving(true)
    setError('')
    // Delete removed sets
    const keptIds = new Set(editSets.map(s => s.id).filter(Boolean))
    const deletedIds = ex.sets.map(s => s.id).filter(id => !keptIds.has(id))
    if (deletedIds.length > 0) {
      const { error: e } = await supabase.from('workout_sets').delete().in('id', deletedIds)
      if (e) { setError(e.message); setSaving(false); return }
    }
    // Upsert each set
    for (let i = 0; i < editSets.length; i++) {
      const s = editSets[i]
      const payload = {
        session_id: session.id,
        exercise_id: ex.exerciseId,
        set_number: i + 1,
        weight_lbs: s.weight_lbs !== '' ? parseFloat(s.weight_lbs) : null,
        reps: s.reps !== '' ? parseFloat(s.reps) : null,
        notes: s.notes || null,
      }
      if (s.id) {
        const { error: e } = await supabase.from('workout_sets').update(payload).eq('id', s.id)
        if (e) { setError(e.message); setSaving(false); return }
      } else {
        const { error: e } = await supabase.from('workout_sets').insert(payload)
        if (e) { setError(e.message); setSaving(false); return }
      }
    }
    // Re-fetch updated sets
    const { data: fresh } = await supabase
      .from('workout_sets')
      .select('id, set_number, weight_lbs, reps, notes')
      .eq('session_id', session.id)
      .eq('exercise_id', ex.exerciseId)
      .order('set_number', { ascending: true })
    setExercises(prev => prev.map(e => e.exerciseId === ex.exerciseId ? { ...e, sets: fresh ?? [] } : e))
    setEditingExId(null)
    setEditSets([])
    setSaving(false)
  }

  async function deleteExercise(ex: ExerciseData) {
    setDeletingExId(ex.exerciseId)
    const { error: e } = await supabase
      .from('workout_sets')
      .delete()
      .eq('session_id', session.id)
      .eq('exercise_id', ex.exerciseId)
    if (e) { setError(e.message); setDeletingExId(null); return }
    setExercises(prev => prev.filter(e => e.exerciseId !== ex.exerciseId))
    setDeletingExId(null)
  }

  async function openMerge() {
    setError('')
    const { data } = await supabase
      .from('workout_sessions')
      .select('id, date, notes')
      .eq('date', session.date)
      .neq('id', session.id)
      .order('id', { ascending: true })
    if (!data || data.length === 0) {
      setError('No other workouts found on this date to merge into.')
      return
    }
    // Get exercise counts for each candidate
    const withCounts = await Promise.all(data.map(async s => {
      const { data: rows } = await supabase
        .from('workout_sets')
        .select('exercise_id, exercises(name)')
        .eq('session_id', s.id)
      const seen = new Set<string>()
      const names: string[] = []
      for (const r of rows ?? []) {
        if (!seen.has(r.exercise_id)) {
          seen.add(r.exercise_id)
          const n = (r.exercises as { name: string } | null)?.name
          if (n) names.push(n)
        }
      }
      return { ...s, exercise_names: names, date: s.date }
    }))
    setMergeSessions(withCounts)
    setMergeTarget(withCounts[0]?.id ?? null)
    setShowMerge(true)
  }

  async function mergeSession() {
    if (!mergeTarget) return
    setMerging(true)
    setError('')
    const { error: e } = await supabase
      .from('workout_sets')
      .update({ session_id: mergeTarget })
      .eq('session_id', session.id)
    if (e) { setError(e.message); setMerging(false); return }
    await supabase.from('workout_sessions').delete().eq('id', session.id)
    router.push(`/session/${mergeTarget}`)
    router.refresh()
  }

  async function deleteSession() {
    setDeletingSession(true)
    // Delete sets first, then session
    await supabase.from('workout_sets').delete().eq('session_id', session.id)
    const { error: e } = await supabase.from('workout_sessions').delete().eq('id', session.id)
    if (e) { setError(e.message); setDeletingSession(false); return }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link href="/dashboard" className="text-sm mb-2 inline-block" style={{ color: 'var(--muted)' }}>
            ← Dashboard
          </Link>
          <h1 className="text-2xl font-bold">{formatDate(session.date)}</h1>
          {session.notes && (
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>{session.notes}</p>
          )}
          {bodyWeight && (
            <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>⚖️ {bodyWeight} lbs that day</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div className="text-right">
            <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{exercises.length}</p>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>exercises</p>
          </div>
          <button
            onClick={openMerge}
            className="text-xs px-3 py-1.5 rounded-lg border"
            style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>
            Merge into...
          </button>
          <button
            onClick={() => setShowDeleteSession(true)}
            className="text-xs px-3 py-1.5 rounded-lg border"
            style={{ borderColor: '#ef4444', color: '#ef4444' }}>
            Delete workout
          </button>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {/* Compliments */}
      {compliments.length > 0 && (
        <div className="rounded-xl border p-4 space-y-2"
          style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
          {compliments.map((c, i) => (
            <p key={i} className="text-sm font-medium">{c}</p>
          ))}
        </div>
      )}

      {/* Exercises */}
      {exercises.map(ex => {
        const maxWeight = Math.max(...ex.sets.map(s => s.weight_lbs ?? 0))
        const totalReps = ex.sets.reduce((sum, s) => sum + (s.reps ?? 0), 0)
        const hasInjury = ex.sets.some(s => s.notes?.includes('⚠️'))
        const isEditing = editingExId === ex.exerciseId

        return (
          <div key={ex.exerciseId} className="rounded-xl border overflow-hidden"
            style={{ background: 'var(--card)', borderColor: hasInjury ? '#7f1d1d' : isEditing ? 'var(--accent)' : 'var(--card-border)' }}>

            {/* Exercise header */}
            <div className="px-4 py-3 flex items-center justify-between gap-2"
              style={{ borderBottom: '1px solid var(--card-border)' }}>
              <Link href={`/exercise/${ex.exerciseId}`}
                className="font-semibold text-sm hover:underline flex-1">
                {hasInjury ? '⚠️ ' : ''}{ex.name}
              </Link>
              <div className="flex items-center gap-3 text-xs shrink-0" style={{ color: 'var(--muted)' }}>
                <span><strong style={{ color: 'var(--accent)' }}>{maxWeight}</strong> lbs max</span>
                <span><strong style={{ color: 'var(--foreground)' }}>{totalReps}</strong> reps</span>
                <span><strong style={{ color: 'var(--foreground)' }}>{ex.sets.length}</strong> sets</span>
                {!isEditing && (
                  <>
                    <button onClick={() => startEdit(ex)}
                      className="px-2.5 py-1 rounded-lg border ml-1"
                      style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>
                      Edit
                    </button>
                    <button
                      onClick={() => deleteExercise(ex)}
                      disabled={deletingExId === ex.exerciseId}
                      className="px-2.5 py-1 rounded-lg border disabled:opacity-50"
                      style={{ borderColor: 'var(--card-border)', color: '#ef4444' }}>
                      {deletingExId === ex.exerciseId ? '…' : 'Delete'}
                    </button>
                  </>
                )}
              </div>
            </div>

            {isEditing ? (
              <div className="p-4 space-y-3">
                <div className="grid text-xs font-medium pb-1" style={{ color: 'var(--muted)', gridTemplateColumns: '28px 1fr 1fr 1fr 28px' }}>
                  <span>#</span><span>Weight (lbs)</span><span>Reps</span><span>Notes</span><span />
                </div>
                {editSets.map((s, i) => (
                  <div key={i} className="grid items-center gap-1.5" style={{ gridTemplateColumns: '28px 1fr 1fr 1fr 28px' }}>
                    <span className="text-xs" style={{ color: 'var(--muted)' }}>{i + 1}</span>
                    <input type="number" step="0.5" placeholder="lbs" value={s.weight_lbs}
                      onChange={e => updateEditSet(i, 'weight_lbs', e.target.value)}
                      className="px-2 py-1.5 rounded-lg border text-sm outline-none w-full"
                      style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
                    <input type="number" step="0.5" placeholder="reps" value={s.reps}
                      onChange={e => updateEditSet(i, 'reps', e.target.value)}
                      className="px-2 py-1.5 rounded-lg border text-sm outline-none w-full"
                      style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
                    <input type="text" placeholder="notes" value={s.notes}
                      onChange={e => updateEditSet(i, 'notes', e.target.value)}
                      className="px-2 py-1.5 rounded-lg border text-sm outline-none w-full"
                      style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
                    <button onClick={() => removeEditSet(i)} className="text-red-400 text-lg leading-none">×</button>
                  </div>
                ))}
                <button onClick={addEditSet}
                  className="text-sm px-3 py-1 rounded-lg border"
                  style={{ borderColor: 'var(--card-border)', color: 'var(--accent)' }}>
                  + Add set
                </button>
                {error && <p className="text-red-400 text-xs">{error}</p>}
                <div className="flex gap-2 pt-1">
                  <button onClick={() => saveEdit(ex)} disabled={saving}
                    className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: 'var(--accent)' }}>
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={cancelEdit} disabled={saving}
                    className="px-4 py-1.5 rounded-lg text-sm border"
                    style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: 'var(--background)', color: 'var(--muted)' }}>
                    <th className="text-left px-4 py-2 font-medium">Set</th>
                    <th className="text-right px-3 py-2 font-medium">Weight</th>
                    <th className="text-right px-3 py-2 font-medium">Reps</th>
                    <th className="text-left px-3 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {ex.sets.map((s, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--card-border)' }}>
                      <td className="px-4 py-1.5" style={{ color: 'var(--muted)' }}>{s.set_number}</td>
                      <td className="px-3 py-1.5 text-right font-medium" style={{ color: 'var(--accent)' }}>
                        {s.weight_lbs != null ? `${s.weight_lbs} lbs` : '—'}
                      </td>
                      <td className="px-3 py-1.5 text-right" style={{ color: 'var(--foreground)' }}>
                        {s.reps != null ? s.reps : '—'}
                      </td>
                      <td className="px-3 py-1.5" style={{ color: 'var(--muted)', maxWidth: 200 }}>
                        <span className="truncate block">{s.notes || ''}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )
      })}

      {/* Merge session modal */}
      {showMerge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowMerge(false)} />
          <div className="relative rounded-2xl border p-6 w-full max-w-sm space-y-4"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
            <h3 className="text-base font-semibold">Merge into another workout</h3>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              All sets from <strong>{formatDate(session.date)}</strong> will be moved into the selected workout, then this one will be deleted.
            </p>
            <div className="space-y-2">
              {mergeSessions.map(s => (
                <label key={s.id} className="flex items-start gap-3 p-3 rounded-xl border cursor-pointer"
                  style={{ borderColor: mergeTarget === s.id ? 'var(--accent)' : 'var(--card-border)', background: 'var(--background)' }}>
                  <input type="radio" name="merge-target" value={s.id} checked={mergeTarget === s.id}
                    onChange={() => setMergeTarget(s.id)} className="accent-orange-500 mt-0.5 shrink-0" />
                  <span className="text-sm">
                    <span className="font-semibold block">{formatDate(s.date)}{s.notes ? ` · ${s.notes}` : ''}</span>
                    <span style={{ color: 'var(--muted)' }}>{s.exercise_names.length} exercise{s.exercise_names.length !== 1 ? 's' : ''}: {s.exercise_names.join(', ')}</span>
                  </span>
                </label>
              ))}
            </div>
            {error && <p className="text-red-400 text-xs">{error}</p>}
            <div className="flex gap-3">
              <button onClick={() => setShowMerge(false)}
                className="flex-1 py-2 rounded-xl border text-sm font-medium"
                style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>
                Cancel
              </button>
              <button onClick={mergeSession} disabled={merging || !mergeTarget}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}>
                {merging ? 'Merging...' : 'Merge'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete session confirmation */}
      {showDeleteSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setShowDeleteSession(false)} />
          <div className="relative rounded-2xl border p-6 w-full max-w-sm space-y-4"
            style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
            <h3 className="text-base font-semibold">Delete this workout?</h3>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              This will permanently delete the <strong>{formatDate(session.date)}</strong> workout and all its sets. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteSession(false)}
                className="flex-1 py-2 rounded-xl border text-sm font-medium"
                style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>
                Cancel
              </button>
              <button onClick={deleteSession} disabled={deletingSession}
                className="flex-1 py-2 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: '#ef4444' }}>
                {deletingSession ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
