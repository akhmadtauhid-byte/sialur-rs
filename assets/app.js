// SIALUR-RS — helper bersama untuk igd.html, bangsal.html, monitor.html
// Membutuhkan config.js dan supabase-js sudah dimuat sebelumnya.

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const STAGE_ORDER = ["igd", "keputusan_rawat", "menunggu_bangsal", "siap_pindah", "selesai"];
const STAGE_LABEL = {
  igd: "Masuk IGD",
  keputusan_rawat: "Keputusan Rawat Inap",
  menunggu_bangsal: "Menunggu Konfirmasi Bangsal",
  siap_pindah: "Siap Dipindahkan",
  selesai: "Selesai",
  batal: "Dibatalkan",
};

function requireSession() {
  const token = localStorage.getItem("sialur_token");
  const userRaw = localStorage.getItem("sialur_user");
  if (!token || !userRaw) {
    window.location.href = "index.html";
    return null;
  }
  return { token, user: JSON.parse(userRaw) };
}

function logout() {
  localStorage.removeItem("sialur_token");
  localStorage.removeItem("sialur_user");
  window.location.href = "index.html";
}

async function callFn(name, payload) {
  const token = localStorage.getItem("sialur_token");
  const res = await fetch(`${FUNCTIONS_URL}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY },
    body: JSON.stringify({ token, ...payload }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Terjadi kesalahan");
  return data;
}

function minutesSince(iso) {
  if (!iso) return null;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
}

function fmtDuration(min) {
  if (min == null) return "-";
  if (min < 60) return `${min} mnt`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h} jam ${m} mnt`;
}

// referenceField per status -> kolom timestamp yang jadi acuan tahap berjalan
const STAGE_REF_FIELD = {
  igd: "t_masuk_igd",
  keputusan_rawat: "t_keputusan_rawat",
  menunggu_bangsal: "t_permintaan_bangsal",
  siap_pindah: "t_bangsal_siap",
};
const STAGE_THRESHOLD_KEY = {
  igd: "assesmen_igd",
  keputusan_rawat: "permintaan_bangsal",
  menunggu_bangsal: "respon_bangsal",
  siap_pindah: "transfer_fisik",
};

function elapsedInfo(flow, thresholds) {
  if (flow.status === "selesai" || flow.status === "batal") return null;
  const refField = STAGE_REF_FIELD[flow.status];
  const ref = flow[refField];
  const min = minutesSince(ref);
  const thKey = STAGE_THRESHOLD_KEY[flow.status];
  const threshold = thresholds?.[thKey]?.threshold_minutes ?? null;
  let level = "good";
  if (threshold != null && min != null) {
    const ratio = min / threshold;
    if (ratio >= 1) level = "critical";
    else if (ratio >= 0.75) level = "serious";
    else if (ratio >= 0.5) level = "warning";
  }
  return { min, threshold, level };
}

function stageTrackHtml(flow) {
  const idx = STAGE_ORDER.indexOf(flow.status);
  return STAGE_ORDER.slice(0, -1)
    .map((s, i) => {
      let cls = "stage-dot";
      if (flow.status === "batal") cls += "";
      else if (i < idx) cls += " done";
      else if (i === idx) cls += " current";
      return `<div class="${cls}" title="${STAGE_LABEL[s]}"></div>`;
    })
    .join("");
}

async function fetchThresholds() {
  const { data } = await sb.from("delay_thresholds").select("*");
  const map = {};
  (data || []).forEach((t) => (map[t.stage_key] = t));
  return map;
}

async function fetchWards() {
  const { data } = await sb.from("wards").select("*").eq("aktif", true).order("nama_bangsal");
  return data || [];
}

async function fetchRooms(wardId) {
  const { data } = await sb.from("rooms").select("*").eq("ward_id", wardId).order("nomor_kamar");
  return data || [];
}

// Membangun tab navigasi sesuai role user yang login, dipakai di igd.html,
// bangsal.html, monitor.html, admin.html supaya konsisten.
function renderNavTabs(user, activeFile) {
  const items = [];
  if (user.role === "igd" || user.role === "admin") items.push(["igd.html", "Alur Pasien"]);
  if (user.role === "bangsal" || user.role === "admin") items.push(["bangsal.html", "Bangsal"]);
  items.push(["monitor.html", "Monitor"]);
  if (user.role === "admin") items.push(["admin.html", "Kelola User"]);
  return items
    .map(([href, label]) => `<a href="${href}"${href === activeFile ? ' class="active"' : ""}>${label}</a>`)
    .join("");
}
