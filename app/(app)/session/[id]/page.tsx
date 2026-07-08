import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import SessionClient from './SessionClient'

export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch the session
  const { data: session } = await supabase
    .from('workout_sessions')
    .select('id, date, notes, user_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!session) notFound()

  // Fetch all sets for this session with exercise info
  const { data: sets } = await supabase
    .from('workout_sets')
    .select('set_number, weight_lbs, reps, notes, exercise_id, exercises(id, name, category)')
    .eq('session_id', id)
    .order('set_number', { ascending: true })

  // Group sets by exercise
  const byExercise: Record<string, {
    exerciseId: string
    name: string
    sets: { set_number: number; weight_lbs: number | null; reps: number | null; notes: string | null }[]
  }> = {}

  sets?.forEach((s: any) => {
    const exId = s.exercise_id
    if (!byExercise[exId]) {
      byExercise[exId] = { exerciseId: exId, name: s.exercises?.name ?? 'Unknown', sets: [] }
    }
    byExercise[exId].sets.push({
      set_number: s.set_number,
      weight_lbs: s.weight_lbs,
      reps: s.reps,
      notes: s.notes,
    })
  })

  const exercises = Object.values(byExercise)

  // Find PRs: for each exercise, compare today's max weight to all-time max before this session
  const compliments: string[] = []

  for (const ex of exercises) {
    const sessionMaxWeight = Math.max(...ex.sets.map(s => s.weight_lbs ?? 0))
    if (sessionMaxWeight <= 0) continue

    const { data: historicalSets } = await supabase
      .from('workout_sets')
      .select('weight_lbs, workout_sessions!inner(date, user_id)')
      .eq('exercise_id', ex.exerciseId)
      .eq('workout_sessions.user_id', user.id)
      .lt('workout_sessions.date', session.date)

    const historicalMax = Math.max(0, ...(historicalSets?.map((s: any) => s.weight_lbs ?? 0) ?? []))

    if (sessionMaxWeight > historicalMax && historicalMax > 0) {
      compliments.push(`New personal record on ${ex.name}! ${historicalMax} → ${sessionMaxWeight} lbs 🏆`)
    } else if (historicalMax === 0) {
      compliments.push(`First time doing ${ex.name} — great addition! 💪`)
    }
  }

  // Check total volume vs previous sessions
  const totalSets = sets?.length ?? 0
  if (totalSets >= 15) compliments.push(`Monster session — ${totalSets} total sets! 🔥`)
  else if (totalSets >= 10) compliments.push(`Solid session with ${totalSets} sets. Keep it up!`)
  else if (exercises.length >= 4) compliments.push(`Hit ${exercises.length} different exercises — great variety!`)

  if (compliments.length === 0) {
    compliments.push('Great job showing up and putting in the work! 💪')
  }

  // Body weight that day
  const { data: bwRow } = await supabase
    .from('body_weight')
    .select('weight_lbs')
    .eq('user_id', user.id)
    .eq('date', session.date)
    .single()

  return (
    <SessionClient
      session={session}
      exercises={exercises}
      compliments={compliments}
      bodyWeight={bwRow?.weight_lbs ?? null}
    />
  )
}
