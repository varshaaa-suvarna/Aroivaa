-- Migration 003: Add gradcam_storage_ref to screening_predictions
ALTER TABLE screening_predictions ADD COLUMN IF NOT EXISTS gradcam_storage_ref TEXT;
