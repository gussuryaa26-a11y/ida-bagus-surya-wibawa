import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { AppError } from "@/lib/errors";
import { assertSameOrigin, requireApiUser, requireRole } from "@/lib/auth";
import { restrictionSchema } from "@/lib/validation";
import { createRestriction, listRestrictions } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";
import { combineDateAndTime } from "@/lib/operational-clock";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(request);
    requireRole(user, ["facility_manager", "academic", "admin_it"]);
    return jsonOk({ restrictions: await listRestrictions() });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    requireRole(user, ["facility_manager"]);
    const input = await parseJson(request, restrictionSchema);
    const settings = await getSettings();
    const startAt = combineDateAndTime(input.date, input.startTime, settings.timezone);
    const endAt = combineDateAndTime(input.date, input.endTime, settings.timezone);
    if (endAt <= startAt) {
      throw new AppError("VALIDATION_ERROR", "Waktu selesai harus setelah waktu mulai.");
    }
    const result = await createRestriction(
      {
        roomId: input.roomId,
        startAt,
        endAt,
        restrictionType: input.restrictionType,
        reason: input.reason,
      },
      user,
    );
    return jsonOk(result, 201);
  });
}
