-- ============================================================
-- start_game with stakes · play_blackjack wager · carrera race
-- ============================================================

DROP FUNCTION IF EXISTS public.start_game(text, text, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.start_game(
  p_game_type text,
  p_opponent_code text DEFAULT NULL,
  p_party_id uuid DEFAULT NULL,
  p_opponent_user_id uuid DEFAULT NULL,
  p_opponent_name text DEFAULT NULL,
  p_stake integer DEFAULT NULL,
  p_players jsonb DEFAULT NULL
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
  c1 jsonb; c2 jsonb; c3 jsonb; c4 jsonb;
  v_player jsonb;
  v_dealer jsonb;
  v_p_total int;
  v_d_total int;
  v_stake int := coalesce(p_stake, 0);
  v_bal bigint;
  v_payout int;
  v_xp int;
  v_result text;
  v_msg text;
  v_horses jsonb := '[]'::jsonb;
  v_horse jsonb;
  v_name text;
  v_uid uuid;
  v_i int := 0;
  v_count int;
  v_my_name text;
  v_charge_uid uuid;
  v_charge_bal bigint;
  v_total_host int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_game_type NOT IN ('peaje', 'rey', 'duelo', 'blackjack', 'carrera') THEN
    RAISE EXCEPTION 'Juego no válido';
  END IF;

  v_seed := md5(v_me::text || clock_timestamp()::text || random()::text);
  SELECT display_name, token_balance INTO v_my_name, v_bal FROM public.users WHERE id = v_me;

  IF p_game_type = 'blackjack' THEN
    IF NOT public.valid_game_stake(v_stake) THEN
      RAISE EXCEPTION 'Elige una apuesta válida (50–1000)';
    END IF;
    IF coalesce(v_bal, 0) < v_stake THEN
      RAISE EXCEPTION '💰 No tienes fichas suficientes para jugar.';
    END IF;
    PERFORM public.credit_tokens(v_me, -v_stake, 'bj_wager', 'game_session', NULL);

    v_deck := public.build_poker_deck(v_seed);
    c1 := v_deck -> 0; c2 := v_deck -> 1; c3 := v_deck -> 2; c4 := v_deck -> 3;
    v_player := jsonb_build_array(c1, c3);
    v_dealer := jsonb_build_array(c2, c4);
    v_p_total := public.blackjack_hand_total(v_player);
    v_d_total := public.blackjack_hand_total(v_dealer);

    v_state := jsonb_build_object(
      'phase', 'player',
      'deck', v_deck,
      'idx', 4,
      'player', v_player,
      'dealer', v_dealer,
      'player_total', v_p_total,
      'dealer_total', v_d_total,
      'dealer_shown', public.blackjack_hand_total(jsonb_build_array(c2)),
      'hide_dealer', true,
      'stake', v_stake,
      'started_at', now()
    );

    IF v_p_total = 21 OR v_d_total = 21 THEN
      v_state := v_state || jsonb_build_object('hide_dealer', false, 'phase', 'finished');
      IF v_p_total = 21 AND v_d_total = 21 THEN
        v_result := 'push'; v_xp := 15; v_payout := v_stake;
        v_msg := 'Empate · apuesta devuelta';
      ELSIF v_p_total = 21 THEN
        v_result := 'blackjack'; v_xp := 60;
        v_payout := (v_stake * 5) / 2; -- 2.5x total
        v_msg := '¡BLACKJACK! · +' || (v_payout - v_stake) || ' beneficio';
      ELSE
        v_result := 'lose'; v_xp := 5; v_payout := 0;
        v_msg := 'El dealer tiene BlackJack · -' || v_stake;
      END IF;
      v_state := v_state || jsonb_build_object(
        'result', v_result, 'xp', v_xp, 'tokens', v_payout - v_stake,
        'payout', v_payout, 'message', v_msg, 'finished_at', now()
      );
    END IF;

  ELSIF p_game_type = 'carrera' THEN
    IF NOT public.valid_game_stake(v_stake) THEN
      RAISE EXCEPTION 'Elige una apuesta válida (50–1000)';
    END IF;
    IF p_players IS NULL OR jsonb_typeof(p_players) <> 'array' THEN
      RAISE EXCEPTION 'Selecciona de 2 a 4 caballos';
    END IF;
    v_count := jsonb_array_length(p_players);
    IF v_count < 2 OR v_count > 4 THEN
      RAISE EXCEPTION 'Selecciona de 2 a 4 caballos';
    END IF;

    -- Build horses; ensure host is included
    FOR v_i IN 0..v_count - 1 LOOP
      v_horse := p_players -> v_i;
      v_name := NULLIF(trim(coalesce(v_horse->>'name', '')), '');
      BEGIN
        v_uid := NULLIF(v_horse->>'user_id', '')::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_uid := NULL;
      END;
      IF v_name IS NULL AND v_uid IS NOT NULL THEN
        SELECT display_name INTO v_name FROM public.users WHERE id = v_uid;
      END IF;
      IF v_name IS NULL THEN
        RAISE EXCEPTION 'Cada caballo necesita un nombre';
      END IF;
      v_horses := v_horses || jsonb_build_array(jsonb_build_object(
        'seat', v_i,
        'name', v_name,
        'user_id', v_uid,
        'progress', 0,
        'color', (ARRAY['#f59e0b','#22c55e','#38bdf8','#f472b6'])[v_i + 1]
      ));
    END LOOP;

    -- Charge stake per horse: real users pay themselves; guests charged to host
    v_total_host := 0;
    FOR v_i IN 0..v_count - 1 LOOP
      v_uid := NULLIF((v_horses -> v_i ->> 'user_id'), '')::uuid;
      v_charge_uid := coalesce(v_uid, v_me);
      IF v_charge_uid = v_me THEN
        v_total_host := v_total_host + v_stake;
      ELSE
        SELECT token_balance INTO v_charge_bal FROM public.users WHERE id = v_charge_uid;
        IF coalesce(v_charge_bal, 0) < v_stake THEN
          RAISE EXCEPTION '💰 % no tiene fichas suficientes.', (v_horses -> v_i ->> 'name');
        END IF;
        PERFORM public.credit_tokens(v_charge_uid, -v_stake, 'carrera_wager', 'game_session', NULL);
      END IF;
    END LOOP;
    SELECT token_balance INTO v_bal FROM public.users WHERE id = v_me;
    IF coalesce(v_bal, 0) < v_total_host THEN
      RAISE EXCEPTION '💰 No tienes fichas suficientes para jugar.';
    END IF;
    IF v_total_host > 0 THEN
      PERFORM public.credit_tokens(v_me, -v_total_host, 'carrera_wager', 'game_session', NULL);
    END IF;

    v_state := jsonb_build_object(
      'phase', 'intro',
      'stake', v_stake,
      'pot', v_stake * v_count,
      'track_length', 20,
      'horses', v_horses,
      'ticks', '[]'::jsonb,
      'events', '[]'::jsonb,
      'started_at', NULL
    );

  ELSIF p_game_type = 'peaje' THEN
    v_deck := public.build_spanish_deck(v_seed);
    v_state := jsonb_build_object(
      'phase', 'intro', 'step', 0, 'hits', 0, 'misses', 0, 'history', '[]'::jsonb,
      'deck', (SELECT jsonb_agg(c) FROM (
        SELECT value AS c FROM jsonb_array_elements(v_deck) WITH ORDINALITY AS t(value, ord) WHERE ord <= 6
      ) s),
      'prev_rank', NULL, 'started_at', NULL
    );
  ELSIF p_game_type = 'rey' THEN
    v_deck := public.build_spanish_deck(v_seed);
    v_state := jsonb_build_object(
      'phase', 'intro', 'kings', 0, 'turns', 0, 'deck', v_deck,
      'drawn', '[]'::jsonb, 'history', '[]'::jsonb, 'started_at', NULL
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
      'phase', 'intro', 'guest_name', v_guest, 'opponent_id', v_opp,
      'ties', 0, 'rounds', '[]'::jsonb, 'started_at', NULL
    );
  END IF;

  INSERT INTO public.game_sessions (game_type, party_id, created_by, deck_seed, state, status)
  VALUES (
    p_game_type, p_party_id, v_me, v_seed, v_state,
    CASE WHEN p_game_type = 'blackjack' AND (v_state->>'phase') = 'finished' THEN 'finished' ELSE 'active' END
  )
  RETURNING id INTO v_id;

  -- Fix wager refs to session
  UPDATE public.token_ledger SET ref_id = v_id
  WHERE user_id = v_me AND ref_id IS NULL AND reason IN ('bj_wager', 'carrera_wager')
    AND created_at > now() - interval '5 seconds';

  INSERT INTO public.game_players (session_id, user_id, seat) VALUES (v_id, v_me, 0);

  IF p_game_type = 'duelo' AND v_opp IS NOT NULL THEN
    INSERT INTO public.game_players (session_id, user_id, seat) VALUES (v_id, v_opp, 1);
  END IF;

  IF p_game_type = 'carrera' THEN
    FOR v_i IN 0..jsonb_array_length(v_horses) - 1 LOOP
      v_uid := NULLIF((v_horses -> v_i ->> 'user_id'), '')::uuid;
      IF v_uid IS NOT NULL AND v_uid <> v_me THEN
        INSERT INTO public.game_players (session_id, user_id, seat)
        VALUES (v_id, v_uid, v_i);
      END IF;
    END LOOP;
  END IF;

  IF p_game_type = 'blackjack' AND (v_state->>'phase') = 'finished' THEN
    UPDATE public.game_sessions SET finished_at = now() WHERE id = v_id;
    v_payout := coalesce((v_state->>'payout')::int, 0);
    IF v_payout > 0 THEN
      PERFORM public.credit_tokens(v_me, v_payout, 'bj_payout', 'game_session', v_id);
    END IF;
    PERFORM public.touch_blackjack_stats(
      v_me, v_state->>'result',
      coalesce((v_state->>'xp')::int, 0),
      0, v_id, v_stake, v_payout
    );
  END IF;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.play_blackjack(p_session_id uuid, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  g public.game_sessions%rowtype;
  v_state jsonb;
  v_action text := lower(trim(p_action));
  v_deck jsonb;
  v_idx int;
  v_player jsonb;
  v_dealer jsonb;
  v_card jsonb;
  v_p_total int;
  v_d_total int;
  v_result text;
  v_xp int;
  v_msg text;
  v_stake int;
  v_payout int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO g FROM public.game_sessions WHERE id = p_session_id AND game_type = 'blackjack';
  IF g.id IS NULL THEN RAISE EXCEPTION 'Sesión BlackJack no válida'; END IF;
  IF g.created_by <> v_me AND NOT public.is_global_admin() THEN RAISE EXCEPTION 'No es tu partida'; END IF;
  IF g.status <> 'active' THEN RAISE EXCEPTION 'Partida terminada'; END IF;

  v_state := g.state;
  IF coalesce(v_state->>'phase', '') <> 'player' THEN
    RAISE EXCEPTION 'No puedes jugar ahora';
  END IF;
  IF v_action NOT IN ('hit', 'stand') THEN
    RAISE EXCEPTION 'Acción no válida';
  END IF;

  v_stake := coalesce((v_state->>'stake')::int, 0);
  v_deck := coalesce(v_state->'deck', '[]'::jsonb);
  v_idx := coalesce((v_state->>'idx')::int, 0);
  v_player := coalesce(v_state->'player', '[]'::jsonb);
  v_dealer := coalesce(v_state->'dealer', '[]'::jsonb);

  IF v_action = 'hit' THEN
    v_card := v_deck -> v_idx;
    IF v_card IS NULL THEN
      v_deck := public.build_poker_deck(g.id::text || clock_timestamp()::text);
      v_idx := 0;
      v_card := v_deck -> 0;
    END IF;
    v_player := v_player || jsonb_build_array(v_card);
    v_idx := v_idx + 1;
    v_p_total := public.blackjack_hand_total(v_player);

    IF v_p_total > 21 THEN
      v_result := 'lose'; v_xp := 5; v_payout := 0;
      v_msg := 'Te pasaste · -' || v_stake;
      v_state := v_state || jsonb_build_object(
        'phase', 'finished', 'hide_dealer', false,
        'player', v_player, 'dealer', v_dealer, 'idx', v_idx, 'deck', v_deck,
        'player_total', v_p_total,
        'dealer_total', public.blackjack_hand_total(v_dealer),
        'result', v_result, 'xp', v_xp, 'tokens', -v_stake,
        'payout', v_payout, 'message', v_msg, 'finished_at', now()
      );
      UPDATE public.game_sessions SET state = v_state, status = 'finished', finished_at = now() WHERE id = p_session_id;
      PERFORM public.touch_blackjack_stats(v_me, v_result, v_xp, 0, p_session_id, v_stake, v_payout);
      RETURN v_state;
    END IF;

    v_state := v_state || jsonb_build_object(
      'player', v_player, 'idx', v_idx, 'deck', v_deck,
      'player_total', v_p_total, 'last_card', v_card
    );
    UPDATE public.game_sessions SET state = v_state WHERE id = p_session_id;
    RETURN v_state;
  END IF;

  v_p_total := public.blackjack_hand_total(v_player);
  v_d_total := public.blackjack_hand_total(v_dealer);

  WHILE v_d_total < 17 LOOP
    v_card := v_deck -> v_idx;
    IF v_card IS NULL THEN
      v_deck := public.build_poker_deck(g.id::text || 'd' || clock_timestamp()::text);
      v_idx := 0;
      v_card := v_deck -> 0;
    END IF;
    v_dealer := v_dealer || jsonb_build_array(v_card);
    v_idx := v_idx + 1;
    v_d_total := public.blackjack_hand_total(v_dealer);
  END LOOP;

  IF v_d_total > 21 THEN
    v_result := 'win'; v_xp := 40; v_payout := v_stake * 2;
    v_msg := 'Dealer se pasa · +' || v_stake;
  ELSIF v_p_total > v_d_total THEN
    v_result := 'win'; v_xp := 35; v_payout := v_stake * 2;
    v_msg := '¡Ganas! · +' || v_stake;
  ELSIF v_p_total < v_d_total THEN
    v_result := 'lose'; v_xp := 8; v_payout := 0;
    v_msg := 'Pierdes · -' || v_stake;
  ELSE
    v_result := 'push'; v_xp := 15; v_payout := v_stake;
    v_msg := 'Empate · apuesta devuelta';
  END IF;

  v_state := v_state || jsonb_build_object(
    'phase', 'finished', 'hide_dealer', false,
    'player', v_player, 'dealer', v_dealer, 'idx', v_idx, 'deck', v_deck,
    'player_total', v_p_total, 'dealer_total', v_d_total,
    'result', v_result, 'xp', v_xp,
    'tokens', v_payout - v_stake, 'payout', v_payout,
    'message', v_msg, 'finished_at', now()
  );

  UPDATE public.game_sessions SET state = v_state, status = 'finished', finished_at = now() WHERE id = p_session_id;
  IF v_payout > 0 THEN
    PERFORM public.credit_tokens(v_me, v_payout, 'bj_payout', 'game_session', p_session_id);
  END IF;
  PERFORM public.touch_blackjack_stats(v_me, v_result, v_xp, 0, p_session_id, v_stake, v_payout);
  RETURN v_state;
END;
$$;

-- Generate full race + settle
CREATE OR REPLACE FUNCTION public.run_carrera(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  g public.game_sessions%rowtype;
  v_state jsonb;
  v_horses jsonb;
  v_ticks jsonb := '[]'::jsonb;
  v_tick jsonb;
  v_advances jsonb;
  v_events jsonb;
  v_track int;
  v_stake int;
  v_pot int;
  v_done boolean := false;
  v_round int := 0;
  v_i int;
  v_n int;
  v_prog int;
  v_add int;
  v_event text;
  v_seed text;
  v_hash text;
  v_standings jsonb := '[]'::jsonb;
  v_sorted jsonb;
  v_place int;
  v_uid uuid;
  v_payout int;
  v_xp int;
  v_winner text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO g FROM public.game_sessions WHERE id = p_session_id AND game_type = 'carrera';
  IF g.id IS NULL THEN RAISE EXCEPTION 'Carrera no válida'; END IF;
  IF g.created_by <> v_me AND NOT public.is_global_admin() THEN RAISE EXCEPTION 'No es tu carrera'; END IF;
  IF g.status <> 'active' THEN RAISE EXCEPTION 'Carrera terminada'; END IF;

  v_state := g.state;
  IF coalesce(v_state->>'phase', '') NOT IN ('intro', 'racing') THEN
    RAISE EXCEPTION 'La carrera ya no se puede iniciar';
  END IF;

  v_horses := coalesce(v_state->'horses', '[]'::jsonb);
  v_n := jsonb_array_length(v_horses);
  v_track := coalesce((v_state->>'track_length')::int, 20);
  v_stake := coalesce((v_state->>'stake')::int, 0);
  v_pot := coalesce((v_state->>'pot')::int, v_stake * v_n);
  v_seed := coalesce(g.deck_seed, g.id::text);

  WHILE NOT v_done AND v_round < 40 LOOP
    v_round := v_round + 1;
    v_advances := '[]'::jsonb;
    v_events := '[]'::jsonb;

    FOR v_i IN 0..v_n - 1 LOOP
      v_hash := md5(v_seed || ':r' || v_round || ':h' || v_i);
      v_add := 1 + (get_byte(decode(v_hash, 'hex'), 0) % 3); -- 1..3
      -- event chance ~18%
      IF (get_byte(decode(v_hash, 'hex'), 1) % 100) < 18 THEN
        v_event := (ARRAY['sprint','aceleron','ultimo'])[1 + (get_byte(decode(v_hash, 'hex'), 2) % 3)];
        v_add := v_add + CASE v_event WHEN 'sprint' THEN 2 WHEN 'aceleron' THEN 3 ELSE 4 END;
        v_events := v_events || jsonb_build_array(jsonb_build_object(
          'seat', v_i,
          'name', v_horses -> v_i ->> 'name',
          'event', v_event,
          'bonus', CASE v_event WHEN 'sprint' THEN 2 WHEN 'aceleron' THEN 3 ELSE 4 END
        ));
      ELSE
        v_event := NULL;
      END IF;
      v_prog := coalesce((v_horses -> v_i ->> 'progress')::int, 0) + v_add;
      IF v_prog > v_track THEN v_prog := v_track; END IF;
      v_horses := jsonb_set(v_horses, ARRAY[v_i::text, 'progress'], to_jsonb(v_prog));
      v_advances := v_advances || jsonb_build_array(jsonb_build_object(
        'seat', v_i,
        'name', v_horses -> v_i ->> 'name',
        'add', v_add,
        'progress', v_prog,
        'event', v_event
      ));
      IF v_prog >= v_track THEN v_done := true; END IF;
    END LOOP;

    v_ticks := v_ticks || jsonb_build_array(jsonb_build_object(
      'round', v_round,
      'advances', v_advances,
      'events', v_events
    ));
  END LOOP;

  -- Standings by progress desc, then earlier finish via higher progress
  SELECT coalesce(jsonb_agg(h ORDER BY (h->>'progress')::int DESC, (h->>'seat')::int ASC), '[]'::jsonb)
  INTO v_sorted
  FROM jsonb_array_elements(v_horses) h;

  FOR v_i IN 0..jsonb_array_length(v_sorted) - 1 LOOP
    v_standings := v_standings || jsonb_build_array(
      (v_sorted -> v_i) || jsonb_build_object('place', v_i + 1)
    );
  END LOOP;

  v_winner := v_standings -> 0 ->> 'name';

  v_state := v_state || jsonb_build_object(
    'phase', 'finished',
    'horses', v_horses,
    'ticks', v_ticks,
    'standings', v_standings,
    'winner', v_winner,
    'started_at', coalesce(v_state->>'started_at', now()::text),
    'finished_at', now()
  );

  UPDATE public.game_sessions
  SET state = v_state, status = 'finished', finished_at = now()
  WHERE id = p_session_id;

  -- Payouts: 1st = pot, 2nd = half stake, else 0
  FOR v_i IN 0..jsonb_array_length(v_standings) - 1 LOOP
    v_place := v_i + 1;
    v_uid := NULLIF(v_standings -> v_i ->> 'user_id', '')::uuid;
    IF v_place = 1 THEN
      v_payout := v_pot;
      v_xp := 50;
    ELSIF v_place = 2 THEN
      v_payout := v_stake / 2;
      v_xp := 25;
    ELSE
      v_payout := 0;
      v_xp := 10;
    END IF;

    IF v_uid IS NOT NULL THEN
      IF v_payout > 0 THEN
        PERFORM public.credit_tokens(v_uid, v_payout, 'carrera_payout', 'game_session', p_session_id);
      END IF;
      PERFORM public.touch_carrera_stats(v_uid, v_place, v_xp, p_session_id, v_stake, v_payout);
    ELSIF v_place = 1 AND v_payout > 0 THEN
      -- Guest winner: pot stays burned (already collected)
      NULL;
    END IF;
  END LOOP;

  -- Host XP consolation if not already in horses as user
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_standings) s
    WHERE NULLIF(s->>'user_id','')::uuid = v_me
  ) THEN
    PERFORM public.touch_carrera_stats(v_me, 4, 15, p_session_id, v_stake, 0);
  END IF;

  RETURN v_state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.start_game(text, text, uuid, uuid, text, integer, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_blackjack(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_carrera(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_carrera_stats(uuid, int, int, uuid, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_game_wager(uuid, uuid, text, bigint, bigint, text) TO authenticated;
