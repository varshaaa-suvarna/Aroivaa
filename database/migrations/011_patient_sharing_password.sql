ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS sharing_password_hash TEXT;

CREATE TABLE IF NOT EXISTS patient_sharing_access_grants (
  id BIGSERIAL PRIMARY KEY,
  patient_id BIGINT NOT NULL REFERENCES patients(id),
  facility_id BIGINT NOT NULL REFERENCES facilities(id),
  granted_by BIGINT NOT NULL REFERENCES users(id),
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  UNIQUE(patient_id, facility_id)
);

CREATE TABLE IF NOT EXISTS patient_sharing_access_attempts (
  patient_id BIGINT NOT NULL REFERENCES patients(id),
  facility_id BIGINT NOT NULL REFERENCES facilities(id),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(patient_id, facility_id)
);

CREATE INDEX IF NOT EXISTS patient_sharing_grant_active_idx
  ON patient_sharing_access_grants(patient_id, facility_id, expires_at)
  WHERE revoked_at IS NULL;
