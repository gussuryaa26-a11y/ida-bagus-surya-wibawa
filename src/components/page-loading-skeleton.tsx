import clsx from "clsx";

type LoadingVariant = "default" | "dashboard" | "grid" | "list" | "form";

function Bar({ className }: { className?: string }) {
  return <div className={clsx("rounded-md bg-line/70 motion-safe:animate-pulse", className)} />;
}

function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={clsx("rounded-card border border-line bg-surface p-5", className)}>
      <Bar className="h-3 w-24" />
      <Bar className="mt-4 h-5 w-2/3" />
      <div className="mt-5 space-y-2.5">
        {Array.from({ length: lines }).map((_, index) => (
          <Bar key={index} className={clsx("h-3", index === lines - 1 ? "w-3/4" : "w-full")} />
        ))}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center gap-4 border-b border-line px-5 py-4 last:border-0">
      <Bar className="h-10 w-10 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-2">
        <Bar className="h-3.5 w-1/3" />
        <Bar className="h-3 w-2/3" />
      </div>
      <Bar className="h-7 w-20 shrink-0" />
    </div>
  );
}

/**
 * Kerangka halaman saat server component sedang dimuat. Ini membuat transisi
 * menu langsung memberi umpan balik, bukan layar diam menunggu database.
 */
export function PageLoadingSkeleton({ variant = "default" }: { variant?: LoadingVariant }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="space-y-6">
      <span className="sr-only">Memuat halaman…</span>

      <div className="space-y-3">
        <Bar className="h-3 w-28" />
        <Bar className="h-8 w-80 max-w-full" />
        <Bar className="h-4 w-full max-w-2xl" />
      </div>

      {variant === "dashboard" ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <SkeletonCard key={index} lines={2} />
            ))}
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <div className="space-y-6">
              <SkeletonCard lines={5} />
              <SkeletonCard lines={4} />
            </div>
            <div className="space-y-6">
              <SkeletonCard lines={4} />
              <SkeletonCard lines={3} />
            </div>
          </div>
        </>
      ) : variant === "grid" ? (
        <>
          <SkeletonCard lines={2} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonCard key={index} lines={4} />
            ))}
          </div>
        </>
      ) : variant === "list" ? (
        <>
          <SkeletonCard lines={2} />
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            <div className="border-b border-line px-5 py-4">
              <Bar className="h-4 w-40" />
            </div>
            {Array.from({ length: 5 }).map((_, index) => (
              <SkeletonRow key={index} />
            ))}
          </div>
        </>
      ) : variant === "form" ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <SkeletonCard lines={10} />
          <div className="space-y-6">
            <SkeletonCard lines={4} />
            <SkeletonCard lines={3} />
          </div>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={5} />
        </div>
      )}
    </div>
  );
}
