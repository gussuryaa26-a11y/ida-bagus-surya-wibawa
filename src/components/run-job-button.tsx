"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export function RunJobButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div>
      <Button
        variant="secondary"
        size="sm"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setNotice(null);
          setError(null);
          try {
            const response = await fetch("/api/internal/jobs/deadlines", { method: "POST" });
            const payload = (await response.json()) as {
              error?: { message?: string };
              checked?: number;
              expired?: number;
              reminded?: number;
            };
            if (!response.ok) throw new Error(payload.error?.message ?? "Job gagal dijalankan.");
            setNotice(
              `Job selesai: ${payload.checked ?? 0} diperiksa, ${payload.expired ?? 0} kedaluwarsa, ${payload.reminded ?? 0} pengingat dikirim.`,
            );
            router.refresh();
          } catch (caught) {
            setError(caught instanceof Error ? caught.message : "Job gagal dijalankan.");
          } finally {
            setLoading(false);
          }
        }}
      >
        <Play className="h-4 w-4" aria-hidden="true" />
        {loading ? "Menjalankan…" : "Jalankan job tenggat"}
      </Button>
      {notice ? <p className="mt-1 text-xs text-success-700">{notice}</p> : null}
      {error ? <p className="mt-1 text-xs text-danger-700">{error}</p> : null}
    </div>
  );
}
