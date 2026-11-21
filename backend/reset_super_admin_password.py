
import os
from getpass import getpass
from pathlib import Path
from dotenv import load_dotenv
import psycopg
from app.core import hash_pw

# Load the existing backend .env file
load_dotenv(Path(__file__).resolve().parent / ".env")

database_url = os.environ.get("DATABASE_URL")

if not database_url:
    raise SystemExit("DATABASE_URL not found. Check backend/.env")

email = input("Enter your Super Admin email: ").strip()
password = getpass("Enter your new password: ")
confirm = getpass("Confirm your new password: ")

if len(password) < 12:
    raise SystemExit("Password must contain at least 12 characters.")

if password != confirm:
    raise SystemExit("Passwords do not match.")

with psycopg.connect(database_url) as conn:
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE users
            SET password_hash = %s
            WHERE id = 1
              AND email = %s
              AND role = 'SUPER_ADMIN'
            RETURNING id, email, role
            """,
            (hash_pw(password), email)
        )

        account = cur.fetchone()

        if not account:
            raise SystemExit(
                "No matching Super Admin account found."
            )

        print("Password updated successfully!")
        print("Account:", account[1])
        print("Role:", account[2])
