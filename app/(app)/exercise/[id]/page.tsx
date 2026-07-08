import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import ExerciseDetailClient from './ExerciseDetailClient'

export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: exercise } = await supabase
    .from('exercises')
    .select('id, name, category')
    .eq('id', id)
    .single()

  if (!exercise) notFound()

  // All sets for this exercise for this user (include IDs for editing)
  const { data: sets } = await supabase
    .from('workout_sets')
    .select('id, set_number, weight_lbs, reps, notes, session_id, workout_sessions!inner(id, date, user_id, notes)')
    .eq('exercise_id', id)
    .eq('workout_sessions.user_id', user.id)
    .order('workout_sessions(date)', { ascending: true })

  // Group by session id
  const sessionMap: Record<string, {
    sessionId: string; date: string; sessionNotes: string | null;
    sets: { id: string; set_number: number; weight_lbs: number | null; reps: number | null; notes: string | null }[]
  }> = {}
  sets?.forEach((s: any) => {
    const sid = s.workout_sessions?.id
    const date = s.workout_sessions?.date
    if (!sid || !date) return
    if (!sessionMap[sid]) sessionMap[sid] = { sessionId: sid, date, sessionNotes: s.workout_sessions?.notes ?? null, sets: [] }
    sessionMap[sid].sets.push({
      id: s.id,
      set_number: s.set_number,
      weight_lbs: s.weight_lbs,
      reps: s.reps,
      notes: s.notes,
    })
  })

  const sessions = Object.values(sessionMap).sort((a, b) => a.date.localeCompare(b.date))

  const progressData = sessions.map(s => ({
    date: s.date,
    max_weight: Math.max(...s.sets.map(set => set.weight_lbs ?? 0)),
    total_reps: s.sets.reduce((sum, set) => sum + (set.reps ?? 0), 0),
    volume: s.sets.reduce((sum, set) => sum + (set.weight_lbs ?? 0) * (set.reps ?? 0), 0),
  }))

  return (
    <ExerciseDetailClient
      exercise={exercise}
      sessions={sessions}
      progressData={progressData}
      exerciseId={id}
    />
  )
}
