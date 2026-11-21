export async function api(path, { method = "GET", body, form } = {}) {
  const h = {}; const t = localStorage.getItem("arovia_token"); if (t) h.Authorization = "Bearer " + t;
  if (body) h["Content-Type"] = "application/json";
  const r = await fetch("/api" + path, { method, headers: h, body: form || (body ? JSON.stringify(body) : undefined) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "Request failed (" + r.status + ")");
  return j;
}
export async function apiBlob(path) {
  const r = await fetch("/api" + path, { headers: { Authorization: "Bearer " + localStorage.getItem("arovia_token") } });
  if (!r.ok) throw new Error("Image load failed"); return URL.createObjectURL(await r.blob());
}
