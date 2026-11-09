"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { eventTypeLabel } from "@/lib/format";

export type NotificationView = {
  id: string;
  eventType: string;
  title: string;
  body: string;
  readAt: string | null;
  createdLabel: string;
  relatedEntityType: string | null;
  relatedEntityId: string | null;
};

export function NotificationsList({ notifications }: { notifications: NotificationView[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const unread = notifications.filter((item) => !item.readAt).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {unread > 0 ? `${unread} notifikasi belum dibaca.` : "Semua notifikasi sudah dibaca."}
        </p>
        <Button
          variant="secondary"
          size="sm"
          disabled={loading || unread === 0}
          onClick={async () => {
            setLoading(true);
            try {
              await fetch("/api/notifications", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({}),
              });
              router.refresh();
            } finally {
              setLoading(false);
            }
          }}
        >
          <CheckCheck className="h-4 w-4" aria-hidden="true" />
          Tandai semua dibaca
        </Button>
      </div>

      {notifications.length === 0 ? (
        <div className="card-surface px-6 py-12 text-center">
          <Bell className="mx-auto h-8 w-8 text-brand-600" aria-hidden="true" />
          <p className="mt-3 font-display text-lg font-semibold text-ink">Belum ada notifikasi</p>
          <p className="mt-1 text-sm text-muted">Peristiwa pengajuan, keputusan, dan memo akan muncul di sini.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {notifications.map((notification) => (
            <li
              key={notification.id}
              className={`rounded-card border p-4 ${
                notification.readAt ? "border-line bg-surface" : "border-brand-200 bg-brand-50"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={notification.readAt ? "neutral" : "brand"}>{eventTypeLabel(notification.eventType)}</Badge>
                  {!notification.readAt ? <span className="text-[0.68rem] font-bold uppercase tracking-wide text-brand-700">Baru</span> : null}
                </div>
                <span className="text-xs text-muted">{notification.createdLabel}</span>
              </div>
              <p className="mt-2 font-semibold text-ink">{notification.title}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{notification.body}</p>
              {notification.relatedEntityType === "booking_request" && notification.relatedEntityId ? (
                <a
                  href={`/bookings/${notification.relatedEntityId}`}
                  className="mt-2 inline-block text-sm font-semibold text-brand-700 hover:underline"
                >
                  Buka pengajuan
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
