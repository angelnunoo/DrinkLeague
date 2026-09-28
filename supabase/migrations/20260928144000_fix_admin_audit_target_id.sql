-- Fix admin_audit: cast text target_id to uuid for admin_audit_logs.target_id

CREATE OR REPLACE FUNCTION public.admin_audit(
  p_action text,
  p_target_type text,
  p_target_id text,
  p_target_user_id uuid,
  p_reason text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_tid uuid;
BEGIN
  IF NOT public.is_global_admin() THEN RAISE EXCEPTION 'Solo superadmin'; END IF;
  BEGIN
    v_tid := NULLIF(trim(p_target_id), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_tid := NULL;
  END;
  INSERT INTO public.admin_audit_logs (admin_user_id, action, target_type, target_id, target_user_id, reason, payload)
  VALUES (auth.uid(), p_action, p_target_type, v_tid, p_target_user_id, p_reason, coalesce(p_payload, '{}'::jsonb));
END;
$$;
