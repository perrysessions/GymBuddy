'use client'

import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { createClient } from '@/lib/supabase'

interface SetData {
  id: string
  set_number: number
  weight_lbs: number | null
  reps: number | null
  notes: string | null
}

interface SessionData {
  sessionId: string
  date: string
  sessionNotes: string | null
  sets: SetData[]
}

interface Props {
  exercise: { id: string; name: string; category: string }
  exerciseId: string
  sessions: SessionData[]
  progressData: { date: string; max_weight: number; total_reps: number; volume: number }[]
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })
}

const TOOLTIP = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 },
  labelStyle: { color: '#888' },
}

interface EditState {
  date: string
  sets: { id: string | null; set_number: number; weight_lbs: string; reps: string; notes: string }[]
}

function sessionToEditState(s: SessionData): EditState {
  return {
    date: s.date,
    sets: s.sets.map(set => ({
      id: set.id,
      set_number: set.set_number,
      weight_lbs: set.weight_lbs != null ? String(set.weight_lbs) : '',
      reps: set.reps != null ? String(set.reps) : '',
      notes: set.notes ?? '',
    })),
  }
}

export default function ExerciseDetailClient({ exercise, exerciseId, sessions: initialSessions, progressData: initialProgress }: Props) {
  const [chart, setChart] = useState<'weight' | 'volume'>('weight')
  const [sessions, setSessions] = useState<SessionData[]>(initialSessions)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  // Bulk select state
  const [bulkMode, setBulkMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkYear, setBulkYear] = useState(String(new Date().getFullYear()))
  const [bulkSaving, setBulkSaving] = useState(false)
  const supabase = createClient()

  const progressData = sessions.map(s => ({
    date: s.date,
    max_weight: Math.max(0, ...s.sets.map(set => parseFloat(String(set.weight_lbs)) || 0)),
    total_reps: s.sets.reduce((sum, set) => sum + (parseFloat(String(set.reps)) || 0), 0),
    volume: s.sets.reduce((sum, set) => sum + (parseFloat(String(set.weight_lbs)) || 0) * (parseFloat(String(set.reps)) || 0), 0),
  }))

  const pr = progressData.length > 0 ? Math.max(...progressData.map(d => d.max_weight)) : null

  function toggleBulkMode() {
    setBulkMode(b => !b)
    setSelected(new Set())
    setEditingId(null)
    setEditState(null)
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(sessions.map(s => s.sessionId)))
  }

  async function applyBulkYear() {
    if (selected.size === 0) return
    setBulkSaving(true)
    setError('')
    for (const sessionId of selected) {
      const session = sessions.find(s => s.sessionId === sessionId)
      if (!session) continue
      const newDate = bulkYear + session.date.slice(4) // replace YYYY, keep -MM-DD
      const { error: e } = await supabase
        .from('workout_sessions')
        .update({ date: newDate })
        .eq('id', sessionId)
      if (e) { setError(e.message); setBulkSaving(false); return }
    }
    // Update local state
    setSessions(prev => prev.map(s =>
      selected.has(s.sessionId)
        ? { ...s, date: bulkYear + s.date.slice(4) }
        : s
    ).sort((a, b) => a.date.localeCompare(b.date)))
    setSelected(new Set())
    setBulkMode(false)
    setBulkSaving(false)
  }

  function startEdit(s: SessionData) {
    setEditingId(s.sessionId)
    setEditState(sessionToEditState(s))
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditState(null)
    setError('')
  }

  function updateSet(i: number, field: 'weight_lbs' | 'reps' | 'notes', value: string) {
    if (!editState) return
    const sets = [...editState.sets]
    sets[i] = { ...sets[i], [field]: value }
    setEditState({ ...editState, sets })
  }

  function removeSet(i: number) {
    if (!editState) return
    setEditState({ ...editState, sets: editState.sets.filter((_, idx) => idx !== i) })
  }

  function addSet() {
    if (!editState) return
    const last = editState.sets[editState.sets.length - 1]
    setEditState({
      ...editState,
      sets: [...editState.sets, {
        id: null,
        set_number: (last?.set_number ?? 0) + 1,
        weight_lbs: last?.weight_lbs ?? '',
        reps: '',
        notes: '',
      }],
    })
  }

  async function saveEdit(sessionId: string) {
    if (!editState) return
    setSaving(true)
    setError('')

    // Update session date if changed
    const original = sessions.find(s => s.sessionId === sessionId)!
    if (editState.date !== original.date) {
      const { error: e } = await supabase
        .from('workout_sessions')
        .update({ date: editState.date })
        .eq('id', sessionId)
      if (e) { setError(e.message); setSaving(false); return }
    }

    // Delete sets that were removed
    const keptIds = new Set(editState.sets.map(s => s.id).filter(Boolean))
    const deletedIds = original.sets.map(s => s.id).filter(id => !keptIds.has(id))
    if (deletedIds.length > 0) {
      const { error: e } = await supabase.from('workout_sets').delete().in('id', deletedIds)
      if (e) { setError(e.message); setSaving(false); return }
    }

    // Upsert each set
    for (let i = 0; i < editState.sets.length; i++) {
      const s = editState.sets[i]
      const payload = {
        session_id: sessionId,
        exercise_id: exerciseId,
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

    // Re-fetch updated sets for this session
    const { data: freshSets } = await supabase
      .from('workout_sets')
      .select('id, set_number, weight_lbs, reps, notes')
      .eq('session_id', sessionId)
      .eq('exercise_id', exerciseId)
      .order('set_number', { ascending: true })

    setSessions(prev => prev.map(s => s.sessionId === sessionId
      ? { ...s, date: editState.date, sets: freshSets ?? [] }
      : s
    ).sort((a, b) => a.date.localeCompare(b.date)))

    setEditingId(null)
    setEditState(null)
    setSaving(false)
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <p className="text-xs uppercase mb-1" style={{ color: 'var(--muted)' }}>{exercise.category}</p>
        <h1 className="text-2xl font-bold">{exercise.name}</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          {sessions.length} sessions
          {pr ? <span> · PR: <span style={{ color: 'var(--accent)' }}>{pr} lbs</span></span> : null}
        </p>
      </div>

      {progressData.length > 1 && (
        <div className="rounded-xl border p-5" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
          <div className="flex gap-2 mb-4">
            {(['weight', 'volume'] as const).map(c => (
              <button key={c} onClick={() => setChart(c)}
                className="px-3 py-1 rounded-lg text-xs font-medium transition-colors"
                style={{ background: chart === c ? 'var(--accent)' : 'var(--background)', color: chart === c ? '#fff' : 'var(--muted)' }}>
                {c === 'weight' ? 'Max Weight' : 'Volume (lbs×reps)'}
              </button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={progressData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip {...TOOLTIP} labelFormatter={(d: any) => formatDate(d)}
                formatter={(v: any) => [chart === 'weight' ? `${v} lbs` : Number(v).toLocaleString(), chart === 'weight' ? 'Max weight' : 'Volume']} />
              <Line type="monotone" dataKey={chart === 'weight' ? 'max_weight' : 'volume'}
                stroke="var(--accent)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Bulk year toolbar */}
      <div className="flex items-center justify-between gap-3">
        <button onClick={toggleBulkMode}
          className="text-xs px-3 py-1.5 rounded-lg border transition-colors"
          style={{ borderColor: 'var(--card-border)', color: bulkMode ? 'var(--accent)' : 'var(--muted)', background: bulkMode ? 'rgba(232,93,4,0.1)' : 'transparent' }}>
          {bulkMode ? 'Cancel bulk edit' : 'Bulk edit years'}
        </button>
        {bulkMode && (
          <div className="flex items-center gap-2 flex-1">
            <button onClick={selectAll} className="text-xs" style={{ color: 'var(--muted)' }}>
              Select all
            </button>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>·</span>
            <span className="text-xs" style={{ color: 'var(--muted)' }}>{selected.size} selected</span>
            <input
              type="number"
              value={bulkYear}
              onChange={e => setBulkYear(e.target.value)}
              className="w-20 px-2 py-1 rounded-lg border text-sm outline-none ml-auto"
              style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
              placeholder="Year"
            />
            <button
              onClick={applyBulkYear}
              disabled={selected.size === 0 || bulkSaving}
              className="px-3 py-1 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}>
              {bulkSaving ? 'Saving...' : 'Apply'}
            </button>
          </div>
        )}
      </div>
      {error && <p className="text-red-400 text-xs">{error}</p>}

      <div className="space-y-3">
        {[...sessions].reverse().map((s) => {
          const isEditing = editingId === s.sessionId

          if (isEditing && editState) {
            return (
              <div key={s.sessionId} className="rounded-xl border p-4 space-y-3"
                style={{ background: 'var(--card)', borderColor: 'var(--accent)' }}>
                {/* Date */}
                <div className="flex items-center gap-2">
                  <label className="text-xs font-medium w-10" style={{ color: 'var(--muted)' }}>Date</label>
                  <input
                    type="date"
                    value={editState.date}
                    onChange={e => setEditState({ ...editState, date: e.target.value })}
                    className="px-2 py-1 rounded-lg border text-sm outline-none"
                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
                  />
                </div>

                {/* Sets */}
                <div className="space-y-2">
                  <div className="grid text-xs font-medium pb-1" style={{ color: 'var(--muted)', gridTemplateColumns: '28px 1fr 1fr 1fr 28px' }}>
                    <span>#</span><span>Weight (lbs)</span><span>Reps</span><span>Notes</span><span />
                  </div>
                  {editState.sets.map((set, i) => (
                    <div key={i} className="grid items-center gap-1.5" style={{ gridTemplateColumns: '28px 1fr 1fr 1fr 28px' }}>
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>{i + 1}</span>
                      <input
                        type="number" step="0.5" placeholder="lbs"
                        value={set.weight_lbs}
                        onChange={e => updateSet(i, 'weight_lbs', e.target.value)}
                        className="px-2 py-1.5 rounded-lg border text-sm outline-none w-full"
                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
                      />
                      <input
                        type="number" step="0.5" placeholder="reps"
                        value={set.reps}
                        onChange={e => updateSet(i, 'reps', e.target.value)}
                        className="px-2 py-1.5 rounded-lg border text-sm outline-none w-full"
                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
                      />
                      <input
                        type="text" placeholder="notes"
                        value={set.notes}
                        onChange={e => updateSet(i, 'notes', e.target.value)}
                        className="px-2 py-1.5 rounded-lg border text-sm outline-none w-full"
                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
                      />
                      <button onClick={() => removeSet(i)}
                        className="text-red-400 text-lg leading-none hover:text-red-300">×</button>
                    </div>
                  ))}
                </div>

                <button onClick={addSet}
                  className="text-sm px-3 py-1 rounded-lg border"
                  style={{ borderColor: 'var(--card-border)', color: 'var(--accent)' }}>
                  + Add set
                </button>

                {error && <p className="text-red-400 text-xs">{error}</p>}

                <div className="flex gap-2 pt-1">
                  <button onClick={() => saveEdit(s.sessionId)} disabled={saving}
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
            )
          }

          const isSelected = selected.has(s.sessionId)
          return (
            <div key={s.sessionId} className="rounded-xl border p-4"
              style={{ background: 'var(--card)', borderColor: isSelected ? 'var(--accent)' : 'var(--card-border)' }}>
              <div className="flex items-center justify-between mb-2 gap-2">
                {bulkMode && (
                  <input type="checkbox" checked={isSelected}
                    onChange={() => toggleSelect(s.sessionId)}
                    className="w-4 h-4 shrink-0 cursor-pointer accent-orange-500" />
                )}
                <p className="text-sm font-semibold flex-1">{formatDate(s.date)}</p>
                {!bulkMode && (
                  <button onClick={() => startEdit(s)}
                    className="text-xs px-2.5 py-1 rounded-lg border transition-colors hover:opacity-80"
                    style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>
                    Edit
                  </button>
                )}
              </div>
              {s.sessionNotes && (
                <p className="text-xs mb-2 italic" style={{ color: 'var(--muted)' }}>📝 {s.sessionNotes}</p>
              )}
              <div className="space-y-1">
                {s.sets.sort((a, b) => a.set_number - b.set_number).map((set, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-12 text-xs" style={{ color: 'var(--muted)' }}>Set {set.set_number}</span>
                    {set.weight_lbs != null && (
                      <span className="font-medium" style={{ color: 'var(--accent)' }}>{set.weight_lbs} lbs</span>
                    )}
                    {set.reps != null && (
                      <span style={{ color: 'var(--foreground)' }}>× {set.reps} reps</span>
                    )}
                    {set.notes && (
                      <span className="text-xs" style={{ color: 'var(--muted)' }}>{set.notes}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
