-- European casino roulette: real colors, bet types, custom stakes, achievements

CREATE OR REPLACE FUNCTION public.valid_game_stake(p_stake int)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT p_stake >= 50 AND p_stake <= 10000;
$$;

ALTER TABLE public.user_game_stats
  ADD COLUMN IF NOT EXISTS favorite_number int;

INSERT INTO public.achievement_definitions (code, name, description, scope, rule, is_active, sort_order, is_secret, emoji, rarity)
VALUES
  ('ruleta_primer_giro', 'Primer Giro', 'Gira la Ruleta Casino por primera vez', 'global', '{}'::jsonb, true, 260, false, '🎡', 'common'),
  ('ruleta_ojo_halcon', 'Ojo de Halcón', 'Gana apostando a un número exacto', 'global', '{}'::jsonb, true, 261, false, '🎯', 'rare'),
  ('ruleta_streak_5', 'Racha Ruleta x5', 'Gana 5 ruletas seguidas', 'global', '{}'::jsonb, true, 262, false, '🔥', 'rare'),
  ('ruleta_streak_10', 'Racha Ruleta x10', 'Gana 10 ruletas seguidas', 'global', '{}'::jsonb, true, 263, false, '🔥', 'epic'),
  ('ruleta_rey', 'Rey de la Ruleta', 'Gana 25 partidas de Ruleta Casino', 'global', '{}'::jsonb, true, 264, false, '👑', 'epic'),
  ('casino_leyenda', 'Leyenda del Casino', 'Gana 100 partidas de casino', 'global', '{}'::jsonb, true, 253, false, '💎', 'legendary')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, emoji = EXCLUDED.emoji, is_active = true;

CREATE OR REPLACE FUNCTION public.spin_casino_roulette(p_stake int, p_bet text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_me uuid := auth.uid();
  v_bet text := lower(trim(p_bet));
  v_bal bigint;
  v_n int;
  v_color text;
  v_won boolean := false;
  v_payout int := 0;
  v_mult numeric := 0;
  v_id uuid;
  v_state jsonb;
  v_xp int := 8;
  v_num_bet int := NULL;
  v_is_red boolean;
  v_streak int;
  v_won_total int;
  v_casino_wins int;
  -- European roulette reds
  v_reds int[] := ARRAY[1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.valid_game_stake(p_stake) THEN RAISE EXCEPTION 'Apuesta no válida'; END IF;

  -- Parse bet: red|black|even|odd|low|high|green|n0..n36|number:N
  IF v_bet ~ '^n([0-9]|[12][0-9]|3[0-6])$' THEN
    v_num_bet := substring(v_bet from 2)::int;
    v_bet := 'number';
  ELSIF v_bet ~ '^number:([0-9]|[12][0-9]|3[0-6])$' THEN
    v_num_bet := split_part(v_bet, ':', 2)::int;
    v_bet := 'number';
  ELSIF v_bet ~ '^([0-9]|[12][0-9]|3[0-6])$' THEN
    v_num_bet := v_bet::int;
    v_bet := 'number';
  ELSIF v_bet = 'green' THEN
    v_num_bet := 0;
    v_bet := 'number';
  END IF;

  IF v_bet NOT IN ('red','black','even','odd','low','high','number') THEN
    RAISE EXCEPTION 'Apuesta no válida';
  END IF;
  IF v_bet = 'number' AND (v_num_bet IS NULL OR v_num_bet < 0 OR v_num_bet > 36) THEN
    RAISE EXCEPTION 'Número no válido';
  END IF;

  SELECT token_balance INTO v_bal FROM public.users WHERE id = v_me;
  IF coalesce(v_bal,0) < p_stake THEN RAISE EXCEPTION '💰 No tienes fichas suficientes para jugar.'; END IF;

  PERFORM public.credit_tokens(v_me, -p_stake, 'ruleta_wager', 'game_session', NULL);

  v_n := floor(random() * 37)::int; -- 0..36
  v_is_red := v_n = ANY (v_reds);
  IF v_n = 0 THEN v_color := 'green';
  ELSIF v_is_red THEN v_color := 'red';
  ELSE v_color := 'black';
  END IF;

  IF v_bet = 'red' THEN
    v_won := v_color = 'red';
    v_mult := 2;
  ELSIF v_bet = 'black' THEN
    v_won := v_color = 'black';
    v_mult := 2;
  ELSIF v_bet = 'even' THEN
    v_won := v_n > 0 AND (v_n % 2) = 0;
    v_mult := 2;
  ELSIF v_bet = 'odd' THEN
    v_won := v_n > 0 AND (v_n % 2) = 1;
    v_mult := 2;
  ELSIF v_bet = 'low' THEN
    v_won := v_n BETWEEN 1 AND 18;
    v_mult := 2;
  ELSIF v_bet = 'high' THEN
    v_won := v_n BETWEEN 19 AND 36;
    v_mult := 2;
  ELSIF v_bet = 'number' THEN
    v_won := v_n = v_num_bet;
    v_mult := 36; -- 35:1 + stake back
  END IF;

  IF v_won THEN
    v_payout := floor(p_stake * v_mult)::int;
    v_xp := CASE
      WHEN v_bet = 'number' THEN 90
      ELSE 35
    END;
    PERFORM public.credit_tokens(v_me, v_payout, 'ruleta_payout', 'game_session', NULL);
  END IF;

  v_state := jsonb_build_object(
    'phase','finished',
    'number', v_n,
    'color', v_color,
    'bet', CASE WHEN v_bet = 'number' THEN 'n' || v_num_bet::text ELSE v_bet END,
    'bet_number', v_num_bet,
    'stake', p_stake,
    'payout', v_payout,
    'tokens', v_payout - p_stake,
    'mult', CASE WHEN v_won THEN v_mult ELSE 0 END,
    'result', CASE WHEN v_won THEN 'win' ELSE 'lose' END,
    'xp', v_xp,
    'finished_at', now()
  );

  INSERT INTO public.game_sessions (game_type, created_by, deck_seed, state, status, finished_at)
  VALUES ('ruleta_casino', v_me, md5(random()::text), v_state, 'finished', now())
  RETURNING id INTO v_id;

  UPDATE public.token_ledger SET ref_id = v_id
  WHERE user_id = v_me AND ref_id IS NULL AND reason LIKE 'ruleta_%' AND created_at > now() - interval '5 seconds';

  INSERT INTO public.game_players (session_id, user_id, seat) VALUES (v_id, v_me, 0);
  PERFORM public.bump_game_play_stats(v_me, 'ruleta_casino', v_won, v_xp);
  PERFORM public.record_game_wager(v_me, v_id, 'ruleta_casino', p_stake, v_payout, CASE WHEN v_won THEN 'win' ELSE 'lose' END);

  -- Favorite number: track most recent landed number bias toward exact bets
  UPDATE public.user_game_stats
  SET favorite_number = CASE
    WHEN v_bet = 'number' THEN v_num_bet
    ELSE coalesce(favorite_number, v_n)
  END
  WHERE user_id = v_me AND game_type = 'ruleta_casino';

  PERFORM public.grant_game_achievement(v_me, 'ruleta_primer_giro');
  IF v_won THEN
    PERFORM public.grant_game_achievement(v_me, 'casino_ruleta_first');
    IF v_bet = 'number' THEN
      PERFORM public.grant_game_achievement(v_me, 'ruleta_ojo_halcon');
    END IF;
  END IF;

  SELECT coalesce(current_streak,0), coalesce(won,0)
  INTO v_streak, v_won_total
  FROM public.user_game_stats
  WHERE user_id = v_me AND game_type = 'ruleta_casino';

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

GRANT EXECUTE ON FUNCTION public.spin_casino_roulette(int, text) TO authenticated;
