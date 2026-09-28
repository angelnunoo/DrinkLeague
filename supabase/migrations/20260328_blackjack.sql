-- BlackJack: poker deck, hit/stand, dealer, stats, achievements

-- Allow blackjack in game stats
ALTER TABLE public.user_game_stats DROP CONSTRAINT IF EXISTS user_game_stats_game_type_check;
ALTER TABLE public.user_game_stats
  ADD CONSTRAINT user_game_stats_game_type_check
  CHECK (game_type IN ('peaje', 'rey', 'duelo', 'blackjack'));

ALTER TABLE public.game_sessions DROP CONSTRAINT IF EXISTS game_sessions_game_type_check;
ALTER TABLE public.game_sessions
  ADD CONSTRAINT game_sessions_game_type_check
  CHECK (game_type IN ('peaje', 'rey', 'duelo', 'blackjack'));

ALTER TABLE public.user_game_stats
  ADD COLUMN IF NOT EXISTS draws integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS blackjacks integer NOT NULL DEFAULT 0;

INSERT INTO public.achievement_definitions (code, name, description, scope, rule, is_active, sort_order, is_secret, emoji, rarity)
VALUES
  ('bj_first', 'Primer BlackJack', 'Consigue tu primer BlackJack natural (21 con 2 cartas)', 'global', '{"game":"blackjack","metric":"blackjacks","op":">=","value":1}'::jsonb, true, 230, false, '🃏', 'common'),
  ('bj_rey_cartas', 'Rey de las Cartas', 'Gana 10 partidas de BlackJack', 'global', '{"game":"blackjack","metric":"won","op":">=","value":10}'::jsonb, true, 231, false, '♠️', 'rare'),
  ('bj_invencible', 'Invencible', 'Racha de 5 victorias en BlackJack', 'global', '{"game":"blackjack","metric":"streak","op":">=","value":5}'::jsonb, true, 232, false, '🔥', 'epic'),
  ('bj_maestro', 'Maestro del BlackJack', 'Gana 25 partidas de BlackJack', 'global', '{"game":"blackjack","metric":"won","op":">=","value":25}'::jsonb, true, 233, false, '♣️', 'epic'),
  ('bj_leyenda', 'Leyenda del Casino', 'Gana 50 partidas de BlackJack', 'global', '{"game":"blackjack","metric":"won","op":">=","value":50}'::jsonb, true, 234, false, '🏆', 'legendary')
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_active = true,
  emoji = EXCLUDED.emoji,
  rarity = EXCLUDED.rarity;

CREATE OR REPLACE FUNCTION public.poker_rank_label(p_rank int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_rank
    WHEN 1 THEN 'A' WHEN 11 THEN 'J' WHEN 12 THEN 'Q' WHEN 13 THEN 'K'
    ELSE p_rank::text
  END;
$$;

CREATE OR REPLACE FUNCTION public.poker_card_value(p_rank int)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_rank = 1 THEN 11
    WHEN p_rank >= 10 THEN 10
    ELSE p_rank
  END;
$$;

CREATE OR REPLACE FUNCTION public.build_poker_deck(p_seed text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_ranks int[] := ARRAY[1,2,3,4,5,6,7,8,9,10,11,12,13];
  v_suits text[] := ARRAY['spades','hearts','diamonds','clubs'];
  v_deck jsonb := '[]'::jsonb;
  v_arr jsonb[];
  i int; j int; r int; s text; tmp jsonb;
  v_hash text;
  v_n int;
BEGIN
  FOREACH r IN ARRAY v_ranks LOOP
    FOREACH s IN ARRAY v_suits LOOP
      v_deck := v_deck || jsonb_build_array(jsonb_build_object(
        'rank', r,
        'suit', s,
        'label', public.poker_rank_label(r),
        'value', public.poker_card_value(r)
      ));
    END LOOP;
  END LOOP;

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

CREATE OR REPLACE FUNCTION public.blackjack_hand_total(p_hand jsonb)
RETURNS int
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_total int := 0;
  v_aces int := 0;
  c jsonb;
  v int;
BEGIN
  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(p_hand, '[]'::jsonb)) LOOP
    v := coalesce((c->>'value')::int, public.poker_card_value((c->>'rank')::int));
    v_total := v_total + v;
    IF (c->>'rank')::int = 1 THEN v_aces := v_aces + 1; END IF;
  END LOOP;
  WHILE v_total > 21 AND v_aces > 0 LOOP
    v_total := v_total - 10;
    v_aces := v_aces - 1;
  END LOOP;
  RETURN v_total;
END;
$$;

CREATE OR REPLACE FUNCTION public.touch_blackjack_stats(
  p_user_id uuid,
  p_result text, -- win | lose | push | blackjack
  p_xp int,
  p_tokens int
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
  v_streak int;
  v_best int;
  v_played int;
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
    tokens_earned = tokens_earned + GREATEST(0, p_tokens),
    perfect_count = perfect_count + CASE WHEN v_bj THEN 1 ELSE 0 END,
    updated_at = now()
  WHERE user_id = p_user_id AND game_type = 'blackjack'
  RETURNING current_streak, best_streak, played, won, blackjacks
  INTO v_streak, v_best, v_played, v_won_n, v_bjs;

  IF p_xp > 0 THEN
    UPDATE public.users SET xp = xp + p_xp, level = public.level_for_xp(xp + p_xp) WHERE id = p_user_id;
  END IF;
  IF p_tokens > 0 THEN
    BEGIN
      PERFORM public.credit_tokens(p_user_id, p_tokens, 'game_blackjack', 'game_session', NULL);
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

-- Extend start_game for blackjack
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
  c1 jsonb; c2 jsonb; c3 jsonb; c4 jsonb;
  v_player jsonb;
  v_dealer jsonb;
  v_p_total int;
  v_d_total int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_game_type NOT IN ('peaje', 'rey', 'duelo', 'blackjack') THEN RAISE EXCEPTION 'Juego no válido'; END IF;

  v_seed := md5(v_me::text || clock_timestamp()::text || random()::text);

  IF p_game_type = 'blackjack' THEN
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
      'started_at', now()
    );

    -- Natural blackjack check
    IF v_p_total = 21 OR v_d_total = 21 THEN
      v_state := v_state || jsonb_build_object('hide_dealer', false, 'phase', 'finished');
      IF v_p_total = 21 AND v_d_total = 21 THEN
        v_state := v_state || jsonb_build_object('result', 'push', 'xp', 15, 'tokens', 8, 'message', 'Empate · ambos BlackJack');
      ELSIF v_p_total = 21 THEN
        v_state := v_state || jsonb_build_object('result', 'blackjack', 'xp', 60, 'tokens', 35, 'message', '¡BLACKJACK!');
      ELSE
        v_state := v_state || jsonb_build_object('result', 'lose', 'xp', 5, 'tokens', 2, 'message', 'El dealer tiene BlackJack');
      END IF;
      v_state := v_state || jsonb_build_object('finished_at', now());
    END IF;

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

  INSERT INTO public.game_players (session_id, user_id, seat) VALUES (v_id, v_me, 0);

  IF p_game_type = 'duelo' AND v_opp IS NOT NULL THEN
    INSERT INTO public.game_players (session_id, user_id, seat) VALUES (v_id, v_opp, 1);
  END IF;

  IF p_game_type = 'blackjack' AND (v_state->>'phase') = 'finished' THEN
    UPDATE public.game_sessions SET finished_at = now() WHERE id = v_id;
    PERFORM public.touch_blackjack_stats(
      v_me,
      v_state->>'result',
      coalesce((v_state->>'xp')::int, 0),
      coalesce((v_state->>'tokens')::int, 0)
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
  v_tokens int;
  v_msg text;
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
      v_result := 'lose';
      v_xp := 5; v_tokens := 2;
      v_msg := 'Te pasaste · ' || v_p_total;
      v_state := v_state || jsonb_build_object(
        'phase', 'finished', 'hide_dealer', false,
        'player', v_player, 'dealer', v_dealer, 'idx', v_idx, 'deck', v_deck,
        'player_total', v_p_total,
        'dealer_total', public.blackjack_hand_total(v_dealer),
        'result', v_result, 'xp', v_xp, 'tokens', v_tokens, 'message', v_msg,
        'finished_at', now()
      );
      UPDATE public.game_sessions SET state = v_state, status = 'finished', finished_at = now() WHERE id = p_session_id;
      PERFORM public.touch_blackjack_stats(v_me, v_result, v_xp, v_tokens);
      RETURN v_state;
    END IF;

    v_state := v_state || jsonb_build_object(
      'player', v_player, 'idx', v_idx, 'deck', v_deck,
      'player_total', v_p_total,
      'last_card', v_card
    );
    UPDATE public.game_sessions SET state = v_state WHERE id = p_session_id;
    RETURN v_state;
  END IF;

  -- STAND → dealer plays
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
    v_result := 'win'; v_xp := 40; v_tokens := 22; v_msg := 'Dealer se pasa · ganas';
  ELSIF v_p_total > v_d_total THEN
    v_result := 'win'; v_xp := 35; v_tokens := 18; v_msg := '¡Ganas!';
  ELSIF v_p_total < v_d_total THEN
    v_result := 'lose'; v_xp := 8; v_tokens := 3; v_msg := 'Pierdes';
  ELSE
    v_result := 'push'; v_xp := 15; v_tokens := 8; v_msg := 'Empate';
  END IF;

  v_state := v_state || jsonb_build_object(
    'phase', 'finished', 'hide_dealer', false,
    'player', v_player, 'dealer', v_dealer, 'idx', v_idx, 'deck', v_deck,
    'player_total', v_p_total, 'dealer_total', v_d_total,
    'result', v_result, 'xp', v_xp, 'tokens', v_tokens, 'message', v_msg,
    'finished_at', now()
  );

  UPDATE public.game_sessions SET state = v_state, status = 'finished', finished_at = now() WHERE id = p_session_id;
  PERFORM public.touch_blackjack_stats(v_me, v_result, v_xp, v_tokens);
  RETURN v_state;
END;
$$;

GRANT EXECUTE ON FUNCTION public.build_poker_deck(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.blackjack_hand_total(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.play_blackjack(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.touch_blackjack_stats(uuid, text, int, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_game(text, text, uuid, uuid, text) TO authenticated;
