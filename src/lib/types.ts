export const USER_ROLES = [
  "student",
  "academic",
  "facility_manager",
  "security",
  "admin_it",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const BOOKING_STATUSES = [
  "draft",
  "pending_academic",
  "revision_requested",
  "approved",
  "rejected",
  "expired",
  "cancellation_requested",
  "cancelled",
  "cancel_rejected",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const ROOM_CATEGORIES = ["classroom", "multipurpose", "hall"] as const;
export type RoomCategory = (typeof ROOM_CATEGORIES)[number];

export const ACTIVITY_TYPES = [
  "seminar",
  "workshop",
  "rapat",
  "lomba",
  "seni",
  "olahraga",
  "lainnya",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const FACILITIES = [
  "proyektor",
  "ac",
  "wifi",
  "papan_tulis",
  "sound_system",
  "panggung",
  "meja",
  "kursi",
  "komputer",
  "imac",
  "kamera",
  "mesin_jahit",
] as const;
export type Facility = (typeof FACILITIES)[number];

export type SessionUser = {
  id: string;
  fullName: string;
  loginId: string;
  role: UserRole;
  nim: string | null;
  programStudy: string | null;
  faculty: string | null;
  organizationId: string | null;
  organizationName: string | null;
  organizationCode: string | null;
  orgPosition: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  isDemo: boolean;
};

export type Room = {
  id: string;
  code: string;
  name: string;
  category: RoomCategory;
  capacity: number | null;
  capacityVerified: boolean;
  facilities: string[];
  facilitiesVerified: boolean;
  description: string | null;
  location: string | null;
  imagePath: string | null;
  imageNote: string | null;
  isActive: boolean;
  statusNote: string | null;
  isDemoData: boolean;
  dataSource: string;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type BookingRow = {
  id: string;
  requesterId: string;
  organizationId: string;
  orgPositionSnapshot: string | null;
  activityName: string;
  activityPurpose: string;
  activityType: string;
  participantCount: number;
  capacityPercentageSnapshot: number | null;
  capacityReviewRequired: boolean;
  requiredFacilities: string[];
  roomId: string;
  startAt: Date;
  endAt: Date;
  status: BookingStatus;
  slotHeld: boolean;
  submittedAt: Date;
  decisionTargetAt: Date;
  holdExpiresAt: Date;
  lateNotifiedAt: Date | null;
  revisionDeadlineAt: Date | null;
  decisionBy: string | null;
  decisionAt: Date | null;
  decisionReason: string | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  idempotencyKey: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type BookingWithRelations = BookingRow & {
  roomCode: string;
  roomName: string;
  roomCategory: RoomCategory;
  roomCapacity: number | null;
  roomFacilities: string[];
  requesterName: string;
  requesterLoginId: string;
  requesterNim: string | null;
  requesterProgramStudy: string | null;
  requesterPhone: string | null;
  requesterEmail: string | null;
  organizationName: string;
  organizationCode: string;
};

export type NotificationEventType =
  | "booking.submitted"
  | "booking.approved"
  | "booking.rejected"
  | "booking.revision_requested"
  | "booking.resubmitted"
  | "booking.overdue"
  | "booking.expired"
  | "booking.cancellation_requested"
  | "booking.cancellation_approved"
  | "booking.cancellation_rejected"
  | "booking.cancelled_by_requester"
  | "room.deactivated"
  | "booking.room_deactivated"
  | "booking.post_approval_conflict"
  | "memo.ready"
  | "memo.failed";

export type CapacityStatus = "normal" | "warning" | "rejected" | "unverified";

/**
 * Hasil evaluasi kapasitas untuk satu kombinasi ruangan + jumlah peserta.
 * `allowed` menentukan apakah pengajuan boleh dikirim; `requiresReview`
 * menandai pengajuan 101–120% untuk validasi tambahan Akademik.
 */
export type CapacityAssessment = {
  participantCount: number;
  capacity: number | null;
  percentage: number | null;
  status: CapacityStatus;
  allowed: boolean;
  requiresReview: boolean;
  warning: boolean;
  reason: string | null;
};

export type AvailabilityCode =
  | "available"
  | "room_inactive"
  | "capacity_unverified"
  | "capacity_insufficient"
  | "facilities_unverified"
  | "facilities_missing"
  | "class_conflict"
  | "booking_conflict"
  | "restriction"
  | "data_stale";

/**
 * Structured cause of an unavailable room. The UI uses this to pick the
 * selection state, because `booking_conflict` alone cannot tell a confirmed
 * booking apart from a pending slot hold.
 */
export type AvailabilityBlockReason =
  | "room_inactive"
  | "capacity"
  | "facilities"
  | "class_schedule"
  | "booking_confirmed"
  | "slot_held"
  | "restriction"
  | "data_stale";

export type AvailabilityResult = {
  available: boolean;
  code: AvailabilityCode;
  label: string;
  reasons: string[];
  blockReason: AvailabilityBlockReason | null;
  capacity: CapacityAssessment | null;
  lastScheduleUpdateAt: Date | null;
  room: Room;
};
