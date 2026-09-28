import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const dynamicParams = true;

/** Legacy URL /app/games/[id] → stable /app/games/play?id= */
export default async function LegacyGameSessionRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clean = String(id ?? "").trim();
  if (!clean || !/^[0-9a-f-]{36}$/i.test(clean)) {
    redirect("/app/games");
  }
  redirect(`/app/games/play?id=${encodeURIComponent(clean)}`);
}
