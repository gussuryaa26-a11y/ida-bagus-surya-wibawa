-- Sistem Peminjaman Ruangan Kampus IDB Bali
-- Initial schema. All timestamps are stored as timestamptz (server truth).

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TYPE user_role AS ENUM ('student', 'academic', 'facility_manager', 'security', 'admin_it');
CREATE TYPE room_category AS ENUM ('classroom', 'multipurpose', 'hall');
CREATE TYPE booking_status AS ENUM (
  'draft',
  'pending_academic',
  'revision_requested',
  'approved',
  'rejected',
  'expired',
  'cancellation_requested',
  'cancelled',
  'cancel_rejected'
);
CREATE TYPE cancellation_status AS ENUM ('requested', 'approved', 'rejected');
CREATE TYPE restriction_type AS ENUM ('closure', 'maintenance', 'restriction');
CREATE TYPE calendar_type AS ENUM ('holiday', 'break', 'semester', 'exception');
CREATE TYPE import_status AS ENUM ('preview', 'partial', 'success', 'failed');
CREATE TYPE memo_status AS ENUM ('pending', 'generating', 'ready', 'failed');
CREATE TYPE memo_template_kind AS ENUM ('demo', 'official');
CREATE TYPE notification_channel AS ENUM ('in_app', 'email');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE revision_hold_policy AS ENUM ('release', 'hold_limited');

CREATE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,
  is_demo boolean NOT NULL DEFAULT true,
  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  login_id text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  nim text,
  program_study text,
  faculty text,
  organization_id uuid REFERENCES organizations(id) ON DELETE RESTRICT,
  org_position text,
  contact_email text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_organization_idx ON users(organization_id);
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  user_agent text,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
CREATE INDEX sessions_expires_idx ON sessions(expires_at);

CREATE TABLE operational_settings (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  timezone text NOT NULL DEFAULT 'Asia/Makassar',
  workdays smallint[] NOT NULL DEFAULT '{1,2,3,4,5}',
  open_time time NOT NULL DEFAULT '08:00',
  close_time time NOT NULL DEFAULT '16:00',
  decision_target_minutes integer NOT NULL DEFAULT 60 CHECK (decision_target_minutes > 0),
  hold_limit_minutes integer NOT NULL DEFAULT 180 CHECK (hold_limit_minutes > 0),
  revision_hold_policy revision_hold_policy NOT NULL DEFAULT 'release',
  revision_hold_minutes integer,
  booking_buffer_minutes integer NOT NULL DEFAULT 0 CHECK (booking_buffer_minutes >= 0),
  schedule_freshness_days integer NOT NULL DEFAULT 120 CHECK (schedule_freshness_days > 0),
  require_fresh_schedule boolean NOT NULL DEFAULT true,
  require_org_position boolean NOT NULL DEFAULT true,
  allow_demo_room_data boolean NOT NULL DEFAULT true,
  notification_channels text[] NOT NULL DEFAULT '{in_app}',
  memo_template_kind memo_template_kind NOT NULL DEFAULT 'demo',
  memo_official_template_path text,
  memo_document_prefix text NOT NULL DEFAULT 'DEMO',
  data_retention_days integer,
  is_confirmed boolean NOT NULL DEFAULT false,
  confirmed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  confirmed_at timestamptz,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_settings_close_after_open CHECK (close_time > open_time),
  CONSTRAINT operational_settings_revision_hold CHECK (
    revision_hold_policy <> 'hold_limited' OR revision_hold_minutes > 0
  )
);
CREATE TRIGGER operational_settings_updated_at BEFORE UPDATE ON operational_settings
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO operational_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE operational_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exception_date date NOT NULL UNIQUE,
  is_closed boolean NOT NULL DEFAULT false,
  open_time time,
  close_time time,
  description text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operational_exceptions_hours CHECK (
    is_closed = true OR (open_time IS NOT NULL AND close_time IS NOT NULL AND close_time > open_time)
  )
);

CREATE TABLE rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  category room_category NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  capacity_verified boolean NOT NULL DEFAULT false,
  facilities text[] NOT NULL DEFAULT '{}',
  facilities_verified boolean NOT NULL DEFAULT false,
  description text,
  location text,
  image_path text,
  image_note text,
  is_active boolean NOT NULL DEFAULT true,
  is_demo_data boolean NOT NULL DEFAULT true,
  data_source text NOT NULL DEFAULT 'DEMO',
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX rooms_category_idx ON rooms(category);
CREATE TRIGGER rooms_updated_at BEFORE UPDATE ON rooms
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE room_restrictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  restriction_type restriction_type NOT NULL,
  reason text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT room_restrictions_time CHECK (end_at > start_at)
);
CREATE INDEX room_restrictions_room_time_idx ON room_restrictions(room_id, start_at, end_at);

CREATE TABLE academic_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  calendar_type calendar_type NOT NULL,
  description text NOT NULL,
  regular_classes_enabled boolean NOT NULL DEFAULT true,
  source_or_authority text NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT academic_calendar_period CHECK (period_end >= period_start)
);
CREATE INDEX academic_calendar_period_idx ON academic_calendar(period_start, period_end);

CREATE TABLE schedule_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  source text NOT NULL,
  source_version text NOT NULL,
  imported_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status import_status NOT NULL DEFAULT 'preview',
  total_rows integer NOT NULL DEFAULT 0,
  success_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE class_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
  start_time time NOT NULL,
  end_time time NOT NULL,
  effective_from date NOT NULL,
  effective_until date NOT NULL,
  semester_label text NOT NULL,
  course_name text,
  source_version text NOT NULL,
  import_id uuid REFERENCES schedule_imports(id) ON DELETE SET NULL,
  last_imported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_schedules_time CHECK (end_time > start_time),
  CONSTRAINT class_schedules_period CHECK (effective_until >= effective_from)
);
CREATE INDEX class_schedules_room_day_idx ON class_schedules(room_id, day_of_week, effective_from, effective_until);

CREATE TABLE booking_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
  org_position_snapshot text,
  activity_name text NOT NULL,
  activity_purpose text NOT NULL,
  activity_type text NOT NULL,
  participant_count integer NOT NULL CHECK (participant_count > 0),
  required_facilities text[] NOT NULL DEFAULT '{}',
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE RESTRICT,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  status booking_status NOT NULL DEFAULT 'pending_academic',
  slot_held boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decision_target_at timestamptz NOT NULL,
  hold_expires_at timestamptz NOT NULL,
  late_notified_at timestamptz,
  revision_deadline_at timestamptz,
  decision_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decision_at timestamptz,
  decision_reason text,
  idempotency_key text,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_requests_time CHECK (end_at > start_at),
  CONSTRAINT booking_requests_hold_limit CHECK (hold_expires_at >= decision_target_at),
  CONSTRAINT booking_requests_active_decision CHECK (
    status NOT IN ('approved', 'rejected', 'expired')
    OR decision_at IS NOT NULL
    OR status = 'expired'
  ),
  CONSTRAINT booking_no_overlap EXCLUDE USING gist (
    room_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (slot_held)
);
CREATE INDEX booking_requests_requester_idx ON booking_requests(requester_id, created_at DESC);
CREATE INDEX booking_requests_status_idx ON booking_requests(status, submitted_at);
CREATE INDEX booking_requests_room_time_idx ON booking_requests(room_id, start_at, end_at);
CREATE UNIQUE INDEX booking_requests_idempotency_idx
  ON booking_requests(requester_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE TRIGGER booking_requests_updated_at BEFORE UPDATE ON booking_requests
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE booking_cancellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES booking_requests(id) ON DELETE RESTRICT,
  requested_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  reason text NOT NULL,
  status cancellation_status NOT NULL DEFAULT 'requested',
  decision_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decision_at timestamptz,
  decision_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX booking_cancellations_booking_idx ON booking_cancellations(booking_id, created_at DESC);
CREATE UNIQUE INDEX booking_cancellations_one_open_idx
  ON booking_cancellations(booking_id) WHERE status = 'requested';
CREATE TRIGGER booking_cancellations_updated_at BEFORE UPDATE ON booking_cancellations
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE internal_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES booking_requests(id) ON DELETE RESTRICT,
  document_version integer NOT NULL DEFAULT 1,
  template_version text NOT NULL,
  template_kind memo_template_kind NOT NULL,
  document_number text,
  file_reference text,
  generation_status memo_status NOT NULL DEFAULT 'pending',
  error_message text,
  generated_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, document_version)
);
CREATE INDEX internal_memos_booking_idx ON internal_memos(booking_id);
CREATE TRIGGER internal_memos_updated_at BEFORE UPDATE ON internal_memos
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  related_entity_type text,
  related_entity_id uuid,
  title text NOT NULL,
  body text NOT NULL,
  delivery_channel notification_channel NOT NULL DEFAULT 'in_app',
  delivery_status notification_status NOT NULL DEFAULT 'pending',
  read_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX notifications_recipient_idx ON notifications(recipient_id, read_at, created_at DESC);

CREATE TABLE post_approval_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES booking_requests(id) ON DELETE CASCADE,
  conflict_type text NOT NULL,
  source_entity_type text NOT NULL,
  source_entity_id uuid,
  source_change text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  notified_at timestamptz,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX post_approval_conflicts_booking_idx ON post_approval_conflicts(booking_id);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid,
  actor_label text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX audit_logs_created_idx ON audit_logs(created_at DESC);

CREATE FUNCTION forbid_audit_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs are append-only';
END;
$$;
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
