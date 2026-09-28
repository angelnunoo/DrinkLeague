-- ============================================================
-- RPCs: friends, onboarding, feed, profile, legacy, titles
-- ============================================================

-- Friends: remove
CREATE OR REPLACE FUNCTION public.remove_friend(p_friend_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  a uuid; b uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF p_friend_user_id IS NULL OR p_friend_user_id = v_me THEN
    RAISE EXCEPTION 'Amigo no válido';
  END IF;
  a := least(v_me, p_friend_user_id);
  b := greatest(v_me, p_friend_user_id);
  DELETE FROM public.friendships WHERE user_a = a AND user_b = b;
  UPDATE public.friend_requests
  SET status = 'rejected', responded_at = now()
  WHERE status = 'pending'
    AND ((from_user_id = v_me AND to_user_id = p_friend_user_id)
      OR (from_user_id = p_friend_user_id AND to_user_id = v_me));
END;
$$;

-- Friends: search
CREATE OR REPLACE FUNCTION public.search_users(p_query text, p_limit int DEFAULT 12)
RETURNS TABLE (
  id uuid,
  display_name text,
  username text,
  friend_code text,
  level int,
  title text,
  avatar_url text,
  is_friend boolean,
  request_pending boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_q text := lower(trim(coalesce(p_query, '')));
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF length(v_q) < 2 THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.display_name,
    u.username,
    u.friend_code,
    u.level,
    u.title,
    u.avatar_url,
    EXISTS (
      SELECT 1 FROM public.friendships f
      WHERE (f.user_a = least(v_me, u.id) AND f.user_b = greatest(v_me, u.id))
    ) AS is_friend,
    EXISTS (
      SELECT 1 FROM public.friend_requests r
      WHERE r.status = 'pending'
        AND ((r.from_user_id = v_me AND r.to_user_id = u.id)
          OR (r.from_user_id = u.id AND r.to_user_id = v_me))
    ) AS request_pending
  FROM public.users u
  WHERE u.id <> v_me
    AND u.status = 'active'
    AND (
      lower(u.display_name) LIKE '%' || v_q || '%'
      OR lower(coalesce(u.username, '')) LIKE '%' || v_q || '%'
      OR upper(coalesce(u.friend_code, '')) = upper(v_q)
    )
  ORDER BY
    CASE WHEN upper(coalesce(u.friend_code, '')) = upper(v_q) THEN 0 ELSE 1 END,
    u.display_name
  LIMIT greatest(1, least(coalesce(p_limit, 12), 25));
END;
$$;

CREATE OR REPLACE FUNCTION public.lookup_user_by_friend_code(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  u public.users%rowtype;
BEGIN
  SELECT * INTO u FROM public.users
  WHERE upper(friend_code) = upper(trim(p_code)) AND status = 'active'
  LIMIT 1;
  IF u.id IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', u.id,
    'display_name', u.display_name,
    'username', u.username,
    'friend_code', u.friend_code,
    'level', u.level,
    'title', u.title,
    'avatar_url', u.avatar_url,
    'xp', u.xp
  );
END;
$$;

-- Onboarding sync + claim
CREATE OR REPLACE FUNCTION public.sync_onboarding_progress(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := coalesce(p_user_id, auth.uid());
  v_has_drink boolean;
  v_has_league boolean;
  v_has_friend boolean;
  v_has_game boolean;
  m record;
  v_done int := 0;
  v_total int := 0;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF auth.uid() IS NOT NULL AND auth.uid() <> v_me AND NOT public.is_global_admin() THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.drink_logs
    WHERE user_id = v_me AND coalesce(status, 'active') <> 'voided'
    LIMIT 1
  ) INTO v_has_drink;

  SELECT EXISTS (
    SELECT 1 FROM public.league_memberships WHERE user_id = v_me AND status = 'active' LIMIT 1
  ) INTO v_has_league;

  SELECT EXISTS (
    SELECT 1 FROM public.friendships WHERE user_a = v_me OR user_b = v_me LIMIT 1
  ) INTO v_has_friend;

  SELECT EXISTS (
    SELECT 1 FROM public.game_sessions WHERE created_by = v_me AND status = 'finished' LIMIT 1
  ) INTO v_has_game;

  INSERT INTO public.user_onboarding (user_id, mission_code)
  SELECT v_me, code FROM public.onboarding_missions WHERE is_active
  ON CONFLICT DO NOTHING;

  IF v_has_drink THEN
    UPDATE public.user_onboarding SET completed_at = coalesce(completed_at, now())
    WHERE user_id = v_me AND mission_code = 'first_drink';
  END IF;
  IF v_has_league THEN
    UPDATE public.user_onboarding SET completed_at = coalesce(completed_at, now())
    WHERE user_id = v_me AND mission_code = 'join_league';
  END IF;
  IF v_has_friend THEN
    UPDATE public.user_onboarding SET completed_at = coalesce(completed_at, now())
    WHERE user_id = v_me AND mission_code = 'add_friend';
  END IF;
  IF v_has_game THEN
    UPDATE public.user_onboarding SET completed_at = coalesce(completed_at, now())
    WHERE user_id = v_me AND mission_code = 'first_game';
  END IF;

  -- Auto-claim rewards for newly completed
  FOR m IN
    SELECT o.mission_code, om.reward_xp, om.reward_tokens, om.title
    FROM public.user_onboarding o
    JOIN public.onboarding_missions om ON om.code = o.mission_code
    WHERE o.user_id = v_me AND o.completed_at IS NOT NULL AND o.claimed_at IS NULL
  LOOP
    UPDATE public.users
    SET xp = xp + m.reward_xp, level = public.level_for_xp(xp + m.reward_xp)
    WHERE id = v_me;
    PERFORM public.credit_tokens(v_me, m.reward_tokens, 'onboarding_' || m.mission_code, 'onboarding', NULL);
    UPDATE public.user_onboarding SET claimed_at = now()
    WHERE user_id = v_me AND mission_code = m.mission_code;
    PERFORM public.emit_social_feed(
      v_me, 'onboarding', '🎉 Misión completada', m.title,
      '/app/onboarding', jsonb_build_object('mission', m.mission_code), NULL, 'friends'
    );
    PERFORM public.upsert_legacy_event(v_me, 'onboarding_' || m.mission_code, 'Misión: ' || m.title, NULL, '🎯');
  END LOOP;

  SELECT count(*) FILTER (WHERE completed_at IS NOT NULL), count(*)
  INTO v_done, v_total
  FROM public.user_onboarding o
  JOIN public.onboarding_missions om ON om.code = o.mission_code AND om.is_active
  WHERE o.user_id = v_me;

  IF v_done >= v_total AND v_total > 0 THEN
    UPDATE public.users SET onboarding_completed_at = coalesce(onboarding_completed_at, now())
    WHERE id = v_me;
  END IF;

  RETURN (
    SELECT jsonb_build_object(
      'done', v_done,
      'total', v_total,
      'completed', (SELECT onboarding_completed_at IS NOT NULL FROM public.users WHERE id = v_me),
      'missions', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'code', om.code,
          'title', om.title,
          'description', om.description,
          'emoji', om.emoji,
          'reward_xp', om.reward_xp,
          'reward_tokens', om.reward_tokens,
          'completed', o.completed_at IS NOT NULL,
          'claimed', o.claimed_at IS NOT NULL,
          'sort_order', om.sort_order
        ) ORDER BY om.sort_order)
        FROM public.user_onboarding o
        JOIN public.onboarding_missions om ON om.code = o.mission_code
        WHERE o.user_id = v_me AND om.is_active
      ), '[]'::jsonb)
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_onboarding()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  UPDATE public.users SET onboarding_dismissed_at = now() WHERE id = auth.uid();
END;
$$;

-- Social feed RPC
CREATE OR REPLACE FUNCTION public.get_social_feed(p_limit int DEFAULT 40)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_friends uuid[];
  v_leagues uuid[];
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT array_agg(CASE WHEN user_a = v_me THEN user_b ELSE user_a END)
  INTO v_friends
  FROM public.friendships WHERE user_a = v_me OR user_b = v_me;

  SELECT array_agg(league_id) INTO v_leagues
  FROM public.league_memberships WHERE user_id = v_me AND status = 'active';

  RETURN coalesce((
    SELECT jsonb_agg(row_to_json(t)::jsonb)
    FROM (
      SELECT
        s.id, s.actor_user_id, s.event_type, s.title, s.body, s.href, s.payload,
        s.league_id, s.visibility, s.created_at,
        u.display_name AS actor_name,
        u.avatar_url AS actor_avatar,
        u.title AS actor_title,
        u.level AS actor_level
      FROM public.social_feed s
      JOIN public.users u ON u.id = s.actor_user_id
      WHERE
        s.actor_user_id = v_me
        OR s.visibility = 'public'
        OR (s.visibility = 'friends' AND s.actor_user_id = ANY (coalesce(v_friends, ARRAY[]::uuid[])))
        OR (s.visibility = 'league' AND s.league_id = ANY (coalesce(v_leagues, ARRAY[]::uuid[])))
      ORDER BY s.created_at DESC
      LIMIT greatest(1, least(coalesce(p_limit, 40), 80))
    ) t
  ), '[]'::jsonb);
END;
$$;

-- Public profile
CREATE OR REPLACE FUNCTION public.get_public_profile(p_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  u public.users%rowtype;
  v_key text := trim(coalesce(p_key, ''));
  v_stats jsonb;
  v_ach jsonb;
  v_chem jsonb;
  v_rivals jsonb;
  v_titles jsonb;
  v_records jsonb;
  v_legacy jsonb;
  v_leagues jsonb;
  v_lead jsonb;
BEGIN
  IF length(v_key) < 1 THEN RETURN NULL; END IF;

  IF v_key ~* '^[0-9a-f-]{36}$' THEN
    SELECT * INTO u FROM public.users WHERE id = v_key::uuid AND status = 'active';
  ELSE
    SELECT * INTO u FROM public.users
    WHERE (lower(username) = lower(v_key) OR upper(friend_code) = upper(v_key))
      AND status = 'active'
    LIMIT 1;
  END IF;
  IF u.id IS NULL THEN RETURN NULL; END IF;

  SELECT to_jsonb(s) INTO v_stats FROM public.user_stats_global s WHERE s.user_id = u.id;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'code', q.achievement_code,
    'name', q.name,
    'emoji', q.emoji,
    'unlocked_at', q.unlocked_at
  )), '[]'::jsonb)
  INTO v_ach
  FROM (
    SELECT ua.achievement_code, ad.name, ad.emoji, ua.unlocked_at
    FROM public.user_achievements ua
    JOIN public.achievement_definitions ad ON ad.code = ua.achievement_code
    WHERE ua.user_id = u.id
    ORDER BY ua.unlocked_at DESC
    LIMIT 8
  ) q;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'score', f.chemistry_score,
    'friend_id', CASE WHEN f.user_a = u.id THEN f.user_b ELSE f.user_a END,
    'friend_name', fu.display_name
  ) ORDER BY f.chemistry_score DESC), '[]'::jsonb)
  INTO v_chem
  FROM public.friendships f
  JOIN public.users fu ON fu.id = CASE WHEN f.user_a = u.id THEN f.user_b ELSE f.user_a END
  WHERE f.user_a = u.id OR f.user_b = u.id;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'rival_id', r.rival_user_id,
    'rival_name', ru.display_name,
    'score', r.rivalry_score
  ) ORDER BY r.rivalry_score DESC), '[]'::jsonb)
  INTO v_rivals
  FROM public.user_rivals r
  JOIN public.users ru ON ru.id = r.rival_user_id
  WHERE r.user_id = u.id
  LIMIT 3;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'code', ut.title_code,
    'name', td.name,
    'emoji', td.emoji,
    'temporary', ut.is_temporary,
    'expires_at', ut.expires_at
  )), '[]'::jsonb)
  INTO v_titles
  FROM public.user_titles ut
  JOIN public.title_definitions td ON td.code = ut.title_code
  WHERE ut.user_id = u.id
    AND (ut.expires_at IS NULL OR ut.expires_at > now());

  SELECT coalesce(jsonb_agg(to_jsonb(pr) ORDER BY pr.value DESC), '[]'::jsonb)
  INTO v_records
  FROM public.user_personal_records pr WHERE pr.user_id = u.id;

  SELECT coalesce(jsonb_agg(to_jsonb(le) ORDER BY le.occurred_at), '[]'::jsonb)
  INTO v_legacy
  FROM public.user_legacy_events le WHERE le.user_id = u.id;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', l.id, 'name', l.name)), '[]'::jsonb)
  INTO v_leagues
  FROM public.league_memberships m
  JOIN public.leagues l ON l.id = m.league_id
  WHERE m.user_id = u.id AND m.status = 'active';

  SELECT coalesce(jsonb_agg(to_jsonb(ls)), '[]'::jsonb)
  INTO v_lead
  FROM public.leadership_streaks ls WHERE ls.user_id = u.id;

  RETURN jsonb_build_object(
    'id', u.id,
    'display_name', u.display_name,
    'username', u.username,
    'friend_code', u.friend_code,
    'avatar_url', u.avatar_url,
    'banner_url', u.banner_url,
    'title', u.title,
    'equipped_title_code', u.equipped_title_code,
    'level', u.level,
    'xp', u.xp,
    'prestige_level', u.prestige_level,
    'created_at', u.created_at,
    'stats', v_stats,
    'achievements', coalesce(v_ach, '[]'::jsonb),
    'chemistry', coalesce(v_chem, '[]'::jsonb),
    'rivals', coalesce(v_rivals, '[]'::jsonb),
    'titles', coalesce(v_titles, '[]'::jsonb),
    'records', coalesce(v_records, '[]'::jsonb),
    'legacy', coalesce(v_legacy, '[]'::jsonb),
    'leagues', coalesce(v_leagues, '[]'::jsonb),
    'leadership', coalesce(v_lead, '[]'::jsonb)
  );
END;
$$;

-- Rebuild personal legacy + records from existing data
CREATE OR REPLACE FUNCTION public.rebuild_user_legacy(p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := coalesce(p_user_id, auth.uid());
  u public.users%rowtype;
  v_first_drink timestamptz;
  v_first_ach timestamptz;
  v_first_ach_name text;
  v_first_mvp timestamptz;
  v_first_duelo timestamptz;
  v_first_bet timestamptz;
  v_best_chem numeric;
  v_best_chem_name text;
  v_night numeric;
  v_week numeric;
  v_cervezas numeric;
  v_chupitos numeric;
  v_duelo_streak int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO u FROM public.users WHERE id = v_me;
  IF u.id IS NULL THEN RETURN; END IF;

  PERFORM public.upsert_legacy_event(v_me, 'registered', 'Registro en DrinkLeague', 'Bienvenido al club', '📅', u.created_at);

  SELECT min(consumed_at) INTO v_first_drink FROM public.drink_logs
  WHERE user_id = v_me AND coalesce(status, 'active') <> 'voided';
  IF v_first_drink IS NOT NULL THEN
    PERFORM public.upsert_legacy_event(v_me, 'first_drink', 'Primera bebida registrada', NULL, '🍺', v_first_drink);
  END IF;

  SELECT ua.unlocked_at, ad.name INTO v_first_ach, v_first_ach_name
  FROM public.user_achievements ua
  JOIN public.achievement_definitions ad ON ad.code = ua.achievement_code
  WHERE ua.user_id = v_me
  ORDER BY ua.unlocked_at ASC LIMIT 1;
  IF v_first_ach IS NOT NULL THEN
    PERFORM public.upsert_legacy_event(v_me, 'first_achievement', 'Primer logro', v_first_ach_name, '🏆', v_first_ach);
  END IF;

  SELECT min(created_at) INTO v_first_mvp FROM public.mvp_awards WHERE user_id = v_me;
  IF v_first_mvp IS NOT NULL THEN
    PERFORM public.upsert_legacy_event(v_me, 'first_mvp', 'Primer MVP', NULL, '👑', v_first_mvp);
  END IF;

  SELECT min(finished_at) INTO v_first_duelo FROM public.game_sessions
  WHERE created_by = v_me AND game_type = 'duelo' AND status = 'finished'
    AND coalesce((state->>'won_by_me')::boolean, false) = true;
  IF v_first_duelo IS NOT NULL THEN
    PERFORM public.upsert_legacy_event(v_me, 'first_duelo_win', 'Primer duelo ganado', NULL, '⚔️', v_first_duelo);
  END IF;

  SELECT min(created_at) INTO v_first_bet
  FROM public.bets b
  WHERE b.user_id = v_me AND b.status = 'won';
  IF v_first_bet IS NOT NULL THEN
    PERFORM public.upsert_legacy_event(v_me, 'first_bet_win', 'Primera apuesta ganada', NULL, '🎰', v_first_bet);
  END IF;

  SELECT f.chemistry_score,
         CASE WHEN f.user_a = v_me THEN ub.display_name ELSE ua.display_name END
  INTO v_best_chem, v_best_chem_name
  FROM public.friendships f
  JOIN public.users ua ON ua.id = f.user_a
  JOIN public.users ub ON ub.id = f.user_b
  WHERE f.user_a = v_me OR f.user_b = v_me
  ORDER BY f.chemistry_score DESC LIMIT 1;
  IF v_best_chem IS NOT NULL THEN
    PERFORM public.upsert_legacy_event(
      v_me, 'best_chemistry', 'Mejor química histórica',
      coalesce(v_best_chem_name, '') || ' · ' || round(v_best_chem)::text || '%',
      '🤝', now(), jsonb_build_object('score', v_best_chem)
    );
    PERFORM public.touch_personal_record(v_me, 'best_chemistry', 'Mejor química conseguida', v_best_chem,
      jsonb_build_object('friend', v_best_chem_name));
  END IF;

  -- Best night / week from drink logs
  SELECT coalesce(max(day_pts), 0) INTO v_night FROM (
    SELECT sum(points_total)::numeric AS day_pts
    FROM public.drink_logs
    WHERE user_id = v_me AND coalesce(status, 'active') <> 'voided'
    GROUP BY (timezone('Europe/Madrid', consumed_at))::date
  ) d;
  SELECT coalesce(max(week_pts), 0) INTO v_week FROM (
    SELECT sum(points_total)::numeric AS week_pts
    FROM public.drink_logs
    WHERE user_id = v_me AND coalesce(status, 'active') <> 'voided'
    GROUP BY week_start_date
  ) w;
  IF coalesce(v_night, 0) > 0 THEN
    PERFORM public.touch_personal_record(v_me, 'best_night', 'Mayor puntuación en una noche', v_night);
  END IF;
  IF coalesce(v_week, 0) > 0 THEN
    PERFORM public.touch_personal_record(v_me, 'best_week', 'Mayor puntuación semanal', v_week);
  END IF;

  SELECT coalesce((s.drink_counts->>'cerveza')::numeric, 0),
         coalesce((s.drink_counts->>'chupito')::numeric, 0)
  INTO v_cervezas, v_chupitos
  FROM public.user_stats_global s WHERE s.user_id = v_me;
  IF coalesce(v_cervezas, 0) > 0 THEN
    PERFORM public.touch_personal_record(v_me, 'career_cervezas', 'Más cervezas (carrera)', v_cervezas);
  END IF;
  IF coalesce(v_chupitos, 0) > 0 THEN
    PERFORM public.touch_personal_record(v_me, 'career_chupitos', 'Más chupitos (carrera)', v_chupitos);
  END IF;

  SELECT coalesce(max(b.settled_payout), 0)::numeric INTO v_night
  FROM public.bets b WHERE b.user_id = v_me AND b.status = 'won';
  IF coalesce(v_night, 0) > 0 THEN
    PERFORM public.touch_personal_record(v_me, 'best_bet_win', 'Mayor apuesta ganada', v_night);
  END IF;

  SELECT coalesce(best_streak, 0) INTO v_duelo_streak
  FROM public.user_game_stats WHERE user_id = v_me AND game_type = 'duelo';
  IF coalesce(v_duelo_streak, 0) > 0 THEN
    PERFORM public.touch_personal_record(v_me, 'duelo_streak', 'Mejor racha de duelos', v_duelo_streak);
  END IF;

  -- First league
  PERFORM public.upsert_legacy_event(
    v_me, 'first_league', 'Primera liga',
    (SELECT l.name FROM public.league_memberships m JOIN public.leagues l ON l.id = m.league_id
     WHERE m.user_id = v_me ORDER BY m.joined_at ASC NULLS LAST LIMIT 1),
    '🏟️',
    (SELECT min(m.joined_at) FROM public.league_memberships m WHERE m.user_id = v_me)
  );

  -- First finished game
  PERFORM public.upsert_legacy_event(
    v_me, 'first_game', 'Primer juego',
    (SELECT game_type FROM public.game_sessions WHERE created_by = v_me AND status = 'finished'
     ORDER BY finished_at ASC NULLS LAST LIMIT 1),
    '🎮',
    (SELECT min(finished_at) FROM public.game_sessions WHERE created_by = v_me AND status = 'finished')
  );
END;
$$;
