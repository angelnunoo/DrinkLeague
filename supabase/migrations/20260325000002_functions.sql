-- Domain helpers: season, week boundaries, level curve, admin bootstrap

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

create trigger leagues_set_updated_at
  before update on public.leagues
  for each row execute function public.set_updated_at();

create trigger drink_logs_set_updated_at
  before update on public.drink_logs
  for each row execute function public.set_updated_at();

-- Season year: starts Jan 2 00:00 in league TZ; boundary belongs to new season
create or replace function public.season_year_for(ts timestamptz, tz text)
returns int
language sql
immutable
as $$
  select case
    when (ts at time zone tz)::date >= make_date(extract(year from (ts at time zone tz))::int, 1, 2)
      then extract(year from (ts at time zone tz))::int
    else extract(year from (ts at time zone tz))::int - 1
  end;
$$;

-- Monday of the week containing ts, in league timezone (ISO week: Mon-Sun)
create or replace function public.week_start_for(ts timestamptz, tz text)
returns date
language sql
immutable
as $$
  select (
    date_trunc('week', (ts at time zone tz))::date
  );
$$;

create or replace function public.month_start_for(ts timestamptz, tz text)
returns date
language sql
immutable
as $$
  select date_trunc('month', (ts at time zone tz))::date;
$$;

-- XP thresholds: level 1=0 … 10=1800; then floor(1800 * 1.25^(n-10))
create or replace function public.level_for_xp(p_xp bigint)
returns int
language plpgsql
immutable
as $$
declare
  thresholds bigint[] := array[0, 50, 120, 220, 350, 520, 740, 1000, 1350, 1800];
  i int;
  lvl int := 10;
  need_next bigint;
begin
  if p_xp is null or p_xp < 0 then
    return 1;
  end if;

  if p_xp < 1800 then
    for i in reverse 1..10 loop
      if p_xp >= thresholds[i] then
        return i;
      end if;
    end loop;
    return 1;
  end if;

  loop
    need_next := floor(1800 * power(1.25, ((lvl + 1) - 10)::numeric));
    if p_xp < need_next then
      return lvl;
    end if;
    lvl := lvl + 1;
    if lvl >= 100 then
      return 100;
    end if;
  end loop;
end;
$$;

create or replace function public.is_global_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users u
    where u.id = auth.uid()
      and u.role = 'global_admin'
      and u.status = 'active'
  );
$$;

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.league_memberships m
    where m.league_id = p_league_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.is_league_admin(p_league_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.league_memberships m
    where m.league_id = p_league_id
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = 'league_admin'
  )
  or public.is_global_admin();
$$;

-- Auto-create public.users + stats on auth signup
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
  v_role text := 'user';
begin
  v_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
    split_part(new.email, '@', 1)
  );

  if lower(new.email) = 'angel.nuunoo@gmail.com' then
    v_role := 'global_admin';
  end if;

  insert into public.users (id, email, display_name, role)
  values (new.id, new.email, left(v_name, 40), v_role);

  insert into public.user_stats_global (user_id)
  values (new.id);

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Keep admin role locked to allowlist email
create or replace function public.enforce_admin_allowlist()
returns trigger
language plpgsql
as $$
begin
  if lower(new.email) = 'angel.nuunoo@gmail.com' then
    new.role := 'global_admin';
  elsif new.role = 'global_admin' then
    new.role := 'user';
  end if;
  return new;
end;
$$;

create trigger users_enforce_admin_allowlist
  before insert or update on public.users
  for each row execute function public.enforce_admin_allowlist();
