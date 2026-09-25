import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { friendlyAuthError } from "@/lib/errors";

type Body = { login?: string; password?: string; display_name?: string };

/** Register + auto sign-in with cookies on the response (Netlify-safe). */
export async function POST(request: Request) {
  const cfg = getSupabasePublicConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: "Supabase no configurado en este entorno." },
      { status: 500 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const loginRaw = String(body.login ?? "").trim();
  const password = String(body.password ?? "");
  const displayName = String(body.display_name ?? "").trim() || loginRaw;

  if (!loginRaw) {
    return NextResponse.json({ error: "Introduce un identificador (cualquier texto)." }, { status: 400 });
  }
  if (loginRaw.length > 80) {
    return NextResponse.json({ error: "Identificador demasiado largo (máx. 80)." }, { status: 400 });
  }
  if (!password || password.length < 4) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 4 caracteres." }, { status: 400 });
  }

  const https =
    request.headers.get("x-forwarded-proto") === "https" ||
    new URL(request.url).protocol === "https:";

  const cookieJar: Array<{ name: string; value: string; options: Parameters<typeof authCookieOptions>[0] }> =
    [];

  const supabase = createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll() {
        const header = request.headers.get("cookie") ?? "";
        if (!header) return [];
        return header.split(";").map((part) => {
          const [name, ...rest] = part.trim().split("=");
          return { name, value: rest.join("=") };
        });
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieJar.push({ name, value, options });
        });
      },
    },
  });

  const { data: reg, error: regErr } = await supabase.rpc("register_account", {
    p_login: loginRaw,
    p_password: password,
    p_display_name: displayName.slice(0, 40) || loginRaw.slice(0, 40),
  });

  if (regErr) {
    return NextResponse.json({ error: friendlyAuthError(regErr.message) }, { status: 400 });
  }

  const emailFromReg =
    reg && typeof reg === "object" && "email" in reg ? String((reg as { email: string }).email) : "";

  let email = emailFromReg;
  if (!email) {
    const { data: resolved } = await supabase.rpc("resolve_login_email", { p_login: loginRaw });
    email = String(resolved ?? "");
  }

  if (email) {
    const { error: signErr } = await supabase.auth.signInWithPassword({ email, password });
    if (signErr) {
      return NextResponse.json({
        ok: true,
        needsLogin: true,
        message: "Cuenta creada. Entra con el mismo identificador y contraseña.",
      });
    }
  } else {
    return NextResponse.json({
      ok: true,
      needsLogin: true,
      message: "Cuenta creada. Entra con el mismo identificador y contraseña.",
    });
  }

  const res = NextResponse.json({ ok: true, next: "/app" });
  for (const c of cookieJar) {
    res.cookies.set(c.name, c.value, authCookieOptions(c.options, { https }));
  }
  return res;
}
