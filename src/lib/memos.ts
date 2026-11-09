import { mkdir, readFile, writeFile, rename, access } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { query, queryOne, withTransaction } from "./db";
import { AppError } from "./errors";
import { writeAudit } from "./audit";
import { getSettings } from "./settings";
import { getBookingById, formatBookingRange } from "./bookings";
import { getAcademicRecipientIds, sendNotifications } from "./notifications";
import type { BookingWithRelations, SessionUser } from "./types";

export type MemoRow = {
  id: string;
  bookingId: string;
  documentVersion: number;
  templateVersion: string;
  templateKind: "demo" | "official";
  documentNumber: string | null;
  fileReference: string | null;
  generationStatus: "pending" | "generating" | "ready" | "failed";
  errorMessage: string | null;
  generatedAt: Date | null;
  createdAt: Date;
};

type MemoDbRow = {
  id: string;
  booking_id: string;
  document_version: number;
  template_version: string;
  template_kind: "demo" | "official";
  document_number: string | null;
  file_reference: string | null;
  generation_status: "pending" | "generating" | "ready" | "failed";
  error_message: string | null;
  generated_at: Date | null;
  created_at: Date;
};

const INK = rgb(0.12, 0.15, 0.16);
const MUTED = rgb(0.35, 0.4, 0.42);
const TEAL = rgb(0.043, 0.486, 0.549);
const ORANGE = rgb(0.969, 0.58, 0.118);
const WARN_BG = rgb(1, 0.96, 0.86);
const LIGHT = rgb(0.95, 0.96, 0.96);

function memoDir(): string {
  return process.env.MEMO_STORAGE_DIR
    ? path.resolve(process.env.MEMO_STORAGE_DIR)
    : path.join(process.cwd(), ".data", "memos");
}

function safeMemoPath(reference: string): string {
  const base = memoDir();
  const resolved = path.resolve(base, path.basename(reference));
  if (!resolved.startsWith(base + path.sep)) {
    throw new AppError("NOT_FOUND", "Dokumen tidak ditemukan.");
  }
  return resolved;
}

function mapMemo(row: MemoDbRow): MemoRow {
  return {
    id: row.id,
    bookingId: row.booking_id,
    documentVersion: row.document_version,
    templateVersion: row.template_version,
    templateKind: row.template_kind,
    documentNumber: row.document_number,
    fileReference: row.file_reference,
    generationStatus: row.generation_status,
    errorMessage: row.error_message,
    generatedAt: row.generated_at,
    createdAt: row.created_at,
  };
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let chunk = "";
        for (const char of word) {
          if (font.widthOfTextAtSize(chunk + char, size) > maxWidth) {
            lines.push(chunk);
            chunk = char;
          } else {
            chunk += char;
          }
        }
        current = chunk;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function drawLabelValue(
  page: PDFPage,
  font: PDFFont,
  bold: PDFFont,
  y: number,
  label: string,
  value: string,
  maxWidth: number,
): number {
  page.drawText(label, { x: 56, y, size: 9, font: bold, color: MUTED });
  const lines = wrapText(value, font, 11, maxWidth);
  let cursor = y;
  for (const line of lines) {
    page.drawText(line, { x: 190, y: cursor, size: 11, font, color: INK });
    cursor -= 15;
  }
  return cursor - 6;
}

async function renderDemoMemo(booking: BookingWithRelations, timezone: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawRectangle({ x: 0, y: 782, width: 595, height: 60, color: TEAL });
  page.drawText("SIMPAR — IDB BALI", {
    x: 56,
    y: 812,
    size: 16,
    font: bold,
    color: rgb(1, 1, 1),
  });
  page.drawText("Sistem Peminjaman Ruangan Kampus", {
    x: 56,
    y: 794,
    size: 9,
    font,
    color: rgb(0.85, 0.95, 0.95),
  });

  page.drawText("INTERNAL MEMO (DEMO)", { x: 56, y: 742, size: 20, font: bold, color: INK });
  page.drawText("Dokumen demo — belum disahkan kampus", {
    x: 56,
    y: 724,
    size: 10,
    font,
    color: ORANGE,
  });

  page.drawRectangle({ x: 48, y: 646, width: 499, height: 60, color: WARN_BG });
  const warning = wrapText(
    "Dokumen ini dihasilkan untuk pengujian sistem. Tidak memiliki nomor surat resmi, tanda tangan, stempel, atau pengesahan pejabat kampus. Jangan digunakan sebagai surat resmi.",
    font,
    9,
    475,
  );
  warning.forEach((line, index) => {
    page.drawText(line, { x: 58, y: 688 - index * 13, size: 9, font, color: rgb(0.45, 0.27, 0.03) });
  });

  let y = 616;
  const maxWidth = 340;
  const date = new Intl.DateTimeFormat("id-ID", {
    timeZone: timezone,
    dateStyle: "full",
  }).format(booking.startAt);

  y = drawLabelValue(page, font, bold, y, "Nomor dokumen", `DEMO-${booking.id.slice(0, 8).toUpperCase()} (bukan nomor resmi)`, maxWidth);
  y = drawLabelValue(page, font, bold, y, "Status booking", "Disetujui (approved) — booking terkonfirmasi", maxWidth);
  y = drawLabelValue(page, font, bold, y, "Kegiatan", booking.activityName, maxWidth);
  y = drawLabelValue(page, font, bold, y, "Organisasi", booking.organizationCode ? `${booking.organizationName} (${booking.organizationCode})` : booking.organizationName, maxWidth);
  y = drawLabelValue(page, font, bold, y, "Pemohon", `${booking.requesterName}${booking.requesterNim ? ` — NIM ${booking.requesterNim}` : ""}`, maxWidth);
  y = drawLabelValue(page, font, bold, y, "Ruangan", `${booking.roomName} (${booking.roomCode})`, maxWidth);
  y = drawLabelValue(page, font, bold, y, "Tanggal", date, maxWidth);
  y = drawLabelValue(page, font, bold, y, "Waktu", formatBookingRange(booking, timezone), maxWidth);
  y = drawLabelValue(page, font, bold, y, "Jumlah peserta", String(booking.participantCount), maxWidth);
  y = drawLabelValue(page, font, bold, y, "Fasilitas", booking.requiredFacilities.length ? booking.requiredFacilities.join(", ") : "Tidak ada kebutuhan khusus", maxWidth);
  y = drawLabelValue(page, font, bold, y, "Tujuan kegiatan", booking.activityPurpose, maxWidth);
  drawLabelValue(page, font, bold, y, "Diputuskan oleh", booking.decisionAt ? new Intl.DateTimeFormat("id-ID", { timeZone: timezone, dateStyle: "medium", timeStyle: "short" }).format(booking.decisionAt) : "—", maxWidth);

  page.drawRectangle({ x: 48, y: 92, width: 499, height: 1, color: LIGHT });
  page.drawText("Dokumen dibuat otomatis oleh SIMPAR. Template: demo-v1.", {
    x: 56,
    y: 74,
    size: 8,
    font,
    color: MUTED,
  });
  page.drawText("Template resmi kampus belum dikonfigurasi pada sistem ini.", {
    x: 56,
    y: 60,
    size: 8,
    font,
    color: MUTED,
  });

  return pdf.save();
}

async function renderOfficialMemo(
  booking: BookingWithRelations,
  templatePath: string,
  timezone: string,
): Promise<Uint8Array> {
  const mappingPath = `${templatePath}.fields.json`;
  try {
    await access(templatePath);
    await access(mappingPath);
  } catch {
    throw new AppError(
      "BUSINESS_RULE",
      "Template resmi Internal Memo belum dikonfigurasi lengkap (file template atau mapping field tidak ditemukan).",
    );
  }
  const templateBytes = await readFile(templatePath);
  const pdf = await PDFDocument.load(templateBytes);
  const page = pdf.getPages()[0];
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const mapping = JSON.parse(await readFile(mappingPath, "utf8")) as {
    fields?: Record<string, { x: number; y: number; size?: number }>;
  };
  if (!mapping.fields) {
    throw new AppError("BUSINESS_RULE", "Mapping field template resmi tidak valid.");
  }
  const values: Record<string, string> = {
    documentNumber: booking.id.toUpperCase(),
    activityName: booking.activityName,
    organizationName: booking.organizationName,
    requesterName: booking.requesterName,
    requesterNim: booking.requesterNim ?? "",
    roomName: booking.roomName,
    date: new Intl.DateTimeFormat("id-ID", { timeZone: timezone, dateStyle: "full" }).format(booking.startAt),
    time: formatBookingRange(booking, timezone),
    participantCount: String(booking.participantCount),
    facilities: booking.requiredFacilities.join(", "),
    purpose: booking.activityPurpose,
  };
  for (const [key, position] of Object.entries(mapping.fields)) {
    const value = values[key];
    if (!value) continue;
    page.drawText(value, {
      x: position.x,
      y: position.y,
      size: position.size ?? 10,
      font,
      color: INK,
    });
  }
  return pdf.save();
}

async function writePdfAtomically(reference: string, bytes: Uint8Array): Promise<void> {
  const dir = memoDir();
  await mkdir(dir, { recursive: true });
  const target = safeMemoPath(reference);
  const temporary = `${target}.tmp-${Date.now()}`;
  await writeFile(temporary, bytes);
  await rename(temporary, target);
}

async function getMemoRow(bookingId: string): Promise<MemoDbRow | null> {
  return queryOne<MemoDbRow>(
    `SELECT * FROM internal_memos WHERE booking_id = $1 ORDER BY document_version DESC LIMIT 1`,
    [bookingId],
  );
}

export async function getMemoForBooking(bookingId: string): Promise<MemoRow | null> {
  const row = await getMemoRow(bookingId);
  return row ? mapMemo(row) : null;
}

export async function generateInternalMemo(
  bookingId: string,
  actor: SessionUser | null,
  options: { silent?: boolean } = {},
): Promise<MemoRow> {
  const booking = await getBookingById(bookingId);
  if (!booking) throw new AppError("NOT_FOUND", "Pengajuan tidak ditemukan.");
  if (!["approved", "cancellation_requested"].includes(booking.status)) {
    throw new AppError("BUSINESS_RULE", "Internal Memo hanya dapat dibuat setelah booking disetujui.");
  }
  const settings = await getSettings();
  const timezone = settings.timezone;

  const existing = await getMemoRow(bookingId);
  if (existing?.generation_status === "ready" && existing.file_reference) {
    try {
      await access(safeMemoPath(existing.file_reference));
      return mapMemo(existing);
    } catch {
      // regenerate below
    }
  }

  const templateVersion = settings.memoTemplateKind === "official" ? "official-v1" : "demo-v1";
  let memoRow: MemoDbRow;
  try {
    const started = await withTransaction(async (client) => {
      const locked = await client.query<MemoDbRow>(
        `SELECT * FROM internal_memos WHERE booking_id = $1 ORDER BY document_version DESC LIMIT 1 FOR UPDATE`,
        [bookingId],
      );
      if (locked.rows[0]) {
        const row = locked.rows[0];
        if (row.generation_status === "ready" && row.file_reference) {
          try {
            await access(safeMemoPath(row.file_reference));
            return { row, skip: true };
          } catch {
            // File is missing (e.g. ephemeral serverless storage); regenerate it.
          }
        }
        const updated = await client.query<MemoDbRow>(
          `UPDATE internal_memos SET
             generation_status = 'generating', error_message = NULL,
             template_kind = $2, template_version = $3, updated_at = now()
           WHERE id = $1 RETURNING *`,
          [row.id, settings.memoTemplateKind, templateVersion],
        );
        return { row: updated.rows[0], skip: false };
      }
      const inserted = await client.query<MemoDbRow>(
        `INSERT INTO internal_memos
           (booking_id, document_version, template_version, template_kind, document_number,
            generation_status, created_by)
         VALUES ($1, 1, $2, $3, $4, 'generating', $5)
         RETURNING *`,
        [
          bookingId,
          templateVersion,
          settings.memoTemplateKind,
          settings.memoTemplateKind === "demo"
            ? `DEMO-${bookingId.slice(0, 8).toUpperCase()}`
            : null,
          actor?.id ?? null,
        ],
      );
      return { row: inserted.rows[0], skip: false };
    });
    memoRow = started.row;
    if (started.skip) return mapMemo(memoRow);
  } catch (error) {
    throw error;
  }

  const reference = `${memoRow.id}-v${memoRow.document_version}.pdf`;
  try {
    const bytes =
      settings.memoTemplateKind === "official"
        ? await renderOfficialMemo(
            booking,
            settings.memoOfficialTemplatePath || path.join(process.cwd(), "templates", "internal-memo.pdf"),
            timezone,
          )
        : await renderDemoMemo(booking, timezone);
    await writePdfAtomically(reference, bytes);

    const ready = await withTransaction(async (client) => {
      const updated = await client.query<MemoDbRow>(
        `UPDATE internal_memos SET
           generation_status = 'ready', file_reference = $2, generated_at = now(), error_message = NULL
         WHERE id = $1 RETURNING *`,
        [memoRow.id, reference],
      );
      await writeAudit(client, {
        actorId: actor?.id ?? null,
        actorLabel: actor?.fullName ?? "sistem",
        action: "internal_memo.generated",
        entityType: "internal_memo",
        entityId: memoRow.id,
        newState: {
          bookingId,
          templateKind: settings.memoTemplateKind,
          templateVersion,
          fileReference: reference,
        },
        reason: "Internal Memo dibuat setelah booking disetujui",
      });
      return updated.rows[0];
    });

    if (!options.silent) {
      const academicIds = await getAcademicRecipientIds();
      await sendNotifications([
        {
          recipientId: booking.requesterId,
          eventType: "memo.ready",
          title: "Internal Memo tersedia",
          body: `Internal Memo untuk "${booking.activityName}" telah dibuat dan dapat diunduh dari halaman pengajuan.`,
          entityType: "booking_request",
          entityId: bookingId,
        },
        ...academicIds.map((recipientId) => ({
          recipientId,
          eventType: "memo.ready" as const,
          title: "Internal Memo dibuat",
          body: `Internal Memo untuk "${booking.activityName}" (${booking.roomName}) telah dibuat.`,
          entityType: "booking_request" as const,
          entityId: bookingId,
        })),
      ]);
    }
    return mapMemo(ready);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Pembuatan PDF gagal.";
    await query(
      `UPDATE internal_memos SET generation_status = 'failed', error_message = $2 WHERE id = $1`,
      [memoRow.id, message.slice(0, 500)],
    );
    if (!options.silent) {
      const academicIds = await getAcademicRecipientIds();
      await sendNotifications([
        {
          recipientId: booking.requesterId,
          eventType: "memo.failed",
          title: "Internal Memo gagal dibuat",
          body: "Booking tetap disetujui. Pembuatan dokumen dapat dicoba ulang oleh pengguna berwenang.",
          entityType: "booking_request",
          entityId: bookingId,
        },
        ...academicIds.map((recipientId) => ({
          recipientId,
          eventType: "memo.failed" as const,
          title: "Internal Memo gagal dibuat",
          body: `Pembuatan memo untuk "${booking.activityName}" gagal. Booking tidak dibatalkan.`,
          entityType: "booking_request" as const,
          entityId: bookingId,
        })),
      ]);
    }
    throw error;
  }
}

export async function downloadInternalMemo(
  memoId: string,
  user: SessionUser,
): Promise<{ bytes: Buffer; filename: string; memo: MemoRow }> {
  const row = await queryOne<MemoDbRow & { requester_id: string; booking_status: string }>(
    `SELECT m.*, b.requester_id, b.status AS booking_status
       FROM internal_memos m
       JOIN booking_requests b ON b.id = m.booking_id
      WHERE m.id = $1`,
    [memoId],
  );
  if (!row) throw new AppError("NOT_FOUND", "Dokumen tidak ditemukan.");
  const authorized =
    row.requester_id === user.id || user.role === "academic";
  if (!authorized) throw new AppError("NOT_FOUND", "Dokumen tidak ditemukan.");
  if (row.generation_status !== "ready" || !row.file_reference) {
    throw new AppError("BUSINESS_RULE", "Dokumen belum tersedia atau sedang diproses.");
  }
  let bytes: Buffer;
  try {
    bytes = await readFile(safeMemoPath(row.file_reference));
  } catch {
    // Vercel/serverless storage can be ephemeral: the PDF may have been
    // generated on another instance. Regenerate silently, then serve it.
    await generateInternalMemo(row.booking_id, user, { silent: true });
    const refreshed = await queryOne<MemoDbRow>(
      `SELECT * FROM internal_memos WHERE id = $1`,
      [memoId],
    );
    if (
      !refreshed ||
      refreshed.generation_status !== "ready" ||
      !refreshed.file_reference
    ) {
      throw new AppError("BUSINESS_RULE", "Dokumen belum tersedia atau sedang diproses.");
    }
    bytes = await readFile(safeMemoPath(refreshed.file_reference));
  }
  await query(
    `INSERT INTO audit_logs (actor_id, actor_label, action, entity_type, entity_id, new_state)
     VALUES ($1, $2, 'internal_memo.downloaded', 'internal_memo', $3, $4)`,
    [user.id, user.fullName, row.id, JSON.stringify({ bookingId: row.booking_id })],
  );
  return {
    bytes,
    filename: `Internal-Memo-${row.template_kind === "demo" ? "DEMO-" : ""}${row.booking_id.slice(0, 8)}.pdf`,
    memo: mapMemo(row),
  };
}

export async function listMemoHistory(bookingId: string): Promise<MemoRow[]> {
  const rows = await query<MemoDbRow>(
    `SELECT * FROM internal_memos WHERE booking_id = $1 ORDER BY document_version DESC`,
    [bookingId],
  );
  return rows.map(mapMemo);
}
