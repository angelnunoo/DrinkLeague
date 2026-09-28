-- Peaje: on miss, go one step back and refresh remaining cards
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
  v_next int;
  v_fresh jsonb;
  v_i int;
  v_kept jsonb := '[]'::jsonb;
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
    v_result := 'peaje';
    v_ok := true;
  ELSIF v_step IN (0, 1) THEN
    IF p_guess NOT IN ('even', 'odd') THEN RAISE EXCEPTION 'Elige Par o Impar'; END IF;
    v_ok := (p_guess = 'even' AND v_rank % 2 = 0) OR (p_guess = 'odd' AND v_rank % 2 = 1);
    v_result := CASE WHEN v_ok THEN 'hit' ELSE 'miss' END;
  ELSIF v_step IN (3, 4) THEN
    IF p_guess NOT IN ('higher', 'lower') THEN RAISE EXCEPTION 'Elige Mayor o Menor'; END IF;
    IF v_prev IS NULL THEN RAISE EXCEPTION 'Falta carta previa'; END IF;
    IF v_rank = v_prev THEN
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

  IF v_result = 'miss' THEN
    v_next := greatest(0, v_step - 1);
    v_fresh := public.build_spanish_deck(md5(g.id::text || clock_timestamp()::text || v_misses::text));
    v_kept := '[]'::jsonb;
    FOR v_i IN 0..greatest(-1, v_next - 1) LOOP
      v_kept := v_kept || jsonb_build_array(v_deck -> v_i);
    END LOOP;
    v_i := 0;
    WHILE jsonb_array_length(v_kept) < 6 LOOP
      v_kept := v_kept || jsonb_build_array(v_fresh -> v_i);
      v_i := v_i + 1;
    END LOOP;
    v_deck := v_kept;
    IF v_next <= 0 THEN
      v_prev := NULL;
    ELSE
      v_prev := ((v_deck -> (v_next - 1))->>'rank')::int;
    END IF;

    v_state := v_state || jsonb_build_object(
      'hits', v_hits,
      'misses', v_misses,
      'step', v_next,
      'deck', v_deck,
      'prev_rank', to_jsonb(v_prev),
      'last_card', v_card,
      'last_result', 'miss',
      'last_guess', p_guess,
      'history', v_history,
      'went_back', true
    );
    UPDATE public.game_sessions SET state = v_state WHERE id = p_session_id;

    RETURN jsonb_build_object(
      'phase', 'play',
      'step', v_next,
      'card', v_card,
      'result', 'miss',
      'hits', v_hits,
      'misses', v_misses,
      'went_back', true
    );
  END IF;

  v_next := v_step + 1;
  v_state := v_state || jsonb_build_object(
    'hits', v_hits,
    'misses', v_misses,
    'step', v_next,
    'prev_rank', v_rank,
    'last_card', v_card,
    'last_result', v_result,
    'last_guess', p_guess,
    'history', v_history,
    'went_back', false
  );

  IF v_next > 5 THEN
    v_perfect := (v_hits >= 5 AND v_misses = 0);
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

  RETURN jsonb_build_object(
    'phase', 'play',
    'step', v_next,
    'card', v_card,
    'result', v_result,
    'hits', v_hits,
    'misses', v_misses
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.play_peaje_step(uuid, text) TO authenticated;
