-- ============================================================
-- Rotating titles · leadership · season goals · feed hooks · grants
-- ============================================================

CREATE OR REPLACE FUNCTION public.grant_temporary_title(
  p_user_id uuid,
  p_code text,
  p_hours int DEFAULT 168,
  p_source text DEFAULT 'rotating'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.user_titles (user_id, title_code, unlocked_at, expires_at, is_temporary, source)
  VALUES (p_user_id, p_code, now(), now() + make_interval(hours => greatest(1, p_hours)), true, p_source)
  ON CONFLICT (user_id, title_code) DO UPDATE SET
    expires_at = EXCLUDED.expires_at,
    is_temporary = true,
    source = EXCLUDED.source,
    unlocked_at = CASE
      WHEN public.user_titles.expires_at IS NULL OR public.user_titles.expires_at < now()
      THEN now() ELSE public.user_titles.unlocked_at END;

  -- Auto-equip if no title or previous temporary expired
  UPDATE public.users u SET
    equipped_title_code = p_code,
    title = (SELECT name FROM public.title_definitions WHERE code = p_code)
  WHERE u.id = p_user_id
    AND (
      u.equipped_title_code IS NULL
      OR u.equipped_title_code IN ('rey_cervecero','rey_copas','rey_chupitos','maestro_apostador','rey_quimica')
      OR NOT EXISTS (
        SELECT 1 FROM public.user_titles ut
        WHERE ut.user_id = u.id AND ut.title_code = u.equipped_title_code
          AND (ut.expires_at IS NULL OR ut.expires_at > now())
      )
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_rotating_titles()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid;
  v_uid2 uuid;
BEGIN
  -- Expire old temporary titles from equipment
  UPDATE public.users u SET
    equipped_title_code = NULL,
    title = 'Novato'
  WHERE u.equipped_title_code IN ('rey_cervecero','rey_copas','rey_chupitos','maestro_apostador','rey_quimica')
    AND NOT EXISTS (
      SELECT 1 FROM public.user_titles ut
      WHERE ut.user_id = u.id AND ut.title_code = u.equipped_title_code
        AND ut.expires_at > now()
    );

  -- Rey Cervecero
  SELECT s.user_id INTO v_uid
  FROM public.user_stats_global s
  ORDER BY coalesce((s.drink_counts->>'cerveza')::numeric, 0) DESC, s.total_points DESC
  LIMIT 1;
  IF v_uid IS NOT NULL THEN
    PERFORM public.grant_temporary_title(v_uid, 'rey_cervecero', 168, 'rotating_cerveza');
  END IF;

  -- Rey Copas
  SELECT s.user_id INTO v_uid
  FROM public.user_stats_global s
  ORDER BY coalesce((s.drink_counts->>'copa')::numeric, 0) DESC, s.total_points DESC
  LIMIT 1;
  IF v_uid IS NOT NULL THEN
    PERFORM public.grant_temporary_title(v_uid, 'rey_copas', 168, 'rotating_copa');
  END IF;

  -- Rey Chupitos
  SELECT s.user_id INTO v_uid
  FROM public.user_stats_global s
  ORDER BY coalesce((s.drink_counts->>'chupito')::numeric, 0) DESC, s.total_points DESC
  LIMIT 1;
  IF v_uid IS NOT NULL THEN
    PERFORM public.grant_temporary_title(v_uid, 'rey_chupitos', 168, 'rotating_chupito');
  END IF;

  -- Maestro Apostador
  SELECT b.user_id INTO v_uid
  FROM public.bets b
  WHERE b.status = 'won'
  GROUP BY b.user_id
  ORDER BY sum(coalesce(b.settled_payout, 0)) DESC
  LIMIT 1;
  IF v_uid IS NOT NULL THEN
    PERFORM public.grant_temporary_title(v_uid, 'maestro_apostador', 168, 'rotating_bets');
  END IF;

  -- Rey Química (both members of top pair)
  SELECT f.user_a, f.user_b INTO v_uid, v_uid2
  FROM public.friendships f
  ORDER BY f.chemistry_score DESC
  LIMIT 1;
  IF v_uid IS NOT NULL THEN
    PERFORM public.grant_temporary_title(v_uid, 'rey_quimica', 168, 'rotating_chemistry');
    PERFORM public.grant_temporary_title(v_uid2, 'rey_quimica', 168, 'rotating_chemistry');
  END IF;
END;
$$;

-- Leadership streaks from weekly leaderboard (#1)
CREATE OR REPLACE FUNCTION public.refresh_leadership_streaks(p_league_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_week date;
  v_leader uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT league_id FROM public.leaderboard_weekly
    WHERE p_league_id IS NULL OR league_id = p_league_id
  LOOP
    SELECT week_start_date INTO v_week
    FROM public.leaderboard_weekly
    WHERE league_id = r.league_id
    ORDER BY week_start_date DESC LIMIT 1;

    IF v_week IS NULL THEN CONTINUE; END IF;

    SELECT user_id INTO v_leader
    FROM public.leaderboard_weekly
    WHERE league_id = r.league_id AND week_start_date = v_week
    ORDER BY points DESC, logs_count DESC
    LIMIT 1;

    IF v_leader IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.leadership_streaks (user_id, league_id, period, current_count, best_count, last_led_on, updated_at)
    VALUES (v_leader, r.league_id, 'week', 1, 1, v_week, now())
    ON CONFLICT (user_id, league_id, period) DO UPDATE SET
      current_count = CASE
        WHEN public.leadership_streaks.last_led_on = v_week THEN public.leadership_streaks.current_count
        WHEN public.leadership_streaks.last_led_on = v_week - 7 THEN public.leadership_streaks.current_count + 1
        ELSE 1
      END,
      best_count = GREATEST(
        public.leadership_streaks.best_count,
        CASE
          WHEN public.leadership_streaks.last_led_on = v_week THEN public.leadership_streaks.current_count
          WHEN public.leadership_streaks.last_led_on = v_week - 7 THEN public.leadership_streaks.current_count + 1
          ELSE 1
        END
      ),
      last_led_on = v_week,
      updated_at = now();

    -- Reset others who lost the crown this week
    UPDATE public.leadership_streaks ls SET
      current_count = CASE WHEN ls.last_led_on = v_week THEN ls.current_count ELSE 0 END,
      updated_at = now()
    WHERE ls.league_id = r.league_id
      AND ls.period = 'week'
      AND ls.user_id <> v_leader
      AND ls.last_led_on IS DISTINCT FROM v_week;
  END LOOP;
END;
$$;

-- Ensure season-style personal objectives
CREATE OR REPLACE FUNCTION public.ensure_season_objectives(p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := coalesce(p_user_id, auth.uid());
  v_league uuid;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT league_id INTO v_league
  FROM public.league_memberships
  WHERE user_id = v_me AND status = 'active'
  ORDER BY joined_at DESC NULLS LAST
  LIMIT 1;

  INSERT INTO public.personal_objectives (user_id, league_id, code, title, description, metric, target, current_value, status)
  SELECT v_me, v_league, x.code, x.title, x.description, x.metric, x.target, 0, 'active'
  FROM (VALUES
    ('top3_week', 'Entrar en Top 3', 'Termina la semana en el podio.', 'weekly_rank_inv', 3),
    ('points_1000', 'Conseguir 1000 puntos', 'Acumula 1000 puntos de temporada.', 'season_points', 1000),
    ('level_50', 'Alcanzar nivel 50', 'Sube hasta el nivel 50.', 'level', 50),
    ('chem_90', 'Conseguir 90% de química', 'Llega a 90 con un amigo.', 'best_chemistry', 90),
    ('duelos_10', 'Ganar 10 duelos', 'Suma 10 victorias en Duelo.', 'duelo_wins', 10)
  ) AS x(code, title, description, metric, target)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.personal_objectives po
    WHERE po.user_id = v_me AND po.code = x.code AND po.status = 'active'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_season_objectives(p_user_id uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := coalesce(p_user_id, auth.uid());
  v_level int;
  v_chem numeric;
  v_duelos int;
  v_points numeric;
  v_rank int;
BEGIN
  IF v_me IS NULL THEN RETURN; END IF;
  PERFORM public.ensure_season_objectives(v_me);

  SELECT level INTO v_level FROM public.users WHERE id = v_me;
  SELECT coalesce(max(chemistry_score), 0) INTO v_chem
  FROM public.friendships WHERE user_a = v_me OR user_b = v_me;
  SELECT coalesce(won, 0) INTO v_duelos
  FROM public.user_game_stats WHERE user_id = v_me AND game_type = 'duelo';
  SELECT coalesce(total_points, 0) INTO v_points
  FROM public.user_stats_global WHERE user_id = v_me;

  UPDATE public.personal_objectives SET current_value = v_level
  WHERE user_id = v_me AND code = 'level_50' AND status = 'active';
  UPDATE public.personal_objectives SET current_value = v_chem
  WHERE user_id = v_me AND code = 'chem_90' AND status = 'active';
  UPDATE public.personal_objectives SET current_value = v_duelos
  WHERE user_id = v_me AND code = 'duelos_10' AND status = 'active';
  UPDATE public.personal_objectives SET current_value = least(v_points, 1000)
  WHERE user_id = v_me AND code = 'points_1000' AND status = 'active';

  -- Approximate weekly rank from first active league
  SELECT rnk INTO v_rank FROM (
    SELECT lw.user_id,
           rank() OVER (ORDER BY lw.points DESC) AS rnk
    FROM public.leaderboard_weekly lw
    WHERE lw.league_id = (
      SELECT league_id FROM public.league_memberships
      WHERE user_id = v_me AND status = 'active' LIMIT 1
    )
    AND lw.week_start_date = (
      SELECT max(week_start_date) FROM public.leaderboard_weekly
      WHERE league_id = (
        SELECT league_id FROM public.league_memberships
        WHERE user_id = v_me AND status = 'active' LIMIT 1
      )
    )
  ) q WHERE user_id = v_me;
  IF v_rank IS NOT NULL THEN
    UPDATE public.personal_objectives
    SET current_value = greatest(0, 4 - v_rank)
    WHERE user_id = v_me AND code = 'top3_week' AND status = 'active';
  END IF;

  UPDATE public.personal_objectives SET
    status = 'completed',
    completed_at = coalesce(completed_at, now())
  WHERE user_id = v_me AND status = 'active'
    AND current_value >= target;
END;
$$;

-- Soft-cap wrapper used by high-frequency earners (optional upgrade path)
CREATE OR REPLACE FUNCTION public.credit_tokens_balanced(
  p_user_id uuid,
  p_delta bigint,
  p_reason text,
  p_ref_type text DEFAULT NULL,
  p_ref_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_delta bigint;
BEGIN
  v_delta := public.token_delta_within_daily_cap(p_user_id, p_delta);
  IF v_delta = 0 AND p_delta > 0 THEN
    -- Still allow tiny consolation? No — respect cap.
    SELECT token_balance INTO v_delta FROM public.users WHERE id = p_user_id;
    RETURN coalesce(v_delta, 0);
  END IF;
  RETURN public.credit_tokens(p_user_id, v_delta, p_reason, p_ref_type, p_ref_id);
END;
$$;

-- Economy sinks: raise mid-tier shop usefulness via slight price rebalance
UPDATE public.shop_items SET price_tokens = 120 WHERE sku = 'sticker_cheers' AND price_tokens > 120;
UPDATE public.shop_items SET price_tokens = 180 WHERE sku = 'frame_basic_teal' AND price_tokens > 180;
UPDATE public.shop_items SET price_tokens = 220 WHERE sku = 'frame_basic_amber' AND price_tokens > 220;
UPDATE public.shop_items SET price_tokens = 350 WHERE sku = 'banner_night' AND price_tokens < 350;
UPDATE public.shop_items SET price_tokens = 600 WHERE sku = 'avatar_spark' AND price_tokens < 600;
UPDATE public.shop_items SET price_tokens = 2800 WHERE sku = 'theme_neon';

-- Hook friend accept → social feed (replace respond to add emit; keep core logic via call)
-- Wrap by redefining after fetching isn't possible; patch emit into existing via CREATE OR REPLACE
-- that calls previous body — we patch lightly by trigger instead:

CREATE OR REPLACE FUNCTION public.trg_friendship_social_feed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  na text; nb text;
BEGIN
  SELECT display_name INTO na FROM public.users WHERE id = NEW.user_a;
  SELECT display_name INTO nb FROM public.users WHERE id = NEW.user_b;
  PERFORM public.emit_social_feed(
    NEW.user_a, 'friendship', '🤝 Nueva amistad',
    coalesce(na, '?') || ' y ' || coalesce(nb, '?') || ' ahora son amigos',
    '/app/social', jsonb_build_object('user_a', NEW.user_a, 'user_b', NEW.user_b),
    NULL, 'friends'
  );
  PERFORM public.upsert_legacy_event(NEW.user_a, 'first_friend', 'Primer amigo', nb, '🤝', NEW.created_at);
  PERFORM public.upsert_legacy_event(NEW.user_b, 'first_friend', 'Primer amigo', na, '🤝', NEW.created_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS friendships_social_feed ON public.friendships;
CREATE TRIGGER friendships_social_feed
AFTER INSERT ON public.friendships
FOR EACH ROW EXECUTE FUNCTION public.trg_friendship_social_feed();

CREATE OR REPLACE FUNCTION public.trg_achievement_social_feed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_name text;
  v_emoji text;
  v_actor text;
BEGIN
  SELECT name, coalesce(emoji, '🏆') INTO v_name, v_emoji
  FROM public.achievement_definitions WHERE code = NEW.achievement_code;
  SELECT display_name INTO v_actor FROM public.users WHERE id = NEW.user_id;
  PERFORM public.emit_social_feed(
    NEW.user_id, 'achievement',
    v_emoji || ' ' || coalesce(v_actor, 'Alguien') || ' consiguió ' || coalesce(v_name, NEW.achievement_code),
    NULL, '/app/achievements',
    jsonb_build_object('achievement', NEW.achievement_code),
    NULL, 'friends'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_achievements_social_feed ON public.user_achievements;
CREATE TRIGGER user_achievements_social_feed
AFTER INSERT ON public.user_achievements
FOR EACH ROW EXECUTE FUNCTION public.trg_achievement_social_feed();

-- Grants
GRANT EXECUTE ON FUNCTION public.remove_friend(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_users(text, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lookup_user_by_friend_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_onboarding_progress(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_feed(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_profile(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rebuild_user_legacy(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_season_objectives(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_season_objectives(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_rotating_titles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_leadership_streaks(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emit_social_feed(uuid, text, text, text, text, jsonb, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.credit_tokens_balanced(uuid, bigint, text, text, uuid) TO authenticated;

-- Seed onboarding rows for existing users (lazy; sync will fill)
SELECT public.refresh_rotating_titles();
