-- Map chest rewards to UI-compatible banner/frame values so they show on profile

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
    WHEN 'frame_casino_neon' THEN 'teal'
    WHEN 'frame_legend' THEN 'gold'
    WHEN 'frame_unique_fire' THEN 'rose'
    WHEN 'frame_hof' THEN 'gold'
    WHEN 'theme_neon' THEN 'neon'
    WHEN 'effect_sparks' THEN 'neon'
    WHEN 'banner_night' THEN 'banner:night'
    WHEN 'banner_premium_bar' THEN 'banner:casino'
    WHEN 'banner_weekend_party' THEN 'banner:ember'
    WHEN 'banner_rare_storm' THEN 'banner:teal'
    WHEN 'banner_founder' THEN 'banner:gold'
    ELSE v_reward.sku
  END;

  IF v_reward.category = 'banner' THEN
    UPDATE public.users
    SET banner_url = v_value,
        equipped_cosmetics = jsonb_set(coalesce(equipped_cosmetics, '{}'::jsonb), ARRAY['banner'], to_jsonb(v_value))
    WHERE id = v_me;
  ELSIF v_reward.category = 'avatar' THEN
    UPDATE public.users
    SET avatar_url = CASE
          WHEN coalesce(v_reward.asset_key, '') LIKE 'emoji:%' THEN v_reward.asset_key
          ELSE 'emoji:😎'
        END,
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

GRANT EXECUTE ON FUNCTION public.open_shop_chest(uuid) TO authenticated;
