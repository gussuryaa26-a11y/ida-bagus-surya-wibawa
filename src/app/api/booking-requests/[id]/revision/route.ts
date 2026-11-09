import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { bookingSchema } from "@/lib/validation";
import { resubmitBooking } from "@/lib/bookings";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    const { id } = await context.params;
    const input = await parseJson(request, bookingSchema);
    const booking = await resubmitBooking(id, input, user);
    return jsonOk({ booking });
  });
}
