-- DrinkCasino hub: ruleta social/casino, bingo, missions, rankings helpers

ALTER TABLE public.game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;
ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_game_type_check
  CHECK (game_type IN ('peaje','rey','duelo','blackjack','carrera','ruleta_social','ruleta_casino','bingo'));

ALTER TABLE public.user_game_stats DROP CONSTRAINT IF EXISTS user_game_stats_game_type_check;
ALTER TABLE public.user_game_stats
  ADD CONSTRAINT user_game_stats_game_type_check
  CHECK (game_type IN ('peaje','rey','duelo','blackjack','carrera','ruleta_social','ruleta_casino','bingo'));

CREATE TABLE IF NOT EXISTS public.casino_missions (
  code text PRIMARY KEY,
  title text NOT NULL,
  description text NOT NULL,
  emoji text NOT NULL DEFAULT '🎯',
  metric text NOT NULL,
  target int NOT NULL,
  reward_xp int NOT NULL DEFAULT 40,
  reward_tokens int NOT NULL DEFAULT 25,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.user_casino_missions (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  mission_code text NOT NULL REFERENCES public.casino_missions(code) ON DELETE CASCADE,
  progress int NOT NULL DEFAULT 0,
  completed_at timestamptz,
  claimed_at timestamptz,
  PRIMARY KEY (user_id, mission_code)
);

ALTER TABLE public.user_casino_missions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ucm_select ON public.user_casino_missions;
CREATE POLICY ucm_select ON public.user_casino_missions FOR SELECT TO authenticated USING (user_id = auth.uid());

INSERT INTO public.casino_missions (code, title, description, emoji, metric, target, reward_xp, reward_tokens, sort_order) VALUES
  ('bj_wins_3', 'Ganar 3 BlackJack', 'Suma 3 victorias en BlackJack', '🃏', 'bj_wins', 3, 60, 40, 10),
  ('carrera_win_1', 'Ganar una carrera', 'Llega primero en Carrera de Caballos', '🐎', 'carrera_wins', 1, 50, 35, 20),
  ('bingo_win_1', 'Conseguir un Bingo', 'Cierra un cartón completo', '🎱', 'bingo_wins', 1, 70, 50, 30),
  ('wager_1000', 'Apostar 1000 fichas', 'Acumula 1000 fichas apostadas en casino', '💰', 'tokens_wagered', 1000, 80, 60, 40),
  ('streak_5', '5 partidas seguidas', 'Racha de 5 victorias en cualquier juego de casino', '🔥', 'best_casino_streak', 5, 100, 75, 50)
ON CONFLICT (code) DO UPDATE SET title = EXCLUDED.title, target = EXCLUDED.target, is_active = true;

INSERT INTO public.achievement_definitions (code, name, description, scope, rule, is_active, sort_order, is_secret, emoji, rarity)
VALUES
  ('ruleta_first', 'Primera Ruleta', 'Gira la Ruleta DrinkLeague', 'global', '{}'::jsonb, true, 250, false, '🎡', 'common'),
  ('casino_ruleta_first', 'Ruleta del Casino', 'Gana una apuesta en Ruleta Casino', 'global', '{}'::jsonb, true, 251, false, '🎰', 'rare'),
  ('bingo_first', 'Primer Bingo', 'Consigue tu primer Bingo', 'global', '{}'::jsonb, true, 252, false, '🎱', 'rare'),
  ('casino_leyenda', 'Leyenda del Casino', 'Gana 100 partidas de casino', 'global', '{}'::jsonb, true, 253, false, '👑', 'legendary')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_active = true, emoji = EXCLUDED.emoji;

CREATE OR REPLACE FUNCTION public.bump_game_play_stats(
  p_user_id uuid, p_game text, p_won boolean, p_xp int DEFAULT 10
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.user_game_stats (user_id, game_type) VALUES (p_user_id, p_game) ON CONFLICT DO NOTHING;
  UPDATE public.user_game_stats SET
    played = played + 1,
    won = won + CASE WHEN p_won THEN 1 ELSE 0 END,
    lost = lost + CASE WHEN p_won THEN 0 ELSE 1 END,
    current_streak = CASE WHEN p_won THEN current_streak + 1 ELSE 0 END,
    best_streak = GREATEST(best_streak, CASE WHEN p_won THEN current_streak + 1 ELSE current_streak END),
    xp_earned = xp_earned + greatest(0, p_xp),
    updated_at = now()
  WHERE user_id = p_user_id AND game_type = p_game;
  IF p_xp > 0 THEN
    UPDATE public.users SET xp = xp + p_xp, level = public.level_for_xp(xp + p_xp) WHERE id = p_user_id;
  END IF;
END;
$$;

-- Social roulette spin (no stake)
CREATE OR REPLACE FUNCTION public.spin_social_roulette()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_me uuid := auth.uid();
  v_opts text[] := ARRAY[
    'cerveza','chupito','copa','cerveza_x2','chupito_x2',
    'te_salvas','elige_jugador','todos_beben','duelo_rapido','rey_bebe'
  ];
  v_labels text[] := ARRAY[
    '🍺 Cerveza','🥃 Chupito','🍸 Copa','🍺 Cerveza x2','🥃 Chupito x2',
    '😇 Te salvas','🤝 Elige jugador','🔥 Todos beben','⚔️ Duelo rápido','👑 Rey bebe'
  ];
  v_i int;
  v_id uuid;
  v_state jsonb;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_i := 1 + floor(random() * array_length(v_opts, 1))::int;
  v_state := jsonb_build_object(
    'phase','finished','result', v_opts[v_i], 'label', v_labels[v_i],
    'index', v_i - 1, 'finished_at', now()
  );
  INSERT INTO public.game_sessions (game_type, created_by, deck_seed, state, status, finished_at)
  VALUES ('ruleta_social', v_me, md5(random()::text), v_state, 'finished', now())
  RETURNING id INTO v_id;
  INSERT INTO public.game_players (session_id, user_id, seat) VALUES (v_id, v_me, 0);
  PERFORM public.bump_game_play_stats(v_me, 'ruleta_social', true, 12);
  PERFORM public.grant_game_achievement(v_me, 'ruleta_first');
  RETURN v_state || jsonb_build_object('session_id', v_id);
END;
$$;

-- Casino roulette: red/black/green
CREATE OR REPLACE FUNCTION public.spin_casino_roulette(p_stake int, p_bet text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_me uuid := auth.uid();
  v_bet text := lower(trim(p_bet));
  v_bal bigint;
  v_n int;
  v_color text;
  v_won boolean;
  v_payout int := 0;
  v_mult numeric := 0;
  v_id uuid;
  v_state jsonb;
  v_xp int := 8;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.valid_game_stake(p_stake) THEN RAISE EXCEPTION 'Apuesta no válida'; END IF;
  IF v_bet NOT IN ('red','black','green') THEN RAISE EXCEPTION 'Apuesta no válida'; END IF;
  SELECT token_balance INTO v_bal FROM public.users WHERE id = v_me;
  IF coalesce(v_bal,0) < p_stake THEN RAISE EXCEPTION '💰 No tienes fichas suficientes para jugar.'; END IF;

  PERFORM public.credit_tokens(v_me, -p_stake, 'ruleta_wager', 'game_session', NULL);
  v_n := floor(random() * 37)::int; -- 0..36
  IF v_n = 0 THEN v_color := 'green';
  ELSIF v_n % 2 = 0 THEN v_color := 'black';
  ELSE v_color := 'red';
  END IF;

  v_won := v_color = v_bet;
  IF v_won THEN
    v_mult := CASE WHEN v_bet = 'green' THEN 14 ELSE 2 END;
    v_payout := floor(p_stake * v_mult)::int;
    v_xp := CASE WHEN v_bet = 'green' THEN 80 ELSE 35 END;
    PERFORM public.credit_tokens(v_me, v_payout, 'ruleta_payout', 'game_session', NULL);
  END IF;

  v_state := jsonb_build_object(
    'phase','finished','number', v_n, 'color', v_color, 'bet', v_bet,
    'stake', p_stake, 'payout', v_payout, 'tokens', v_payout - p_stake,
    'result', CASE WHEN v_won THEN 'win' ELSE 'lose' END,
    'xp', v_xp, 'finished_at', now()
  );
  INSERT INTO public.game_sessions (game_type, created_by, deck_seed, state, status, finished_at)
  VALUES ('ruleta_casino', v_me, md5(random()::text), v_state, 'finished', now())
  RETURNING id INTO v_id;
  UPDATE public.token_ledger SET ref_id = v_id
  WHERE user_id = v_me AND ref_id IS NULL AND reason LIKE 'ruleta_%' AND created_at > now() - interval '5 seconds';
  INSERT INTO public.game_players (session_id, user_id, seat) VALUES (v_id, v_me, 0);
  PERFORM public.bump_game_play_stats(v_me, 'ruleta_casino', v_won, v_xp);
  PERFORM public.record_game_wager(v_me, v_id, 'ruleta_casino', p_stake, v_payout, CASE WHEN v_won THEN 'win' ELSE 'lose' END);
  IF v_won THEN PERFORM public.grant_game_achievement(v_me, 'casino_ruleta_first'); END IF;
  RETURN v_state || jsonb_build_object('session_id', v_id);
END;
$$;

-- Bingo: start with stake + players, generate cards, auto-draw
CREATE OR REPLACE FUNCTION public.play_bingo(p_stake int, p_players jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_me uuid := auth.uid();
  v_count int;
  v_i int;
  v_j int;
  v_n int;
  v_players jsonb := '[]'::jsonb;
  v_card int[];
  v_nums int[] := ARRAY[]::int[];
  v_pool int[];
  v_tmp int;
  v_drawn jsonb := '[]'::jsonb;
  v_winner_seat int := 0;
  v_winner_name text;
  v_pot int;
  v_uid uuid;
  v_name text;
  v_bal bigint;
  v_host_charge int := 0;
  v_id uuid;
  v_state jsonb;
  v_marked int;
  v_bingo_at int;
  v_best_at int := 999;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.valid_game_stake(p_stake) THEN RAISE EXCEPTION 'Apuesta no válida'; END IF;
  IF p_players IS NULL OR jsonb_typeof(p_players) <> 'array' THEN RAISE EXCEPTION 'Selecciona jugadores'; END IF;
  v_count := jsonb_array_length(p_players);
  IF v_count < 2 OR v_count > 6 THEN RAISE EXCEPTION 'Entre 2 y 6 jugadores'; END IF;
  v_pot := p_stake * v_count;

  -- Build players + 5x3 cards (15 unique nums 1-75)
  FOR v_i IN 0..v_count-1 LOOP
    v_name := NULLIF(trim(coalesce(p_players->v_i->>'name','')), '');
    BEGIN v_uid := NULLIF(p_players->v_i->>'user_id','')::uuid; EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
    IF v_name IS NULL THEN RAISE EXCEPTION 'Nombre obligatorio'; END IF;
    -- charge
    IF v_uid IS NULL OR v_uid = v_me THEN
      v_host_charge := v_host_charge + p_stake;
    ELSE
      SELECT token_balance INTO v_bal FROM public.users WHERE id = v_uid;
      IF coalesce(v_bal,0) < p_stake THEN RAISE EXCEPTION '💰 % sin fichas.', v_name; END IF;
      PERFORM public.credit_tokens(v_uid, -p_stake, 'bingo_wager', 'game_session', NULL);
    END IF;
    -- card
    v_pool := ARRAY(SELECT generate_series(1,75));
    FOR v_j IN REVERSE 75..2 LOOP
      v_n := 1 + floor(random() * v_j)::int;
      v_tmp := v_pool[v_j]; v_pool[v_j] := v_pool[v_n]; v_pool[v_n] := v_tmp;
    END LOOP;
    v_card := v_pool[1:15];
    v_players := v_players || jsonb_build_array(jsonb_build_object(
      'seat', v_i, 'name', v_name, 'user_id', v_uid, 'card', to_jsonb(v_card)
    ));
  END LOOP;
  SELECT token_balance INTO v_bal FROM public.users WHERE id = v_me;
  IF coalesce(v_bal,0) < v_host_charge THEN RAISE EXCEPTION '💰 No tienes fichas suficientes para jugar.'; END IF;
  IF v_host_charge > 0 THEN
    PERFORM public.credit_tokens(v_me, -v_host_charge, 'bingo_wager', 'game_session', NULL);
  END IF;

  -- Shuffle draw order 1..75
  v_pool := ARRAY(SELECT generate_series(1,75));
  FOR v_j IN REVERSE 75..2 LOOP
    v_n := 1 + floor(random() * v_j)::int;
    v_tmp := v_pool[v_j]; v_pool[v_j] := v_pool[v_n]; v_pool[v_n] := v_tmp;
  END LOOP;

  -- Find earliest bingo (all 15 marked)
  FOR v_j IN 1..75 LOOP
    v_drawn := v_drawn || jsonb_build_array(v_pool[v_j]);
    FOR v_i IN 0..v_count-1 LOOP
      SELECT count(*)::int INTO v_marked
      FROM unnest(ARRAY(SELECT jsonb_array_elements_text(v_players->v_i->'card')::int)) AS card_n(n)
      WHERE card_n.n = ANY (v_pool[1:v_j]);
      IF v_marked >= 15 AND v_j < v_best_at THEN
        v_best_at := v_j;
        v_winner_seat := v_i;
        v_winner_name := v_players->v_i->>'name';
      END IF;
    END LOOP;
    EXIT WHEN v_best_at < 999;
  END LOOP;

  v_drawn := to_jsonb(v_pool[1:v_best_at]);
  v_uid := NULLIF(v_players->v_winner_seat->>'user_id','')::uuid;

  v_state := jsonb_build_object(
    'phase','finished','stake', p_stake, 'pot', v_pot,
    'players', v_players, 'drawn', v_drawn, 'draw_count', v_best_at,
    'winner_seat', v_winner_seat, 'winner', v_winner_name,
    'line', true, 'bingo', true, 'finished_at', now()
  );

  INSERT INTO public.game_sessions (game_type, created_by, deck_seed, state, status, finished_at)
  VALUES ('bingo', v_me, md5(random()::text), v_state, 'finished', now())
  RETURNING id INTO v_id;

  IF v_uid IS NOT NULL THEN
    PERFORM public.credit_tokens(v_uid, v_pot, 'bingo_payout', 'game_session', v_id);
    PERFORM public.bump_game_play_stats(v_uid, 'bingo', true, 70);
    PERFORM public.record_game_wager(v_uid, v_id, 'bingo', p_stake, v_pot, 'win');
    PERFORM public.grant_game_achievement(v_uid, 'bingo_first');
  END IF;

  FOR v_i IN 0..v_count-1 LOOP
    IF v_i = v_winner_seat THEN CONTINUE; END IF;
    v_uid := NULLIF(v_players->v_i->>'user_id','')::uuid;
    IF v_uid IS NOT NULL THEN
      PERFORM public.bump_game_play_stats(v_uid, 'bingo', false, 10);
      PERFORM public.record_game_wager(v_uid, v_id, 'bingo', p_stake, 0, 'lose');
    END IF;
  END LOOP;

  RETURN v_state || jsonb_build_object('session_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_casino_hub()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_me uuid := auth.uid();
  v_stats jsonb;
  v_rank jsonb;
  v_missions jsonb;
  r record;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  INSERT INTO public.user_casino_missions (user_id, mission_code)
  SELECT v_me, code FROM public.casino_missions WHERE is_active
  ON CONFLICT DO NOTHING;

  UPDATE public.user_casino_missions ucm SET progress = LEAST(m.target, coalesce((
    SELECT CASE m.metric
      WHEN 'bj_wins' THEN (SELECT coalesce(won,0) FROM user_game_stats WHERE user_id=v_me AND game_type='blackjack')
      WHEN 'carrera_wins' THEN (SELECT coalesce(won,0) FROM user_game_stats WHERE user_id=v_me AND game_type='carrera')
      WHEN 'bingo_wins' THEN (SELECT coalesce(won,0) FROM user_game_stats WHERE user_id=v_me AND game_type='bingo')
      WHEN 'tokens_wagered' THEN (SELECT coalesce(sum(tokens_wagered),0)::int FROM user_game_stats WHERE user_id=v_me AND game_type IN ('blackjack','carrera','ruleta_casino','bingo'))
      WHEN 'best_casino_streak' THEN (SELECT coalesce(max(best_streak),0) FROM user_game_stats WHERE user_id=v_me AND game_type IN ('blackjack','carrera','ruleta_casino','bingo'))
      ELSE 0
    END
  ),0))
  FROM public.casino_missions m
  WHERE m.code = ucm.mission_code AND ucm.user_id = v_me;

  UPDATE public.user_casino_missions ucm SET completed_at = coalesce(completed_at, now())
  FROM public.casino_missions m
  WHERE ucm.user_id = v_me AND m.code = ucm.mission_code AND ucm.progress >= m.target AND ucm.completed_at IS NULL;

  FOR r IN
    SELECT m.code, m.reward_xp, m.reward_tokens
    FROM public.user_casino_missions ucm
    JOIN public.casino_missions m ON m.code = ucm.mission_code
    WHERE ucm.user_id = v_me AND ucm.completed_at IS NOT NULL AND ucm.claimed_at IS NULL
  LOOP
    UPDATE public.users SET xp = xp + r.reward_xp, level = public.level_for_xp(xp + r.reward_xp) WHERE id = v_me;
    PERFORM public.credit_tokens(v_me, r.reward_tokens, 'casino_mission_'||r.code, 'casino_mission', NULL);
    UPDATE public.user_casino_missions SET claimed_at = now() WHERE user_id = v_me AND mission_code = r.code;
  END LOOP;

  SELECT coalesce(jsonb_agg(to_jsonb(s)), '[]'::jsonb) INTO v_stats
  FROM public.user_game_stats s
  WHERE s.user_id = v_me AND s.game_type IN ('blackjack','carrera','ruleta_casino','bingo','ruleta_social');

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'code', m.code, 'title', m.title, 'description', m.description, 'emoji', m.emoji,
    'target', m.target, 'progress', ucm.progress, 'completed', ucm.completed_at IS NOT NULL,
    'reward_xp', m.reward_xp, 'reward_tokens', m.reward_tokens
  ) ORDER BY m.sort_order), '[]'::jsonb)
  INTO v_missions
  FROM public.user_casino_missions ucm
  JOIN public.casino_missions m ON m.code = ucm.mission_code
  WHERE ucm.user_id = v_me AND m.is_active;

  SELECT jsonb_build_object(
    'top_winnings', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT u.display_name, sum(s.tokens_won)::bigint AS value
        FROM user_game_stats s JOIN users u ON u.id = s.user_id
        WHERE s.game_type IN ('blackjack','carrera','ruleta_casino','bingo')
        GROUP BY u.display_name ORDER BY value DESC NULLS LAST LIMIT 5
      ) x
    ), '[]'::jsonb),
    'top_bj', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT u.display_name, s.won AS value FROM user_game_stats s
        JOIN users u ON u.id=s.user_id WHERE s.game_type='blackjack' ORDER BY s.won DESC LIMIT 5
      ) x
    ), '[]'::jsonb),
    'top_carrera', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT u.display_name, s.won AS value FROM user_game_stats s
        JOIN users u ON u.id=s.user_id WHERE s.game_type='carrera' ORDER BY s.won DESC LIMIT 5
      ) x
    ), '[]'::jsonb),
    'top_bingo', coalesce((
      SELECT jsonb_agg(x) FROM (
        SELECT u.display_name, s.won AS value FROM user_game_stats s
        JOIN users u ON u.id=s.user_id WHERE s.game_type='bingo' ORDER BY s.won DESC LIMIT 5
      ) x
    ), '[]'::jsonb)
  ) INTO v_rank;

  RETURN jsonb_build_object('stats', coalesce(v_stats,'[]'::jsonb), 'missions', coalesce(v_missions,'[]'::jsonb), 'rankings', coalesce(v_rank,'{}'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.spin_social_roulette() TO authenticated;
GRANT EXECUTE ON FUNCTION public.spin_casino_roulette(int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_bingo(int, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_casino_hub() TO authenticated;
GRANT EXECUTE ON FUNCTION public.bump_game_play_stats(uuid, text, boolean, int) TO authenticated;
