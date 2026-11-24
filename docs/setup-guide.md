# Setup (Windows PowerShell)
1. pgAdmin: create database `arovia`; open Query Tool; run `database/schema.sql`, then `database/indexes.sql`, then migrations `002_quality_and_model.sql` through `011_patient_sharing_password.sql` in numeric order. These migrations are also required for an existing installation. Migration 006 converts old Registration Staff accounts to inactive Hospital Admin accounts, retaining facility, email, and credentials for review before reactivation; this avoids silently granting elevated privileges.
2. Backend:
   cd backend; python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt
   copy .env.example .env   (edit DATABASE_URL and JWT_SECRET), then load it into the session:
   Get-Content .env | % { if ($_ -match '^(\w+)=(.*)$') { Set-Item "env:$($Matches[1])" $Matches[2] } }
   python create_super_admin.py you@example.org "Your Name"
   uvicorn app.main:app --reload --port 8000     (docs at http://localhost:8000/docs)
3. Frontend: cd frontend; npm install; npm run dev  -> http://localhost:5173
4. Hospital onboarding: a hospital submits its application from the login screen. The Super Admin reviews it in Hospital Applications and sets the status to APPROVED. Arovia creates the facility and opens the Hospital Admin setup form, where the Super Admin enters the administrator's name, email, and initial password. Saving the account activates the hospital so its administrator can sign in and add staff. If the Super Admin leaves before creating the account, use Create Hospital Admin on that approved application to continue.

## Cross-hospital sharing consent

Each new patient receives a randomly generated, readable sharing password (for example, `AROVIA-4821`) at registration. The database stores only its bcrypt hash; the registration screen displays the password once with a Copy button so staff can provide it to the patient. For an older patient without a password, the linked hospital can create one from the patient's profile and give it to the patient once.

At the patient's current hospital, an authorized doctor or hospital administrator records documented consent for a specific active participating hospital. The receiving hospital searches by Arovia Patient ID and enters the patient's sharing password. After verification, staff at that hospital can view permitted clinical records for 60 minutes. Five failed password attempts lock verification for that patient and hospital for 15 minutes. Access is facility-scoped, and verification, failed attempts, record views, and encounter creation are written to the audit log. Consent revocation also ends the active access grant. Receiving hospitals add their own encounters as new records; previous hospital encounters remain unchanged. No SMS or OTP provider configuration is required.
No demo accounts or demo clinical data are shipped.
