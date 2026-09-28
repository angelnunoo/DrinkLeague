import { redirect } from "next/navigation";

export default async function BetsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const q = new URLSearchParams();
  q.set("tab", "apuestas");
  for (const [k, v] of Object.entries(sp)) {
    if (v) q.set(k, v);
  }
  redirect(`/app/casino?${q.toString()}`);
}
