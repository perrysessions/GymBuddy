import { unstable_noStore as noStore } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import NutritionClient from './NutritionClient'

export default async function NutritionPage() {
  noStore()
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const [{ data: history }, { data: profile }] = await Promise.all([
    supabase.from('nutrition_logs').select('date, calories, protein_g').eq('user_id', user.id)
      .gte('date', thirtyDaysAgo.toISOString().split('T')[0]).order('date'),
    supabase.from('user_profiles').select('calorie_target, protein_target').eq('id', user.id).single(),
  ])

  return (
    <NutritionClient
      history={history ?? []}
      calorieTarget={profile?.calorie_target ?? 2500}
      proteinTarget={profile?.protein_target ?? 180}
    />
  )
}
