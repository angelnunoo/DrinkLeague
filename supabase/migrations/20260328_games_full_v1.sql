-- Full Spanish-deck games: Peaje, Rey, Duelo + stats + achievements

CREATE TABLE IF NOT EXISTS public.user_game_stats (
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  game_type text NOT NULL CHECK (game_type IN ('peaje', 'rey', 'duelo')),
  played integer NOT NULL DEFAULT 0,
  won integer NOT NULL DEFAULT 0,
  lost integer NOT NULL DEFAULT 0,
  best_streak integer NOT NULL DEFAULT 0,
  current_streak integer NOT NULL DEFAULT 0,
  xp_earned bigint NOT NULL DEFAULT 0,
  tokens_earned bigint NOT NULL DEFAULT 0,
  kings_found integer NOT NULL DEFAULT 0,
  perfect_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_type)
);

ALTER TABLE public.user_game_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_game_stats_select ON public.user_game_stats;
CREATE POLICY user_game_stats_select ON public.user_game_stats
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_global_admin());

INSERT INTO public.achievement_definitions (code, name, description, scope, rule, is_active, sort_order, is_secret, emoji, rarity)
VALUES
  ('peaje_first', 'Primer Peaje', 'Completa tu primera partida de Peaje', 'global', '{"game":"peaje","metric":"played","op":">=","value":1}'::jsonb, true, 200, false, '🚧', 'common'),
  ('peaje_sin_frenos', 'Sin Frenos', 'Completa un Peaje perfecto (5/5 aciertos)', 'global', '{"game":"peaje","metric":"perfect","op":">=","value":1}'::jsonb, true, 201, false, '🏎️', 'rare'),
  ('peaje_maestro', 'Maestro del Peaje', 'Gana 10 partidas de Peaje', 'global', '{"game":"peaje","metric":"won","op":">=","value":10}'::jsonb, true, 202, false, '🛣️', 'rare'),
  ('peaje_rey_carretera', 'Rey de la Carretera', 'Gana 50 partidas de Peaje', 'global', '{"game":"peaje","metric":"won","op":">=","value":50}'::jsonb, true, 203, false, '👑', 'epic'),
  ('rey_first', 'Primer Rey', 'Encuentra tu primer Rey en el juego Rey', 'global', '{"game":"rey","metric":"kings","op":">=","value":1}'::jsonb, true, 210, false, '🃏', 'common'),
  ('rey_senor_baraja', 'Señor de la Baraja', 'Termina una partida de Rey (4/4)', 'global', '{"game":"rey","metric":"won","op":">=","value":1}'::jsonb, true, 211, false, '📜', 'rare'),
  ('rey_coleccionista', 'Coleccionista de Reyes', 'Acumula 25 Reyes encontrados', 'global', '{"game":"rey","metric":"kings","op":">=","value":25}'::jsonb, true, 212, false, '🏛️', 'rare'),
  ('rey_supremo', 'Rey Supremo', 'Acumula 100 Reyes encontrados', 'global', '{"game":"rey","metric":"kings","op":">=","value":100}'::jsonb, true, 213, false, '👑', 'epic'),
  ('duelo_first', 'Primer Duelo', 'Completa tu primer Duelo', 'global', '{"game":"duelo","metric":"played","op":">=","value":1}'::jsonb, true, 220, false, '⚔️', 'common'),
  ('duelo_gladiador', 'Gladiador', 'Gana 10 duelos', 'global', '{"game":"duelo","metric":"won","op":">=","value":10}'::jsonb, true, 221, false, '🛡️', 'rare'),
  ('duelo_invencible', 'Invencible', 'Consigue una racha de 5 victorias en Duelo', 'global', '{"game":"duelo","metric":"streak","op":">=","value":5}'::jsonb, true, 222, false, '🔥', 'epic'),
  ('duelo_campeon', 'Campeón de Duelos', 'Gana 50 duelos', 'global', '{"game":"duelo","metric":"won","op":">=","value":50}'::jsonb, true, 223, false, '🏆', 'legendary')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true;

CREATE OR REPLACE FUNCTION public.spanish_rank_name(p_rank int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_rank
    WHEN 1 THEN 'As' WHEN 2 THEN '2' WHEN 3 THEN '3' WHEN 4 THEN '4'
    WHEN 5 THEN '5' WHEN 6 THEN '6' WHEN 7 THEN '7' WHEN 8 THEN 'Sota'
    WHEN 9 THEN 'Caballo' WHEN 10 THEN 'Rey' ELSE '?'
  END;
$$;

CREATE OR REPLACE FUNCTION public.spanish_suit_name(p_suit text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(p_suit)
    WHEN 'oros' THEN 'Oros' WHEN 'copas' THEN 'Copas'
    WHEN 'espadas' THEN 'Espadas' WHEN 'bastos' THEN 'Bastos' ELSE p_suit
  END;
$$;

CREATE OR REPLACE FUNCTION public.spanish_card_label(p_rank int, p_suit text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT public.spanish_rank_name(p_rank) || ' de ' || public.spanish_suit_name(p_suit);
$$;

CREATE OR REPLACE FUNCTION public.build_spanish_deck(p_seed text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_ranks int[] := ARRAY[1,2,3,4,5,6,7,8,9,10];
  v_suits text[] := ARRAY['oros','copas','espadas','bastos'];
  v_deck jsonb := '[]'::jsonb;
  v_arr jsonb[];
  i int; j int; r int; s text; tmp jsonb;
  v_hash text;
  v_n int;
BEGIN
  FOREACH r IN ARRAY v_ranks LOOP
    FOREACH s IN ARRAY v_suits LOOP
      v_deck := v_deck || jsonb_build_array(jsonb_build_object(
        'rank', r, 'suit', s,
        'name', public.spanish_rank_name(r),
        'label', public.spanish_card_label(r, s)
      ));
    END LOOP;
  END LOOP;

  -- Fisher-Yates with seed
  SELECT array_agg(elem) INTO v_arr FROM jsonb_array_elements(v_deck) AS elem;
  v_n := array_length(v_arr, 1);
  FOR i IN REVERSE v_n..2 LOOP
    v_hash := md5(p_seed || i::text);
    j := 1 + (get_byte(decode(v_hash, 'hex'), 0)::int % i);
    tmp := v_arr[i];
    v_arr[i] := v_arr[j];
    v_arr[j] := tmp;
  END LOOP;

  RETURN to_jsonb(v_arr);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_game_achievement(p_user_id uuid, p_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.user_achievements
    WHERE user_id = p_user_id AND achievement_code = p_code AND league_id IS NULL
  ) THEN
    INSERT INTO public.user_achievements (user_id, achievement_code)
    VALUES (p_user_id, p_code);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_game_stats(
  p_user_id uuid,
  p_game_type text,
  p_won boolean,
  p_xp int,
  p_tokens int,
  p_kings int DEFAULT 0,
  p_perfect boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_streak int;
  v_best int;
  v_played int;
  v_won int;
  v_kings int;
  v_perfect int;
BEGIN
  INSERT INTO public.user_game_stats (user_id, game_type)
  VALUES (p_user_id, p_game_type)
  ON CONFLICT DO NOTHING;

  UPDATE public.user_game_stats SET
    played = played + 1,
    won = won + CASE WHEN p_won THEN 1 ELSE 0 END,
    lost = lost + CASE WHEN p_won THEN 0 ELSE 1 END,
    current_streak = CASE WHEN p_won THEN current_streak + 1 ELSE 0 END,
    best_streak = GREATEST(best_streak, CASE WHEN p_won THEN current_streak + 1 ELSE 0 END),
    xp_earned = xp_earned + GREATEST(0, p_xp),
    tokens_earned = tokens_earned + GREATEST(0, p_tokens),
    kings_found = kings_found + GREATEST(0, p_kings),
    perfect_count = perfect_count + CASE WHEN p_perfect THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE user_id = p_user_id AND game_type = p_game_type
  RETURNING current_streak, best_streak, played, won, kings_found, perfect_count
  INTO v_streak, v_best, v_played, v_won, v_kings, v_perfect;

  IF p_xp > 0 THEN
    UPDATE public.users SET xp = xp + p_xp, level = public.level_for_xp(xp + p_xp) WHERE id = p_user_id;
  END IF;
  IF p_tokens > 0 THEN
    BEGIN
      PERFORM public.credit_tokens(p_user_id, p_tokens, 'game_' || p_game_type, 'game_session', NULL);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  -- Achievements
  IF p_game_type = 'peaje' THEN
    IF v_played >= 1 THEN PERFORM public.grant_game_achievement(p_user_id, 'peaje_first'); END IF;
    IF v_perfect >= 1 THEN PERFORM public.grant_game_achievement(p_user_id, 'peaje_sin_frenos'); END IF;
    IF v_won >= 10 THEN PERFORM public.grant_game_achievement(p_user_id, 'peaje_maestro'); END IF;
    IF v_won >= 50 THEN PERFORM public.grant_game_achievement(p_user_id, 'peaje_rey_carretera'); END IF;
  ELSIF p_game_type = 'rey' THEN
    IF v_kings >= 1 THEN PERFORM public.grant_game_achievement(p_user_id, 'rey_first'); END IF;
    IF v_won >= 1 THEN PERFORM public.grant_game_achievement(p_user_id, 'rey_senor_baraja'); END IF;
    IF v_kings >= 25 THEN PERFORM public.grant_game_achievement(p_user_id, 'rey_coleccionista'); END IF;
    IF v_kings >= 100 THEN PERFORM public.grant_game_achievement(p_user_id, 'rey_supremo'); END IF;
  ELSIF p_game_type = 'duelo' THEN
    IF v_played >= 1 THEN PERFORM public.grant_game_achievement(p_user_id, 'duelo_first'); END IF;
    IF v_won >= 10 THEN PERFORM public.grant_game_achievement(p_user_id, 'duelo_gladiador'); END IF;
    IF v_best >= 5 THEN PERFORM public.grant_game_achievement(p_user_id, 'duelo_invencible'); END IF;
    IF v_won >= 50 THEN PERFORM public.grant_game_achievement(p_user_id, 'duelo_campeon'); END IF;
  END IF;
END;
$$;
