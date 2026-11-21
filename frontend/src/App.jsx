import React, { useState, useEffect } from "react";
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
  REGISTRATION: "Registration Staff"
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
                <option value="REGISTRATION">Registration Staff</option>
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

  const loadData = () => {
    api("/stats").then(setStats).catch((x) => setE(x.message));
    api("/applications").then(setApps).catch((x) => setE(x.message));
    api("/facilities").then(setFacilities).catch((x) => setE(x.message));
    api("/audit").then(setLogs).catch((x) => setE(x.message));
  };

  useEffect(loadData, []);

  const changeAppStatus = async (aid, status) => {
    setE(""); setMsg("");
    try {
      await api(`/applications/${aid}/status`, { method: "POST", body: { status } });
      setMsg(`Application #${aid} status updated to ${status}.`);
      loadData();
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
                      {f.verification_status === "VERIFIED" && (
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
function HospitalAdminDashboard({ me, openPatient }) {
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
                  <option value="REGISTRATION">Registration Staff</option>
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
function PatientRegister({ open }) {
  const [f, set] = useForm({
    full_name: "", date_of_birth: "", sex: "U", phone: "", address: "", local_patient_id: ""
  });
  const [e, setE] = useState("");
  const [busy, setBusy] = useState(false);

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
      const p = await api("/patients", { method: "POST", body: { ...f, full_name: cleanName } });
      open(p.id);
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
          <Field l="Address / Residential Area" value={f.address} onChange={set("address")} placeholder="e.g. Indiranagar, Bengaluru" />
          <Field l="Hospital Local Patient ID (Your facility record number) *" required value={f.local_patient_id} onChange={set("local_patient_id")} placeholder="e.g. MED-2026-0042" />

          <Err e={e} />
          <button type="submit" disabled={busy}>{busy ? "Registering..." : "Complete Registration"}</button>
        </form>
      </div>
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

  useEffect(() => { go(); }, []);

  return (
    <>
      <h2>Patient Search</h2>
      <div className="panel">
        <form onSubmit={go} className="flex-gap" style={{ marginBottom: 12 }}>
          <input
            placeholder="Search by Patient Name, Arovia ID (AR-...), or Local Hospital ID"
            value={q}
            onChange={(x) => setQ(x.target.value)}
            style={{ margin: 0 }}
          />
          <button type="submit" disabled={busy}>{busy ? "Searching..." : "Search"}</button>
        </form>
        <Err e={e} />

        {rows.length === 0 && hasSearched ? (
          <p className="muted" style={{ padding: 12 }}>No matching patient records found in your facility registry.</p>
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
                  <td>{p.local_patient_id}</td>
                  <td>{p.date_of_birth}</td>
                  <td>
                    <button className="sm" onClick={() => open(p.id)}>
                      {role === "REGISTRATION" ? "View Demographics" : "Open Record"}
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

  // Encounter modal
  const [encModal, setEncModal] = useState(false);
  const [enc, setEnc] = useForm({ encounter_type: "OUTPATIENT", clinical_notes: "", treatment: "", follow_up: "" });

  // Clinical items modal (Doctor only)
  const [itemModal, setItemModal] = useState(null); // 'dx', 'rx', 'al'
  const [dx, setDx] = useForm({ encounter_id: "", description: "", icd10_code: "" });
  const [rx, setRx] = useForm({ encounter_id: "", medication: "", dosage: "", frequency: "", duration: "" });
  const [al, setAl] = useForm({ substance: "", reaction: "", severity: "MILD" });

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
  };

  useEffect(load, [id]);

  const addEncounter = async (ev) => {
    ev.preventDefault();
    setE("");
    try {
      await api(`/patients/${id}/encounters`, { method: "POST", body: enc });
      setEncModal(false);
      setEnc({ encounter_type: "OUTPATIENT", clinical_notes: "", treatment: "", follow_up: "" });
      setMsg("Clinical encounter recorded.");
      load();
    } catch (x) {
      setE(x.message);
    }
  };

  const addDiagnosis = async (ev) => {
    ev.preventDefault();
    setE("");
    try {
      await api(`/patients/${id}/diagnoses`, {
        method: "POST",
        body: { ...dx, encounter_id: Number(dx.encounter_id) }
      });
      setItemModal(null);
      setDx({ encounter_id: "", description: "", icd10_code: "" });
      setMsg("Diagnosis added.");
      load();
    } catch (x) {
      setE(x.message);
    }
  };

  const addPrescription = async (ev) => {
    ev.preventDefault();
    setE("");
    try {
      await api(`/patients/${id}/prescriptions`, {
        method: "POST",
        body: { ...rx, encounter_id: Number(rx.encounter_id) }
      });
      setItemModal(null);
      setRx({ encounter_id: "", medication: "", dosage: "", frequency: "", duration: "" });
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
      await api(`/patients/${id}/allergies`, { method: "POST", body: al });
      setItemModal(null);
      setAl({ substance: "", reaction: "", severity: "MILD" });
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
  const isRegistration = me.role === "REGISTRATION";

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

      {/* REGISTRATION STAFF DEMOGRAPHIC VIEW ONLY */}
      {isRegistration ? (
        <div className="panel" style={{ marginTop: 14 }}>
          <h3>Patient Demographic Details</h3>
          <p><b>Address:</b> {p.address || "No address on record"}</p>
          <p><b>Registration Date:</b> {new Date(p.created_at).toLocaleDateString()}</p>
          <p className="notice-box">
            Clinical records (diagnoses, prescriptions, screenings) are restricted to authorized medical personnel (Doctor and Optometrist roles).
          </p>
        </div>
      ) : (
        /* DOCTOR, OPTOMETRIST, AND HOSPITAL ADMIN CLINICAL VIEW */
        <>
          <div className="panel" style={{ marginTop: 14 }}>
            <div className="flex-between">
              <h3>Clinical Overview</h3>
              {isDoctor && (
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

          {/* RETINAL SCREENING WORKFLOW */}
          <Screening pid={id} me={me} past={d.screenings} onDone={load} onRequestReferral={(sid) => {
            setRefForm({ ...refForm, screening_id: sid });
            setRefModal(true);
          }} />

          {/* CLINICAL ENCOUNTERS & TIMELINE */}
          <div className="panel">
            <div className="flex-between">
              <h3>Longitudinal Timeline</h3>
              {(isDoctor || isOptometrist) && (
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
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

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
              <label>Clinical Notes<textarea rows="3" value={enc.clinical_notes} onChange={setEnc("clinical_notes")} /></label>
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
                  {tl.filter(t => t.kind.startsWith("Encounter")).map((t, idx) => (
                    <option key={idx} value={t.at}>Encounter at {new Date(t.at).toLocaleDateString()}</option>
                  ))}
                  {/* Fallback to patient's encounter ID */}
                  {d.screenings[0] && <option value={d.screenings[0].encounter_id}>Encounter #{d.screenings[0].encounter_id}</option>}
                </select>
              </label>
              <Field l="Condition / Diagnosis Description *" required value={dx.description} onChange={setDx("description")} />
              <Field l="ICD-10 Code (e.g. E11.319 for Diabetic Retinopathy)" value={dx.icd10_code} onChange={setDx("icd10_code")} />
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
                  {d.screenings[0] && <option value={d.screenings[0].encounter_id}>Encounter #{d.screenings[0].encounter_id}</option>}
                </select>
              </label>
              <Field l="Medication Name *" required value={rx.medication} onChange={setRx("medication")} />
              <Field l="Dosage (e.g. 500mg, 1 drop)" value={rx.dosage} onChange={setRx("dosage")} />
              <Field l="Frequency (e.g. Twice daily, Once at bedtime)" value={rx.frequency} onChange={setRx("frequency")} />
              <Field l="Duration (e.g. 14 days, 1 month)" value={rx.duration} onChange={setRx("duration")} />
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
              <Field l="Substance / Allergen *" required value={al.substance} onChange={setAl("substance")} />
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
            <p className="muted">Direct inter-hospital referral exchange with Arovia Network</p>
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
  const [e, setE] = useState("");
  const [busy, setBusy] = useState(false);
  const [rv, setRv] = useState({ final_grade: 0, assessment: "", recommendations: "" });

  useEffect(() => {
    api(`/patients/${pid}/encounters`).then((x) => {
      setEncs(x);
      if (x[0]) setEncId(x[0].id);
    }).catch(() => {});
  }, [pid]);

  const show = async (id) => {
    setE("");
    try {
      const data = await api("/screenings/" + id);
      setScr(data);
      const url = await apiBlob(`/screenings/${id}/image`);
      setImg(url);
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
          {img && (
            <img
              src={img}
              alt="retina"
              style={{ maxWidth: 260, float: "right", marginLeft: 16, marginBottom: 16, border: "1px solid var(--line)", borderRadius: 4 }}
            />
          )}

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
                    <td><span className="badge badge-neutral">{r.status}</span></td>
                    <td>
                      <div className="flex-gap">
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
                    <td><span className="badge badge-neutral">{r.status}</span></td>
                    <td>
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
// REGISTRATION STAFF DASHBOARD
// -------------------------------------------------------------
function RegistrationDashboard({ me, openPatient, setPage }) {
  return (
    <>
      <div className="flex-between">
        <div>
          <h2>Patient Registration Desk: {me.full_name}</h2>
          <span className="muted">Demographics, Identity Intake & Patient Search</span>
        </div>
        <span className="badge badge-neutral">Registration Staff</span>
      </div>

      <div className="panel" style={{ marginTop: 14 }}>
        <h3>Patient Registration & Identity Workflow</h3>
        <p className="muted">
          Arovia assigns globally unique patient IDs to prevent duplicate registrations and protect privacy.
          Do not collect or store national Aadhaar numbers.
        </p>
        <div className="flex-gap" style={{ marginTop: 14 }}>
          <button onClick={() => setPage("register")}>+ Register New Patient</button>
          <button className="sec" onClick={() => setPage("search")}>Search Patient Registry</button>
        </div>
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
          ["search", "Patient Search"],
          ["audit", "Access Audit"]
        ];
      case "DOCTOR":
        return [
          ["home", "Doctor Dashboard"],
          ["search", "Patient Search"],
          ["register", "Register Patient"],
          ["referrals", "Referral Exchange"]
        ];
      case "OPTOMETRIST":
        return [
          ["home", "Optometrist Station"],
          ["search", "Patient Search"],
          ["register", "Register Patient"]
        ];
      case "REGISTRATION":
        return [
          ["home", "Registration Desk"],
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
          <PatientRegister open={openPatient} />
        ) : page === "search" ? (
          <PatientSearch open={openPatient} role={me.role} />
        ) : page === "referrals" ? (
          <ReferralManager me={me} openPatient={openPatient} />
        ) : me.role === "SUPER_ADMIN" ? (
          <SuperAdminDashboard />
        ) : me.role === "HOSPITAL_ADMIN" ? (
          <HospitalAdminDashboard me={me} openPatient={openPatient} />
        ) : me.role === "DOCTOR" ? (
          <DoctorDashboard me={me} openPatient={openPatient} setPage={setPage} />
        ) : me.role === "OPTOMETRIST" ? (
          <OptometristDashboard me={me} openPatient={openPatient} setPage={setPage} />
        ) : (
          <RegistrationDashboard me={me} openPatient={openPatient} setPage={setPage} />
        )}
      </main>
    </div>
  );
}
