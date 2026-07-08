export interface ParsedSet {
  set_number: number
  weight_lbs: number | null
  reps: number | null
  notes: string | null
}

export interface ParsedSession {
  exerciseName: string
  date: string      // ISO date string YYYY-MM-DD
  sets: ParsedSet[]
  raw: string
  warning?: string
}

export interface ParsedBodyWeight {
  date: string
  weight_lbs: number
  source: string
}

// Known month abbreviations
const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  july: 6, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
}

function parseDate(text: string, defaultYear = 2025): string | null {
  // Match "July 7th", "Aug 1", "Sept 22", "Jan 2 2026", "Jan 2026", "Week N" (skip weeks)
  const fullDate = text.match(/\b(jan|feb|mar|apr|may|jun|july|jul|aug|sep|sept|oct|nov|dec)\w*\s+(\d{1,2})(?:st|nd|rd|th)?\s*(?:(\d{4}))?\b/i)
  if (fullDate) {
    const month = MONTHS[fullDate[1].toLowerCase().slice(0, 4)] ?? MONTHS[fullDate[1].toLowerCase().slice(0, 3)]
    const day = parseInt(fullDate[2])
    // Year: if month is jan-mar and we've been seeing nov/dec, bump year
    let year = fullDate[3] ? parseInt(fullDate[3]) : defaultYear
    if (month !== undefined && !isNaN(day)) {
      return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    }
  }

  // Match "Week N" — return null (no absolute date)
  return null
}

function parseReps(text: string): number | null {
  // Handle "9.5", "9 and a half", "barely 5" -> 4.5, "14!" -> 14
  const clean = text.replace(/!/g, '').trim()

  // "X and a half" or "X.5"
  const half = clean.match(/^(\d+(?:\.\d+)?)\s*(?:and\s+(?:a\s+)?half|\.5)/)
  if (half) return parseFloat(half[1]) + 0.5

  // plain number
  const num = clean.match(/^(\d+(?:\.\d+)?)/)
  if (num) return parseFloat(num[1])

  // "barely X" -> X - 0.5
  const barely = text.match(/barely\s+(\d+(?:\.\d+)?)/i)
  if (barely) return parseFloat(barely[1]) - 0.5

  return null
}

function parseWeight(text: string): number | null {
  const m = text.match(/(\d+(?:\.\d+)?)\s*lbs?/i)
  if (m) return parseFloat(m[1])
  return null
}

// Parse a line like: "set1 10 set2 9 set3 5" or "set 1 10 reps. Set 2 10. set3 8"
// or "40lbs set1 10 50lbs set2 7"
function parseSetsFromLine(line: string, defaultWeight: number | null): ParsedSet[] {
  const sets: ParsedSet[] = []

  // Try to find all "set N <weight?> <reps>" patterns
  // Match patterns like: set1, set 1, S1
  const setPattern = /set\s*(\d+)\s*/gi
  const parts = line.split(setPattern)
  // parts will be: [before set1, "1", after set1, "2", after set2, ...]

  if (parts.length > 1) {
    for (let i = 1; i < parts.length; i += 2) {
      const setNum = parseInt(parts[i])
      const content = (parts[i + 1] ?? '').split(/set\s*\d+/i)[0]

      let weight = parseWeight(content) ?? defaultWeight
      const reps = parseReps(content)

      // Check for right/left notes
      let notes: string | null = null
      const rightLeft = content.match(/right\s+(\d+(?:\.\d+)?)\s+left\s+(\d+(?:\.\d+)?)/i)
        || content.match(/left\s+(\d+(?:\.\d+)?)\s+right\s+(\d+(?:\.\d+)?)/i)
      if (rightLeft) {
        notes = content.trim().replace(/\s+/g, ' ')
      }

      sets.push({ set_number: setNum, weight_lbs: weight, reps: reps, notes })
    }
  }

  // Fallback: if no "set N" pattern, treat as single set
  if (sets.length === 0) {
    const weight = parseWeight(line) ?? defaultWeight
    const reps = parseReps(line)
    if (reps !== null) {
      sets.push({ set_number: 1, weight_lbs: weight, reps, notes: null })
    }
  }

  return sets
}

export function parseWorkoutNotes(text: string): { sessions: ParsedSession[]; bodyWeights: ParsedBodyWeight[] } {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean)

  const sessions: ParsedSession[] = []
  const bodyWeights: ParsedBodyWeight[] = []

  let currentExercise = ''
  let inBodyWeight = false
  let defaultWeight: number | null = null

  for (const line of lines) {
    // Strip leading bullet chars
    const clean = line.replace(/^[-•*]\s*/, '').trim()
    if (!clean) continue

    // Detect exercise header (not a bullet, not starting with a date keyword)
    const isIndented = line.startsWith(' ') || line.startsWith('\t') || line.startsWith('-') || line.startsWith('•') || line.startsWith('*')
    const startsWithDate = /^(jan|feb|mar|apr|may|jun|july|jul|aug|sep|sept|oct|nov|dec|week)/i.test(clean)

    // Body weight section detection
    if (/scale\s*weigh/i.test(clean)) {
      inBodyWeight = true
      currentExercise = ''
      continue
    }

    if (!isIndented && !startsWithDate) {
      // This is an exercise header
      currentExercise = clean.replace(/\s*\(.*?\)\s*/g, '').replace(/\s+/g, ' ').trim()
      inBodyWeight = false
      defaultWeight = parseWeight(clean)
      continue
    }

    if (inBodyWeight) {
      // Parse body weight entries like "Jan 1 2025 home scale 135"
      const date = parseDate(clean, 2025)
      if (!date) continue
      const wm = clean.match(/(\d{3}(?:\.\d+)?)\s*(?:lbs?)?/)
        || clean.match(/(\d{2,3}(?:\.\d+)?)\s*$/)
        || clean.match(/(\d{2,3}(?:\.\d+)?)/)
      const weight = wm ? parseFloat(wm[1]) : null
      if (weight && weight > 80 && weight < 400) {
        const source = /vasa/i.test(clean) ? 'vasa_scale' : 'home_scale'
        bodyWeights.push({ date, weight_lbs: weight, source })
      }
      continue
    }

    if (!currentExercise) continue

    // Try to extract a date from this line
    // Detect year context: if line has 2026 explicitly
    const hasYear2026 = /2026/i.test(clean)
    const hasYear2025 = /2025/i.test(clean)
    const inferredYear = hasYear2026 ? 2026 : hasYear2025 ? 2025 : 2025

    const date = parseDate(clean, inferredYear)

    // Week-based entries (no absolute date) — skip for now
    if (/^week\s+\d+/i.test(clean) && !date) continue

    if (!date) continue

    const lineWeight = parseWeight(clean) ?? defaultWeight
    const sets = parseSetsFromLine(clean, lineWeight)

    // Look for injury/feeling notes
    let warning: string | undefined
    if (/hurt|pain|injur|sore|tight|brace|recovery/i.test(clean)) {
      warning = clean
    }

    if (sets.length > 0) {
      sessions.push({
        exerciseName: currentExercise,
        date,
        sets,
        raw: clean,
        warning,
      })
    }
  }

  return { sessions, bodyWeights }
}
