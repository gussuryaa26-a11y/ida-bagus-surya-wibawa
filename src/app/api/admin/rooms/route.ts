import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser, requireRole } from "@/lib/auth";
import { roomSchema } from "@/lib/validation";
import { createRoom, listRooms } from "@/lib/rooms";

export async function GET(request: NextRequest) {
  return handleRoute(async () => {
    const user = await requireApiUser(request);
    requireRole(user, ["facility_manager", "admin_it"]);
    return jsonOk({ rooms: await listRooms({ includeInactive: true }) });
  });
}

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    requireRole(user, ["facility_manager", "admin_it"]);
    const input = await parseJson(request, roomSchema);
    const room = await createRoom(
      {
        code: input.code,
        name: input.name,
        category: input.category,
        capacity: input.capacity ?? null,
        capacityVerified: input.capacityVerified,
        facilities: input.facilities,
        facilitiesVerified: input.facilitiesVerified,
        description: input.description ?? null,
        location: input.location ?? null,
        imagePath: input.imagePath ?? null,
        imageNote: input.imageNote ?? null,
        isActive: input.isActive,
        isDemoData: input.isDemoData,
      },
      user,
    );
    return jsonOk({ room }, 201);
  });
}
