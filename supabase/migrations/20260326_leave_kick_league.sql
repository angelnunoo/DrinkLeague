-- Leave league + kick member (superadmin angelnuunoo can kick anyone from any league)

CREATE OR REPLACE FUNCTION public.is_global_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.users u
    where u.id = auth.uid()
      and u.status = 'active'
      and (
        u.role in ('superadmin', 'global_admin')
        or lower(u.email) in ('angelnuunoo@gmail.com', 'angel.nuunoo@gmail.com')
      )
  );
$function$;

CREATE OR REPLACE FUNCTION public.leave_league(p_league_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_role text;
  v_new_admin uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select role into v_role from public.league_memberships
  where league_id = p_league_id and user_id = v_uid and status = 'active';
  if v_role is null then raise exception 'No perteneces a esta liga'; end if;

  update public.league_memberships
  set status = 'left', left_at = now(), role = 'member'
  where league_id = p_league_id and user_id = v_uid and status = 'active';

  if v_role = 'league_admin' then
    if not exists (
      select 1 from public.league_memberships
      where league_id = p_league_id and status = 'active' and role = 'league_admin'
    ) then
      select user_id into v_new_admin from public.league_memberships
      where league_id = p_league_id and status = 'active'
      order by joined_at asc limit 1;
      if v_new_admin is not null then
        update public.league_memberships
        set role = 'league_admin'
        where league_id = p_league_id and user_id = v_new_admin;
      end if;
    end if;
  end if;

  begin
    insert into public.activity_events (league_id, actor_user_id, event_type, payload)
    values (p_league_id, v_uid, 'member_left', jsonb_build_object('user_id', v_uid));
  exception when others then
    null;
  end;
end;
$function$;

CREATE OR REPLACE FUNCTION public.kick_league_member(p_league_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_target_role text;
  v_new_admin uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_user_id is null then raise exception 'Usuario no válido'; end if;
  if p_user_id = v_uid then raise exception 'Usa Abandonar liga para salirte tú'; end if;

  if not public.is_league_admin(p_league_id) and not public.is_global_admin() then
    raise exception 'No tienes permiso para expulsar';
  end if;

  select role into v_target_role from public.league_memberships
  where league_id = p_league_id and user_id = p_user_id and status = 'active';
  if v_target_role is null then raise exception 'Ese usuario no está en la liga'; end if;

  if v_target_role = 'league_admin' and not public.is_global_admin() then
    raise exception 'Solo el superadmin puede expulsar al capitán';
  end if;

  update public.league_memberships
  set status = 'removed', left_at = now(), role = 'member'
  where league_id = p_league_id and user_id = p_user_id and status = 'active';

  if v_target_role = 'league_admin' then
    if not exists (
      select 1 from public.league_memberships
      where league_id = p_league_id and status = 'active' and role = 'league_admin'
    ) then
      select user_id into v_new_admin from public.league_memberships
      where league_id = p_league_id and status = 'active'
      order by joined_at asc limit 1;
      if v_new_admin is not null then
        update public.league_memberships
        set role = 'league_admin'
        where league_id = p_league_id and user_id = v_new_admin;
      end if;
    end if;
  end if;

  begin
    insert into public.activity_events (league_id, actor_user_id, event_type, payload)
    values (p_league_id, v_uid, 'member_removed',
      jsonb_build_object('user_id', p_user_id, 'by', v_uid));
  exception when others then null;
  end;

  perform public.notify_user(p_user_id, 'events',
    'Has sido expulsado de una liga.',
    'Un administrador te ha sacado de la liga.',
    '/app/leagues',
    jsonb_build_object('league_id', p_league_id));
end;
$function$;

GRANT EXECUTE ON FUNCTION public.leave_league(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kick_league_member(uuid, uuid) TO authenticated;

UPDATE public.users
SET role = 'superadmin', status = 'active'
WHERE lower(email) in ('angelnuunoo@gmail.com', 'angel.nuunoo@gmail.com');
