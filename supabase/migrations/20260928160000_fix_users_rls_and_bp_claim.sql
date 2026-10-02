-- Fix infinite recursion in users UPDATE RLS + apply battle-pass rewards immediately

-- Privileged role lookup (avoids SELECT-on-users inside users policy)
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.auth_user_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated, service_role;

DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_global_admin())
  WITH CHECK (
    (id = auth.uid() AND role = public.auth_user_role())
    OR public.is_global_admin()
  );

-- Apply reward instantly (tokens / title / trophy / cosmetic + auto-equip)
CREATE OR REPLACE FUNCTION public.claim_battle_pass_level(p_level integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_season uuid;
  v_row public.battle_pass_levels%ROWTYPE;
  v_bp public.user_battle_pass%ROWTYPE;
  v_user_xp bigint;
  v_item public.shop_items%ROWTYPE;
  v_amount bigint;
  v_slot text;
  v_value text;
  v_title_name text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id INTO v_season
  FROM public.battle_pass_seasons
  WHERE is_active
  ORDER BY starts_at DESC
  LIMIT 1;
  IF v_season IS NULL THEN RAISE EXCEPTION 'No hay pase activo'; END IF;

  SELECT * INTO v_row
  FROM public.battle_pass_levels
  WHERE season_id = v_season AND level = p_level;
  IF v_row.level IS NULL THEN RAISE EXCEPTION 'Nivel no existe'; END IF;

  SELECT xp INTO v_user_xp FROM public.users WHERE id = v_me;

  INSERT INTO public.user_battle_pass (user_id, season_id, xp, level)
  VALUES (v_me, v_season, v_user_xp, public.level_for_xp(v_user_xp))
  ON CONFLICT (user_id, season_id) DO UPDATE
    SET xp = EXCLUDED.xp, level = EXCLUDED.level
  RETURNING * INTO v_bp;

  IF v_user_xp < v_row.xp_required THEN RAISE EXCEPTION 'XP insuficiente'; END IF;
  IF p_level = ANY (v_bp.claimed_levels) THEN RAISE EXCEPTION 'Ya reclamado'; END IF;

  UPDATE public.user_battle_pass
  SET claimed_levels = array_append(claimed_levels, p_level)
  WHERE user_id = v_me AND season_id = v_season;

  IF v_row.reward_type = 'tokens' THEN
    v_amount := GREATEST(10, p_level * 10);
    PERFORM public.credit_tokens(v_me, v_amount, 'battle_pass', 'bp_level', NULL);

  ELSIF v_row.reward_type = 'title' AND v_row.reward_code IS NOT NULL THEN
    INSERT INTO public.user_titles (user_id, title_code)
    VALUES (v_me, v_row.reward_code)
    ON CONFLICT DO NOTHING;
    SELECT name INTO v_title_name FROM public.title_definitions WHERE code = v_row.reward_code;
    -- Equip immediately
    UPDATE public.users
    SET equipped_title_code = v_row.reward_code,
        title = coalesce(v_title_name, title)
    WHERE id = v_me;

  ELSIF v_row.reward_type = 'trophy' AND v_row.reward_code IS NOT NULL THEN
    INSERT INTO public.user_trophies (user_id, trophy_code)
    SELECT v_me, v_row.reward_code
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_trophies
      WHERE user_id = v_me AND trophy_code = v_row.reward_code
    );

  ELSIF v_row.reward_type = 'cosmetic' AND v_row.reward_code IS NOT NULL THEN
    SELECT * INTO v_item FROM public.shop_items WHERE sku = v_row.reward_code LIMIT 1;
    IF v_item.id IS NOT NULL THEN
      INSERT INTO public.user_inventory (user_id, item_id, equipped)
      VALUES (v_me, v_item.id, true)
      ON CONFLICT (user_id, item_id) DO UPDATE SET equipped = true;

      UPDATE public.user_inventory ui
      SET equipped = false
      FROM public.shop_items si
      WHERE ui.item_id = si.id
        AND ui.user_id = v_me
        AND si.category = v_item.category
        AND ui.item_id <> v_item.id;

      -- Map shop SKUs to profile UI keys (frame/teal, etc.) and equip now
      v_slot := CASE
        WHEN v_item.category = 'frame' THEN 'frame'
        WHEN v_item.category IN ('theme', 'effect') THEN 'bg'
        WHEN v_item.category = 'banner' THEN 'banner'
        ELSE v_item.category
      END;
      v_value := CASE v_item.sku
        WHEN 'frame_basic_teal' THEN 'teal'
        WHEN 'frame_basic_amber' THEN 'gold'
        WHEN 'frame_animated_gold' THEN 'gold'
        ELSE v_item.sku
      END;

      UPDATE public.users
      SET equipped_cosmetics = jsonb_set(
        coalesce(equipped_cosmetics, '{}'::jsonb),
        ARRAY[v_slot],
        to_jsonb(v_value)
      )
      WHERE id = v_me;
    ELSE
      -- Fallback: frame_basic_teal → frame=teal, banner_x → banner, etc.
      IF v_row.reward_code LIKE 'frame_%' THEN
        v_slot := 'frame';
        v_value := replace(v_row.reward_code, 'frame_', '');
        IF v_value LIKE 'basic_%' THEN
          v_value := replace(v_value, 'basic_', '');
        END IF;
      ELSIF v_row.reward_code LIKE 'banner_%' THEN
        v_slot := 'banner';
        v_value := v_row.reward_code;
      ELSIF v_row.reward_code LIKE 'bg_%' OR v_row.reward_code LIKE 'theme_%' THEN
        v_slot := 'bg';
        v_value := regexp_replace(v_row.reward_code, '^(bg|theme)_', '');
      ELSE
        v_slot := 'frame';
        v_value := v_row.reward_code;
      END IF;

      UPDATE public.users
      SET equipped_cosmetics = jsonb_set(
        coalesce(equipped_cosmetics, '{}'::jsonb),
        ARRAY[v_slot],
        to_jsonb(v_value)
      )
      WHERE id = v_me;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'level', p_level,
    'reward', v_row.reward_label,
    'type', v_row.reward_type,
    'code', v_row.reward_code
  );
END;
$$;

-- Claim every unlocked unclaimed level in one shot
CREATE OR REPLACE FUNCTION public.claim_all_battle_pass_levels()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_season uuid;
  v_xp bigint;
  v_claimed int[];
  v_lvl int;
  v_results jsonb := '[]'::jsonb;
  v_one jsonb;
  v_count int := 0;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT id INTO v_season
  FROM public.battle_pass_seasons
  WHERE is_active
  ORDER BY starts_at DESC
  LIMIT 1;
  IF v_season IS NULL THEN RAISE EXCEPTION 'No hay pase activo'; END IF;

  SELECT xp INTO v_xp FROM public.users WHERE id = v_me;

  INSERT INTO public.user_battle_pass (user_id, season_id, xp, level)
  VALUES (v_me, v_season, v_xp, public.level_for_xp(v_xp))
  ON CONFLICT (user_id, season_id) DO UPDATE
    SET xp = EXCLUDED.xp, level = EXCLUDED.level;

  SELECT coalesce(claimed_levels, '{}'::int[]) INTO v_claimed
  FROM public.user_battle_pass
  WHERE user_id = v_me AND season_id = v_season;

  FOR v_lvl IN
    SELECT level
    FROM public.battle_pass_levels
    WHERE season_id = v_season
      AND xp_required <= v_xp
      AND NOT (level = ANY (v_claimed))
    ORDER BY level
  LOOP
    v_one := public.claim_battle_pass_level(v_lvl);
    v_results := v_results || jsonb_build_array(v_one);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('claimed', v_count, 'rewards', v_results);
END;
$$;

REVOKE ALL ON FUNCTION public.claim_battle_pass_level(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_battle_pass_level(integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_all_battle_pass_levels() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_all_battle_pass_levels() TO authenticated, service_role;
