# Gym Buddy — Project State

## Summary
Personal workout tracking web app for Perry (perrysessions@gmail.com). Next.js 16 App Router + Supabase + Tailwind CSS v4 + Recharts + Google Gemini API (free tier). Runs locally at `localhost:3000` via `cd gym-buddy && npm run dev`. Not yet deployed to Vercel. All core features are built and working with 2+ years of real workout data imported.

The import pipeline works as follows: paste Apple Notes text → client-side JS splits it into ~12k-char chunks by detecting exercise headers (using em-dash `–` at minimum indentation level) → each chunk sent as one Gemini API call to `gemini-2.5-flash` → compact JSON response remapped to full format → preview table → save to Supabase. The Gemini key is in `.env.local` as `GEMINI_API_KEY` (server-side only, never public). Do NOT use `responseMimeType: 'application/json'` in Gemini config — causes 429. Do NOT use a model fallback loop — wastes quota. One model, one call per chunk.

Data is fully imported. The main data quality issue is that some sessions got wrong years (e.g. 2025 vs 2026) during import. The exercise detail page has both per-session Edit mode (date, sets, weight, reps) and a Bulk Edit Years tool (checkboxes + year input + Apply) to fix this.

## Stack & Key Files
- `app/(app)/dashboard/` — Dashboard with bench press chart, body weight chart, Top Exercises (30d/90d/6mo/1yr/All toggle), Workouts list (all sessions, searchable, scrollable). Clicking a workout goes to `/session/[id]`.
- `app/(app)/session/[id]/` — Session detail: date, compliments (PRs, first exercises, volume milestones), per-exercise bar charts + set tables.
- `app/(app)/exercise/[id]/` — Exercise detail: max weight + volume charts, full session history with Edit button (inline editing of date/sets/weight/reps, add/delete sets) and Bulk Edit Years mode.
- `app/(app)/log/` — Log a workout manually.
- `app/(app)/import/` — Paste notes → Prepare (auto-chunks) → Review chunks → Parse with AI → Preview → Save.
- `app/(app)/chat/` — AI chat with Gemini. Shows daily usage bar (50 chat limit tracked in localStorage). Only visible if `user_profiles.is_ai_enabled = true`.
- `app/api/chat/route.ts` — Gemini chat, checks is_ai_enabled server-side, injects 90-day workout context.
- `app/api/parse-notes/route.ts` — Single Gemini call, compact JSON prompt, remaps short keys back to full format.
- `components/Nav.tsx` — Desktop sidebar + mobile bottom bar. Hides AI Chat if !isAiEnabled.
- `lib/supabase.ts` / `lib/supabase-server.ts` — Browser and server Supabase clients.
- `supabase-schema.sql` — Full schema (already run). `supabase-drop.sql` — drop script.

## Database
Tables: `exercises`, `workout_sessions`, `workout_sets`, `body_weight`, `user_profiles`. All have RLS (users see only their own data). `reps` is `NUMERIC(4,1)` for half-rep support (e.g. 8.5). `user_profiles.is_ai_enabled` defaults false; a DB trigger sets it true for perrysessions@gmail.com on signup. If the profile row is missing (trigger didn't fire), run: `INSERT INTO user_profiles (id, email, is_ai_enabled) SELECT id, email, true FROM auth.users WHERE email = 'perrysessions@gmail.com';`

## Rules
- NEVER expose `GEMINI_API_KEY` — server-side only
- NEVER use `responseMimeType: 'application/json'` in Gemini config
- NEVER use a multi-model fallback loop — one model per call
- Email confirmation is ON in Supabase (intentional)
- JWT expiry set to max in Supabase Auth Settings
- `devIndicators: false` in `next.config.ts` (removes the floating N dev badge)
- Apple Notes uses `–` em-dashes, not `-` hyphens — import chunker handles this
- Exercise headers in pasted notes are detected by minimum indentation level, not zero indent

## What's Left
1. Deploy to Vercel (add env vars: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, GEMINI_API_KEY)
2. Fix exercise names that have YouTube URLs embedded in them (import artifact — e.g. "Ab leg raises https://...")
3. Body weight manual entry page (can view chart but can't add entries without importing)
4. Data cleanup: some sessions have wrong years from import — use Bulk Edit Years on exercise pages to fix
