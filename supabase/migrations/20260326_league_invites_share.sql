-- Ensure / rotate league invite codes for WhatsApp share links

CREATE OR REPLACE FUNCTION public.ensure_league_invite(p_league_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_token text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_league_member(p_league_id) then
    raise exception 'No eres miembro de esta liga';
  end if;

  select code into v_code from public.league_invites
  where league_id = p_league_id and is_active = true
    and (expires_at is null or expires_at > now())
  order by created_at desc limit 1;

  if v_code is not null then return v_code; end if;

  if not public.is_league_admin(p_league_id) then
    raise exception 'Solo el capitán puede crear la invitación';
  end if;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.league_invites (league_id, code, token_hash, created_by, is_active)
  values (p_league_id, v_code, digest(v_token, 'sha256'), v_uid, true);

  return v_code;
end;
$function$;

CREATE OR REPLACE FUNCTION public.rotate_league_invite(p_league_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_token text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not public.is_league_admin(p_league_id) then
    raise exception 'Solo el capitán puede regenerar el enlace';
  end if;

  update public.league_invites
  set is_active = false, rotated_at = now()
  where league_id = p_league_id and is_active = true;

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.league_invites (league_id, code, token_hash, created_by, is_active)
  values (p_league_id, v_code, digest(v_token, 'sha256'), v_uid, true);

  return v_code;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.ensure_league_invite(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rotate_league_invite(uuid) TO authenticated;
