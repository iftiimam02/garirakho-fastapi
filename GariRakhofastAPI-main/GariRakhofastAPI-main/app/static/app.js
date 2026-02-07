async function fetchDevices() {
  const r = await fetch("/api/devices");
  if (!r.ok) throw new Error(await r.text());
  return await r.json();
}

async function post(url) {
  const r = await fetch(url, { method: "POST" });
  if (!r.ok) alert(await r.text());
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
      <div class="font-semibold">Slot ${slot.id}</div>
      <div class="mt-2 flex gap-2">
        <span class="text-xs px-2 py-1 rounded-lg border ${occClass}">${occ}</span>
        <span class="text-xs px-2 py-1 rounded-lg border ${bookClass}">${booked}</span>
      </div>
    </div>
  `;
}

function deviceCard(d) {
  const slotsHtml = (d.slots || []).map(slotBadge).join("");

  const adminPanel = d.isAdmin ? `
    <div class="mt-4 border-t border-slate-800 pt-4">
      <div class="text-sm font-semibold mb-2">Admin Controls</div>
      <div class="flex flex-wrap gap-2">
        <button class="px-3 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-sm"
          onclick="post('/api/cmd/open-gate?deviceId=${encodeURIComponent(d.deviceId)}')">Open Gate</button>

        <button class="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm"
          onclick="post('/api/cmd/exit-approved?deviceId=${encodeURIComponent(d.deviceId)}&approved=true')">Approve Exit</button>

        <button class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm border border-slate-700"
          onclick="post('/api/cmd/exit-approved?deviceId=${encodeURIComponent(d.deviceId)}&approved=false')">Revoke Exit</button>
      </div>

      <div class="mt-3 text-xs text-slate-400">
        Booking flags (C2D): slot1Booked..slot4Booked
      </div>

      <div class="mt-2 flex flex-wrap gap-2">
        <button class="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-sm"
          onclick="post('/api/cmd/book-slots?deviceId=${encodeURIComponent(d.deviceId)}&slot1=true')">Book Slot 1</button>
        <button class="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-sm"
          onclick="post('/api/cmd/book-slots?deviceId=${encodeURIComponent(d.deviceId)}&slot2=true')">Book Slot 2</button>
        <button class="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-sm"
          onclick="post('/api/cmd/book-slots?deviceId=${encodeURIComponent(d.deviceId)}&slot3=true')">Book Slot 3</button>
        <button class="px-3 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-sm"
          onclick="post('/api/cmd/book-slots?deviceId=${encodeURIComponent(d.deviceId)}&slot4=true')">Book Slot 4</button>

        <button class="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm border border-slate-700"
          onclick="post('/api/cmd/book-slots?deviceId=${encodeURIComponent(d.deviceId)}')">Clear All Bookings</button>
      </div>
    </div>
  ` : `<div class="mt-4 text-sm text-slate-400">Admin controls hidden (user mode).</div>`;

  return `
    <div class="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
      <div class="flex items-start justify-between">
        <div>
          <div class="text-lg font-semibold">${d.deviceId}</div>
          <div class="text-sm text-slate-400">Last seen: ${d.lastSeen || "unknown"}</div>
        </div>
        <div class="text-right">
          <div class="text-xs text-slate-400">MsgCount</div>
          <div class="text-xl font-bold">${d.lastMsgCount ?? "-"}</div>
        </div>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-3">
        <div class="bg-slate-950/50 border border-slate-800 rounded-xl p-3">
          <div class="text-xs text-slate-400">Entrance (cm)</div>
          <div class="text-lg font-semibold">${d.entranceCm ?? 0}</div>
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

async function refresh() {
  try {
    const devices = await fetchDevices();
    document.getElementById("devices").innerHTML = devices.map(deviceCard).join("");
    document.getElementById("statusText").textContent = `Devices: ${devices.length}`;
  } catch (e) {
    document.getElementById("statusText").textContent = "Failed to load devices";
  }
}

refresh();
setInterval(refresh, 2000);
