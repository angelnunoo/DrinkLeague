import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand";
import { AcceptFriendInviteButton } from "@/components/accept-friend-invite-button";

export const dynamic = "force-dynamic";

export default async function FriendAddPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const sp = await searchParams;
  const code = String(sp.code ?? "").trim().toUpperCase();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!code) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
        <BrandMark href="/" size="md" />
        <h1 className="mt-10 font-display text-3xl">Falta el código</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Pide a tu amigo que te reenvíe el enlace de DrinkLeague.
        </p>
        <Link href="/app/social" className="btn-primary mt-6 text-center">
          Ir a Social
        </Link>
      </main>
    );
  }

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/friend/add?code=${code}`)}`);
  }

  const { data: target } = await supabase
    .from("users")
    .select("id, display_name, friend_code, level")
    .eq("friend_code", code)
    .maybeSingle();

  if (!target) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
        <BrandMark href="/" size="md" />
        <h1 className="mt-10 font-display text-3xl">Código no válido</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          No encontramos a nadie con el código {code}.
        </p>
        <Link href="/app/social" className="btn-primary mt-6 text-center">
          Ir a Social
        </Link>
      </main>
    );
  }

  if (target.id === user.id) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
        <BrandMark href="/app" size="md" />
        <h1 className="mt-10 font-display text-3xl">Ese es tu código</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Compártelo por WhatsApp para que te envíen solicitud.
        </p>
        <Link href="/app/social" className="btn-primary mt-6 text-center">
          Volver a Social
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <BrandMark href="/app" size="md" />
      <h1 className="mt-10 font-display text-3xl">Solicitud de amistad</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        ¿Quieres añadir a{" "}
        <span className="font-semibold text-[var(--ink)]">{target.display_name}</span> (Nv.{" "}
        {target.level})?
      </p>
      <p className="mt-1 text-xs tracking-[0.2em] text-[var(--amber)]">{target.friend_code}</p>

      <div className="mt-8 space-y-3">
        <AcceptFriendInviteButton friendCode={code} />
        <Link href="/app/social" className="btn-ghost block text-center">
          Cancelar
        </Link>
      </div>
    </main>
  );
}
