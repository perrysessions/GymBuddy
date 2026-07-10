-- Run this in the Supabase SQL editor

-- Exercises lookup table (shared, not per-user)
create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text not null default 'other'
);

-- Workout sessions
create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  notes text,
  created_at timestamptz default now()
);

-- Sets within a session (reps as numeric to support 8.5 half reps)
create table workout_sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  set_number int not null,
  weight_lbs numeric(6,1),
  reps numeric(4,1),
  notes text,
  created_at timestamptz default now()
);

-- Body weight log
create table body_weight (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  weight_lbs numeric(5,1) not null,
  source text default 'scale',
  created_at timestamptz default now()
);

-- User profiles (for AI access control)
create table user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  is_ai_enabled boolean not null default false,
  created_at timestamptz default now()
);

-- Auto-create profile on signup; grant AI to perrysessions@gmail.com only
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into user_profiles (id, email, is_ai_enabled)
  values (
    new.id,
    new.email,
    new.email = 'perrysessions@gmail.com'
  );
  return new;
exception when others then
  return new; -- never block signup even if profile insert fails
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- Row Level Security
alter table workout_sessions enable row level security;
alter table workout_sets enable row level security;
alter table body_weight enable row level security;
alter table user_profiles enable row level security;

-- workout_sessions: users see only their own
create policy "own sessions" on workout_sessions
  for all using (auth.uid() = user_id);

-- workout_sets: users see only sets in their sessions
create policy "own sets" on workout_sets
  for all using (
    exists (
      select 1 from workout_sessions
      where workout_sessions.id = workout_sets.session_id
        and workout_sessions.user_id = auth.uid()
    )
  );

-- body_weight: users see only their own
create policy "own weight" on body_weight
  for all using (auth.uid() = user_id);

-- user_profiles: users see only their own
create policy "own profile" on user_profiles
  for all using (auth.uid() = id);

-- exercises: public read, only authenticated can insert
create policy "read exercises" on exercises
  for select using (true);
create policy "insert exercises" on exercises
  for insert with check (auth.uid() is not null);
create policy "update exercises" on exercises
  for update using (auth.uid() is not null);
create policy "delete exercises" on exercises
  for delete using (auth.uid() is not null);

alter table exercises enable row level security;
