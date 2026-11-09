import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { bookingSchema } from "@/lib/validation";
import { createBookingRequest, listMyBookings } from "@/lib/bookings";
import type { BookingStatus } from "@/lib/types";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(request);
    const status = request.nextUrl.searchParams.get("status") as BookingStatus | null;
    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    const bookings = await listMyBookings(user.id, {
      status: status ?? undefined,
      search,
    });
    return jsonOk({ bookings });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    const input = await parseJson(request, bookingSchema);
    const idempotencyKey = request.headers.get("idempotency-key");
    const result = await createBookingRequest(input, user, { idempotencyKey });
    return jsonOk(
      {
        booking: result.booking,
        reused: result.reused,
        message: result.reused
          ? "Pengajuan dengan idempotency key yang sama sudah tersimpan."
          : "Pengajuan berhasil disimpan dan slot ditahan.",
      },
      result.reused ? 200 : 201,
    );
  });
}
