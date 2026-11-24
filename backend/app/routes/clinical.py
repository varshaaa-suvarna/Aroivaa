import os, hashlib, uuid, re, secrets, bcrypt
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from ..core import *
r = APIRouter()
CLIN = ("HOSPITAL_ADMIN", "DOCTOR", "OPTOMETRIST")

NAME_REGEX = re.compile(r"^[A-Za-z\s.'-]{2,100}$")
PHONE_REGEX = re.compile(r"^\+?[0-9]{10,15}$")

def _generate_sharing_password():
    return f"AROVIA-{secrets.randbelow(10000):04d}"

class HistoryItemIn(BaseModel): category: str; description: str; encounter_id: int; source_type: str = "PATIENT_REPORTED"
class PatientIn(BaseModel):
    full_name: str
    date_of_birth: date
    sex: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    blood_group: str | None = None
    emergency_contact_name: str | None = None
    emergency_contact_relationship: str | None = None
    emergency_contact_phone: str | None = None
    abha_id: str | None = None
    local_patient_id: str
@r.post("/patients")
def register(b: PatientIn, u=Depends(need("HOSPITAL_ADMIN")), c=Depends(db)):
    name = b.full_name.strip()
    if any(ch.isdigit() for ch in name):
        raise HTTPException(422, "Patient full name cannot contain numbers. Only letters and standard name characters are allowed.")
    if not NAME_REGEX.match(name) or not any(ch.isalpha() for ch in name):
        raise HTTPException(422, "Patient full name must be at least 2 characters and contain only letters.")
    if b.date_of_birth > date.today():
        raise HTTPException(422, "Date of birth cannot be in the future.")
    if b.date_of_birth.year < 1900:
        raise HTTPException(422, "Please enter a valid date of birth.")
    if b.phone:
        clean_phone = re.sub(r"[\s\-()]", "", b.phone)
        if clean_phone and not PHONE_REGEX.match(clean_phone):
            raise HTTPException(422, "Phone number must be a valid 10 to 15 digit number.")
    if b.emergency_contact_phone:
        clean_emergency_phone = re.sub(r"[\s\-()]", "", b.emergency_contact_phone)
        if clean_emergency_phone and not PHONE_REGEX.match(clean_emergency_phone):
            raise HTTPException(422, "Emergency contact phone must be a valid 10 to 15 digit number.")
    if b.blood_group and b.blood_group not in {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"}:
        raise HTTPException(422, "Invalid blood group")
    if b.sex and b.sex not in ("M", "F", "O", "U"):
        raise HTTPException(422, "Invalid sex selection.")
    if not b.local_patient_id or not b.local_patient_id.strip():
        raise HTTPException(422, "Local patient ID is required.")

    sharing_password = _generate_sharing_password()
    sharing_password_hash = bcrypt.hashpw(sharing_password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")
    p = c.execute("""INSERT INTO patients(full_name,date_of_birth,sex,phone,email,address,blood_group,emergency_contact_name,emergency_contact_relationship,emergency_contact_phone,abha_id,created_by,sharing_password_hash)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id,arovia_id""",
        (name, b.date_of_birth, b.sex, b.phone or None, b.email or None, b.address or None, b.blood_group or None, b.emergency_contact_name or None,
         b.emergency_contact_relationship or None, b.emergency_contact_phone or None, b.abha_id or None, u["id"], sharing_password_hash)).fetchone()
    c.execute("INSERT INTO hospital_patient_links(patient_id,facility_id,local_patient_id) VALUES(%s,%s,%s)", (p["id"], u["facility_id"], b.local_patient_id.strip()))
    audit(c, u, "REGISTER_PATIENT", f"patient:{p['id']}", patient_id=p["id"])
    return {**p, "sharing_password": sharing_password}

class PatientShareAccessIn(BaseModel):
    arovia_id: str
    sharing_password: str

@r.post("/patients/share-access")
def grant_patient_share_access(b: PatientShareAccessIn, u=Depends(need(*CLIN)), c=Depends(db)):
    generic_error = "Patient ID or sharing password is invalid, sharing is not authorized for your hospital, or access is temporarily locked"
    if len(b.arovia_id) > 32 or len(b.sharing_password) > 128:
        raise HTTPException(422, "Invalid patient sharing credentials")
    facility = c.execute("SELECT id FROM facilities WHERE id=%s AND participation_status='ACTIVE'", (u["facility_id"],)).fetchone()
    if not facility:
        audit(c, u, "VERIFY_PATIENT_SHARING_PASSWORD", f"patient_share:{b.arovia_id}", "DENIED", reason="facility is not active")
        raise HTTPException(403, generic_error)

    patient = c.execute("SELECT id,sharing_password_hash FROM patients WHERE arovia_id=%s", (b.arovia_id.strip().upper(),)).fetchone()
    if not patient:
        audit(c, u, "VERIFY_PATIENT_SHARING_PASSWORD", f"patient_share:{b.arovia_id}", "DENIED", reason="unknown patient ID")
        raise HTTPException(403, generic_error)

    authorized = has_active_clinical_consent(c, patient["id"], u["facility_id"])
    if not authorized or not patient["sharing_password_hash"]:
        audit(c, u, "VERIFY_PATIENT_SHARING_PASSWORD", f"patient:{patient['id']}", "DENIED", patient_id=patient["id"], reason="no active facility consent or password not provisioned")
        raise HTTPException(403, generic_error)

    c.execute("""INSERT INTO patient_sharing_access_attempts(patient_id,facility_id)
        VALUES(%s,%s) ON CONFLICT(patient_id,facility_id) DO NOTHING""", (patient["id"], u["facility_id"]))
    attempt = c.execute("""SELECT failed_attempts,locked_until FROM patient_sharing_access_attempts
        WHERE patient_id=%s AND facility_id=%s FOR UPDATE""", (patient["id"], u["facility_id"])).fetchone()
    if attempt["locked_until"] and attempt["locked_until"] > datetime.now().astimezone():
        audit(c, u, "VERIFY_PATIENT_SHARING_PASSWORD", f"patient:{patient['id']}", "DENIED", patient_id=patient["id"], reason="sharing password attempts are locked")
        raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")

    password_bytes = b.sharing_password.encode("utf-8")
    password_matches = len(password_bytes) <= 72 and bcrypt.checkpw(password_bytes, patient["sharing_password_hash"].encode("ascii"))
    if not password_matches:
        failures = 1 if attempt["locked_until"] else attempt["failed_attempts"] + 1
        locked = failures >= 5
        c.execute("""UPDATE patient_sharing_access_attempts SET failed_attempts=%s,
            locked_until=CASE WHEN %s THEN now()+interval '15 minutes' ELSE NULL END,last_attempt_at=now()
            WHERE patient_id=%s AND facility_id=%s""", (failures, locked, patient["id"], u["facility_id"]))
        audit(c, u, "VERIFY_PATIENT_SHARING_PASSWORD", f"patient:{patient['id']}", "DENIED", patient_id=patient["id"], reason="incorrect sharing password")
        raise HTTPException(429 if locked else 403, "Too many failed attempts. Try again in 15 minutes." if locked else generic_error)

    c.execute("""UPDATE patient_sharing_access_attempts SET failed_attempts=0,locked_until=NULL,last_attempt_at=now()
        WHERE patient_id=%s AND facility_id=%s""", (patient["id"], u["facility_id"]))
    grant = c.execute("""INSERT INTO patient_sharing_access_grants(patient_id,facility_id,granted_by,expires_at)
        VALUES(%s,%s,%s,now()+interval '60 minutes')
        ON CONFLICT(patient_id,facility_id) DO UPDATE SET granted_by=EXCLUDED.granted_by,
          granted_at=now(),expires_at=now()+interval '60 minutes',revoked_at=NULL
        RETURNING expires_at""", (patient["id"], u["facility_id"], u["id"])).fetchone()
    audit(c, u, "VERIFY_PATIENT_SHARING_PASSWORD", f"patient:{patient['id']}", patient_id=patient["id"])
    return {"patient_id": patient["id"], "expires_at": grant["expires_at"]}

@r.post("/patients/{pid}/sharing-password")
def provision_patient_sharing_password(pid: int, u=Depends(need("DOCTOR", "HOSPITAL_ADMIN")), c=Depends(db)):
    linked = c.execute("SELECT 1 FROM hospital_patient_links WHERE patient_id=%s AND facility_id=%s", (pid, u["facility_id"])).fetchone()
    if not linked:
        audit(c, u, "PROVISION_PATIENT_SHARING_PASSWORD", f"patient:{pid}", "DENIED", patient_id=pid, reason="requester facility is not linked to patient")
        raise HTTPException(403, "Only the patient's linked hospital can provision a sharing password")
    sharing_password = _generate_sharing_password()
    encoded_hash = bcrypt.hashpw(sharing_password.encode("utf-8"), bcrypt.gensalt()).decode("ascii")
    row = c.execute("UPDATE patients SET sharing_password_hash=%s WHERE id=%s AND sharing_password_hash IS NULL RETURNING id", (encoded_hash, pid)).fetchone()
    if not row:
        raise HTTPException(409, "A sharing password is already provisioned")
    audit(c, u, "PROVISION_PATIENT_SHARING_PASSWORD", f"patient:{pid}", patient_id=pid)
    return {"sharing_password": sharing_password}
@r.get("/patients")
def search(q: str = "", limit: int = 25, offset: int = 0, u=Depends(need(*CLIN)), c=Depends(db)):
    rows = c.execute("""SELECT DISTINCT p.id,p.arovia_id,p.full_name,p.date_of_birth,l.local_patient_id,
        EXISTS(SELECT 1 FROM consent_records ownc JOIN patient_sharing_access_grants owng
          ON owng.patient_id=ownc.patient_id AND owng.facility_id=ownc.granted_to_facility_id
          JOIN facilities ownf ON ownf.id=owng.facility_id AND ownf.participation_status='ACTIVE'
          WHERE ownc.patient_id=p.id AND ownc.granted_to_facility_id=%s
          AND ownc.status='ACTIVE' AND ownc.valid_from<=CURRENT_DATE
          AND (ownc.valid_until IS NULL OR ownc.valid_until>=CURRENT_DATE)
          AND ('ALL'=ANY(ownc.data_categories) OR 'CLINICAL'=ANY(ownc.data_categories))
          AND owng.revoked_at IS NULL AND owng.expires_at>now()) AS network_history_authorized
        FROM patients p LEFT JOIN hospital_patient_links l ON l.patient_id=p.id AND l.facility_id=%s
        WHERE (l.id IS NOT NULL OR EXISTS (SELECT 1 FROM consent_records cr JOIN patient_sharing_access_grants g
          ON g.patient_id=cr.patient_id AND g.facility_id=cr.granted_to_facility_id
          JOIN facilities gf ON gf.id=g.facility_id AND gf.participation_status='ACTIVE' WHERE cr.patient_id=p.id
          AND cr.granted_to_facility_id=%s AND cr.status='ACTIVE' AND cr.valid_from<=CURRENT_DATE
          AND (cr.valid_until IS NULL OR cr.valid_until>=CURRENT_DATE)
          AND ('ALL'=ANY(cr.data_categories) OR 'CLINICAL'=ANY(cr.data_categories))
          AND g.revoked_at IS NULL AND g.expires_at>now()))
          AND (lower(p.full_name) LIKE %s OR p.arovia_id=%s OR l.local_patient_id=%s)
        ORDER BY p.full_name LIMIT %s OFFSET %s""",
        (u["facility_id"],u["facility_id"],u["facility_id"],f"%{q.lower()}%",q,q,min(limit,100),offset)).fetchall()
    audit(c, u, "SEARCH_PATIENTS", "patients"); return rows
@r.get("/patients/{pid}")
def profile(pid: int, u=Depends(need(*CLIN)), c=Depends(db)):
    patient_access(c, u, pid, "VIEW_PROFILE")
    p = c.execute("""SELECT p.id,p.arovia_id,p.full_name,p.date_of_birth,p.sex,p.phone,p.email,p.address,
        p.blood_group,p.emergency_contact_name,p.emergency_contact_relationship,p.emergency_contact_phone,
        p.abha_id,p.identity_verification,p.is_demo,p.created_by,p.created_at,
        (p.sharing_password_hash IS NOT NULL) AS sharing_password_provisioned,
        EXISTS(SELECT 1 FROM hospital_patient_links l
        WHERE l.patient_id=p.id AND l.facility_id=%s) AS is_linked_to_facility
        FROM patients p WHERE p.id=%s""", (u["facility_id"],pid)).fetchone()
    if not p:
        raise HTTPException(404, "Patient not found")
    network_access = has_active_patient_sharing_access(c,pid,u["facility_id"])
    g = lambda s: c.execute(s, (pid,network_access,u["facility_id"])).fetchall()
    return {
        "patient": p,
        "network_history_authorized": network_access,
        "history_items": g("SELECT h.*,f.name AS facility_name,u.full_name AS recorder_name FROM patient_history_items h JOIN facilities f ON f.id=h.facility_id JOIN users u ON u.id=h.recorded_by WHERE h.patient_id=%s AND (%s OR h.facility_id=%s) ORDER BY h.recorded_at DESC"),
        "encounters": g("SELECT e.*,f.name AS facility_name,coalesce(u.full_name,creator.full_name) AS doctor_name FROM encounters e JOIN facilities f ON f.id=e.facility_id LEFT JOIN users u ON u.id=e.doctor_id JOIN users creator ON creator.id=e.created_by WHERE e.patient_id=%s AND (%s OR e.facility_id=%s) ORDER BY e.encounter_at DESC"),
        "allergies": g("SELECT a.*,f.name AS facility_name,u.full_name AS recorder_name FROM allergies a JOIN users u ON u.id=a.recorded_by LEFT JOIN facilities f ON f.id=a.facility_id WHERE a.patient_id=%s AND (%s OR a.facility_id=%s) ORDER BY a.created_at DESC"),
        "diagnoses": g("SELECT d.*,e.encounter_at,e.facility_id,f.name AS facility_name,rec.full_name AS recorder_name,doc.full_name AS diagnosing_doctor FROM diagnoses d JOIN encounters e ON e.id=d.encounter_id JOIN facilities f ON f.id=e.facility_id JOIN users rec ON rec.id=d.recorded_by LEFT JOIN users doc ON doc.id=d.diagnosed_by WHERE d.patient_id=%s AND (%s OR e.facility_id=%s) ORDER BY d.created_at DESC"),
        "prescriptions": g("SELECT p.*,e.encounter_at,e.facility_id,f.name AS facility_name,rec.full_name AS recorder_name,coalesce(doc.full_name,rec.full_name) AS prescriber_name FROM prescriptions p JOIN encounters e ON e.id=p.encounter_id JOIN facilities f ON f.id=e.facility_id JOIN users rec ON rec.id=p.recorded_by LEFT JOIN users doc ON doc.id=p.prescribed_by WHERE p.patient_id=%s AND (%s OR e.facility_id=%s) ORDER BY p.created_at DESC"),
        "investigations": g("SELECT i.*,f.name AS facility_name,u.full_name AS recorder_name FROM investigations i JOIN facilities f ON f.id=i.facility_id JOIN users u ON u.id=i.recorded_by WHERE i.patient_id=%s AND (%s OR i.facility_id=%s) ORDER BY i.created_at DESC"),
        "referrals": g("SELECT r.*,f.name AS source_facility_name,tf.name AS target_facility_name,u.full_name AS responsible_doctor FROM referrals r JOIN facilities f ON f.id=r.from_facility_id JOIN facilities tf ON tf.id=r.to_facility_id JOIN users u ON u.id=r.from_doctor_id WHERE r.patient_id=%s AND (%s OR r.from_facility_id=%s) ORDER BY r.created_at DESC"),
        "screenings": g("SELECT s.*,f.name AS facility_name,u.full_name AS screener_name FROM screenings s JOIN facilities f ON f.id=s.facility_id JOIN users u ON u.id=s.performed_by WHERE s.patient_id=%s AND (%s OR s.facility_id=%s) ORDER BY s.screened_at DESC")
    }
class PatientPatch(BaseModel): phone: str | None = None; email: str | None = None; address: str | None = None; blood_group: str | None = None; emergency_contact_name: str | None = None; emergency_contact_relationship: str | None = None; emergency_contact_phone: str | None = None; abha_id: str | None = None
@r.patch("/patients/{pid}")
def update(pid: int, b: PatientPatch, u=Depends(need(*CLIN)), c=Depends(db)):
    linked = c.execute("SELECT 1 FROM hospital_patient_links WHERE patient_id=%s AND facility_id=%s", (pid, u["facility_id"])).fetchone()
    if not linked:
        audit(c, u, "UPDATE_PATIENT", f"patient:{pid}", "DENIED", pid, "shared access is read-only for patient demographics")
        raise HTTPException(403, "Only the patient's linked hospital can update demographics")
    patient_access(c, u, pid, "UPDATE_PATIENT")
    if b.blood_group and b.blood_group not in {"A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-", "UNKNOWN"}: raise HTTPException(422, "Invalid blood group")
    c.execute("""UPDATE patients SET phone=COALESCE(%s,phone),email=COALESCE(%s,email),address=COALESCE(%s,address),blood_group=COALESCE(%s,blood_group),
        emergency_contact_name=COALESCE(%s,emergency_contact_name),emergency_contact_relationship=COALESCE(%s,emergency_contact_relationship),
        emergency_contact_phone=COALESCE(%s,emergency_contact_phone),abha_id=COALESCE(%s,abha_id) WHERE id=%s""",
        (b.phone,b.email,b.address,b.blood_group,b.emergency_contact_name,b.emergency_contact_relationship,b.emergency_contact_phone,b.abha_id,pid))
    audit(c, u, "UPDATE_PATIENT", f"patient:{pid}", patient_id=pid); return {"ok": True}

@r.get("/patients/{pid}/consents")
def list_consents(pid: int, u=Depends(need(*CLIN)), c=Depends(db)):
    patient_access(c, u, pid, "VIEW_CONSENTS")
    rows = c.execute("""SELECT cr.*, f.name AS facility_name FROM consent_records cr
        JOIN facilities f ON f.id=cr.granted_to_facility_id
        WHERE cr.patient_id=%s ORDER BY cr.valid_from DESC, cr.id DESC""", (pid,)).fetchall()
    audit(c, u, "LIST_CONSENTS", f"patient:{pid}", patient_id=pid)
    return rows

class ConsentGrantIn(BaseModel):
    granted_to_facility_id: int
    purpose: str
    data_categories: list[str] = ["CLINICAL"]
    valid_until: date | None = None
    evidence_ref: str
    patient_consent_confirmed: bool = False

@r.post("/patients/{pid}/consents")
def grant_consent(pid: int, b: ConsentGrantIn, u=Depends(need("DOCTOR", "HOSPITAL_ADMIN")), c=Depends(db)):
    patient_access(c,u,pid,"GRANT_CROSS_HOSPITAL_CONSENT")
    linked = c.execute("SELECT 1 FROM hospital_patient_links WHERE patient_id=%s AND facility_id=%s", (pid,u["facility_id"])).fetchone()
    if not linked:
        audit(c,u,"GRANT_CROSS_HOSPITAL_CONSENT",f"patient:{pid}","DENIED",pid,"only the patient's linked hospital can record sharing consent")
        raise HTTPException(403,"Only the patient's linked hospital can record cross-hospital consent")
    if not b.patient_consent_confirmed:
        raise HTTPException(422,"Confirm that the patient gave consent before recording access")
    if not b.purpose.strip() or len(b.purpose.strip()) > 200 or not b.evidence_ref.strip():
        raise HTTPException(422,"Purpose and consent documentation reference are required")
    if not b.data_categories or any(x not in {"CLINICAL","ALL"} for x in b.data_categories):
        raise HTTPException(422,"Select valid clinical data categories")
    if b.valid_until and b.valid_until < date.today():
        raise HTTPException(422,"Consent expiry must be today or a future date")
    target = c.execute("SELECT id FROM facilities WHERE id=%s AND participation_status='ACTIVE'", (b.granted_to_facility_id,)).fetchone()
    if not target or b.granted_to_facility_id == u["facility_id"]:
        raise HTTPException(422,"Choose a different active participating hospital")
    c.execute("SELECT id FROM patients WHERE id=%s FOR UPDATE", (pid,))
    c.execute("""UPDATE consent_records SET status='REVOKED',revoked_at=now(),revoked_by=%s,revocation_reason='Replaced by a newer consent record'
        WHERE patient_id=%s AND granted_to_facility_id=%s AND status='ACTIVE'""", (u["id"],pid,b.granted_to_facility_id))
    c.execute("UPDATE patient_sharing_access_grants SET revoked_at=now() WHERE patient_id=%s AND facility_id=%s AND revoked_at IS NULL", (pid,b.granted_to_facility_id))
    row = c.execute("""INSERT INTO consent_records(patient_id,purpose,data_categories,granted_to_facility_id,valid_until,status,recorded_by,evidence_ref)
        VALUES(%s,%s,%s,%s,%s,'ACTIVE',%s,%s) RETURNING id,valid_from,valid_until,status""",
        (pid,b.purpose.strip(),b.data_categories,b.granted_to_facility_id,b.valid_until,u["id"],b.evidence_ref.strip())).fetchone()
    audit(c,u,"GRANT_CROSS_HOSPITAL_CONSENT",f"consent:{row['id']}",patient_id=pid)
    return row

@r.post("/patients/{pid}/consents/{consent_id}/revoke")
def revoke_consent(pid: int, consent_id: int, reason: str = "", u=Depends(need("DOCTOR", "HOSPITAL_ADMIN")), c=Depends(db)):
    linked = c.execute("SELECT 1 FROM hospital_patient_links WHERE patient_id=%s AND facility_id=%s", (pid, u["facility_id"])).fetchone()
    if not linked:
        audit(c, u, "REVOKE_CONSENT", f"patient:{pid}", "DENIED", patient_id=pid, reason="consent must be managed by linked facility")
        raise HTTPException(403, "Only a linked facility can revoke this consent")
    row = c.execute("""UPDATE consent_records SET status='REVOKED',revoked_at=now(),revoked_by=%s,revocation_reason=%s
        WHERE id=%s AND patient_id=%s AND status='ACTIVE' RETURNING id,granted_to_facility_id""", (u["id"], reason or None, consent_id, pid)).fetchone()
    if not row:
        raise HTTPException(404, "Active consent not found")
    c.execute("UPDATE patient_sharing_access_grants SET revoked_at=now() WHERE patient_id=%s AND facility_id=%s AND revoked_at IS NULL", (pid,row["granted_to_facility_id"]))
    audit(c, u, "REVOKE_CONSENT", f"patient:{pid}", patient_id=pid)
    return {"ok": True}

@r.get("/patients/{pid}/timeline")
def timeline(pid: int, u=Depends(need(*CLIN)), c=Depends(db)):
    patient_access(c, u, pid, "VIEW_TIMELINE")
    network = has_active_patient_sharing_access(c,pid,u["facility_id"])
    return c.execute("""SELECT * FROM (
      SELECT p.created_at AS at,'Patient registered'::text AS kind,p.full_name::text AS detail,NULL::text AS facility_name,NULL::text AS professional_name FROM patients p JOIN users owner ON owner.id=p.created_by WHERE p.id=%(p)s AND (%(n)s OR owner.facility_id=%(f)s)
      UNION ALL SELECT e.encounter_at,'Encounter: '||e.encounter_type,concat_ws(' · ',e.symptoms,e.observations,e.examination_findings,e.procedures,e.clinical_notes,e.treatment),f.name,coalesce(d.full_name,creator.full_name) FROM encounters e JOIN facilities f ON f.id=e.facility_id LEFT JOIN users d ON d.id=e.doctor_id JOIN users creator ON creator.id=e.created_by WHERE e.patient_id=%(p)s AND (%(n)s OR e.facility_id=%(f)s)
      UNION ALL SELECT dx.created_at,'Diagnosis',dx.description,f.name,coalesce(doc.full_name,rec.full_name) FROM diagnoses dx JOIN encounters e ON e.id=dx.encounter_id JOIN facilities f ON f.id=e.facility_id JOIN users rec ON rec.id=dx.recorded_by LEFT JOIN users doc ON doc.id=dx.diagnosed_by WHERE dx.patient_id=%(p)s AND (%(n)s OR e.facility_id=%(f)s)
      UNION ALL SELECT rx.created_at,'Prescription',concat_ws(' · ',rx.medication,rx.dosage,rx.frequency,rx.duration,rx.instructions),f.name,coalesce(doc.full_name,rec.full_name) FROM prescriptions rx JOIN encounters e ON e.id=rx.encounter_id JOIN facilities f ON f.id=e.facility_id JOIN users rec ON rec.id=rx.recorded_by LEFT JOIN users doc ON doc.id=rx.prescribed_by WHERE rx.patient_id=%(p)s AND (%(n)s OR e.facility_id=%(f)s)
      UNION ALL SELECT i.created_at,'Investigation: '||i.kind,concat_ws(' · ',i.name,i.result),f.name,u.full_name FROM investigations i JOIN facilities f ON f.id=i.facility_id JOIN users u ON u.id=i.recorded_by WHERE i.patient_id=%(p)s AND (%(n)s OR i.facility_id=%(f)s)
      UNION ALL SELECT h.recorded_at,'Medical history: '||h.category,h.description,f.name,u.full_name||' ('||h.source_type||')' FROM patient_history_items h JOIN facilities f ON f.id=h.facility_id JOIN users u ON u.id=h.recorded_by WHERE h.patient_id=%(p)s AND (%(n)s OR h.facility_id=%(f)s)
      UNION ALL SELECT s.screened_at,'Retinal screening ('||s.status||')',s.eye,f.name,u.full_name FROM screenings s JOIN facilities f ON f.id=s.facility_id JOIN users u ON u.id=s.performed_by WHERE s.patient_id=%(p)s AND (%(n)s OR s.facility_id=%(f)s)
      UNION ALL SELECT a.created_at,'Allergy recorded',concat_ws(' · ',a.substance,a.reaction,a.severity,a.source_type),f.name,u.full_name FROM allergies a JOIN users u ON u.id=a.recorded_by LEFT JOIN facilities f ON f.id=a.facility_id WHERE a.patient_id=%(p)s AND (%(n)s OR a.facility_id=%(f)s)
      UNION ALL SELECT sr.created_at,'Doctor review','Grade '||sr.final_grade,f.name,u.full_name FROM screening_reviews sr JOIN screenings s ON s.id=sr.screening_id JOIN facilities f ON f.id=s.facility_id JOIN users u ON u.id=sr.reviewer_id WHERE s.patient_id=%(p)s AND (%(n)s OR s.facility_id=%(f)s)
      UNION ALL SELECT r.created_at,'Referral ('||r.status||')',concat_ws(' · ',r.specialty,r.reason),f.name,u.full_name FROM referrals r JOIN facilities f ON f.id=r.from_facility_id JOIN users u ON u.id=r.from_doctor_id WHERE r.patient_id=%(p)s AND (%(n)s OR r.from_facility_id=%(f)s OR r.to_facility_id=%(f)s)
      UNION ALL SELECT h.at,'Referral status: '||h.to_status,coalesce(h.note,''),f.name,u.full_name FROM referral_status_history h JOIN referrals r ON r.id=h.referral_id JOIN facilities f ON f.id=CASE WHEN h.changed_by IS NOT NULL THEN (SELECT facility_id FROM users WHERE id=h.changed_by) ELSE r.from_facility_id END JOIN users u ON u.id=h.changed_by WHERE r.patient_id=%(p)s AND (%(n)s OR r.from_facility_id=%(f)s OR r.to_facility_id=%(f)s)) t ORDER BY at DESC""", {"p": pid,"f":u["facility_id"],"n":network}).fetchall()
class EncIn(BaseModel): encounter_type: str; doctor_id: int | None = None; symptoms: str | None = None; observations: str | None = None; examination_findings: str | None = None; procedures: str | None = None; clinical_notes: str | None = None; treatment: str | None = None; follow_up: str | None = None
@r.post("/patients/{pid}/encounters")
def new_enc(pid: int, b: EncIn, u=Depends(need("DOCTOR", "OPTOMETRIST", "HOSPITAL_ADMIN")), c=Depends(db)):
    patient_access(c, u, pid, "CREATE_ENCOUNTER")
    doctor_id = b.doctor_id or (u["id"] if u["role"] == "DOCTOR" else None)
    if doctor_id and not c.execute("SELECT 1 FROM users WHERE id=%s AND facility_id=%s AND role='DOCTOR' AND is_active", (doctor_id, u["facility_id"])).fetchone():
        raise HTTPException(422, "Encounter doctor must be an active doctor at this facility")
    e = c.execute("""INSERT INTO encounters(patient_id,facility_id,encounter_type,doctor_id,symptoms,observations,examination_findings,procedures,clinical_notes,treatment,follow_up,created_by)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""", (pid, u["facility_id"], b.encounter_type, doctor_id, b.symptoms, b.observations, b.examination_findings, b.procedures, b.clinical_notes, b.treatment, b.follow_up, u["id"])).fetchone()
    audit(c, u, "CREATE_ENCOUNTER", f"encounter:{e['id']}", patient_id=pid); return e
@r.get("/patients/{pid}/encounters")
def encs(pid: int, u=Depends(need(*CLIN)), c=Depends(db)):
    patient_access(c, u, pid, "VIEW_ENCOUNTERS")
    network = has_active_patient_sharing_access(c,pid,u["facility_id"])
    return c.execute("SELECT * FROM encounters WHERE patient_id=%s AND (%s OR facility_id=%s) ORDER BY encounter_at DESC", (pid,network,u["facility_id"])).fetchall()

@r.get("/clinical/doctors")
def clinical_doctors(u=Depends(need(*CLIN)), c=Depends(db)):
    rows = c.execute("SELECT id,full_name FROM users WHERE facility_id=%s AND role='DOCTOR' AND is_active ORDER BY full_name", (u["facility_id"],)).fetchall()
    if u["role"] == "DOCTOR" and all(x["id"] != u["id"] for x in rows):
        rows.append({"id":u["id"],"full_name":u["full_name"]})
    return rows

class DxIn(BaseModel): encounter_id: int; description: str; icd10_code: str | None = None; identified_at: date | None = None; diagnosed_by: int | None = None
@r.post("/patients/{pid}/diagnoses")
def add_dx(pid: int, b: DxIn, u=Depends(need("DOCTOR", "HOSPITAL_ADMIN")), c=Depends(db)):
    patient_access(c, u, pid, "ADD_DIAGNOSIS")
    if not c.execute("SELECT 1 FROM encounters WHERE id=%s AND patient_id=%s AND facility_id=%s", (b.encounter_id, pid, u["facility_id"])).fetchone(): raise HTTPException(422, "Encounter must belong to this patient and facility")
    diagnosed_by = b.diagnosed_by or (u["id"] if u["role"] == "DOCTOR" else None)
    if diagnosed_by and not c.execute("SELECT 1 FROM users WHERE id=%s AND facility_id=%s AND role='DOCTOR' AND is_active", (diagnosed_by,u["facility_id"])).fetchone(): raise HTTPException(422, "Diagnosing doctor must be active at this facility")
    c.execute("INSERT INTO diagnoses(encounter_id,patient_id,description,icd10_code,identified_at,diagnosed_by,recorded_by) VALUES(%s,%s,%s,%s,COALESCE(%s::date::timestamptz,now()),%s,%s)", (b.encounter_id, pid, b.description, b.icd10_code, b.identified_at, diagnosed_by, u["id"]))
    audit(c, u, "ADD_DIAGNOSIS", f"patient:{pid}", patient_id=pid); return {"ok": True}

class DiagnosisPatch(BaseModel): status: str
@r.patch("/patients/{pid}/diagnoses/{diagnosis_id}")
def update_diagnosis(pid: int, diagnosis_id: int, b: DiagnosisPatch, u=Depends(need("DOCTOR")), c=Depends(db)):
    patient_access(c, u, pid, "UPDATE_DIAGNOSIS")
    if b.status not in {"ACTIVE", "RESOLVED"}: raise HTTPException(422, "Diagnosis status must be ACTIVE or RESOLVED")
    row = c.execute("""UPDATE diagnoses d SET status=%s FROM encounters e
        WHERE d.id=%s AND d.patient_id=%s AND d.encounter_id=e.id AND e.facility_id=%s RETURNING d.id""", (b.status,diagnosis_id,pid,u["facility_id"])).fetchone()
    if not row: raise HTTPException(404, "Diagnosis not found at this facility")
    audit(c,u,"UPDATE_DIAGNOSIS",f"diagnosis:{diagnosis_id}",patient_id=pid); return {"ok":True}
class RxIn(BaseModel): encounter_id: int; medication: str; dosage: str | None = None; frequency: str | None = None; duration: str | None = None; instructions: str | None = None; prescribed_by: int | None = None
@r.post("/patients/{pid}/prescriptions")
def add_rx(pid: int, b: RxIn, u=Depends(need("DOCTOR", "HOSPITAL_ADMIN")), c=Depends(db)):
    patient_access(c, u, pid, "ADD_PRESCRIPTION")
    if not c.execute("SELECT 1 FROM encounters WHERE id=%s AND patient_id=%s AND facility_id=%s", (b.encounter_id, pid, u["facility_id"])).fetchone(): raise HTTPException(422, "Encounter must belong to this patient and facility")
    prescribed_by = b.prescribed_by or (u["id"] if u["role"] == "DOCTOR" else None)
    if prescribed_by and not c.execute("SELECT 1 FROM users WHERE id=%s AND facility_id=%s AND role='DOCTOR' AND is_active", (prescribed_by,u["facility_id"])).fetchone(): raise HTTPException(422, "Prescribing doctor must be active at this facility")
    c.execute("INSERT INTO prescriptions(encounter_id,patient_id,medication,dosage,frequency,duration,instructions,prescribed_by,recorded_by) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)", (b.encounter_id, pid, b.medication, b.dosage, b.frequency, b.duration, b.instructions, prescribed_by, u["id"]))
    audit(c, u, "ADD_PRESCRIPTION", f"patient:{pid}", patient_id=pid); return {"ok": True}
class AlIn(BaseModel): substance: str; encounter_id: int; category: str | None = None; reaction: str | None = None; severity: str | None = None; source_type: str = "CLINICIAN_RECORDED"
@r.post("/patients/{pid}/allergies")
def add_al(pid: int, b: AlIn, u=Depends(need("DOCTOR", "OPTOMETRIST", "HOSPITAL_ADMIN")), c=Depends(db)):
    patient_access(c, u, pid, "ADD_ALLERGY")
    if not c.execute("SELECT 1 FROM encounters WHERE id=%s AND patient_id=%s AND facility_id=%s", (b.encounter_id,pid,u["facility_id"])).fetchone(): raise HTTPException(422, "Allergy must be linked to an encounter at your facility")
    if b.source_type not in {"PATIENT_REPORTED", "CLINICIAN_RECORDED"}: raise HTTPException(422, "Invalid allergy source")
    if b.source_type == "CLINICIAN_RECORDED" and u["role"] not in {"DOCTOR", "OPTOMETRIST"}: raise HTTPException(403, "Only clinical staff can verify an allergy")
    c.execute("INSERT INTO allergies(patient_id,encounter_id,facility_id,substance,category,reaction,severity,source_type,recorded_by) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s)", (pid, b.encounter_id, u["facility_id"], b.substance, b.category, b.reaction, b.severity, b.source_type, u["id"]))
    audit(c, u, "ADD_ALLERGY", f"patient:{pid}", patient_id=pid); return {"ok": True}

@r.post("/patients/{pid}/medical-history")
def add_history(pid: int, b: HistoryItemIn, u=Depends(need(*CLIN)), c=Depends(db)):
    patient_access(c, u, pid, "ADD_MEDICAL_HISTORY")
    if not c.execute("SELECT 1 FROM encounters WHERE id=%s AND patient_id=%s AND facility_id=%s", (b.encounter_id,pid,u["facility_id"])).fetchone(): raise HTTPException(422, "History must be linked to an encounter at your facility")
    if b.category not in {"CONDITION", "CARDIAC", "DIABETES", "HYPERTENSION", "ALLERGY", "MEDICATION", "SURGERY", "OTHER"} or b.source_type not in {"PATIENT_REPORTED", "CLINICIAN_RECORDED"}:
        raise HTTPException(422, "Invalid history category or source")
    if b.source_type == "CLINICIAN_RECORDED" and u["role"] not in {"DOCTOR", "OPTOMETRIST"}:
        raise HTTPException(403, "Only doctors or optometrists can record clinically verified history")
    c.execute("""INSERT INTO patient_history_items(patient_id,encounter_id,facility_id,category,description,source_type,verified_by,recorded_by)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s)""", (pid, b.encounter_id, u["facility_id"], b.category, b.description.strip(), b.source_type,
        u["id"] if b.source_type == "CLINICIAN_RECORDED" else None, u["id"]))
    audit(c, u, "ADD_MEDICAL_HISTORY", f"patient:{pid}", patient_id=pid); return {"ok": True}

class InvestigationIn(BaseModel): encounter_id: int | None = None; kind: str; name: str; result: str | None = None; report_ref: str | None = None; performed_at: datetime | None = None
@r.post("/patients/{pid}/investigations")
def add_investigation(pid: int, b: InvestigationIn, u=Depends(need("DOCTOR", "OPTOMETRIST", "HOSPITAL_ADMIN")), c=Depends(db)):
    patient_access(c, u, pid, "ADD_INVESTIGATION")
    if b.kind not in {"LABORATORY", "IMAGING", "OTHER"}: raise HTTPException(422, "Invalid investigation type")
    if b.encounter_id and not c.execute("SELECT 1 FROM encounters WHERE id=%s AND patient_id=%s AND facility_id=%s", (b.encounter_id, pid, u["facility_id"])).fetchone(): raise HTTPException(422, "Encounter must belong to this patient and facility")
    row = c.execute("""INSERT INTO investigations(patient_id,encounter_id,facility_id,kind,name,result,report_ref,performed_at,recorded_by)
        VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id""", (pid,b.encounter_id,u["facility_id"],b.kind,b.name,b.result,b.report_ref,b.performed_at,u["id"])).fetchone()
    audit(c, u, "ADD_INVESTIGATION", f"investigation:{row['id']}", patient_id=pid); return row
# ---- retinal screening ----
from psycopg.types.json import Json
from fastapi.responses import FileResponse
from ..quality import assess
from .. import inference, gradcam
UP = lambda: os.environ.get("UPLOAD_DIR", "../uploads")
@r.post("/patients/{pid}/screenings")
async def screening(pid: int, encounter_id: int | None = Form(None), eye: str = Form(...), image: UploadFile = File(...), u=Depends(need("DOCTOR", "OPTOMETRIST")), c=Depends(db)):
    patient_access(c, u, pid, "CREATE_SCREENING")
    if image.content_type not in ("image/jpeg", "image/png") or eye not in ("RIGHT", "LEFT", "BOTH"): raise HTTPException(422, "JPEG/PNG and eye RIGHT|LEFT|BOTH required")
    # If encounter_id is missing, 0, or invalid for this patient, automatically create/retrieve an encounter
    if not encounter_id or encounter_id <= 0 or not c.execute("SELECT 1 FROM encounters WHERE id=%s AND patient_id=%s AND facility_id=%s", (encounter_id, pid, u["facility_id"])).fetchone():
        enc = c.execute("INSERT INTO encounters(patient_id,facility_id,encounter_type,clinical_notes,created_by) VALUES(%s,%s,'OUTPATIENT','Automated Retinal Screening Visit',%s) RETURNING id", (pid, u["facility_id"], u["id"])).fetchone()
        encounter_id = enc["id"]
    data = await image.read()
    if len(data) > 15_000_000: raise HTTPException(413, "Max 15 MB")
    q = assess(data)  # quality gate runs before anything else
    ref = f"{uuid.uuid4().hex}{'.png' if image.content_type.endswith('png') else '.jpg'}"
    os.makedirs(UP(), exist_ok=True); open(os.path.join(UP(), ref), "wb").write(data)
    s = c.execute("INSERT INTO screenings(patient_id,encounter_id,facility_id,eye,performed_by,quality_status,status,quality_metrics) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id,quality_status,status",
                  (pid, encounter_id, u["facility_id"], eye, u["id"], "ACCEPTABLE" if q["ok"] else "POOR", "IMAGE_UPLOADED" if q["ok"] else "REJECTED_QUALITY", Json(q))).fetchone()
    c.execute("INSERT INTO retinal_images(screening_id,eye,storage_ref,content_type,size_bytes,sha256) VALUES(%s,%s,%s,%s,%s,%s)", (s["id"], eye, ref, image.content_type, len(data), hashlib.sha256(data).hexdigest()))
    c.commit(); return s
def _scr(c, u, sid, action):
    s = c.execute("SELECT s.*, i.storage_ref FROM screenings s JOIN retinal_images i ON i.screening_id=s.id WHERE s.id=%s", (sid,)).fetchone()
    if not s: raise HTTPException(404)
    patient_access(c, u, s["patient_id"], action)
    if s["facility_id"] != u["facility_id"] and not has_active_clinical_consent(c,s["patient_id"],u["facility_id"]):
        audit(c,u,action,f"screening:{sid}","DENIED",s["patient_id"],"cross-hospital screening requires consent")
        raise HTTPException(403,"Patient approval is required for cross-hospital screening records")
    return s
@r.get("/screenings/{sid}")
def screening_detail(sid: int, u=Depends(need(*CLIN)), c=Depends(db)):
    s = _scr(c, u, sid, "VIEW_SCREENING"); s.pop("storage_ref")
    pred = c.execute("SELECT p.dr_grade,p.confidence,p.gradcam_storage_ref,m.name,m.version FROM screening_predictions p JOIN ml_models m ON m.id=p.model_id WHERE p.screening_id=%s ORDER BY p.id DESC LIMIT 1", (sid,)).fetchone()
    rev = c.execute("SELECT final_grade,assessment,recommendations,created_at FROM screening_reviews WHERE screening_id=%s ORDER BY id DESC LIMIT 1", (sid,)).fetchone()
    return {"screening": s, "prediction": pred, "review": rev}
@r.get("/screenings/{sid}/image")
def screening_image(sid: int, u=Depends(need(*CLIN)), c=Depends(db)):
    s = _scr(c, u, sid, "VIEW_RETINAL_IMAGE"); return FileResponse(os.path.join(UP(), s["storage_ref"]))
@r.get("/screenings/{sid}/gradcam")
def screening_gradcam(sid: int, u=Depends(need(*CLIN)), c=Depends(db)):
    s = _scr(c, u, sid, "VIEW_GRADCAM")
    pred = c.execute("SELECT dr_grade, gradcam_storage_ref FROM screening_predictions WHERE screening_id=%s ORDER BY id DESC LIMIT 1", (sid,)).fetchone()
    if not pred:
        raise HTTPException(404, "No prediction found for this screening")

    # If already generated and file exists on disk
    if pred.get("gradcam_storage_ref"):
        cam_file = os.path.join(UP(), pred["gradcam_storage_ref"])
        if os.path.exists(cam_file):
            audit(c, u, "VIEW_GRADCAM", f"screening:{sid}")
            return FileResponse(cam_file)

    # Generate on-demand if missing for an existing prediction
    try:
        img_path = os.path.join(UP(), s["storage_ref"])
        gradcam_ref = f"gradcam_{sid}_{uuid.uuid4().hex[:8]}.jpg"
        out_path = os.path.join(UP(), gradcam_ref)
        gradcam.generate_and_save_gradcam(img_path, out_path, target_class=pred["dr_grade"])
        c.execute("UPDATE screening_predictions SET gradcam_storage_ref=%s WHERE screening_id=%s", (gradcam_ref, sid))
        c.commit()
        audit(c, u, "VIEW_GRADCAM", f"screening:{sid}")
        return FileResponse(out_path)
    except Exception as ex:
        raise HTTPException(500, f"Could not generate Grad-CAM visualization: {ex}")

@r.post("/screenings/{sid}/predict")
def predict(sid: int, u=Depends(need("DOCTOR", "OPTOMETRIST")), c=Depends(db)):
    s = _scr(c, u, sid, "REQUEST_PREDICTION")
    if s["quality_status"] != "ACCEPTABLE": raise HTTPException(409, "Image was rejected at the quality check; no prediction is run. Upload a clearer image.")
    if s["status"] in ("AI_COMPLETE", "REVIEWED"): raise HTTPException(409, "Prediction already recorded")
    img_full_path = os.path.join(UP(), s["storage_ref"])
    try: res = inference.predict(img_full_path)
    except inference.ModelNotReady as ex:
        c.execute("UPDATE screenings SET status='AWAITING_MODEL' WHERE id=%s", (sid,)); c.commit(); raise HTTPException(503, str(ex))

    # Generate Grad-CAM explainability visualization
    gradcam_ref = None
    try:
        gradcam_filename = f"gradcam_{sid}_{uuid.uuid4().hex[:8]}.jpg"
        gradcam_full_path = os.path.join(UP(), gradcam_filename)
        gradcam.generate_and_save_gradcam(img_full_path, gradcam_full_path, target_class=res["grade"])
        gradcam_ref = gradcam_filename
        res["has_gradcam"] = True
    except Exception as cam_err:
        res["has_gradcam"] = False
        res["gradcam_error"] = str(cam_err)

    m = c.execute("INSERT INTO ml_models(name,version,is_active) VALUES(%s,%s,true) ON CONFLICT(name,version) DO UPDATE SET is_active=true RETURNING id", (res["name"], res["version"])).fetchone()
    c.execute("INSERT INTO screening_predictions(screening_id,model_id,dr_grade,confidence,gradcam_storage_ref) VALUES(%s,%s,%s,%s,%s)", (sid, m["id"], res["grade"], res["confidence"], gradcam_ref))
    c.execute("UPDATE screenings SET status='AI_COMPLETE' WHERE id=%s", (sid,)); c.commit(); return res
class RevIn(BaseModel): final_grade: int; assessment: str; recommendations: str | None = None
@r.post("/screenings/{sid}/review")
def review(sid: int, b: RevIn, u=Depends(need("DOCTOR")), c=Depends(db)):
    s = c.execute("SELECT patient_id,facility_id,quality_status FROM screenings WHERE id=%s", (sid,)).fetchone()
    if not s or not 0 <= b.final_grade <= 4: raise HTTPException(422)
    if s["quality_status"] != "ACCEPTABLE": raise HTTPException(409, "Rejected-quality screening cannot be reviewed; repeat the capture")
    patient_access(c, u, s["patient_id"], "REVIEW_SCREENING")
    if s["facility_id"] != u["facility_id"] and not has_active_clinical_consent(c,s["patient_id"],u["facility_id"]):
        audit(c,u,"REVIEW_SCREENING",f"screening:{sid}","DENIED",s["patient_id"],"cross-hospital screening requires consent")
        raise HTTPException(403,"Patient approval is required for cross-hospital screening records")
    c.execute("INSERT INTO screening_reviews(screening_id,reviewer_id,final_grade,assessment,recommendations) VALUES(%s,%s,%s,%s,%s)", (sid, u["id"], b.final_grade, b.assessment, b.recommendations))
    c.execute("UPDATE screenings SET status='REVIEWED' WHERE id=%s", (sid,)); c.commit(); return {"ok": True}
# ---- referrals ----
class RefIn(BaseModel): patient_id: int; to_facility_id: int; specialty: str; reason: str; clinical_notes: str | None = None; priority: str = "ROUTINE"; encounter_id: int | None = None; screening_id: int | None = None
@r.post("/referrals")
def referral(b: RefIn, u=Depends(need("DOCTOR")), c=Depends(db)):
    patient_access(c, u, b.patient_id, "CREATE_REFERRAL")
    if not b.specialty.strip() or not b.reason.strip():
        raise HTTPException(422, "Referral specialty and reason are required")
    if b.to_facility_id == u["facility_id"] or not c.execute("SELECT 1 FROM facilities WHERE id=%s AND participation_status='ACTIVE'", (b.to_facility_id,)).fetchone():
        raise HTTPException(422, "Choose a different active receiving facility")
    if b.priority not in ("ROUTINE", "URGENT", "EMERGENCY"):
        raise HTTPException(422, "Invalid referral priority")
    if not c.execute("""SELECT 1 FROM consent_records WHERE patient_id=%s AND granted_to_facility_id=%s
        AND status='ACTIVE' AND valid_from<=CURRENT_DATE AND (valid_until IS NULL OR valid_until>=CURRENT_DATE)
        AND ('ALL'=ANY(data_categories) OR 'CLINICAL'=ANY(data_categories)) LIMIT 1""", (b.patient_id, b.to_facility_id)).fetchone():
        raise HTTPException(403, "Current patient clinical consent for the receiving facility is required before referral")
    if b.encounter_id and not c.execute("SELECT 1 FROM encounters WHERE id=%s AND patient_id=%s AND facility_id=%s", (b.encounter_id, b.patient_id, u["facility_id"])).fetchone():
        raise HTTPException(422, "Encounter must belong to this patient and your facility")
    if b.screening_id and not c.execute("SELECT 1 FROM screenings WHERE id=%s AND patient_id=%s AND facility_id=%s", (b.screening_id, b.patient_id, u["facility_id"])).fetchone():
        raise HTTPException(422, "Screening must belong to this patient and your facility")
    x = c.execute("INSERT INTO referrals(patient_id,from_facility_id,from_doctor_id,to_facility_id,specialty,reason,clinical_notes,priority,encounter_id,screening_id,status) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'SENT') RETURNING id,status", (b.patient_id, u["facility_id"], u["id"], b.to_facility_id, b.specialty, b.reason, b.clinical_notes, b.priority, b.encounter_id, b.screening_id)).fetchone()
    c.execute("INSERT INTO referral_status_history(referral_id,to_status,changed_by,note) VALUES(%s,'CREATED',%s,'Referral created')", (x["id"], u["id"]))
    c.execute("INSERT INTO referral_status_history(referral_id,from_status,to_status,changed_by,note) VALUES(%s,'CREATED','SENT',%s,'Referral sent to receiving facility')", (x["id"], u["id"]))
    audit(c, u, "CREATE_REFERRAL", f"referral:{x['id']}", patient_id=b.patient_id, commit=False)
    return x
@r.get("/referrals")
def refs(u=Depends(need(*CLIN)), c=Depends(db)):
    rows = c.execute("""
        SELECT r.id, r.status, r.specialty, r.priority, r.reason, r.clinical_notes,
               r.created_at, r.from_facility_id, r.to_facility_id, r.patient_id,
               r.encounter_id, r.screening_id,
               p.full_name, p.arovia_id,
               f1.name AS from_facility_name, f2.name AS to_facility_name,
               u1.full_name AS from_doctor_name
        FROM referrals r
        JOIN patients p ON p.id = r.patient_id
        LEFT JOIN facilities f1 ON f1.id = r.from_facility_id
        LEFT JOIN facilities f2 ON f2.id = r.to_facility_id
        LEFT JOIN users u1 ON u1.id = r.from_doctor_id
        WHERE r.from_facility_id = %s OR (r.to_facility_id = %s AND EXISTS (
            SELECT 1 FROM consent_records cr JOIN patient_sharing_access_grants g
              ON g.patient_id=cr.patient_id AND g.facility_id=cr.granted_to_facility_id
              JOIN facilities af ON af.id=g.facility_id AND af.participation_status='ACTIVE'
            WHERE cr.patient_id=r.patient_id AND cr.granted_to_facility_id=%s
              AND cr.status='ACTIVE' AND cr.valid_from<=CURRENT_DATE
              AND (cr.valid_until IS NULL OR cr.valid_until>=CURRENT_DATE)
              AND ('ALL'=ANY(cr.data_categories) OR 'CLINICAL'=ANY(cr.data_categories))
              AND g.revoked_at IS NULL AND g.expires_at>now()))
        ORDER BY r.created_at DESC LIMIT 100
    """, (u["facility_id"], u["facility_id"],u["facility_id"])).fetchall()
    for row in rows:
        patient_access(c,u,row["patient_id"],"VIEW_REFERRAL_SUMMARY")
    audit(c, u, "LIST_REFERRALS", "referrals")
    return rows

@r.get("/referrals/{rid}")
def get_referral(rid: int, u=Depends(need(*CLIN)), c=Depends(db)):
    x = c.execute("""
        SELECT r.*, p.full_name, p.arovia_id, p.date_of_birth, p.sex,
               f1.name AS from_facility_name, f2.name AS to_facility_name,
               u1.full_name AS from_doctor_name
        FROM referrals r
        JOIN patients p ON p.id = r.patient_id
        LEFT JOIN facilities f1 ON f1.id = r.from_facility_id
        LEFT JOIN facilities f2 ON f2.id = r.to_facility_id
        LEFT JOIN users u1 ON u1.id = r.from_doctor_id
        WHERE r.id = %s
    """, (rid,)).fetchone()
    if not x:
        raise HTTPException(404, "Referral not found")
    if x["from_facility_id"] != u["facility_id"] and x["to_facility_id"] != u["facility_id"]:
        audit(c, u, "VIEW_REFERRAL", f"referral:{rid}", "DENIED", patient_id=x["patient_id"], reason="facility is not a referral participant")
        raise HTTPException(403, "Not your facility's referral")
    patient_access(c,u,x["patient_id"],"VIEW_REFERRAL")
    history = c.execute("""
        SELECT h.*, u.full_name AS changed_by_name
        FROM referral_status_history h
        LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.referral_id = %s
        ORDER BY h.at ASC
    """, (rid,)).fetchall()
    audit(c, u, "VIEW_REFERRAL", f"referral:{rid}", patient_id=x["patient_id"])
    return {"referral": x, "history": history}
FLOW = {"CREATED": {"SENT", "CANCELLED"}, "SENT": {"ACCEPTED", "REJECTED", "CANCELLED"}, "ACCEPTED": {"IN_PROGRESS", "COMPLETED"}, "IN_PROGRESS": {"COMPLETED"}}
class ReferralStatusIn(BaseModel): note: str | None = None
@r.post("/referrals/{rid}/status")
def ref_status(rid: int, to: str, b: ReferralStatusIn | None = None, u=Depends(need("DOCTOR", "HOSPITAL_ADMIN")), c=Depends(db)):
    x = c.execute("SELECT * FROM referrals WHERE id=%s FOR UPDATE", (rid,)).fetchone()
    sender = {"SENT", "CANCELLED"}; side = x and (x["from_facility_id"] if to in sender else x["to_facility_id"])
    if not x or side != u["facility_id"]: audit(c, u, "REFERRAL_STATUS", f"referral:{rid}", "DENIED"); raise HTTPException(403, "Not your side of this referral")
    patient_access(c,u,x["patient_id"],"UPDATE_REFERRAL_STATUS",commit=False)
    if to not in FLOW.get(x["status"], set()): raise HTTPException(422, f"{x['status']} -> {to} not allowed")
    c.execute("UPDATE referrals SET status=%s WHERE id=%s", (to, rid))
    note = b.note.strip() if b and b.note else None
    c.execute("INSERT INTO referral_status_history(referral_id,from_status,to_status,changed_by,note) VALUES(%s,%s,%s,%s,%s)", (rid, x["status"], to, u["id"], note))
    audit(c, u, "REFERRAL_STATUS", f"referral:{rid}", patient_id=x["patient_id"], commit=False)
    return {"ok": True}

class ReferralFollowUpIn(BaseModel): action: str
@r.post("/referrals/{rid}/follow-ups")
def referral_follow_up(rid: int, b: ReferralFollowUpIn, u=Depends(need("DOCTOR", "HOSPITAL_ADMIN")), c=Depends(db)):
    action = b.action.strip()
    if not action or len(action) > 2000:
        raise HTTPException(422, "Follow-up action must be between 1 and 2000 characters")
    x = c.execute("SELECT * FROM referrals WHERE id=%s FOR UPDATE", (rid,)).fetchone()
    if not x:
        raise HTTPException(404, "Referral not found")
    if u["facility_id"] not in (x["from_facility_id"], x["to_facility_id"]):
        audit(c, u, "REFERRAL_FOLLOW_UP", f"referral:{rid}", "DENIED")
        raise HTTPException(403, "Not your facility's referral")
    patient_access(c, u, x["patient_id"], "RECORD_REFERRAL_FOLLOW_UP", commit=False)
    c.execute("INSERT INTO referral_status_history(referral_id,from_status,to_status,changed_by,note) VALUES(%s,%s,%s,%s,%s)", (rid, x["status"], x["status"], u["id"], "Follow-up: " + action))
    audit(c, u, "REFERRAL_FOLLOW_UP", f"referral:{rid}", patient_id=x["patient_id"], commit=False)
    return {"ok": True}
