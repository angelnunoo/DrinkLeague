-- Fix users RLS infinite recursion + ensure battle-pass claims apply instantly

CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND u.status = 'active'
      AND (
        u.role IN ('superadmin', 'global_admin')
        OR lower(u.email) IN ('angelnuunoo@gmail.com', 'angel.nuunoo@gmail.com')
      )
  );
$$;

-- Simple self-update policy (no nested users SELECT in WITH CHECK)
DROP POLICY IF EXISTS users_update_self ON public.users;
CREATE POLICY users_update_self ON public.users
  FOR UPDATE TO authenticated
  USING (id = auth.uid() OR public.is_global_admin())
  WITH CHECK (id = auth.uid() OR public.is_global_admin());

-- Block privilege escalation on direct client updates
CREATE OR REPLACE FUNCTION public.guard_users_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
BEGIN
  IF public.is_global_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'No permitido';
  END IF;
  -- Solo bloquear escalada en updates directos del cliente (PostgREST).
  -- Los RPC SECURITY DEFINER (credit_tokens, claim, etc.) corren como owner y deben poder escribir.
  IF current_user = 'authenticated' THEN
    NEW.role := OLD.role;
    NEW.status := OLD.status;
    NEW.xp := OLD.xp;
    NEW.level := OLD.level;
    NEW.token_balance := OLD.token_balance;
    NEW.email := OLD.email;
    NEW.prestige_level := OLD.prestige_level;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_users_self_update ON public.users;
CREATE TRIGGER trg_guard_users_self_update
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_users_self_update();

-- Safe profile update RPC (bypasses recursive policy paths)
CREATE OR REPLACE FUNCTION public.update_my_profile(
  p_display_name text,
  p_avatar_url text DEFAULT NULL,
  p_banner_url text DEFAULT NULL,
  p_cosmetics jsonb DEFAULT NULL,
  p_birth_date date DEFAULT NULL,
  p_title_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_name text;
  v_title_name text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_name := left(trim(coalesce(p_display_name, '')), 40);
  IF length(v_name) < 1 THEN RAISE EXCEPTION 'El nombre no puede estar vacío.'; END IF;

  UPDATE public.users SET
    display_name = v_name,
    avatar_url = CASE WHEN p_avatar_url IS NULL OR p_avatar_url = '' THEN avatar_url ELSE left(p_avatar_url, 200) END,
    banner_url = CASE WHEN p_banner_url IS NULL OR p_banner_url = '' THEN banner_url ELSE left(p_banner_url, 200) END,
    equipped_cosmetics = CASE
      WHEN p_cosmetics IS NULL THEN equipped_cosmetics
      ELSE coalesce(equipped_cosmetics, '{}'::jsonb) || p_cosmetics
    END,
    birth_date = COALESCE(p_birth_date, birth_date)
  WHERE id = v_me;

  IF p_title_code IS NOT NULL AND length(trim(p_title_code)) > 0 THEN
    IF EXISTS (
      SELECT 1 FROM public.user_titles
      WHERE user_id = v_me AND title_code = p_title_code
    ) THEN
      SELECT name INTO v_title_name FROM public.title_definitions WHERE code = p_title_code;
      UPDATE public.users
      SET equipped_title_code = p_title_code,
          title = coalesce(v_title_name, title)
      WHERE id = v_me;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text, jsonb, date, text) TO authenticated;

-- Re-assert battle pass claim with row_security off so equip applies immediately
CREATE OR REPLACE FUNCTION public.claim_battle_pass_level(p_level integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
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
  IF NOT FOUND THEN RAISE EXCEPTION 'Nivel no existe'; END IF;

  SELECT xp INTO v_user_xp FROM public.users WHERE id = v_me;

  INSERT INTO public.user_battle_pass (user_id, season_id, xp, level, claimed_levels)
  VALUES (v_me, v_season, v_user_xp, public.level_for_xp(v_user_xp), '{}'::int[])
  ON CONFLICT (user_id, season_id) DO UPDATE
    SET xp = EXCLUDED.xp, level = EXCLUDED.level
  RETURNING * INTO v_bp;

  IF v_user_xp < v_row.xp_required THEN RAISE EXCEPTION 'XP insuficiente'; END IF;
  IF p_level = ANY (coalesce(v_bp.claimed_levels, '{}'::int[])) THEN
    RAISE EXCEPTION 'Ya reclamado';
  END IF;

  UPDATE public.user_battle_pass
  SET claimed_levels = array_append(coalesce(claimed_levels, '{}'::int[]), p_level)
  WHERE user_id = v_me AND season_id = v_season;

  IF v_row.reward_type = 'tokens' THEN
    v_amount := GREATEST(10, p_level * 10);
    PERFORM public.credit_tokens(v_me, v_amount, 'battle_pass', 'bp_level', NULL);

  ELSIF v_row.reward_type = 'title' AND v_row.reward_code IS NOT NULL THEN
    INSERT INTO public.user_titles (user_id, title_code)
    VALUES (v_me, v_row.reward_code)
    ON CONFLICT DO NOTHING;
    SELECT name INTO v_title_name FROM public.title_definitions WHERE code = v_row.reward_code;
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
    IF FOUND THEN
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

      IF v_slot = 'banner' THEN
        UPDATE public.users
        SET banner_url = v_value,
            equipped_cosmetics = jsonb_set(coalesce(equipped_cosmetics, '{}'::jsonb), ARRAY[v_slot], to_jsonb(v_value))
        WHERE id = v_me;
      ELSE
        UPDATE public.users
        SET equipped_cosmetics = jsonb_set(coalesce(equipped_cosmetics, '{}'::jsonb), ARRAY[v_slot], to_jsonb(v_value))
        WHERE id = v_me;
      END IF;
    ELSE
      IF v_row.reward_code LIKE 'frame_%' THEN
        v_slot := 'frame';
        v_value := replace(v_row.reward_code, 'frame_', '');
        IF v_value LIKE 'basic_%' THEN v_value := replace(v_value, 'basic_', ''); END IF;
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

      IF v_slot = 'banner' THEN
        UPDATE public.users
        SET banner_url = v_value,
            equipped_cosmetics = jsonb_set(coalesce(equipped_cosmetics, '{}'::jsonb), ARRAY[v_slot], to_jsonb(v_value))
        WHERE id = v_me;
      ELSE
        UPDATE public.users
        SET equipped_cosmetics = jsonb_set(coalesce(equipped_cosmetics, '{}'::jsonb), ARRAY[v_slot], to_jsonb(v_value))
        WHERE id = v_me;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'level', p_level,
    'reward', v_row.reward_label,
    'type', v_row.reward_type,
    'code', v_row.reward_code,
    'applied', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_all_battle_pass_levels()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
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

  INSERT INTO public.user_battle_pass (user_id, season_id, xp, level, claimed_levels)
  VALUES (v_me, v_season, v_xp, public.level_for_xp(v_xp), '{}'::int[])
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
    v_claimed := array_append(v_claimed, v_lvl);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'claimed', v_count, 'rewards', v_results, 'applied', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_battle_pass_level(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_all_battle_pass_levels() TO authenticated;
