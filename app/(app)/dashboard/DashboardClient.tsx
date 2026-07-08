'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

interface Props {
  allExerciseRows: { exerciseId: string; name: string; date: string; weight_lbs: number; reps: number }[]
  recentSessions: { id: string; date: string; notes: string | null }[]
  bodyWeights: { date: string; weight_lbs: number }[]
}

const RANGE_OPTIONS = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6mo', days: 180 },
  { label: '1yr', days: 365 },
  { label: 'All', days: 0 },
]

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border p-5 ${className}`}
      style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
      {children}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-base font-semibold mb-4" style={{ color: 'var(--muted)' }}>{children}</h2>
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 },
  labelStyle: { color: '#888' },
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function DashboardClient({ allExerciseRows, recentSessions, bodyWeights }: Props) {
  const router = useRouter()
  const [sessionSearch, setSessionSearch] = useState('')
  const [exerciseDays, setExerciseDays] = useState(0)
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const [chartMetric, setChartMetric] = useState<'max_weight' | 'avg_weight' | 'avg_reps' | 'volume'>('max_weight')

  const priorityExercises = useMemo(() => {
    const cutoff = exerciseDays > 0
      ? new Date(Date.now() - exerciseDays * 86400000).toISOString().split('T')[0]
      : ''
    const counts: Record<string, { name: string; count: number }> = {}
    for (const row of allExerciseRows) {
      if (cutoff && row.date < cutoff) continue
      if (!counts[row.exerciseId]) counts[row.exerciseId] = { name: row.name, count: 0 }
      counts[row.exerciseId].count++
    }
    return Object.entries(counts)
      .sort((a, b) => b[1].count - a[1].count)
      .map(([id, { name, count }]) => ({ id, name, count }))
  }, [allExerciseRows, exerciseDays])

  // Default chart to top exercise if nothing selected
  const chartExerciseId = selectedExerciseId ?? priorityExercises[0]?.id ?? null
  const chartExerciseName = allExerciseRows.find(r => r.exerciseId === chartExerciseId)?.name ?? ''

  const chartData = useMemo(() => {
    if (!chartExerciseId) return []
    const cutoff = exerciseDays > 0
      ? new Date(Date.now() - exerciseDays * 86400000).toISOString().split('T')[0]
      : ''
    const byDate: Record<string, { weights: number[]; repsArr: number[] }> = {}
    for (const row of allExerciseRows) {
      if (row.exerciseId !== chartExerciseId) continue
      if (cutoff && row.date < cutoff) continue
      if (!byDate[row.date]) byDate[row.date] = { weights: [], repsArr: [] }
      if (row.weight_lbs > 0) byDate[row.date].weights.push(row.weight_lbs)
      if (row.reps > 0) byDate[row.date].repsArr.push(row.reps)
    }
    return Object.entries(byDate)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, { weights, repsArr }]) => {
        const avg_w = weights.length > 0 ? Math.round((weights.reduce((a, b) => a + b, 0) / weights.length) * 10) / 10 : 0
        const avg_r = repsArr.length > 0 ? Math.round((repsArr.reduce((a, b) => a + b, 0) / repsArr.length) * 10) / 10 : 0
        const max_w = weights.length > 0 ? Math.max(...weights) : 0
        return {
          date,
          max_weight: max_w,
          avg_weight: avg_w,
          avg_reps: avg_r,
          volume: weights.reduce((s, w, i) => s + w * (repsArr[i] ?? 0), 0),
        }
      })
  }, [allExerciseRows, chartExerciseId, exerciseDays])

  const filteredSessions = sessionSearch.trim()
    ? recentSessions.filter(s =>
        s.date.includes(sessionSearch.trim()) ||
        new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric', day: 'numeric' }).toLowerCase().includes(sessionSearch.toLowerCase()) ||
        (s.notes ?? '').toLowerCase().includes(sessionSearch.toLowerCase())
      )
    : recentSessions

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/log" className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}>
          + Log Workout
        </Link>
      </div>

      {bodyWeights.length > 0 && (
        <Card>
          <SectionTitle>Body Weight (last 6 months)</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={bodyWeights}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#888', fontSize: 11 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fill: '#888', fontSize: 11 }} unit=" lbs" />
              <Tooltip {...CHART_TOOLTIP_STYLE} formatter={(v: any) => [`${v} lbs`, 'Weight']} labelFormatter={(d: any) => formatDate(d)} />
              <Line type="monotone" dataKey="weight_lbs" stroke="#f48c06" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Exercise chart — updates when top exercise is tapped, tap chart to go to detail */}
      {chartData.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-3">
            <p className="text-base font-semibold" style={{ color: 'var(--muted)' }}>{chartExerciseName}</p>
            <button
              onClick={() => chartExerciseId && router.push(`/exercise/${chartExerciseId}`)}
              className="text-xs px-2.5 py-1 rounded-lg border"
              style={{ borderColor: 'var(--card-border)', color: 'var(--accent)' }}>
              View full history →
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {([
              ['max_weight', 'Max Weight'],
              ['avg_weight', 'Avg Weight'],
              ['avg_reps', 'Avg Reps'],
              ['volume', 'Volume'],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setChartMetric(key)}
                className="px-2.5 py-0.5 rounded text-xs font-medium transition-colors"
                style={{
                  background: chartMetric === key ? 'var(--accent)' : 'var(--background)',
                  color: chartMetric === key ? '#fff' : 'var(--muted)',
                }}>
                {label}
              </button>
            ))}
          </div>
          <div className="cursor-pointer" onClick={() => chartExerciseId && router.push(`/exercise/${chartExerciseId}`)}>
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
                <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#888', fontSize: 11 }} />
                <YAxis domain={['auto', 'auto']} tick={{ fill: '#888', fontSize: 11 }} />
                <Tooltip {...CHART_TOOLTIP_STYLE}
                  labelFormatter={(d: any) => formatDate(d)}
                  formatter={(v: any) => {
                    if (chartMetric === 'avg_reps') return [`${v} reps`, 'Avg reps']
                    if (chartMetric === 'volume') return [Number(v).toLocaleString(), 'Volume']
                    return [`${v} lbs`, chartMetric === 'max_weight' ? 'Max weight' : 'Avg weight']
                  }} />
                <Line type="monotone" dataKey={chartMetric} stroke="#e85d04" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top exercises — tap to update chart */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold flex-1" style={{ color: 'var(--muted)' }}>Top Exercises</h2>
            <div className="flex gap-1">
              {RANGE_OPTIONS.map(opt => (
                <button key={opt.label} onClick={() => setExerciseDays(opt.days)}
                  className="px-2 py-0.5 rounded text-xs font-medium transition-colors"
                  style={{
                    background: exerciseDays === opt.days ? 'var(--accent)' : 'var(--background)',
                    color: exerciseDays === opt.days ? '#fff' : 'var(--muted)',
                  }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
          {priorityExercises.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              No data for this period. <Link href="/import" className="underline" style={{ color: 'var(--accent)' }}>Import your notes</Link> or <Link href="/log" className="underline" style={{ color: 'var(--accent)' }}>log a workout</Link>.
            </p>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-96 pr-1">
              {priorityExercises.map((ex) => {
                const isSelected = (selectedExerciseId ?? priorityExercises[0]?.id) === ex.id
                return (
                  <button
                    key={ex.id}
                    onClick={() => setSelectedExerciseId(ex.id)}
                    className="w-full flex items-center justify-between p-2 rounded-lg transition-colors hover:opacity-80 text-left"
                    style={{
                      background: isSelected ? 'rgba(232,93,4,0.15)' : 'var(--background)',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                    }}>
                    <span className="text-sm font-medium">{ex.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--card-border)', color: 'var(--muted)' }}>
                      {ex.count} sets
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </Card>

        {/* All sessions */}
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-base font-semibold flex-1" style={{ color: 'var(--muted)' }}>Workouts</h2>
            <input
              type="text"
              value={sessionSearch}
              onChange={e => setSessionSearch(e.target.value)}
              placeholder="Filter by date or notes…"
              className="px-2.5 py-1 rounded-lg border text-xs outline-none w-40"
              style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
            />
            {sessionSearch && (
              <button onClick={() => setSessionSearch('')} className="text-xs" style={{ color: 'var(--muted)' }}>✕</button>
            )}
          </div>
          {recentSessions.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No sessions yet.</p>
          ) : (
            <div className="space-y-2 overflow-y-auto max-h-96 pr-1">
              {filteredSessions.length === 0 && (
                <p className="text-sm" style={{ color: 'var(--muted)' }}>No workouts match.</p>
              )}
              {filteredSessions.map((s) => (
                <Link key={s.id} href={`/session/${s.id}`}
                  className="block p-2 rounded-lg transition-colors hover:opacity-80"
                  style={{ background: 'var(--background)' }}>
                  <p className="text-sm font-medium">{formatDate(s.date)}</p>
                  {s.notes && <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--muted)' }}>{s.notes}</p>}
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
