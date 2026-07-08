'use client'

import Link from 'next/link'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

interface ExerciseData {
  exerciseId: string
  name: string
  sets: { set_number: number; weight_lbs: number | null; reps: number | null; notes: string | null }[]
}

interface Props {
  session: { id: string; date: string; notes: string | null }
  exercises: ExerciseData[]
  compliments: string[]
  bodyWeight: number | null
}

const CHART_TOOLTIP_STYLE = {
  contentStyle: { background: '#1a1a1a', border: '1px solid #2a2a2a', borderRadius: 8 },
  labelStyle: { color: '#888' },
}

function formatDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  })
}

export default function SessionClient({ session, exercises, compliments, bodyWeight }: Props) {
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
        <div className="text-right shrink-0">
          <p className="text-2xl font-bold" style={{ color: 'var(--accent)' }}>{exercises.length}</p>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>exercises</p>
        </div>
      </div>

      {/* Compliments */}
      <div className="rounded-xl border p-4 space-y-2"
        style={{ background: 'var(--card)', borderColor: 'var(--card-border)' }}>
        {compliments.map((c, i) => (
          <p key={i} className="text-sm font-medium">{c}</p>
        ))}
      </div>

      {/* Exercises */}
      {exercises.map(ex => {
        const maxWeight = Math.max(...ex.sets.map(s => s.weight_lbs ?? 0))
        const totalReps = ex.sets.reduce((sum, s) => sum + (s.reps ?? 0), 0)
        const hasInjury = ex.sets.some(s => s.notes?.includes('⚠️'))
        const chartData = ex.sets.map(s => ({
          set: `S${s.set_number}`,
          weight: s.weight_lbs ?? 0,
          reps: s.reps ?? 0,
        }))

        return (
          <div key={ex.exerciseId} className="rounded-xl border overflow-hidden"
            style={{ background: 'var(--card)', borderColor: hasInjury ? '#7f1d1d' : 'var(--card-border)' }}>
            {/* Exercise header */}
            <div className="px-4 py-3 flex items-center justify-between"
              style={{ borderBottom: '1px solid var(--card-border)' }}>
              <Link href={`/exercise/${ex.exerciseId}`}
                className="font-semibold text-sm hover:underline">
                {hasInjury ? '⚠️ ' : ''}{ex.name}
              </Link>
              <div className="flex gap-3 text-xs" style={{ color: 'var(--muted)' }}>
                <span><strong style={{ color: 'var(--accent)' }}>{maxWeight}</strong> lbs max</span>
                <span><strong style={{ color: 'var(--foreground)' }}>{totalReps}</strong> total reps</span>
                <span><strong style={{ color: 'var(--foreground)' }}>{ex.sets.length}</strong> sets</span>
              </div>
            </div>

            {/* Chart — only if 2+ sets with weight data */}
            {chartData.length >= 2 && maxWeight > 0 && (
              <div className="px-4 pt-3 pb-1">
                <ResponsiveContainer width="100%" height={110}>
                  <BarChart data={chartData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" vertical={false} />
                    <XAxis dataKey="set" tick={{ fill: '#888', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis domain={['auto', 'auto']} tick={{ fill: '#888', fontSize: 10 }} axisLine={false} tickLine={false} width={36} />
                    <Tooltip
                      {...CHART_TOOLTIP_STYLE}
                      formatter={(v: any, name: string) => [name === 'weight' ? `${v} lbs` : `${v} reps`, name === 'weight' ? 'Weight' : 'Reps']}
                    />
                    <Bar dataKey="weight" fill="#e85d04" radius={[3, 3, 0, 0]} />
                    <Bar dataKey="reps" fill="#4a4a6a" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Set table */}
            <table className="w-full text-xs" style={{ borderTop: '1px solid var(--card-border)' }}>
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
          </div>
        )
      })}
    </div>
  )
}
