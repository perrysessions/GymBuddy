'use client'

import { useState } from 'react'
import Link from 'next/link'

interface Exercise { id: string; name: string; category: string }

export default function ExerciseListClient({ exercises }: { exercises: Exercise[] }) {
  const [search, setSearch] = useState('')

  const filtered = exercises.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase())
  )

  const byCategory = filtered.reduce<Record<string, Exercise[]>>((acc, ex) => {
    const cat = ex.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(ex)
    return acc
  }, {})

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Exercises</h1>

      <input
        type="text"
        placeholder="Search exercises..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-4 py-2 rounded-lg border text-sm outline-none"
        style={{ background: 'var(--card)', borderColor: 'var(--card-border)', color: 'var(--foreground)' }}
      />

      {Object.entries(byCategory).sort().map(([cat, exs]) => (
        <div key={cat}>
          <h2 className="text-xs font-semibold uppercase mb-2" style={{ color: 'var(--muted)' }}>{cat}</h2>
          <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--card-border)' }}>
            {exs.map((ex, i) => (
              <Link
                key={ex.id}
                href={`/exercise/${ex.id}`}
                className="flex items-center justify-between px-4 py-3 transition-colors hover:opacity-80"
                style={{
                  background: 'var(--card)',
                  borderTop: i > 0 ? '1px solid var(--card-border)' : undefined,
                }}
              >
                <span className="text-sm">{ex.name}</span>
                <span className="text-xs" style={{ color: 'var(--accent)' }}>→</span>
              </Link>
            ))}
          </div>
        </div>
      ))}

      {filtered.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--muted)' }}>No exercises found.</p>
      )}
    </div>
  )
}
