-- Smart notifications v2: seasons/records prefs, milestones, persona, scan + settle hooks
-- Applied remotely via Supabase MCP; kept in-repo for reproducibility.

-- Prefs columns (idempotent)
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS seasons boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS records boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS persona text NOT NULL DEFAULT 'balanced';

CREATE TABLE IF NOT EXISTS public.notification_milestones (
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  milestone_key text NOT NULL,
  milestone_value text NOT NULL,
  notified_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, milestone_key)
);

ALTER TABLE public.notification_milestones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_milestones_select ON public.notification_milestones;
CREATE POLICY notification_milestones_select ON public.notification_milestones
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Core helpers (notify_user, update_notification_prefs, try_milestone,
-- refresh_user_persona, scan_smart_notifications, settle_bet_market,
-- award_weekly_mvps / settle_challenge notify patches) live in the remote DB.
-- Re-apply via MCP or paste from production function definitions if needed.
