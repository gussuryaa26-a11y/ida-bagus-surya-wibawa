import type { NextRequest } from "next/server";
import { handleRoute, jsonOk } from "@/lib/api";
import { requireApiUser } from "@/lib/auth";
import { getBookingForUser } from "@/lib/bookings";
import { getMemoForBooking } from "@/lib/memos";
import { listAuditLogs } from "@/lib/reports";
import { AppError } from "@/lib/errors";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    const user = await requireApiUser(request);
    const { id } = await context.params;
    const booking = await getBookingForUser(id, user);
    if (!booking) throw new AppError("NOT_FOUND", "Pengajuan tidak ditemukan.");
    const memo = await getMemoForBooking(id);
    const audit =
      user.role === "academic"
        ? await listAuditLogs({ entityType: "booking_request", entityId: id, limit: 60 })
        : [];
    return jsonOk({ booking, memo, audit });
  });
}
