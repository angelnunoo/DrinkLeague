-- Auto-equip chest rewards; allow free open if chest already in inventory; harden profile save

CREATE OR REPLACE FUNCTION public.open_shop_chest(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_chest public.shop_items%ROWTYPE;
  v_reward public.shop_items%ROWTYPE;
  v_pool text[];
  v_already boolean := false;
  v_bonus bigint := 0;
  v_from_inventory boolean := false;
  v_slot text;
  v_value text;
  v_title_name text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_chest
  FROM public.shop_items
  WHERE id = p_item_id AND is_active AND category = 'chest';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cofre no disponible'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_inventory
    WHERE user_id = v_me AND item_id = p_item_id
  ) THEN
    v_from_inventory := true;
    DELETE FROM public.user_inventory WHERE user_id = v_me AND item_id = p_item_id;
  ELSE
    PERFORM public.credit_tokens(
      v_me,
      -v_chest.price_tokens,
      'chest_open',
      'shop_item',
      p_item_id
    );
  END IF;

  v_pool := CASE v_chest.sku
    WHEN 'chest_common' THEN ARRAY['cheap']
    WHEN 'chest_rare' THEN ARRAY['cheap', 'medium']
    WHEN 'chest_epic' THEN ARRAY['medium', 'rare']
    WHEN 'chest_legendary' THEN ARRAY['rare', 'epic']
    WHEN 'chest_mythic' THEN ARRAY['epic', 'mythic']
    ELSE ARRAY['cheap', 'medium']
  END;

  SELECT * INTO v_reward
  FROM public.shop_items si
  WHERE si.is_active
    AND si.category <> 'chest'
    AND si.tier = ANY (v_pool)
  ORDER BY random()
  LIMIT 1;

  IF NOT FOUND THEN
    v_bonus := GREATEST(50, (v_chest.price_tokens / 4)::bigint);
    PERFORM public.credit_tokens(v_me, v_bonus, 'chest_fallback', 'shop_item', p_item_id);
    RETURN jsonb_build_object(
      'ok', true,
      'chest_sku', v_chest.sku,
      'chest_name', v_chest.name,
      'kind', 'tokens',
      'amount', v_bonus,
      'paid', NOT v_from_inventory,
      'label', v_bonus || ' fichas'
    );
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_inventory
    WHERE user_id = v_me AND item_id = v_reward.id
  ) INTO v_already;

  IF v_already THEN
    v_bonus := CASE v_reward.tier
      WHEN 'mythic' THEN 5000
      WHEN 'epic' THEN 2000
      WHEN 'rare' THEN 800
      WHEN 'medium' THEN 300
      ELSE 100
    END;
    PERFORM public.credit_tokens(v_me, v_bonus, 'chest_duplicate', 'shop_item', v_reward.id);
    RETURN jsonb_build_object(
      'ok', true,
      'chest_sku', v_chest.sku,
      'chest_name', v_chest.name,
      'kind', 'duplicate',
      'amount', v_bonus,
      'reward_id', v_reward.id,
      'reward_sku', v_reward.sku,
      'reward_name', v_reward.name,
      'reward_category', v_reward.category,
      'reward_tier', v_reward.tier,
      'paid', NOT v_from_inventory,
      'label', v_reward.name || ' (duplicado → +' || v_bonus || ' ★)'
    );
  END IF;

  UPDATE public.user_inventory ui
  SET equipped = false
  FROM public.shop_items si
  WHERE ui.item_id = si.id
    AND ui.user_id = v_me
    AND si.category = v_reward.category;

  INSERT INTO public.user_inventory (user_id, item_id, equipped)
  VALUES (v_me, v_reward.id, true)
  ON CONFLICT (user_id, item_id) DO UPDATE SET equipped = true;

  v_slot := CASE
    WHEN v_reward.category = 'frame' THEN 'frame'
    WHEN v_reward.category IN ('theme', 'effect') THEN 'bg'
    WHEN v_reward.category = 'banner' THEN 'banner'
    WHEN v_reward.category = 'avatar' THEN 'avatar'
    ELSE v_reward.category
  END;

  v_value := CASE v_reward.sku
    WHEN 'frame_basic_teal' THEN 'teal'
    WHEN 'frame_basic_amber' THEN 'gold'
    WHEN 'frame_animated_gold' THEN 'gold'
    WHEN 'theme_neon' THEN 'neon'
    WHEN 'effect_sparks' THEN 'neon'
    ELSE v_reward.sku
  END;

  IF v_reward.category = 'banner' THEN
    UPDATE public.users
    SET banner_url = v_reward.sku,
        equipped_cosmetics = jsonb_set(coalesce(equipped_cosmetics, '{}'::jsonb), ARRAY['banner'], to_jsonb(v_reward.sku))
    WHERE id = v_me;
  ELSIF v_reward.category = 'avatar' THEN
    UPDATE public.users
    SET avatar_url = coalesce(v_reward.asset_key, 'emoji:😎'),
        equipped_cosmetics = jsonb_set(coalesce(equipped_cosmetics, '{}'::jsonb), ARRAY['avatar'], to_jsonb(v_reward.sku))
    WHERE id = v_me;
  ELSIF v_reward.category = 'title' THEN
    INSERT INTO public.user_titles (user_id, title_code)
    VALUES (v_me, v_reward.sku)
    ON CONFLICT DO NOTHING;
    INSERT INTO public.user_titles (user_id, title_code)
    VALUES (v_me, replace(v_reward.sku, 'title_', ''))
    ON CONFLICT DO NOTHING;
    SELECT name INTO v_title_name
    FROM public.title_definitions
    WHERE code = replace(v_reward.sku, 'title_', '') OR code = v_reward.sku
    LIMIT 1;
    UPDATE public.users
    SET equipped_title_code = coalesce(replace(v_reward.sku, 'title_', ''), v_reward.sku),
        title = coalesce(v_title_name, v_reward.name, title),
        equipped_cosmetics = jsonb_set(coalesce(equipped_cosmetics, '{}'::jsonb), ARRAY['title'], to_jsonb(v_reward.sku))
    WHERE id = v_me;
  ELSIF v_reward.category = 'trophy' THEN
    INSERT INTO public.user_trophies (user_id, trophy_code)
    SELECT v_me, v_reward.sku
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_trophies WHERE user_id = v_me AND trophy_code = v_reward.sku
    );
  ELSE
    UPDATE public.users
    SET equipped_cosmetics = jsonb_set(coalesce(equipped_cosmetics, '{}'::jsonb), ARRAY[v_slot], to_jsonb(v_value))
    WHERE id = v_me;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'chest_sku', v_chest.sku,
    'chest_name', v_chest.name,
    'kind', 'item',
    'reward_id', v_reward.id,
    'reward_sku', v_reward.sku,
    'reward_name', v_reward.name,
    'reward_category', v_reward.category,
    'reward_tier', v_reward.tier,
    'equipped', true,
    'paid', NOT v_from_inventory,
    'label', v_reward.name
  );
END;
$$;

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
  v_rows int := 0;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_name := left(trim(coalesce(p_display_name, '')), 40);
  IF length(v_name) < 1 THEN RAISE EXCEPTION 'El nombre no puede estar vacío.'; END IF;

  UPDATE public.users SET
    display_name = v_name,
    avatar_url = CASE
      WHEN p_avatar_url IS NULL OR p_avatar_url = '' THEN avatar_url
      ELSE left(p_avatar_url, 200)
    END,
    banner_url = CASE
      WHEN p_banner_url IS NULL OR p_banner_url = '' THEN banner_url
      ELSE left(p_banner_url, 200)
    END,
    equipped_cosmetics = CASE
      WHEN p_cosmetics IS NULL THEN coalesce(equipped_cosmetics, '{}'::jsonb)
      ELSE coalesce(equipped_cosmetics, '{}'::jsonb) || p_cosmetics
    END,
    birth_date = CASE WHEN p_birth_date IS NULL THEN birth_date ELSE p_birth_date END,
    updated_at = now()
  WHERE id = v_me;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN RAISE EXCEPTION 'No se pudo actualizar el perfil.'; END IF;

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

  RETURN jsonb_build_object('ok', true, 'display_name', v_name);
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_shop_chest(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_my_profile(text, text, text, jsonb, date, text) TO authenticated;
