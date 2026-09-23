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
      const res = await fetch(base + "/health", { method: "GET" });
      online = res.ok;
      return online;
    } catch {
      online = false;
      return false;
    }
  }

  async function ensureAuth() {
    if (token) {
      try {
        await req("GET", "/auth/me");
        return true;
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
