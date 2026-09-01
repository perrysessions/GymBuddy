import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { food } = await req.json()
  if (!food?.trim()) return NextResponse.json({ error: 'Food required' }, { status: 400 })

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' })

  const prompt = `Estimate the macros for: "${food.trim()}"

Reply with ONLY a JSON object, no markdown, no explanation:
{"calories":NUMBER,"protein_g":NUMBER,"carbs_g":NUMBER,"fat_g":NUMBER,"sugar_g":NUMBER}

Use realistic average serving size if not specified. Round to nearest whole number.`

  try {
    const result = await model.generateContent(prompt)
    const text = result.response.text().trim()
    const json = JSON.parse(text.replace(/```json?|```/g, '').trim())
    return NextResponse.json(json)
  } catch {
    return NextResponse.json({ error: 'Could not estimate macros' }, { status: 500 })
  }
}
