-- RPC: create league + membership + invite in one transaction

create or replace function public.create_league(
  p_name text,
  p_description text default null,
  p_timezone text default 'Europe/Madrid'
)
returns table (
  league_id uuid,
  invite_code text,
  invite_token text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_league_id uuid;
  v_code text;
  v_token text;
  v_token_hash bytea;
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

  insert into public.leagues (name, description, created_by, timezone)
  values (left(trim(p_name), 60), nullif(left(trim(coalesce(p_description, '')), 280), ''), v_user_id, coalesce(nullif(p_timezone, ''), 'Europe/Madrid'))
  returning id into v_league_id;

  insert into public.league_memberships (league_id, user_id, role, status)
  values (v_league_id, v_user_id, 'league_admin', 'active');

  insert into public.league_member_stats (league_id, user_id)
  values (v_league_id, v_user_id);

  -- 8-char alphanumeric code
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  v_token_hash := digest(v_token, 'sha256');

  insert into public.league_invites (league_id, code, token_hash, created_by)
  values (v_league_id, v_code, v_token_hash, v_user_id);

  return query select v_league_id, v_code, v_token;
end;
$$;

create or replace function public.join_league_by_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.league_invites%rowtype;
  v_league_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_invite
  from public.league_invites i
  where i.is_active
    and upper(i.code) = upper(trim(p_code))
    and (i.expires_at is null or i.expires_at > now())
  limit 1;

  if v_invite.id is null then
    raise exception 'Invalid or expired invite code';
  end if;

  v_league_id := v_invite.league_id;

  if not exists (
    select 1 from public.leagues l
    where l.id = v_league_id and l.status = 'active'
  ) then
    raise exception 'League is not active';
  end if;

  insert into public.league_memberships (league_id, user_id, role, status)
  values (v_league_id, v_user_id, 'member', 'active')
  on conflict (league_id, user_id) do update
    set status = 'active',
        left_at = null,
        role = case
          when public.league_memberships.role = 'league_admin' then 'league_admin'
          else 'member'
        end;

  insert into public.league_member_stats (league_id, user_id)
  values (v_league_id, v_user_id)
  on conflict do nothing;

  insert into public.activity_events (league_id, actor_user_id, event_type, payload)
  values (
    v_league_id,
    v_user_id,
    'joined_league',
    jsonb_build_object('via', 'code')
  );

  return v_league_id;
end;
$$;

create or replace function public.join_league_by_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite public.league_invites%rowtype;
  v_league_id uuid;
  v_hash bytea;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  v_hash := digest(p_token, 'sha256');

  select * into v_invite
  from public.league_invites i
  where i.is_active
    and i.token_hash = v_hash
    and (i.expires_at is null or i.expires_at > now())
  limit 1;

  if v_invite.id is null then
    raise exception 'Invalid or expired invite link';
  end if;

  v_league_id := v_invite.league_id;

  if not exists (
    select 1 from public.leagues l
    where l.id = v_league_id and l.status = 'active'
  ) then
    raise exception 'League is not active';
  end if;

  insert into public.league_memberships (league_id, user_id, role, status)
  values (v_league_id, v_user_id, 'member', 'active')
  on conflict (league_id, user_id) do update
    set status = 'active',
        left_at = null,
        role = case
          when public.league_memberships.role = 'league_admin' then 'league_admin'
          else 'member'
        end;

  insert into public.league_member_stats (league_id, user_id)
  values (v_league_id, v_user_id)
  on conflict do nothing;

  insert into public.activity_events (league_id, actor_user_id, event_type, payload)
  values (
    v_league_id,
    v_user_id,
    'joined_league',
    jsonb_build_object('via', 'link')
  );

  return v_league_id;
end;
$$;

-- Need pgcrypto digest
create extension if not exists "pgcrypto";

grant execute on function public.create_league(text, text, text) to authenticated;
grant execute on function public.join_league_by_code(text) to authenticated;
grant execute on function public.join_league_by_token(text) to authenticated;
