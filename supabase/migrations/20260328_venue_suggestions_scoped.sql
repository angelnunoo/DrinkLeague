-- Venue suggestions scoped to the user's leagues (no cross-league leakage)

CREATE OR REPLACE FUNCTION public.suggest_my_venues(p_limit int DEFAULT 24)
RETURNS TABLE (
  venue_id uuid,
  display_name text,
  use_count bigint,
  is_favorite boolean,
  last_used_at timestamptz,
  source text,
  relevance int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  RETURN QUERY
  WITH my_leagues AS (
    SELECT m.league_id
    FROM public.league_memberships m
    WHERE m.user_id = v_uid AND m.status = 'active'
  ),
  peer_users AS (
    SELECT DISTINCT m.user_id
    FROM public.league_memberships m
    WHERE m.status = 'active'
      AND m.league_id IN (SELECT league_id FROM my_leagues)
  ),
  own AS (
    SELECT
      uv.venue_id,
      v.display_name::text,
      uv.use_count::bigint,
      coalesce(uv.is_favorite, false) AS is_favorite,
      uv.last_used_at,
      CASE WHEN coalesce(uv.is_favorite, false) THEN 'favorite' ELSE 'mine' END AS source,
      CASE WHEN coalesce(uv.is_favorite, false) THEN 300 ELSE 200 END
        + least(uv.use_count, 50) AS relevance
    FROM public.user_venues uv
    JOIN public.venues v ON v.id = uv.venue_id
    WHERE uv.user_id = v_uid
  ),
  league_places AS (
    SELECT
      dl.venue_id,
      max(dl.venue_name_snapshot)::text AS display_name,
      count(*)::bigint AS use_count,
      false AS is_favorite,
      max(dl.consumed_at) AS last_used_at,
      'league'::text AS source,
      100 + least(count(*)::int, 40) AS relevance
    FROM public.drink_logs dl
    JOIN public.drink_log_league_effects e ON e.log_id = dl.id
    WHERE dl.status = 'active'
      AND dl.venue_id IS NOT NULL
      AND e.league_id IN (SELECT league_id FROM my_leagues)
      AND dl.user_id IN (SELECT user_id FROM peer_users)
      AND dl.user_id <> v_uid
    GROUP BY dl.venue_id
  ),
  combined AS (
    SELECT * FROM own
    UNION ALL
    SELECT lp.* FROM league_places lp
    WHERE NOT EXISTS (SELECT 1 FROM own o WHERE o.venue_id = lp.venue_id)
  )
  SELECT c.venue_id, c.display_name, c.use_count, c.is_favorite, c.last_used_at, c.source, c.relevance
  FROM combined c
  ORDER BY c.relevance DESC, c.last_used_at DESC NULLS LAST
  LIMIT greatest(1, least(coalesce(p_limit, 24), 50));
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_my_venues(int) TO authenticated;

-- Tighten user_venues select: never list other users' rows (even for admin UI use RPC)
DROP POLICY IF EXISTS user_venues_select ON public.user_venues;
CREATE POLICY user_venues_select ON public.user_venues
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
