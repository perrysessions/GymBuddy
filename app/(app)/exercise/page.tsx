import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import ExerciseListClient from './ExerciseListClient'

export default async function ExercisePage() {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: exercises } = await supabase
    .from('exercises')
    .select('id, name, category')
    .order('name')

  return <ExerciseListClient exercises={exercises ?? []} />
}
