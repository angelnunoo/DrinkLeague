import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Legacy /friend/[code] → stable /friend/add?code= */
export default async function LegacyFriendCodeRedirect({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const clean = String(code ?? "").trim().toUpperCase();
  if (!clean) redirect("/app/social");
  redirect(`/friend/add?code=${encodeURIComponent(clean)}`);
}
