import type { NextRequest } from "next/server";
import { handleRoute, jsonOk } from "@/lib/api";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { getBookingById } from "@/lib/bookings";
import { generateInternalMemo } from "@/lib/memos";
import { AppError } from "@/lib/errors";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    const { id } = await context.params;
    const booking = await getBookingById(id);
    if (!booking) throw new AppError("NOT_FOUND", "Pengajuan tidak ditemukan.");
    if (booking.requesterId !== user.id && user.role !== "academic") {
      throw new AppError("NOT_FOUND", "Pengajuan tidak ditemukan.");
    }
    const memo = await generateInternalMemo(id, user);
    return jsonOk({ memo });
  });
}
