-- Arovia schema v1 (PostgreSQL). Run in pgAdmin Query Tool on an empty database "arovia".
CREATE TABLE facilities(
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
 registration_no TEXT, address TEXT, district TEXT DEFAULT 'Dakshina Kannada',
 phone TEXT, email TEXT,
 listing_status TEXT NOT NULL DEFAULT 'LISTED' CHECK (listing_status IN ('LISTED','UNLISTED')),
 verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN ('UNVERIFIED','VERIFIED')),
 participation_status TEXT NOT NULL DEFAULT 'NOT_JOINED' CHECK (participation_status IN ('NOT_JOINED','ONBOARDING_IN_PROGRESS','ACTIVE','SUSPENDED','REVOKED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE hospital_applications(
 id BIGSERIAL PRIMARY KEY, facility_id BIGINT REFERENCES facilities(id),
 hospital_name TEXT NOT NULL, category TEXT NOT NULL, registration_no TEXT, address TEXT, phone TEXT, email TEXT,
 rep_name TEXT NOT NULL, rep_designation TEXT, rep_contact TEXT,
 status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','DOCUMENTS_PENDING','DOCUMENTS_UNDER_REVIEW','VERIFICATION_IN_PROGRESS','CLARIFICATION_REQUIRED','APPROVED','REJECTED','ONBOARDING_IN_PROGRESS','ACTIVE','SUSPENDED','REVOKED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE facility_documents(
 id BIGSERIAL PRIMARY KEY, application_id BIGINT NOT NULL REFERENCES hospital_applications(id),
 doc_type TEXT NOT NULL, storage_ref TEXT NOT NULL, uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE users(
 id BIGSERIAL PRIMARY KEY, email TEXT NOT NULL UNIQUE, full_name TEXT NOT NULL, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN','HOSPITAL_ADMIN','DOCTOR','OPTOMETRIST','REGISTRATION')),
 facility_id BIGINT REFERENCES facilities(id), is_active BOOLEAN NOT NULL DEFAULT true,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK ((role='SUPER_ADMIN') = (facility_id IS NULL)));
CREATE TABLE application_status_history(
 id BIGSERIAL PRIMARY KEY, application_id BIGINT NOT NULL REFERENCES hospital_applications(id),
 from_status TEXT, to_status TEXT NOT NULL, decided_by BIGINT REFERENCES users(id), note TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE patients(
 id BIGSERIAL PRIMARY KEY, arovia_id TEXT NOT NULL UNIQUE DEFAULT ('AR-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,10))),
 full_name TEXT NOT NULL, date_of_birth DATE NOT NULL, sex TEXT CHECK (sex IN ('F','M','O','U')),
 phone TEXT, address TEXT, abha_id TEXT, identity_verification TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (identity_verification IN ('UNVERIFIED','VERIFIED')),
 is_demo BOOLEAN NOT NULL DEFAULT false, created_by BIGINT REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE hospital_patient_links(
 id BIGSERIAL PRIMARY KEY, patient_id BIGINT NOT NULL REFERENCES patients(id), facility_id BIGINT NOT NULL REFERENCES facilities(id),
 local_patient_id TEXT NOT NULL, UNIQUE(facility_id, local_patient_id), UNIQUE(patient_id, facility_id));
CREATE TABLE encounters(
 id BIGSERIAL PRIMARY KEY, patient_id BIGINT NOT NULL REFERENCES patients(id), facility_id BIGINT NOT NULL REFERENCES facilities(id),
 encounter_at TIMESTAMPTZ NOT NULL DEFAULT now(), encounter_type TEXT NOT NULL, doctor_id BIGINT REFERENCES users(id),
 clinical_notes TEXT, treatment TEXT, follow_up TEXT, created_by BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE diagnoses(
 id BIGSERIAL PRIMARY KEY, encounter_id BIGINT NOT NULL REFERENCES encounters(id), patient_id BIGINT NOT NULL REFERENCES patients(id),
 description TEXT NOT NULL, icd10_code TEXT, recorded_by BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE prescriptions(
 id BIGSERIAL PRIMARY KEY, encounter_id BIGINT NOT NULL REFERENCES encounters(id), patient_id BIGINT NOT NULL REFERENCES patients(id),
 medication TEXT NOT NULL, dosage TEXT, frequency TEXT, duration TEXT, recorded_by BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE allergies(
 id BIGSERIAL PRIMARY KEY, patient_id BIGINT NOT NULL REFERENCES patients(id), substance TEXT NOT NULL, reaction TEXT, severity TEXT,
 recorded_by BIGINT NOT NULL REFERENCES users(id), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE consent_records(
 id BIGSERIAL PRIMARY KEY, patient_id BIGINT NOT NULL REFERENCES patients(id), purpose TEXT NOT NULL, data_categories TEXT[] NOT NULL,
 granted_to_facility_id BIGINT NOT NULL REFERENCES facilities(id), valid_from DATE NOT NULL DEFAULT CURRENT_DATE, valid_until DATE,
 status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED','EXPIRED')),
 recorded_by BIGINT NOT NULL REFERENCES users(id), evidence_ref TEXT, revoked_at TIMESTAMPTZ, revoked_by BIGINT REFERENCES users(id), revocation_reason TEXT);
CREATE TABLE access_logs(
 id BIGSERIAL PRIMARY KEY, user_id BIGINT REFERENCES users(id), facility_id BIGINT, patient_id BIGINT, action TEXT NOT NULL, resource TEXT,
 outcome TEXT NOT NULL CHECK (outcome IN ('ALLOWED','DENIED')), reason TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE ml_models(
 id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, endpoint_url TEXT, is_active BOOLEAN NOT NULL DEFAULT false, UNIQUE(name,version));
CREATE TABLE screenings(
 id BIGSERIAL PRIMARY KEY, patient_id BIGINT NOT NULL REFERENCES patients(id), encounter_id BIGINT NOT NULL REFERENCES encounters(id),
 facility_id BIGINT NOT NULL REFERENCES facilities(id), eye TEXT NOT NULL CHECK (eye IN ('RIGHT','LEFT','BOTH')),
 screened_at TIMESTAMPTZ NOT NULL DEFAULT now(), quality_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (quality_status IN ('PENDING','ACCEPTABLE','POOR')),
 status TEXT NOT NULL DEFAULT 'IMAGE_UPLOADED' CHECK (status IN ('IMAGE_UPLOADED','AWAITING_MODEL','AI_COMPLETE','REVIEWED')),
 performed_by BIGINT NOT NULL REFERENCES users(id));
CREATE TABLE retinal_images(
 id BIGSERIAL PRIMARY KEY, screening_id BIGINT NOT NULL REFERENCES screenings(id), eye TEXT NOT NULL, storage_ref TEXT NOT NULL,
 content_type TEXT NOT NULL, size_bytes BIGINT NOT NULL, sha256 TEXT NOT NULL);
CREATE TABLE screening_predictions(
 id BIGSERIAL PRIMARY KEY, screening_id BIGINT NOT NULL REFERENCES screenings(id), model_id BIGINT NOT NULL REFERENCES ml_models(id),
 dr_grade SMALLINT NOT NULL CHECK (dr_grade BETWEEN 0 AND 4), confidence NUMERIC(5,4) NOT NULL CHECK (confidence BETWEEN 0 AND 1), created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE screening_reviews(
 id BIGSERIAL PRIMARY KEY, screening_id BIGINT NOT NULL REFERENCES screenings(id), reviewer_id BIGINT NOT NULL REFERENCES users(id),
 final_grade SMALLINT NOT NULL CHECK (final_grade BETWEEN 0 AND 4), assessment TEXT NOT NULL, recommendations TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE referrals(
 id BIGSERIAL PRIMARY KEY, patient_id BIGINT NOT NULL REFERENCES patients(id), from_facility_id BIGINT NOT NULL REFERENCES facilities(id),
 from_doctor_id BIGINT NOT NULL REFERENCES users(id), to_facility_id BIGINT NOT NULL REFERENCES facilities(id), to_specialist_id BIGINT REFERENCES users(id),
 specialty TEXT NOT NULL, reason TEXT NOT NULL, clinical_notes TEXT, priority TEXT NOT NULL DEFAULT 'ROUTINE' CHECK (priority IN ('ROUTINE','URGENT','EMERGENCY')),
 encounter_id BIGINT REFERENCES encounters(id), screening_id BIGINT REFERENCES screenings(id),
 status TEXT NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED','SENT','ACCEPTED','REJECTED','IN_PROGRESS','COMPLETED','CANCELLED')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now());
CREATE TABLE referral_status_history(
 id BIGSERIAL PRIMARY KEY, referral_id BIGINT NOT NULL REFERENCES referrals(id), from_status TEXT, to_status TEXT NOT NULL,
 changed_by BIGINT NOT NULL REFERENCES users(id), note TEXT, at TIMESTAMPTZ NOT NULL DEFAULT now());
-- NOTE: if you created the DB before migration 002, run database/migrations/002_quality_and_model.sql
