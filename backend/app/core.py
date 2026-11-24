
import os
import time
import jwt
import bcrypt
import psycopg

from psycopg.rows import dict_row
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET = os.environ.get("JWT_SECRET", "")

bearer_scheme = HTTPBearer(auto_error=False)


def db():
    with psycopg.connect(
        os.environ["DATABASE_URL"],
        row_factory=dict_row
    ) as c:
        yield c


def hash_pw(p):
    return bcrypt.hashpw(
        p.encode(),
        bcrypt.gensalt()
    ).decode()


def check_pw(p, h):
    return bcrypt.checkpw(p.encode(), h.encode())


def make_token(u):
    return jwt.encode(
        {
            "sub": str(u["id"]),
            "exp": int(time.time()) + 8 * 3600
        },
        SECRET,
        "HS256"
    )


def audit(c, user, action, resource, outcome="ALLOWED",
          patient_id=None, reason=None, commit=True):
    c.execute(
        """INSERT INTO access_logs
        (user_id,facility_id,patient_id,action,resource,outcome,reason)
        VALUES(%s,%s,%s,%s,%s,%s,%s)""",
        (
            user["id"] if user else None,
            user["facility_id"] if user else None,
            patient_id,
            action,
            resource,
            outcome,
            reason
        )
    )
    if commit:
        c.commit()


def current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    c=Depends(db)
):
    if not credentials or not SECRET:
        raise HTTPException(401, "Not authenticated")

    try:
        uid = int(
            jwt.decode(
                credentials.credentials,
                SECRET,
                algorithms=["HS256"]
            )["sub"]
        )
    except Exception:
        raise HTTPException(401, "Invalid token")

    u = c.execute(
        """SELECT id,email,full_name,role,facility_id
        FROM users WHERE id=%s AND is_active""",
        (uid,)
    ).fetchone()

    if not u:
        raise HTTPException(401, "Inactive user")

    return u


def need(*roles):
    def dep(u=Depends(current_user), c=Depends(db)):
        if u["role"] not in roles:
            audit(
                c, u, "ROLE_CHECK", "endpoint", "DENIED",
                reason=f"role {u['role']} not in {roles}"
            )
            raise HTTPException(403, "Role not permitted")

        return u

    return dep

def has_active_clinical_consent(c, patient_id, facility_id):
    return bool(c.execute(
        """SELECT 1 FROM consent_records
        WHERE patient_id=%s AND granted_to_facility_id=%s AND status='ACTIVE'
          AND valid_from<=CURRENT_DATE
          AND (valid_until IS NULL OR valid_until>=CURRENT_DATE)
          AND ('ALL'=ANY(data_categories) OR 'CLINICAL'=ANY(data_categories)) LIMIT 1""",
        (patient_id,facility_id)
    ).fetchone())


def has_active_patient_sharing_access(c, patient_id, facility_id):
    return bool(c.execute(
        """SELECT 1 FROM consent_records cr
        JOIN patient_sharing_access_grants g
          ON g.patient_id=cr.patient_id AND g.facility_id=cr.granted_to_facility_id
        JOIN facilities f ON f.id=g.facility_id AND f.participation_status='ACTIVE'
        WHERE cr.patient_id=%s AND cr.granted_to_facility_id=%s AND cr.status='ACTIVE'
          AND cr.valid_from<=CURRENT_DATE AND (cr.valid_until IS NULL OR cr.valid_until>=CURRENT_DATE)
          AND ('ALL'=ANY(cr.data_categories) OR 'CLINICAL'=ANY(cr.data_categories))
          AND g.revoked_at IS NULL AND g.expires_at>now() LIMIT 1""",
        (patient_id, facility_id)
    ).fetchone())


def patient_access(c, u, pid, action, commit=True):
    """Allow the linked facility or a consented facility with an active password grant."""
    linked = u["role"] != "SUPER_ADMIN" and c.execute(
        """SELECT 1 FROM hospital_patient_links
        WHERE patient_id=%s AND facility_id=%s""", (pid, u["facility_id"])
    ).fetchone()
    shared = u["role"] != "SUPER_ADMIN" and has_active_patient_sharing_access(c,pid,u["facility_id"])
    ok = bool(linked or shared)

    if not ok:
        audit(c,u,action,f"patient:{pid}","DENIED",pid,"no facility link or active sharing grant")
        raise HTTPException(403, "No access to this patient: facility link or active patient sharing grant required")
    if commit:
        audit(c,u,action,f"patient:{pid}","ALLOWED",pid)
    else:
        c.execute("""INSERT INTO access_logs(user_id,facility_id,patient_id,action,resource,outcome)
            VALUES(%s,%s,%s,%s,%s,'ALLOWED')""", (u["id"],u["facility_id"],pid,action,f"patient:{pid}"))
