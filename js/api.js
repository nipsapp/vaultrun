/**
 * Vault Run client → game server API
 */
window.VR = window.VR || {};

VR.API = (function () {
  const DEFAULT_BASE = window.VR_API_BASE || (location.port === "8787" || location.port === "" ? "/api/v1" : "http://localhost:8787/api/v1");

  let base = DEFAULT_BASE;
  let token = localStorage.getItem("vr_token") || "";
  let online = false;

  function setBase(url) {
    base = url.replace(/\/$/, "");
  }

  function authHeaders() {
    const h = { "content-type": "application/json" };
    if (token) h.authorization = "Bearer " + token;
    return h;
  }

  async function req(method, path, body) {
    const res = await fetch(base + path, {
      method,
      headers: authHeaders(),
      body: body != null ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || res.statusText);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  async function probe() {
    try {
      const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
      const t = ctrl ? setTimeout(() => ctrl.abort(), 1200) : null;
      const res = await fetch(base + "/health", {
        method: "GET",
        signal: ctrl ? ctrl.signal : undefined
      });
      const cfg = res.ok ? await fetch(base + "/game/config", {
        signal: ctrl ? ctrl.signal : undefined, cache: "no-store"
      }).then(r => r.ok ? r.json() : null) : null;
      if (t) clearTimeout(t);
      online = !!(cfg && cfg.mathId === VR.CONFIG.mathId && cfg.version === VR.CONFIG.version &&
        cfg.reels === VR.CONFIG.reels && cfg.rowsBase === VR.CONFIG.rowsBase);
      return online;
    } catch {
      online = false;
      return false;
    }
  }

  async function ensureAuth() {
    if (token) {
      try {
        const me = await req("GET", "/auth/me");
        let balance = me.balance;
        if (balance == null) {
          try {
            const w = await req("GET", "/wallet");
            balance = w.balance;
          } catch (_) {}
        }
        return { token, user: me.user || me, balance };
      } catch {
        token = "";
        localStorage.removeItem("vr_token");
      }
    }
    // Demo auto-register guest
    const user = "player_" + Math.random().toString(36).slice(2, 8);
    const pass = "pass_" + Math.random().toString(36).slice(2, 10);
    try {
      const out = await req("POST", "/auth/register", {
        username: user,
        password: pass,
        displayName: "Guest"
      });
      token = out.token;
      localStorage.setItem("vr_token", token);
      localStorage.setItem("vr_user", JSON.stringify(out.user));
      return out;
    } catch (e) {
      // fallback login attempt if register raced
      const out = await req("POST", "/auth/login", { username: user, password: pass });
      token = out.token;
      localStorage.setItem("vr_token", token);
      return out;
    }
  }

  async function spin(body) {
    return req("POST", "/game/spin", body);
  }

  async function state() {
    return req("GET", "/game/state");
  }

  async function wallet() {
    return req("GET", "/wallet");
  }

  return {
    setBase,
    probe,
    ensureAuth,
    spin,
    state,
    wallet,
    isOnline: () => online,
    getToken: () => token
  };
})();
