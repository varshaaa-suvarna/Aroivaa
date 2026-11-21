import os, hashlib, uuid
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from ..core import *
r = APIRouter()
CLIN = ("HOSPITAL_ADMIN", "DOCTOR", "OPTOMETRIST", "REGISTRATION")
class PatientIn(BaseModel): full_name: str; date_of_birth: date; sex: str | None = None; phone: str | None = None; address: str | None = None; abha_id: str | None = None; local_patient_id: str
@r.post("/patients")
def register(b: PatientIn, u=Depends(need(*CLIN)), c=Depends(db)):
    p = c.execute("INSERT INTO patients(full_name,date_of_birth,sex,phone,address,abha_id,created_by) VALUES(%s,%s,%s,%s,%s,%s,%s) RETURNING id,arovia_id", (b.full_name.strip(), b.date_of_birth, b.sex, b.phone, b.address, b.abha_id, u["id"])).fetchone()
    c.execute("INSERT INTO hospital_patient_links(patient_id,facility_id,local_patient_id) VALUES(%s,%s,%s)", (p["id"], u["facility_id"], b.local_patient_id))
    c.commit(); audit(c, u, "REGISTER_PATIENT", f"patient:{p['id']}", patient_id=p["id"]); return p
@r.get("/patients")
def search(q: str = "", limit: int = 25, offset: int = 0, u=Depends(need(*CLIN)), c=Depends(db)):
    rows = c.execute("""SELECT p.id,p.arovia_id,p.full_name,p.date_of_birth,l.local_patient_id FROM patients p JOIN hospital_patient_links l ON l.patient_id=p.id AND l.facility_id=%s
        WHERE lower(p.full_name) LIKE %s OR p.arovia_id=%s OR l.local_patient_id=%s ORDER BY p.full_name LIMIT %s OFFSET %s""", (u["facility_id"], f"%{q.lower()}%", q, q, min(limit, 100), offset)).fetchall()
    audit(c, u, "SEARCH_PATIENTS", "patients"); return rows
@r.get("/patients/{pid}")
def profile(pid: int, u=Depends(need(*CLIN)), c=Depends(db)):
    patient_access(c, u, pid, "VIEW_PROFILE")
    p = c.execute("SELECT * FROM patients WHERE id=%s", (pid,)).fetchone()
    if not p:
        raise HTTPException(404, "Patient not found")
    if u["role"] == "REGISTRATION":
        return {
            "patient": p,
            "allergies": [],
            "diagnoses": [],
            "prescriptions": [],
            "referrals": [],
            "screenings": []
        }
    g = lambda s: c.execute(s, (pid,)).fetchall()
    return {
        "patient": p,
        "allergies": g("SELECT * FROM allergies WHERE patient_id=%s"),
        "diagnoses": g("SELECT * FROM diagnoses WHERE patient_id=%s ORDER BY created_at DESC"),
        "prescriptions": g("SELECT * FROM prescriptions WHERE patient_id=%s ORDER BY created_at DESC"),
        "referrals": g("SELECT * FROM referrals WHERE patient_id=%s ORDER BY created_at DESC"),
        "screenings": g("SELECT * FROM screenings WHERE patient_id=%s ORDER BY screened_at DESC")
    }
class PatientPatch(BaseModel): phone: str | None = None; address: str | None = None; abha_id: str | None = None
@r.patch("/patients/{pid}")
def update(pid: int, b: PatientPatch, u=Depends(need(*CLIN)), c=Depends(db)):
    patient_access(c, u, pid, "UPDATE_PATIENT")
    c.execute("UPDATE patients SET phone=COALESCE(%s,phone),address=COALESCE(%s,address),abha_id=COALESCE(%s,abha_id) WHERE id=%s", (b.phone, b.address, b.abha_id, pid)); c.commit(); return {"ok": True}
@r.get("/patients/{pid}/timeline")
def timeline(pid: int, u=Depends(need(*CLIN)), c=Depends(db)):
    patient_access(c, u, pid, "VIEW_TIMELINE")
    return c.execute("""SELECT * FROM (
      SELECT created_at AS at,'Patient registered' AS kind,full_name AS detail FROM patients WHERE id=%(p)s
      UNION ALL SELECT encounter_at,'Encounter: '||encounter_type,coalesce(clinical_notes,'') FROM encounters WHERE patient_id=%(p)s
      UNION ALL SELECT created_at,'Diagnosis',description FROM diagnoses WHERE patient_id=%(p)s
      UNION ALL SELECT created_at,'Prescription',medication FROM prescriptions WHERE patient_id=%(p)s
      UNION ALL SELECT screened_at,'Retinal screening ('||status||')',eye FROM screenings WHERE patient_id=%(p)s
      UNION ALL SELECT created_at,'Doctor review','Grade '||final_grade FROM screening_reviews sr JOIN screenings s ON s.id=sr.screening_id WHERE s.patient_id=%(p)s
      UNION ALL SELECT created_at,'Referral ('||status||')',specialty FROM referrals WHERE patient_id=%(p)s) t ORDER BY at DESC""", {"p": pid}).fetchall()
class EncIn(BaseModel): encounter_type: str; doctor_id: int | None = None; clinical_notes: str | None = None; treatment: str | None = None; follow_up: str | None = None
@r.post("/patients/{pid}/encounters")
def new_enc(pid: int, b: EncIn, u=Depends(need("DOCTOR", "OPTOMETRIST", "HOSPITAL_ADMIN")), c=Depends(db)):
    patient_access(c, u, pid, "CREATE_ENCOUNTER")
    e = c.execute("INSERT INTO encounters(patient_id,facility_id,encounter_type,doctor_id,clinical_notes,treatment,follow_up,created_by) VALUES(%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id", (pid, u["facility_id"], b.encounter_type, b.doctor_id or (u["id"] if u["role"] == "DOCTOR" else None), b.clinical_notes, b.treatment, b.follow_up, u["id"])).fetchone()
    c.commit(); return e
@r.get("/patients/{pid}/encounters")
def encs(pid: int, u=Depends(need(*CLIN)), c=Depends(db)):
    patient_access(c, u, pid, "VIEW_ENCOUNTERS")
    return c.execute("SELECT * FROM encounters WHERE patient_id=%s ORDER BY encounter_at DESC", (pid,)).fetchall()
class DxIn(BaseModel): encounter_id: int; description: str; icd10_code: str | None = None
@r.post("/patients/{pid}/diagnoses")
def add_dx(pid: int, b: DxIn, u=Depends(need("DOCTOR")), c=Depends(db)):
    patient_access(c, u, pid, "ADD_DIAGNOSIS")
    c.execute("INSERT INTO diagnoses(encounter_id,patient_id,description,icd10_code,recorded_by) VALUES(%s,%s,%s,%s,%s)", (b.encounter_id, pid, b.description, b.icd10_code, u["id"])); c.commit(); return {"ok": True}
class RxIn(BaseModel): encounter_id: int; medication: str; dosage: str | None = None; frequency: str | None = None; duration: str | None = None
@r.post("/patients/{pid}/prescriptions")
def add_rx(pid: int, b: RxIn, u=Depends(need("DOCTOR")), c=Depends(db)):
    patient_access(c, u, pid, "ADD_PRESCRIPTION")
    c.execute("INSERT INTO prescriptions(encounter_id,patient_id,medication,dosage,frequency,duration,recorded_by) VALUES(%s,%s,%s,%s,%s,%s,%s)", (b.encounter_id, pid, b.medication, b.dosage, b.frequency, b.duration, u["id"])); c.commit(); return {"ok": True}
class AlIn(BaseModel): substance: str; reaction: str | None = None; severity: str | None = None
@r.post("/patients/{pid}/allergies")
def add_al(pid: int, b: AlIn, u=Depends(need("DOCTOR", "OPTOMETRIST")), c=Depends(db)):
    patient_access(c, u, pid, "ADD_ALLERGY")
    c.execute("INSERT INTO allergies(patient_id,substance,reaction,severity,recorded_by) VALUES(%s,%s,%s,%s,%s)", (pid, b.substance, b.reaction, b.severity, u["id"])); c.commit(); return {"ok": True}
# ---- retinal screening ----
from psycopg.types.json import Json
from fastapi.responses import FileResponse
from ..quality import assess
from .. import inference
UP = lambda: os.environ.get("UPLOAD_DIR", "../uploads")
@r.post("/patients/{pid}/screenings")
async def screening(pid: int, encounter_id: int = Form(...), eye: str = Form(...), image: UploadFile = File(...), u=Depends(need("DOCTOR", "OPTOMETRIST")), c=Depends(db)):
    patient_access(c, u, pid, "CREATE_SCREENING")
    if image.content_type not in ("image/jpeg", "image/png") or eye not in ("RIGHT", "LEFT", "BOTH"): raise HTTPException(422, "JPEG/PNG and eye RIGHT|LEFT|BOTH required")
    if not c.execute("SELECT 1 FROM encounters WHERE id=%s AND patient_id=%s AND facility_id=%s", (encounter_id, pid, u["facility_id"])).fetchone(): raise HTTPException(422, "Encounter does not belong to this patient/facility")
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
    patient_access(c, u, s["patient_id"], action); return s
@r.get("/screenings/{sid}")
def screening_detail(sid: int, u=Depends(need(*CLIN)), c=Depends(db)):
    s = _scr(c, u, sid, "VIEW_SCREENING"); s.pop("storage_ref")
    pred = c.execute("SELECT p.dr_grade,p.confidence,m.name,m.version FROM screening_predictions p JOIN ml_models m ON m.id=p.model_id WHERE p.screening_id=%s ORDER BY p.id DESC LIMIT 1", (sid,)).fetchone()
    rev = c.execute("SELECT final_grade,assessment,recommendations,created_at FROM screening_reviews WHERE screening_id=%s ORDER BY id DESC LIMIT 1", (sid,)).fetchone()
    return {"screening": s, "prediction": pred, "review": rev}
@r.get("/screenings/{sid}/image")
def screening_image(sid: int, u=Depends(need(*CLIN)), c=Depends(db)):
    s = _scr(c, u, sid, "VIEW_RETINAL_IMAGE"); return FileResponse(os.path.join(UP(), s["storage_ref"]))
@r.post("/screenings/{sid}/predict")
def predict(sid: int, u=Depends(need("DOCTOR", "OPTOMETRIST")), c=Depends(db)):
    s = _scr(c, u, sid, "REQUEST_PREDICTION")
    if s["quality_status"] != "ACCEPTABLE": raise HTTPException(409, "Image was rejected at the quality check; no prediction is run. Upload a clearer image.")
    if s["status"] in ("AI_COMPLETE", "REVIEWED"): raise HTTPException(409, "Prediction already recorded")
    try: res = inference.predict(os.path.join(UP(), s["storage_ref"]))
    except inference.ModelNotReady as ex:
        c.execute("UPDATE screenings SET status='AWAITING_MODEL' WHERE id=%s", (sid,)); c.commit(); raise HTTPException(503, str(ex))
    m = c.execute("INSERT INTO ml_models(name,version,is_active) VALUES(%s,%s,true) ON CONFLICT(name,version) DO UPDATE SET is_active=true RETURNING id", (res["name"], res["version"])).fetchone()
    c.execute("INSERT INTO screening_predictions(screening_id,model_id,dr_grade,confidence) VALUES(%s,%s,%s,%s)", (sid, m["id"], res["grade"], res["confidence"]))
    c.execute("UPDATE screenings SET status='AI_COMPLETE' WHERE id=%s", (sid,)); c.commit(); return res
class RevIn(BaseModel): final_grade: int; assessment: str; recommendations: str | None = None
@r.post("/screenings/{sid}/review")
def review(sid: int, b: RevIn, u=Depends(need("DOCTOR")), c=Depends(db)):
    s = c.execute("SELECT patient_id,quality_status FROM screenings WHERE id=%s", (sid,)).fetchone()
    if not s or not 0 <= b.final_grade <= 4: raise HTTPException(422)
    if s["quality_status"] != "ACCEPTABLE": raise HTTPException(409, "Rejected-quality screening cannot be reviewed; repeat the capture")
    patient_access(c, u, s["patient_id"], "REVIEW_SCREENING")
    c.execute("INSERT INTO screening_reviews(screening_id,reviewer_id,final_grade,assessment,recommendations) VALUES(%s,%s,%s,%s,%s)", (sid, u["id"], b.final_grade, b.assessment, b.recommendations))
    c.execute("UPDATE screenings SET status='REVIEWED' WHERE id=%s", (sid,)); c.commit(); return {"ok": True}
# ---- referrals ----
class RefIn(BaseModel): patient_id: int; to_facility_id: int; specialty: str; reason: str; clinical_notes: str | None = None; priority: str = "ROUTINE"; encounter_id: int | None = None; screening_id: int | None = None
@r.post("/referrals")
def referral(b: RefIn, u=Depends(need("DOCTOR")), c=Depends(db)):
    patient_access(c, u, b.patient_id, "CREATE_REFERRAL")
    x = c.execute("INSERT INTO referrals(patient_id,from_facility_id,from_doctor_id,to_facility_id,specialty,reason,clinical_notes,priority,encounter_id,screening_id) VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id", (b.patient_id, u["facility_id"], u["id"], b.to_facility_id, b.specialty, b.reason, b.clinical_notes, b.priority, b.encounter_id, b.screening_id)).fetchone()
    c.execute("INSERT INTO referral_status_history(referral_id,to_status,changed_by) VALUES(%s,'CREATED',%s)", (x["id"], u["id"])); c.commit(); return x
@r.get("/referrals")
def refs(u=Depends(need(*CLIN)), c=Depends(db)):
    return c.execute("""
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
        WHERE r.from_facility_id = %s OR r.to_facility_id = %s
        ORDER BY r.created_at DESC LIMIT 100
    """, (u["facility_id"], u["facility_id"])).fetchall()

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
        raise HTTPException(403, "Not your facility's referral")
    history = c.execute("""
        SELECT h.*, u.full_name AS changed_by_name
        FROM referral_status_history h
        LEFT JOIN users u ON u.id = h.changed_by
        WHERE h.referral_id = %s
        ORDER BY h.at ASC
    """, (rid,)).fetchall()
    return {"referral": x, "history": history}
FLOW = {"CREATED": {"SENT", "CANCELLED"}, "SENT": {"ACCEPTED", "REJECTED", "CANCELLED"}, "ACCEPTED": {"IN_PROGRESS"}, "IN_PROGRESS": {"COMPLETED"}}
@r.post("/referrals/{rid}/status")
def ref_status(rid: int, to: str, note: str | None = None, u=Depends(need("DOCTOR", "HOSPITAL_ADMIN")), c=Depends(db)):
    x = c.execute("SELECT * FROM referrals WHERE id=%s FOR UPDATE", (rid,)).fetchone()
    sender = {"SENT", "CANCELLED"}; side = x and (x["from_facility_id"] if to in sender else x["to_facility_id"])
    if not x or side != u["facility_id"]: audit(c, u, "REFERRAL_STATUS", f"referral:{rid}", "DENIED"); raise HTTPException(403, "Not your side of this referral")
    if to not in FLOW.get(x["status"], set()): raise HTTPException(422, f"{x['status']} -> {to} not allowed")
    c.execute("UPDATE referrals SET status=%s WHERE id=%s", (to, rid))
    c.execute("INSERT INTO referral_status_history(referral_id,from_status,to_status,changed_by,note) VALUES(%s,%s,%s,%s,%s)", (rid, x["status"], to, u["id"], note)); c.commit(); return {"ok": True}
