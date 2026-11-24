ALTER TABLE diagnoses ADD COLUMN IF NOT EXISTS diagnosed_by BIGINT REFERENCES users(id);
ALTER TABLE prescriptions ADD COLUMN IF NOT EXISTS prescribed_by BIGINT REFERENCES users(id);

-- Existing doctor-entered rows retain that provider as the clinical author.
UPDATE diagnoses d SET diagnosed_by=d.recorded_by
  FROM users u WHERE d.diagnosed_by IS NULL AND u.id=d.recorded_by AND u.role='DOCTOR';
UPDATE prescriptions p SET prescribed_by=p.recorded_by
  FROM users u WHERE p.prescribed_by IS NULL AND u.id=p.recorded_by AND u.role='DOCTOR';
