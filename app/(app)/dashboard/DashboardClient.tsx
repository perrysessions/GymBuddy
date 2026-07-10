'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ComposedChart, LineChart, Line, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
} from 'recharts'
import { createClient } from '@/lib/supabase'

interface Props {
  allExerciseRows: { exerciseId: string; name: string; category: string; date: string; weight_lbs: number; reps: number }[]
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

function weekLabel(date: Date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  return d.toISOString().split('T')[0]
}

const UPPER_CATS = new Set(['upper'])
const LOWER_CATS = new Set(['lower', 'legs'])

type CorrMetric = 'weight' | 'sessions' | 'volume' | 'reps' | 'sets'

const CORR_METRICS: { key: CorrMetric; label: string; color: string }[] = [
  { key: 'sessions', label: 'Sessions/week',    color: '#e85d04' },
  { key: 'volume',   label: 'Avg Volume',       color: '#4ade80' },
  { key: 'reps',     label: 'Avg Reps',         color: '#60a5fa' },
  { key: 'sets',     label: 'Avg Sets/workout', color: '#c084fc' },
  { key: 'weight',   label: 'Body Weight',      color: '#f48c06' },
]

export default function DashboardClient({ allExerciseRows, recentSessions, bodyWeights: initialBodyWeights }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [sessionSearch, setSessionSearch] = useState('')
  const [exerciseDays, setExerciseDays] = useState(0)
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null)
  const [chartMetric, setChartMetric] = useState<'max_weight' | 'avg_weight' | 'avg_reps' | 'volume'>('max_weight')
  const [bodyWeights, setBodyWeights] = useState(initialBodyWeights)
  const [showWeightForm, setShowWeightForm] = useState(false)
  const [weightDate, setWeightDate] = useState(new Date().toISOString().split('T')[0])
  const [weightLbs, setWeightLbs] = useState('')
  const [savingWeight, setSavingWeight] = useState(false)
  const [weightError, setWeightError] = useState('')
  const [corrEnabled, setCorrEnabled] = useState<Set<CorrMetric>>(new Set(['sessions', 'volume']))

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

  // Upper / Lower volume per week (last 26 weeks)
  const splitData = useMemo(() => {
    const cutoff = new Date(Date.now() - 26 * 7 * 86400000).toISOString().split('T')[0]
    const weekMap: Record<string, { upper: number; lower: number }> = {}
    for (const row of allExerciseRows) {
      if (row.date < cutoff) continue
      const wk = weekLabel(new Date(row.date + 'T00:00:00'))
      if (!weekMap[wk]) weekMap[wk] = { upper: 0, lower: 0 }
      if (UPPER_CATS.has(row.category)) weekMap[wk].upper += row.weight_lbs * row.reps
      if (LOWER_CATS.has(row.category)) weekMap[wk].lower += row.weight_lbs * row.reps
    }
    return Object.entries(weekMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, { upper, lower }]) => ({ week, upper, lower }))
  }, [allExerciseRows])

  const hasAnySplitData = splitData.some(d => d.upper > 0 || d.lower > 0)

  // Body weight chart data (raw daily)
  const bwChartData = useMemo(() => {
    return [...bodyWeights]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(bw => ({ date: bw.date, weight: bw.weight_lbs }))
  }, [bodyWeights])

  // Sessions per week (last 26 weeks)
  const freqData = useMemo(() => {
    const cutoff = new Date(Date.now() - 26 * 7 * 86400000).toISOString().split('T')[0]
    const weekSessions: Record<string, number> = {}
    for (const s of recentSessions) {
      if (s.date < cutoff) continue
      const wk = weekLabel(new Date(s.date + 'T00:00:00'))
      weekSessions[wk] = (weekSessions[wk] ?? 0) + 1
    }
    return Object.entries(weekSessions)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([week, sessions]) => ({ week, sessions }))
  }, [recentSessions])

  // Correlation chart: all metrics normalized 0-100%, last 26 weeks
  const corrData = useMemo(() => {
    const cutoff = new Date(Date.now() - 26 * 7 * 86400000).toISOString().split('T')[0]

    const weekSessions: Record<string, number> = {}
    const weekVolume: Record<string, number[]> = {}
    const weekReps: Record<string, number[]> = {}
    const weekSets: Record<string, number> = {}
    const weekWeights: Record<string, number[]> = {}

    for (const s of recentSessions) {
      if (s.date < cutoff) continue
      const wk = weekLabel(new Date(s.date + 'T00:00:00'))
      weekSessions[wk] = (weekSessions[wk] ?? 0) + 1
    }

    for (const row of allExerciseRows) {
      if (row.date < cutoff) continue
      const wk = weekLabel(new Date(row.date + 'T00:00:00'))
      if (row.weight_lbs > 0 && row.reps > 0) {
        if (!weekVolume[wk]) weekVolume[wk] = []
        weekVolume[wk].push(row.weight_lbs * row.reps)
      }
      if (row.reps > 0) {
        if (!weekReps[wk]) weekReps[wk] = []
        weekReps[wk].push(row.reps)
      }
      if (!weekSets[wk]) weekSets[wk] = 0
      weekSets[wk]++
    }

    for (const bw of bodyWeights) {
      if (bw.date < cutoff) continue
      const wk = weekLabel(new Date(bw.date + 'T00:00:00'))
      if (!weekWeights[wk]) weekWeights[wk] = []
      weekWeights[wk].push(bw.weight_lbs)
    }

    const allWeeks = new Set([
      ...Object.keys(weekSessions),
      ...Object.keys(weekVolume),
      ...Object.keys(weekWeights),
    ])

    const raw = Array.from(allWeeks).sort().map(wk => {
      const sessCount = weekSessions[wk] ?? 0
      const vol = weekVolume[wk] ? weekVolume[wk].reduce((a, b) => a + b, 0) / weekVolume[wk].length : null
      const reps = weekReps[wk] ? weekReps[wk].reduce((a, b) => a + b, 0) / weekReps[wk].length : null
      const sets = weekSessions[wk] ? (weekSets[wk] ?? 0) / weekSessions[wk] : null
      const weight = weekWeights[wk]
        ? weekWeights[wk].reduce((a, b) => a + b, 0) / weekWeights[wk].length
        : null
      return { week: wk, sessions: sessCount, volume: vol, reps, sets, weight }
    })

    // Find all-time maxes for normalization
    const maxSessions = Math.max(...raw.map(r => r.sessions), 1)
    const maxVolume   = Math.max(...raw.map(r => r.volume  ?? 0), 1)
    const maxReps     = Math.max(...raw.map(r => r.reps    ?? 0), 1)
    const maxSets     = Math.max(...raw.map(r => r.sets    ?? 0), 1)
    const maxWeight   = Math.max(...raw.map(r => r.weight  ?? 0), 1)

    return raw.map(r => ({
      week: r.week,
      sessions: Math.round((r.sessions / maxSessions) * 100),
      volume:   r.volume  != null ? Math.round((r.volume  / maxVolume)  * 100) : null,
      reps:     r.reps    != null ? Math.round((r.reps    / maxReps)    * 100) : null,
      sets:     r.sets    != null ? Math.round((r.sets    / maxSets)    * 100) : null,
      weight:   r.weight  != null ? Math.round((r.weight  / maxWeight)  * 100) : null,
    }))
  }, [recentSessions, allExerciseRows, bodyWeights])

  const filteredSessions = sessionSearch.trim()
    ? recentSessions.filter(s =>
        s.date.includes(sessionSearch.trim()) ||
        new Date(s.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric', day: 'numeric' }).toLowerCase().includes(sessionSearch.toLowerCase()) ||
        (s.notes ?? '').toLowerCase().includes(sessionSearch.toLowerCase())
      )
    : recentSessions

  async function saveWeight() {
    if (!weightLbs) return
    setSavingWeight(true)
    setWeightError('')
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setWeightError('Not logged in'); setSavingWeight(false); return }
    const { error: e } = await supabase.from('body_weight').insert(
      { user_id: user.id, date: weightDate, weight_lbs: parseFloat(weightLbs) }
    )
    if (e) { setWeightError(e.message); setSavingWeight(false); return }
    setBodyWeights(prev => {
      const next = prev.filter(bw => bw.date !== weightDate)
      return [...next, { date: weightDate, weight_lbs: parseFloat(weightLbs) }].sort((a, b) => a.date.localeCompare(b.date))
    })
    setWeightLbs('')
    setShowWeightForm(false)
    setSavingWeight(false)
  }

  function toggleCorr(key: CorrMetric) {
    setCorrEnabled(prev => {
      const next = new Set(prev)
      if (next.has(key)) { next.delete(key) } else { next.add(key) }
      return next
    })
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <Link href="/log" className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}>
          + Log Workout
        </Link>
      </div>

      {/* Exercise chart */}
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
        {/* Top exercises */}
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
            <div className="space-y-2 overflow-y-auto max-h-64 pr-1">
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
            <div className="space-y-2 overflow-y-auto max-h-64 pr-1">
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

      {/* Upper / Lower split */}
      {hasAnySplitData && (
        <Card>
          <div className="flex items-center justify-between mb-1">
            <SectionTitle>Upper vs Lower Volume (last 6 months)</SectionTitle>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
            Tag exercises as "upper" or "lower" on their detail page to populate this chart.
          </p>
          <ResponsiveContainer width="100%" height={180}>
            <ComposedChart data={splitData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
              <XAxis dataKey="week" tickFormatter={d => formatDate(d)} tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip {...CHART_TOOLTIP_STYLE}
                labelFormatter={d => `Week of ${formatDate(d as string)}`}
                formatter={(v: any, name: any) => [Number(v).toLocaleString(), name === 'upper' ? 'Upper vol.' : 'Lower vol.']} />
              <Legend wrapperStyle={{ fontSize: 11, color: '#888' }} />
              <Bar dataKey="upper" name="Upper" fill="#e85d04" radius={[3, 3, 0, 0]} barSize={10} />
              <Bar dataKey="lower" name="Lower" fill="#f48c06" radius={[3, 3, 0, 0]} barSize={10} />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Chart 1: Body Weight */}
      <Card>
        <div className="flex items-center justify-between mb-1">
          <SectionTitle>Body Weight</SectionTitle>
          <button
            onClick={() => setShowWeightForm(v => !v)}
            className="text-xs px-3 py-1.5 rounded-lg border font-medium mb-3"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}>
            {showWeightForm ? 'Cancel' : '+ Log Weight'}
          </button>
        </div>

        {showWeightForm && (
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <input type="date" value={weightDate} onChange={e => setWeightDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
            <input type="number" step="0.1" placeholder="lbs" value={weightLbs}
              onChange={e => setWeightLbs(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveWeight()}
              className="w-24 px-3 py-1.5 rounded-lg border text-sm outline-none"
              style={{ background: 'var(--background)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }} />
            <button onClick={saveWeight} disabled={savingWeight || !weightLbs}
              className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}>
              {savingWeight ? 'Saving…' : 'Save'}
            </button>
            {weightError && <p className="text-red-400 text-xs w-full">{weightError}</p>}
          </div>
        )}

        {bwChartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={bwChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
              <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis domain={['auto', 'auto']} tick={{ fill: '#888', fontSize: 11 }} unit=" lbs" width={52} />
              <Tooltip
                {...CHART_TOOLTIP_STYLE}
                labelFormatter={d => formatDate(d as string)}
                formatter={(v: any) => [`${v} lbs`, 'Body weight']}
              />
              <Line type="monotone" dataKey="weight" stroke="#f48c06" strokeWidth={2} dot={{ r: 3, fill: '#f48c06' }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No weight entries yet — log your first one above.</p>
        )}
      </Card>

      {/* Chart 2: Sessions per week */}
      {freqData.length > 0 && (
        <Card>
          <SectionTitle>Workout Frequency (last 6 months)</SectionTitle>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={freqData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
              <XAxis dataKey="week" tickFormatter={d => formatDate(d)} tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis allowDecimals={false} tick={{ fill: '#888', fontSize: 11 }} />
              <Tooltip
                {...CHART_TOOLTIP_STYLE}
                labelFormatter={d => `Week of ${formatDate(d as string)}`}
                formatter={(v: any) => [v, 'Sessions']}
              />
              <Line type="monotone" dataKey="sessions" stroke="#e85d04" strokeWidth={2} dot={{ r: 3, fill: '#e85d04' }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}

      {/* Chart 3: Correlation chart */}
      {corrData.length > 0 && (
        <Card>
          <div className="mb-4">
            <SectionTitle>Correlation (last 6 months)</SectionTitle>
            <p className="text-xs -mt-2 mb-3" style={{ color: 'var(--muted)' }}>
              All metrics normalized to 0–100% of their all-time peak. Toggle to compare trends.
            </p>
            <div className="flex flex-wrap gap-2">
              {CORR_METRICS.map(({ key, label, color }) => {
                const active = corrEnabled.has(key)
                return (
                  <button key={key} onClick={() => toggleCorr(key)}
                    className="px-3 py-1 rounded-full text-xs font-medium border transition-all"
                    style={{
                      background: active ? color + '22' : 'transparent',
                      borderColor: active ? color : 'var(--card-border)',
                      color: active ? color : 'var(--muted)',
                    }}>
                    {label}
                  </button>
                )
              })}
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={corrData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
              <XAxis dataKey="week" tickFormatter={d => formatDate(d)} tick={{ fill: '#888', fontSize: 10 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#888', fontSize: 11 }} unit="%" />
              <Tooltip
                {...CHART_TOOLTIP_STYLE}
                labelFormatter={d => `Week of ${formatDate(d as string)}`}
                formatter={(v: any, name: any) => {
                  const m = CORR_METRICS.find(m => m.key === name)
                  return [`${v}%`, m?.label ?? name]
                }}
              />
              {CORR_METRICS.map(({ key, color }) =>
                corrEnabled.has(key) ? (
                  <Line key={key} type="monotone" dataKey={key} stroke={color} strokeWidth={2} dot={false} connectNulls />
                ) : null
              )}
            </LineChart>
          </ResponsiveContainer>
        </Card>
      )}
    </div>
  )
}
