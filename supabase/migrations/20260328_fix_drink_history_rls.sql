-- Own drink logs must be visible even when league_id is null (global logging)
DROP POLICY IF EXISTS drink_logs_select_member ON public.drink_logs;
CREATE POLICY drink_logs_select_member ON public.drink_logs
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_league_member(league_id)
    OR public.is_global_admin()
  );

DROP POLICY IF EXISTS drink_log_items_select_member ON public.drink_log_items;
CREATE POLICY drink_log_items_select_member ON public.drink_log_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.drink_logs dl
      WHERE dl.id = drink_log_items.drink_log_id
        AND (
          dl.user_id = auth.uid()
          OR public.is_league_member(dl.league_id)
          OR public.is_global_admin()
        )
    )
  );

CREATE OR REPLACE FUNCTION public.list_my_drink_logs(p_limit int DEFAULT 80)
RETURNS TABLE (
  id uuid,
  venue_name text,
  consumed_at timestamptz,
  points_total int,
  status text,
  items jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_lim int := greatest(1, least(coalesce(p_limit, 80), 200));
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  SELECT
    dl.id,
    coalesce(nullif(trim(dl.venue_name_snapshot), ''), 'Sin lugar')::text AS venue_name,
    dl.consumed_at,
    dl.points_total,
    dl.status,
    coalesce((
      SELECT jsonb_agg(
        jsonb_build_object(
          'quantity', dli.quantity,
          'unit_points', dli.unit_points,
          'code', dt.code,
          'name', dt.name
        )
        ORDER BY dt.name
      )
      FROM public.drink_log_items dli
      JOIN public.drink_types dt ON dt.id = dli.drink_type_id
      WHERE dli.drink_log_id = dl.id
    ), '[]'::jsonb) AS items
  FROM public.drink_logs dl
  WHERE dl.user_id = v_uid
    AND dl.status = 'active'
  ORDER BY dl.consumed_at DESC
  LIMIT v_lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_drink_logs(int) TO authenticated;
