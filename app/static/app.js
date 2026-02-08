// /static/app.js
// Garirakho Dashboard JS (Fix: slots object vs array + better errors + cookie session)

function getApiHeaders() {
  return { 
    Accept: "application/json",
    "x-api-key": "devkey"   // must match the value you set in Azure
  };
}


async function fetchDevices() {
  const r = await fetch("/api/devices", {
    method: "GET",
    credentials: "include", // important for session cookie
    headers: getApiHeaders(),
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(`GET /api/devices -> ${r.status} | ${t}`);
  }
  return await r.json();
}

async function post(url) {
  const r = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: getApiHeaders(),
  });

  if (!r.ok) {
    const t = await r.text();
    alert(`POST ${url} -> ${r.status}\n${t}`);
    throw new Error(`POST ${url} -> ${r.status} | ${t}`);
  }

  // some endpoints return {"ok":true}, some may return empty
  try {
    return await r.json();
  } catch {
    return {};
  }
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * Normalize slots into an ARRAY:
 * [{id, occupied, booked}, ...]
 *
 * Supports:
 * 1) slots = [ {id, occupied, booked}, ... ]   ✅ your desired format
 * 2) slots = {available: 8, occupied: 0}      ✅ your current DB demo format
 * 3) slots = null/empty                       ✅ fallback
 */
function normalizeSlots(slots) {
  // already array
  if (Array.isArray(slots)) {
    return slots.map((s, idx) => ({
      id: Number(s?.id ?? idx + 1),
      occupied: Boolean(s?.occupied ?? false),
      booked: Boolean(s?.booked ?? false),
    }));
  }

  // object like {available, occupied}
  if (slots && typeof slots === "object") {
    const available = Number(slots.available ?? 0);
    const occupied = Number(slots.occupied ?? 0);

    // you can set fixed slots=4 OR dynamic available+occupied
    const total = Math.max(4, available + occupied);

    return Array.from({ length: total }, (_, i) => ({
      id: i + 1,
      occupied: i < occupied, // demo rendering
      booked: false,
    }));
  }

  // fallback: show 4 empty slots
  return [
    { id: 1, occupied: false, booked: false },
    { id: 2, occupied: false, booked: false },
    { id: 3, occupied: false, booked: false },
    { id: 4, occupied: false, booked: false },
  ];
}

function slotBadge(slot) {
  const occ = slot.occupied ? "Occupied" : "Free";
  const booked = slot.booked ? "Booked" : "Not booked";

  const occClass = slot.occupied
    ? "bg-rose-500/20 border-rose-500/40 text-rose-200"
    : "bg-emerald-500/20 border-emerald-500/40 text-emerald-200";

  const bookClass = slot.booked
    ? "bg-amber-500/20 border-amber-500/40 text-amber-200"
    : "bg-slate-800 border-slate-700 text-slate-300";

  return `
    <div class="border border-slate-800 rounded-xl p-3 bg-slate-900/40">
      <div class="font-semibold">Slot ${escapeHtml(slot.id)}</div>
      <div class="mt-2 flex gap-2">
        <span class="text-xs px-2 py-1 rounded-lg border ${occClass}">${occ}</span>
        <span class="text-xs px-2 py-1 rounded-lg border ${bookClass}">${booked}</span>
      </div>
    </div>
  `;
}

function deviceCard(d) {
  const slots = normalizeSlots(d.slots);
  const slotsHtml = slots.map(slotBadge).join("");

  const adminPanel = d.isAdmin
    ? `
    <div class="mt-4 border-t border-slate-800 pt-4">
      <div class="text-sm font-semibold mb-2">Admin Controls</div>
      <div class="flex flex-wrap gap-2">
        <button class="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-sm"
          onclick="window.__garirakhoPost('/api/cmd/open-gate?deviceId=${encodeURIComponent(
            d.deviceId
          )}')">Open Gate</button>

        <button class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm"
          onclick="window.__garirakhoPost('/api/cmd/exit-approved?deviceId=${encodeURIComponent(
            d.deviceId
          )}&approved=true')">Approve Exit</button>

        <button class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm border border-slate-700"
          onclick="window.__garirakhoPost('/api/cmd/exit-approved?deviceId=${encodeURIComponent(
            d.deviceId
          )}&approved=false')">Revoke Exit</button>
      </div>
    </div>
  `
    : `<div class="mt-4 text-sm text-slate-400">Admin controls hidden (user mode).</div>`;

  return `
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <div class="flex items-start justify-between">
        <div>
          <div class="text-lg font-semibold">${escapeHtml(d.deviceId)}</div>
          <div class="text-sm text-slate-400">Last seen: ${escapeHtml(
            d.lastSeen || "unknown"
          )}</div>
        </div>
        <div class="text-right">
          <div class="text-xs text-slate-400">MsgCount</div>
          <div class="text-xl font-bold">${escapeHtml(d.lastMsgCount ?? "-")}</div>
        </div>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <div class="bg-slate-950/50 border border-slate-800 rounded-xl p-3">
          <div class="text-xs text-slate-400">Entrance (cm)</div>
          <div class="text-lg font-semibold">${escapeHtml(d.entranceCm ?? 0)}</div>
        </div>
        <div class="bg-slate-950/50 border border-slate-800 rounded-xl p-3">
          <div class="text-xs text-slate-400">Exit Approved</div>
          <div class="text-lg font-semibold">${d.exitApproved ? "YES" : "NO"}</div>
        </div>
      </div>

      <div class="mt-4 grid grid-cols-2 gap-3">
        ${slotsHtml}
      </div>

      ${adminPanel}
    </div>
  `;
}

// allow inline onclick buttons
window.__garirakhoPost = (url) => post(url).catch((e) => console.error(e));

async function refresh() {
  const statusEl = document.getElementById("statusText");
  const devicesEl = document.getElementById("devices");

  try {
    const devices = await fetchDevices();

    if (!Array.isArray(devices)) {
      throw new Error(`Expected array from /api/devices, got ${typeof devices}`);
    }

    devicesEl.innerHTML = devices.map(deviceCard).join("");
    statusEl.textContent = `Devices: ${devices.length}`;
  } catch (e) {
    console.error("Failed to load devices:", e);
    statusEl.textContent = `Failed to load devices: ${e?.message || e}`;
    devicesEl.innerHTML = "";
  }
}

refresh();
setInterval(refresh, 2000);
