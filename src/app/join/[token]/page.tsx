import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { joinByCodeAction } from "@/app/actions";
import { BrandMark } from "@/components/brand";

export default async function JoinLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token: code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/join/${code}`)}`);
  }

  // Preview league name if possible
  const { data: invite } = await supabase
    .from("league_invites")
    .select("code, leagues(name)")
    .eq("is_active", true)
    .eq("code", code.toUpperCase())
    .maybeSingle();

  const leagueName =
    (invite?.leagues as unknown as { name?: string } | null)?.name ?? "una liga privada";

  const fd = new FormData();
  fd.set("code", code);
  const result = await joinByCodeAction(fd);
  if (result?.error) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
        <BrandMark href="/" size="md" />
        <h1 className="mt-10 font-display text-3xl">No se pudo unir</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">Invitación a {leagueName}</p>
        <p className="mt-3 text-[var(--danger)]">{result.error}</p>
        <div className="mt-6 flex flex-col gap-3">
          <Link href="/app/join" className="btn-primary text-center">
            Probar con código
          </Link>
          <Link href="/app/leagues" className="btn-ghost text-center">
            Mis ligas
          </Link>
        </div>
      </main>
    );
  }

  return null;
}
