-- DrinkLeague initial schema
-- Run in Supabase SQL Editor or via supabase db push

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------------
-- Enums / check helpers live as text + CHECK for simplicity
-- ---------------------------------------------------------------------------

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null unique,
  display_name varchar(40) not null,
  avatar_url text,
  role text not null default 'user' check (role in ('user', 'global_admin')),
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  xp bigint not null default 0 check (xp >= 0),
  level int not null default 1 check (level >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz
);

create index users_status_idx on public.users (status);
create index users_global_admin_idx on public.users (role) where role = 'global_admin';

create table public.leagues (
  id uuid primary key default gen_random_uuid(),
  name varchar(60) not null,
  description varchar(280),
  created_by uuid not null references public.users (id) on delete restrict,
  timezone text not null default 'Europe/Madrid',
  status text not null default 'active' check (status in ('active', 'archived', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leagues_created_by_idx on public.leagues (created_by);
create index leagues_status_created_idx on public.leagues (status, created_at desc);

create table public.league_memberships (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'league_admin')),
  status text not null default 'active' check (status in ('active', 'left', 'removed')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (league_id, user_id),
  check (
    (status = 'active' and left_at is null)
    or (status <> 'active')
  )
);

create index league_memberships_user_status_idx
  on public.league_memberships (user_id, status);
create index league_memberships_league_status_joined_idx
  on public.league_memberships (league_id, status, joined_at);

create table public.league_invites (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  code varchar(12) not null,
  token_hash bytea not null,
  is_active boolean not null default true,
  created_by uuid not null references public.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  rotated_at timestamptz,
  expires_at timestamptz
);

create unique index league_invites_active_code_idx
  on public.league_invites (upper(code)) where is_active;
create unique index league_invites_active_token_idx
  on public.league_invites (token_hash) where is_active;
create index league_invites_league_active_idx
  on public.league_invites (league_id, is_active);

create table public.drink_types (
  id smallserial primary key,
  code text not null unique,
  name text not null,
  points int not null check (points > 0),
  sort_order int not null default 0,
  is_active boolean not null default true
);

create table public.venues (
  id uuid primary key default gen_random_uuid(),
  normalized_name citext not null unique,
  display_name varchar(80) not null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.drink_logs (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete restrict,
  user_id uuid not null references public.users (id) on delete restrict,
  venue_id uuid not null references public.venues (id) on delete restrict,
  venue_name_snapshot varchar(80) not null,
  consumed_at timestamptz not null default now(),
  points_total int not null check (points_total > 0),
  season_year int not null,
  week_start_date date not null,
  month_start_date date not null,
  status text not null default 'active' check (status in ('active', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  edited_until timestamptz not null
);

create index drink_logs_league_consumed_idx
  on public.drink_logs (league_id, consumed_at desc) where status = 'active';
create index drink_logs_league_user_consumed_idx
  on public.drink_logs (league_id, user_id, consumed_at desc) where status = 'active';
create index drink_logs_user_consumed_idx
  on public.drink_logs (user_id, consumed_at desc) where status = 'active';
create index drink_logs_league_week_idx
  on public.drink_logs (league_id, week_start_date) where status = 'active';
create index drink_logs_league_month_idx
  on public.drink_logs (league_id, month_start_date) where status = 'active';
create index drink_logs_league_season_idx
  on public.drink_logs (league_id, season_year) where status = 'active';

create table public.drink_log_items (
  id uuid primary key default gen_random_uuid(),
  drink_log_id uuid not null references public.drink_logs (id) on delete cascade,
  drink_type_id smallint not null references public.drink_types (id) on delete restrict,
  quantity int not null check (quantity between 1 and 50),
  unit_points int not null check (unit_points > 0),
  line_points int generated always as (quantity * unit_points) stored,
  unique (drink_log_id, drink_type_id)
);

create index drink_log_items_type_idx on public.drink_log_items (drink_type_id);

create table public.leaderboard_weekly (
  league_id uuid not null references public.leagues (id) on delete cascade,
  week_start_date date not null,
  user_id uuid not null references public.users (id) on delete cascade,
  points int not null default 0 check (points >= 0),
  logs_count int not null default 0 check (logs_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (league_id, week_start_date, user_id)
);

create index leaderboard_weekly_rank_idx
  on public.leaderboard_weekly (league_id, week_start_date, points desc, logs_count desc, user_id);

create table public.leaderboard_monthly (
  league_id uuid not null references public.leagues (id) on delete cascade,
  month_start_date date not null,
  user_id uuid not null references public.users (id) on delete cascade,
  points int not null default 0 check (points >= 0),
  logs_count int not null default 0 check (logs_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (league_id, month_start_date, user_id)
);

create index leaderboard_monthly_rank_idx
  on public.leaderboard_monthly (league_id, month_start_date, points desc, logs_count desc, user_id);

create table public.leaderboard_season (
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_year int not null,
  user_id uuid not null references public.users (id) on delete cascade,
  points int not null default 0 check (points >= 0),
  logs_count int not null default 0 check (logs_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (league_id, season_year, user_id)
);

create index leaderboard_season_rank_idx
  on public.leaderboard_season (league_id, season_year, points desc, logs_count desc, user_id);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  actor_user_id uuid references public.users (id) on delete set null,
  event_type text not null check (
    event_type in (
      'drink_logged',
      'joined_league',
      'achievement_unlocked',
      'level_up',
      'member_removed',
      'season_started'
    )
  ),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index activity_events_league_created_idx
  on public.activity_events (league_id, created_at desc);
create index activity_events_league_type_created_idx
  on public.activity_events (league_id, event_type, created_at desc);

create table public.achievement_definitions (
  code text primary key,
  name text not null,
  description text not null,
  scope text not null check (scope in ('global', 'league')),
  rule jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  sort_order int not null default 0
);

create table public.user_achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  achievement_code text not null references public.achievement_definitions (code) on delete cascade,
  league_id uuid references public.leagues (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  meta jsonb not null default '{}'::jsonb
);

create unique index user_achievements_global_uidx
  on public.user_achievements (user_id, achievement_code)
  where league_id is null;
create unique index user_achievements_league_uidx
  on public.user_achievements (user_id, achievement_code, league_id)
  where league_id is not null;
create index user_achievements_user_unlocked_idx
  on public.user_achievements (user_id, unlocked_at desc);
create index user_achievements_league_unlocked_idx
  on public.user_achievements (league_id, unlocked_at desc);

create table public.user_stats_global (
  user_id uuid primary key references public.users (id) on delete cascade,
  total_points bigint not null default 0 check (total_points >= 0),
  total_logs int not null default 0 check (total_logs >= 0),
  drink_counts jsonb not null default '{}'::jsonb,
  distinct_venues int not null default 0 check (distinct_venues >= 0),
  updated_at timestamptz not null default now()
);

create table public.league_member_stats (
  league_id uuid not null references public.leagues (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  total_points bigint not null default 0 check (total_points >= 0),
  total_logs int not null default 0 check (total_logs >= 0),
  drink_counts jsonb not null default '{}'::jsonb,
  last_log_at timestamptz,
  primary key (league_id, user_id)
);

create index league_member_stats_points_idx
  on public.league_member_stats (league_id, total_points desc);

create table public.league_seasons (
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_year int not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  closed_at timestamptz,
  winner_user_id uuid references public.users (id) on delete set null,
  primary key (league_id, season_year)
);

create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.users (id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_target_idx on public.admin_audit_logs (target_type, target_id);
