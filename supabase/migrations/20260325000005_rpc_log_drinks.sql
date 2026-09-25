-- Log drinks with aggregate updates (MVP: consumed_at = now)

create or replace function public.log_drinks(
  p_league_id uuid,
  p_venue_name text,
  p_items jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tz text;
  v_now timestamptz := now();
  v_venue_id uuid;
  v_norm citext;
  v_display text;
  v_points int := 0;
  v_log_id uuid;
  v_season int;
  v_week date;
  v_month date;
  v_item jsonb;
  v_type public.drink_types%rowtype;
  v_qty int;
  v_old_level int;
  v_new_level int;
  v_old_xp bigint;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_venue_name is null or length(trim(p_venue_name)) < 1 then
    raise exception 'Venue is required';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one drink item is required';
  end if;

  if not public.is_league_member(p_league_id) then
    raise exception 'Not a league member';
  end if;

  select l.timezone into v_tz
  from public.leagues l
  where l.id = p_league_id and l.status = 'active';

  if v_tz is null then
    raise exception 'League not found or inactive';
  end if;

  v_display := left(trim(p_venue_name), 80);
  v_norm := lower(v_display);

  insert into public.venues (normalized_name, display_name, created_by)
  values (v_norm, v_display, v_user_id)
  on conflict (normalized_name) do update
    set display_name = excluded.display_name
  returning id into v_venue_id;

  if v_venue_id is null then
    select id into v_venue_id from public.venues where normalized_name = v_norm;
  end if;

  -- validate items & sum points
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_type
    from public.drink_types dt
    where dt.code = (v_item ->> 'code')
      and dt.is_active;

    if v_type.id is null then
      raise exception 'Unknown drink type: %', v_item ->> 'code';
    end if;

    v_qty := (v_item ->> 'quantity')::int;
    if v_qty is null or v_qty < 1 or v_qty > 50 then
      raise exception 'Invalid quantity for %', v_type.code;
    end if;

    v_points := v_points + (v_qty * v_type.points);
  end loop;

  if v_points <= 0 then
    raise exception 'Points must be positive';
  end if;

  v_season := public.season_year_for(v_now, v_tz);
  v_week := public.week_start_for(v_now, v_tz);
  v_month := public.month_start_for(v_now, v_tz);

  insert into public.drink_logs (
    league_id, user_id, venue_id, venue_name_snapshot,
    consumed_at, points_total, season_year, week_start_date, month_start_date,
    edited_until
  ) values (
    p_league_id, v_user_id, v_venue_id, v_display,
    v_now, v_points, v_season, v_week, v_month,
    v_now + interval '15 minutes'
  ) returning id into v_log_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    select * into v_type from public.drink_types dt where dt.code = (v_item ->> 'code');
    v_qty := (v_item ->> 'quantity')::int;

    insert into public.drink_log_items (drink_log_id, drink_type_id, quantity, unit_points)
    values (v_log_id, v_type.id, v_qty, v_type.points);
  end loop;

  insert into public.leaderboard_weekly (league_id, week_start_date, user_id, points, logs_count)
  values (p_league_id, v_week, v_user_id, v_points, 1)
  on conflict (league_id, week_start_date, user_id) do update
    set points = public.leaderboard_weekly.points + excluded.points,
        logs_count = public.leaderboard_weekly.logs_count + 1,
        updated_at = now();

  insert into public.leaderboard_monthly (league_id, month_start_date, user_id, points, logs_count)
  values (p_league_id, v_month, v_user_id, v_points, 1)
  on conflict (league_id, month_start_date, user_id) do update
    set points = public.leaderboard_monthly.points + excluded.points,
        logs_count = public.leaderboard_monthly.logs_count + 1,
        updated_at = now();

  insert into public.leaderboard_season (league_id, season_year, user_id, points, logs_count)
  values (p_league_id, v_season, v_user_id, v_points, 1)
  on conflict (league_id, season_year, user_id) do update
    set points = public.leaderboard_season.points + excluded.points,
        logs_count = public.leaderboard_season.logs_count + 1,
        updated_at = now();

  insert into public.league_member_stats (league_id, user_id, total_points, total_logs, last_log_at)
  values (p_league_id, v_user_id, v_points, 1, v_now)
  on conflict (league_id, user_id) do update
    set total_points = public.league_member_stats.total_points + excluded.total_points,
        total_logs = public.league_member_stats.total_logs + 1,
        last_log_at = excluded.last_log_at;

  select xp, level into v_old_xp, v_old_level from public.users where id = v_user_id;

  update public.users
  set xp = xp + v_points,
      level = public.level_for_xp(xp + v_points)
  where id = v_user_id
  returning level into v_new_level;

  update public.user_stats_global
  set total_points = total_points + v_points,
      total_logs = total_logs + 1,
      updated_at = now()
  where user_id = v_user_id;

  -- merge drink_counts
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    update public.user_stats_global
    set drink_counts = jsonb_set(
      drink_counts,
      array[v_item ->> 'code'],
      to_jsonb(coalesce((drink_counts ->> (v_item ->> 'code'))::int, 0) + (v_item ->> 'quantity')::int)
    ),
    updated_at = now()
    where user_id = v_user_id;

    update public.league_member_stats
    set drink_counts = jsonb_set(
      drink_counts,
      array[v_item ->> 'code'],
      to_jsonb(coalesce((drink_counts ->> (v_item ->> 'code'))::int, 0) + (v_item ->> 'quantity')::int)
    )
    where league_id = p_league_id and user_id = v_user_id;
  end loop;

  insert into public.activity_events (league_id, actor_user_id, event_type, payload)
  values (
    p_league_id,
    v_user_id,
    'drink_logged',
    jsonb_build_object(
      'log_id', v_log_id,
      'points', v_points,
      'venue', v_display,
      'items', p_items
    )
  );

  if v_new_level > v_old_level then
    insert into public.activity_events (league_id, actor_user_id, event_type, payload)
    values (
      p_league_id,
      v_user_id,
      'level_up',
      jsonb_build_object('from', v_old_level, 'to', v_new_level)
    );
  end if;

  -- first_sip achievement (idempotent)
  if not exists (
    select 1 from public.user_achievements ua
    where ua.user_id = v_user_id
      and ua.achievement_code = 'first_sip'
      and ua.league_id is null
  ) then
    insert into public.user_achievements (user_id, achievement_code)
    values (v_user_id, 'first_sip');

    insert into public.activity_events (league_id, actor_user_id, event_type, payload)
    values (
      p_league_id,
      v_user_id,
      'achievement_unlocked',
      jsonb_build_object('code', 'first_sip')
    );
  end if;

  return v_log_id;
end;
$$;

grant execute on function public.log_drinks(uuid, text, jsonb) to authenticated;
