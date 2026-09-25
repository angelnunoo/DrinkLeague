import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { joinByCodeAction } from "@/app/actions";

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

  const fd = new FormData();
  fd.set("code", code);
  const result = await joinByCodeAction(fd);
  if (result?.error) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
        <h1 className="font-display text-3xl">No se pudo unir</h1>
        <p className="mt-3 text-[var(--danger)]">{result.error}</p>
        <a href="/app/join" className="btn-primary mt-6 w-fit">
          Probar con código
        </a>
      </main>
    );
  }

  return null;
}
