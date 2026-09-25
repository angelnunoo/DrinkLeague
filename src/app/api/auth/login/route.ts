import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { getSupabasePublicConfig } from "@/lib/supabase/config";
import { friendlyAuthError, normalizeLoginToEmail } from "@/lib/errors";

type Body = { login?: string; password?: string; next?: string };

/**
 * Login endpoint that sets auth cookies on the HTTP response.
 * Works reliably on Netlify (Server Actions often drop Set-Cookie there).
 */
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
  const next = String(body.next ?? "/app");

  if (!loginRaw) return NextResponse.json({ error: "Introduce tu identificador." }, { status: 400 });
  if (!password) return NextResponse.json({ error: "Introduce tu contraseña." }, { status: 400 });

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

  const { data: resolved, error: resolveErr } = await supabase.rpc("resolve_login_email", {
    p_login: loginRaw,
  });
  if (resolveErr) {
    return NextResponse.json({ error: friendlyAuthError(resolveErr.message) }, { status: 400 });
  }

  const email = String(resolved ?? normalizeLoginToEmail(loginRaw));
  if (!email) {
    return NextResponse.json({ error: "No se encontró esa cuenta." }, { status: 404 });
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    return NextResponse.json({ error: friendlyAuthError(error.message) }, { status: 401 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    await supabase
      .from("users")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", user.id);
  }

  const res = NextResponse.json({
    ok: true,
    next: next.startsWith("/") ? next : "/app",
  });

  for (const c of cookieJar) {
    res.cookies.set(c.name, c.value, authCookieOptions(c.options, { https }));
  }

  return res;
}
