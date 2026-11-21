import re
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from ..core import *
r = APIRouter()

NAME_REGEX = re.compile(r"^[A-Za-z\s.'-]{2,100}$")

class HospitalAdminCreate(BaseModel):
    email: EmailStr
    full_name: str
    password: str


@r.post("/facilities/{fid}/admin")
def create_hospital_admin(
    fid: int,
    b: HospitalAdminCreate,
    u=Depends(need("SUPER_ADMIN")),
    c=Depends(db)
):
    name = b.full_name.strip()
    if any(ch.isdigit() for ch in name):
        raise HTTPException(422, "Admin full name cannot contain numbers. Only letters and standard name characters are allowed.")
    if not NAME_REGEX.match(name) or not any(ch.isalpha() for ch in name):
        raise HTTPException(422, "Admin full name must be at least 2 characters and contain only letters.")
    if len(b.password) < 10:
        raise HTTPException(422, "Password must be at least 10 characters")

    facility = c.execute(
        "SELECT id, name, verification_status FROM facilities WHERE id=%s",
        (fid,)
    ).fetchone()

    if not facility:
        raise HTTPException(404, "Facility not found")

    if facility["verification_status"] != "VERIFIED":
        raise HTTPException(400, "Hospital must be verified first")

    existing = c.execute(
        "SELECT id FROM users WHERE email=%s",
        (b.email.lower(),)
    ).fetchone()

    if existing:
        raise HTTPException(409, "Email already exists")

    row = c.execute(
        """INSERT INTO users
        (email, full_name, password_hash, role, facility_id)
        VALUES (%s, %s, %s, 'HOSPITAL_ADMIN', %s)
        RETURNING id, email, full_name, role, facility_id""",
        (b.email.lower(), b.full_name, hash_pw(b.password), fid)
    ).fetchone()

    audit(c, u, "CREATE_HOSPITAL_ADMIN", f"facility:{fid}")

    return {
        "message": "Hospital Admin created successfully",
        "account": row,
        "hospital": facility["name"]
    }
class Login(BaseModel):
    email: EmailStr
    password: str
    role: str | None = None

@r.post("/auth/login")
def login(b: Login, c=Depends(db)):
    u = c.execute("SELECT * FROM users WHERE email=%s AND is_active", (b.email.lower(),)).fetchone()
    if not u or not check_pw(b.password, u["password_hash"]):
        audit(c, None, "LOGIN", b.email, "DENIED", reason="invalid credentials")
        raise HTTPException(401, "Invalid credentials")
    if b.role and b.role != u["role"]:
        audit(c, u, "LOGIN", "session", "DENIED", reason=f"role mismatch: expected {b.role}, got {u['role']}")
        raise HTTPException(403, "The selected role does not match this account.")
    audit(c, u, "LOGIN", "session")
    return {"token": make_token(u), "user": {k: u[k] for k in ("id", "email", "full_name", "role", "facility_id")}}
@r.get("/auth/me")
def me(u=Depends(current_user)): return u
class Staff(BaseModel): email: EmailStr; full_name: str; password: str; role: str
@r.post("/staff")
def add_staff(b: Staff, u=Depends(need("HOSPITAL_ADMIN")), c=Depends(db)):
    if b.role not in ("HOSPITAL_ADMIN", "DOCTOR", "OPTOMETRIST", "REGISTRATION"):
        raise HTTPException(422, "Invalid staff role")
    if len(b.password) < 10:
        raise HTTPException(422, "Password must be at least 10 characters")
    name = b.full_name.strip()
    if any(ch.isdigit() for ch in name):
        raise HTTPException(422, "Staff full name cannot contain numbers. Only letters and standard name characters are allowed.")
    if not NAME_REGEX.match(name) or not any(ch.isalpha() for ch in name):
        raise HTTPException(422, "Staff full name must be at least 2 characters and contain only letters.")
    row = c.execute("INSERT INTO users(email,full_name,password_hash,role,facility_id) VALUES(%s,%s,%s,%s,%s) RETURNING id", (b.email.lower(), name, hash_pw(b.password), b.role, u["facility_id"])).fetchone()
    audit(c, u, "CREATE_STAFF", f"user:{row['id']}"); return row
@r.get("/staff")
def staff(u=Depends(need("HOSPITAL_ADMIN")), c=Depends(db)):
    return c.execute("SELECT id,email,full_name,role,is_active,created_at FROM users WHERE facility_id=%s ORDER BY full_name", (u["facility_id"],)).fetchall()

class StaffStatus(BaseModel):
    is_active: bool

@r.patch("/staff/{uid}/status")
def toggle_staff_status(uid: int, b: StaffStatus, u=Depends(need("HOSPITAL_ADMIN")), c=Depends(db)):
    s = c.execute("SELECT id, role, facility_id FROM users WHERE id=%s AND facility_id=%s", (uid, u["facility_id"])).fetchone()
    if not s:
        raise HTTPException(404, "Staff member not found in your facility")
    if s["id"] == u["id"]:
        raise HTTPException(400, "Cannot change your own account status")
    c.execute("UPDATE users SET is_active=%s WHERE id=%s", (b.is_active, uid))
    audit(c, u, "TOGGLE_STAFF_STATUS", f"user:{uid}:{b.is_active}")
    return {"ok": True, "id": uid, "is_active": b.is_active}

@r.get("/facilities/{fid}")
def get_facility(fid: int, u=Depends(current_user), c=Depends(db)):
    f = c.execute("SELECT * FROM facilities WHERE id=%s", (fid,)).fetchone()
    if not f:
        raise HTTPException(404, "Facility not found")
    return f
class App(BaseModel): hospital_name: str; category: str; registration_no: str | None = None; address: str | None = None; phone: str | None = None; email: str | None = None; rep_name: str; rep_designation: str | None = None; rep_contact: str | None = None
@r.post("/applications")
def submit_app(b: App, c=Depends(db)):  # public: a hospital applies before it has any accounts
    rep = b.rep_name.strip()
    if any(ch.isdigit() for ch in rep):
        raise HTTPException(422, "Representative name cannot contain numbers.")
    a = c.execute("INSERT INTO hospital_applications(hospital_name,category,registration_no,address,phone,email,rep_name,rep_designation,rep_contact,status) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,'SUBMITTED') RETURNING id", tuple(b.model_dump().values())).fetchone()
    c.execute("INSERT INTO application_status_history(application_id,to_status) VALUES(%s,'SUBMITTED')", (a["id"],)); c.commit(); return a
@r.get("/applications")
def apps(u=Depends(need("SUPER_ADMIN")), c=Depends(db)): return c.execute("SELECT * FROM hospital_applications ORDER BY created_at DESC LIMIT 200").fetchall()
class Decision(BaseModel): status: str; note: str | None = None
@r.post("/applications/{aid}/status")
def decide(aid: int, b: Decision, u=Depends(need("SUPER_ADMIN")), c=Depends(db)):
    a = c.execute("SELECT * FROM hospital_applications WHERE id=%s FOR UPDATE", (aid,)).fetchone()
    if not a: raise HTTPException(404)
    c.execute("UPDATE hospital_applications SET status=%s WHERE id=%s", (b.status, aid))
    c.execute("INSERT INTO application_status_history(application_id,from_status,to_status,decided_by,note) VALUES(%s,%s,%s,%s,%s)", (aid, a["status"], b.status, u["id"], b.note))
    if b.status == "ONBOARDING_IN_PROGRESS" and not a["facility_id"]:
        f = c.execute("INSERT INTO facilities(name,category,registration_no,address,phone,email,verification_status,participation_status) VALUES(%s,%s,%s,%s,%s,%s,'VERIFIED','ONBOARDING_IN_PROGRESS') RETURNING id", (a["hospital_name"], a["category"], a["registration_no"], a["address"], a["phone"], a["email"])).fetchone()
        c.execute("UPDATE hospital_applications SET facility_id=%s WHERE id=%s", (f["id"], aid))
    if b.status in ("ACTIVE", "SUSPENDED", "REVOKED") and a["facility_id"]:
        c.execute("UPDATE facilities SET participation_status=%s WHERE id=%s", (b.status, a["facility_id"]))
    audit(c, u, "APPLICATION_STATUS", f"application:{aid}"); return {"ok": True}
@r.get("/facilities")
def facilities(u=Depends(current_user), c=Depends(db)): return c.execute("SELECT id,name,category,listing_status,verification_status,participation_status FROM facilities ORDER BY name").fetchall()
class Verification(BaseModel):
    status: str

@r.post("/facilities/{fid}/verify")
def verify_facility(
    fid: int,
    b: Verification,
    u=Depends(need("SUPER_ADMIN")),
    c=Depends(db)
):
    if b.status not in ("VERIFIED", "UNVERIFIED"):
        raise HTTPException(422, "Invalid verification status")

    facility = c.execute(
        "UPDATE facilities SET verification_status=%s WHERE id=%s RETURNING id,name",
        (b.status, fid)
    ).fetchone()

    if not facility:
        raise HTTPException(404, "Facility not found")

    audit(c, u, "FACILITY_VERIFICATION",
          f"facility:{fid}:{b.status}")

    return {"message": "Verification status updated", "facility": facility}
@r.get("/stats")
def stats(u=Depends(need("SUPER_ADMIN")), c=Depends(db)):
    q = lambda s: c.execute(s).fetchone()["n"]
    return {"listed_facilities": q("SELECT count(*) n FROM facilities WHERE listing_status='LISTED'"), "active_facilities": q("SELECT count(*) n FROM facilities WHERE participation_status='ACTIVE'"),
            "pending_applications": q("SELECT count(*) n FROM hospital_applications WHERE status IN ('SUBMITTED','DOCUMENTS_PENDING','DOCUMENTS_UNDER_REVIEW','VERIFICATION_IN_PROGRESS','CLARIFICATION_REQUIRED')"),
            "approved_facilities": q("SELECT count(*) n FROM hospital_applications WHERE status='APPROVED'"), "suspended_facilities": q("SELECT count(*) n FROM facilities WHERE participation_status='SUSPENDED'"),
            "patients": q("SELECT count(*) n FROM patients"), "encounters": q("SELECT count(*) n FROM encounters"), "referrals": q("SELECT count(*) n FROM referrals"), "screenings": q("SELECT count(*) n FROM screenings")}
@r.get("/audit")
def audit_log(limit: int = 50, offset: int = 0, u=Depends(need("SUPER_ADMIN", "HOSPITAL_ADMIN")), c=Depends(db)):
    if u["role"] == "SUPER_ADMIN": return c.execute("SELECT * FROM access_logs ORDER BY at DESC LIMIT %s OFFSET %s", (min(limit, 200), offset)).fetchall()
    return c.execute("SELECT * FROM access_logs WHERE facility_id=%s ORDER BY at DESC LIMIT %s OFFSET %s", (u["facility_id"], min(limit, 200), offset)).fetchall()
