export interface Exercise {
  id: string
  name: string
  category: string
}

export interface WorkoutSession {
  id: string
  user_id: string
  date: string
  notes: string | null
}

export interface WorkoutSet {
  id: string
  session_id: string
  exercise_id: string
  set_number: number
  weight_lbs: number | null
  reps: number | null
  notes: string | null
  exercises?: Exercise
}

export interface BodyWeight {
  id: string
  user_id: string
  date: string
  weight_lbs: number
  source: string
}

export interface UserProfile {
  id: string
  email: string
  is_ai_enabled: boolean
}

export interface SessionWithSets extends WorkoutSession {
  workout_sets: (WorkoutSet & { exercises: Exercise })[]
}
