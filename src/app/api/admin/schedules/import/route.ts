import type { NextRequest } from "next/server";
import { handleRoute, jsonOk } from "@/lib/api";
import { assertSameOrigin, requireApiUser, requireRole } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { commitScheduleImport, previewScheduleImport } from "@/lib/schedule-import";

const MAX_SIZE = 5 * 1024 * 1024;

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    assertSameOrigin(request);
    const user = await requireApiUser(request);
    requireRole(user, ["facility_manager", "academic", "admin_it"]);

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new AppError("VALIDATION_ERROR", "File jadwal wajib diunggah.");
    }
    if (file.size === 0) throw new AppError("VALIDATION_ERROR", "File jadwal kosong.");
    if (file.size > MAX_SIZE) throw new AppError("VALIDATION_ERROR", "Ukuran file maksimal 5 MB.");

    const source = String(form.get("source") ?? "").trim();
    const sourceVersion = String(form.get("sourceVersion") ?? "").trim();
    if (source.length < 3) throw new AppError("VALIDATION_ERROR", "Sumber data wajib diisi (minimal 3 karakter).");
    if (sourceVersion.length < 1) {
      throw new AppError("VALIDATION_ERROR", "Versi sumber data wajib diisi.");
    }
    const mode = String(form.get("mode") ?? "preview");
    if (mode !== "preview" && mode !== "commit") {
      throw new AppError("VALIDATION_ERROR", "Mode impor tidak valid.");
    }
    const strict = String(form.get("strict") ?? "false") === "true";

    const buffer = Buffer.from(await file.arrayBuffer());
    if (mode === "preview") {
      const preview = await previewScheduleImport(file.name, buffer);
      return jsonOk({
        mode,
        filename: preview.filename,
        totalRows: preview.totalRows,
        validRows: preview.parsed.length,
        issues: preview.issues,
        sample: preview.parsed.slice(0, 50).map((row) => ({
          rowNumber: row.rowNumber,
          roomCode: row.roomCode,
          dayOfWeek: row.dayOfWeek,
          startTime: row.startTime,
          endTime: row.endTime,
          effectiveFrom: row.effectiveFrom,
          effectiveUntil: row.effectiveUntil,
          semesterLabel: row.semesterLabel,
          courseName: row.courseName,
        })),
      });
    }

    const result = await commitScheduleImport(
      {
        filename: file.name,
        buffer,
        source,
        sourceVersion,
        strict,
      },
      user,
    );
    return jsonOk(result, 201);
  });
}
