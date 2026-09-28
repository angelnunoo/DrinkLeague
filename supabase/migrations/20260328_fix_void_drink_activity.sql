-- Allow drink_voided activity events (was blocking void_drink_log)
ALTER TABLE public.activity_events
  DROP CONSTRAINT IF EXISTS activity_events_event_type_check;

ALTER TABLE public.activity_events
  ADD CONSTRAINT activity_events_event_type_check
  CHECK (event_type = ANY (ARRAY[
    'drink_logged'::text,
    'drink_voided'::text,
    'joined_league'::text,
    'achievement_unlocked'::text,
    'level_up'::text,
    'member_removed'::text,
    'season_started'::text
  ]));

-- Harden void_drink_log: never fail the whole void on optional side-effects
CREATE OR REPLACE FUNCTION public.void_drink_log(p_log_id uuid, p_as_admin boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_log public.drink_logs%rowtype;
  v_item record;
  v_eff record;
  v_admin boolean := public.is_global_admin();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_log from public.drink_logs where id = p_log_id for update;
  if v_log.id is null then raise exception 'Consumición no encontrada'; end if;
  if v_log.status <> 'active' then raise exception 'Esta consumición ya está anulada'; end if;

  if v_log.user_id <> v_uid and not (v_admin and coalesce(p_as_admin, false)) then
    raise exception 'Solo puedes eliminar tus consumiciones';
  end if;

  update public.drink_logs set status = 'deleted', updated_at = now() where id = p_log_id;

  update public.users
  set xp = greatest(0, xp - v_log.points_total),
      level = public.level_for_xp(greatest(0, xp - v_log.points_total))
  where id = v_log.user_id;

  update public.user_stats_global
  set total_points = greatest(0, total_points - v_log.points_total),
      total_logs = greatest(0, total_logs - 1),
      updated_at = now()
  where user_id = v_log.user_id;

  for v_item in
    select dli.quantity, dt.code
    from public.drink_log_items dli
    join public.drink_types dt on dt.id = dli.drink_type_id
    where dli.drink_log_id = p_log_id
  loop
    update public.user_stats_global
    set drink_counts = jsonb_set(
      coalesce(drink_counts, '{}'::jsonb),
      array[v_item.code],
      to_jsonb(greatest(0, coalesce((drink_counts ->> v_item.code)::int, 0) - v_item.quantity))
    ), updated_at = now()
    where user_id = v_log.user_id;
  end loop;

  for v_eff in
    select * from public.drink_log_league_effects where log_id = p_log_id
  loop
    update public.leaderboard_weekly
    set points = greatest(0, points - v_eff.points_applied),
        logs_count = greatest(0, logs_count - 1), updated_at = now()
    where league_id = v_eff.league_id and week_start_date = v_eff.week_start_date and user_id = v_log.user_id;

    update public.leaderboard_monthly
    set points = greatest(0, points - v_eff.points_applied),
        logs_count = greatest(0, logs_count - 1), updated_at = now()
    where league_id = v_eff.league_id and month_start_date = v_eff.month_start_date and user_id = v_log.user_id;

    update public.leaderboard_season
    set points = greatest(0, points - v_eff.points_applied),
        logs_count = greatest(0, logs_count - 1), updated_at = now()
    where league_id = v_eff.league_id and season_year = v_eff.season_year and user_id = v_log.user_id;

    update public.league_member_stats
    set total_points = greatest(0, total_points - v_eff.points_applied),
        total_logs = greatest(0, total_logs - 1)
    where league_id = v_eff.league_id and user_id = v_log.user_id;

    for v_item in
      select dli.quantity, dt.code
      from public.drink_log_items dli
      join public.drink_types dt on dt.id = dli.drink_type_id
      where dli.drink_log_id = p_log_id
    loop
      update public.league_member_stats
      set drink_counts = jsonb_set(
        coalesce(drink_counts, '{}'::jsonb),
        array[v_item.code],
        to_jsonb(greatest(0, coalesce((drink_counts ->> v_item.code)::int, 0) - v_item.quantity))
      )
      where league_id = v_eff.league_id and user_id = v_log.user_id;
    end loop;

    begin
      insert into public.activity_events (league_id, actor_user_id, event_type, payload)
      values (v_eff.league_id, v_uid, 'drink_voided',
        jsonb_build_object('log_id', p_log_id, 'points', v_eff.points_applied, 'owner', v_log.user_id));
    exception when others then
      null;
    end;
  end loop;

  begin
    perform public.credit_tokens(v_log.user_id, -greatest(1, v_log.points_total / 3), 'drink_void', 'drink_log', p_log_id);
  exception when others then
    null;
  end;
end;
$function$;

GRANT EXECUTE ON FUNCTION public.void_drink_log(uuid, boolean) TO authenticated;
