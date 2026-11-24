import unittest
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import HTTPException

from app.routes.clinical import (
    PatientShareAccessIn,
    _generate_sharing_password,
    grant_patient_share_access,
)


class FakeConnection:
    def __init__(self, password, consent_active=True, facility_active=True):
        self.patient_id = 17
        self.password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        self.consent_active = consent_active
        self.facility_active = facility_active
        self.failed_attempts = 0
        self.locked_until = None
        self.grants = 0
        self.access_logs = []
        self.result = None

    def execute(self, query, params=None):
        sql = " ".join(query.lower().split())
        self.result = None
        if "from facilities where id=%s and participation_status='active'" in sql:
            self.result = {"id": 2} if self.facility_active else None
        elif "select id,sharing_password_hash from patients" in sql:
            self.result = {"id": self.patient_id, "sharing_password_hash": self.password_hash}
        elif "from consent_records" in sql:
            self.result = {"ok": True} if self.consent_active else None
        elif "insert into patient_sharing_access_attempts" in sql:
            pass
        elif "select failed_attempts,locked_until" in sql:
            self.result = {"failed_attempts": self.failed_attempts, "locked_until": self.locked_until}
        elif "update patient_sharing_access_attempts set failed_attempts=%s" in sql:
            self.failed_attempts = params[0]
            self.locked_until = datetime.now(timezone.utc) + timedelta(minutes=15) if params[1] else None
        elif "update patient_sharing_access_attempts set failed_attempts=0" in sql:
            self.failed_attempts = 0
            self.locked_until = None
        elif "insert into patient_sharing_access_grants" in sql:
            self.grants += 1
            self.result = {"expires_at": datetime.now(timezone.utc) + timedelta(minutes=60)}
        elif "insert into access_logs" in sql:
            self.access_logs.append(params)
        else:
            raise AssertionError(f"Unexpected SQL in test fake: {sql}")
        return self

    def fetchone(self):
        return self.result

    def commit(self):
        pass


class PatientSharingTests(unittest.TestCase):
    user = {"id": 4, "facility_id": 2, "role": "DOCTOR"}

    def test_generated_sharing_password_is_readable_and_hashable(self):
        password = _generate_sharing_password()
        self.assertRegex(password, r"^AROVIA-\d{4}$")
        password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
        self.assertTrue(bcrypt.checkpw(password.encode(), password_hash))

    def test_correct_password_creates_timed_facility_grant_and_audit(self):
        db = FakeConnection("patient-secret")
        result = grant_patient_share_access(
            PatientShareAccessIn(arovia_id="ar-123456", sharing_password="patient-secret"),
            self.user,
            db,
        )
        self.assertEqual(result["patient_id"], 17)
        self.assertEqual(db.grants, 1)
        self.assertEqual(db.failed_attempts, 0)
        self.assertEqual(len(db.access_logs), 1)

    def test_five_failed_passwords_lock_verification(self):
        db = FakeConnection("patient-secret")
        request = PatientShareAccessIn(arovia_id="AR-123456", sharing_password="incorrect")
        for expected_status in (403, 403, 403, 403, 429):
            with self.assertRaises(HTTPException) as error:
                grant_patient_share_access(request, self.user, db)
            self.assertEqual(error.exception.status_code, expected_status)
        self.assertEqual(db.failed_attempts, 5)
        self.assertIsNotNone(db.locked_until)
        self.assertEqual(db.grants, 0)

    def test_password_is_not_checked_without_current_consent(self):
        db = FakeConnection("patient-secret", consent_active=False)
        with self.assertRaises(HTTPException) as error:
            grant_patient_share_access(
                PatientShareAccessIn(arovia_id="AR-123456", sharing_password="patient-secret"),
                self.user,
                db,
            )
        self.assertEqual(error.exception.status_code, 403)
        self.assertEqual(db.failed_attempts, 0)
        self.assertEqual(db.grants, 0)


if __name__ == "__main__":
    unittest.main()
