import type { NextRequest } from "next/server";
import { handleRoute, jsonOk, parseJson } from "@/lib/api";
import { assertSameOrigin, requireApiUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { profileSchema } from "@/lib/validation";
import { updateProfile } from "@/lib/users";

export async function PATCH(request: NextRequest) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    if (user.role === "student") {
      throw new AppError(
        "FORBIDDEN",
        "Profil mahasiswa bersifat hanya-baca dan dibaca dari direktori akademik kampus.",
      );
    }
    const input = await parseJson(request, profileSchema);
    await updateProfile(user, {
      fullName: input.fullName,
      programStudy: input.programStudy ?? null,
      faculty: input.faculty ?? null,
      orgPosition: input.orgPosition ?? null,
      contactEmail: input.contactEmail ?? null,
    });
    return jsonOk({ ok: true });
  });
}
