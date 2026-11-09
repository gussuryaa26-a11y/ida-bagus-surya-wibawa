import { z } from "zod";
import { ACTIVITY_TYPES, BOOKING_STATUSES, FACILITIES, ROOM_CATEGORIES, USER_ROLES } from "./types";

const latinLetter = /^[A-Za-z0-9._@-]+$/;

export const loginSchema = z.object({
  loginId: z.string().trim().min(1, "NIM/ID login wajib diisi.").max(64),
  password: z.string().min(1, "Kata sandi wajib diisi.").max(200),
});

export const bookingSchema = z.object({
  organizationName: z
    .string()
    .trim()
    .min(3, "Organisasi yang diwakili wajib diisi (minimal 3 karakter).")
    .max(160, "Nama organisasi terlalu panjang.")
    .optional(),
  activityName: z.string().trim().min(3, "Nama kegiatan minimal 3 karakter.").max(160),
  activityPurpose: z.string().trim().min(10, "Tujuan kegiatan minimal 10 karakter.").max(2000),
  activityType: z.enum(ACTIVITY_TYPES),
  participantCount: z.coerce.number().int().positive().max(10_000),
  requiredFacilities: z.array(z.enum(FACILITIES)).max(20).default([]),
  roomId: z.string().uuid("Ruangan tidak valid."),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Jam mulai tidak valid."),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Jam selesai tidak valid."),
});

export const recommendationSchema = z.object({
  activityType: z.enum(ACTIVITY_TYPES),
  participantCount: z.coerce.number().int().positive().max(10_000),
  requiredFacilities: z.array(z.enum(FACILITIES)).max(20).default([]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export const availabilityQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  participantCount: z.coerce.number().int().positive().optional(),
  facilities: z.string().optional(),
});

export const decisionSchema = z.object({
  action: z.enum(["approve", "reject", "request_revision"]),
  reason: z.string().trim().max(2000).optional().default(""),
});

export const cancelBookingSchema = z.object({
  reason: z.string().trim().min(5, "Alasan pembatalan minimal 5 karakter.").max(2000),
});

export const roomSchema = z.object({
  code: z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9._-]+$/, "Kode ruangan tidak valid."),
  name: z.string().trim().min(2).max(160),
  category: z.enum(ROOM_CATEGORIES),
  capacity: z.coerce.number().int().positive().max(100_000).nullable().optional(),
  capacityVerified: z.boolean().default(false),
  facilities: z.array(z.enum(FACILITIES)).max(30).default([]),
  facilitiesVerified: z.boolean().default(false),
  description: z.string().trim().max(3000).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  imagePath: z
    .string()
    .trim()
    .max(300)
    .nullable()
    .optional()
    .refine(
      (value) => !value || (value.startsWith("/") && !value.startsWith("//") && !value.includes("..")),
      "Path gambar harus berupa path lokal yang diawali / dan tidak mengandung ..",
    ),
  imageNote: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().default(true),
  isDemoData: z.boolean().default(true),
});

export const roomStatusSchema = z.object({
  isActive: z.boolean(),
  note: z.string().trim().max(500, "Keterangan masalah ruangan terlalu panjang.").optional().default(""),
});

export const restrictionSchema = z.object({
  roomId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Tanggal tidak valid."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Jam mulai tidak valid."),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Jam selesai tidak valid."),
  restrictionType: z.enum(["closure", "maintenance", "restriction"]),
  reason: z.string().trim().min(5).max(2000),
});

export const calendarSchema = z.object({
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  calendarType: z.enum(["holiday", "break", "semester", "exception"]),
  description: z.string().trim().min(3).max(500),
  regularClassesEnabled: z.boolean(),
  sourceOrAuthority: z.string().trim().min(3).max(300),
});

export const settingsSchema = z.object({
  timezone: z.string().trim().min(1).max(64),
  workdays: z.array(z.coerce.number().int().min(1).max(7)).min(1).max(7),
  openTime: z.string().regex(/^\d{2}:\d{2}$/),
  closeTime: z.string().regex(/^\d{2}:\d{2}$/),
  decisionTargetMinutes: z.coerce.number().int().positive().max(10_080),
  holdLimitMinutes: z.coerce.number().int().positive().max(20_160),
  revisionHoldPolicy: z.enum(["release", "hold_limited"]),
  revisionHoldMinutes: z.coerce.number().int().positive().max(20_160).nullable().optional(),
  bookingBufferMinutes: z.coerce.number().int().min(0).max(240),
  scheduleFreshnessDays: z.coerce.number().int().positive().max(3650),
  requireFreshSchedule: z.boolean(),
  requireOrgPosition: z.boolean(),
  allowDemoRoomData: z.boolean(),
  memoDocumentPrefix: z.string().trim().min(1).max(20).regex(latinLetter, "Prefix dokumen tidak valid."),
  memoTemplateKind: z.enum(["demo", "official"]),
  memoOfficialTemplatePath: z.string().trim().max(500).nullable().optional(),
  dataRetentionDays: z.coerce.number().int().positive().max(36_500).nullable().optional(),
  confirmConfiguration: z.boolean().default(false),
});

export const profileSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  programStudy: z.string().trim().max(160).nullable().optional(),
  faculty: z.string().trim().max(160).nullable().optional(),
  orgPosition: z.string().trim().max(160).nullable().optional(),
  contactEmail: z.string().trim().email("Format email tidak valid.").max(200).nullable().optional(),
});

export const createUserSchema = z.object({
  fullName: z.string().trim().min(3).max(160),
  loginId: z.string().trim().min(3).max(64).regex(latinLetter, "ID login tidak valid."),
  password: z.string().min(8, "Kata sandi minimal 8 karakter.").max(200),
  role: z.enum(USER_ROLES),
  nim: z.string().trim().max(40).nullable().optional(),
  programStudy: z.string().trim().max(160).nullable().optional(),
  faculty: z.string().trim().max(160).nullable().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  orgPosition: z.string().trim().max(160).nullable().optional(),
  contactEmail: z.string().trim().email().max(200).nullable().optional(),
});

export const updateUserSchema = z.object({
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
  organizationId: z.string().uuid().nullable().optional(),
  orgPosition: z.string().trim().max(160).nullable().optional(),
  contactEmail: z.string().trim().email().max(200).nullable().optional(),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, "Kata sandi minimal 8 karakter.").max(200),
});

export const markReadSchema = z.object({
  ids: z.array(z.string().uuid()).max(200).optional(),
});

export const statusFilterSchema = z.enum(BOOKING_STATUSES).optional();
