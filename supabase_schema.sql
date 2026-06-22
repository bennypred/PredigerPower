-- ============================================================
-- Prediger Power Performance — Supabase Schema
-- ============================================================
-- Run this entire file in your Supabase SQL editor:
--   supabase.com → your project → SQL Editor → New Query
-- ============================================================

-- Enable UUID support
create extension if not exists "uuid-ossp";

-- ── Profiles ─────────────────────────────────────────────────
create table if not exists profiles (
  id            uuid  references auth.users on delete cascade primary key,
  email         text  unique not null,
  full_name     text  not null,
  role          text  not null default 'athlete'
                      check (role in ('athlete', 'trainer')),
  athlete_code  text  unique,
  sport         text,
  gender        text,
  age           integer,
  grade         text,
  created_at    timestamptz default now()
);

-- ── Workouts ──────────────────────────────────────────────────
create table if not exists workouts (
  id             uuid default uuid_generate_v4() primary key,
  title          text not null,
  description    text,
  scheduled_date date not null,
  athlete_id     uuid references profiles(id) on delete cascade, -- null = all athletes
  group_id       text,                                            -- localStorage group id
  created_by     uuid references profiles(id) not null,
  notes          text,
  created_at     timestamptz default now()
);
create index if not exists workouts_date_idx    on workouts(scheduled_date);
create index if not exists workouts_athlete_idx on workouts(athlete_id);

-- ── Exercises ─────────────────────────────────────────────────
create table if not exists exercises (
  id             uuid default uuid_generate_v4() primary key,
  workout_id     uuid references workouts(id) on delete cascade not null,
  name           text not null,
  "group"        text,
  group_order    integer default 0,
  sets           integer,
  reps           integer,
  target_weight  numeric,
  notes          text,
  order_index    integer default 0,
  track_as       text check (track_as in ('lift', 'metric', 'none') or track_as is null)
);

-- ── Workout Logs (per-exercise per-day summary) ───────────────
create table if not exists workout_logs (
  id             uuid default uuid_generate_v4() primary key,
  exercise_id    uuid references exercises(id) on delete cascade not null,
  athlete_id     uuid references profiles(id) on delete cascade not null,
  logged_date    date not null default current_date,
  actual_sets    integer,
  actual_reps    integer,
  actual_weight  numeric,
  notes          text,
  created_at     timestamptz default now(),
  unique (exercise_id, athlete_id, logged_date)
);

-- ── Performance Metrics ────────────────────────────────────────
create table if not exists performance_metrics (
  id            uuid default uuid_generate_v4() primary key,
  athlete_id    uuid references profiles(id) on delete cascade not null,
  metric_type   text not null,   -- open-ended: body_weight, vertical_jump, sprint_40yd, custom names, etc.
  value         numeric not null,
  unit          text not null,
  recorded_date date not null default current_date,
  notes         text,
  created_at    timestamptz default now(),
  unique (athlete_id, metric_type, recorded_date)
);
create index if not exists metrics_athlete_idx on performance_metrics(athlete_id);
create index if not exists metrics_type_idx    on performance_metrics(metric_type);

-- ── Messages ──────────────────────────────────────────────────
create table if not exists messages (
  id            uuid default uuid_generate_v4() primary key,
  author_id     uuid references profiles(id) on delete cascade not null,
  recipient_id  uuid references profiles(id) on delete cascade,  -- null = public
  content       text not null,
  is_pinned     boolean default false,
  created_at    timestamptz default now()
);
create index if not exists messages_recipient_idx on messages(recipient_id);

-- ════════════════════════════════════════════════════════════
-- Row Level Security
-- ════════════════════════════════════════════════════════════
alter table profiles            enable row level security;
alter table workouts            enable row level security;
alter table exercises           enable row level security;
alter table workout_logs        enable row level security;
alter table performance_metrics enable row level security;
alter table messages            enable row level security;

-- Helper: get current user's role
create or replace function current_role_p3()
returns text language sql stable security definer as
$$ select role from profiles where id = auth.uid() $$;

-- ── Profiles policies ─────────────────────────────────────────
create policy "view own or all if trainer" on profiles for select
  using (auth.uid() = id or current_role_p3() = 'trainer');

create policy "update own profile" on profiles for update
  using (auth.uid() = id);

create policy "trainer updates profiles" on profiles for update
  using (current_role_p3() = 'trainer');

-- ── Workouts policies ─────────────────────────────────────────
create policy "athletes view own workouts" on workouts for select
  using (athlete_id = auth.uid() or athlete_id is null or current_role_p3() = 'trainer');

create policy "trainers manage workouts" on workouts for all
  using  (current_role_p3() = 'trainer')
  with check (current_role_p3() = 'trainer');

-- ── Exercises policies ────────────────────────────────────────
create policy "view exercises of visible workouts" on exercises for select
  using (
    exists (
      select 1 from workouts w where w.id = workout_id
      and (w.athlete_id = auth.uid() or w.athlete_id is null or current_role_p3() = 'trainer')
    )
  );

create policy "trainers manage exercises" on exercises for all
  using  (current_role_p3() = 'trainer')
  with check (current_role_p3() = 'trainer');

-- ── Workout logs policies ─────────────────────────────────────
create policy "athletes manage own logs" on workout_logs for all
  using (athlete_id = auth.uid() or current_role_p3() = 'trainer')
  with check (athlete_id = auth.uid() or current_role_p3() = 'trainer');

-- ── Performance metrics policies ──────────────────────────────
create policy "athletes manage own metrics" on performance_metrics for all
  using (athlete_id = auth.uid() or current_role_p3() = 'trainer')
  with check (athlete_id = auth.uid() or current_role_p3() = 'trainer');

-- ── Messages policies ─────────────────────────────────────────
create policy "view messages" on messages for select
  using (
    recipient_id is null
    or recipient_id = auth.uid()
    or author_id = auth.uid()
    or current_role_p3() = 'trainer'
  );

create policy "post messages" on messages for insert
  with check (author_id = auth.uid());

create policy "delete own or trainer" on messages for delete
  using (author_id = auth.uid() or current_role_p3() = 'trainer');

-- ════════════════════════════════════════════════════════════
-- Workouts by athlete code (for kiosk / code-login athletes)
-- ════════════════════════════════════════════════════════════
-- Allows fetching workouts without a Supabase auth session.
-- Caller must know the athlete code, which is the same
-- credential required for code login — no extra exposure.
create or replace function get_athlete_workouts_by_code(
  p_code  text,
  p_start date,
  p_end   date
)
returns table (
  id             uuid,
  title          text,
  description    text,
  scheduled_date date,
  athlete_id     uuid,
  group_id       text,
  notes          text,
  created_at     timestamptz,
  exercises      jsonb
)
language sql security definer stable as $$
  with athlete as (
    select id from profiles where athlete_code = upper(trim(p_code)) limit 1
  )
  select
    w.id, w.title, w.description, w.scheduled_date,
    w.athlete_id, w.group_id, w.notes, w.created_at,
    coalesce(
      (select jsonb_agg(to_jsonb(e) order by e.order_index)
       from exercises e where e.workout_id = w.id),
      '[]'::jsonb
    ) as exercises
  from workouts w
  cross join athlete a
  where w.scheduled_date between p_start and p_end
    and (w.athlete_id = a.id or w.athlete_id is null)
  order by w.scheduled_date;
$$;

-- ════════════════════════════════════════════════════════════
-- Auto-create profile on signup
-- ════════════════════════════════════════════════════════════
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'athlete')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ════════════════════════════════════════════════════════════
-- Migration — run the block below if you've already run the schema above
-- ════════════════════════════════════════════════════════════

-- 1. Add % of 1RM fields to exercises (used by the % range feature in workouts)
alter table exercises add column if not exists pct_min integer;
alter table exercises add column if not exists pct_max integer;

-- 2. Kiosk save RPC
--    Saves metrics + lift logs for an athlete identified by their 3-digit code.
--    Runs as security definer so kiosk sessions (no auth token) can write data.
create or replace function save_kiosk_log(
  p_code          text,
  p_date          date,
  p_metrics       jsonb,   -- { metric_type: { value: number, unit: string } }
  p_exercise_logs jsonb    -- [{ exercise_id, actual_sets, actual_reps, actual_weight, notes }]
)
returns void
language plpgsql security definer as $$
declare
  v_athlete_id uuid;
begin
  select id into v_athlete_id
  from profiles
  where athlete_code = upper(trim(p_code))
  limit 1;

  if v_athlete_id is null then
    raise exception 'athlete not found for code %', p_code;
  end if;

  -- Save performance metrics
  if p_metrics is not null then
    insert into performance_metrics (athlete_id, metric_type, value, unit, recorded_date)
    select
      v_athlete_id,
      key,
      (value->>'value')::numeric,
      value->>'unit',
      p_date
    from jsonb_each(p_metrics)
    on conflict (athlete_id, metric_type, recorded_date)
    do update set value = excluded.value, unit = excluded.unit;
  end if;

  -- Save workout / lift logs
  if p_exercise_logs is not null then
    insert into workout_logs (exercise_id, athlete_id, logged_date, actual_sets, actual_reps, actual_weight, notes)
    select
      (log->>'exercise_id')::uuid,
      v_athlete_id,
      p_date,
      (log->>'actual_sets')::integer,
      (log->>'actual_reps')::integer,
      (log->>'actual_weight')::numeric,
      log->>'notes'
    from jsonb_array_elements(p_exercise_logs) as log
    on conflict (exercise_id, athlete_id, logged_date)
    do update set
      actual_sets   = excluded.actual_sets,
      actual_reps   = excluded.actual_reps,
      actual_weight = excluded.actual_weight,
      notes         = excluded.notes;
  end if;
end;
$$;

-- 3. Open up read access so the leaderboard works for all athletes
--    (the original policies restricted athletes to their own data only)

-- Profiles: allow any signed-in user to see all profiles (needed for name display in leaderboard)
drop policy if exists "view own or all if trainer" on profiles;
create policy "authenticated users view all profiles" on profiles for select
  using (auth.uid() is not null);

-- Exercises: allow any signed-in user to read exercises (needed for leaderboard lift name joins)
drop policy if exists "view exercises of visible workouts" on exercises;
create policy "authenticated users view all exercises" on exercises for select
  using (auth.uid() is not null);

-- Workout logs: allow any signed-in user to read all logs (needed for lift rankings in leaderboard)
drop policy if exists "view all logs for leaderboard" on workout_logs;
create policy "view all logs for leaderboard" on workout_logs for select
  using (auth.uid() is not null);

-- Performance metrics: allow any signed-in user to read all metrics (needed for metric rankings)
drop policy if exists "view all metrics for leaderboard" on performance_metrics;
create policy "view all metrics for leaderboard" on performance_metrics for select
  using (auth.uid() is not null);

-- 4. Food Logs table
--    Athletes log what they ate per meal per day.
--    Trainers can read all logs; athletes can only read/write their own.
create table if not exists food_logs (
  id          uuid default uuid_generate_v4() primary key,
  athlete_id  uuid references profiles(id) on delete cascade not null,
  log_date    date not null,
  breakfast   text,
  lunch       text,
  dinner      text,
  snacks      text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now(),
  unique (athlete_id, log_date)
);
alter table food_logs enable row level security;

create policy "athletes manage own food logs" on food_logs for all
  using  (athlete_id = auth.uid() or current_role_p3() = 'trainer')
  with check (athlete_id = auth.uid() or current_role_p3() = 'trainer');

-- ════════════════════════════════════════════════════════════
-- Setup checklist
-- ════════════════════════════════════════════════════════════
-- 1. Run this SQL in: supabase.com → your project → SQL Editor
-- 2. Go to Authentication → Settings → turn OFF "Enable email confirmations"
-- 3. Create your admin account:
--      Authentication → Users → Add User (your email, your password)
--      Then run: UPDATE profiles SET role = 'trainer', athlete_code = '100'
--                WHERE email = 'your@email.com';
-- 4. Fill in js/config.js:
--      SUPABASE_URL  → Project Settings → API → Project URL
--      SUPABASE_ANON → Project Settings → API → anon/public key
--      SUPABASE_SERVICE_ROLE → Project Settings → API → service_role key  (keep private!)
-- 5. Set DEMO_MODE = false in js/config.js
-- ════════════════════════════════════════════════════════════
