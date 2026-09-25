-- Row Level Security policies

alter table public.users enable row level security;
alter table public.leagues enable row level security;
alter table public.league_memberships enable row level security;
alter table public.league_invites enable row level security;
alter table public.drink_types enable row level security;
alter table public.venues enable row level security;
alter table public.drink_logs enable row level security;
alter table public.drink_log_items enable row level security;
alter table public.leaderboard_weekly enable row level security;
alter table public.leaderboard_monthly enable row level security;
alter table public.leaderboard_season enable row level security;
alter table public.activity_events enable row level security;
alter table public.achievement_definitions enable row level security;
alter table public.user_achievements enable row level security;
alter table public.user_stats_global enable row level security;
alter table public.league_member_stats enable row level security;
alter table public.league_seasons enable row level security;
alter table public.admin_audit_logs enable row level security;

-- users
create policy users_select_self_or_league_peer on public.users
  for select to authenticated
  using (
    id = auth.uid()
    or public.is_global_admin()
    or exists (
      select 1
      from public.league_memberships me
      join public.league_memberships peer
        on peer.league_id = me.league_id
       and peer.status = 'active'
      where me.user_id = auth.uid()
        and me.status = 'active'
        and peer.user_id = users.id
    )
  );

create policy users_update_self on public.users
  for update to authenticated
  using (id = auth.uid() or public.is_global_admin())
  with check (
    (id = auth.uid() and role = (select u.role from public.users u where u.id = auth.uid()))
    or public.is_global_admin()
  );

-- leagues
create policy leagues_select_member on public.leagues
  for select to authenticated
  using (public.is_league_member(id) or public.is_global_admin() or created_by = auth.uid());

create policy leagues_update_admin on public.leagues
  for update to authenticated
  using (public.is_league_admin(id))
  with check (public.is_league_admin(id));

-- memberships
create policy memberships_select_peer on public.league_memberships
  for select to authenticated
  using (public.is_league_member(league_id) or user_id = auth.uid() or public.is_global_admin());

create policy memberships_update_admin on public.league_memberships
  for update to authenticated
  using (public.is_league_admin(league_id) or user_id = auth.uid())
  with check (public.is_league_admin(league_id) or user_id = auth.uid());

-- invites: members can read active invite metadata for sharing (code)
create policy invites_select_member on public.league_invites
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_global_admin());

create policy invites_insert_admin on public.league_invites
  for insert to authenticated
  with check (public.is_league_admin(league_id));

create policy invites_update_admin on public.league_invites
  for update to authenticated
  using (public.is_league_admin(league_id));

-- drink types & achievements: readable by all authenticated
create policy drink_types_select on public.drink_types
  for select to authenticated using (true);

create policy achievement_defs_select on public.achievement_definitions
  for select to authenticated using (true);

-- venues
create policy venues_select_authenticated on public.venues
  for select to authenticated using (true);

create policy venues_insert_authenticated on public.venues
  for insert to authenticated with check (auth.uid() is not null);

-- drink logs
create policy drink_logs_select_member on public.drink_logs
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_global_admin());

create policy drink_log_items_select_member on public.drink_log_items
  for select to authenticated
  using (
    exists (
      select 1 from public.drink_logs dl
      where dl.id = drink_log_id
        and (public.is_league_member(dl.league_id) or public.is_global_admin())
    )
  );

-- leaderboards
create policy lb_weekly_select on public.leaderboard_weekly
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_global_admin());

create policy lb_monthly_select on public.leaderboard_monthly
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_global_admin());

create policy lb_season_select on public.leaderboard_season
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_global_admin());

-- activity
create policy activity_select_member on public.activity_events
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_global_admin());

-- achievements unlocked
create policy user_achievements_select on public.user_achievements
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_global_admin()
    or (league_id is not null and public.is_league_member(league_id))
  );

-- stats
create policy user_stats_select on public.user_stats_global
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_global_admin()
    or exists (
      select 1
      from public.league_memberships me
      join public.league_memberships peer
        on peer.league_id = me.league_id and peer.status = 'active'
      where me.user_id = auth.uid() and me.status = 'active' and peer.user_id = user_stats_global.user_id
    )
  );

create policy league_member_stats_select on public.league_member_stats
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_global_admin());

create policy league_seasons_select on public.league_seasons
  for select to authenticated
  using (public.is_league_member(league_id) or public.is_global_admin());

-- admin audit
create policy admin_audit_select on public.admin_audit_logs
  for select to authenticated
  using (public.is_global_admin());

create policy admin_audit_insert on public.admin_audit_logs
  for insert to authenticated
  with check (public.is_global_admin() and admin_user_id = auth.uid());
