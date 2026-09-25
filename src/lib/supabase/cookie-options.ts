type CookieOpts = {
  path?: string;
  domain?: string;
  maxAge?: number;
  expires?: Date;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: boolean | "lax" | "strict" | "none";
};

/** Cookie options that work on Netlify (HTTPS) and local (HTTP). */
export function authCookieOptions(
  options: CookieOpts | undefined,
  opts?: { https?: boolean },
): CookieOpts {
  const https =
    opts?.https ??
    (process.env.NODE_ENV === "production" ||
      (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("https://"));

  return {
    ...options,
    path: "/",
    sameSite: "lax",
    secure: https ? true : Boolean(options?.secure),
    maxAge: options?.maxAge ?? 60 * 60 * 24 * 400,
  };
}

export function appOriginFromHeaders(headers: Headers): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (env && !env.includes("localhost")) return env;

  const proto = headers.get("x-forwarded-proto") ?? "https";
  const host = headers.get("x-forwarded-host") ?? headers.get("host");
  if (host) return `${proto}://${host}`;
  return env ?? "http://localhost:3000";
}
