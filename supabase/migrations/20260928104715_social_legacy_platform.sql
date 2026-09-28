-- ============================================================
-- DrinkLeague: Onboarding · Friends · Feed · Legacy · Economy
-- ============================================================

-- ---------- Economy settings ----------
CREATE TABLE IF NOT EXISTS public.economy_settings (
  key text PRIMARY KEY,
  value_num numeric NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.economy_settings (key, value_num) VALUES
  ('daily_token_cap', 180),
  ('onboarding_token_bonus', 25),
  ('onboarding_xp_bonus', 40),
  ('game_token_soft_cap', 80),
  ('inactive_decay_weekly', 0)
ON CONFLICT (key) DO NOTHING;

-- Soft daily cap helper (non-blocking: returns allowed delta)
CREATE OR REPLACE FUNCTION public.token_delta_within_daily_cap(p_user_id uuid, p_delta bigint)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_cap bigint;
  v_earned bigint;
  v_allowed bigint;
BEGIN
  IF p_delta <= 0 THEN RETURN p_delta; END IF;
  SELECT value_num::bigint INTO v_cap FROM public.economy_settings WHERE key = 'daily_token_cap';
  v_cap := coalesce(v_cap, 180);
  SELECT coalesce(sum(delta), 0) INTO v_earned
  FROM public.token_ledger
  WHERE user_id = p_user_id
    AND delta > 0
    AND created_at >= (timezone('Europe/Madrid', now()))::date::timestamptz AT TIME ZONE 'Europe/Madrid'
    AND reason NOT LIKE 'admin%'
    AND reason NOT LIKE 'purchase%'
    AND reason NOT LIKE 'bet_%'
    AND reason NOT LIKE 'onboarding%';
  v_allowed := greatest(0, v_cap - v_earned);
  RETURN least(p_delta, v_allowed);
END;
$$;

-- ---------- Temporary / rotating titles ----------
ALTER TABLE public.user_titles
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_temporary boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text;

INSERT INTO public.title_definitions (code, name, emoji, rarity, description)
VALUES
  ('rey_cervecero', 'Rey Cervecero', '🍺', 'epic', 'Líder temporal en cervezas'),
  ('rey_copas', 'Rey de las Copas', '🍸', 'epic', 'Líder temporal en copas'),
  ('rey_chupitos', 'Rey de los Chupitos', '🥃', 'epic', 'Líder temporal en chupitos'),
  ('maestro_apostador', 'Maestro Apostador', '🎰', 'epic', 'Líder temporal de apuestas'),
  ('rey_quimica', 'Rey de la Química', '🤝', 'epic', 'Mejor química temporal')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  emoji = EXCLUDED.emoji,
  description = EXCLUDED.description;

-- ---------- Onboarding ----------
CREATE TABLE IF NOT EXISTS public.onboarding_missions (
  code text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  emoji text NOT NULL DEFAULT '✅',
  sort_order int NOT NULL DEFAULT 0,
  reward_xp int NOT NULL DEFAULT 40,
  reward_tokens int NOT NULL DEFAULT 25,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.user_onboarding (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mission_code text NOT NULL REFERENCES public.onboarding_missions(code) ON DELETE CASCADE,
  completed_at timestamptz,
  claimed_at timestamptz,
  PRIMARY KEY (user_id, mission_code)
);

INSERT INTO public.onboarding_missions (code, title, description, emoji, sort_order, reward_xp, reward_tokens) VALUES
  ('first_drink', 'Registrar primera bebida', 'Suma tu primera ronda en DrinkLeague', '🍺', 10, 50, 30),
  ('join_league', 'Entrar en una liga', 'Únete o crea tu primera liga', '🏟️', 20, 50, 30),
  ('add_friend', 'Añadir un amigo', 'Envía o acepta tu primera amistad', '🤝', 30, 40, 25),
  ('first_game', 'Jugar tu primer juego', 'Completa Peaje, Rey, Duelo o BlackJack', '🎮', 40, 60, 35)
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  reward_xp = EXCLUDED.reward_xp,
  reward_tokens = EXCLUDED.reward_tokens,
  is_active = true;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_dismissed_at timestamptz;

-- ---------- Social feed ----------
CREATE TABLE IF NOT EXISTS public.social_feed (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  title text NOT NULL,
  body text,
  href text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  league_id uuid REFERENCES public.leagues(id) ON DELETE SET NULL,
  visibility text NOT NULL DEFAULT 'friends'
    CHECK (visibility IN ('public', 'friends', 'league')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_feed_created_idx ON public.social_feed (created_at DESC);
CREATE INDEX IF NOT EXISTS social_feed_actor_idx ON public.social_feed (actor_user_id, created_at DESC);

ALTER TABLE public.social_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_feed_select ON public.social_feed;
CREATE POLICY social_feed_select ON public.social_feed
  FOR SELECT TO authenticated
  USING (
    visibility = 'public'
    OR actor_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user_a = auth.uid() AND f.user_b = actor_user_id)
         OR (f.user_b = auth.uid() AND f.user_a = actor_user_id)
    )
    OR (
      visibility = 'league' AND league_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.league_memberships m
        WHERE m.league_id = social_feed.league_id
          AND m.user_id = auth.uid()
          AND m.status = 'active'
      )
    )
  );

-- ---------- Personal records ----------
CREATE TABLE IF NOT EXISTS public.user_personal_records (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  record_code text NOT NULL,
  label text NOT NULL,
  value numeric NOT NULL DEFAULT 0,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  achieved_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, record_code)
);

ALTER TABLE public.user_personal_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS upr_select ON public.user_personal_records;
CREATE POLICY upr_select ON public.user_personal_records
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user_a = auth.uid() AND f.user_b = user_id)
         OR (f.user_b = auth.uid() AND f.user_a = user_id)
    )
  );

-- ---------- Legacy timeline ----------
CREATE TABLE IF NOT EXISTS public.user_legacy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_code text NOT NULL,
  title text NOT NULL,
  body text,
  emoji text NOT NULL DEFAULT '✅',
  occurred_at timestamptz NOT NULL DEFAULT now(),
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, event_code)
);

CREATE INDEX IF NOT EXISTS user_legacy_user_idx ON public.user_legacy_events (user_id, occurred_at);

ALTER TABLE public.user_legacy_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ule_select ON public.user_legacy_events;
CREATE POLICY ule_select ON public.user_legacy_events
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user_a = auth.uid() AND f.user_b = user_id)
         OR (f.user_b = auth.uid() AND f.user_a = user_id)
    )
  );

-- ---------- Leadership streaks ----------
CREATE TABLE IF NOT EXISTS public.leadership_streaks (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  league_id uuid NOT NULL REFERENCES public.leagues(id) ON DELETE CASCADE,
  period text NOT NULL CHECK (period IN ('day', 'week', 'month')),
  current_count int NOT NULL DEFAULT 0,
  best_count int NOT NULL DEFAULT 0,
  last_led_on date,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, league_id, period)
);

ALTER TABLE public.leadership_streaks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ls_select ON public.leadership_streaks;
CREATE POLICY ls_select ON public.leadership_streaks
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.league_memberships m
      WHERE m.league_id = leadership_streaks.league_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
    )
  );

-- ---------- Helpers ----------
CREATE OR REPLACE FUNCTION public.emit_social_feed(
  p_actor uuid,
  p_type text,
  p_title text,
  p_body text DEFAULT NULL,
  p_href text DEFAULT NULL,
  p_payload jsonb DEFAULT '{}'::jsonb,
  p_league_id uuid DEFAULT NULL,
  p_visibility text DEFAULT 'friends'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.social_feed (actor_user_id, event_type, title, body, href, payload, league_id, visibility)
  VALUES (p_actor, p_type, p_title, p_body, p_href, coalesce(p_payload, '{}'::jsonb), p_league_id, coalesce(p_visibility, 'friends'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.upsert_legacy_event(
  p_user_id uuid,
  p_code text,
  p_title text,
  p_body text DEFAULT NULL,
  p_emoji text DEFAULT '✅',
  p_occurred_at timestamptz DEFAULT now(),
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_legacy_events (user_id, event_code, title, body, emoji, occurred_at, meta)
  VALUES (p_user_id, p_code, p_title, p_body, p_emoji, coalesce(p_occurred_at, now()), coalesce(p_meta, '{}'::jsonb))
  ON CONFLICT (user_id, event_code) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_personal_record(
  p_user_id uuid,
  p_code text,
  p_label text,
  p_value numeric,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_personal_records (user_id, record_code, label, value, meta, achieved_at, updated_at)
  VALUES (p_user_id, p_code, p_label, p_value, coalesce(p_meta, '{}'::jsonb), now(), now())
  ON CONFLICT (user_id, record_code) DO UPDATE SET
    value = CASE WHEN EXCLUDED.value > public.user_personal_records.value THEN EXCLUDED.value ELSE public.user_personal_records.value END,
    meta = CASE WHEN EXCLUDED.value > public.user_personal_records.value THEN EXCLUDED.meta ELSE public.user_personal_records.meta END,
    achieved_at = CASE WHEN EXCLUDED.value > public.user_personal_records.value THEN now() ELSE public.user_personal_records.achieved_at END,
    updated_at = now(),
    label = EXCLUDED.label;
END;
$$;
