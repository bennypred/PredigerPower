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
