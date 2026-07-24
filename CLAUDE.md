# Gym Buddy — Project State

## Summary
Personal workout tracking web app for Perry (perrysessions@gmail.com). Next.js 16 App Router + Supabase + Tailwind CSS v4 + Recharts + Google Gemini API (free tier). Live at **gym-buddy-livid.vercel.app** (GitHub repo: perrysessions/GymBuddy). Runs locally at `localhost:3000` via `cd gym-buddy && npm run dev`. Every `git push` to main auto-redeploys on Vercel.

The import pipeline supports two formats: (1) Apple Notes text with em-dash `–` exercise headers at minimum indentation, (2) plain text with exercise name on its own line and sessions starting with `Jan 3, 2025:` style dates. Client-side JS splits into ~12k-char chunks → each sent as one Gemini API call to `gemini-2.5-flash` → compact JSON remapped to full format → preview → save. Parse route auto-retries up to 3× on 503 with backoff. Do NOT use `responseMimeType: 'application/json'` — causes 429. Do NOT use a multi-model fallback loop.

Data is fully imported. Common issues: (1) wrong years from import — use Bulk Edit Years on exercise detail page; (2) duplicate exercise names from import — use Merge into… button on exercise detail page to consolidate all sets into one record.

## Stack & Key Files
- `app/(app)/dashboard/` — Dashboard: exercise line chart with 4-metric toggle, Top Exercises (30d/90d/6mo/1yr/All, tap to update chart), Workouts list (searchable), Upper vs Lower Volume bar chart (hidden until exercises are tagged upper/lower), then 3 analytics charts: (1) Body Weight — raw daily line chart with `+ Log Weight` inline form; (2) Workout Frequency — sessions/week line chart last 26 weeks; (3) Correlation — all metrics normalized 0–100% of all-time peak, toggleable pill buttons (Body Weight, Sessions/week, Avg Volume, Avg Reps, Avg Sets/workout), Body Weight on by default. Nav uses Lucide React icons (LayoutDashboard, PenLine, Dumbbell, Bot, Upload, User). `allExerciseRows` includes `category` field. Uses `force-dynamic` + `noStore()` + paginated Supabase queries (`.range()` loop, 1000 rows/page) — never use `.limit()` alone for large datasets.
- `app/(app)/session/[id]/` — Session detail: date, PR compliments, per-exercise bar charts + set tables. "Merge into…" button moves all sets from this session into another session on the same date (shows exercise names in picker) then deletes this one. "Delete workout" button with confirm modal.
- `app/(app)/exercise/[id]/` — Exercise detail: category dropdown (upper/lower/core/cardio/other, saves on change), inline name rename (click name → input), 4-metric chart toggle, PR weight + Best Set (max weight×reps in a single set) in header, + Log button (links to /log?exercise=id), Merge into…, Bulk Edit Years, per-session Edit/Delete. If exercise has 0 sessions, shows "Delete this exercise" button. Uses `noStore()` — required so renames reflect immediately on return.
- `app/(app)/log/` — Log a workout manually. Default: merges sets into an existing session for the same date (upsert by date). "New separate session" checkbox creates a fresh session row. Accepts `?exercise=<id>` query param to pre-populate an exercise.
- `app/(app)/import/` — Paste notes → Prepare (auto-chunks, detects format) → Review chunks → Parse with AI → Preview → Save.
- `app/(app)/chat/` — Persistent AI chat. Desktop: left sidebar with all sessions. Mobile: "☰ Chats" button opens bottom sheet. New Chat button, search, delete. Session title = first message. Messages persisted in `chat_sessions` + `chat_messages` Supabase tables. Daily usage bar (50-chat limit in localStorage). Only visible if `user_profiles.is_ai_enabled = true`. NOTE: chat_sessions insert must include `user_id` — RLS rejects rows without it (was a bug, now fixed).
- `app/api/chat/route.ts` — Gemini chat (`gemini-2.5-flash`), checks is_ai_enabled server-side, injects 90-day workout context, try/catch returns JSON errors.
- `app/api/parse-notes/route.ts` — Single Gemini call, compact JSON prompt, remaps short keys, retries on 503.
- `app/login/page.tsx` — Log In / Sign Up / Forgot Password (Supabase reset email → `/reset-password`).
- `app/reset-password/page.tsx` — Set new password after clicking email link.
- `components/Nav.tsx` — Desktop sidebar + mobile bottom bar. Uses Lucide React icons (Sun, Moon, User, etc.). Profile button opens popup/sheet with Light/Dark mode toggle (persisted in localStorage, anti-flash inline script in layout.tsx), Change Password, Sign Out.
- `lib/supabase.ts` / `lib/supabase-server.ts` — Browser and server Supabase clients.
- `supabase-schema.sql` — Full schema (already run). `supabase-drop.sql` — drop script.

## Database
Tables: `exercises`, `workout_sessions`, `workout_sets`, `body_weight`, `user_profiles`, `chat_sessions`, `chat_messages`. All have RLS. `reps` is `NUMERIC(4,1)` for half-rep support. `exercises` RLS has SELECT, INSERT, UPDATE, and DELETE policies (all require `auth.uid() is not null`). `user_profiles.is_ai_enabled` defaults false; DB trigger sets true for perrysessions@gmail.com on signup. If profile row missing: `INSERT INTO user_profiles (id, email, is_ai_enabled) SELECT id, email, true FROM auth.users WHERE email = 'perrysessions@gmail.com';`

`chat_sessions (id, user_id, title, created_at, updated_at)` — RLS: auth.uid() = user_id
`chat_messages (id, session_id, role, content, created_at)` — RLS: session owned by user

## Vercel Deployment
Env vars in Vercel dashboard → Settings → Environment Variables:
- `NEXT_PUBLIC_SUPABASE_URL` — public (safe)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — public (safe, RLS protects data)
- `GEMINI_API_KEY` — server-only, never reaches browser

To do: add gym-buddy-livid.vercel.app to Supabase → Authentication → URL Configuration → Redirect URLs so forgot-password email links work.

## Rules
- NEVER expose `GEMINI_API_KEY` — server-side only
- NEVER use `responseMimeType: 'application/json'` in Gemini config — causes 429
- NEVER use a multi-model fallback loop — one model per call
- Email confirmation is ON in Supabase (intentional)
- JWT expiry set to max in Supabase Auth Settings
- `devIndicators: false` in `next.config.ts`
- Apple Notes uses `–` em-dashes; plain text format uses `MonthName D, YYYY:` date prefixes
- Dashboard Supabase query must use paginated `.range()` loop — server caps at 1000 rows per request

## What's Left
1. Add Vercel URL to Supabase redirect URLs (for forgot-password links)
2. Fix exercise names with embedded YouTube URLs (import artifact)
