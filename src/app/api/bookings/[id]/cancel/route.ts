import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { cancelBookingSchema } from "@/lib/validation";
import { cancelPendingBooking } from "@/lib/cancellations";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    const { id } = await context.params;
    const input = await parseJson(request, cancelBookingSchema);
    await cancelPendingBooking(id, input.reason, user);
    return jsonOk({ cancelled: true });
  });
}
