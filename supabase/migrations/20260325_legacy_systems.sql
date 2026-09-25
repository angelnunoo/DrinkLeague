-- ============================================================
-- DrinkLeague: rivals, secrets, objectives, album, medals,
-- prestige, museum helpers, AI predictions, rank snapshots
-- ============================================================

-- Prestige on users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS prestige_level integer NOT NULL DEFAULT 0;

-- Secret achievements flag
ALTER TABLE public.achievement_definitions
  ADD COLUMN IF NOT EXISTS is_secret boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS emoji text DEFAULT '🏅',
  ADD COLUMN IF NOT EXISTS rarity text DEFAULT 'common';

-- Rivals
CREATE TABLE IF NOT EXISTS public.user_rivals (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  rival_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  points_delta integer NOT NULL DEFAULT 0,
  my_points integer NOT NULL DEFAULT 0,
  rival_points integer NOT NULL DEFAULT 0,
  my_rank integer,
  rival_rank integer,
  seasons_me integer NOT NULL DEFAULT 0,
  seasons_rival integer NOT NULL DEFAULT 0,
  duels_me integer NOT NULL DEFAULT 0,
  duels_rival integer NOT NULL DEFAULT 0,
  rivalry_score numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id)
);

-- Personal objectives
CREATE TABLE IF NOT EXISTS public.personal_objectives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  league_id uuid REFERENCES public.leagues(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  description text,
  metric text NOT NULL,
  target numeric NOT NULL,
  current_value numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active', -- active | completed | expired
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS personal_objectives_user_code_league_uidx
  ON public.personal_objectives (user_id, code, COALESCE(league_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'active';

-- Season album (forever)
CREATE TABLE IF NOT EXISTS public.season_albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  season_year integer NOT NULL,
  final_position integer,
  points integer NOT NULL DEFAULT 0,
  mvp_count integer NOT NULL DEFAULT 0,
  best_friend_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  records_count integer NOT NULL DEFAULT 0,
  medals_gold integer NOT NULL DEFAULT 0,
  medals_silver integer NOT NULL DEFAULT 0,
  medals_bronze integer NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  archived_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, league_id, season_year)
);

-- Medals
CREATE TABLE IF NOT EXISTS public.user_medals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  period_type text NOT NULL CHECK (period_type IN ('weekly','monthly','annual')),
  period_key text NOT NULL,
  place integer NOT NULL CHECK (place IN (1,2,3)),
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, league_id, period_type, period_key)
);

-- Rank snapshots for ↑↓➖
CREATE TABLE IF NOT EXISTS public.rank_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  period_type text NOT NULL,
  period_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  points integer NOT NULL DEFAULT 0,
  snapped_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, period_type, period_key, user_id)
);

-- AI predictions
CREATE TABLE IF NOT EXISTS public.ai_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  season_year integer NOT NULL,
  week_start date NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (league_id, season_year, week_start)
);

-- Streak cache
CREATE TABLE IF NOT EXISTS public.user_streaks (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  streak_type text NOT NULL,
  current_count integer NOT NULL DEFAULT 0,
  best_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, streak_type)
);

-- RLS
ALTER TABLE public.user_rivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.personal_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_medals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rank_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_rivals_select ON public.user_rivals;
CREATE POLICY user_rivals_select ON public.user_rivals FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR rival_user_id = auth.uid() OR public.is_league_member(league_id));

DROP POLICY IF EXISTS personal_objectives_select ON public.personal_objectives;
CREATE POLICY personal_objectives_select ON public.personal_objectives FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS season_albums_select ON public.season_albums;
CREATE POLICY season_albums_select ON public.season_albums FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_league_member(league_id));

DROP POLICY IF EXISTS user_medals_select ON public.user_medals;
CREATE POLICY user_medals_select ON public.user_medals FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS rank_snapshots_select ON public.rank_snapshots;
CREATE POLICY rank_snapshots_select ON public.rank_snapshots FOR SELECT TO authenticated
  USING (public.is_league_member(league_id));

DROP POLICY IF EXISTS ai_predictions_select ON public.ai_predictions;
CREATE POLICY ai_predictions_select ON public.ai_predictions FOR SELECT TO authenticated
  USING (public.is_league_member(league_id));

DROP POLICY IF EXISTS user_streaks_select ON public.user_streaks;
CREATE POLICY user_streaks_select ON public.user_streaks FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_user_medals_user ON public.user_medals(user_id);
CREATE INDEX IF NOT EXISTS idx_season_albums_user ON public.season_albums(user_id, season_year DESC);
CREATE INDEX IF NOT EXISTS idx_rank_snap_league ON public.rank_snapshots(league_id, period_type, period_key);
