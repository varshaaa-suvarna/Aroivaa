# Setup (Windows PowerShell)
1. pgAdmin: create database `arovia`; open Query Tool; run `database/schema.sql`, then `database/indexes.sql`.
2. Backend:
   cd backend; python -m venv .venv; .\.venv\Scripts\Activate.ps1; pip install -r requirements.txt
   copy .env.example .env   (edit DATABASE_URL and JWT_SECRET), then load it into the session:
   Get-Content .env | % { if ($_ -match '^(\w+)=(.*)$') { Set-Item "env:$($Matches[1])" $Matches[2] } }
   python create_super_admin.py you@example.org "Your Name"
   uvicorn app.main:app --reload --port 8000     (docs at http://localhost:8000/docs)
3. Frontend: cd frontend; npm install; npm run dev  -> http://localhost:5173
4. Super Admin: a hospital applies via POST /api/applications; move it to ONBOARDING_IN_PROGRESS to create the facility. Create the first Hospital Admin for that facility with an SQL INSERT into users (bcrypt hash via create_super_admin.py logic); afterwards the admin adds staff at POST /api/staff.
No demo accounts or demo clinical data are shipped.
