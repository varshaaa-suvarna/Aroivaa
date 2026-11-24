ALTER TABLE allergies ADD COLUMN IF NOT EXISTS encounter_id BIGINT REFERENCES encounters(id);
ALTER TABLE patient_history_items ADD COLUMN IF NOT EXISTS encounter_id BIGINT REFERENCES encounters(id);
