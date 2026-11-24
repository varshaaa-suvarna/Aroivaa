# API: interactive docs at /docs when the backend runs (OpenAPI).

## Cross-hospital patient sharing

- `POST /api/patients` registers a patient and returns a randomly generated `sharing_password` once. Store and share it with the patient; PostgreSQL retains only its bcrypt hash.
- `POST /api/patients/{patient_id}/consents` records the linked hospital's documented consent for a specific active receiving hospital. Consent must include `CLINICAL` or `ALL` data categories.
- `POST /api/patients/share-access` accepts `{ "arovia_id": "AR-…", "sharing_password": "…" }`. A matching password, active consent, and active receiving hospital create a facility-scoped grant for 60 minutes.
- The receiving hospital can then use the normal patient profile and clinical record endpoints. It can append encounters and clinical data linked to encounters at its own facility. It cannot edit the source hospital's encounters or the patient's demographics.
- Five failed password attempts for the same patient and receiving hospital lock verification for 15 minutes. Successful verification resets the counter. Failed attempts and access to records are audited.
- `POST /api/patients/{patient_id}/consents/{consent_id}/revoke` revokes consent and its active sharing grant. No OTP or SMS service is used.
