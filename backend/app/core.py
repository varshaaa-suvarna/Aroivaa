
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
          patient_id=None, reason=None):
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


def patient_access(c, u, pid, action):
    """Facility-level rule: staff may access a patient only if
    their facility holds a link to that patient."""

    ok = (
        u["role"] != "SUPER_ADMIN"
        and c.execute(
            """SELECT 1 FROM hospital_patient_links
            WHERE patient_id=%s AND facility_id=%s""",
            (pid, u["facility_id"])
        ).fetchone()
    )

    audit(
        c,
        u,
        action,
        f"patient:{pid}",
        "ALLOWED" if ok else "DENIED",
        pid,
        None if ok else "no facility link or consent"
    )

    if not ok:
        raise HTTPException(403, "No access to this patient")
