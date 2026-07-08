import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import Nav from '@/components/Nav'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_ai_enabled')
    .eq('id', user.id)
    .single()

  const isAiEnabled = profile?.is_ai_enabled ?? false

  return (
    <div className="flex min-h-screen">
      <Nav isAiEnabled={isAiEnabled} />
      <main className="flex-1 p-4 md:p-8 pb-24 md:pb-8 overflow-auto">
        {children}
      </main>
    </div>
  )
}
