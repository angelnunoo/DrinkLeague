-- Allow SECURITY DEFINER RPCs (credit_tokens, claim, etc.) to update privileged users columns.
-- Only lock privilege escalation on direct PostgREST client updates.

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
