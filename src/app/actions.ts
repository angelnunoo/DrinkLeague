"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DrinkItemInput } from "@/lib/types";
import { friendlyAuthError, friendlyLeagueError, normalizeLoginToEmail } from "@/lib/errors";

export type ActionResult = { error?: string; success?: boolean; message?: string };

export async function signUp(formData: FormData): Promise<ActionResult> {
  const loginRaw = String(formData.get("email") ?? formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim() || loginRaw;

  if (!loginRaw) {
    return { error: "Introduce un identificador (cualquier texto)." };
  }
  if (loginRaw.length > 80) {
    return { error: "Identificador demasiado largo (máx. 80)." };
  }
  if (!password || password.length < 4) {
    return { error: "La contraseña debe tener al menos 4 caracteres." };
  }

  const supabase = await createClient();

  const { data: reg, error: regErr } = await supabase.rpc("register_account", {
    p_login: loginRaw,
    p_password: password,
    p_display_name: displayName.slice(0, 40) || loginRaw.slice(0, 40),
  });

  if (regErr) return { error: friendlyAuthError(regErr.message) };

  const emailFromReg =
    reg && typeof reg === "object" && "email" in reg
      ? String((reg as { email: string }).email)
      : "";

  let email = emailFromReg;
  if (!email) {
    const { data: resolved } = await supabase.rpc("resolve_login_email", {
      p_login: loginRaw,
    });
    email = String(resolved ?? "");
  }

  if (!email) {
    return {
      success: true,
      message: "Cuenta creada. Entra con el mismo identificador y contraseña.",
    };
  }

  const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
  if (signErr) {
    return {
      success: true,
      message: "Cuenta creada. Entra con el mismo identificador y contraseña.",
    };
  }

  redirect("/app");
}

export async function signIn(formData: FormData): Promise<ActionResult> {
  const loginRaw = String(formData.get("email") ?? formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!loginRaw) return { error: "Introduce tu identificador." };
  if (!password) return { error: "Introduce tu contraseña." };

  const supabase = await createClient();

  const { data: resolved, error: resolveErr } = await supabase.rpc("resolve_login_email", {
    p_login: loginRaw,
  });
  if (resolveErr) return { error: friendlyAuthError(resolveErr.message) };

  const email = String(resolved ?? normalizeLoginToEmail(loginRaw));
  if (!email) return { error: "No se encontró esa cuenta." };

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: friendlyAuthError(error.message) };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  const next = String(formData.get("next") ?? "/app");
  redirect(next.startsWith("/") ? next : "/app");
}

export async function requestPasswordReset(formData: FormData): Promise<ActionResult> {
  const loginRaw = String(formData.get("email") ?? "").trim();
  const email = normalizeLoginToEmail(loginRaw);
  if (!email) {
    return { error: "Introduce tu usuario o email." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback?next=/app/profile`,
  });

  if (error) return { error: friendlyAuthError(error.message) };
  return {
    success: true,
    message: "Si la cuenta existe, te hemos enviado un enlace (solo aplica a emails reales).",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function createLeagueAction(formData: FormData): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const timezone = String(formData.get("timezone") ?? "Europe/Madrid");

  if (name.length < 2) return { error: "El nombre de la liga es obligatorio." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_league", {
    p_name: name,
    p_description: description || null,
    p_timezone: timezone,
  });

  if (error) return { error: friendlyLeagueError(error.message) };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.league_id) return { error: "No se pudo crear la liga." };

  redirect(`/app/leagues/${row.league_id}?created=1`);
}

export async function joinByCodeAction(formData: FormData): Promise<ActionResult> {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Introduce un código." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_league_by_code", {
    p_code: code,
  });

  if (error) return { error: friendlyLeagueError(error.message) };
  redirect(`/app/leagues/${data}`);
}

export async function joinByTokenAction(token: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_league_by_token", {
    p_token: token,
  });

  if (error) return { error: friendlyLeagueError(error.message) };
  redirect(`/app/leagues/${data}`);
}

export async function logDrinksAction(formData: FormData): Promise<ActionResult> {
  const venue = String(formData.get("venue") ?? "").trim();
  const rawItems = String(formData.get("items") ?? "[]");

  let items: DrinkItemInput[] = [];
  try {
    items = JSON.parse(rawItems) as DrinkItemInput[];
  } catch {
    return { error: "Datos de bebidas inválidos." };
  }

  items = items.filter((i) => i.quantity > 0);
  if (!venue || items.length === 0) {
    return { error: "Local y al menos una bebida son obligatorios." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("log_drinks_global", {
    p_venue_name: venue,
    p_items: items,
  });

  if (error) return { error: friendlyLeagueError(error.message) };

  // Refresh rivalries, streaks, objectives, medals (best effort)
  void Promise.resolve(supabase.rpc("refresh_legacy_hub", { p_league_id: null })).catch(
    () => undefined,
  );

  return { success: true, message: "Consumición registrada." };
}

export async function updateProfileAction(formData: FormData): Promise<ActionResult> {
  const displayName = String(formData.get("display_name") ?? "").trim();
  if (displayName.length < 1) return { error: "El nombre no puede estar vacío." };

  // Full birthday: prefer day/month/year fields (avoids day>9 bugs on some inputs)
  const dayRaw = String(formData.get("birth_day") ?? "").trim();
  const monthRaw = String(formData.get("birth_month") ?? "").trim();
  const yearRaw = String(formData.get("birth_year") ?? "").trim();
  const birthRaw = String(formData.get("birth_date") ?? "").trim();

  let birthDate: string | null = null;
  if (dayRaw && monthRaw && yearRaw) {
    const day = Number(dayRaw);
    const month = Number(monthRaw);
    const year = Number(yearRaw);
    if (
      !Number.isFinite(day) ||
      !Number.isFinite(month) ||
      !Number.isFinite(year) ||
      day < 1 ||
      day > 31 ||
      month < 1 ||
      month > 12 ||
      year < 1900 ||
      year > new Date().getFullYear()
    ) {
      return { error: "Fecha de nacimiento no válida." };
    }
    // Zero-pad so days 10–31 are never truncated
    birthDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    // Validate real calendar date (e.g. reject 31/02)
    const probe = new Date(`${birthDate}T12:00:00`);
    if (
      Number.isNaN(probe.getTime()) ||
      probe.getFullYear() !== year ||
      probe.getMonth() + 1 !== month ||
      probe.getDate() !== day
    ) {
      return { error: "Esa fecha no existe en el calendario." };
    }
  } else if (birthRaw) {
    // Fallback ISO from type=date
    birthDate = birthRaw.slice(0, 10);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { error } = await supabase
    .from("users")
    .update({
      display_name: displayName.slice(0, 40),
      ...(birthDate ? { birth_date: birthDate } : {}),
    })
    .eq("id", user.id);

  if (error) return { error: friendlyLeagueError(error.message) };

  if (birthDate) {
    const { error: bdErr } = await supabase.rpc("update_birth_date", { p_date: birthDate });
    if (bdErr) return { error: friendlyLeagueError(bdErr.message) };
  }

  return { success: true, message: "Perfil actualizado." };
}

export async function purchaseShopItemAction(itemId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("purchase_shop_item", { p_item_id: itemId });
  if (error) redirect(`/app/shop?error=${encodeURIComponent(error.message)}`);
  redirect("/app/shop?bought=1");
}

export async function equipShopItemAction(itemId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("equip_shop_item", { p_item_id: itemId });
  if (error) redirect(`/app/shop?error=${encodeURIComponent(error.message)}`);
  redirect("/app/shop?equipped=1");
}

export async function placeBetAction(formData: FormData): Promise<ActionResult> {
  const selectionId = String(formData.get("selection_id") ?? "");
  const stake = Number(formData.get("stake") ?? 0);
  if (!selectionId) return { error: "Selección no válida." };
  if (stake < 10) return { error: "Apuesta mínima 10 fichas." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("place_bet", {
    p_selection_id: selectionId,
    p_stake: stake,
  });
  if (error) return { error: friendlyLeagueError(error.message) || error.message };

  if (user) {
    await supabase.rpc("notify_user", {
      p_user_id: user.id,
      p_category: "bets",
      p_title: "🎰 Apuesta colocada",
      p_body: `Has apostado ${stake} fichas. Te avisaremos del resultado.`,
      p_href: "/app/bets",
      p_payload: { stake, selection_id: selectionId },
    });
  }

  redirect("/app/bets?placed=1");
}

export async function ensureWeeklyMarketAction(leagueId: string): Promise<void> {
  const supabase = await createClient();
  // Prefer full auto catalog (10–20 markets); fall back to weekly champion
  const { error } = await supabase.rpc("ensure_league_bet_markets", {
    p_league_id: leagueId,
  });
  if (error) {
    const { error: fallback } = await supabase.rpc("ensure_weekly_champion_market", {
      p_league_id: leagueId,
    });
    if (fallback) {
      redirect(`/app/bets?league=${leagueId}&error=${encodeURIComponent(fallback.message)}`);
    }
  }
  redirect(`/app/bets?league=${leagueId}`);
}

export async function createSuperBoostAction(selectionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_super_boost", {
    p_selection_id: selectionId,
    p_hours: 2,
  });
  if (error) redirect(`/app/bets?error=${encodeURIComponent(error.message)}`);

  // Notify league members about new SuperAumento
  const { data: sel } = await supabase
    .from("bet_selections")
    .select("label, market_id, bet_markets(league_id, title)")
    .eq("id", selectionId)
    .maybeSingle();
  const market = sel?.bet_markets as unknown as { league_id: string; title: string } | null;
  if (market?.league_id) {
    const { data: members } = await supabase
      .from("league_memberships")
      .select("user_id")
      .eq("league_id", market.league_id)
      .eq("status", "active");
    for (const m of members ?? []) {
      await supabase.rpc("notify_user", {
        p_user_id: m.user_id,
        p_category: "boost",
        p_title: "🔥 Nuevo SuperAumento disponible",
        p_body: `${sel?.label ?? "Selección"} · ${market.title}`,
        p_href: `/app/bets?league=${market.league_id}`,
        p_payload: { selection_id: selectionId },
      });
    }
  }

  redirect("/app/bets?boost=1");
}

export async function claimBirthdayAction(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.rpc("claim_birthday_bonus");
  if (error) redirect(`/app/calendar?error=${encodeURIComponent(error.message)}`);
  if (user) {
    await supabase.rpc("notify_user", {
      p_user_id: user.id,
      p_category: "birthday",
      p_title: "🎂 Bonus de cumpleaños reclamado",
      p_body: "Has obtenido tu recompensa de cumpleaños.",
      p_href: "/app/calendar",
      p_payload: {},
    });
  }
  redirect("/app/calendar?birthday=1");
}

export async function startGameAction(formData: FormData): Promise<ActionResult> {
  const gameType = String(formData.get("game_type") ?? "");
  const opponent = String(formData.get("opponent_code") ?? "").trim() || null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("start_game", {
    p_game_type: gameType,
    p_opponent_code: opponent,
    p_party_id: null,
  });
  if (error) return { error: friendlyLeagueError(error.message) || error.message };
  redirect(`/app/games/${data}`);
}

export async function playDueloAction(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("play_duelo_round", { p_session_id: sessionId });
  if (error) redirect(`/app/games/${sessionId}?error=${encodeURIComponent(error.message)}`);
  redirect(`/app/games/${sessionId}`);
}

export async function drawReyAction(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("draw_rey_card", { p_session_id: sessionId });
  if (error) redirect(`/app/games/${sessionId}?error=${encodeURIComponent(error.message)}`);
  redirect(`/app/games/${sessionId}`);
}

export async function playPeajeAction(sessionId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("play_peaje_spin", { p_session_id: sessionId });
  if (error) redirect(`/app/games/${sessionId}?error=${encodeURIComponent(error.message)}`);
  redirect(`/app/games/${sessionId}`);
}

export async function sendFriendRequestAction(formData: FormData): Promise<ActionResult> {
  const code = String(formData.get("friend_code") ?? "").trim();
  if (code.length < 6) return { error: "Introduce un código de amigo válido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("send_friend_request", { p_friend_code: code });
  if (error) return { error: friendlyLeagueError(error.message) || error.message };
  return { success: true, message: "Solicitud enviada." };
}

export async function respondFriendRequestAction(
  requestId: string,
  accept: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_friend_request", {
    p_request_id: requestId,
    p_accept: accept,
  });
  if (error) return { error: friendlyLeagueError(error.message) || error.message };
  redirect("/app/social");
}

export async function createChallengeAction(formData: FormData): Promise<ActionResult> {
  const mode = String(formData.get("mode") ?? "1v1");
  const codesRaw = String(formData.get("opponent_codes") ?? "");
  const duration = Number(formData.get("duration_hours") ?? 24);
  const stake = Number(formData.get("stake_points") ?? 0);
  const leagueId = String(formData.get("league_id") ?? "").trim() || null;

  const codes = codesRaw
    .split(/[,\s]+/)
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  if (!codes.length) return { error: "Indica al menos un código de amigo rival." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_challenge", {
    p_mode: mode,
    p_opponent_codes: codes,
    p_duration_hours: duration,
    p_stake_points: stake,
    p_league_id: leagueId,
  });

  if (error) return { error: friendlyLeagueError(error.message) || error.message };
  redirect(`/app/challenges?created=1&id=${data}`);
}

export async function acceptChallengeAction(challengeId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_challenge", { p_challenge_id: challengeId });
  if (error) return { error: friendlyLeagueError(error.message) || error.message };
  redirect("/app/challenges");
}

export async function declineChallengeAction(challengeId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_challenge", { p_challenge_id: challengeId });
  if (error) return { error: friendlyLeagueError(error.message) || error.message };
  redirect("/app/challenges");
}

export async function settleChallengeAction(challengeId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_challenge", { p_challenge_id: challengeId });
  if (error) return { error: friendlyLeagueError(error.message) || error.message };
  redirect("/app/challenges?settled=1");
}

export async function declareWarAction(formData: FormData): Promise<ActionResult> {
  const myLeagueId = String(formData.get("my_league_id") ?? "").trim();
  const opponentCode = String(formData.get("opponent_league_code") ?? "").trim();

  if (!myLeagueId) return { error: "Elige tu liga." };
  if (!opponentCode) return { error: "Introduce el código de invitación de la liga rival." };

  const supabase = await createClient();
  const { data: found, error: findErr } = await supabase.rpc("find_league_by_invite_code", {
    p_code: opponentCode,
  });
  if (findErr) return { error: friendlyLeagueError(findErr.message) || findErr.message };

  const row = Array.isArray(found) ? found[0] : found;
  if (!row?.league_id) return { error: "No se encontró una liga con ese código." };
  if (row.league_id === myLeagueId) return { error: "No puedes declararte la guerra a ti mismo." };

  const { error } = await supabase.rpc("declare_league_war", {
    p_my_league_id: myLeagueId,
    p_opponent_league_id: row.league_id,
  });
  if (error) return { error: friendlyLeagueError(error.message) || error.message };
  redirect("/app/wars?declared=1");
}

export async function settleWarAction(warId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("settle_league_war", { p_war_id: warId });
  if (error) return { error: friendlyLeagueError(error.message) || error.message };
  redirect("/app/wars?settled=1");
}

export async function equipTitleAction(code: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("equip_title", { p_code: code });
  if (error) redirect(`/app/profile?error=${encodeURIComponent(error.message)}`);
  redirect("/app/profile?title=1");
}

export async function setTrophyShowcaseAction(slot: number, trophyId: string | null): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_trophy_showcase", {
    p_slot: slot,
    p_trophy_id: trophyId,
  });
  if (error) redirect(`/app/profile?error=${encodeURIComponent(error.message)}`);
  redirect("/app/profile?showcase=1");
}

export async function claimBattlePassAction(level: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("claim_battle_pass_level", { p_level: level });
  if (error) redirect(`/app/battle-pass?error=${encodeURIComponent(error.message)}`);
  redirect(`/app/battle-pass?claimed=${level}`);
}

export async function generateWrappedAction(formData?: FormData): Promise<void> {
  const supabase = await createClient();
  const yearFromForm = formData ? Number(formData.get("year") ?? 0) : 0;
  const year = yearFromForm > 2000 ? yearFromForm : new Date().getFullYear() - 1;
  const { error } = await supabase.rpc("generate_drink_wrapped", { p_year: year });
  if (error) redirect(`/app/stats?error=${encodeURIComponent(error.message)}&year=${year}#wrapped`);
  redirect(`/app/stats?ok=1&year=${year}#wrapped`);
}

export async function refreshPersonalitiesAction(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("refresh_personalities", { p_user_id: null });
  if (error) redirect(`/app/profile?error=${encodeURIComponent(error.message)}`);
  redirect("/app/profile?persona=1");
}

export async function generateDigestAction(leagueId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_league_digest", { p_league_id: leagueId });
  if (error) redirect(`/app/leagues/${leagueId}?error=${encodeURIComponent(error.message)}`);
  redirect(`/app/leagues/${leagueId}?digest=1`);
}

export async function awardMvpsAction(leagueId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("award_weekly_mvps", { p_league_id: leagueId });
  if (error) redirect(`/app/leagues/${leagueId}?error=${encodeURIComponent(error.message)}`);
  redirect(`/app/leagues/${leagueId}?mvp=1`);
}

export async function detectNightAction(leagueId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("detect_historic_night", {
    p_league_id: leagueId,
    p_date: null,
  });
  if (error) redirect(`/app/records?error=${encodeURIComponent(error.message)}`);
  redirect(`/app/records?night=1&league=${leagueId}`);
}

export async function adminAdjustTokensAction(formData: FormData): Promise<void> {
  const userId = String(formData.get("user_id") ?? "");
  const delta = Number(formData.get("delta") ?? 0);
  const reason = String(formData.get("reason") ?? "admin");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_adjust_tokens", {
    p_user_id: userId,
    p_delta: delta,
    p_reason: reason,
  });
  if (error) redirect(`/app/admin?error=${encodeURIComponent(error.message)}`);
  redirect("/app/admin?ok=tokens");
}

export async function adminAdjustXpAction(formData: FormData): Promise<void> {
  const userId = String(formData.get("user_id") ?? "");
  const delta = Number(formData.get("delta") ?? 0);
  const reason = String(formData.get("reason") ?? "admin");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_adjust_xp", {
    p_user_id: userId,
    p_delta: delta,
    p_reason: reason,
  });
  if (error) redirect(`/app/admin?error=${encodeURIComponent(error.message)}`);
  redirect("/app/admin?ok=xp");
}

export async function adminSetStatusAction(formData: FormData): Promise<void> {
  const userId = String(formData.get("user_id") ?? "");
  const status = String(formData.get("status") ?? "active");
  const reason = String(formData.get("reason") ?? "admin");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_set_user_status", {
    p_user_id: userId,
    p_status: status,
    p_reason: reason,
  });
  if (error) redirect(`/app/admin?error=${encodeURIComponent(error.message)}`);
  redirect("/app/admin?ok=status");
}

export async function adminGiftItemAction(formData: FormData): Promise<void> {
  const userId = String(formData.get("user_id") ?? "");
  const itemId = String(formData.get("item_id") ?? "");
  const reason = String(formData.get("reason") ?? "gift");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_gift_item", {
    p_user_id: userId,
    p_item_id: itemId,
    p_reason: reason,
  });
  if (error) redirect(`/app/admin?error=${encodeURIComponent(error.message)}`);
  redirect("/app/admin?ok=gift");
}

export async function adminGrantTitleAction(formData: FormData): Promise<void> {
  const userId = String(formData.get("user_id") ?? "");
  const code = String(formData.get("title_code") ?? "");
  const reason = String(formData.get("reason") ?? "grant");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_grant_title", {
    p_user_id: userId,
    p_code: code,
    p_reason: reason,
  });
  if (error) redirect(`/app/admin?error=${encodeURIComponent(error.message)}`);
  redirect("/app/admin?ok=title");
}

export async function adminGrantTrophyAction(formData: FormData): Promise<void> {
  const userId = String(formData.get("user_id") ?? "");
  const code = String(formData.get("trophy_code") ?? "");
  const reason = String(formData.get("reason") ?? "grant");
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_grant_trophy", {
    p_user_id: userId,
    p_code: code,
    p_reason: reason,
  });
  if (error) redirect(`/app/admin?error=${encodeURIComponent(error.message)}`);
  redirect("/app/admin?ok=trophy");
}

export async function adminUpsertShopAction(formData: FormData): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("admin_upsert_shop_item", {
    p_sku: String(formData.get("sku") ?? ""),
    p_name: String(formData.get("name") ?? ""),
    p_category: String(formData.get("category") ?? "frame"),
    p_price: Number(formData.get("price") ?? 100),
    p_tier: String(formData.get("tier") ?? "common"),
    p_description: String(formData.get("description") ?? "") || null,
  });
  if (error) redirect(`/app/admin?error=${encodeURIComponent(error.message)}`);
  redirect("/app/admin?ok=shop");
}

export async function adminDecayChemistryAction(): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("apply_chemistry_decay");
  if (error) redirect(`/app/admin?error=${encodeURIComponent(error.message)}`);
  redirect("/app/admin?ok=decay");
}

export async function refreshLegacyHubAction(leagueId?: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("refresh_legacy_hub", {
    p_league_id: leagueId || null,
  });
  if (error) redirect(`/app?error=${encodeURIComponent(error.message)}`);
  redirect("/app?legacy=1");
}

export async function claimPrestigeAction(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_prestige");
  if (error) return { error: friendlyLeagueError(error.message) };
  return {
    success: true,
    message: `Prestigio ${String((data as { prestige?: number })?.prestige ?? "")} alcanzado.`,
  };
}

export async function archiveSeasonAction(leagueId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_season_album", {
    p_league_id: leagueId,
    p_season_year: null,
  });
  if (error) redirect(`/app/album?error=${encodeURIComponent(error.message)}`);
  redirect("/app/album?ok=1");
}

export async function refreshPredictionsAction(leagueId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("refresh_ai_predictions", { p_league_id: leagueId });
  if (error) redirect(`/app/leagues/${leagueId}?error=${encodeURIComponent(error.message)}`);
  redirect(`/app/leagues/${leagueId}?pred=1`);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read", { p_ids: null });
  redirect("/app/activity");
}

export async function markNotificationsReadAction(ids: string[] | null): Promise<void> {
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read", { p_ids: ids });
  redirect("/app/activity");
}

export async function updateNotificationPrefsAction(
  prefs: Record<string, boolean>,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_notification_prefs", { p_prefs: prefs });
  if (error) return { error: friendlyLeagueError(error.message) };
  return { success: true, message: "Preferencias guardadas." };
}
