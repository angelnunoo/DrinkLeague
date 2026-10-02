-- Open shop chests: spend tokens, roll a cosmetic reward, never stockpile chests

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
  v_title_name text;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO v_chest
  FROM public.shop_items
  WHERE id = p_item_id AND is_active AND category = 'chest';
  IF NOT FOUND THEN RAISE EXCEPTION 'Cofre no disponible'; END IF;

  -- Loot table by chest rarity
  v_pool := CASE v_chest.sku
    WHEN 'chest_common' THEN ARRAY['cheap']
    WHEN 'chest_rare' THEN ARRAY['cheap', 'medium']
    WHEN 'chest_epic' THEN ARRAY['medium', 'rare']
    WHEN 'chest_legendary' THEN ARRAY['rare', 'epic']
    WHEN 'chest_mythic' THEN ARRAY['epic', 'mythic']
    ELSE ARRAY['cheap', 'medium']
  END;

  PERFORM public.credit_tokens(
    v_me,
    -v_chest.price_tokens,
    'chest_open',
    'shop_item',
    p_item_id
  );

  -- Weighted pick: prefer higher tiers slightly on better chests
  SELECT * INTO v_reward
  FROM public.shop_items si
  WHERE si.is_active
    AND si.category <> 'chest'
    AND si.tier = ANY (v_pool)
  ORDER BY
    CASE
      WHEN v_chest.sku IN ('chest_legendary', 'chest_mythic')
        AND si.tier = v_pool[array_length(v_pool, 1)] THEN random() * 0.35
      ELSE random()
    END DESC
  LIMIT 1;

  IF NOT FOUND THEN
    -- Fallback: token rebate if catalog empty
    v_bonus := GREATEST(50, (v_chest.price_tokens / 4)::bigint);
    PERFORM public.credit_tokens(v_me, v_bonus, 'chest_fallback', 'shop_item', p_item_id);
    RETURN jsonb_build_object(
      'ok', true,
      'chest_sku', v_chest.sku,
      'chest_name', v_chest.name,
      'kind', 'tokens',
      'amount', v_bonus,
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
      'label', v_reward.name || ' (duplicado → +' || v_bonus || ' ★)'
    );
  END IF;

  INSERT INTO public.user_inventory (user_id, item_id, equipped)
  VALUES (v_me, v_reward.id, false)
  ON CONFLICT (user_id, item_id) DO NOTHING;

  IF v_reward.category = 'title' THEN
    INSERT INTO public.user_titles (user_id, title_code)
    VALUES (v_me, v_reward.sku)
    ON CONFLICT DO NOTHING;
    -- Also map sku without prefix if title_definitions use shorter codes
    INSERT INTO public.user_titles (user_id, title_code)
    VALUES (v_me, replace(v_reward.sku, 'title_', ''))
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_reward.category = 'trophy' THEN
    INSERT INTO public.user_trophies (user_id, trophy_code)
    SELECT v_me, v_reward.sku
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_trophies
      WHERE user_id = v_me AND trophy_code = v_reward.sku
    );
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
    'label', v_reward.name
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.open_shop_chest(uuid) TO authenticated;
