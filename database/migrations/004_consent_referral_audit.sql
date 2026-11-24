-- Supports consent lookup and review of longitudinal access/referral activity.
CREATE INDEX IF NOT EXISTS consent_active_facility_patient_idx
  ON consent_records(patient_id, granted_to_facility_id, valid_from, valid_until)
  WHERE status='ACTIVE';

CREATE INDEX IF NOT EXISTS access_logs_patient_at_idx
  ON access_logs(patient_id, at DESC);

CREATE INDEX IF NOT EXISTS referral_history_referral_at_idx
  ON referral_status_history(referral_id, at);
