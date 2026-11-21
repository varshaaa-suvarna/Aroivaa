CREATE INDEX idx_patients_name ON patients (lower(full_name));
CREATE INDEX idx_patients_dob ON patients (date_of_birth);
CREATE INDEX idx_links_facility ON hospital_patient_links (facility_id, local_patient_id);
CREATE INDEX idx_enc_patient ON encounters (patient_id, encounter_at DESC);
CREATE INDEX idx_access_patient ON access_logs (patient_id, at DESC);
CREATE INDEX idx_ref_to ON referrals (to_facility_id, status);
CREATE INDEX idx_scr_patient ON screenings (patient_id, screened_at DESC);
