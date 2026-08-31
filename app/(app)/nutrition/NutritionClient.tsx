'use client'

import { useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'

interface Log {
  id: string
  food: string
  calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fat_g: number | null
}

interface HistoryRow { date: string; calories: number | null; protein_g: number | null }

interface Props {
  todayLogs: Log[]
  history: HistoryRow[]
  today: string
  calorieTarget: number
  proteinTarget: number
}

function ProgressBar({ value, target, color }: { value: number; target: number; color: string }) {
  const pct = Math.min(100, Math.round((value / target) * 100))
  return (
    <div className="w-full rounded-full h-2" style={{ background: 'var(--background)' }}>
      <div className="h-2 rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

const EMPTY = { food: '', calories: '', protein: '', carbs: '', fat: '' }

export default function NutritionClient({ todayLogs: initial, history: initialHistory, today, calorieTarget, proteinTarget }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const [selectedDate, setSelectedDate] = useState(today)
  const [logs, setLogs] = useState<Log[]>(initial)
  const [historyRows, setHistoryRows] = useState<HistoryRow[]>(initialHistory)
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState(EMPTY)
  const [saving, setSaving] = useState(false)
  const [loadingDate, setLoadingDate] = useState(false)
  const [error, setError] = useState('')
  const [showTargets, setShowTargets] = useState(false)
  const [calTarget, setCalTarget] = useState(String(calorieTarget))
  const [proTarget, setProTarget] = useState(String(proteinTarget))
  const [savingTargets, setSavingTargets] = useState(false)
  const [, startTransition] = useTransition()

  const totalCal = logs.reduce((s, l) => s + (l.calories ?? 0), 0)
  const totalPro = logs.reduce((s, l) => s + (l.protein_g ?? 0), 0)
  const totalCarbs = logs.reduce((s, l) => s + (l.carbs_g ?? 0), 0)
  const totalFat = logs.reduce((s, l) => s + (l.fat_g ?? 0), 0)

  function updateHistory(date: string, newLogs: Log[]) {
    const dayTotal = { calories: newLogs.reduce((s, l) => s + (l.calories ?? 0), 0), protein_g: newLogs.reduce((s, l) => s + (l.protein_g ?? 0), 0) }
    setHistoryRows(prev => {
      const filtered = prev.filter(r => r.date !== date)
      if (newLogs.length === 0) return filtered
      return [...filtered, { date, calories: dayTotal.calories, protein_g: dayTotal.protein_g }]
    })
  }

  // Build weekly chart data (last 7 days)
  const last7: { label: string; calories: number; protein: number }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    const rows = historyRows.filter(r => r.date === dateStr)
    last7.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      calories: rows.reduce((s, r) => s + (r.calories ?? 0), 0),
      protein: rows.reduce((s, r) => s + (r.protein_g ?? 0), 0),
    })
  }

  async function changeDate(date: string) {
    setSelectedDate(date)
    setLoadingDate(true)
    const { data } = await supabase.from('nutrition_logs').select('*').eq('date', date).order('created_at')
    setLogs((data ?? []) as Log[])
    setLoadingDate(false)
  }

  async function addEntry() {
    if (!form.food.trim()) { setError('Food name required'); return }
    setError('')
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const { data, error: err } = await supabase.from('nutrition_logs').insert({
      user_id: user.id,
      date: selectedDate,
      food: form.food.trim(),
      calories: form.calories ? parseInt(form.calories) : null,
      protein_g: form.protein ? parseFloat(form.protein) : null,
      carbs_g: form.carbs ? parseFloat(form.carbs) : null,
      fat_g: form.fat ? parseFloat(form.fat) : null,
    }).select('*').single()
    setSaving(false)
    if (err) { setError(err.message); return }
    if (data) {
      const next = [...logs, data as Log]
      setLogs(next)
      updateHistory(selectedDate, next)
    }
    setForm(EMPTY)
  }

  async function deleteEntry(id: string) {
    await supabase.from('nutrition_logs').delete().eq('id', id)
    const next = logs.filter(l => l.id !== id)
    setLogs(next)
    updateHistory(selectedDate, next)
    if (editingId === id) setEditingId(null)
  }

  function startEdit(log: Log) {
    setEditingId(log.id)
    setEditForm({
      food: log.food,
      calories: log.calories != null ? String(log.calories) : '',
      protein: log.protein_g != null ? String(log.protein_g) : '',
      carbs: log.carbs_g != null ? String(log.carbs_g) : '',
      fat: log.fat_g != null ? String(log.fat_g) : '',
    })
  }

  async function saveEdit(id: string) {
    const updates = {
      food: editForm.food.trim(),
      calories: editForm.calories ? parseInt(editForm.calories) : null,
      protein_g: editForm.protein ? parseFloat(editForm.protein) : null,
      carbs_g: editForm.carbs ? parseFloat(editForm.carbs) : null,
      fat_g: editForm.fat ? parseFloat(editForm.fat) : null,
    }
    await supabase.from('nutrition_logs').update(updates).eq('id', id)
    const next = logs.map(l => l.id === id ? { ...l, ...updates } : l)
    setLogs(next)
    updateHistory(selectedDate, next)
    setEditingId(null)
  }

  async function saveTargets() {
    setSavingTargets(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      await supabase.from('user_profiles').update({
        calorie_target: parseInt(calTarget) || 2500,
        protein_target: parseInt(proTarget) || 180,
      }).eq('id', user.id)
    }
    setSavingTargets(false)
    setShowTargets(false)
    startTransition(() => router.refresh())
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Nutrition</h1>
        <button onClick={() => setShowTargets(v => !v)}
          className="text-xs px-3 py-1.5 rounded-lg border"
          style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>
          {showTargets ? 'Cancel' : 'Set Targets'}
        </button>
      </div>

      {/* Date selector */}
      <div className="flex items-center gap-2">
        <input type="date" value={selectedDate} max={today}
          onChange={e => changeDate(e.target.value)}
          className="px-3 py-2 rounded-lg border text-sm outline-none flex-1"
          style={{ background: 'var(--card)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
        {selectedDate !== today && (
          <button onClick={() => changeDate(today)}
            className="text-xs px-3 py-2 rounded-lg border"
            style={{ borderColor: 'var(--card-border)', color: 'var(--muted)' }}>
            Today
          </button>
        )}
      </div>

      {showTargets && (
        <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
          <p className="text-sm font-medium">Daily Targets</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs" style={{ color: 'var(--muted)' }}>Calories</label>
              <input value={calTarget} onChange={e => setCalTarget(e.target.value)} type="number"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
            </div>
            <div className="space-y-1">
              <label className="text-xs" style={{ color: 'var(--muted)' }}>Protein (g)</label>
              <input value={proTarget} onChange={e => setProTarget(e.target.value)} type="number"
                className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
                style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
            </div>
          </div>
          <button onClick={saveTargets} disabled={savingTargets}
            className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}>
            {savingTargets ? 'Saving…' : 'Save Targets'}
          </button>
        </div>
      )}

      {/* Today's totals */}
      <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
        <p className="text-sm font-semibold">
          {selectedDate === today ? 'Today' : new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          {loadingDate && <span className="text-xs font-normal ml-2" style={{ color: 'var(--muted)' }}>Loading…</span>}
        </p>
        <div className="grid grid-cols-4 gap-2 text-center">
          {[
            { label: 'Calories', value: totalCal, unit: 'kcal', color: 'var(--accent)', target: calorieTarget },
            { label: 'Protein', value: totalPro, unit: 'g', color: '#22c55e', target: proteinTarget },
            { label: 'Carbs', value: totalCarbs, unit: 'g', color: '#3b82f6', target: null },
            { label: 'Fat', value: totalFat, unit: 'g', color: '#a855f7', target: null },
          ].map(({ label, value, unit, color, target }) => (
            <div key={label} className="space-y-1">
              <p className="text-xs" style={{ color: 'var(--muted)' }}>{label}</p>
              <p className="text-lg font-bold" style={{ color }}>{Math.round(value)}<span className="text-xs font-normal ml-0.5" style={{ color: 'var(--muted)' }}>{unit}</span></p>
              {target && <ProgressBar value={value} target={target} color={color} />}
              {target && <p className="text-xs" style={{ color: 'var(--muted)' }}>/ {target}{unit}</p>}
            </div>
          ))}
        </div>
      </div>

      {/* Quick-add form */}
      <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
        <p className="text-sm font-semibold">Add Food</p>
        <input value={form.food} onChange={e => setForm(f => ({ ...f, food: e.target.value }))}
          onKeyDown={e => e.key === 'Enter' && addEntry()}
          placeholder="Food name (e.g. Chicken breast, 6oz)"
          className="w-full px-3 py-2 rounded-lg border text-sm outline-none"
          style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
        <div className="grid grid-cols-4 gap-2">
          {(['calories', 'protein', 'carbs', 'fat'] as const).map(field => (
            <input key={field} type="number" value={form[field]}
              onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
              placeholder={field === 'calories' ? 'Cal' : field.charAt(0).toUpperCase() + field.slice(1) + ' g'}
              className="w-full px-2 py-2 rounded-lg border text-sm outline-none text-center"
              style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
          ))}
        </div>
        {error && <p className="text-red-400 text-xs">{error}</p>}
        <button onClick={addEntry} disabled={saving || !form.food.trim()}
          className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
          style={{ background: 'var(--accent)' }}>
          {saving ? 'Adding…' : '+ Add'}
        </button>
      </div>

      {/* Today's log list */}
      {logs.length > 0 && (
        <div className="rounded-xl border divide-y" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
          {logs.map(log => (
            <div key={log.id} className="px-4 py-3 space-y-2">
              {editingId === log.id ? (
                <>
                  <input value={editForm.food} onChange={e => setEditForm(f => ({ ...f, food: e.target.value }))}
                    className="w-full px-3 py-1.5 rounded-lg border text-sm outline-none"
                    style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
                  <div className="grid grid-cols-4 gap-1.5">
                    {(['calories', 'protein', 'carbs', 'fat'] as const).map(f => (
                      <input key={f} type="number" value={editForm[f]}
                        onChange={e => setEditForm(ef => ({ ...ef, [f]: e.target.value }))}
                        placeholder={f === 'calories' ? 'Cal' : f.charAt(0).toUpperCase() + f.slice(1) + ' g'}
                        className="w-full px-2 py-1.5 rounded-lg border text-xs outline-none text-center"
                        style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => saveEdit(log.id)}
                      className="text-xs px-3 py-1.5 rounded-lg text-white font-semibold"
                      style={{ background: 'var(--accent)' }}>Save</button>
                    <button onClick={() => setEditingId(null)}
                      className="text-xs px-3 py-1.5 rounded-lg"
                      style={{ color: 'var(--muted)' }}>Cancel</button>
                    <button onClick={() => deleteEntry(log.id)}
                      className="text-xs px-3 py-1.5 rounded-lg ml-auto"
                      style={{ color: '#ef4444' }}>Delete</button>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{log.food}</p>
                    <p className="text-xs" style={{ color: 'var(--muted)' }}>
                      {[
                        log.calories != null && `${log.calories} kcal`,
                        log.protein_g != null && `${log.protein_g}g protein`,
                        log.carbs_g != null && `${log.carbs_g}g carbs`,
                        log.fat_g != null && `${log.fat_g}g fat`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <button onClick={() => startEdit(log)} className="text-xs shrink-0 px-2" style={{ color: 'var(--muted)' }}>Edit</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* 7-day history chart */}
      <div className="rounded-xl border p-4 space-y-3" style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
        <p className="text-sm font-semibold">Last 7 Days — Calories</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={last7} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 12 }}
              formatter={(v: unknown) => [`${v ?? 0} kcal`, 'Calories']}
            />
            <ReferenceLine y={calorieTarget} stroke="var(--accent)" strokeDasharray="4 2" />
            <Bar dataKey="calories" fill="var(--accent)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
        <p className="text-sm font-semibold">Last 7 Days — Protein</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={last7} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11, fill: 'var(--muted)' }} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-border)', borderRadius: 8, fontSize: 12 }}
              formatter={(v: unknown) => [`${v ?? 0}g`, 'Protein']}
            />
            <ReferenceLine y={proteinTarget} stroke="#22c55e" strokeDasharray="4 2" />
            <Bar dataKey="protein" fill="#22c55e" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
