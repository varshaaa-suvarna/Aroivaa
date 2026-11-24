import React, { useState, useEffect, useRef } from "react";
import { api, apiBlob } from "./api.js";

const Brand = () => (
  <div className="brand-wrap">
    <img src="/logo.png" alt="AROVIA" className="brand-img" />
  </div>
);
const useForm = (init) => {
  const [v, s] = useState(init);
  return [v, (k) => (e) => s({ ...v, [k]: e.target.value }), s];
};
const Err = ({ e }) => (e ? <p className="err">{e}</p> : null);
const Field = ({ l, ...p }) => <label>{l}<input {...p} /></label>;
function SharingPasswordDisplay({ password, label = "Sharing password" }) {
  const [copyStatus, setCopyStatus] = useState("");
  const [copyFailed, setCopyFailed] = useState(false);

  const copy = async () => {
    setCopyStatus("");
    setCopyFailed(false);
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard access is unavailable");
      }
      await navigator.clipboard.writeText(password);
      setCopyStatus("Password copied.");
    } catch {
      setCopyFailed(true);
      setCopyStatus("Copy failed. Select and copy the password above.");
    }
  };

  return (
    <div className="notice-box">
      <b>{label}</b>
      <div className="flex-gap" style={{ marginTop: 8, flexWrap: "wrap" }}>
        <code style={{ userSelect: "all", fontSize: "1.2rem", fontWeight: 700, letterSpacing: "0.08em", padding: "6px 10px", background: "#fff" }}>
          {password}
        </code>
        <button type="button" className="sm" onClick={copy}>Copy</button>
      </div>
      {copyStatus && <p className={copyFailed ? "err" : "success"} role="status">{copyStatus}</p>}
    </div>
  );
}

// Name and contact validators
const NAME_REGEX = /^[A-Za-z\s.'-]{2,100}$/;
const hasDigits = (str) => /\d/.test(str || "");
const blockNumbers = (e) => {
  if (/[0-9]/.test(e.key)) {
    e.preventDefault();
  }
};
const isValidName = (name) => {
  if (!name || typeof name !== "string") return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  if (hasDigits(trimmed)) return false;
  return NAME_REGEX.test(trimmed) && /[A-Za-z]/.test(trimmed);
};
const isValidPhone = (phone) => {
  if (!phone) return true;
  const clean = String(phone).replace(/[\s\-()]/g, "");
  return /^\+?[0-9]{10,15}$/.test(clean);
};

const ROLE_LABELS = {
  SUPER_ADMIN: "Super Admin",
  HOSPITAL_ADMIN: "Hospital Admin",
  DOCTOR: "Doctor",
  OPTOMETRIST: "Optometrist",
};

const GRADES = [
  "Grade 0 – No DR",
  "Grade 1 – Mild NPDR",
  "Grade 2 – Moderate NPDR",
  "Grade 3 – Severe NPDR",
  "Grade 4 – Proliferative DR"
];

// -------------------------------------------------------------
// LOGIN COMPONENT
// -------------------------------------------------------------
function Login({ onLogin }) {
  const initialMode = window.location.hash === "#register" ? "register" :
                      window.location.hash === "#forgot" ? "forgot" : "login";
  const [mode, setMode] = useState(initialMode);
  const [role, setRole] = useState("");
  const [f, set] = useForm({ email: "", password: "" });

  const initialApp = {
    hospital_name: "", category: "", registration_no: "",
    address: "", phone: "", email: "",
    rep_name: "", rep_designation: "", rep_contact: ""
  };
  const [app, setApp] = useForm(initialApp);

  const [e, setE] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async (event) => {
    event.preventDefault();
    setE("");
    setSuccess("");

    if (!role) {
      setE("Please select your login role.");
      return;
    }
    if (!f.email.trim() || !f.password) {
      setE("Please enter your email and password.");
      return;
    }

    try {
      setBusy(true);
      const r = await api("/auth/login", {
        method: "POST",
        body: {
          email: f.email.trim(),
          password: f.password,
          role: role
        }
      });

      if (!r.user || r.user.role !== role) {
        setE("The selected role does not match this account.");
        return;
      }

      localStorage.setItem("arovia_token", r.token);
      onLogin(r.user);
    } catch (x) {
      setE(x.message);
    } finally {
      setBusy(false);
    }
  };

  const submitApplication = async (event) => {
    event.preventDefault();
    setE("");
    setSuccess("");

    if (!app.hospital_name.trim() || !app.category.trim() || !app.rep_name.trim()) {
      setE("Please complete all required fields (Hospital name, category, and representative).");
      return;
    }
    if (hasDigits(app.rep_name)) {
      setE("Representative name cannot contain numbers. Only letters are allowed.");
      return;
    }
    if (!isValidName(app.rep_name)) {
      setE("Please enter a valid representative name (letters only, min 2 characters).");
      return;
    }
    if (app.rep_contact && !isValidPhone(app.rep_contact)) {
      setE("Representative contact must be a valid 10 to 15 digit phone number.");
      return;
    }

    try {
      setBusy(true);
      const r = await api("/applications", {
        method: "POST",
        body: {
          hospital_name: app.hospital_name.trim(),
          category: app.category.trim(),
          registration_no: app.registration_no.trim() || null,
          address: app.address.trim() || null,
          phone: app.phone.trim() || null,
          email: app.email.trim() || null,
          rep_name: app.rep_name.trim(),
          rep_designation: app.rep_designation.trim() || null,
          rep_contact: app.rep_contact.trim() || null
        }
      });

      setSuccess(`Application submitted successfully! Reference ID: #${r.id}. Arovia administration will review it.`);
      setApp({ ...initialApp });
    } catch (x) {
      setE(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 440, margin: "7vh auto" }} className="panel">
      <Brand />

      {mode === "login" && (
        <>
          <h2>Sign In to Arovia</h2>
          <p className="muted">Secure Health Record & Referral Exchange Network</p>

          <form onSubmit={go}>
            <label>
              Login As *
              <select value={role} onChange={(ev) => setRole(ev.target.value)} required>
                <option value="">Select your role</option>
                <option value="SUPER_ADMIN">Super Admin</option>
                <option value="HOSPITAL_ADMIN">Hospital Admin</option>
                <option value="DOCTOR">Doctor</option>
                <option value="OPTOMETRIST">Optometrist</option>
              </select>
            </label>

            <Field
              l="Email address *"
              type="email"
              required
              autoComplete="username"
              value={f.email}
              onChange={set("email")}
            />

            <Field
              l="Password *"
              type="password"
              required
              autoComplete="current-password"
              value={f.password}
              onChange={set("password")}
            />

            <div style={{ textAlign: "right", margin: "-6px 0 12px" }}>
              <button
                type="button"
                className="link-btn"
                onClick={() => { setE(""); setSuccess(""); setMode("forgot"); }}
              >
                Forgot password?
              </button>
            </div>

            <Err e={e} />
            {success && <p className="success">{success}</p>}

            <button type="submit" disabled={busy} style={{ width: "100%" }}>
              {busy ? "Authenticating..." : "Sign in"}
            </button>
          </form>

          <hr style={{ margin: "20px 0", borderColor: "var(--line)" }} />
          <p className="muted" style={{ marginBottom: 6 }}>
            New healthcare facility joining Arovia?
          </p>
          <button
            type="button"
            className="sec"
            style={{ width: "100%" }}
            onClick={() => { setE(""); setSuccess(""); setMode("register"); }}
          >
            Apply for Hospital Onboarding
          </button>
        </>
      )}

      {mode === "register" && (
        <>
          <h2>Hospital Onboarding Application</h2>
          <p className="muted">Submit hospital verification details to Arovia Super Admin</p>

          <form onSubmit={submitApplication}>
            <Field l="Hospital Name *" required value={app.hospital_name} onChange={setApp("hospital_name")} />
            <Field l="Facility Category (e.g. Multispecialty, Eye Hospital) *" required value={app.category} onChange={setApp("category")} />
            <Field l="Registration / License Number" value={app.registration_no} onChange={setApp("registration_no")} />
            <Field l="Hospital Address" value={app.address} onChange={setApp("address")} />
            <Field l="Official Phone" type="tel" value={app.phone} onChange={setApp("phone")} />
            <Field l="Official Email" type="email" value={app.email} onChange={setApp("email")} />

            <h4 style={{ marginTop: 16 }}>Authorized Representative</h4>
            <Field l="Representative Name *" required value={app.rep_name} onChange={setApp("rep_name")} onKeyDown={blockNumbers} pattern="[A-Za-z\s.'-]+" title="Letters only, no numbers allowed" placeholder="e.g. Dr. Ramesh Kumar" />
            <Field l="Designation (e.g. Medical Director, Dean)" value={app.rep_designation} onChange={setApp("rep_designation")} />
            <Field l="Representative Contact" type="tel" value={app.rep_contact} onChange={setApp("rep_contact")} pattern="\+?[0-9\s-]{10,15}" title="10-digit phone number" placeholder="e.g. 9876543210" />

            <Err e={e} />
            {success && <p className="success">{success}</p>}

            <div className="flex-gap" style={{ marginTop: 14 }}>
              <button type="submit" disabled={busy}>{busy ? "Submitting..." : "Submit Application"}</button>
              <button type="button" className="sec" onClick={() => { setE(""); setMode("login"); }}>Back to Sign In</button>
            </div>
          </form>
        </>
      )}

      {mode === "forgot" && (
        <>
          <h2>Password Recovery Assistance</h2>
          <p className="muted">Security policy for password management in Arovia:</p>

          <div className="notice-box">
            <p><strong>Hospital Staff (Doctors, Optometrists, Registration):</strong> Contact your facility's Hospital Admin to update credentials or verify account status.</p>
            <p><strong>Hospital Administrators:</strong> Contact Arovia Network Super Admin for administrative identity verification.</p>
            <p><strong>Super Admin:</strong> Use the secure offline terminal reset utility (<code>reset_super_admin_password.py</code>).</p>
          </div>

          <p className="muted" style={{ fontSize: ".82rem" }}>
            Note: In accordance with clinical security protocols, self-service automated password resets are disabled to prevent credential hijacking.
          </p>

          <button type="button" className="sec" style={{ marginTop: 12 }} onClick={() => { setE(""); setMode("login"); }}>
            Back to Sign In
          </button>
        </>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// SUPER ADMIN DASHBOARD
// -------------------------------------------------------------
function SuperAdminDashboard() {
  const [tab, setTab] = useState("overview");
  const [stats, setStats] = useState(null);
  const [apps, setApps] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [logs, setLogs] = useState([]);
  const [e, setE] = useState("");
  const [msg, setMsg] = useState("");

  // Create Hospital Admin Modal State
  const [adminModalFid, setAdminModalFid] = useState(null);
  const [adminForm, setAdminForm] = useForm({ email: "", full_name: "", password: "" });
  const [adminBusy, setAdminBusy] = useState(false);
  const autoPromptedAdminSetup = useRef(false);

  const loadData = () => {
    api("/stats").then(setStats).catch((x) => setE(x.message));
    api("/applications").then(setApps).catch((x) => setE(x.message));
    api("/facilities").then(setFacilities).catch((x) => setE(x.message));
    api("/audit").then(setLogs).catch((x) => setE(x.message));
  };

  useEffect(loadData, []);

  useEffect(() => {
    if (autoPromptedAdminSetup.current) return;
    const pending = apps.find((application) =>
      application.facility_id && !application.has_hospital_admin &&
      ["APPROVED", "ONBOARDING_IN_PROGRESS"].includes(application.status)
    );
    if (!pending) return;
    autoPromptedAdminSetup.current = true;
    setAdminForm({ email: pending.email || "", full_name: pending.rep_name || "", password: "" });
    setAdminModalFid(pending.facility_id);
  }, [apps]);

  const changeAppStatus = async (aid, status) => {
    setE(""); setMsg("");
    try {
      const result = await api(`/applications/${aid}/status`, { method: "POST", body: { status } });
      setMsg(`Application #${aid} status updated to ${status}.`);
      loadData();
      if (["APPROVED", "ONBOARDING_IN_PROGRESS"].includes(status) && result.facility_id) {
        const application = apps.find((item) => item.id === aid);
        if (application && !application.has_hospital_admin) {
          setAdminForm({ email: application.email || "", full_name: application.rep_name || "", password: "" });
          setAdminModalFid(result.facility_id);
        }
      }
    } catch (x) {
      setE(x.message);
    }
  };

  const toggleVerifyFacility = async (fid, currentStatus) => {
    setE(""); setMsg("");
    const nextStatus = currentStatus === "VERIFIED" ? "UNVERIFIED" : "VERIFIED";
    try {
      await api(`/facilities/${fid}/verify`, { method: "POST", body: { status: nextStatus } });
      setMsg(`Facility #${fid} verification updated to ${nextStatus}.`);
      loadData();
    } catch (x) {
      setE(x.message);
    }
  };

  const handleCreateHospitalAdmin = async (ev) => {
    ev.preventDefault();
    setE(""); setMsg("");
    const cleanName = (adminForm.full_name || "").trim();
    if (!cleanName) {
      setE("Please provide administrator full name.");
      return;
    }
    if (hasDigits(cleanName)) {
      setE("Administrator full name cannot contain numbers. Only letters and standard name characters are allowed.");
      return;
    }
    if (!isValidName(cleanName)) {
      setE("Please enter a valid administrator full name (letters only, min 2 characters).");
      return;
    }
    if (adminForm.password.length < 10) {
      setE("Password must be at least 10 characters.");
      return;
    }
    try {
      setAdminBusy(true);
      const res = await api(`/facilities/${adminModalFid}/admin`, {
        method: "POST",
        body: adminForm
      });
      setMsg(`Admin account created for ${res.hospital}: ${res.account.email}`);
      setAdminModalFid(null);
      setAdminForm({ email: "", full_name: "", password: "" });
      loadData();
    } catch (x) {
      setE(x.message);
    } finally {
      setAdminBusy(false);
    }
  };

  return (
    <>
      <div className="flex-between">
        <h2>Arovia Network Super Admin</h2>
        <span className="badge badge-ok">Authorized Network Admin</span>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>Network Overview</button>
        <button className={`tab ${tab === "applications" ? "active" : ""}`} onClick={() => setTab("applications")}>Hospital Applications ({apps.length})</button>
        <button className={`tab ${tab === "facilities" ? "active" : ""}`} onClick={() => setTab("facilities")}>Facilities Directory ({facilities.length})</button>
        <button className={`tab ${tab === "audit" ? "active" : ""}`} onClick={() => setTab("audit")}>Network Audit Logs</button>
      </div>

      <Err e={e} />
      {msg && <p className="success">{msg}</p>}

      {tab === "overview" && (
        <>
          <div className="grid">
            {stats && Object.entries(stats).map(([k, v]) => (
              <div className="panel stat" key={k}>
                <b>{v}</b>
                <span className="muted">{k.replace(/_/g, " ")}</span>
              </div>
            ))}
          </div>

          <div className="panel" style={{ marginTop: 20 }}>
            <h3>Recent Pending Applications</h3>
            {apps.filter(a => a.status === "SUBMITTED" || a.status === "ONBOARDING_IN_PROGRESS").length === 0 ? (
              <p className="muted">No pending hospital applications at this time.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Hospital</th>
                    <th>Category</th>
                    <th>Contact Rep</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {apps.filter(a => a.status === "SUBMITTED" || a.status === "ONBOARDING_IN_PROGRESS").slice(0, 5).map(a => (
                    <tr key={a.id}>
                      <td><b>{a.hospital_name}</b></td>
                      <td>{a.category}</td>
                      <td>{a.rep_name} ({a.rep_contact || a.phone || "No phone"})</td>
                      <td><span className="badge badge-warn">{a.status}</span></td>
                      <td>
                        <button className="sm" onClick={() => setTab("applications")}>Review</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "applications" && (
        <div className="panel">
          <h3>Hospital Onboarding Applications</h3>
          {apps.length === 0 ? (
            <p className="muted">No applications submitted yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Hospital</th>
                  <th>Category</th>
                  <th>Representative</th>
                  <th>Registration No</th>
                  <th>Status</th>
                  <th>Change Status</th>
                  <th>Onboarding</th>
                </tr>
              </thead>
              <tbody>
                {apps.map(a => (
                  <tr key={a.id}>
                    <td>
                      <b>{a.hospital_name}</b>
                      {a.email && <div className="muted">{a.email}</div>}
                    </td>
                    <td>{a.category}</td>
                    <td>{a.rep_name} ({a.rep_designation || "Rep"})<br /><span className="muted">{a.rep_contact}</span></td>
                    <td>{a.registration_no || "N/A"}</td>
                    <td>
                      <span className={`badge ${a.status === "ACTIVE" || a.status === "APPROVED" ? "badge-ok" : a.status === "REJECTED" ? "badge-err" : "badge-warn"}`}>
                        {a.status}
                      </span>
                    </td>
                    <td>
                      <select
                        defaultValue=""
                        onChange={(ev) => ev.target.value && changeAppStatus(a.id, ev.target.value)}
                        style={{ margin: 0, padding: 4, width: "auto" }}
                      >
                        <option value="">Select status…</option>
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
                        ].map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </td>
                    <td>
                      {!a.facility_id && a.status === "APPROVED" ? (
                        <button className="sm alt" onClick={() => changeAppStatus(a.id, "APPROVED")}>Continue onboarding</button>
                      ) : a.facility_id && !a.has_hospital_admin && ["APPROVED", "ONBOARDING_IN_PROGRESS"].includes(a.status) ? (
                        <button className="sm alt" onClick={() => {
                          setAdminForm({ email: a.email || "", full_name: a.rep_name || "", password: "" });
                          setAdminModalFid(a.facility_id);
                          setE("");
                        }}>Create Hospital Admin</button>
                      ) : a.has_hospital_admin ? <span className="badge badge-ok">Admin created</span> : <span className="muted">Approve to continue</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "facilities" && (
        <div className="panel">
          <h3>Healthcare Facilities Directory</h3>
          <p className="muted">Verify facilities and provision initial Hospital Administrator accounts.</p>
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Facility Name</th>
                <th>Category</th>
                <th>Verification</th>
                <th>Participation</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {facilities.map(f => (
                <tr key={f.id}>
                  <td>#{f.id}</td>
                  <td><b>{f.name}</b></td>
                  <td>{f.category}</td>
                  <td>
                    <span className={`badge ${f.verification_status === "VERIFIED" ? "badge-ok" : "badge-warn"}`}>
                      {f.verification_status}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${f.participation_status === "ACTIVE" ? "badge-ok" : "badge-neutral"}`}>
                      {f.participation_status}
                    </span>
                  </td>
                  <td>
                    <div className="flex-gap">
                      <button
                        className="sm sec"
                        onClick={() => toggleVerifyFacility(f.id, f.verification_status)}
                      >
                        {f.verification_status === "VERIFIED" ? "Unverify" : "Verify"}
                      </button>
                      {f.verification_status === "VERIFIED" && !f.has_hospital_admin && (
                        <button
                          className="sm alt"
                          onClick={() => { setAdminModalFid(f.id); setE(""); }}
                        >
                          + Create Admin
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "audit" && (
        <div className="panel">
          <h3>Network-Wide Access & Security Audit</h3>
          <table>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>User ID</th>
                <th>Facility ID</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td>{new Date(l.at).toLocaleString()}</td>
                  <td>{l.user_id ? `#${l.user_id}` : "Unauthenticated"}</td>
                  <td>{l.facility_id ? `#${l.facility_id}` : "Network"}</td>
                  <td><b>{l.action}</b></td>
                  <td>{l.resource}</td>
                  <td>
                    <span className={`badge ${l.outcome === "ALLOWED" ? "badge-ok" : "badge-err"}`}>
                      {l.outcome}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE HOSPITAL ADMIN MODAL */}
      {adminModalFid && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Provision Hospital Administrator</h3>
            <p className="muted">Facility ID: #{adminModalFid}</p>
            <form onSubmit={handleCreateHospitalAdmin}>
              <Field l="Admin Full Name *" required value={adminForm.full_name} onChange={setAdminForm("full_name")} onKeyDown={blockNumbers} pattern="[A-Za-z\s.'-]+" title="Letters only, no numbers allowed" placeholder="e.g. Dr. Rajesh Sharma" />
              <Field l="Admin Work Email *" type="email" required value={adminForm.email} onChange={setAdminForm("email")} />
              <Field l="Initial Password (min 10 chars) *" type="password" required value={adminForm.password} onChange={setAdminForm("password")} />
              <Err e={e} />
              <div className="flex-gap" style={{ marginTop: 16 }}>
                <button type="submit" disabled={adminBusy}>{adminBusy ? "Creating..." : "Create Hospital Admin"}</button>
                <button type="button" className="sec" onClick={() => setAdminModalFid(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// -------------------------------------------------------------
// HOSPITAL ADMIN DASHBOARD
// -------------------------------------------------------------
function HospitalAdminDashboard({ me, openPatient, setPage }) {
  const [tab, setTab] = useState("overview");
  const [facility, setFacility] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [referrals, setReferrals] = useState([]);
  const [logs, setLogs] = useState([]);
  const [e, setE] = useState("");
  const [msg, setMsg] = useState("");

  // Staff creation form
  const [staffModal, setStaffModal] = useState(false);
  const [staffForm, setStaffForm] = useForm({
    email: "", full_name: "", password: "", role: "DOCTOR"
  });
  const [busy, setBusy] = useState(false);

  const loadData = () => {
    if (me.facility_id) {
      api(`/facilities/${me.facility_id}`).then(setFacility).catch(() => {});
    }
    api("/staff").then(setStaffList).catch((x) => setE(x.message));
    api("/referrals").then(setReferrals).catch(() => {});
    api("/audit").then(setLogs).catch(() => {});
  };

  useEffect(loadData, [me.facility_id]);

  const handleCreateStaff = async (ev) => {
    ev.preventDefault();
    setE(""); setMsg("");
    const cleanName = (staffForm.full_name || "").trim();
    if (!cleanName) {
      setE("Please provide staff full name.");
      return;
    }
    if (hasDigits(cleanName)) {
      setE("Staff full name cannot contain numbers. Only letters and standard name characters are allowed.");
      return;
    }
    if (!isValidName(cleanName)) {
      setE("Please enter a valid staff full name (letters only, min 2 characters).");
      return;
    }
    if (staffForm.password.length < 10) {
      setE("Password must be at least 10 characters.");
      return;
    }
    try {
      setBusy(true);
      await api("/staff", {
        method: "POST",
        body: staffForm
      });
      setMsg(`Staff account created for ${staffForm.full_name} (${ROLE_LABELS[staffForm.role]}).`);
      setStaffModal(false);
      setStaffForm({ email: "", full_name: "", password: "", role: "DOCTOR" });
      loadData();
    } catch (x) {
      setE(x.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleStaffStatus = async (uid, currentActive) => {
    setE(""); setMsg("");
    try {
      await api(`/staff/${uid}/status`, {
        method: "PATCH",
        body: { is_active: !currentActive }
      });
      setMsg(`Staff member status changed.`);
      loadData();
    } catch (x) {
      setE(x.message);
    }
  };

  return (
    <>
      <div className="flex-between">
        <div>
          <h2>Hospital Administration: {facility ? facility.name : `Facility #${me.facility_id}`}</h2>
          <span className="muted">{facility?.category || "Medical Facility"} · {facility?.district || "Dakshina Kannada"}</span>
        </div>
        <span className="badge badge-ok">Hospital Admin</span>
      </div>

      <div className="tabs" style={{ marginTop: 14 }}>
        <button className={`tab ${tab === "overview" ? "active" : ""}`} onClick={() => setTab("overview")}>Overview</button>
        <button className={`tab ${tab === "staff" ? "active" : ""}`} onClick={() => setTab("staff")}>Staff Management ({staffList.length})</button>
        <button className={`tab ${tab === "referrals" ? "active" : ""}`} onClick={() => setTab("referrals")}>Hospital Referrals ({referrals.length})</button>
        <button className={`tab ${tab === "audit" ? "active" : ""}`} onClick={() => setTab("audit")}>Facility Audit</button>
      </div>

      <Err e={e} />
      {msg && <p className="success">{msg}</p>}

      {tab === "overview" && (
        <>
          <div className="panel flex-gap" style={{ marginBottom: 14 }}>
            <button onClick={() => setPage("register")}>+ Register Patient</button>
            <button className="sec" onClick={() => setPage("search")}>Search Patient Records</button>
          </div>
          <div className="grid">
            <div className="panel stat">
              <b>{staffList.length}</b>
              <span className="muted">Total Hospital Staff</span>
            </div>
            <div className="panel stat">
              <b>{staffList.filter(s => s.role === "DOCTOR").length}</b>
              <span className="muted">Active Doctors</span>
            </div>
            <div className="panel stat">
              <b>{staffList.filter(s => s.role === "OPTOMETRIST").length}</b>
              <span className="muted">Optometrists</span>
            </div>
            <div className="panel stat">
              <b>{referrals.length}</b>
              <span className="muted">Exchange Referrals</span>
            </div>
          </div>

          <div className="panel">
            <h3>Facility Registration Details</h3>
            <p><b>Verification Status:</b> <span className="badge badge-ok">{facility?.verification_status || "VERIFIED"}</span></p>
            <p><b>Participation Status:</b> <span className="badge badge-info">{facility?.participation_status || "ACTIVE"}</span></p>
            <p><b>Address:</b> {facility?.address || "Address on record"}</p>
            <p><b>Contact Phone:</b> {facility?.phone || "N/A"}</p>
            <p><b>Official Email:</b> {facility?.email || "N/A"}</p>
          </div>
        </>
      )}

      {tab === "staff" && (
        <div className="panel">
          <div className="flex-between">
            <h3>Authorized Hospital Personnel</h3>
            <button onClick={() => { setE(""); setStaffModal(true); }}>+ Add New Staff Member</button>
          </div>
          <p className="muted">Hospital Admin verifies employment and credentials before provisioning accounts.</p>

          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Account Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {staffList.map(s => (
                <tr key={s.id}>
                  <td><b>{s.full_name}</b> {s.id === me.id && <span className="muted">(You)</span>}</td>
                  <td>{s.email}</td>
                  <td><span className="badge badge-neutral">{ROLE_LABELS[s.role] || s.role}</span></td>
                  <td>
                    <span className={`badge ${s.is_active ? "badge-ok" : "badge-err"}`}>
                      {s.is_active ? "ACTIVE" : "INACTIVE"}
                    </span>
                  </td>
                  <td>
                    {s.id !== me.id && (
                      <button
                        className={`sm ${s.is_active ? "danger" : "sec"}`}
                        onClick={() => toggleStaffStatus(s.id, s.is_active)}
                      >
                        {s.is_active ? "Deactivate" : "Activate"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "referrals" && (
        <div className="panel">
          <h3>Hospital Referral Network Activity</h3>
          {referrals.length === 0 ? (
            <p className="muted">No referrals on record for this hospital yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Referral #</th>
                  <th>Patient</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Specialty</th>
                  <th>Priority</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {referrals.map(r => (
                  <tr key={r.id}>
                    <td>#{r.id}</td>
                    <td><b>{r.full_name}</b> ({r.arovia_id})</td>
                    <td>{r.from_facility_name || `Hospital #${r.from_facility_id}`}</td>
                    <td>{r.to_facility_name || `Hospital #${r.to_facility_id}`}</td>
                    <td>{r.specialty}</td>
                    <td>
                      <span className={`badge ${r.priority === "EMERGENCY" ? "badge-err" : r.priority === "URGENT" ? "badge-warn" : "badge-info"}`}>
                        {r.priority}
                      </span>
                    </td>
                    <td><span className="badge badge-neutral">{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "audit" && (
        <div className="panel">
          <h3>Hospital-Level Access & Privacy Logs</h3>
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Resource</th>
                <th>Outcome</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id}>
                  <td>{new Date(l.at).toLocaleString()}</td>
                  <td>#{l.user_id}</td>
                  <td><b>{l.action}</b></td>
                  <td>{l.resource}</td>
                  <td><span className={`badge ${l.outcome === "ALLOWED" ? "badge-ok" : "badge-err"}`}>{l.outcome}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* CREATE STAFF MODAL */}
      {staffModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Add Authorized Hospital Staff</h3>
            <p className="muted">Create verified employee account under your facility.</p>
            <form onSubmit={handleCreateStaff}>
              <label>
                Role *
                <select value={staffForm.role} onChange={setStaffForm("role")} required>
                  <option value="DOCTOR">Doctor</option>
                  <option value="OPTOMETRIST">Optometrist</option>
                </select>
              </label>

              <Field l="Full Name *" required value={staffForm.full_name} onChange={setStaffForm("full_name")} onKeyDown={blockNumbers} pattern="[A-Za-z\s.'-]+" title="Letters only, no numbers allowed" placeholder="e.g. Dr. Priya Nair" />
              <Field l="Work Email Address *" type="email" required value={staffForm.email} onChange={setStaffForm("email")} />
              <Field l="Password (minimum 10 characters) *" type="password" required value={staffForm.password} onChange={setStaffForm("password")} />

              <Err e={e} />
              <div className="flex-gap" style={{ marginTop: 14 }}>
                <button type="submit" disabled={busy}>{busy ? "Creating Account..." : "Create Account"}</button>
                <button type="button" className="sec" onClick={() => setStaffModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// -------------------------------------------------------------
// PATIENT REGISTRATION
// -------------------------------------------------------------
function PatientRegister({ open, onSearch }) {
  const [f, set] = useForm({
    full_name: "", date_of_birth: "", sex: "U", phone: "", email: "", address: "", blood_group: "", emergency_contact_name: "", emergency_contact_relationship: "", emergency_contact_phone: "", local_patient_id: ""
  });
  const [e, setE] = useState("");
  const [busy, setBusy] = useState(false);
  const [createdPatient, setCreatedPatient] = useState(null);

  const go = async (ev) => {
    ev.preventDefault();
    const cleanName = (f.full_name || "").trim();
    if (!cleanName || !f.date_of_birth || !f.local_patient_id.trim()) {
      setE("Please provide patient full name, date of birth, and local hospital ID.");
      return;
    }
    if (hasDigits(cleanName)) {
      setE("Patient full name cannot contain numbers. Only letters and standard name characters are allowed.");
      return;
    }
    if (!isValidName(cleanName)) {
      setE("Please enter a valid patient full name (letters only, min 2 characters).");
      return;
    }
    if (f.phone && !isValidPhone(f.phone)) {
      setE("Please enter a valid phone number (10 to 15 digits, numbers only).");
      return;
    }
    const dob = new Date(f.date_of_birth);
    const today = new Date();
    if (dob > today) {
      setE("Date of birth cannot be in the future.");
      return;
    }
    if (dob.getFullYear() < 1900) {
      setE("Please enter a valid date of birth.");
      return;
    }
    setE("");
    setBusy(true);
    try {
      const p = await api("/patients", { method: "POST", body: { ...f, blood_group: f.blood_group || null, full_name: cleanName } });
      setCreatedPatient(p);
    } catch (x) {
      setE(x.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h2>Register New Patient</h2>
      <div className="panel" style={{ maxWidth: 640 }}>
        <p className="muted">Identity Verification: Arovia generates a globally unique patient identifier. Aadhaar numbers are NOT collected.</p>
        <p className="notice-box">Before creating a new identity, search the Arovia Patient ID. Cross-hospital records require active facility consent and the patient's sharing password.</p>
        <button type="button" className="sec" onClick={onSearch} style={{ marginBottom: 12 }}>Search for an existing patient</button>
        <form onSubmit={go}>
          <Field
            l="Patient Full Name *"
            required
            value={f.full_name}
            onChange={set("full_name")}
            onKeyDown={blockNumbers}
            pattern="[A-Za-z\s.'-]+"
            title="Letters only, no numbers allowed"
            placeholder="e.g. Ramesh Kumar"
          />
          <Field
            l="Date of Birth *"
            type="date"
            required
            max={new Date().toISOString().split("T")[0]}
            value={f.date_of_birth}
            onChange={set("date_of_birth")}
          />
          <label>
            Sex *
            <select value={f.sex} onChange={set("sex")}>
              <option value="F">Female</option>
              <option value="M">Male</option>
              <option value="O">Other</option>
              <option value="U">Unspecified</option>
            </select>
          </label>
          <Field
            l="Phone Number (for verification, 10 digits)"
            type="tel"
            value={f.phone}
            onChange={set("phone")}
            pattern="\+?[0-9\s-]{10,15}"
            title="10 to 15 digits, numbers only"
            placeholder="e.g. 9876543210"
          />
          <Field l="Email address" type="email" value={f.email} onChange={set("email")} />
          <Field l="Address / Residential Area" value={f.address} onChange={set("address")} placeholder="e.g. Indiranagar, Bengaluru" />
          <label>Blood group<select value={f.blood_group} onChange={set("blood_group")}><option value="">Unknown / not provided</option>{["A+","A-","B+","B-","AB+","AB-","O+","O-"].map(x => <option key={x}>{x}</option>)}</select></label>
          <h4>Emergency Contact (optional)</h4>
          <Field l="Contact name" value={f.emergency_contact_name} onChange={set("emergency_contact_name")} />
          <Field l="Relationship" value={f.emergency_contact_relationship} onChange={set("emergency_contact_relationship")} />
          <Field l="Contact phone" type="tel" value={f.emergency_contact_phone} onChange={set("emergency_contact_phone")} />
          <Field l="Hospital Local Patient ID (Your facility record number) *" required value={f.local_patient_id} onChange={set("local_patient_id")} placeholder="e.g. MED-2026-0042" />

          <Err e={e} />
          <button type="submit" disabled={busy}>{busy ? "Registering..." : "Complete Registration"}</button>
        </form>
      </div>
      {createdPatient && <div className="modal-overlay"><div className="modal-box">
        <h3>Patient sharing password</h3>
        <p>Give this password to the patient. It is shown once and cannot be recovered from the hospital system.</p>
        <p><b>Arovia Patient ID:</b> <code>{createdPatient.arovia_id}</code></p>
        <SharingPasswordDisplay password={createdPatient.sharing_password} />
        <div className="flex-gap">
          <button className="sec" onClick={() => open(createdPatient.id)}>Continue to patient record</button>
        </div>
      </div></div>}
    </>
  );
}

// -------------------------------------------------------------
// PATIENT SEARCH
// -------------------------------------------------------------
function PatientSearch({ open, role }) {
  const [q, setQ] = useState("");
  const [rows, setR] = useState([]);
  const [e, setE] = useState("");
  const [busy, setBusy] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sharePassword, setSharePassword] = useState("");
  const [shareBusy, setShareBusy] = useState(false);

  const go = async (ev) => {
    if (ev) ev.preventDefault();
    setE(""); setBusy(true);
    try {
      const res = await api("/patients?q=" + encodeURIComponent(q));
      setR(res);
      setHasSearched(true);
    } catch (x) {
      setE(x.message);
    } finally {
      setBusy(false);
    }
  };

  const openSharedPatient = async (ev) => {
    ev.preventDefault(); setE(""); setShareBusy(true);
    try {
      const result = await api("/patients/share-access", { method: "POST", body: { arovia_id: q.trim(), sharing_password: sharePassword } });
      open(result.patient_id);
    } catch (x) { setE(x.message); }
    finally { setShareBusy(false); }
  };

  useEffect(() => { go(); }, []);

  return (
    <>
      <h2>Patient Search</h2>
      <div className="panel">
        <form onSubmit={go} className="flex-gap" style={{ marginBottom: 12 }}>
          <input
            placeholder="Search by name, Arovia ID (AR-...), or local hospital ID"
            value={q}
            onChange={(x) => setQ(x.target.value)}
            style={{ margin: 0 }}
          />
          <button type="submit" disabled={busy}>{busy ? "Searching..." : "Search"}</button>
        </form>
        <Err e={e} />

        {rows.length === 0 && hasSearched ? (
          <>
            <p className="muted" style={{ padding: 12 }}>No local patient matched. To open a cross-hospital record, the patient's current hospital must have recorded consent for your facility. Enter the patient sharing password to verify access.</p>
            {/^AR-[A-Z0-9]+$/i.test(q.trim()) && <form onSubmit={openSharedPatient} className="flex-gap" style={{ padding: 12 }}>
              <input type="password" autoComplete="off" placeholder="Patient sharing password" required value={sharePassword} onChange={ev => setSharePassword(ev.target.value)} />
              <button disabled={shareBusy}>{shareBusy ? "Verifying..." : "Verify and open record"}</button>
            </form>}
          </>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Patient Name</th>
                <th>Arovia ID</th>
                <th>Hospital Local ID</th>
                <th>Date of Birth</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(p => (
                <tr key={p.id}>
                  <td><b>{p.full_name}</b></td>
                  <td><code>{p.arovia_id}</code></td>
                  <td>{p.local_patient_id || "Shared after password verification"}</td>
                  <td>{p.date_of_birth}</td>
                  <td>
                    <button className="sm" onClick={() => open(p.id)}>
                      Open Record
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

// -------------------------------------------------------------
// PATIENT PROFILE & LONGITUDINAL RECORD
// -------------------------------------------------------------
function PatientProfile({ id, me, onBack }) {
  const [d, setD] = useState(null);
  const [tl, setTl] = useState([]);
  const [e, setE] = useState("");
  const [msg, setMsg] = useState("");
  const [consents, setConsents] = useState([]);
  const [consentFormOpen, setConsentFormOpen] = useState(false);
  const [consentForm, setConsentForm] = useForm({ granted_to_facility_id: "", purpose: "Care coordination", data_categories: "CLINICAL", valid_until: "", evidence_ref: "", patient_consent_confirmed: false });
  const [newSharingPassword, setNewSharingPassword] = useState("");
  const [doctors, setDoctors] = useState([]);

  // Encounter modal
  const [encModal, setEncModal] = useState(false);
  const [enc, setEnc] = useForm({ encounter_type: "OUTPATIENT", doctor_id: me.role === "DOCTOR" ? String(me.id) : "", symptoms: "", observations: "", examination_findings: "", procedures: "", clinical_notes: "", treatment: "", follow_up: "" });

  // Clinical items modal (Doctor only)
  const [itemModal, setItemModal] = useState(null); // 'dx', 'rx', 'al'
  const [dx, setDx] = useForm({ encounter_id: "", description: "", icd10_code: "", identified_at: "", diagnosed_by: me.role === "DOCTOR" ? String(me.id) : "" });
  const [rx, setRx] = useForm({ encounter_id: "", medication: "", dosage: "", frequency: "", duration: "", instructions: "", prescribed_by: me.role === "DOCTOR" ? String(me.id) : "" });
  const [al, setAl] = useForm({ substance: "", encounter_id: "", category: "", reaction: "", severity: "MILD", source_type: me.role === "HOSPITAL_ADMIN" ? "PATIENT_REPORTED" : "CLINICIAN_RECORDED" });
  const [historyForm, setHistoryForm] = useForm({ category: "OTHER", description: "", source_type: "PATIENT_REPORTED", encounter_id: "" });
  const [investigationForm, setInvestigationForm] = useForm({ kind: "LABORATORY", name: "", result: "", encounter_id: "", performed_at: "" });

  // Referral creation modal (Doctor only)
  const [refModal, setRefModal] = useState(false);
  const [facilities, setFacilities] = useState([]);
  const [refForm, setRefForm] = useForm({
    to_facility_id: "", specialty: "Ophthalmology / Retinal Care",
    reason: "", clinical_notes: "", priority: "ROUTINE", encounter_id: "", screening_id: ""
  });

  const load = () => {
    api(`/patients/${id}`).then(setD).catch((x) => setE(x.message));
    api(`/patients/${id}/timeline`).then(setTl).catch(() => {});
    api("/facilities").then(setFacilities).catch(() => {});
    api("/clinical/doctors").then(setDoctors).catch(() => {});
    api(`/patients/${id}/consents`).then(setConsents).catch(() => {});
  };

  useEffect(load, [id]);

  const addEncounter = async (ev) => {
    ev.preventDefault();
    setE("");
    try {
      await api(`/patients/${id}/encounters`, { method: "POST", body: { ...enc, doctor_id: enc.doctor_id ? Number(enc.doctor_id) : null } });
      setEncModal(false);
      setEnc({ encounter_type: "OUTPATIENT", doctor_id: me.role === "DOCTOR" ? String(me.id) : "", symptoms: "", observations: "", examination_findings: "", procedures: "", clinical_notes: "", treatment: "", follow_up: "" });
      setMsg("Clinical encounter recorded.");
      load();
    } catch (x) {
      setE(x.message);
    }
  };

  const addHistoryItem = async (ev) => {
    ev.preventDefault(); setE("");
    try { await api(`/patients/${id}/medical-history`, { method: "POST", body: { ...historyForm, encounter_id: Number(historyForm.encounter_id) } }); setHistoryForm({ category: "OTHER", description: "", source_type: "PATIENT_REPORTED", encounter_id: "" }); setMsg("Medical history saved with its source status."); load(); }
    catch (x) { setE(x.message); }
  };

  const addInvestigation = async (ev) => {
    ev.preventDefault(); setE("");
    try { await api(`/patients/${id}/investigations`, { method: "POST", body: { ...investigationForm, encounter_id: investigationForm.encounter_id ? Number(investigationForm.encounter_id) : null, performed_at: investigationForm.performed_at || null } }); setInvestigationForm({ kind: "LABORATORY", name: "", result: "", encounter_id: "", performed_at: "" }); setMsg("Investigation recorded."); load(); }
    catch (x) { setE(x.message); }
  };

  const revokeConsent = async (consentId) => {
    try { await api("/patients/" + id + "/consents/" + consentId + "/revoke", { method: "POST" }); setMsg("Consent revoked."); load(); }
    catch (x) { setE(x.message); }
  };

  const provisionSharingPassword = async () => {
    setE("");
    try {
      const result = await api(`/patients/${id}/sharing-password`, { method: "POST" });
      setNewSharingPassword(result.sharing_password);
      setD(current => ({ ...current, patient: { ...current.patient, sharing_password_provisioned: true } }));
      setMsg("Sharing password created. Provide it to the patient now; it cannot be viewed again.");
    } catch (x) { setE(x.message); }
  };

  const saveConsent = async (ev) => {
    ev.preventDefault(); setE("");
    try {
      await api("/patients/" + id + "/consents", { method: "POST", body: {
        ...consentForm,
        granted_to_facility_id: Number(consentForm.granted_to_facility_id),
        valid_until: consentForm.valid_until || null,
        data_categories: [consentForm.data_categories]
      }});
      setConsentFormOpen(false);
      setConsentForm({ granted_to_facility_id: "", purpose: "Care coordination", data_categories: "CLINICAL", valid_until: "", evidence_ref: "", patient_consent_confirmed: false });
      setMsg("Patient consent recorded. The selected hospital can now access permitted clinical history.");
      load();
    } catch (x) { setE(x.message); }
  };

  const addDiagnosis = async (ev) => {
    ev.preventDefault();
    setE("");
    try {
      await api(`/patients/${id}/diagnoses`, {
        method: "POST",
        body: { ...dx, encounter_id: Number(dx.encounter_id), identified_at: dx.identified_at || null, diagnosed_by: dx.diagnosed_by ? Number(dx.diagnosed_by) : null }
      });
      setItemModal(null);
      setDx({ encounter_id: "", description: "", icd10_code: "", identified_at: "", diagnosed_by: me.role === "DOCTOR" ? String(me.id) : "" });
      setMsg("Diagnosis added.");
      load();
    } catch (x) {
      setE(x.message);
    }
  };

  const setDiagnosisStatus = async (diagnosisId, status) => {
    try { await api(`/patients/${id}/diagnoses/${diagnosisId}`, { method: "PATCH", body: { status } }); setMsg("Diagnosis status updated; encounter history is preserved."); load(); }
    catch (x) { setE(x.message); }
  };

  const addPrescription = async (ev) => {
    ev.preventDefault();
    setE("");
    try {
      await api(`/patients/${id}/prescriptions`, {
        method: "POST",
        body: { ...rx, encounter_id: Number(rx.encounter_id), prescribed_by: rx.prescribed_by ? Number(rx.prescribed_by) : null }
      });
      setItemModal(null);
      setRx({ encounter_id: "", medication: "", dosage: "", frequency: "", duration: "", instructions: "", prescribed_by: me.role === "DOCTOR" ? String(me.id) : "" });
      setMsg("Prescription recorded.");
      load();
    } catch (x) {
      setE(x.message);
    }
  };

  const addAllergy = async (ev) => {
    ev.preventDefault();
    setE("");
    try {
      await api(`/patients/${id}/allergies`, { method: "POST", body: { ...al, encounter_id: Number(al.encounter_id) } });
      setItemModal(null);
      setAl({ substance: "", encounter_id: "", category: "", reaction: "", severity: "MILD", source_type: me.role === "HOSPITAL_ADMIN" ? "PATIENT_REPORTED" : "CLINICIAN_RECORDED" });
      setMsg("Allergy record created.");
      load();
    } catch (x) {
      setE(x.message);
    }
  };

  const createReferral = async (ev) => {
    ev.preventDefault();
    setE("");
    try {
      await api("/referrals", {
        method: "POST",
        body: {
          patient_id: Number(id),
          to_facility_id: Number(refForm.to_facility_id),
          specialty: refForm.specialty,
          reason: refForm.reason,
          clinical_notes: refForm.clinical_notes || null,
          priority: refForm.priority,
          encounter_id: refForm.encounter_id ? Number(refForm.encounter_id) : null,
          screening_id: refForm.screening_id ? Number(refForm.screening_id) : null
        }
      });
      setRefModal(false);
      setMsg("Referral created successfully and logged in history.");
      load();
    } catch (x) {
      setE(x.message);
    }
  };

  if (e && !d) return <div className="panel"><Err e={e} /><button onClick={onBack}>Back</button></div>;
  if (!d) return <div className="panel"><p className="muted">Loading patient profile...</p></div>;

  const p = d.patient;
  const isDoctor = me.role === "DOCTOR";
  const isOptometrist = me.role === "OPTOMETRIST";
  const isHospitalAdmin = me.role === "HOSPITAL_ADMIN";
  const canManageClinical = isDoctor || isHospitalAdmin;

  return (
    <>
      <div className="flex-between">
        <div>
          <button className="sm sec" onClick={onBack} style={{ marginBottom: 6 }}>← Back to Patient List</button>
          <h2>{p.full_name}</h2>
          <span className="muted">
            Arovia ID: <b>{p.arovia_id}</b> · DOB: {p.date_of_birth} · Sex: {p.sex} · Phone: {p.phone || "Not recorded"}
          </span>
        </div>
        <div>
          <span className={`badge ${p.identity_verification === "VERIFIED" ? "badge-ok" : "badge-warn"}`}>
            Identity: {p.identity_verification}
          </span>
        </div>
      </div>

      <Err e={e} />
      {msg && <p className="success">{msg}</p>}

      {(isDoctor || me.role === "HOSPITAL_ADMIN") && (
        <div className="panel" style={{ marginTop: 14 }}>
          <h3>Cross-hospital sharing consent</h3>
          <p className="muted">Record the patient's documented consent for a receiving hospital. The receiving hospital must also verify the patient's sharing password; access expires after 60 minutes. Every access attempt is audited.</p>
          {p.is_linked_to_facility && !p.sharing_password_provisioned && <button className="sm alt" onClick={provisionSharingPassword}>Create patient sharing password</button>}
          {newSharingPassword && <SharingPasswordDisplay password={newSharingPassword} label="Share this password with the patient now:" />}
          <button className="sm sec" onClick={() => setConsentFormOpen(!consentFormOpen)}>{consentFormOpen ? "Close consent form" : "Record patient consent"}</button>
          {consentFormOpen && <form onSubmit={saveConsent} className="grid2" style={{ marginTop: 12 }}>
            <label>Receiving hospital<select required value={consentForm.granted_to_facility_id} onChange={setConsentForm("granted_to_facility_id")}><option value="">Select active hospital</option>{facilities.filter(f => f.id !== me.facility_id && f.participation_status === "ACTIVE").map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
            <Field l="Purpose" required value={consentForm.purpose} onChange={setConsentForm("purpose")} />
            <label>Data category<select value={consentForm.data_categories} onChange={setConsentForm("data_categories")}><option value="CLINICAL">Clinical records</option><option value="ALL">All permitted clinical records</option></select></label>
            <Field l="Consent expires (optional)" type="date" value={consentForm.valid_until} onChange={setConsentForm("valid_until")} />
            <Field l="Consent documentation reference" required value={consentForm.evidence_ref} onChange={setConsentForm("evidence_ref")} placeholder="Form/reference stored by this hospital" />
            <label className="flex-gap"><input type="checkbox" checked={consentForm.patient_consent_confirmed} onChange={ev => setConsentForm("patient_consent_confirmed")({ target: { value: ev.target.checked }})} required /> Patient consent was obtained and documented</label>
            <button type="submit">Record consent and grant access</button>
          </form>}
          {consents.length > 0 && <div style={{ marginTop: 10 }}>{consents.map(c => <p key={c.id}>
            <b>{c.facility_name}</b> | {c.purpose} | {c.status}{c.valid_until ? " | until " + c.valid_until : " | no expiry"}
            {c.status === "ACTIVE" && <button className="sm danger" style={{ marginLeft: 8 }} onClick={() => revokeConsent(c.id)}>Revoke</button>}
          </p>)}</div>}
        </div>
      )}
      <>
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="flex-between">
              <h3>Clinical Overview</h3>
              {canManageClinical && (
                <div className="flex-gap">
                  <button className="sm alt" onClick={() => setItemModal("al")}>+ Allergy</button>
                  <button className="sm alt" onClick={() => setItemModal("dx")}>+ Diagnosis</button>
                  <button className="sm alt" onClick={() => setItemModal("rx")}>+ Prescription</button>
                  <button className="sm" onClick={() => setRefModal(true)}>+ Create Referral</button>
                </div>
              )}
            </div>

            <div style={{ marginTop: 8 }}>
              <p>
                <b>Known Allergies: </b>
                {d.allergies.length === 0 ? <span className="muted">None recorded</span> : (
                  d.allergies.map((a, i) => (
                    <span key={a.id || i} className="badge badge-err" style={{ marginRight: 6 }}>
                      {a.substance} ({a.severity || "Allergy"})
                    </span>
                  ))
                )}
              </p>

              <p>
                <b>Diagnoses: </b>
                {d.diagnoses.length === 0 ? <span className="muted">None recorded</span> : (
                  d.diagnoses.map((dx, i) => (
                    <span key={dx.id || i} style={{ marginRight: 10 }}>
                      • <b>{dx.description}</b> {dx.icd10_code && <span className="muted">[{dx.icd10_code}]</span>}
                    </span>
                  ))
                )}
              </p>

              <p>
                <b>Prescriptions: </b>
                {d.prescriptions.length === 0 ? <span className="muted">None recorded</span> : (
                  d.prescriptions.map((rx, i) => (
                    <span key={rx.id || i} style={{ marginRight: 10 }}>
                      💊 <b>{rx.medication}</b> {rx.dosage} {rx.frequency} ({rx.duration || "N/A"})
                    </span>
                  ))
                )}
              </p>
            </div>
          </div>

          <div className="panel">
            <div className="flex-between"><h3>Medical History Across Facilities</h3><span className="muted">Arovia ID: {p.arovia_id}</span></div>
            <p><b>Personal:</b> {p.email || "No email"} · Blood group: {p.blood_group || "Unknown"} · Emergency contact: {p.emergency_contact_name ? `${p.emergency_contact_name} (${p.emergency_contact_relationship || "relationship not recorded"}) ${p.emergency_contact_phone || ""}` : "Not recorded"}</p>
            <h4>Reported / verified background</h4>
            {(d.history_items || []).filter(h => h.category !== "MEDICATION").length ? d.history_items.filter(h => h.category !== "MEDICATION").map(h => <p key={`h${h.id}`}><b>{h.category}</b> — {h.description} <span className="muted">· {h.source_type.replaceAll("_", " ")} · {h.facility_name} · {h.recorder_name} · {new Date(h.recorded_at).toLocaleDateString()}</span></p>) : <p className="muted">No medical background recorded.</p>}
            {(canManageClinical || isOptometrist) && <form onSubmit={addHistoryItem} className="flex-gap" style={{ flexWrap: "wrap", alignItems: "end" }}>
              <label>Encounter<select required value={historyForm.encounter_id} onChange={setHistoryForm("encounter_id")}><option value="">Select encounter</option>{(d.encounters || []).filter(x => x.facility_id === me.facility_id).map(x => <option key={x.id} value={x.id}>#{x.id} · {new Date(x.encounter_at).toLocaleDateString()}</option>)}</select></label>
              <label>Category<select value={historyForm.category} onChange={setHistoryForm("category")}>{[["CONDITION","Condition"],["CARDIAC","Cardiac"],["DIABETES","Diabetes"],["HYPERTENSION","Hypertension"],["ALLERGY","Allergy"],["MEDICATION","Medication"],["SURGERY","Surgery"],["OTHER","Other"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}</select></label>
              <label>Source<select value={historyForm.source_type} onChange={setHistoryForm("source_type")}><option value="PATIENT_REPORTED">Patient reported</option>{(isDoctor || isOptometrist) && <option value="CLINICIAN_RECORDED">Clinician recorded</option>}</select></label>
              <Field l="Details" required value={historyForm.description} onChange={setHistoryForm("description")} />
              <button type="submit">Add history</button>
            </form>}

            <h4>Medication History</h4>
            {(d.history_items || []).filter(h => h.category === "MEDICATION").map(h => <p key={`mh${h.id}`}><b>{h.description}</b> · {h.source_type.replaceAll("_", " ")} · {h.facility_name} · {h.recorder_name} · {new Date(h.recorded_at).toLocaleDateString()}</p>)}
            {(d.history_items || []).every(h => h.category !== "MEDICATION") && <p className="muted">No separate medication history recorded.</p>}
            <h4>Clinical Encounters</h4>
            {(d.encounters || []).map(x => <p key={`e${x.id}`}><b>{new Date(x.encounter_at).toLocaleString()} · {x.encounter_type}</b> — {x.facility_name} · {x.doctor_name || "Provider not specified"}<br/><span className="muted">{[x.symptoms && `Symptoms: ${x.symptoms}`, x.observations && `Observations: ${x.observations}`, x.examination_findings && `Exam: ${x.examination_findings}`, x.procedures && `Procedures: ${x.procedures}`, x.clinical_notes && `Notes: ${x.clinical_notes}`, x.treatment && `Treatment: ${x.treatment}`].filter(Boolean).join(" · ")}</span></p>)}
            <h4>Diagnoses and Conditions</h4>
            {(d.diagnoses || []).map(x => <p key={`d${x.id}`}><b>{x.description}</b> {x.icd10_code && `(${x.icd10_code})`} · {x.status} · {x.facility_name} · Diagnosed by {x.diagnosing_doctor || x.recorder_name} · recorded by {x.recorder_name} · {new Date(x.identified_at).toLocaleDateString()} {isDoctor && x.facility_id === me.facility_id && x.status === "ACTIVE" && <button type="button" className="sm sec" onClick={() => setDiagnosisStatus(x.id, "RESOLVED")}>Mark resolved</button>}</p>)}
            <h4>Allergies</h4>
            {(d.allergies || []).map(x => <p key={`a${x.id}`}><b>{x.substance}</b> {x.category && `· ${x.category}`} · {x.reaction || "Reaction not recorded"} · {x.severity || "Severity unknown"} · {x.source_type?.replaceAll("_", " ")} · {x.facility_name} · {x.recorder_name}</p>)}
            <h4>Prescriptions</h4>
            {(d.prescriptions || []).map(x => <p key={`rx${x.id}`}><b>{x.medication}</b> · {x.dosage || "Dose not recorded"} · {x.frequency || "Frequency not recorded"} · {x.duration || "Duration not recorded"} {x.instructions && `· ${x.instructions}`} · {x.facility_name} · {x.prescriber_name}{x.recorder_name !== x.prescriber_name ? ` (recorded by ${x.recorder_name})` : ""}</p>)}
            <h4>Investigations and Reports</h4>
            {(d.investigations || []).map(x => <p key={`i${x.id}`}><b>{x.kind}: {x.name}</b> · {x.result || "Result not recorded"} · {x.facility_name} · {x.recorder_name} {x.report_ref && <a href={x.report_ref} target="_blank" rel="noreferrer">View report</a>}</p>)}
            {(canManageClinical || isOptometrist) && <form onSubmit={addInvestigation} className="flex-gap" style={{ flexWrap: "wrap", alignItems: "end" }}>
              <label>Type<select value={investigationForm.kind} onChange={setInvestigationForm("kind")}><option value="LABORATORY">Laboratory</option><option value="IMAGING">Imaging</option><option value="OTHER">Other</option></select></label>
              <Field l="Test / report name" required value={investigationForm.name} onChange={setInvestigationForm("name")} />
              <Field l="Result summary" value={investigationForm.result} onChange={setInvestigationForm("result")} />
              <label>Encounter (optional)<select value={investigationForm.encounter_id} onChange={setInvestigationForm("encounter_id")}><option value="">None</option>{(d.encounters || []).filter(x => x.facility_id === me.facility_id).map(x => <option key={x.id} value={x.id}>#{x.id} · {new Date(x.encounter_at).toLocaleDateString()}</option>)}</select></label>
              <button type="submit">Record investigation</button>
            </form>}
            <h4>Referrals</h4>
            {(d.referrals || []).map(x => <p key={`ref${x.id}`}><b>{x.specialty}</b> · {x.status} · {x.priority} · {x.reason} · {x.source_facility_name} → {x.target_facility_name} · {x.responsible_doctor} · {new Date(x.created_at).toLocaleDateString()}</p>)}
          </div>

          {/* RETINAL SCREENING WORKFLOW */}
          <Screening pid={id} me={me} past={d.screenings} onDone={load} onRequestReferral={(sid) => {
            setRefForm({ ...refForm, screening_id: sid });
            setRefModal(true);
          }} />

          {/* CLINICAL ENCOUNTERS & TIMELINE */}
          <div className="panel">
            <div className="flex-between">
              <h3>Longitudinal Timeline</h3>
              {(canManageClinical || isOptometrist) && (
                <button className="sm" onClick={() => setEncModal(true)}>+ New Encounter</button>
              )}
            </div>

            <div className="tl" style={{ marginTop: 12 }}>
              {tl.length === 0 ? (
                <p className="muted">No events recorded in longitudinal timeline yet.</p>
              ) : (
                tl.map((t, i) => (
                  <div key={i}>
                    <b>{t.kind}</b> <span className="muted">({new Date(t.at).toLocaleString()})</span>
                    <div>{t.detail}</div>
                    {(t.facility_name || t.professional_name) && <small className="muted">{[t.facility_name, t.professional_name].filter(Boolean).join(" · ")}</small>}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      {/* NEW ENCOUNTER MODAL */}
      {encModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Record Clinical Encounter</h3>
            <form onSubmit={addEncounter}>
              <label>
                Encounter Type *
                <select value={enc.encounter_type} onChange={setEnc("encounter_type")}>
                  <option value="OUTPATIENT">Outpatient</option>
                  <option value="INPATIENT">Inpatient</option>
                  <option value="EMERGENCY">Emergency</option>
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="SCREENING">Retinal Screening</option>
                </select>
              </label>
              <label>Responsible doctor<select value={enc.doctor_id} onChange={setEnc("doctor_id")}><option value="">Unassigned</option>{doctors.map(x => <option key={x.id} value={x.id}>{x.full_name}{x.id === me.id ? " (you)" : ""}</option>)}</select></label>
              <label>Clinical Notes<textarea rows="3" value={enc.clinical_notes} onChange={setEnc("clinical_notes")} /></label>
              <label>Symptoms and Complaints<textarea rows="2" value={enc.symptoms} onChange={setEnc("symptoms")} /></label>
              <label>Clinical Observations<textarea rows="2" value={enc.observations} onChange={setEnc("observations")} /></label>
              <label>Examination Findings<textarea rows="2" value={enc.examination_findings} onChange={setEnc("examination_findings")} /></label>
              <label>Clinical Procedures<textarea rows="2" value={enc.procedures} onChange={setEnc("procedures")} placeholder="Procedure name and relevant details" /></label>
              <label>Treatment Provided<textarea rows="2" value={enc.treatment} onChange={setEnc("treatment")} /></label>
              <label>Follow-up Plan<input value={enc.follow_up} onChange={setEnc("follow_up")} /></label>
              <div className="flex-gap">
                <button type="submit">Save Encounter</button>
                <button type="button" className="sec" onClick={() => setEncModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIAGNOSIS MODAL */}
      {itemModal === "dx" && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Add Clinical Diagnosis</h3>
            <form onSubmit={addDiagnosis}>
              <label>Encounter *
                <select value={dx.encounter_id} onChange={setDx("encounter_id")} required>
                  <option value="">Select Encounter</option>
                  {(d.encounters || []).filter(x => x.facility_id === me.facility_id).map(x => <option key={x.id} value={x.id}>Encounter #{x.id} · {new Date(x.encounter_at).toLocaleDateString()}</option>)}
                </select>
              </label>
              <label>Diagnosing doctor<select value={dx.diagnosed_by} onChange={setDx("diagnosed_by")}><option value="">Unassigned</option>{doctors.map(x => <option key={x.id} value={x.id}>{x.full_name}{x.id === me.id ? " (you)" : ""}</option>)}</select></label>
              <Field l="Condition / Diagnosis Description *" required value={dx.description} onChange={setDx("description")} />
              <Field l="ICD-10 Code (e.g. E11.319 for Diabetic Retinopathy)" value={dx.icd10_code} onChange={setDx("icd10_code")} />
              <Field l="Date identified (optional)" type="date" value={dx.identified_at} onChange={setDx("identified_at")} />
              <div className="flex-gap">
                <button type="submit">Add Diagnosis</button>
                <button type="button" className="sec" onClick={() => setItemModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PRESCRIPTION MODAL */}
      {itemModal === "rx" && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Record Prescription</h3>
            <form onSubmit={addPrescription}>
              <label>Encounter *
                <select value={rx.encounter_id} onChange={setRx("encounter_id")} required>
                  <option value="">Select Encounter</option>
                  {(d.encounters || []).filter(x => x.facility_id === me.facility_id).map(x => <option key={x.id} value={x.id}>Encounter #{x.id} · {new Date(x.encounter_at).toLocaleDateString()}</option>)}
                </select>
              </label>
              <label>Prescribing doctor<select value={rx.prescribed_by} onChange={setRx("prescribed_by")}><option value="">Unassigned</option>{doctors.map(x => <option key={x.id} value={x.id}>{x.full_name}{x.id === me.id ? " (you)" : ""}</option>)}</select></label>
              <Field l="Medication Name *" required value={rx.medication} onChange={setRx("medication")} />
              <Field l="Dosage (e.g. 500mg, 1 drop)" value={rx.dosage} onChange={setRx("dosage")} />
              <Field l="Frequency (e.g. Twice daily, Once at bedtime)" value={rx.frequency} onChange={setRx("frequency")} />
              <Field l="Duration (e.g. 14 days, 1 month)" value={rx.duration} onChange={setRx("duration")} />
              <Field l="Instructions" value={rx.instructions} onChange={setRx("instructions")} />
              <div className="flex-gap">
                <button type="submit">Record Prescription</button>
                <button type="button" className="sec" onClick={() => setItemModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ALLERGY MODAL */}
      {itemModal === "al" && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Add Allergy Record</h3>
            <form onSubmit={addAllergy}>
              <label>Encounter *<select required value={al.encounter_id} onChange={setAl("encounter_id")}><option value="">Select encounter</option>{(d.encounters || []).filter(x => x.facility_id === me.facility_id).map(x => <option key={x.id} value={x.id}>#{x.id} · {new Date(x.encounter_at).toLocaleDateString()}</option>)}</select></label>
              <Field l="Substance / Allergen *" required value={al.substance} onChange={setAl("substance")} />
              <Field l="Allergy category" value={al.category} onChange={setAl("category")} />
              <label>Information source<select value={al.source_type} onChange={setAl("source_type")}><option value="PATIENT_REPORTED">Patient reported</option>{(isDoctor || isOptometrist) && <option value="CLINICIAN_RECORDED">Clinician verified</option>}</select></label>
              <Field l="Reaction" value={al.reaction} onChange={setAl("reaction")} />
              <label>Severity
                <select value={al.severity} onChange={setAl("severity")}>
                  <option value="MILD">Mild</option>
                  <option value="MODERATE">Moderate</option>
                  <option value="SEVERE">Severe</option>
                  <option value="LIFE_THREATENING">Life-Threatening</option>
                </select>
              </label>
              <div className="flex-gap">
                <button type="submit">Save Allergy</button>
                <button type="button" className="sec" onClick={() => setItemModal(null)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REFERRAL CREATION MODAL */}
      {refModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Create Medical Referral</h3>
            <p className="muted">Patient ID: <b>{p.arovia_id}</b> · Direct inter-hospital referral exchange</p>
            <form onSubmit={createReferral}>
              <label>
                Target Facility / Receiving Hospital *
                <select value={refForm.to_facility_id} onChange={setRefForm("to_facility_id")} required>
                  <option value="">Select Receiving Hospital</option>
                  {facilities.filter(f => f.id !== me.facility_id).map(f => (
                    <option key={f.id} value={f.id}>{f.name} ({f.category})</option>
                  ))}
                </select>
              </label>
              <Field l="Specialty *" required value={refForm.specialty} onChange={setRefForm("specialty")} />
              <label>Priority *
                <select value={refForm.priority} onChange={setRefForm("priority")}>
                  <option value="ROUTINE">Routine</option>
                  <option value="URGENT">Urgent</option>
                  <option value="EMERGENCY">Emergency</option>
                </select>
              </label>
              <Field l="Referral Reason *" required value={refForm.reason} onChange={setRefForm("reason")} />
              <label>Clinical Notes<textarea rows="3" value={refForm.clinical_notes} onChange={setRefForm("clinical_notes")} /></label>
              <div className="flex-gap">
                <button type="submit">Create Referral</button>
                <button type="button" className="sec" onClick={() => setRefModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// -------------------------------------------------------------
// RETINAL SCREENING WORKFLOW (DOCTOR & OPTOMETRIST)
// -------------------------------------------------------------
function Screening({ pid, me, past, onDone, onRequestReferral }) {
  const [encs, setEncs] = useState([]);
  const [encId, setEncId] = useState("");
  const [eye, setEye] = useState("RIGHT");
  const [file, setFile] = useState(null);
  const [prev, setPrev] = useState(null);
  const [scr, setScr] = useState(null);
  const [img, setImg] = useState(null);
  const [gradCamImg, setGradCamImg] = useState(null);
  const [gradCamLoading, setGradCamLoading] = useState(false);
  const [e, setE] = useState("");
  const [busy, setBusy] = useState(false);
  const [rv, setRv] = useState({ final_grade: 0, assessment: "", recommendations: "" });

  useEffect(() => {
    api(`/patients/${pid}/encounters`).then((x) => {
      setEncs(x || []);
      if (x && x.length > 0) {
        setEncId(x[0].id);
      } else {
        setEncId("auto");
      }
    }).catch(() => {
      setEncs([]);
      setEncId("auto");
    });
  }, [pid]);

  const show = async (id) => {
    setE("");
    setGradCamImg(null);
    try {
      const data = await api("/screenings/" + id);
      setScr(data);
      const url = await apiBlob(`/screenings/${id}/image`);
      setImg(url);

      if (data.prediction) {
        setGradCamLoading(true);
        try {
          const camUrl = await apiBlob(`/screenings/${id}/gradcam`);
          setGradCamImg(camUrl);
        } catch {
          setGradCamImg(null);
        } finally {
          setGradCamLoading(false);
        }
      }
    } catch (x) {
      setE(x.message);
    }
  };

  const run = async (fn) => {
    setE("");
    setBusy(true);
    try {
      await fn();
    } catch (x) {
      setE(x.message);
    }
    setBusy(false);
  };

  const upload = () => run(async () => {
    const f = new FormData();
    f.append("encounter_id", encId);
    f.append("eye", eye);
    f.append("image", file);
    const r = await api(`/patients/${pid}/screenings`, { method: "POST", form: f });
    await show(r.id);
    onDone();
  });

  const predict = () => run(async () => {
    setGradCamLoading(true);
    await api(`/screenings/${scr.screening.id}/predict`, { method: "POST" });
    await show(scr.screening.id);
  });

  const review = () => run(async () => {
    await api(`/screenings/${scr.screening.id}/review`, {
      method: "POST",
      body: { ...rv, final_grade: Number(rv.final_grade) }
    });
    await show(scr.screening.id);
    onDone();
  });

  const S = scr?.screening;
  const q = S?.quality_metrics;
  const isDoctor = me.role === "DOCTOR";
  const isOptometrist = me.role === "OPTOMETRIST";

  return (
    <div className="panel" style={{ marginTop: 14 }}>
      <div className="flex-between">
        <h3>AI-Assisted Retinal Screening (Diabetic Retinopathy)</h3>
        <span className="badge badge-info">EfficientNetB0 Model</span>
      </div>

      <p className="muted">
        Captures fundus imagery, executes automated image quality gates, and generates decision-support DR classifications.
      </p>

      {/* UPLOAD CONTROLS */}
      {(isDoctor || isOptometrist) && (
        <div style={{ background: "rgba(232,220,198,0.3)", padding: 12, borderRadius: 2, marginBottom: 12 }}>
          <label>
            Encounter *
            <select value={encId} onChange={(x) => setEncId(x.target.value)}>
              {encs.map((x) => (
                <option key={x.id} value={x.id}>
                  #{x.id} {x.encounter_type} · {new Date(x.encounter_at).toLocaleDateString()}
                </option>
              ))}
            </select>
          </label>

          <label>
            Eye *
            <select value={eye} onChange={(x) => setEye(x.target.value)}>
              <option value="RIGHT">Right Eye (OD)</option>
              <option value="LEFT">Left Eye (OS)</option>
              <option value="BOTH">Both Eyes</option>
            </select>
          </label>

          <input
            type="file"
            accept="image/jpeg,image/png"
            onChange={(x) => {
              const f = x.target.files[0];
              setFile(f);
              setPrev(f ? URL.createObjectURL(f) : null);
            }}
          />

          {prev && !scr && (
            <img src={prev} alt="preview" style={{ maxWidth: 240, display: "block", marginBottom: 10, borderRadius: 4 }} />
          )}

          <button disabled={!file || !encId || busy} onClick={upload}>
            {busy ? "Analyzing Quality..." : "Upload & Run Quality Gate"}
          </button>
        </div>
      )}

      <Err e={e} />

      {past?.length > 0 && (
        <p className="muted" style={{ marginTop: 8 }}>
          Screening History: {past.map((x) => (
            <button
              key={x.id}
              className="link-btn"
              style={{ marginRight: 12, fontWeight: scr?.screening?.id === x.id ? "bold" : "normal" }}
              onClick={() => show(x.id)}
            >
              #{x.id} {x.eye} [{x.status}]
            </button>
          ))}
        </p>
      )}

      {/* SCREENING DETAILS & RESULTS */}
      {S && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
          <p>
            <b>Quality Gate: </b>
            <span className={`badge ${S.quality_status === "ACCEPTABLE" ? "badge-ok" : "badge-err"}`}>
              {S.quality_status}
            </span>
            <span className="muted"> ({S.eye} Eye · Screened {new Date(S.screened_at).toLocaleString()})</span>
          </p>

          {q?.metrics && (
            <p className="muted" style={{ fontSize: ".82rem" }}>
              Sharpness: {q.metrics.sharpness} · Brightness: {q.metrics.brightness} · Contrast: {q.metrics.contrast} · Coverage: {q.metrics.coverage}
            </p>
          )}

          {S.status === "REJECTED_QUALITY" && (
            <div className="notice-box" style={{ borderLeftColor: "var(--err)" }}>
              <p className="err">
                <b>Image Quality Rejected:</b> {q.reasons ? q.reasons.join("; ") : "Quality heuristic threshold failed."}
              </p>
              <span className="muted">AI prediction is withheld for unreadable or out-of-focus imagery. Please capture a clearer fundus photograph.</span>
            </div>
          )}

          {/* VISUALIZATION: SIDE-BY-SIDE ORIGINAL & GRAD-CAM */}
          {img && (
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                {/* ORIGINAL RETINAL IMAGE */}
                <div className="panel" style={{ padding: 12, margin: 0, background: "#FFF" }}>
                  <h4 style={{ margin: "0 0 8px", fontSize: "1rem" }}>Original Retinal Fundus ({S.eye} Eye)</h4>
                  <img
                    src={img}
                    alt="Original Fundus"
                    style={{ width: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 4, display: "block", background: "#000" }}
                  />
                  <p className="muted" style={{ margin: "6px 0 0", fontSize: ".8rem" }}>
                    Captured retinal photograph verified by automated quality gate.
                  </p>
                </div>

                {/* GRAD-CAM VISUALIZATION */}
                {scr.prediction && (
                  <div className="panel" style={{ padding: 12, margin: 0, background: "#FFF" }}>
                    <div className="flex-between" style={{ marginBottom: 8 }}>
                      <h4 style={{ margin: 0, fontSize: "1rem" }}>Grad-CAM Attention Heatmap</h4>
                      <span className="badge badge-info">Explainable AI</span>
                    </div>
                    {gradCamLoading ? (
                      <div style={{ height: 260, display: "flex", alignItems: "center", justifyContent: "center", background: "#FAF5EA", borderRadius: 4 }}>
                        <span className="muted">Generating neural activation map...</span>
                      </div>
                    ) : gradCamImg ? (
                      <>
                        <img
                          src={gradCamImg}
                          alt="Grad-CAM Heatmap"
                          style={{ width: "100%", maxHeight: 300, objectFit: "contain", borderRadius: 4, display: "block", background: "#000" }}
                        />
                        <p className="muted" style={{ margin: "6px 0 0", fontSize: ".8rem" }}>
                          Feature attribution for <b>{GRADES[scr.prediction.dr_grade]}</b>. Warmer colors (red/yellow) highlight focal retinal areas of highest model attention.
                        </p>
                      </>
                    ) : (
                      <div style={{ padding: 20, textAlign: "center", background: "#FAF5EA", borderRadius: 4 }}>
                        <span className="muted">Grad-CAM visualization available upon AI prediction.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* MEDICAL SAFETY DISCLAIMER */}
              {scr.prediction && (
                <div className="notice-box" style={{ marginTop: 12, borderLeftColor: "var(--maroon)", fontSize: ".82rem" }}>
                  <b>Medical Safety Disclaimer:</b> Grad-CAM highlights image regions that influenced the AI model's prediction. It is an explanatory visualization and must not be interpreted as a confirmed clinical finding. Final assessment requires review by a qualified healthcare professional.
                </div>
              )}
            </div>
          )}

          {S.quality_status === "ACCEPTABLE" && !scr.prediction && S.status !== "REVIEWED" && (
            <button disabled={busy} onClick={predict} style={{ marginTop: 8 }}>
              {busy ? "Executing AI Model..." : "Run AI Retinopathy Screening"}
            </button>
          )}

          {/* AI PREDICTION RESULT */}
          {scr.prediction && (
            <div className="panel" style={{ background: "#FAF2E1", borderLeft: "4px solid var(--maroon)" }}>
              <b>AI Screening Decision Support:</b>
              <div style={{ fontSize: "1.2rem", fontWeight: "bold", color: "var(--maroon)", margin: "4px 0" }}>
                {GRADES[scr.prediction.dr_grade]}
              </div>
              <p className="muted" style={{ margin: "4px 0" }}>
                Model Confidence: <b>{(scr.prediction.confidence * 100).toFixed(1)}%</b> · Model: {scr.prediction.name} ({scr.prediction.version})
              </p>
              <p className="notice-box" style={{ margin: "8px 0 4px", fontSize: ".8rem" }}>
                <b>Notice:</b> AI prediction is a clinical decision-support recommendation and does NOT constitute an independent diagnosis. Clinician review is required.
              </p>

              {/* Automatic Referral Trigger Suggestion if Grade >= 2 */}
              {scr.prediction.dr_grade >= 2 && (
                <div style={{ marginTop: 10, padding: 8, background: "#F8DFDC", borderRadius: 2 }}>
                  <b style={{ color: "var(--err)" }}>⚠ Clinical Alert: Moderate or Severe Retinopathy Detected.</b>
                  <p className="muted" style={{ margin: "2px 0 8px" }}>
                    Guideline recommendations suggest immediate clinician review and referral to a vitreoretinal specialist.
                  </p>
                  {isDoctor && (
                    <button className="sm danger" onClick={() => onRequestReferral(S.id)}>
                      + Create Specialist Referral for this Screening
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* DOCTOR ASSESSMENT RECORD */}
          {scr.review && (
            <div className="panel" style={{ background: "#E8EFE5", borderLeft: "4px solid var(--ok)" }}>
              <b>Confirmed Clinician Assessment:</b>
              <div style={{ fontWeight: "600", margin: "4px 0" }}>
                {GRADES[scr.review.final_grade]}
              </div>
              <p style={{ margin: "4px 0" }}>{scr.review.assessment}</p>
              {scr.review.recommendations && (
                <p className="muted" style={{ margin: "2px 0" }}>
                  <b>Recommendations:</b> {scr.review.recommendations}
                </p>
              )}
            </div>
          )}

          {/* DOCTOR REVIEW INPUT FORM */}
          {isDoctor && S.quality_status === "ACCEPTABLE" && !scr.review && (
            <div style={{ clear: "both", marginTop: 14 }}>
              <h4>Doctor Clinical Review</h4>
              <label>
                Final DR Assessment Grade *
                <select value={rv.final_grade} onChange={(x) => setRv({ ...rv, final_grade: x.target.value })}>
                  {GRADES.map((g, i) => <option key={i} value={i}>{g}</option>)}
                </select>
              </label>

              <label>
                Clinical Assessment Notes *
                <textarea
                  rows="3"
                  placeholder="Enter medical findings, macular edema observation, etc."
                  value={rv.assessment}
                  onChange={(x) => setRv({ ...rv, assessment: x.target.value })}
                />
              </label>

              <label>
                Recommendations / Follow-up Plan
                <textarea
                  rows="2"
                  placeholder="e.g. Laser photocoagulation referral, 6-month follow-up"
                  value={rv.recommendations}
                  onChange={(x) => setRv({ ...rv, recommendations: x.target.value })}
                />
              </label>

              <button disabled={busy || !rv.assessment} onClick={review}>
                {busy ? "Recording Assessment..." : "Confirm Final Clinical Assessment"}
              </button>
            </div>
          )}

          <div style={{ clear: "both" }} />
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// REFERRAL MANAGER (DOCTOR & HOSPITAL ADMIN)
// -------------------------------------------------------------
function ReferralManager({ me, openPatient }) {
  const [tab, setTab] = useState("incoming");
  const [refs, setRefs] = useState([]);
  const [e, setE] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  // Status transition note modal
  const [statusModal, setStatusModal] = useState(null); // { rid, to }
  const [statusNote, setStatusNote] = useState("");
  const [detail, setDetail] = useState(null);
  const [followUp, setFollowUp] = useState("");

  const load = () => {
    api("/referrals").then(setRefs).catch((x) => setE(x.message));
  };

  useEffect(load, []);

  const incoming = refs.filter(r => r.to_facility_id === me.facility_id);
  const outgoing = refs.filter(r => r.from_facility_id === me.facility_id);

  const updateStatus = async (rid, to, note) => {
    setE(""); setMsg(""); setBusy(true);
    try {
      await api(`/referrals/${rid}/status?to=${to}`, {
        method: "POST",
        body: note ? { note } : {}
      });
      setMsg(`Referral #${rid} status changed to ${to}.`);
      setStatusModal(null);
      setStatusNote("");
      load();
    } catch (x) {
      setE(x.message);
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (rid) => {
    setE("");
    try { setDetail(await api(`/referrals/${rid}`)); }
    catch (x) { setE(x.message); }
  };
  const saveFollowUp = async (ev) => {
    ev.preventDefault(); if (!detail || !followUp.trim()) return;
    setBusy(true); setE("");
    try {
      await api(`/referrals/${detail.referral.id}/follow-ups`, { method: "POST", body: { action: followUp.trim() } });
      setFollowUp(""); await openDetail(detail.referral.id); setMsg("Follow-up action recorded.");
    } catch (x) { setE(x.message); }
    finally { setBusy(false); }
  };

  return (
    <>
      <div className="flex-between">
        <h2>Hospital Referral Exchange</h2>
        <span className="badge badge-info">{me.full_name}</span>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === "incoming" ? "active" : ""}`} onClick={() => setTab("incoming")}>
          Incoming Referrals ({incoming.length})
        </button>
        <button className={`tab ${tab === "outgoing" ? "active" : ""}`} onClick={() => setTab("outgoing")}>
          Outgoing Referrals ({outgoing.length})
        </button>
      </div>

      <Err e={e} />
      {msg && <p className="success">{msg}</p>}

      {tab === "incoming" && (
        <div className="panel">
          <h3>Referrals Received by Your Facility</h3>
          {incoming.length === 0 ? (
            <p className="muted">No incoming referrals from other facilities at this time.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Referral #</th>
                  <th>Patient</th>
                  <th>Referring Facility</th>
                  <th>Specialty</th>
                  <th>Priority</th>
                  <th>Reason</th>
                  <th>Patient ID</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {incoming.map(r => (
                  <tr key={r.id}>
                    <td>#{r.id}</td>
                    <td>
                      <button className="link-btn" onClick={() => openPatient(r.patient_id)}>
                        <b>{r.full_name}</b> ({r.arovia_id})
                      </button>
                    </td>
                    <td>{r.from_facility_name || `Facility #${r.from_facility_id}`}</td>
                    <td>{r.specialty}</td>
                    <td>
                      <span className={`badge ${r.priority === "EMERGENCY" ? "badge-err" : r.priority === "URGENT" ? "badge-warn" : "badge-info"}`}>
                        {r.priority}
                      </span>
                    </td>
                    <td>{r.reason}</td>
                    <td>{r.arovia_id}</td>
                    <td><span className="badge badge-neutral">{r.status}</span></td>
                    <td>
                      <div className="flex-gap">
                        <button className="sm sec" onClick={() => openDetail(r.id)}>History / Follow-up</button>
                        {r.status === "SENT" && (
                          <>
                            <button className="sm" onClick={() => updateStatus(r.id, "ACCEPTED")}>Accept</button>
                            <button className="sm danger" onClick={() => setStatusModal({ rid: r.id, to: "REJECTED" })}>Reject</button>
                          </>
                        )}
                        {r.status === "ACCEPTED" && (
                          <button className="sm alt" onClick={() => updateStatus(r.id, "IN_PROGRESS")}>In-Progress</button>
                        )}
                        {r.status === "IN_PROGRESS" && (
                          <button className="sm" onClick={() => updateStatus(r.id, "COMPLETED")}>Complete</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "outgoing" && (
        <div className="panel">
          <h3>Referrals Initiated by Your Facility</h3>
          {outgoing.length === 0 ? (
            <p className="muted">No outgoing referrals initiated by your facility yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Referral #</th>
                  <th>Patient</th>
                  <th>Target Facility</th>
                  <th>Specialty</th>
                  <th>Priority</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {outgoing.map(r => (
                  <tr key={r.id}>
                    <td>#{r.id}</td>
                    <td>
                      <button className="link-btn" onClick={() => openPatient(r.patient_id)}>
                        <b>{r.full_name}</b> ({r.arovia_id})
                      </button>
                    </td>
                    <td>{r.to_facility_name || `Facility #${r.to_facility_id}`}</td>
                    <td>{r.specialty}</td>
                    <td>
                      <span className={`badge ${r.priority === "EMERGENCY" ? "badge-err" : r.priority === "URGENT" ? "badge-warn" : "badge-info"}`}>
                        {r.priority}
                      </span>
                    </td>
                    <td>{r.reason}</td>
                    <td><span className="badge badge-neutral">{r.status}</span></td>
                    <td>
                      <button className="sm sec" onClick={() => openDetail(r.id)}>History / Follow-up</button>
                      {(r.status === "CREATED" || r.status === "SENT") && (
                        <button className="sm danger" onClick={() => updateStatus(r.id, "CANCELLED")}>Cancel</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* STATUS NOTE MODAL (E.G. REJECTION REASON) */}
      {statusModal && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Update Referral Status to {statusModal.to}</h3>
            <label>
              Clinical Reason / Notes:
              <textarea
                rows="3"
                value={statusNote}
                onChange={(ev) => setStatusNote(ev.target.value)}
                placeholder="Provide notes or reasons for this status update..."
              />
            </label>
            <div className="flex-gap">
              <button disabled={busy} onClick={() => updateStatus(statusModal.rid, statusModal.to, statusNote)}>
                Confirm Status Change
              </button>
              <button className="sec" onClick={() => setStatusModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
      {detail && (
        <div className="modal-overlay">
          <div className="modal-box">
            <h3>Referral #{detail.referral.id} · {detail.referral.status}</h3>
            <p><b>Patient:</b> {detail.referral.full_name} ({detail.referral.arovia_id})</p>
            <p><b>Reason:</b> {detail.referral.reason}</p>
            {detail.referral.clinical_notes && <p><b>Clinical notes:</b> {detail.referral.clinical_notes}</p>}
            <h4>Status history and follow-up actions</h4>
            <div className="panel">
              {detail.history.map(h => <p key={h.id}><b>{new Date(h.at).toLocaleString()}</b> · {h.from_status ? `${h.from_status} → ${h.to_status}` : h.to_status} · {h.changed_by_name || "User"}{h.note ? ` — ${h.note}` : ""}</p>)}
            </div>
            {detail.referral.status !== "REJECTED" && detail.referral.status !== "CANCELLED" && (
              <form onSubmit={saveFollowUp}>
                <label>Record follow-up action<textarea rows="3" value={followUp} onChange={ev => setFollowUp(ev.target.value)} required maxLength={2000} /></label>
                <button disabled={busy || !followUp.trim()}>Save Follow-up</button>
              </form>
            )}
            <button className="sec" onClick={() => setDetail(null)}>Close</button>
          </div>
        </div>
      )}
    </>
  );
}

// -------------------------------------------------------------
// DOCTOR DASHBOARD
// -------------------------------------------------------------
function DoctorDashboard({ me, openPatient, setPage }) {
  const [patients, setPatients] = useState([]);
  const [referrals, setReferrals] = useState([]);

  useEffect(() => {
    api("/patients?limit=6").then(setPatients).catch(() => {});
    api("/referrals").then(setReferrals).catch(() => {});
  }, []);

  const pendingReviews = referrals.filter(r => r.status === "SENT" && r.to_facility_id === me.facility_id);

  return (
    <>
      <div className="flex-between">
        <div>
          <h2>Doctor Workstation: Dr. {me.full_name}</h2>
          <span className="muted">Clinical Encounters, DR Reviews & Referral Management</span>
        </div>
        <span className="badge badge-ok">Doctor</span>
      </div>

      <div className="grid" style={{ marginTop: 14 }}>
        <div className="panel stat">
          <b>{patients.length}</b>
          <span className="muted">Facility Patients</span>
        </div>
        <div className="panel stat">
          <b>{pendingReviews.length}</b>
          <span className="muted">Incoming Referrals</span>
        </div>
        <div className="panel stat">
          <b>{referrals.length}</b>
          <span className="muted">Total Referrals</span>
        </div>
      </div>

      <div className="panel">
        <div className="flex-between">
          <h3>Recent Patients</h3>
          <div className="flex-gap">
            <button className="sm" onClick={() => setPage("search")}>Search All Patients</button>
            <button className="sm alt" onClick={() => setPage("register")}>+ Register Patient</button>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Arovia ID</th>
              <th>Local ID</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {patients.map(p => (
              <tr key={p.id}>
                <td><b>{p.full_name}</b></td>
                <td><code>{p.arovia_id}</code></td>
                <td>{p.local_patient_id}</td>
                <td><button className="sm" onClick={() => openPatient(p.id)}>Open Record</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// -------------------------------------------------------------
// OPTOMETRIST DASHBOARD
// -------------------------------------------------------------
function OptometristDashboard({ me, openPatient, setPage }) {
  const [patients, setPatients] = useState([]);

  useEffect(() => {
    api("/patients?limit=10").then(setPatients).catch(() => {});
  }, []);

  return (
    <>
      <div className="flex-between">
        <div>
          <h2>Optometrist Screening Station: {me.full_name}</h2>
          <span className="muted">Retinal Image Capture, Quality Verification & Decision Support</span>
        </div>
        <span className="badge badge-info">Optometrist</span>
      </div>

      <div className="panel" style={{ marginTop: 14, background: "#FAF2E1", borderLeft: "4px solid var(--warn)" }}>
        <h4>Clinical Screening Protocol</h4>
        <p className="muted" style={{ margin: "4px 0" }}>
          1. Select or register the patient.<br />
          2. Capture non-mydriatic fundus photograph (Macula and Optic Disc centered).<br />
          3. Upload image; automated quality heuristics verify sharpness, brightness, contrast, and field coverage.<br />
          4. Execute AI prediction model (EfficientNetB0).<br />
          5. If Moderate/Severe DR (Grade ≥ 2) is flagged, create supporting clinical referral for doctor evaluation.
        </p>
      </div>

      <div className="panel">
        <div className="flex-between">
          <h3>Facility Patient Screening Queue</h3>
          <button className="sm" onClick={() => setPage("search")}>Patient Lookup</button>
        </div>
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Arovia ID</th>
              <th>Local ID</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {patients.map(p => (
              <tr key={p.id}>
                <td><b>{p.full_name}</b></td>
                <td><code>{p.arovia_id}</code></td>
                <td>{p.local_patient_id}</td>
                <td>
                  <button className="sm" onClick={() => openPatient(p.id)}>
                    Screening / Retinal Capture
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// -------------------------------------------------------------
// MAIN APPLICATION COMPONENT & ROUTER
// -------------------------------------------------------------
export default function App() {
  const [me, setMe] = useState(null);
  const [page, setPage] = useState("home");
  const [pid, setPid] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get("token");
    if (urlToken) {
      localStorage.setItem("arovia_token", urlToken);
    }
    if (localStorage.getItem("arovia_token")) {
      api("/auth/me")
        .then(setMe)
        .catch(() => {
          localStorage.removeItem("arovia_token");
          setMe(null);
        });
    }
  }, []);

  const openPatient = (id) => {
    setPid(id);
    setPage("profile");
  };

  const handleLogout = () => {
    localStorage.removeItem("arovia_token");
    setMe(null);
    setPage("home");
  };

  if (!me) {
    return <Login onLogin={setMe} />;
  }

  // NAVIGATION DEFINITIONS STRICTLY PER ROLE
  const getNavItems = () => {
    switch (me.role) {
      case "SUPER_ADMIN":
        return [
          ["home", "Network Overview"],
          ["audit", "Audit Logs"]
        ];
      case "HOSPITAL_ADMIN":
        return [
          ["home", "Hospital Overview"],
          ["register", "Register Patient"],
          ["search", "Patient Search"],
          ["audit", "Access Audit"]
        ];
      case "DOCTOR":
        return [
          ["home", "Doctor Dashboard"],
          ["register", "Register Patient"],
          ["search", "Patient Search"],
          ["referrals", "Referral Exchange"]
        ];
      case "OPTOMETRIST":
        return [
          ["home", "Optometrist Station"],
          ["register", "Register Patient"],
          ["search", "Patient Search"]
        ];
      default:
        return [["home", "Dashboard"]];
    }
  };

  const nav = getNavItems();

  return (
    <div className="shell">
      <nav>
        <Brand />
        <div style={{ margin: "14px 0 20px" }}>
          <b>{me.full_name}</b>
          <div className="muted">{ROLE_LABELS[me.role] || me.role}</div>
        </div>

        {nav.map(([k, label]) => (
          <a
            key={k}
            className={page === k ? "on" : ""}
            onClick={() => setPage(k)}
          >
            {label}
          </a>
        ))}

        <div style={{ marginTop: 24, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <a onClick={handleLogout} style={{ color: "var(--err)" }}>
            Sign Out
          </a>
        </div>
      </nav>

      <main>
        {page === "profile" && pid ? (
          <PatientProfile id={pid} me={me} onBack={() => setPage("search")} />
        ) : page === "register" ? (
          <PatientRegister open={openPatient} onSearch={() => setPage("search")} />
        ) : page === "search" ? (
          <PatientSearch open={openPatient} role={me.role} />
        ) : page === "referrals" ? (
          <ReferralManager me={me} openPatient={openPatient} />
        ) : me.role === "SUPER_ADMIN" ? (
          <SuperAdminDashboard />
        ) : me.role === "HOSPITAL_ADMIN" ? (
          <HospitalAdminDashboard me={me} openPatient={openPatient} setPage={setPage} />
        ) : me.role === "DOCTOR" ? (
          <DoctorDashboard me={me} openPatient={openPatient} setPage={setPage} />
        ) : me.role === "OPTOMETRIST" ? (
          <OptometristDashboard me={me} openPatient={openPatient} setPage={setPage} />
        ) : (
          <div className="panel">This account role is not supported. Please contact your system administrator.</div>
        )}
      </main>
    </div>
  );
}
