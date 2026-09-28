/** Re-throw Next.js redirect/notFound so client try/catch doesn't swallow navigation. */
export function rethrowNextNavigation(error: unknown): void {
  if (typeof error !== "object" || error === null) return;

  // Next.js redirect digest: "NEXT_REDIRECT;push;/path;303;"
  if ("digest" in error && typeof (error as { digest?: unknown }).digest === "string") {
    const digest = (error as { digest: string }).digest;
    if (
      digest === "NEXT_REDIRECT" ||
      digest.startsWith("NEXT_REDIRECT;") ||
      digest.startsWith("NEXT_NOT_FOUND")
    ) {
      throw error;
    }
  }

  // Fallback: some builds expose a message / name
  const name = "name" in error ? String((error as { name?: unknown }).name ?? "") : "";
  const message = "message" in error ? String((error as { message?: unknown }).message ?? "") : "";
  if (
    name === "RedirectError" ||
    message.includes("NEXT_REDIRECT") ||
    message.includes("NEXT_NOT_FOUND")
  ) {
    throw error;
  }
}

export function getRedirectHref(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  if (!("digest" in error) || typeof (error as { digest?: unknown }).digest !== "string") {
    return null;
  }
  const digest = (error as { digest: string }).digest;
  if (!digest.startsWith("NEXT_REDIRECT")) return null;
  const parts = digest.split(";");
  // NEXT_REDIRECT;type;href;status;...
  if (parts.length >= 3 && parts[2]) return parts[2];
  return null;
}
