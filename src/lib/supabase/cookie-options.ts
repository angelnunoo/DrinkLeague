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
  const protoRaw = headers.get("x-forwarded-proto") ?? headers.get("x-forwarded-protocol");
  const hostRaw = headers.get("x-forwarded-host") ?? headers.get("host");
  const proto = (protoRaw ?? (process.env.NODE_ENV === "production" ? "https" : "http"))
    .split(",")[0]
    .trim();
  const host = hostRaw?.split(",")[0]?.trim();
  if (host) return `${proto}://${host}`;

  const env = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  return env || "http://localhost:3000";
}
