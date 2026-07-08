import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { createServerSupabaseClient } from '@/lib/supabase-server'

const PROMPT = `You are parsing raw handwritten gym workout notes into compact structured JSON.

The notes have this structure:
- Top-level lines (starting with "- ") are exercise names, sometimes with YouTube URLs
- Indented lines below each exercise are individual workout sessions

Return ONLY a valid JSON array — no markdown, no explanation, just the raw array.
Be as compact as possible — omit null fields, use short keys.

Each element represents one exercise:
{
  "on": "Official exercise name (e.g. 'Barbell Bench Press')",
  "un": "Name exactly as written in notes",
  "yt": ["YouTube URLs for this exercise only"],
  "s": [
    {
      "d": "YYYY-MM-DD or null",
      "mw": 135.0,
      "ar": 9.3,
      "sc": 3,
      "n": "short session notes if any",
      "i": true,
      "sets": [[135,10],[135,9],[135,8]]
    }
  ]
}

Field meanings: on=official name, un=user name, yt=youtube urls, s=sessions,
d=date, mw=max weight, ar=avg reps, sc=set count, n=notes, i=injury flag,
sets=array of [weight,reps] pairs (omit if all same weight as mw and reps=ar)

Parsing rules:
- "each side"/"each" = weight per side, use that number
- "barely X" = X-0.5, "X and a half" = X+0.5, "?" = use the number, "ish"/"~" = round to 0.5
- injury flag true if: hurt, pain, injur, sore, tight, brace, wrist, recovery, ache, strain
- "Week N" with no calendar date = d:null
- Dates without year: assume 2025 unless explicitly 2026
- Move YouTube URLs to yt array, not notes
- Skip lines with no parseable workout data
- SKIP the "Scale weigh in" section entirely`

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rawNotes } = await req.json()
  if (!rawNotes) return NextResponse.json({ error: 'Missing rawNotes' }, { status: 400 })

  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

  const delay = (ms: number) => new Promise(r => setTimeout(r, ms))

  try {
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { maxOutputTokens: 65536 },
    })
    // Retry up to 3 times on 503 (server overload), with backoff
    let result: any
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        result = await model.generateContent([PROMPT, rawNotes])
        break
      } catch (e: any) {
        const is503 = String(e).includes('503') || String(e).includes('Service Unavailable')
        if (is503 && attempt < 2) {
          await delay(3000 * (attempt + 1))
          continue
        }
        throw e
      }
    }
    const text = result.response.text().trim()
    const clean = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim()
    const compact = JSON.parse(clean)
    // Remap compact keys back to full format expected by the import UI
    const parsed = compact.map((ex: any) => ({
      official_name: ex.on ?? ex.official_name ?? ex.un,
      user_name: ex.un ?? ex.user_name ?? ex.on,
      youtube_urls: ex.yt ?? ex.youtube_urls ?? [],
      sessions: (ex.s ?? ex.sessions ?? []).map((sess: any) => {
        const sets = (sess.sets ?? []).map((pair: any, i: number) =>
          Array.isArray(pair)
            ? { set_number: i + 1, weight_lbs: pair[0] ?? null, reps: pair[1] ?? null }
            : pair
        )
        return {
          date: sess.d ?? sess.date ?? null,
          date_label: sess.dl ?? sess.date_label ?? sess.d ?? null,
          sets,
          max_weight: sess.mw ?? sess.max_weight ?? null,
          avg_reps: sess.ar ?? sess.avg_reps ?? null,
          session_notes: sess.n ?? sess.session_notes ?? null,
          injury_flag: sess.i ?? sess.injury_flag ?? false,
        }
      }),
    }))
    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('Gemini parse failed:', String(err).slice(0, 400))
    return NextResponse.json({ error: 'Gemini parse failed', detail: String(err) }, { status: 500 })
  }
}
