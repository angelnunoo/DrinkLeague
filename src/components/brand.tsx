import Image from "next/image";
import Link from "next/link";

export function BrandMark({ href = "/", size = "md" }: { href?: string; size?: "sm" | "md" | "lg" }) {
  const text = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl md:text-5xl",
  };
  const icon = {
    sm: 28,
    md: 36,
    lg: 52,
  };

  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2.5 font-display tracking-tight text-[var(--ink-strong)] ${text[size]}`}
    >
      <Image
        src="/icon-192.png"
        alt=""
        width={icon[size]}
        height={icon[size]}
        className="rounded-[22%] shadow-[0_0_0_1px_rgba(240,162,2,0.25)]"
        priority
      />
      <span>
        Drink<span className="text-[var(--amber)]">League</span>
      </span>
    </Link>
  );
}
