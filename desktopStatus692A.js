/* 692A – read-only PC status. No sync writes, no editor changes. */
(() => {
  const media = matchMedia("(min-width: 900px) and (hover: hover) and (pointer: fine)");
  const panel = document.getElementById("lnDesktopStatus692A");
  if (!panel) return;
  const sync = document.getElementById("lnDesktopSync692A");
  const quota = document.getElementById("lnDesktopQuotaText692A");
  const fill = document.getElementById("lnDesktopQuotaFill692A");
  const account = document.getElementById("lnDesktopAccount692A");
  let busy = false;
  let lastUser = null;
  let latestSync = "pending";
  const statuses = {
    synced: "✓ Synchronizováno",
    syncing: "⟳ Synchronizuji…",
    pending: "◷ Čeká na synchronizaci",
    local: "▣ Pouze v zařízení",
    "auth-expired": "⚠ Přihlášení vypršelo",
    conflict: "⚠ Konflikt"
  };
  function updateVisibility() {
    panel.hidden = !media.matches;
    if (media.matches) void refresh();
  }
  function renderSync() {
    const local = window.LubaNoteStorageScope?.ziskejAktivni?.() === "local";
    const state = local && latestSync !== "auth-expired" ? "local" : latestSync;
    sync.dataset.state = state;
    sync.textContent = statuses[state] || statuses.pending;
  }
  function format(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return "—";
    if (n < 1024) return `${Math.round(n)} B`;
    if (n < 1048576) return `${(n / 1024).toLocaleString("cs-CZ", {maximumFractionDigits: 1})} kB`;
    return `${(n / 1048576).toLocaleString("cs-CZ", {maximumFractionDigits: 2})} MB`;
  }
  async function refresh() {
    if (!media.matches || busy || !navigator.onLine) {
      if (!navigator.onLine && media.matches) quota.textContent = "Offline";
      return;
    }
    busy = true;
    try {
      const ready = await window.LubaNoteSupabase?.pripravClient?.();
      if (!ready || typeof supabaseClient === "undefined" || !supabaseClient) {
        quota.textContent = "Nedostupné";
        return;
      }
      const {data: sessionResult, error: sessionError} = await supabaseClient.auth.getSession();
      if (sessionError || !sessionResult?.session?.user) {
        quota.textContent = "Nepřihlášeno";
        account.hidden = true;
        fill.style.width = "0%";
        lastUser = null;
        return;
      }
      const user = sessionResult.session.user;
      if (lastUser !== user.id) {
        quota.textContent = "Zjišťuji…";
        fill.style.width = "0%";
        lastUser = user.id;
      }
      const label = String(user.email || "").split("@")[0].trim();
      account.textContent = label ? label.slice(0, 2).toLocaleUpperCase("cs-CZ") : "●";
      account.title = user.email || "Přihlášený účet";
      account.hidden = false;
      const {data, error} = await supabaseClient.rpc("lubanote_get_account_cloud_usage_v1");
      if (error || !data?.ok) {
        quota.textContent = data?.reason === "account_not_active" ? "Účet není aktivní" : "Údaj nedostupný";
        fill.style.width = "0%";
        return;
      }
      const used = Number(data.usage_bytes);
      const limit = data.cloud_bytes_limit == null ? null : Number(data.cloud_bytes_limit);
      if (!Number.isFinite(used) || used < 0 || (limit !== null && (!Number.isFinite(limit) || limit <= 0))) {
        quota.textContent = "Údaj nedostupný";
        fill.style.width = "0%";
        return;
      }
      quota.textContent = `${format(used)} / ${limit === null ? "bez limitu" : format(limit)}`;
      const percent = limit === null ? 0 : Math.max(0, Math.min(100, 100 * used / limit));
      fill.style.width = `${percent}%`;
      fill.dataset.high = percent >= 85 ? "1" : "0";
      quota.title = `Poznámky ${format(data.note_bytes)} · Sdílená média ${format(data.shared_media_bytes)} · Přílohy ${format(data.attachment_bytes)} · Rezervace ${format(data.reserved_bytes)} (mimo zobrazenou spotřebu)`;
    } catch (_error) {
      quota.textContent = "Údaj nedostupný";
      fill.style.width = "0%";
    } finally {
      busy = false;
    }
  }
  window.addEventListener("lubanote:sync-state", (event) => {
    const state = event?.detail?.stav;
    if (state === "restore") return;
    if (Object.prototype.hasOwnProperty.call(statuses, state)) {
      latestSync = state;
      renderSync();
      if (state === "synced") void refresh();
    }
  });
  window.addEventListener("online", () => void refresh());
  window.addEventListener("focus", () => void refresh());
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void refresh();
  });
  media.addEventListener?.("change", updateVisibility);
  renderSync();
  updateVisibility();
})();
