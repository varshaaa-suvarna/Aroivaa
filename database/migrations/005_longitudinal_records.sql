-- Backward-compatible additions for longitudinal medical records.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS blood_group TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_name TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_relationship TEXT;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS emergency_contact_phone TEXT;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS symptoms TEXT;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS observations TEXT;
ALTER TABLE encounters ADD COLUMN IF NOT EXISTS examination_findings TEXT;
ALTER TABLE diagnoses ADD COLUMN IF NOT EXISTS identified_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE diagnoses ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS instructions TEXT;
ALTER TABLE allergies ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE allergies ADD COLUMN IF NOT EXISTS facility_id BIGINT REFERENCES facilities(id);
UPDATE allergies a SET facility_id=u.facility_id FROM users u WHERE a.recorded_by=u.id AND a.facility_id IS NULL;

DO $$ BEGIN
  ALTER TABLE patients ADD CONSTRAINT patients_blood_group_check
    CHECK (blood_group IS NULL OR blood_group IN ('A+','A-','B+','B-','AB+','AB-','O+','O-','UNKNOWN'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE diagnoses ADD CONSTRAINT diagnoses_status_check CHECK(status IN ('ACTIVE','RESOLVED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS patient_history_items(
 id BIGSERIAL PRIMARY KEY,
 patient_id BIGINT NOT NULL REFERENCES patients(id),
 encounter_id BIGINT REFERENCES encounters(id),
 facility_id BIGINT NOT NULL REFERENCES facilities(id),
 category TEXT NOT NULL CHECK(category IN ('CONDITION','CARDIAC','DIABETES','HYPERTENSION','ALLERGY','MEDICATION','SURGERY','OTHER')),
 description TEXT NOT NULL,
 source_type TEXT NOT NULL CHECK(source_type IN ('PATIENT_REPORTED','CLINICIAN_RECORDED')),
 verified_by BIGINT REFERENCES users(id),
 recorded_by BIGINT NOT NULL REFERENCES users(id),
 recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS investigations(
 id BIGSERIAL PRIMARY KEY,
 patient_id BIGINT NOT NULL REFERENCES patients(id),
 encounter_id BIGINT REFERENCES encounters(id),
 facility_id BIGINT NOT NULL REFERENCES facilities(id),
 kind TEXT NOT NULL CHECK(kind IN ('LABORATORY','IMAGING','OTHER')),
 name TEXT NOT NULL,
 result TEXT,
 report_ref TEXT,
 performed_at TIMESTAMPTZ,
 recorded_by BIGINT NOT NULL REFERENCES users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS patient_history_patient_date_idx ON patient_history_items(patient_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS investigations_patient_date_idx ON investigations(patient_id, created_at DESC);

