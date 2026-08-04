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

  const { message, history, fullData } = await req.json()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: goals } = await supabase
    .from('user_goals')
    .select('content')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const { data: bodyWeights } = await supabase
    .from('body_weight')
    .select('date, weight_lbs')
    .eq('user_id', user.id)
    .order('date', { ascending: false })
    .limit(10)

  const goalsLines = goals && goals.length > 0
    ? goals.map((g, i) => `${i + 1}. ${g.content}`).join('\n')
    : 'No goals set yet.'

  const weightLines = bodyWeights?.map(bw => `${bw.date}: ${bw.weight_lbs} lbs`).join(', ') ?? 'No data'

  let workoutContext: string

  if (fullData) {
    // Full raw data mode — fetch all sets ever
    const { data: allSets } = await supabase
      .from('workout_sets')
      .select('weight_lbs, reps, notes, exercises(name), workout_sessions!inner(date, user_id, notes)')
      .eq('workout_sessions.user_id', user.id)
      .limit(500)

    const byExercise: Record<string, string[]> = {}
    allSets?.forEach((s: any) => {
      const name = s.exercises?.name ?? 'Unknown'
      const date = s.workout_sessions?.date ?? ''
      const note = s.notes ? ` (note: ${s.notes})` : ''
      if (!byExercise[name]) byExercise[name] = []
      byExercise[name].push(`${date}: ${s.weight_lbs ?? 0}lbs × ${s.reps ?? 0} reps${note}`)
    })

    workoutContext = Object.entries(byExercise)
      .map(([name, sets]) => `${name}:\n${sets.join('\n')}`)
      .join('\n\n')

    workoutContext = `FULL HISTORICAL DATA (all sets ever logged):\n\n${workoutContext}`
  } else {
    // Smart summary mode — recent detail + all-time summary
    const { data: recentSets } = await supabase
      .from('workout_sets')
      .select('weight_lbs, reps, notes, exercises(name), workout_sessions!inner(date, user_id, notes)')
      .eq('workout_sessions.user_id', user.id)
      .gte('workout_sessions.date', thirtyDaysAgo.toISOString().split('T')[0])
      .limit(300)

    const { data: allSets } = await supabase
      .from('workout_sets')
      .select('weight_lbs, reps, exercises(name), workout_sessions!inner(date, user_id)')
      .eq('workout_sessions.user_id', user.id)
      .limit(500)

    // Build all-time summary per exercise
    const allTime: Record<string, { maxWeight: number; totalSets: number; firstDate: string; lastDate: string; weightHistory: number[] }> = {}
    allSets?.forEach((s: any) => {
      const name = s.exercises?.name ?? 'Unknown'
      const date = s.workout_sessions?.date ?? ''
      const w = s.weight_lbs ?? 0
      if (!allTime[name]) allTime[name] = { maxWeight: 0, totalSets: 0, firstDate: date, lastDate: date, weightHistory: [] }
      allTime[name].totalSets++
      if (w > allTime[name].maxWeight) allTime[name].maxWeight = w
      if (date < allTime[name].firstDate) allTime[name].firstDate = date
      if (date > allTime[name].lastDate) allTime[name].lastDate = date
      allTime[name].weightHistory.push(w)
    })

    // Build recent detail per exercise (last 30 days, grouped by session date)
    const recent: Record<string, { date: string; weight: number; reps: number; note: string }[]> = {}
    recentSets?.forEach((s: any) => {
      const name = s.exercises?.name ?? 'Unknown'
      const note = s.notes ?? ''
      if (!recent[name]) recent[name] = []
      recent[name].push({ date: s.workout_sessions?.date ?? '', weight: s.weight_lbs ?? 0, reps: s.reps ?? 0, note })
    })

    const summaryLines = Object.entries(allTime)
      .sort((a, b) => b[1].totalSets - a[1].totalSets)
      .map(([name, data]) => {
        const trend = data.weightHistory.length >= 4
          ? (() => {
              const half = Math.floor(data.weightHistory.length / 2)
              const early = data.weightHistory.slice(0, half).reduce((a, b) => a + b, 0) / half
              const late = data.weightHistory.slice(-half).reduce((a, b) => a + b, 0) / half
              return late > early * 1.05 ? '↑ trending up' : late < early * 0.95 ? '↓ trending down' : '→ stable'
            })()
          : ''
        return `- ${name}: ${data.totalSets} total sets, max ${data.maxWeight} lbs, first logged ${data.firstDate}, last ${data.lastDate}${trend ? `, ${trend}` : ''}`
      })
      .join('\n')

    const recentLines = Object.entries(recent)
      .map(([name, sets]) => {
        const rows = sets.map(s => `  ${s.date}: ${s.weight}lbs × ${s.reps} reps${s.note ? ` (${s.note})` : ''}`).join('\n')
        return `${name}:\n${rows}`
      })
      .join('\n')

    workoutContext = `ALL-TIME EXERCISE SUMMARY:\n${summaryLines}\n\nRECENT DETAIL (last 30 days):\n${recentLines}`
  }

  const dataNote = fullData
    ? ''
    : `\nIf a question requires a specific date, exact set, or granular detail not shown above, respond with [NEEDS_FULL_DATA: one sentence explaining what you need] and nothing else — the app will offer to reload with full history.`

  const systemPrompt = `You are a knowledgeable, encouraging fitness coach analyzing workout data for Perry.

Perry's goals:
${goalsLines}

${workoutContext}

Perry's body weight (most recent first): ${weightLines}

Always keep Perry's goals in mind when answering. Reference them when relevant. Use workout data to give specific, data-driven answers. Be concise and practical.${dataNote}`

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

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
  } catch (err: any) {
    console.error('Chat error:', err)
    return NextResponse.json({ error: err.message ?? 'Gemini error' }, { status: 500 })
  }
}
