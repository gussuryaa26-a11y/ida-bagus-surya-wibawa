"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function MemoRetryButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        disabled={loading}
        onClick={async () => {
          setError(null);
          setLoading(true);
          try {
            const response = await fetch(`/api/bookings/${bookingId}/internal-memo`, { method: "POST" });
            const payload = (await response.json()) as { error?: { message?: string } };
            if (!response.ok) throw new Error(payload.error?.message ?? "Pembuatan memo gagal.");
            router.refresh();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Pembuatan memo gagal.");
          } finally {
            setLoading(false);
          }
        }}
      >
        {loading ? "Mencoba ulang…" : "Coba buat ulang memo"}
      </Button>
      {error ? <p className="mt-1 text-xs text-danger-700">{error}</p> : null}
    </div>
  );
}
