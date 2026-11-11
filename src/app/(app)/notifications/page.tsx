import { requireUser } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { NotificationsList, type NotificationView } from "@/components/notifications-list";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Notifikasi" };

export default async function NotificationsPage() {
  const user = await requireUser();
  const [settings, notifications] = await Promise.all([getSettings(), listNotifications(user.id)]);
  return (
    <>
      <PageHeader
        eyebrow="In-app notification"
        title="Notifikasi"
        description="Notifikasi tidak menggantikan status server. Kanal lain belum diaktifkan; struktur data siap untuk email di masa mendatang."
      />
      <NotificationsList
        notifications={notifications.map<NotificationView>((item) => ({
          id: item.id,
          eventType: item.event_type,
          title: item.title,
          body: item.body,
          readAt: item.read_at ? item.read_at.toISOString() : null,
          createdLabel: formatDateTime(item.created_at, settings.timezone),
          relatedEntityType: item.related_entity_type,
          relatedEntityId: item.related_entity_id,
        }))}
      />
    </>
  );
}
