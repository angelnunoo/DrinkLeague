/** Re-throw Next.js redirect/notFound so client try/catch doesn't swallow navigation. */
export function rethrowNextNavigation(error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest?: unknown }).digest === "string"
  ) {
    const digest = (error as { digest: string }).digest;
    if (digest.startsWith("NEXT_REDIRECT") || digest.startsWith("NEXT_NOT_FOUND")) {
      throw error;
    }
  }
}
