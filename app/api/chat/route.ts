import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase
    .from('user_profiles')
    .select('is_ai_enabled')
    .eq('id', user.id)
    .single()

  if (!profile?.is_ai_enabled) {
    return NextResponse.json({ error: 'AI chat not enabled for your account.' }, { status: 403 })
  }

  const { message, history } = await req.json()

  // Gather workout context for the system prompt
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data: recentSets } = await supabase
    .from('workout_sets')
    .select('weight_lbs, reps, notes, exercises(name), workout_sessions!inner(date, user_id, notes)')
    .eq('workout_sessions.user_id', user.id)
    .gte('workout_sessions.date', ninetyDaysAgo.toISOString().split('T')[0])
    .order('workout_sessions(date)', { ascending: false })
    .limit(500)

  const { data: bodyWeights } = await supabase
    .from('body_weight')
    .select('date, weight_lbs')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(20)

  // Build concise context string
  const exerciseSummary: Record<string, { sessions: number; maxWeight: number; lastDate: string; injuries: string[] }> = {}
  recentSets?.forEach((s: any) => {
    const name = s.exercises?.name ?? 'Unknown'
    const date = s.workout_sessions?.date ?? ''
    const sessionNote = s.workout_sessions?.notes ?? ''
    if (!exerciseSummary[name]) exerciseSummary[name] = { sessions: 0, maxWeight: 0, lastDate: '', injuries: [] }
    exerciseSummary[name].sessions++
    if ((s.weight_lbs ?? 0) > exerciseSummary[name].maxWeight) exerciseSummary[name].maxWeight = s.weight_lbs
    if (date > exerciseSummary[name].lastDate) exerciseSummary[name].lastDate = date
    if (sessionNote && /hurt|pain|injur|sore|tight|brace/i.test(sessionNote)) {
      exerciseSummary[name].injuries.push(`${date}: ${sessionNote}`)
    }
  })

  const exerciseLines = Object.entries(exerciseSummary)
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .map(([name, data]) => {
      const injuryNote = data.injuries.length > 0 ? ` [INJURY/NOTE: ${data.injuries.slice(-1)[0]}]` : ''
      return `- ${name}: ${data.sessions} sets in 90 days, max ${data.maxWeight} lbs, last session ${data.lastDate}${injuryNote}`
    })
    .join('\n')

  const weightLines = bodyWeights?.map(bw => `${bw.date}: ${bw.weight_lbs} lbs`).join(', ') ?? 'No data'

  const systemPrompt = `You are a knowledgeable, encouraging fitness coach analyzing workout data for Perry.

Perry's recent workout data (last 90 days):
${exerciseLines}

Perry's body weight (most recent first): ${weightLines}

Use this data to give specific, data-driven answers. Reference actual numbers and dates. If Perry asks about a specific exercise, focus on that exercise's trends. Note injuries or fatigue patterns when relevant. Be concise and practical.`

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })

  const chat = model.startChat({
    history: [
      { role: 'user', parts: [{ text: systemPrompt }] },
      { role: 'model', parts: [{ text: 'Understood. I have access to your workout data and am ready to help analyze your progress and answer your questions.' }] },
      ...(history ?? []).map((m: { role: string; content: string }) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      })),
    ],
  })

  const result = await chat.sendMessage(message)
  const text = result.response.text()

  return NextResponse.json({ reply: text })
}
