-- Explicitly allow many leagues per creator; only block duplicate names
CREATE OR REPLACE FUNCTION public.create_league(
  p_name text,
  p_description text DEFAULT NULL::text,
  p_timezone text DEFAULT 'Europe/Madrid'::text
)
RETURNS TABLE(league_id uuid, invite_code text, invite_token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_league_id uuid;
  v_code text;
  v_token text;
  v_token_hash bytea;
  v_dup int;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.users u
    where u.id = v_user_id and u.status = 'active'
  ) then
    raise exception 'User not active';
  end if;

  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'League name too short';
  end if;

  select count(*) into v_dup
  from public.leagues l
  where l.created_by = v_user_id
    and lower(l.name) = lower(trim(p_name))
    and l.status = 'active';
  if v_dup > 0 then
    raise exception 'Ya tienes una liga activa llamada "%". Elige otro nombre.', trim(p_name);
  end if;

  insert into public.leagues (name, description, created_by, timezone)
  values (
    left(trim(p_name), 60),
    nullif(left(trim(coalesce(p_description, '')), 280), ''),
    v_user_id,
    coalesce(nullif(p_timezone, ''), 'Europe/Madrid')
  )
  returning id into v_league_id;

  insert into public.league_memberships (league_id, user_id, role, status)
  values (v_league_id, v_user_id, 'league_admin', 'active');

  insert into public.league_member_stats (league_id, user_id)
  values (v_league_id, v_user_id);

  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_token_hash := extensions.digest(convert_to(v_token, 'UTF8'), 'sha256');

  insert into public.league_invites (league_id, code, token_hash, created_by)
  values (v_league_id, v_code, v_token_hash, v_user_id);

  insert into public.activity_events (league_id, actor_user_id, event_type, payload)
  values (
    v_league_id,
    v_user_id,
    'season_started',
    jsonb_build_object('message', 'Liga creada', 'invite_code', v_code)
  );

  begin
    perform public.ensure_league_divisions(v_league_id);
  exception when undefined_function then null; when others then null;
  end;
  begin
    perform public.ensure_league_bet_markets(v_league_id);
  exception when undefined_function then null; when others then null;
  end;

  return query select v_league_id, v_code, v_token;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.create_league(text, text, text) TO authenticated;
