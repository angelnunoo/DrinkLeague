-- Allow friends to see each other's public profile fields and global stats

DROP POLICY IF EXISTS users_select_self_or_league_peer ON public.users;
CREATE POLICY users_select_self_or_league_peer ON public.users
FOR SELECT
USING (
  id = auth.uid()
  OR is_global_admin()
  OR EXISTS (
    SELECT 1
    FROM public.league_memberships me
    JOIN public.league_memberships peer
      ON peer.league_id = me.league_id
     AND peer.status = 'active'
    WHERE me.user_id = auth.uid()
      AND me.status = 'active'
      AND peer.user_id = users.id
  )
  OR EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE (f.user_a = auth.uid() AND f.user_b = users.id)
       OR (f.user_b = auth.uid() AND f.user_a = users.id)
  )
);

DROP POLICY IF EXISTS user_stats_select ON public.user_stats_global;
CREATE POLICY user_stats_select ON public.user_stats_global
FOR SELECT
USING (
  user_id = auth.uid()
  OR is_global_admin()
  OR EXISTS (
    SELECT 1
    FROM public.league_memberships me
    JOIN public.league_memberships peer
      ON peer.league_id = me.league_id
     AND peer.status = 'active'
    WHERE me.user_id = auth.uid()
      AND me.status = 'active'
      AND peer.user_id = user_stats_global.user_id
  )
  OR EXISTS (
    SELECT 1
    FROM public.friendships f
    WHERE (f.user_a = auth.uid() AND f.user_b = user_stats_global.user_id)
       OR (f.user_b = auth.uid() AND f.user_a = user_stats_global.user_id)
  )
);
