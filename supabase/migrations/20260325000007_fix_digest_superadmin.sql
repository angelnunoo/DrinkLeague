-- Synced fix: digest via extensions + superadmin allowlist
-- Applied remotely as fix_digest_superadmin_rls + superadmin_membership_bypass

-- See Supabase migration history for full SQL.
-- Key fixes:
-- 1. extensions.digest(convert_to(token,'UTF8'), 'sha256')
-- 2. role superadmin for angelnuunoo@gmail.com / angel.nuunoo@gmail.com
-- 3. is_league_member includes is_global_admin()
-- 4. create_league search_path = public, extensions
