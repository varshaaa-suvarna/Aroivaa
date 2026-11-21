"""Usage: python create_super_admin.py you@example.org "Full Name"  (prompts for password)"""
import sys, os, getpass, psycopg
from dotenv import load_dotenv

load_dotenv()

from app.core import hash_pw
pw = getpass.getpass("Password (min 10 chars): ")
assert len(pw) >= 10
with psycopg.connect(os.environ["DATABASE_URL"]) as c:
    c.execute("INSERT INTO users(email,full_name,password_hash,role) VALUES(%s,%s,%s,'SUPER_ADMIN')", (sys.argv[1].lower(), sys.argv[2], hash_pw(pw)))
print("created")
