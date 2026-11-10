import "./load-env";
import { hashPassword } from "../src/lib/auth";
import { closePool, query, withTransaction } from "../src/lib/db";
import { getClockConfig } from "../src/lib/settings";
import { addOperationalMinutes, addDaysToDateKey, combineDateAndTime, dateKeyInTimezone } from "../src/lib/operational-clock";
import { generateInternalMemo } from "../src/lib/memos";

const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "Demo1234!";

const ORGS = {
  bem: "11111111-1111-4111-8111-111111111111",
  hima: "22222222-2222-4222-8222-222222222222",
  ukm: "33333333-3333-4333-8333-333333333333",
};

const USERS = {
  student1: "a0000000-0000-4000-8000-000000000001",
  student2: "a0000000-0000-4000-8000-000000000002",
  academic: "a0000000-0000-4000-8000-000000000101",
  facility: "a0000000-0000-4000-8000-000000000102",
  security: "a0000000-0000-4000-8000-000000000103",
  admin: "a0000000-0000-4000-8000-000000000104",
};

/**
 * Direktori mahasiswa DEMO untuk NIM 20240001–20240100.
 *
 * Pada sistem kampus asli, data ini berasal dari SIAKAD/direktori civitas akademika.
 * Di sini dibuat deterministik agar demo dapat diulang: nama panjang, NIM, program
 * studi, email kampus (demo), nomor telepon (demo), dan afiliasi organisasi.
 */
const STUDENT_DIRECTORY = (() => {
  const firstNames = ["Putu", "Made", "Ketut", "Nyoman", "Wayan", "Gede", "Kadek", "Komang", "Ayu", "Ni Luh"];
  const middleNames = ["Aditya", "Dewi", "Bagus", "Citra", "Agung", "Sari", "Dwi", "Indah", "Eka", "Raka"];
  const lastNames = [
    "Pratama",
    "Maharani",
    "Saputra",
    "Wulandari",
    "Nugraha",
    "Puspita",
    "Wirawan",
    "Lestari",
    "Ardhana",
    "Sintya",
  ];
  const programs = [
    { study: "Desain Komunikasi Visual", faculty: "Fakultas Desain" },
    { study: "Desain Mode", faculty: "Fakultas Desain" },
    { study: "Desain Interior", faculty: "Fakultas Desain" },
    { study: "Manajemen Bisnis", faculty: "Fakultas Bisnis" },
    { study: "Teknologi Informasi", faculty: "Fakultas Teknologi" },
  ];
  const organizations = [ORGS.bem, ORGS.hima, ORGS.ukm];
  const positions = ["Ketua", "Sekretaris", "Bendahara", "Anggota"];

  return Array.from({ length: 100 }, (_, index) => {
    const nim = String(20240001 + index);
    const program = programs[index % programs.length];
    return {
      id: `a0000000-0000-4000-8000-000000000${String(index + 1).padStart(3, "0")}`,
      fullName: `${firstNames[index % 10]} ${middleNames[Math.floor(index / 10) % 10]} ${
        lastNames[(index * 7) % 10]
      }`,
      nim,
      programStudy: program.study,
      faculty: program.faculty,
      organizationId: organizations[index % organizations.length],
      orgPosition: positions[index % positions.length],
      contactEmail: `${nim}@student.idb.ac.id`,
      contactPhone: `0812${String(34560000 + index).padStart(8, "0")}`,
    };
  });
})();

type SeedRoom = {
  id: string;
  code: string;
  name: string;
  category: "classroom" | "multipurpose" | "hall";
  capacity: number;
  facilities: string[];
  description: string;
  location: string | null;
  imagePath: string;
  imageNote: string | null;
};

const ROOMS: SeedRoom[] = [
  {
    id: "b0000000-0000-4000-8000-000000000001",
    code: "LAB-IMAC",
    name: "Lab iMac",
    category: "classroom",
    capacity: 30,
    facilities: ["imac", "ac", "wifi", "proyektor", "meja", "kursi"],
    description:
      "Laboratorium komputer berbasis macOS (iMac M1) untuk kegiatan praktik desain. Deskripsi bersumber dari website IDB Bali; kapasitas masih data DEMO.",
    location: "Lantai 1",
    imagePath: "/rooms/lab-imac.jpg",
    imageNote: "Foto fasilitas dari website resmi IDB Bali.",
  },
  {
    id: "b0000000-0000-4000-8000-000000000002",
    code: "AULA",
    name: "Aula",
    category: "hall",
    capacity: 300,
    facilities: ["sound_system", "panggung", "ac", "proyektor", "wifi", "kursi", "meja"],
    description:
      "Aula IDB Bali untuk seminar, workshop, pelatihan, dan kegiatan UKM. Deskripsi bersumber dari website IDB Bali; kapasitas masih data DEMO.",
    location: null,
    imagePath: "/rooms/aula.jpg",
    imageNote: "Foto fasilitas dari website resmi IDB Bali.",
  },
  {
    id: "b0000000-0000-4000-8000-000000000003",
    code: "GSB",
    name: "Gedung Serbaguna",
    category: "multipurpose",
    capacity: 500,
    facilities: ["sound_system", "ac", "wifi", "kursi", "meja"],
    description:
      "Gedung berkapasitas besar untuk olahraga, ekstrakurikuler, dan kegiatan lain yang memerlukan tempat luas. Deskripsi bersumber dari website IDB Bali; kapasitas masih data DEMO.",
    location: null,
    imagePath: "/rooms/gedung-serbaguna.jpg",
    imageNote: "Foto fasilitas dari website resmi IDB Bali.",
  },
  {
    id: "b0000000-0000-4000-8000-000000000004",
    code: "CREATIVE-GALLERY",
    name: "Creative Gallery",
    category: "multipurpose",
    capacity: 80,
    facilities: ["ac", "wifi", "meja", "kursi", "proyektor"],
    description:
      "Galeri karya mahasiswa dari berbagai program studi, berlokasi di lantai 1. Deskripsi bersumber dari website IDB Bali; kapasitas masih data DEMO.",
    location: "Lantai 1",
    imagePath: "/rooms/creative-gallery.jpg",
    imageNote: "Foto fasilitas dari website resmi IDB Bali.",
  },
  {
    id: "b0000000-0000-4000-8000-000000000005",
    code: "RUANG-INTERNASIONAL",
    name: "Ruang Internasional",
    category: "multipurpose",
    capacity: 40,
    facilities: ["ac", "wifi", "proyektor", "meja", "kursi"],
    description:
      "Ruang untuk kegiatan akademik dan pertemuan program internasional. Foto dan kapasitas belum terverifikasi khusus untuk ruangan ini; data operasional masih DEMO.",
    location: null,
    imagePath: "/rooms/ruang-internasional.jpg",
    imageNote: "Foto ilustrasi ruang pertemuan IDB Bali; foto ruang spesifik belum tersedia.",
  },
  {
    id: "b0000000-0000-4000-8000-000000000006",
    code: "RUANG-MAGISTER",
    name: "Ruang Magister",
    category: "classroom",
    capacity: 30,
    facilities: ["ac", "wifi", "proyektor", "kamera", "meja", "kursi"],
    description:
      "Ruang kelas Program Magister dengan peralatan digital untuk mendukung perkuliahan tatap muka dan daring. Deskripsi bersumber dari website IDB Bali; kapasitas masih data DEMO.",
    location: null,
    imagePath: "/rooms/ruang-magister.jpg",
    imageNote: "Foto dari halaman Ruang Kelas Magister IDB Bali.",
  },
  {
    id: "b0000000-0000-4000-8000-000000000007",
    code: "LAB-KOMPUTER",
    name: "Lab Komputer",
    category: "classroom",
    capacity: 36,
    facilities: ["komputer", "ac", "wifi", "proyektor", "meja", "kursi"],
    description:
      "Laboratorium komputer dengan CPU Intel generasi ke-12 dan GPU NVIDIA. Website IDB Bali menyebut kelas maksimum 24–36 mahasiswa. Kapasitas operasional masih data DEMO.",
    location: "Lantai 1",
    imagePath: "/rooms/lab-komputer.jpg",
    imageNote: "Foto fasilitas dari website resmi IDB Bali.",
  },
  {
    id: "b0000000-0000-4000-8000-000000000008",
    code: "LAB-FASHION",
    name: "Lab Fashion",
    category: "classroom",
    capacity: 30,
    facilities: ["mesin_jahit", "ac", "wifi", "meja", "kursi"],
    description:
      "Laboratorium Desain Mode untuk pengembangan produk fashion, eksplorasi teknik, dan pola. Deskripsi bersumber dari website IDB Bali; kapasitas masih data DEMO.",
    location: "Lantai 1",
    imagePath: "/rooms/lab-fashion.jpg",
    imageNote: "Foto fasilitas dari website resmi IDB Bali.",
  },
  {
    id: "b0000000-0000-4000-8000-000000000009",
    code: "INKUBATOR",
    name: "Ruang Inkubator Bisnis",
    category: "multipurpose",
    capacity: 6,
    facilities: ["ac", "wifi", "proyektor", "meja", "kursi"],
    description:
      "Ruang Inkubator Bisnis (INBIS) untuk pendampingan, pelatihan, dan diskusi pengembangan usaha. Deskripsi bersumber dari website IDB Bali; kapasitas masih data DEMO.",
    location: null,
    imagePath: "/rooms/inkubator.jpg",
    imageNote: "Foto fasilitas INBIS dari website resmi IDB Bali.",
  },
  ...[1, 2].flatMap((floor) =>
    [1, 2].map((index) => {
      const label = `A.${floor}.${index}`;
      const suffix = `${floor}${index}`;
      return {
        id: `b0000000-0000-4000-8000-0000000000${10 + (floor - 1) * 2 + index}`,
        code: `KELAS-A${suffix}`,
        name: `Kelas ${label}`,
        category: "classroom" as const,
        capacity: 40,
        facilities: ["proyektor", "ac", "wifi", "papan_tulis", "meja", "kursi"],
        description:
          "Ruang kelas untuk perkuliahan non-praktik dengan proyektor, whiteboard, dan bangku kuliah. Foto merupakan ilustrasi ruang kelas IDB Bali; kapasitas masih data DEMO.",
        location: null,
        imagePath: "/rooms/ruang-kelas.jpg",
        imageNote: "Foto ilustrasi ruang kelas IDB Bali; foto ruangan spesifik belum tersedia.",
      };
    }),
  ),
];

function nextWeekday(base: Date, offsetDays: number, timezone: string): string {
  let dateKey = addDaysToDateKey(dateKeyInTimezone(base, timezone), offsetDays);
  for (let i = 0; i < 7; i += 1) {
    const [year, month, day] = dateKey.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) return dateKey;
    dateKey = addDaysToDateKey(dateKey, 1);
  }
  return dateKey;
}

async function main() {
  console.log("[seed] memulai seed data DEMO...");
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const now = new Date();

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE operational_settings SET
         timezone = 'Asia/Makassar',
         workdays = '{1,2,3,4,5}',
         open_time = '07:00',
         close_time = '21:00',
         decision_target_minutes = 60,
         hold_limit_minutes = 180,
         revision_hold_policy = 'release',
         revision_hold_minutes = NULL,
         booking_buffer_minutes = 0,
         schedule_freshness_days = 120,
         require_fresh_schedule = true,
         require_org_position = true,
         allow_demo_room_data = true,
         notification_channels = '{in_app}',
         memo_template_kind = 'demo',
         memo_document_prefix = 'DEMO',
         is_confirmed = false
       WHERE id = 1 AND is_confirmed = false`,
    );

    await client.query(
      `INSERT INTO organizations (id, name, code, is_active, is_demo, source) VALUES
         ($1, 'BEM IDB Bali (DEMO)', 'BEM', true, true, 'DEMO_SEED — belum diverifikasi kampus'),
         ($2, 'HIMA Desain (DEMO)', 'HIMA-DKV', true, true, 'DEMO_SEED — belum diverifikasi kampus'),
         ($3, 'UKM Kreatif (DEMO)', 'UKM-KREATIF', true, true, 'DEMO_SEED — belum diverifikasi kampus')
       ON CONFLICT (id) DO NOTHING`,
      [ORGS.bem, ORGS.hima, ORGS.ukm],
    );

    const users = [
      ...STUDENT_DIRECTORY.map((student) => ({
        id: student.id,
        fullName: student.fullName,
        loginId: student.nim,
        role: "student",
        nim: student.nim,
        programStudy: student.programStudy,
        faculty: student.faculty,
        organizationId: student.organizationId,
        orgPosition: student.orgPosition,
        contactEmail: student.contactEmail,
        contactPhone: student.contactPhone,
      })),
      {
        id: USERS.academic,
        fullName: "Akademik Demo",
        loginId: "akademik",
        role: "academic",
        nim: null,
        programStudy: null,
        faculty: null,
        organizationId: null,
        orgPosition: null,
        contactEmail: "akademik@example.test",
        contactPhone: null,
      },
      {
        id: USERS.facility,
        fullName: "Pengelola Fasilitas Demo",
        loginId: "fasilitas",
        role: "facility_manager",
        nim: null,
        programStudy: null,
        faculty: null,
        organizationId: null,
        orgPosition: null,
        contactEmail: "fasilitas@example.test",
        contactPhone: null,
      },
      {
        id: USERS.security,
        fullName: "Petugas Keamanan Demo",
        loginId: "keamanan",
        role: "security",
        nim: null,
        programStudy: null,
        faculty: null,
        organizationId: null,
        orgPosition: null,
        contactEmail: "keamanan@example.test",
        contactPhone: null,
      },
      {
        id: USERS.admin,
        fullName: "Admin IT Demo",
        loginId: "admin",
        role: "admin_it",
        nim: null,
        programStudy: null,
        faculty: null,
        organizationId: null,
        orgPosition: null,
        contactEmail: "admin@example.test",
        contactPhone: null,
      },
    ];

    for (const user of users) {
      await client.query(
        `INSERT INTO users
           (id, full_name, login_id, password_hash, role, is_active, nim, program_study,
            faculty, organization_id, org_position, contact_email, contact_phone, is_demo)
         VALUES ($1,$2,$3,$4,$5,true,$6,$7,$8,$9,$10,$11,$12,true)
         ON CONFLICT (id) DO UPDATE SET
           full_name = EXCLUDED.full_name,
           login_id = EXCLUDED.login_id,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role,
           is_active = true,
           nim = EXCLUDED.nim,
           program_study = EXCLUDED.program_study,
           faculty = EXCLUDED.faculty,
           organization_id = EXCLUDED.organization_id,
           org_position = EXCLUDED.org_position,
           contact_email = EXCLUDED.contact_email,
           contact_phone = EXCLUDED.contact_phone,
           is_demo = true`,
        [
          user.id,
          user.fullName,
          user.loginId,
          passwordHash,
          user.role,
          user.nim,
          user.programStudy,
          user.faculty,
          user.organizationId,
          user.orgPosition,
          user.contactEmail,
          user.contactPhone,
        ],
      );
    }

    for (const room of ROOMS) {
      await client.query(
        `INSERT INTO rooms
           (id, code, name, category, capacity, capacity_verified, facilities, facilities_verified,
            description, location, image_path, image_note, is_active, is_demo_data, data_source, verified_at)
         VALUES ($1,$2,$3,$4,$5,false,$6,false,$7,$8,$9,$10,true,true,'DEMO_SEED',NULL)
         ON CONFLICT (id) DO NOTHING`,
        [
          room.id,
          room.code,
          room.name,
          room.category,
          room.capacity,
          room.facilities,
          room.description,
          room.location,
          room.imagePath,
          room.imageNote,
        ],
      );
    }

    const importId = "c0000000-0000-4000-8000-000000000001";
    const existingImport = await client.query("SELECT id FROM schedule_imports WHERE id = $1", [importId]);
    if (!existingImport.rows[0]) {
      await client.query(
        `INSERT INTO schedule_imports
           (id, filename, source, source_version, imported_by, status, total_rows, success_rows, failed_rows, details, completed_at)
         VALUES ($1, 'jadwal-demo-ganjil.csv', 'DEMO_SEED', 'demo-2026-1', $2, 'success', 12, 12, 0, '[]'::jsonb, now())`,
        [importId, USERS.facility],
      );
      const year = now.getUTCFullYear();
      const schedules = [
        ["KELAS-A11", 1, "08:00", "10:00", "Struktur Dasar Desain"],
        ["KELAS-A11", 3, "10:00", "12:00", "Tipografi"],
        ["KELAS-A12", 2, "08:00", "10:00", "Metodologi Desain"],
        ["KELAS-A12", 4, "13:00", "15:00", "Fotografi Dasar"],
        ["KELAS-A21", 1, "10:00", "12:00", "Desain Interior I"],
        ["KELAS-A21", 5, "08:00", "10:00", "Material dan Struktur"],
        ["KELAS-A22", 2, "13:00", "15:00", "Manajemen Bisnis"],
        ["KELAS-A22", 3, "08:00", "10:00", "Bisnis Digital"],
        ["LAB-KOMPUTER", 1, "13:00", "15:00", "Praktikum Web"],
        ["LAB-KOMPUTER", 4, "08:00", "10:00", "Basis Data"],
        ["LAB-IMAC", 2, "10:00", "12:00", "Praktikum Desain Grafis"],
        ["LAB-IMAC", 5, "13:00", "15:00", "Animasi Digital"],
      ] as const;
      let index = 0;
      for (const schedule of schedules) {
        index += 1;
        const room = ROOMS.find((row) => row.code === schedule[0]);
        if (!room) continue;
        await client.query(
          `INSERT INTO class_schedules
             (id, room_id, day_of_week, start_time, end_time, effective_from, effective_until,
              semester_label, course_name, source_version, import_id, last_imported_at)
           VALUES ($1,$2,$3,$4::time,$5::time,$6::date,$7::date,$8,$9,'demo-2026-1',$10,now())
           ON CONFLICT (id) DO NOTHING`,
          [
            `d0000000-0000-4000-8000-0000000000${String(index).padStart(2, "0")}`,
            room.id,
            schedule[1],
            schedule[2],
            schedule[3],
            `${year}-07-01`,
            `${year + 1}-04-30`,
            "Ganjil (DEMO)",
            schedule[4],
            importId,
          ],
        );
      }
    }

    const holidayExists = await client.query(
      "SELECT id FROM academic_calendar WHERE source_or_authority = 'DEMO_SEED' LIMIT 1",
    );
    if (!holidayExists.rows[0]) {
      const holidayDate = addDaysToDateKey(dateKeyInTimezone(now, "Asia/Makassar"), 30);
      const breakStart = addDaysToDateKey(dateKeyInTimezone(now, "Asia/Makassar"), 60);
      const breakEnd = addDaysToDateKey(breakStart, 6);
      await client.query(
        `INSERT INTO academic_calendar
           (period_start, period_end, calendar_type, description, regular_classes_enabled,
            source_or_authority, updated_by)
         VALUES ($1::date, $1::date, 'holiday', 'Libur kampus DEMO — belum dikonfirmasi', false, 'DEMO_SEED', $3),
                ($2::date, $4::date, 'break', 'Periode libur DEMO — belum dikonfirmasi', false, 'DEMO_SEED', $3)`,
        [holidayDate, breakStart, USERS.academic, breakEnd],
      );
    }

    const config = await getClockConfig(client, now);
    const timezone = config.settings.timezone;

    const pendingId = "e0000000-0000-4000-8000-000000000001";
    const pendingExists = await client.query("SELECT id FROM booking_requests WHERE id = $1", [pendingId]);
    if (!pendingExists.rows[0]) {
      const date = nextWeekday(now, 5, timezone);
      const startAt = combineDateAndTime(date, "09:00", timezone);
      const endAt = combineDateAndTime(date, "11:00", timezone);
      const target = addOperationalMinutes(now, config.settings.decisionTargetMinutes, config);
      const hold = addOperationalMinutes(now, config.settings.holdLimitMinutes, config);
      await client.query(
        `INSERT INTO booking_requests
           (id, requester_id, organization_id, org_position_snapshot, activity_name, activity_purpose,
            activity_type, participant_count, required_facilities, room_id, start_at, end_at,
            status, slot_held, submitted_at, decision_target_at, hold_expires_at,
            organization_name_snapshot)
         VALUES ($1,$2,$3,'Ketua','Workshop Portofolio Mahasiswa (DEMO)',
                 'Pelatihan penyusunan portofolio karya untuk mahasiswa baru program desain.',
                 'workshop', 35, '{proyektor,ac,wifi}', $4, $5, $6,
                 'pending_academic', true, now(), $7, $8, 'BEM IDB Bali (DEMO)')`,
        [pendingId, USERS.student1, ORGS.bem, ROOMS[4].id, startAt, endAt, target, hold],
      );
    }

    const approvedId = "e0000000-0000-4000-8000-000000000002";
    const approvedExists = await client.query("SELECT id FROM booking_requests WHERE id = $1", [approvedId]);
    if (!approvedExists.rows[0]) {
      const date = nextWeekday(now, 12, timezone);
      const startAt = combineDateAndTime(date, "13:00", timezone);
      const endAt = combineDateAndTime(date, "15:00", timezone);
      const target = addOperationalMinutes(now, config.settings.decisionTargetMinutes, config);
      const hold = addOperationalMinutes(now, config.settings.holdLimitMinutes, config);
      await client.query(
        `INSERT INTO booking_requests
           (id, requester_id, organization_id, org_position_snapshot, activity_name, activity_purpose,
            activity_type, participant_count, required_facilities, room_id, start_at, end_at,
            status, slot_held, submitted_at, decision_target_at, hold_expires_at,
            decision_by, decision_at, decision_reason, organization_name_snapshot)
         VALUES ($1,$2,$3,'Sekretaris','Seminar Kreatif Mahasiswa (DEMO)',
                 'Seminar terbuka mengenai karier kreatif dan kolaborasi lintas program studi.',
                 'seminar', 120, '{sound_system,ac,wifi}', $4, $5, $6,
                 'approved', true, now(), $7, $8, $9, now(), 'Disetujui pada data DEMO.', 'HIMA Desain (DEMO)')`,
        [approvedId, USERS.student2, ORGS.hima, ROOMS[1].id, startAt, endAt, target, hold, USERS.academic],
      );
    }

    await client.query(
      `INSERT INTO audit_logs (actor_id, actor_label, action, entity_type, reason)
       VALUES ($1, 'seed', 'demo.seeded', 'system', 'Seed data DEMO dijalankan. Data bukan data resmi kampus.')`,
      [USERS.admin],
    );
  });

  // Memo generation happens outside the seed transaction; failures must not
  // invalidate the approved demo booking.
  try {
    const approved = await query<{ id: string }>(
      "SELECT id FROM booking_requests WHERE id = 'e0000000-0000-4000-8000-000000000002'",
    );
    if (approved[0]) {
      const academic = await query<{ id: string; full_name: string; login_id: string; role: string }>(
        "SELECT id, full_name, login_id, role FROM users WHERE id = $1",
        [USERS.academic],
      );
      if (academic[0]) {
        await generateInternalMemo(approved[0].id, {
          id: academic[0].id,
          fullName: academic[0].full_name,
          loginId: academic[0].login_id,
          role: "academic",
          nim: null,
          programStudy: null,
          faculty: null,
          organizationId: null,
          organizationName: null,
          organizationCode: null,
          orgPosition: null,
          contactEmail: null,
          contactPhone: null,
          isDemo: true,
        });
      }
    }
  } catch (error) {
    console.warn("[seed] memo demo tidak dapat dibuat (booking tetap valid):", error);
  }

  console.log("[seed] selesai.");
  console.log(`[seed] ${STUDENT_DIRECTORY.length} mahasiswa DEMO dibuat (NIM 20240001-20240100).`);
  console.log(`[seed] akun demo (password: ${DEMO_PASSWORD}):`);
  console.log("  Mahasiswa       : 20240001 s.d. 20240100");
  console.log("  Mahasiswa BEM   : 20240001");
  console.log("  Mahasiswa HIMA  : 20240002");
  console.log("  Akademik        : akademik");
  console.log("  Pengelola fasil.: fasilitas");
  console.log("  Keamanan        : keamanan");
  console.log("  Admin IT        : admin");
  await closePool();
}

main().catch(async (error) => {
  console.error("[seed] gagal", error);
  await closePool().catch(() => undefined);
  process.exit(1);
});
