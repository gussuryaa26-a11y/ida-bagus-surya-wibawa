import Image from "next/image";
import Link from "next/link";

export function Logo({ href = "/", compact = false }: { href?: string; compact?: boolean }) {
  return (
    <Link href={href} className="flex items-center gap-3" aria-label="SIMPAR IDB Bali — beranda">
      <Image
        src="/brand/idb-mark-crop.png"
        alt="Marka IDB Bali"
        width={compact ? 38 : 48}
        height={compact ? 44 : 55}
        className="h-auto w-auto object-contain"
        priority
      />
      <span className="flex flex-col leading-tight">
        <span className="font-display text-[1.05rem] font-bold tracking-tight text-ink">SIMPAR</span>
        <span className="text-[0.64rem] font-semibold uppercase tracking-[0.14em] text-muted">
          IDB Bali
        </span>
      </span>
    </Link>
  );
}
