-- Superadmin power tools: drinks-for-user, points, revoke, bet markets

CREATE OR REPLACE FUNCTION public.admin_log_drinks_for_user(
  p_user_id uuid,
  p_venue_name text,
  p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := p_user_id;
  v_now timestamptz := now();
  v_venue_id uuid;
  v_norm citext;
  v_display text;
  v_points int := 0;
  v_log_id uuid;
  v_item jsonb;
  v_type public.drink_types%rowtype;
  v_qty int;
  v_old_level int;
  v_new_level int;
  v_old_xp bigint;
  r record;
  v_tz text;
  v_season int;
  v_week date;
  v_month date;
BEGIN
  IF NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Solo superadmin';
  END IF;
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Usuario requerido'; END IF;
  IF p_venue_name IS NULL OR length(trim(p_venue_name)) < 1 THEN RAISE EXCEPTION 'Venue is required'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one drink item is required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = v_user_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  v_display := left(trim(p_venue_name), 80);
  v_norm := lower(v_display);
  INSERT INTO public.venues (normalized_name, display_name, created_by)
  VALUES (v_norm, v_display, auth.uid())
  ON CONFLICT (normalized_name) DO UPDATE SET display_name = excluded.display_name
  RETURNING id INTO v_venue_id;
  IF v_venue_id IS NULL THEN SELECT id INTO v_venue_id FROM public.venues WHERE normalized_name = v_norm; END IF;

  INSERT INTO public.user_venues (user_id, venue_id, use_count, last_used_at)
  VALUES (v_user_id, v_venue_id, 1, v_now)
  ON CONFLICT (user_id, venue_id) DO UPDATE
    SET use_count = public.user_venues.use_count + 1, last_used_at = v_now;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_type FROM public.drink_types dt WHERE dt.code = (v_item->>'code') AND dt.is_active;
    IF v_type.id IS NULL THEN RAISE EXCEPTION 'Unknown drink type: %', v_item->>'code'; END IF;
    v_qty := (v_item->>'quantity')::int;
    IF v_qty IS NULL OR v_qty < 1 OR v_qty > 50 THEN RAISE EXCEPTION 'Invalid quantity'; END IF;
    v_points := v_points + (v_qty * v_type.points);
  END LOOP;
  IF v_points <= 0 THEN RAISE EXCEPTION 'Points must be positive'; END IF;

  v_tz := 'Europe/Madrid';
  v_season := public.season_year_for(v_now, v_tz);
  v_week := public.week_start_for(v_now, v_tz);
  v_month := public.month_start_for(v_now, v_tz);

  INSERT INTO public.drink_logs (
    league_id, user_id, venue_id, venue_name_snapshot,
    consumed_at, points_total, season_year, week_start_date, month_start_date, edited_until
  ) VALUES (
    NULL, v_user_id, v_venue_id, v_display,
    v_now, v_points, v_season, v_week, v_month, v_now + interval '15 minutes'
  ) RETURNING id INTO v_log_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    SELECT * INTO v_type FROM public.drink_types dt WHERE dt.code = (v_item->>'code');
    v_qty := (v_item->>'quantity')::int;
    INSERT INTO public.drink_log_items (drink_log_id, drink_type_id, quantity, unit_points)
    VALUES (v_log_id, v_type.id, v_qty, v_type.points);
  END LOOP;

  SELECT xp, level INTO v_old_xp, v_old_level FROM public.users WHERE id = v_user_id;
  UPDATE public.users SET xp = xp + v_points, level = public.level_for_xp(xp + v_points)
  WHERE id = v_user_id RETURNING level INTO v_new_level;

  INSERT INTO public.user_stats_global (user_id, total_points, total_logs)
  VALUES (v_user_id, v_points, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET total_points = public.user_stats_global.total_points + excluded.total_points,
        total_logs = public.user_stats_global.total_logs + 1,
        updated_at = now();

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    UPDATE public.user_stats_global
    SET drink_counts = jsonb_set(
      drink_counts, array[v_item->>'code'],
      to_jsonb(coalesce((drink_counts ->> (v_item->>'code'))::int, 0) + (v_item->>'quantity')::int)
    ), updated_at = now()
    WHERE user_id = v_user_id;
  END LOOP;

  FOR r IN
    SELECT m.league_id, l.timezone
    FROM public.league_memberships m
    JOIN public.leagues l ON l.id = m.league_id
    WHERE m.user_id = v_user_id AND m.status = 'active' AND l.status = 'active'
  LOOP
    v_tz := r.timezone;
    v_season := public.season_year_for(v_now, v_tz);
    v_week := public.week_start_for(v_now, v_tz);
    v_month := public.month_start_for(v_now, v_tz);

    INSERT INTO public.drink_log_league_effects (log_id, league_id, points_applied, season_year, week_start_date, month_start_date)
    VALUES (v_log_id, r.league_id, v_points, v_season, v_week, v_month);

    INSERT INTO public.leaderboard_weekly (league_id, week_start_date, user_id, points, logs_count)
    VALUES (r.league_id, v_week, v_user_id, v_points, 1)
    ON CONFLICT (league_id, week_start_date, user_id) DO UPDATE
      SET points = public.leaderboard_weekly.points + excluded.points,
          logs_count = public.leaderboard_weekly.logs_count + 1, updated_at = now();

    INSERT INTO public.leaderboard_monthly (league_id, month_start_date, user_id, points, logs_count)
    VALUES (r.league_id, v_month, v_user_id, v_points, 1)
    ON CONFLICT (league_id, month_start_date, user_id) DO UPDATE
      SET points = public.leaderboard_monthly.points + excluded.points,
          logs_count = public.leaderboard_monthly.logs_count + 1, updated_at = now();

    INSERT INTO public.leaderboard_season (league_id, season_year, user_id, points, logs_count)
    VALUES (r.league_id, v_season, v_user_id, v_points, 1)
    ON CONFLICT (league_id, season_year, user_id) DO UPDATE
      SET points = public.leaderboard_season.points + excluded.points,
          logs_count = public.leaderboard_season.logs_count + 1, updated_at = now();

    INSERT INTO public.league_member_stats (league_id, user_id, total_points, total_logs, last_log_at)
    VALUES (r.league_id, v_user_id, v_points, 1, v_now)
    ON CONFLICT (league_id, user_id) DO UPDATE
      SET total_points = public.league_member_stats.total_points + excluded.total_points,
          total_logs = public.league_member_stats.total_logs + 1,
          last_log_at = excluded.last_log_at;

    INSERT INTO public.activity_events (league_id, actor_user_id, event_type, payload)
    VALUES (r.league_id, auth.uid(), 'admin_drink_logged',
      jsonb_build_object('log_id', v_log_id, 'points', v_points, 'venue', v_display, 'owner', v_user_id));
  END LOOP;

  BEGIN
    PERFORM public.credit_tokens(v_user_id, greatest(1, v_points / 3), 'admin_drink_log', 'drink_log', v_log_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM public.admin_audit('admin_log_drinks', 'user', v_user_id::text, v_user_id, 'admin drink',
    jsonb_build_object('log_id', v_log_id, 'points', v_points, 'items', p_items));

  RETURN v_log_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_league_points(
  p_user_id uuid,
  p_league_id uuid,
  p_delta bigint,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now timestamptz := now();
  v_tz text;
  v_season int;
  v_week date;
  v_month date;
BEGIN
  IF NOT public.is_global_admin() THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
  IF p_delta = 0 THEN RAISE EXCEPTION 'Delta no puede ser 0'; END IF;

  SELECT timezone INTO v_tz FROM public.leagues WHERE id = p_league_id;
  IF v_tz IS NULL THEN RAISE EXCEPTION 'Liga no encontrada'; END IF;

  v_season := public.season_year_for(v_now, v_tz);
  v_week := public.week_start_for(v_now, v_tz);
  v_month := public.month_start_for(v_now, v_tz);

  INSERT INTO public.league_member_stats (league_id, user_id, total_points, total_logs)
  VALUES (p_league_id, p_user_id, greatest(0, p_delta), 0)
  ON CONFLICT (league_id, user_id) DO UPDATE
    SET total_points = greatest(0, public.league_member_stats.total_points + p_delta);

  INSERT INTO public.leaderboard_weekly (league_id, week_start_date, user_id, points, logs_count)
  VALUES (p_league_id, v_week, p_user_id, greatest(0, p_delta), 0)
  ON CONFLICT (league_id, week_start_date, user_id) DO UPDATE
    SET points = greatest(0, public.leaderboard_weekly.points + p_delta), updated_at = now();

  INSERT INTO public.leaderboard_monthly (league_id, month_start_date, user_id, points, logs_count)
  VALUES (p_league_id, v_month, p_user_id, greatest(0, p_delta), 0)
  ON CONFLICT (league_id, month_start_date, user_id) DO UPDATE
    SET points = greatest(0, public.leaderboard_monthly.points + p_delta), updated_at = now();

  INSERT INTO public.leaderboard_season (league_id, season_year, user_id, points, logs_count)
  VALUES (p_league_id, v_season, p_user_id, greatest(0, p_delta), 0)
  ON CONFLICT (league_id, season_year, user_id) DO UPDATE
    SET points = greatest(0, public.leaderboard_season.points + p_delta), updated_at = now();

  UPDATE public.user_stats_global
  SET total_points = greatest(0, total_points + p_delta), updated_at = now()
  WHERE user_id = p_user_id;

  UPDATE public.users
  SET xp = greatest(0, xp + p_delta),
      level = public.level_for_xp(greatest(0, xp + p_delta))
  WHERE id = p_user_id;

  PERFORM public.admin_audit('adjust_league_points', 'user', p_user_id::text, p_user_id, p_reason,
    jsonb_build_object('league_id', p_league_id, 'delta', p_delta));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_league_points(
  p_user_id uuid,
  p_league_id uuid,
  p_points bigint,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_cur bigint;
  v_delta bigint;
BEGIN
  IF NOT public.is_global_admin() THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
  IF p_points < 0 THEN RAISE EXCEPTION 'Puntos inválidos'; END IF;

  SELECT coalesce(total_points, 0) INTO v_cur
  FROM public.league_member_stats
  WHERE league_id = p_league_id AND user_id = p_user_id;

  v_cur := coalesce(v_cur, 0);
  v_delta := p_points - v_cur;
  IF v_delta = 0 THEN RETURN; END IF;

  PERFORM public.admin_adjust_league_points(p_user_id, p_league_id, v_delta, p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_xp(
  p_user_id uuid,
  p_xp bigint,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_global_admin() THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
  UPDATE public.users
  SET xp = greatest(0, p_xp),
      level = public.level_for_xp(greatest(0, p_xp))
  WHERE id = p_user_id;
  PERFORM public.admin_audit('set_xp', 'user', p_user_id::text, p_user_id, p_reason,
    jsonb_build_object('xp', p_xp));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_adjust_level(
  p_user_id uuid,
  p_delta integer,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_level int;
  v_target int;
  v_xp bigint;
  thresholds bigint[] := array[0, 50, 120, 220, 350, 520, 740, 1000, 1350, 1800];
BEGIN
  IF NOT public.is_global_admin() THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
  SELECT level INTO v_level FROM public.users WHERE id = p_user_id;
  IF v_level IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;
  v_target := least(100, greatest(1, v_level + p_delta));
  IF v_target <= 10 THEN
    v_xp := thresholds[v_target];
  ELSE
    v_xp := floor(1800 * power(1.25, (v_target - 10)::numeric));
  END IF;
  UPDATE public.users SET xp = v_xp, level = v_target WHERE id = p_user_id;
  PERFORM public.admin_audit('adjust_level', 'user', p_user_id::text, p_user_id, p_reason,
    jsonb_build_object('from', v_level, 'to', v_target));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_title(
  p_user_id uuid,
  p_code text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_global_admin() THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
  DELETE FROM public.user_titles WHERE user_id = p_user_id AND title_code = p_code;
  UPDATE public.users SET equipped_title_code = NULL, title = NULL
  WHERE id = p_user_id AND equipped_title_code = p_code;
  PERFORM public.admin_audit('revoke_title', 'user', p_user_id::text, p_user_id, p_reason,
    jsonb_build_object('code', p_code));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_trophy(
  p_user_id uuid,
  p_trophy_id uuid,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_global_admin() THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
  DELETE FROM public.trophy_showcase WHERE user_trophy_id = p_trophy_id;
  DELETE FROM public.user_trophies WHERE id = p_trophy_id AND user_id = p_user_id;
  PERFORM public.admin_audit('revoke_trophy', 'user', p_user_id::text, p_user_id, p_reason,
    jsonb_build_object('trophy_id', p_trophy_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_grant_achievement(
  p_user_id uuid,
  p_code text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_global_admin() THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_achievements
    WHERE user_id = p_user_id AND achievement_code = p_code AND league_id IS NULL
  ) THEN
    INSERT INTO public.user_achievements (user_id, achievement_code)
    VALUES (p_user_id, p_code);
  END IF;
  PERFORM public.admin_audit('grant_achievement', 'user', p_user_id::text, p_user_id, p_reason,
    jsonb_build_object('code', p_code));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_revoke_achievement(
  p_user_id uuid,
  p_code text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_global_admin() THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
  DELETE FROM public.user_achievements
  WHERE user_id = p_user_id AND achievement_code = p_code AND league_id IS NULL;
  PERFORM public.admin_audit('revoke_achievement', 'user', p_user_id::text, p_user_id, p_reason,
    jsonb_build_object('code', p_code));
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_bet_market(
  p_market_id uuid,
  p_reason text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  m public.bet_markets%rowtype;
  r record;
  v_n int := 0;
BEGIN
  IF NOT public.is_global_admin() THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
  SELECT * INTO m FROM public.bet_markets WHERE id = p_market_id;
  IF m.id IS NULL THEN RAISE EXCEPTION 'Mercado no encontrado'; END IF;
  IF m.status = 'settled' THEN RAISE EXCEPTION 'Mercado ya resuelto'; END IF;
  IF m.status = 'cancelled' THEN RAISE EXCEPTION 'Mercado ya cancelado'; END IF;

  UPDATE public.bet_markets SET status = 'cancelled' WHERE id = p_market_id;

  FOR r IN SELECT * FROM public.bets WHERE market_id = p_market_id AND status = 'open' LOOP
    UPDATE public.bets SET status = 'cancelled', settled_payout = 0 WHERE id = r.id;
    BEGIN
      PERFORM public.credit_tokens(r.user_id, r.stake_tokens, 'bet_cancel_refund', 'bet', r.id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    v_n := v_n + 1;
  END LOOP;

  PERFORM public.admin_audit('cancel_market', 'bet_market', p_market_id::text, NULL, p_reason,
    jsonb_build_object('refunded', v_n));
  RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_create_bet_market(
  p_league_id uuid,
  p_title text,
  p_selections jsonb,
  p_closes_hours int DEFAULT 72
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
  v_sel jsonb;
  v_label text;
  v_odds numeric;
BEGIN
  IF NOT public.is_global_admin() THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
  IF p_title IS NULL OR length(trim(p_title)) < 2 THEN RAISE EXCEPTION 'Título requerido'; END IF;
  IF p_selections IS NULL OR jsonb_typeof(p_selections) <> 'array' OR jsonb_array_length(p_selections) < 2 THEN
    RAISE EXCEPTION 'Al menos 2 selecciones';
  END IF;

  INSERT INTO public.bet_markets (league_id, market_type, title, status, opens_at, closes_at)
  VALUES (
    p_league_id, 'custom', left(trim(p_title), 120), 'open', now(),
    now() + make_interval(hours => greatest(1, coalesce(p_closes_hours, 72)))
  ) RETURNING id INTO v_id;

  FOR v_sel IN SELECT * FROM jsonb_array_elements(p_selections) LOOP
    v_label := coalesce(v_sel->>'label', 'Opción');
    v_odds := coalesce((v_sel->>'odds')::numeric, 2.0);
    INSERT INTO public.bet_selections (market_id, label, base_odds, current_odds)
    VALUES (v_id, left(v_label, 80), v_odds, v_odds);
  END LOOP;

  PERFORM public.admin_audit('create_market', 'bet_market', v_id::text, NULL, 'admin create',
    jsonb_build_object('league_id', p_league_id, 'title', p_title));
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_bet_market(
  p_market_id uuid,
  p_title text,
  p_status text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_global_admin() THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('open', 'closed', 'cancelled') THEN
    RAISE EXCEPTION 'Estado inválido';
  END IF;
  UPDATE public.bet_markets
  SET title = coalesce(nullif(trim(p_title), ''), title),
      status = coalesce(p_status, status)
  WHERE id = p_market_id AND status NOT IN ('settled');
  PERFORM public.admin_audit('update_market', 'bet_market', p_market_id::text, NULL, p_reason,
    jsonb_build_object('title', p_title, 'status', p_status));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_log_drinks_for_user(uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_league_points(uuid, uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_league_points(uuid, uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_xp(uuid, bigint, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_adjust_level(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_title(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_trophy(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_achievement(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_achievement(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_cancel_bet_market(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_bet_market(uuid, text, jsonb, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_bet_market(uuid, text, text, text) TO authenticated;
