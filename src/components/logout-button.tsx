"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function LogoutButton({ compact = false }: { compact?: boolean }) {
  const [loading, setLoading] = useState(false);
  return (
    <Button
      variant="ghost"
      size="sm"
      className={compact ? "px-2" : "w-full justify-start"}
      aria-label="Keluar dari SIMPAR"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await fetch("/api/auth/logout", { method: "POST" });
        } finally {
          window.location.href = "/login";
        }
      }}
    >
      <LogOut className="h-4 w-4" aria-hidden="true" />
      {compact ? null : <span>{loading ? "Keluar…" : "Keluar"}</span>}
    </Button>
  );
}
