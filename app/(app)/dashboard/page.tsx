export const dynamic = 'force-dynamic'
export const revalidate = 0

import { unstable_noStore as noStore } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import DashboardClient from './DashboardClient'

export default async function DashboardPage() {
  noStore()
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Fetch all exercise sets paginated (Supabase server caps at 1000 rows per request)
  const allExerciseSets: any[] = []
  const PAGE = 1000
  let from = 0
  while (true) {
    const { data, error } = await supabase
      .from('workout_sets')
      .select(`
        exercise_id,
        weight_lbs,
        exercises(id, name, category),
        workout_sessions!inner(user_id, date)
      `)
      .eq('workout_sessions.user_id', user.id)
      .range(from, from + PAGE - 1)
    if (error || !data || data.length === 0) break
    allExerciseSets.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }

  const allExerciseRows = allExerciseSets.map((row: any) => ({
    exerciseId: row.exercise_id,
    name: row.exercises?.name ?? 'Unknown',
    date: row.workout_sessions?.date ?? '',
    weight_lbs: row.weight_lbs ?? 0,
  }))

  // Recent sessions
  const { data: recentSessions } = await supabase
    .from('workout_sessions')
    .select('id, date, notes')
    .eq('user_id', user.id)
    .order('date', { ascending: false })

  // Body weight last 6 months
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const { data: bodyWeights } = await supabase
    .from('body_weight')
    .select('date, weight_lbs')
    .eq('user_id', user.id)
    .gte('date', sixMonthsAgo.toISOString().split('T')[0])
    .order('date', { ascending: true })

  return (
    <DashboardClient
      allExerciseRows={allExerciseRows}
      recentSessions={recentSessions ?? []}
      bodyWeights={bodyWeights ?? []}
    />
  )
}
