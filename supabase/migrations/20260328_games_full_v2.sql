-- Game RPCs: start_game, peaje, rey, duelo

CREATE OR REPLACE FUNCTION public.start_game(
  p_game_type text,
  p_opponent_code text DEFAULT NULL,
  p_party_id uuid DEFAULT NULL,
  p_opponent_user_id uuid DEFAULT NULL,
  p_opponent_name text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_opp uuid;
  v_id uuid;
  v_seed text;
  v_deck jsonb;
  v_guest text;
  v_state jsonb;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_game_type NOT IN ('peaje', 'rey', 'duelo') THEN RAISE EXCEPTION 'Juego no válido'; END IF;

  v_seed := md5(v_me::text || clock_timestamp()::text || random()::text);
  v_deck := public.build_spanish_deck(v_seed);

  IF p_game_type = 'peaje' THEN
    v_state := jsonb_build_object(
      'phase', 'intro',
      'step', 0,
      'hits', 0,
      'misses', 0,
      'history', '[]'::jsonb,
      'deck', (
        SELECT jsonb_agg(c) FROM (
          SELECT value AS c FROM jsonb_array_elements(v_deck) WITH ORDINALITY AS t(value, ord)
          WHERE ord <= 6
        ) s
      ),
      'prev_rank', NULL,
      'started_at', NULL
    );
  ELSIF p_game_type = 'rey' THEN
    v_state := jsonb_build_object(
      'phase', 'intro',
      'kings', 0,
      'turns', 0,
      'deck', v_deck,
      'drawn', '[]'::jsonb,
      'history', '[]'::jsonb,
      'started_at', NULL
    );
  ELSE
    v_opp := p_opponent_user_id;
    IF v_opp IS NULL AND p_opponent_code IS NOT NULL AND length(trim(p_opponent_code)) > 0 THEN
      SELECT id INTO v_opp FROM public.users WHERE upper(friend_code) = upper(trim(p_opponent_code));
    END IF;
    v_guest := NULLIF(trim(coalesce(p_opponent_name, '')), '');
    IF v_opp IS NULL AND v_guest IS NULL THEN
      RAISE EXCEPTION 'Elige un rival o escribe su nombre';
    END IF;
    IF v_opp = v_me THEN RAISE EXCEPTION 'No puedes duelar contigo mismo'; END IF;

    v_state := jsonb_build_object(
      'phase', 'intro',
      'guest_name', v_guest,
      'opponent_id', v_opp,
      'ties', 0,
      'rounds', '[]'::jsonb,
      'started_at', NULL
    );
  END IF;

  INSERT INTO public.game_sessions (game_type, party_id, created_by, deck_seed, state, status)
  VALUES (p_game_type, p_party_id, v_me, v_seed, v_state, 'active')
  RETURNING id INTO v_id;

  INSERT INTO public.game_players (session_id, user_id, seat) VALUES (v_id, v_me, 0);

  IF p_game_type = 'duelo' AND v_opp IS NOT NULL THEN
    INSERT INTO public.game_players (session_id, user_id, seat) VALUES (v_id, v_opp, 1);
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.play_peaje_step(p_session_id uuid, p_guess text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  g public.game_sessions%rowtype;
  v_state jsonb;
  v_phase text;
  v_step int;
  v_deck jsonb;
  v_card jsonb;
  v_rank int;
  v_suit text;
  v_hits int;
  v_misses int;
  v_prev int;
  v_ok boolean := false;
  v_result text;
  v_prompt text;
  v_history jsonb;
  v_xp int;
  v_tokens int;
  v_won boolean;
  v_perfect boolean;
  v_out jsonb;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO g FROM public.game_sessions WHERE id = p_session_id AND game_type = 'peaje';
  IF g.id IS NULL THEN RAISE EXCEPTION 'Sesión Peaje no válida'; END IF;
  IF g.created_by <> v_me AND NOT public.is_global_admin() THEN RAISE EXCEPTION 'No es tu partida'; END IF;
  IF g.status <> 'active' THEN RAISE EXCEPTION 'Partida terminada'; END IF;

  v_state := g.state;
  v_phase := coalesce(v_state->>'phase', 'intro');
  v_step := coalesce((v_state->>'step')::int, 0);
  v_deck := coalesce(v_state->'deck', '[]'::jsonb);
  v_hits := coalesce((v_state->>'hits')::int, 0);
  v_misses := coalesce((v_state->>'misses')::int, 0);
  v_history := coalesce(v_state->'history', '[]'::jsonb);
  v_prev := NULLIF(v_state->>'prev_rank', '')::int;

  -- Start: shuffle already done, enter play
  IF p_guess = 'start' OR v_phase = 'intro' THEN
    IF p_guess <> 'start' AND v_phase = 'intro' THEN
      RAISE EXCEPTION 'Pulsa Empezar para barajar';
    END IF;
    v_state := v_state || jsonb_build_object('phase', 'play', 'step', 0, 'started_at', now());
    UPDATE public.game_sessions SET state = v_state WHERE id = p_session_id;
    RETURN jsonb_build_object(
      'phase', 'play', 'step', 0, 'prompt', 'Carta 1: ¿Par o Impar?',
      'options', jsonb_build_array('even', 'odd')
    );
  END IF;

  IF v_phase <> 'play' THEN RAISE EXCEPTION 'Partida no jugable'; END IF;
  IF v_step > 5 THEN RAISE EXCEPTION 'Partida ya completada'; END IF;

  v_card := v_deck -> v_step;
  IF v_card IS NULL THEN RAISE EXCEPTION 'Baraja incompleta'; END IF;
  v_rank := (v_card->>'rank')::int;
  v_suit := v_card->>'suit';

  IF v_step = 2 THEN
    -- Peaje obligatorio
    v_result := 'peaje';
    v_ok := false;
    v_prompt := '🍺 Peaje obligatorio: bebes';
  ELSIF v_step IN (0, 1) THEN
    IF p_guess NOT IN ('even', 'odd') THEN RAISE EXCEPTION 'Elige Par o Impar'; END IF;
    v_ok := (p_guess = 'even' AND v_rank % 2 = 0) OR (p_guess = 'odd' AND v_rank % 2 = 1);
    v_result := CASE WHEN v_ok THEN 'hit' ELSE 'miss' END;
  ELSIF v_step IN (3, 4) THEN
    IF p_guess NOT IN ('higher', 'lower') THEN RAISE EXCEPTION 'Elige Mayor o Menor'; END IF;
    IF v_prev IS NULL THEN RAISE EXCEPTION 'Falta carta previa'; END IF;
    IF v_rank = v_prev THEN
      -- Same rank: treat higher as miss, lower as miss unless we allow "same" — count as miss
      v_ok := false;
    ELSIF p_guess = 'higher' THEN
      v_ok := v_rank > v_prev;
    ELSE
      v_ok := v_rank < v_prev;
    END IF;
    v_result := CASE WHEN v_ok THEN 'hit' ELSE 'miss' END;
  ELSIF v_step = 5 THEN
    IF p_guess NOT IN ('oros', 'copas', 'espadas', 'bastos') THEN RAISE EXCEPTION 'Elige un palo'; END IF;
    v_ok := lower(p_guess) = lower(v_suit);
    v_result := CASE WHEN v_ok THEN 'hit' ELSE 'miss' END;
  END IF;

  IF v_result = 'hit' THEN v_hits := v_hits + 1;
  ELSIF v_result = 'miss' THEN v_misses := v_misses + 1;
  END IF;

  v_history := v_history || jsonb_build_array(jsonb_build_object(
    'step', v_step, 'card', v_card, 'guess', p_guess, 'result', v_result
  ));

  v_step := v_step + 1;
  v_state := v_state || jsonb_build_object(
    'hits', v_hits,
    'misses', v_misses,
    'step', v_step,
    'prev_rank', v_rank,
    'last_card', v_card,
    'last_result', v_result,
    'last_guess', p_guess,
    'history', v_history
  );

  IF v_step > 5 THEN
    v_perfect := (v_hits = 5 AND v_misses = 0);
    v_won := v_hits >= 3;
    v_xp := 20 + (v_hits * 8) + CASE WHEN v_perfect THEN 40 ELSE 0 END;
    v_tokens := 10 + (v_hits * 3) + CASE WHEN v_perfect THEN 25 ELSE 0 END;
    v_state := v_state || jsonb_build_object(
      'phase', 'finished',
      'perfect', v_perfect,
      'won', v_won,
      'xp', v_xp,
      'tokens', v_tokens,
      'finished_at', now()
    );
    UPDATE public.game_sessions
    SET state = v_state, status = 'finished', finished_at = now()
    WHERE id = p_session_id;
    PERFORM public.touch_game_stats(v_me, 'peaje', v_won, v_xp, v_tokens, 0, v_perfect);
    RETURN jsonb_build_object(
      'phase', 'finished', 'card', v_card, 'result', v_result,
      'hits', v_hits, 'misses', v_misses, 'won', v_won,
      'perfect', v_perfect, 'xp', v_xp, 'tokens', v_tokens
    );
  END IF;

  UPDATE public.game_sessions SET state = v_state WHERE id = p_session_id;

  v_prompt := CASE v_step
    WHEN 1 THEN 'Carta 2: ¿Par o Impar?'
    WHEN 2 THEN 'Carta 3: Peaje obligatorio'
    WHEN 3 THEN 'Carta 4: ¿Mayor o Menor que la anterior?'
    WHEN 4 THEN 'Carta 5: ¿Mayor o Menor que la anterior?'
    WHEN 5 THEN 'Carta final: ¿De qué palo es?'
    ELSE 'Siguiente'
  END;

  RETURN jsonb_build_object(
    'phase', 'play',
    'step', v_step,
    'card', v_card,
    'result', v_result,
    'hits', v_hits,
    'misses', v_misses,
    'prompt', v_prompt,
    'options', CASE v_step
      WHEN 1 THEN jsonb_build_array('even', 'odd')
      WHEN 2 THEN jsonb_build_array('continue')
      WHEN 3 THEN jsonb_build_array('higher', 'lower')
      WHEN 4 THEN jsonb_build_array('higher', 'lower')
      WHEN 5 THEN jsonb_build_array('oros', 'copas', 'espadas', 'bastos')
      ELSE '[]'::jsonb
    END
  );
END;
$$;

-- Back-compat alias
CREATE OR REPLACE FUNCTION public.play_peaje_spin(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.play_peaje_step(p_session_id, 'start');
END;
$$;

CREATE OR REPLACE FUNCTION public.draw_rey_card(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  g public.game_sessions%rowtype;
  v_state jsonb;
  v_deck jsonb;
  v_drawn jsonb;
  v_card jsonb;
  v_rank int;
  v_kings int;
  v_turns int;
  v_effect text;
  v_history jsonb;
  v_done boolean := false;
  v_xp int;
  v_tokens int;
  v_duration_sec int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO g FROM public.game_sessions WHERE id = p_session_id AND game_type = 'rey';
  IF g.id IS NULL THEN RAISE EXCEPTION 'Sesión Rey no válida'; END IF;
  IF g.created_by <> v_me AND NOT EXISTS (
    SELECT 1 FROM public.game_players WHERE session_id = p_session_id AND user_id = v_me
  ) THEN RAISE EXCEPTION 'No estás en la partida'; END IF;
  IF g.status <> 'active' THEN RAISE EXCEPTION 'Partida terminada'; END IF;

  v_state := g.state;

  IF coalesce(v_state->>'phase', 'intro') = 'intro' THEN
    v_state := v_state || jsonb_build_object('phase', 'play', 'started_at', now());
  END IF;

  v_deck := coalesce(v_state->'deck', public.build_spanish_deck(coalesce(g.deck_seed, g.id::text)));
  v_drawn := coalesce(v_state->'drawn', '[]'::jsonb);
  v_history := coalesce(v_state->'history', '[]'::jsonb);
  v_kings := coalesce((v_state->>'kings')::int, 0);
  v_turns := coalesce((v_state->>'turns')::int, 0);

  IF jsonb_array_length(v_deck) < 1 THEN
    RAISE EXCEPTION 'Baraja agotada';
  END IF;

  v_card := v_deck -> 0;
  v_deck := v_deck - 0;
  v_rank := (v_card->>'rank')::int;
  v_turns := v_turns + 1;

  v_effect := CASE v_rank
    WHEN 1 THEN 'As: Todos beben'
    WHEN 2 THEN '2: Elige quién bebe'
    WHEN 3 THEN '3: Bebes tú'
    WHEN 4 THEN '4: Todos menos tú'
    WHEN 5 THEN '5: Elige una persona para beber dos tragos'
    WHEN 6 THEN '6: Beben los solteros'
    WHEN 7 THEN '7: Último en levantar la mano bebe'
    WHEN 8 THEN 'Sota: Beben quienes tienen pareja'
    WHEN 9 THEN 'Caballo: Bebe quien haya hecho el amor más recientemente'
    WHEN 10 THEN 'Rey: Rey encontrado'
    ELSE 'Carta'
  END;

  IF v_rank = 10 THEN
    v_kings := v_kings + 1;
  END IF;
  IF v_kings >= 4 THEN v_done := true; END IF;

  v_drawn := v_drawn || jsonb_build_array(v_card);
  v_history := v_history || jsonb_build_array(jsonb_build_object(
    'turn', v_turns, 'card', v_card, 'effect', v_effect, 'kings', v_kings
  ));

  v_state := v_state || jsonb_build_object(
    'phase', CASE WHEN v_done THEN 'finished' ELSE 'play' END,
    'deck', v_deck,
    'drawn', v_drawn,
    'history', v_history,
    'turns', v_turns,
    'kings', v_kings,
    'last_card', v_card,
    'last_effect', v_effect,
    'last_rank', v_rank
  );

  IF v_done THEN
    v_duration_sec := GREATEST(1, EXTRACT(EPOCH FROM (now() - coalesce((v_state->>'started_at')::timestamptz, g.created_at)))::int);
    v_xp := 35 + GREATEST(0, 40 - v_turns);
    v_tokens := 20 + v_kings * 2;
    v_state := v_state || jsonb_build_object(
      'won', true,
      'xp', v_xp,
      'tokens', v_tokens,
      'duration_sec', v_duration_sec,
      'finished_at', now()
    );
    UPDATE public.game_sessions
    SET state = v_state, status = 'finished', finished_at = now()
    WHERE id = p_session_id;
    PERFORM public.touch_game_stats(v_me, 'rey', true, v_xp, v_tokens, 0, false);
  ELSE
    UPDATE public.game_sessions SET state = v_state WHERE id = p_session_id;
    -- Partial king progress toward first-king achievement
    IF v_rank = 10 THEN
      INSERT INTO public.user_game_stats (user_id, game_type, kings_found)
      VALUES (v_me, 'rey', 1)
      ON CONFLICT (user_id, game_type) DO UPDATE
        SET kings_found = public.user_game_stats.kings_found + 1, updated_at = now();
      PERFORM public.grant_game_achievement(v_me, 'rey_first');
      IF (SELECT kings_found FROM public.user_game_stats WHERE user_id = v_me AND game_type = 'rey') >= 25 THEN
        PERFORM public.grant_game_achievement(v_me, 'rey_coleccionista');
      END IF;
      IF (SELECT kings_found FROM public.user_game_stats WHERE user_id = v_me AND game_type = 'rey') >= 100 THEN
        PERFORM public.grant_game_achievement(v_me, 'rey_supremo');
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'card', v_card,
    'effect', v_effect,
    'kings', v_kings,
    'turns', v_turns,
    'finished', v_done,
    'xp', CASE WHEN v_done THEN v_xp ELSE 0 END,
    'tokens', CASE WHEN v_done THEN v_tokens ELSE 0 END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.play_duelo_round(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  g public.game_sessions%rowtype;
  v_state jsonb;
  p1 uuid;
  p2 uuid;
  v_guest text;
  v_name1 text;
  v_name2 text;
  c1 jsonb;
  c2 jsonb;
  r1 int;
  r2 int;
  v_deck jsonb;
  v_ties int := 0;
  v_rounds jsonb;
  v_winner_id uuid;
  v_winner_name text;
  v_loser_name text;
  v_xp int;
  v_tokens int;
  v_i int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO g FROM public.game_sessions WHERE id = p_session_id AND game_type = 'duelo';
  IF g.id IS NULL THEN RAISE EXCEPTION 'Sesión Duelo no válida'; END IF;
  IF g.status <> 'active' THEN RAISE EXCEPTION 'Partida terminada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.game_players WHERE session_id = p_session_id AND user_id = v_me) THEN
    RAISE EXCEPTION 'No estás en la partida';
  END IF;

  v_state := g.state;
  SELECT user_id INTO p1 FROM public.game_players WHERE session_id = p_session_id AND seat = 0;
  SELECT user_id INTO p2 FROM public.game_players WHERE session_id = p_session_id AND seat = 1;
  v_guest := NULLIF(v_state->>'guest_name', '');

  SELECT display_name INTO v_name1 FROM public.users WHERE id = p1;
  IF p2 IS NOT NULL THEN
    SELECT display_name INTO v_name2 FROM public.users WHERE id = p2;
  ELSE
    v_name2 := coalesce(v_guest, 'Invitado');
  END IF;

  IF coalesce(v_state->>'phase', 'intro') = 'intro' THEN
    v_state := v_state || jsonb_build_object('phase', 'play', 'started_at', now());
  END IF;

  v_deck := public.build_spanish_deck(coalesce(g.deck_seed, g.id::text) || coalesce(v_state->>'ties', '0'));
  v_rounds := coalesce(v_state->'rounds', '[]'::jsonb);

  -- Draw until decisive (max 20 to avoid infinite)
  FOR v_i IN 1..20 LOOP
    c1 := v_deck -> ((v_i - 1) * 2);
    c2 := v_deck -> ((v_i - 1) * 2 + 1);
    IF c1 IS NULL OR c2 IS NULL THEN
      v_deck := public.build_spanish_deck(g.id::text || v_i::text || clock_timestamp()::text);
      c1 := v_deck -> 0;
      c2 := v_deck -> 1;
    END IF;
    r1 := (c1->>'rank')::int;
    r2 := (c2->>'rank')::int;
    IF r1 = r2 THEN
      v_ties := v_ties + 1;
      v_rounds := v_rounds || jsonb_build_array(jsonb_build_object(
        'card1', c1, 'card2', c2, 'tie', true
      ));
    ELSE
      EXIT;
    END IF;
  END LOOP;

  IF r1 > r2 THEN
    v_winner_id := p1;
    v_winner_name := v_name1;
    v_loser_name := v_name2;
  ELSE
    v_winner_id := p2;
    v_winner_name := v_name2;
    v_loser_name := v_name1;
  END IF;

  v_rounds := v_rounds || jsonb_build_array(jsonb_build_object(
    'card1', c1, 'card2', c2, 'tie', false,
    'winner', v_winner_name, 'loser', v_loser_name
  ));

  v_xp := 25 + LEAST(v_ties * 5, 25);
  v_tokens := 15 + LEAST(v_ties * 2, 10);

  v_state := v_state || jsonb_build_object(
    'phase', 'finished',
    'ties', v_ties,
    'rounds', v_rounds,
    'last', jsonb_build_object(
      'card1', c1, 'card2', c2,
      'name1', v_name1, 'name2', v_name2,
      'winner_id', v_winner_id,
      'winner', v_winner_name,
      'loser', v_loser_name,
      'ties', v_ties
    ),
    'won_by_me', (v_winner_id = v_me),
    'xp', v_xp,
    'tokens', v_tokens,
    'finished_at', now()
  );

  UPDATE public.game_sessions
  SET state = v_state, status = 'finished', finished_at = now()
  WHERE id = p_session_id;

  -- Stats for host (and opponent if registered)
  PERFORM public.touch_game_stats(p1, 'duelo', (v_winner_id = p1), CASE WHEN v_winner_id = p1 THEN v_xp ELSE 10 END, CASE WHEN v_winner_id = p1 THEN v_tokens ELSE 5 END, 0, false);
  IF p2 IS NOT NULL THEN
    PERFORM public.touch_game_stats(p2, 'duelo', (v_winner_id = p2), CASE WHEN v_winner_id = p2 THEN v_xp ELSE 10 END, CASE WHEN v_winner_id = p2 THEN v_tokens ELSE 5 END, 0, false);
    UPDATE public.friendships SET
      chemistry_xp = chemistry_xp + 10,
      last_related_activity_at = now(),
      chemistry_score = least(100, chemistry_score + 2)
    WHERE user_a = least(p1, p2) AND user_b = greatest(p1, p2);
  END IF;

  RETURN v_state->'last' || jsonb_build_object('xp', v_xp, 'tokens', v_tokens, 'ties', v_ties);
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_game(text, text, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_peaje_step(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_peaje_spin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.draw_rey_card(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_duelo_round(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.build_spanish_deck(text) TO authenticated;
