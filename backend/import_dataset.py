import sys, csv, os, hashlib, psycopg
from dotenv import load_dotenv
load_dotenv()
folder, csv_path, name, url, lic = sys.argv[1:6]
with psycopg.connect(os.environ["DATABASE_URL"]) as c:
    ds = c.execute("INSERT INTO research.datasets(name,source_url,license) VALUES(%s,%s,%s) "
                   "ON CONFLICT(name) DO UPDATE SET name=EXCLUDED.name RETURNING id", (name, url, lic)).fetchone()[0]
    n = 0
    for row in csv.DictReader(open(csv_path)):
        ref = next((row["id_code"] + e for e in (".png", ".jpg", ".jpeg") if os.path.exists(os.path.join(folder, row["id_code"] + e))), None)
        if not ref: continue
        h = hashlib.sha256(open(os.path.join(folder, ref), "rb").read()).hexdigest()
        c.execute("INSERT INTO research.images(dataset_id,image_ref,label_dr_grade,sha256) VALUES(%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                  (ds, ref, int(row["diagnosis"]), h)); n += 1
print("imported", n)