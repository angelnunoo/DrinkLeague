-- Casino roulette table: multi-spot chip bets, min chip 10

CREATE OR REPLACE FUNCTION public.valid_game_stake(p_stake int)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_stake >= 10 AND p_stake <= 50000;
$$;

CREATE OR REPLACE FUNCTION public.spin_casino_roulette_bets(p_bets jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_bal bigint;
  v_n int;
  v_color text;
  v_is_red boolean;
  v_reds int[] := ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
  v_item jsonb;
  v_spot text;
  v_amount int;
  v_total_stake int := 0;
  v_total_payout int := 0;
  v_won_any boolean := false;
  v_hit_number boolean := false;
  v_results jsonb := '[]'::jsonb;
  v_won boolean;
  v_mult numeric;
  v_payout int;
  v_id uuid;
  v_state jsonb;
  v_xp int := 10;
  v_streak int;
  v_won_total int;
  v_casino_wins int;
  v_num int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_bets IS NULL OR jsonb_typeof(p_bets) <> 'array' OR jsonb_array_length(p_bets) = 0 THEN
    RAISE EXCEPTION 'Coloca al menos una ficha';
  END IF;
  IF jsonb_array_length(p_bets) > 40 THEN RAISE EXCEPTION 'Demasiadas apuestas'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_bets) LOOP
    v_spot := lower(trim(coalesce(v_item->>'spot','')));
    v_amount := coalesce((v_item->>'amount')::int, 0);
    IF v_amount < 10 THEN RAISE EXCEPTION 'Apuesta minima 10'; END IF;
    IF v_spot NOT IN ('red','black','even','odd','low','high')
       AND v_spot !~ '^n([0-9]|[12][0-9]|3[0-6])$' THEN
      RAISE EXCEPTION 'Apuesta no valida';
    END IF;
    v_total_stake := v_total_stake + v_amount;
  END LOOP;

  IF v_total_stake < 10 OR v_total_stake > 50000 THEN RAISE EXCEPTION 'Apuesta no valida'; END IF;

  SELECT token_balance INTO v_bal FROM public.users WHERE id = v_me;
  IF coalesce(v_bal,0) < v_total_stake THEN
    RAISE EXCEPTION '💰 No tienes fichas suficientes para jugar.';
  END IF;

  PERFORM public.credit_tokens(v_me, -v_total_stake, 'ruleta_wager', 'game_session', NULL);

  v_n := floor(random() * 37)::int;
  v_is_red := v_n = ANY (v_reds);
  IF v_n = 0 THEN v_color := 'green';
  ELSIF v_is_red THEN v_color := 'red';
  ELSE v_color := 'black';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_bets) LOOP
    v_spot := lower(trim(v_item->>'spot'));
    v_amount := (v_item->>'amount')::int;
    v_won := false;
    v_mult := 0;
    v_num := NULL;

    IF v_spot ~ '^n([0-9]|[12][0-9]|3[0-6])$' THEN
      v_num := substring(v_spot from 2)::int;
      v_won := v_n = v_num;
      v_mult := 36;
      IF v_won THEN v_hit_number := true; END IF;
    ELSIF v_spot = 'red' THEN
      v_won := v_color = 'red'; v_mult := 2;
    ELSIF v_spot = 'black' THEN
      v_won := v_color = 'black'; v_mult := 2;
    ELSIF v_spot = 'even' THEN
      v_won := v_n > 0 AND (v_n % 2) = 0; v_mult := 2;
    ELSIF v_spot = 'odd' THEN
      v_won := v_n > 0 AND (v_n % 2) = 1; v_mult := 2;
    ELSIF v_spot = 'low' THEN
      v_won := v_n BETWEEN 1 AND 18; v_mult := 2;
    ELSIF v_spot = 'high' THEN
      v_won := v_n BETWEEN 19 AND 36; v_mult := 2;
    END IF;

    v_payout := CASE WHEN v_won THEN floor(v_amount * v_mult)::int ELSE 0 END;
    IF v_won THEN
      v_won_any := true;
      v_total_payout := v_total_payout + v_payout;
    END IF;

    v_results := v_results || jsonb_build_array(jsonb_build_object(
      'spot', v_spot,
      'amount', v_amount,
      'won', v_won,
      'payout', v_payout,
      'mult', CASE WHEN v_won THEN v_mult ELSE 0 END
    ));
  END LOOP;

  IF v_total_payout > 0 THEN
    PERFORM public.credit_tokens(v_me, v_total_payout, 'ruleta_payout', 'game_session', NULL);
  END IF;

  v_xp := 8 + CASE WHEN v_won_any THEN 20 ELSE 0 END + CASE WHEN v_hit_number THEN 40 ELSE 0 END;

  v_state := jsonb_build_object(
    'phase','finished',
    'number', v_n,
    'color', v_color,
    'bets', v_results,
    'stake', v_total_stake,
    'payout', v_total_payout,
    'tokens', v_total_payout - v_total_stake,
    'result', CASE WHEN v_won_any THEN 'win' ELSE 'lose' END,
    'xp', v_xp,
    'finished_at', now()
  );

  INSERT INTO public.game_sessions (game_type, created_by, deck_seed, state, status, finished_at)
  VALUES ('ruleta_casino', v_me, md5(random()::text), v_state, 'finished', now())
  RETURNING id INTO v_id;

  UPDATE public.token_ledger SET ref_id = v_id
  WHERE user_id = v_me AND ref_id IS NULL AND reason LIKE 'ruleta_%' AND created_at > now() - interval '5 seconds';

  INSERT INTO public.game_players (session_id, user_id, seat) VALUES (v_id, v_me, 0);
  PERFORM public.bump_game_play_stats(v_me, 'ruleta_casino', v_won_any, v_xp);
  PERFORM public.record_game_wager(
    v_me, v_id, 'ruleta_casino', v_total_stake, v_total_payout,
    CASE WHEN v_won_any THEN 'win' ELSE 'lose' END
  );

  UPDATE public.user_game_stats
  SET favorite_number = coalesce(favorite_number, v_n)
  WHERE user_id = v_me AND game_type = 'ruleta_casino';

  PERFORM public.grant_game_achievement(v_me, 'ruleta_primer_giro');
  IF v_won_any THEN PERFORM public.grant_game_achievement(v_me, 'casino_ruleta_first'); END IF;
  IF v_hit_number THEN PERFORM public.grant_game_achievement(v_me, 'ruleta_ojo_halcon'); END IF;

  SELECT coalesce(current_streak,0), coalesce(won,0) INTO v_streak, v_won_total
  FROM public.user_game_stats WHERE user_id = v_me AND game_type = 'ruleta_casino';
  IF coalesce(v_streak,0) >= 5 THEN PERFORM public.grant_game_achievement(v_me, 'ruleta_streak_5'); END IF;
  IF coalesce(v_streak,0) >= 10 THEN PERFORM public.grant_game_achievement(v_me, 'ruleta_streak_10'); END IF;
  IF coalesce(v_won_total,0) >= 25 THEN PERFORM public.grant_game_achievement(v_me, 'ruleta_rey'); END IF;

  SELECT coalesce(sum(won),0)::int INTO v_casino_wins
  FROM public.user_game_stats
  WHERE user_id = v_me AND game_type IN ('blackjack','carrera','ruleta_casino','bingo');
  IF v_casino_wins >= 100 THEN PERFORM public.grant_game_achievement(v_me, 'casino_leyenda'); END IF;

  RETURN v_state || jsonb_build_object('session_id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.spin_casino_roulette_bets(jsonb) TO authenticated;
