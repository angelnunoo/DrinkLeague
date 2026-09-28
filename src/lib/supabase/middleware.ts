import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authCookieOptions } from "@/lib/supabase/cookie-options";
import { getSupabasePublicConfig } from "@/lib/supabase/config";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const cfg = getSupabasePublicConfig();
  if (!cfg) {
    return supabaseResponse;
  }

  const https =
    request.nextUrl.protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https";

  const supabase = createServerClient(cfg.url, cfg.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, authCookieOptions(options, { https }));
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthRoute =
    path.startsWith("/login") ||
    path.startsWith("/register") ||
    path.startsWith("/forgot-password") ||
    path.startsWith("/auth");

  if (!user && path.startsWith("/app")) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    redirectUrl.searchParams.set("next", path);
    return NextResponse.redirect(redirectUrl);
  }

  if (user && (path === "/login" || path === "/register" || path === "/forgot-password")) {
    const next = request.nextUrl.searchParams.get("next");
    const redirectUrl = request.nextUrl.clone();
    const safeNext =
      next &&
      (next.startsWith("/app") ||
        next.startsWith("/friend/") ||
        next.startsWith("/friend?") ||
        next.startsWith("/join/"))
        ? next
        : "/app";
    // Prefer absolute path navigation
    if (safeNext.startsWith("http")) {
      redirectUrl.pathname = "/app";
      redirectUrl.search = "";
    } else {
      const [pathname, search = ""] = safeNext.split("?");
      redirectUrl.pathname = pathname || "/app";
      redirectUrl.search = search ? `?${search}` : "";
    }
    return NextResponse.redirect(redirectUrl);
  }

  void isAuthRoute;
  return supabaseResponse;
}
