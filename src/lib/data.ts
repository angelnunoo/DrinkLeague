import { createClient } from "@/lib/supabase/server";
import type { LeagueWithMembership, Profile } from "@/lib/types";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("users")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return data as Profile | null;
}

export async function getMyLeagues(): Promise<LeagueWithMembership[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: memberships } = await supabase
    .from("league_memberships")
    .select("role, league_id, leagues(*)")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (!memberships) return [];

  return memberships
    .map((m) => {
      const league = m.leagues as unknown as LeagueWithMembership | null;
      if (!league) return null;
      return {
        ...league,
        membership_role: m.role as LeagueWithMembership["membership_role"],
      };
    })
    .filter(Boolean) as LeagueWithMembership[];
}
