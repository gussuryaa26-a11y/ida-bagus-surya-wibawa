import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser, requireRole } from "@/lib/auth";
import { roomSchema } from "@/lib/validation";
import { getRoomById, updateRoom } from "@/lib/rooms";
import { notifyRoomDeactivated } from "@/lib/room-status-notifications";

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    requireRole(user, ["facility_manager", "admin_it"]);
    const { id } = await context.params;
    const input = await parseJson(request, roomSchema);
    const before = await getRoomById(id, true);
    const room = await updateRoom(
      id,
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
    if (before?.isActive && !room.isActive) {
      await notifyRoomDeactivated(room);
    }
    return jsonOk({ room });
  });
}
