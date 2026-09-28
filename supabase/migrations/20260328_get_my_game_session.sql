CREATE OR REPLACE FUNCTION public.get_my_game_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_row public.game_sessions%rowtype;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM public.game_sessions
  WHERE id = p_session_id
    AND (
      created_by = v_me
      OR EXISTS (
        SELECT 1 FROM public.game_players gp
        WHERE gp.session_id = p_session_id AND gp.user_id = v_me
      )
      OR public.is_global_admin()
    );

  IF v_row.id IS NULL THEN
    RETURN NULL;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_game_session(uuid) TO authenticated;
