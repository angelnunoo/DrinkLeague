import Link from "next/link";

export function BrandMark({ href = "/", size = "md" }: { href?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl md:text-5xl",
  };

  return (
    <Link href={href} className={`font-display tracking-tight text-[var(--ink-strong)] ${sizes[size]}`}>
      Drink<span className="text-[var(--amber)]">League</span>
    </Link>
  );
}
