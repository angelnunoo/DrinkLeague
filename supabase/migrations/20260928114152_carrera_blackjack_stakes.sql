-- ============================================================
-- Carrera de Caballos + BlackJack stakes + game wager economy
-- ============================================================

ALTER TABLE public.game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;
ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_game_type_check
  CHECK (game_type IN ('peaje', 'rey', 'duelo', 'blackjack', 'carrera'));

ALTER TABLE public.user_game_stats DROP CONSTRAINT IF EXISTS user_game_stats_game_type_check;
ALTER TABLE public.user_game_stats
  ADD CONSTRAINT user_game_stats_game_type_check
  CHECK (game_type IN ('peaje', 'rey', 'duelo', 'blackjack', 'carrera'));

ALTER TABLE public.user_game_stats
  ADD COLUMN IF NOT EXISTS tokens_wagered bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_won bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tokens_lost bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS podiums integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS biggest_win bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS biggest_loss bigint NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.game_wagers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.game_sessions(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  game_type text NOT NULL,
  stake bigint NOT NULL,
  payout bigint NOT NULL DEFAULT 0,
  net bigint NOT NULL DEFAULT 0,
  result text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS game_wagers_user_idx ON public.game_wagers (user_id, created_at DESC);

ALTER TABLE public.game_wagers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS game_wagers_select ON public.game_wagers;
CREATE POLICY game_wagers_select ON public.game_wagers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_global_admin());

INSERT INTO public.achievement_definitions (code, name, description, scope, rule, is_active, sort_order, is_secret, emoji, rarity)
VALUES
  ('carrera_first', 'Primera Carrera', 'Completa tu primera Carrera de Caballos', 'global', '{"game":"carrera","metric":"played","op":">=","value":1}'::jsonb, true, 240, false, '🐎', 'common'),
  ('carrera_novato', 'Jinete Novato', 'Gana tu primera carrera', 'global', '{"game":"carrera","metric":"won","op":">=","value":1}'::jsonb, true, 241, false, '🏇', 'common'),
  ('carrera_5', '5 Victorias', 'Gana 5 carreras', 'global', '{"game":"carrera","metric":"won","op":">=","value":5}'::jsonb, true, 242, false, '🥇', 'rare'),
  ('carrera_10', '10 Victorias', 'Gana 10 carreras', 'global', '{"game":"carrera","metric":"won","op":">=","value":10}'::jsonb, true, 243, false, '🏆', 'epic'),
  ('carrera_rey', 'Rey del Hipódromo', 'Gana 25 carreras', 'global', '{"game":"carrera","metric":"won","op":">=","value":25}'::jsonb, true, 244, false, '👑', 'epic'),
  ('carrera_leyenda', 'Leyenda del Hipódromo', 'Gana 50 carreras', 'global', '{"game":"carrera","metric":"won","op":">=","value":50}'::jsonb, true, 245, false, '🌟', 'legendary')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true,
  emoji = EXCLUDED.emoji,
  rarity = EXCLUDED.rarity;

CREATE OR REPLACE FUNCTION public.valid_game_stake(p_stake int)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_stake IN (50, 100, 250, 500, 1000);
$$;

CREATE OR REPLACE FUNCTION public.record_game_wager(
  p_user_id uuid,
  p_session_id uuid,
  p_game_type text,
  p_stake bigint,
  p_payout bigint,
  p_result text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_net bigint := p_payout - p_stake;
BEGIN
  INSERT INTO public.game_wagers (session_id, user_id, game_type, stake, payout, net, result)
  VALUES (p_session_id, p_user_id, p_game_type, p_stake, p_payout, v_net, p_result);

  INSERT INTO public.user_game_stats (user_id, game_type)
  VALUES (p_user_id, p_game_type)
  ON CONFLICT DO NOTHING;

  UPDATE public.user_game_stats SET
    tokens_wagered = tokens_wagered + greatest(0, p_stake),
    tokens_won = tokens_won + greatest(0, v_net),
    tokens_lost = tokens_lost + greatest(0, -v_net),
    biggest_win = GREATEST(biggest_win, greatest(0, v_net)),
    biggest_loss = GREATEST(biggest_loss, greatest(0, -v_net)),
    updated_at = now()
  WHERE user_id = p_user_id AND game_type = p_game_type;
END;
$$;

-- Drop old touch_blackjack_stats overloads then recreate
DROP FUNCTION IF EXISTS public.touch_blackjack_stats(uuid, text, int, int);
DROP FUNCTION IF EXISTS public.touch_blackjack_stats(uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.touch_blackjack_stats(
  p_user_id uuid,
  p_result text,
  p_xp int,
  p_tokens int DEFAULT 0,
  p_session_id uuid DEFAULT NULL,
  p_stake int DEFAULT 0,
  p_payout int DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_won boolean := p_result IN ('win', 'blackjack');
  v_push boolean := p_result = 'push';
  v_bj boolean := p_result = 'blackjack';
  v_best int;
  v_won_n int;
  v_bjs int;
BEGIN
  INSERT INTO public.user_game_stats (user_id, game_type)
  VALUES (p_user_id, 'blackjack')
  ON CONFLICT DO NOTHING;

  UPDATE public.user_game_stats SET
    played = played + 1,
    won = won + CASE WHEN v_won THEN 1 ELSE 0 END,
    lost = lost + CASE WHEN (NOT v_won AND NOT v_push) THEN 1 ELSE 0 END,
    draws = draws + CASE WHEN v_push THEN 1 ELSE 0 END,
    blackjacks = blackjacks + CASE WHEN v_bj THEN 1 ELSE 0 END,
    current_streak = CASE WHEN v_won THEN current_streak + 1 WHEN v_push THEN current_streak ELSE 0 END,
    best_streak = GREATEST(best_streak, CASE WHEN v_won THEN current_streak + 1 ELSE current_streak END),
    xp_earned = xp_earned + GREATEST(0, p_xp),
    tokens_earned = tokens_earned + GREATEST(0, p_payout),
    perfect_count = perfect_count + CASE WHEN v_bj THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE user_id = p_user_id AND game_type = 'blackjack'
  RETURNING best_streak, won, blackjacks
  INTO v_best, v_won_n, v_bjs;

  IF p_xp > 0 THEN
    UPDATE public.users SET xp = xp + p_xp, level = public.level_for_xp(xp + p_xp) WHERE id = p_user_id;
  END IF;

  IF coalesce(p_stake, 0) > 0 THEN
    PERFORM public.record_game_wager(p_user_id, p_session_id, 'blackjack', p_stake, coalesce(p_payout, 0), p_result);
  ELSIF p_tokens > 0 THEN
    -- legacy flat reward path
    BEGIN
      PERFORM public.credit_tokens(p_user_id, p_tokens, 'game_blackjack', 'game_session', p_session_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  IF v_bjs >= 1 THEN PERFORM public.grant_game_achievement(p_user_id, 'bj_first'); END IF;
  IF v_won_n >= 10 THEN PERFORM public.grant_game_achievement(p_user_id, 'bj_rey_cartas'); END IF;
  IF v_best >= 5 THEN PERFORM public.grant_game_achievement(p_user_id, 'bj_invencible'); END IF;
  IF v_won_n >= 25 THEN PERFORM public.grant_game_achievement(p_user_id, 'bj_maestro'); END IF;
  IF v_won_n >= 50 THEN PERFORM public.grant_game_achievement(p_user_id, 'bj_leyenda'); END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_carrera_stats(
  p_user_id uuid,
  p_place int,
  p_xp int,
  p_session_id uuid,
  p_stake int,
  p_payout int
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_won boolean := p_place = 1;
  v_podium boolean := p_place <= 2;
  v_won_n int;
  v_played int;
  v_best int;
BEGIN
  INSERT INTO public.user_game_stats (user_id, game_type)
  VALUES (p_user_id, 'carrera')
  ON CONFLICT DO NOTHING;

  UPDATE public.user_game_stats SET
    played = played + 1,
    won = won + CASE WHEN v_won THEN 1 ELSE 0 END,
    lost = lost + CASE WHEN NOT v_won THEN 1 ELSE 0 END,
    podiums = podiums + CASE WHEN v_podium THEN 1 ELSE 0 END,
    current_streak = CASE WHEN v_won THEN current_streak + 1 ELSE 0 END,
    best_streak = GREATEST(best_streak, CASE WHEN v_won THEN current_streak + 1 ELSE 0 END),
    xp_earned = xp_earned + GREATEST(0, p_xp),
    tokens_earned = tokens_earned + GREATEST(0, p_payout),
    updated_at = now()
  WHERE user_id = p_user_id AND game_type = 'carrera'
  RETURNING played, won, best_streak INTO v_played, v_won_n, v_best;

  IF p_xp > 0 THEN
    UPDATE public.users SET xp = xp + p_xp, level = public.level_for_xp(xp + p_xp) WHERE id = p_user_id;
  END IF;

  PERFORM public.record_game_wager(
    p_user_id, p_session_id, 'carrera', p_stake, p_payout,
    CASE WHEN p_place = 1 THEN 'win' WHEN p_place = 2 THEN 'podium' ELSE 'lose' END
  );

  IF v_played >= 1 THEN PERFORM public.grant_game_achievement(p_user_id, 'carrera_first'); END IF;
  IF v_won_n >= 1 THEN PERFORM public.grant_game_achievement(p_user_id, 'carrera_novato'); END IF;
  IF v_won_n >= 5 THEN PERFORM public.grant_game_achievement(p_user_id, 'carrera_5'); END IF;
  IF v_won_n >= 10 THEN PERFORM public.grant_game_achievement(p_user_id, 'carrera_10'); END IF;
  IF v_won_n >= 25 THEN PERFORM public.grant_game_achievement(p_user_id, 'carrera_rey'); END IF;
  IF v_won_n >= 50 THEN PERFORM public.grant_game_achievement(p_user_id, 'carrera_leyenda'); END IF;
END;
$$;
