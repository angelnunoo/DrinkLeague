-- Premium shop catalog: chests, exclusives, rarity polish

ALTER TABLE public.shop_items DROP CONSTRAINT IF EXISTS shop_items_category_check;
ALTER TABLE public.shop_items
  ADD CONSTRAINT shop_items_category_check
  CHECK (category = ANY (ARRAY[
    'frame'::text, 'banner'::text, 'avatar'::text, 'trophy'::text,
    'theme'::text, 'effect'::text, 'vitrine'::text, 'sticker'::text,
    'chest'::text, 'title'::text
  ]));

ALTER TABLE public.shop_items DROP CONSTRAINT IF EXISTS shop_items_tier_check;
ALTER TABLE public.shop_items
  ADD CONSTRAINT shop_items_tier_check
  CHECK (tier = ANY (ARRAY[
    'cheap'::text, 'medium'::text, 'rare'::text, 'epic'::text, 'mythic'::text
  ]));

INSERT INTO public.shop_items (sku, name, description, category, tier, price_tokens, asset_key, is_active, sort_order)
VALUES
  ('chest_common', 'Cofre Común', 'Cosméticos básicos aleatorios', 'chest', 'cheap', 250, 'chest/common', true, 10),
  ('chest_rare', 'Cofre Raro', 'Chance de marco raro', 'chest', 'medium', 1200, 'chest/rare', true, 20),
  ('chest_epic', 'Cofre Épico', 'Chance de banner épico', 'chest', 'rare', 5000, 'chest/epic', true, 30),
  ('chest_legendary', 'Cofre Legendario', 'Brillo legendario garantizado', 'chest', 'epic', 18000, 'chest/legendary', true, 40),
  ('chest_mythic', 'Cofre Mítico', 'Solo para ballenas del casino', 'chest', 'mythic', 75000, 'chest/mythic', true, 50),
  ('title_rey_casino', 'Rey del Casino', 'Título exclusivo casino', 'title', 'epic', 25000, 'title/rey_casino', true, 60),
  ('title_campeon_supremo', 'Campeón Supremo', 'Solo campeones de liga', 'title', 'mythic', 100000, 'title/campeon_supremo', true, 70),
  ('frame_casino_neon', 'Marco Neón Casino', 'Glow de mesa VIP', 'frame', 'epic', 15000, 'frame/casino_neon', true, 55),
  ('banner_weekend_party', 'Banner Fiesta', 'Oferta de fin de semana', 'banner', 'rare', 8000, 'banner/weekend_party', true, 45)
ON CONFLICT (sku) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  tier = EXCLUDED.tier,
  price_tokens = EXCLUDED.price_tokens,
  asset_key = EXCLUDED.asset_key,
  is_active = true;

UPDATE public.shop_items SET tier = 'mythic' WHERE sku IN ('crown_legend','frame_hof','banner_founder') AND tier IS DISTINCT FROM 'mythic';
UPDATE public.shop_items SET tier = 'epic' WHERE sku IN ('badge_season_limited','frame_unique_fire','title_rey_casino') AND tier IS DISTINCT FROM 'epic';
