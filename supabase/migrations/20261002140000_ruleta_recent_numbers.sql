-- Last N roulette results for casino table history strip

CREATE OR REPLACE FUNCTION public.get_ruleta_recent_results(p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO off
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_lim int;
BEGIN
  IF v_me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  v_lim := greatest(1, least(coalesce(p_limit, 10), 20));

  RETURN coalesce((
    WITH recent AS (
      SELECT gs.state, gs.finished_at, gs.created_at
      FROM public.game_sessions gs
      WHERE gs.game_type = 'ruleta_casino'
        AND gs.status = 'finished'
        AND gs.state ? 'number'
      ORDER BY coalesce(gs.finished_at, gs.created_at) DESC
      LIMIT v_lim
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'number', (r.state->>'number')::int,
        'color', r.state->>'color',
        'at', coalesce(r.finished_at, r.created_at)
      )
      ORDER BY coalesce(r.finished_at, r.created_at) ASC
    )
    FROM recent r
  ), '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_ruleta_recent_results(int) TO authenticated;
