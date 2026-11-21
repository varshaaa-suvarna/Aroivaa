import React, { useState, useEffect } from "react"; import { api, apiBlob } from "./api.js";
const Brand = () => <div className="brand">AR<i>O</i>VIA</div>;
const useForm = (init) => { const [v, s] = useState(init); return [v, (k) => (e) => s({ ...v, [k]: e.target.value }), s]; };
const Err = ({ e }) => (e ? <p className="err">{e}</p> : null);
const Field = ({ l, ...p }) => <label>{l}<input {...p} /></label>;

function Login({ onLogin }) {
  const [f, set] = useForm({ email: "", password: "" }); const [e, setE] = useState("");
  const go = async () => { try { const r = await api("/auth/login", { method: "POST", body: f }); localStorage.setItem("arovia_token", r.token); onLogin(r.user); } catch (x) { setE(x.message); } };
  return <div style={{ maxWidth: 360, margin: "12vh auto" }} className="panel"><Brand /><p className="muted"></p>
    <Field l="Email" value={f.email} onChange={set("email")} /><Field l="Password" type="password" value={f.password} onChange={set("password")} /><Err e={e} /><button onClick={go}>Sign in</button></div>;
}

function Admin() {
  const [s, setS] = useState(null);
  const [a, setA] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [e, setE] = useState("");

  const load = () => {
    api("/stats").then(setS).catch((x) => setE(x.message));
    api("/applications").then(setA).catch((x) => setE(x.message));
    api("/facilities").then(setFacilities).catch((x) => setE(x.message));
  };

  useEffect(load, []);

  const move = async (id, status) => {
    try {
      await api(`/applications/${id}/status`, {
        method: "POST",
        body: { status }
      });
      load();
    } catch (x) {
      setE(x.message);
    }
  };

  const verify = async (id, status) => {
    try {
      await api(`/facilities/${id}/verify`, {
        method: "POST",
        body: { status }
      });
      load();
    } catch (x) {
      setE(x.message);
    }
  };

  return <>
    <h2>Network overview</h2>
    <Err e={e} />

    <div className="grid">
      {s && Object.entries(s).map(([k, v]) =>
        <div className="panel stat" key={k}>
          <b>{v}</b>{k.replace("_", " ")}
        </div>
      )}
    </div>

    <h3>Hospital Directory</h3>
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Hospital</th>
            <th>Category</th>
            <th>Verification</th>
            <th>Participation</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {facilities.map((f) => (
            <tr key={f.id}>
              <td>{f.name}</td>
              <td>{f.category}</td>
              <td>{f.verification_status}</td>
              <td>{f.participation_status}</td>
              <td>
                <button onClick={() =>
                  verify(
                    f.id,
                    f.verification_status === "VERIFIED"
                      ? "UNVERIFIED"
                      : "VERIFIED"
                  )
                }>
                  {f.verification_status === "VERIFIED"
                    ? "Mark Unverified"
                    : "Verify"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

    <h3>Hospital Applications</h3>
    <div className="panel">
      <table>
        <thead>
          <tr>
            <th>Hospital</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {a.map((x) => (
            <tr key={x.id}>
              <td>{x.hospital_name}</td>
              <td>{x.status}</td>
              <td>
                <select
                  defaultValue=""
                  onChange={(ev) =>
                    ev.target.value && move(x.id, ev.target.value)
                  }
                >
                  <option value="">Change status…</option>
                  {[
                    "DOCUMENTS_PENDING",
                    "DOCUMENTS_UNDER_REVIEW",
                    "VERIFICATION_IN_PROGRESS",
                    "CLARIFICATION_REQUIRED",
                    "APPROVED",
                    "REJECTED",
                    "ONBOARDING_IN_PROGRESS",
                    "ACTIVE",
                    "SUSPENDED",
                    "REVOKED"
                  ].map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </>;
}

function Register({ open }) {
  const [f, set] = useForm({ full_name: "", date_of_birth: "", sex: "U", phone: "", address: "", local_patient_id: "" }); const [e, setE] = useState("");
  const go = async () => { try { const p = await api("/patients", { method: "POST", body: f }); open(p.id); } catch (x) { setE(x.message); } };
  return <><h2>Register patient</h2><div className="panel"><Field l="Full name" value={f.full_name} onChange={set("full_name")} /><Field l="Date of birth" type="date" value={f.date_of_birth} onChange={set("date_of_birth")} />
    <label>Sex<select value={f.sex} onChange={set("sex")}><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option><option value="U">Unspecified</option></select></label>
    <Field l="Phone" value={f.phone} onChange={set("phone")} /><Field l="Address" value={f.address} onChange={set("address")} /><Field l="Hospital patient ID (your facility's own number)" value={f.local_patient_id} onChange={set("local_patient_id")} />
    <p className="muted">Aadhaar is not collected. An Arovia Patient ID is generated automatically.</p><Err e={e} /><button onClick={go}>Register</button></div></>;
}
function Search({ open }) {
  const [q, setQ] = useState(""), [rows, setR] = useState([]), [e, setE] = useState("");
  const go = () => api("/patients?q=" + encodeURIComponent(q)).then(setR).catch((x) => setE(x.message));
  return <><h2>Patient search</h2><div className="panel"><input placeholder="Name, Arovia ID or hospital ID" value={q} onChange={(x) => setQ(x.target.value)} /><button onClick={go}>Search</button><Err e={e} />
    <table><tbody>{rows.map((p) => <tr key={p.id}><td>{p.full_name}</td><td>{p.arovia_id}</td><td>{p.local_patient_id}</td><td><button onClick={() => open(p.id)}>Open</button></td></tr>)}</tbody></table></div></>;
}
function Profile({ id, me }) {
  const [d, setD] = useState(null), [tl, setTl] = useState([]), [e, setE] = useState(""), [enc, set] = useForm({ encounter_type: "OUTPATIENT", clinical_notes: "" });
  const load = () => { api("/patients/" + id).then(setD).catch((x) => setE(x.message)); api(`/patients/${id}/timeline`).then(setTl).catch(() => {}); };
  useEffect(load, [id]);
  const add = async () => { try { await api(`/patients/${id}/encounters`, { method: "POST", body: enc }); load(); } catch (x) { setE(x.message); } };
  if (e && !d) return <Err e={e} />; if (!d) return null; const p = d.patient;
  return <><div className="panel"><h2>{p.full_name}</h2><span className="muted">{p.arovia_id} · DOB {p.date_of_birth} · {p.sex} · identity {p.identity_verification}</span>{p.is_demo && <b> DEMO / SYNTHETIC</b>}
    <p><b>Allergies:</b> {d.allergies.map((a) => a.substance).join(", ") || "none recorded"}</p><p><b>Diagnoses:</b> {d.diagnoses.map((a) => a.description).join("; ") || "none recorded"}</p>
    <p><b>Prescriptions:</b> {d.prescriptions.map((a) => a.medication).join("; ") || "none recorded"}</p></div>
    {["DOCTOR", "OPTOMETRIST", "HOSPITAL_ADMIN"].includes(me.role) && <div className="panel"><h3>New encounter</h3><select value={enc.encounter_type} onChange={set("encounter_type")}><option>OUTPATIENT</option><option>INPATIENT</option><option>EMERGENCY</option><option>FOLLOW_UP</option><option>SCREENING</option></select>
      <textarea rows="3" placeholder="Clinical notes" value={enc.clinical_notes} onChange={set("clinical_notes")} /><Err e={e} /><button onClick={add}>Save encounter</button></div>}
    {["DOCTOR", "OPTOMETRIST", "HOSPITAL_ADMIN"].includes(me.role) && <Screening pid={id} me={me} past={d.screenings} onDone={load} />}
    <h3>Timeline</h3><div className="panel tl">{tl.map((t, i) => <div key={i}><b>{t.kind}</b> <span className="muted">{new Date(t.at).toLocaleString()}</span><br />{t.detail}</div>)}</div></>;
}
const GRADES = ["Grade 0 – No DR", "Grade 1 – Mild NPDR", "Grade 2 – Moderate NPDR", "Grade 3 – Severe NPDR", "Grade 4 – Proliferative DR"];
function Screening({ pid, me, past, onDone }) {
  const [encs, setEncs] = useState([]), [encId, setEncId] = useState(""), [eye, setEye] = useState("RIGHT"), [file, setFile] = useState(null), [prev, setPrev] = useState(null);
  const [scr, setScr] = useState(null), [img, setImg] = useState(null), [e, setE] = useState(""), [busy, setBusy] = useState(false);
  const [rv, setRv] = useState({ final_grade: 0, assessment: "", recommendations: "" });
  useEffect(() => { api(`/patients/${pid}/encounters`).then((x) => { setEncs(x); if (x[0]) setEncId(x[0].id); }).catch(() => {}); }, [pid]);
  const show = async (id) => { setScr(await api("/screenings/" + id)); setImg(await apiBlob(`/screenings/${id}/image`)); };
  const run = async (fn) => { setE(""); setBusy(true); try { await fn(); } catch (x) { setE(x.message); } setBusy(false); };
  const upload = () => run(async () => { const f = new FormData(); f.append("encounter_id", encId); f.append("eye", eye); f.append("image", file); const r = await api(`/patients/${pid}/screenings`, { method: "POST", form: f }); await show(r.id); onDone(); });
  const predict = () => run(async () => { await api(`/screenings/${scr.screening.id}/predict`, { method: "POST" }); await show(scr.screening.id); });
  const review = () => run(async () => { await api(`/screenings/${scr.screening.id}/review`, { method: "POST", body: { ...rv, final_grade: Number(rv.final_grade) } }); await show(scr.screening.id); onDone(); });
  const S = scr?.screening, q = S?.quality_metrics;
  return <div className="panel"><h3>Retinal screening</h3>
    <label>Encounter<select value={encId} onChange={(x) => setEncId(x.target.value)}>{encs.map((x) => <option key={x.id} value={x.id}>#{x.id} {x.encounter_type} · {new Date(x.encounter_at).toLocaleDateString()}</option>)}</select></label>
    <label>Eye<select value={eye} onChange={(x) => setEye(x.target.value)}><option value="RIGHT">Right</option><option value="LEFT">Left</option><option value="BOTH">Both</option></select></label>
    <input type="file" accept="image/jpeg,image/png" onChange={(x) => { const f = x.target.files[0]; setFile(f); setPrev(f ? URL.createObjectURL(f) : null); }} />
    {prev && !scr && <img src={prev} alt="preview" style={{ maxWidth: 260, display: "block", marginBottom: 10 }} />}
    <button disabled={!file || !encId || busy} onClick={upload}>{busy ? "Working…" : "Upload and check quality"}</button> <Err e={e} />
    {past?.length > 0 && <p className="muted">Previous: {past.map((x) => <a key={x.id} style={{ cursor: "pointer", marginRight: 8, textDecoration: "underline" }} onClick={() => show(x.id)}>#{x.id} {x.eye} {x.status}</a>)}</p>}
    {S && <div style={{ marginTop: 14 }}>{img && <img src={img} alt="fundus" style={{ maxWidth: 260, float: "right", marginLeft: 12 }} />}
      <p><b>Image quality:</b> <span className={S.quality_status === "ACCEPTABLE" ? "" : "err"}>{S.quality_status === "ACCEPTABLE" ? "Accepted" : "Rejected"}</span> <span className="muted">({S.eye} eye · {new Date(S.screened_at).toLocaleString()})</span></p>
      {q?.metrics && <p className="muted">sharpness {q.metrics.sharpness} · brightness {q.metrics.brightness} · contrast {q.metrics.contrast} · field coverage {q.metrics.coverage}</p>}
      {S.status === "REJECTED_QUALITY" && <><p className="err">Rejected at quality check, so no AI prediction was run: {q.reasons.join("; ")}. Please capture or upload a clearer image.</p></>}
      {S.quality_status === "ACCEPTABLE" && !scr.prediction && S.status !== "REVIEWED" && <button disabled={busy} onClick={predict}>Run AI screening</button>}
      {scr.prediction && <div className="panel"><b>AI screening result (not a diagnosis)</b><br />{GRADES[scr.prediction.dr_grade]} · confidence {(scr.prediction.confidence * 100).toFixed(1)}%<br /><span className="muted">Model {scr.prediction.name} {scr.prediction.version}. A doctor must review before this enters the clinical assessment.</span></div>}
      {scr.review && <div className="panel"><b>Doctor assessment:</b> {GRADES[scr.review.final_grade]}<br />{scr.review.assessment}<br /><span className="muted">{scr.review.recommendations}</span></div>}
      {me.role === "DOCTOR" && S.quality_status === "ACCEPTABLE" && !scr.review && <div style={{ clear: "both" }}><h3>Doctor review</h3>
        <select value={rv.final_grade} onChange={(x) => setRv({ ...rv, final_grade: x.target.value })}>{GRADES.map((g, i) => <option key={i} value={i}>{g}</option>)}</select>
        <textarea rows="3" placeholder="Clinical assessment" value={rv.assessment} onChange={(x) => setRv({ ...rv, assessment: x.target.value })} />
        <textarea rows="2" placeholder="Recommendations" value={rv.recommendations} onChange={(x) => setRv({ ...rv, recommendations: x.target.value })} />
        <button disabled={busy || !rv.assessment} onClick={review}>Record final assessment</button></div>}
      <div style={{ clear: "both" }} /></div>}</div>;
}
function Audit() { const [r, setR] = useState([]); useEffect(() => { api("/audit").then(setR).catch(() => {}); }, []);
  return <><h2>Access audit</h2><div className="panel"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Resource</th><th>Outcome</th></tr></thead><tbody>
    {r.map((x) => <tr key={x.id}><td>{new Date(x.at).toLocaleString()}</td><td>{x.user_id}</td><td>{x.action}</td><td>{x.resource}</td><td className={x.outcome === "DENIED" ? "err" : ""}>{x.outcome}</td></tr>)}</tbody></table></div></>; }

export default function App() {
  const [me, setMe] = useState(null), [page, setPage] = useState("home"), [pid, setPid] = useState(null);
  useEffect(() => { if (localStorage.getItem("arovia_token")) api("/auth/me").then(setMe).catch(() => localStorage.removeItem("arovia_token")); }, []);
  if (!me) return <Login onLogin={setMe} />;
  const open = (id) => { setPid(id); setPage("profile"); }; const admin = me.role === "SUPER_ADMIN";
  const nav = admin ? [["home", "Overview"], ["audit", "Audit"]] : [["search", "Patient search"], ["register", "Register patient"], ["audit", "Audit"]];
  return <div className="shell"><nav><Brand /><p className="muted">{me.full_name}<br />{me.role}</p>
    {nav.filter(([k]) => k !== "audit" || admin || me.role === "HOSPITAL_ADMIN").map(([k, l]) => <a key={k} className={page === k ? "on" : ""} onClick={() => setPage(k)}>{l}</a>)}
    <a onClick={() => { localStorage.removeItem("arovia_token"); setMe(null); }}>Sign out</a></nav>
    <main>{page === "audit" ? <Audit /> : admin ? <Admin /> : page === "register" ? <Register open={open} /> : page === "profile" ? <Profile id={pid} me={me} /> : <Search open={open} />}</main></div>;
}
