const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { getDb } = require("../db/client");
const config = require("../config");
const wallet = require("../wallet/service");

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(":");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const a = Buffer.from(hash, "hex");
  if (a.length !== derived.length) return false;
  return crypto.timingSafeEqual(a, derived);
}

function register({ username, password, displayName }) {
  username = String(username || "").trim();
  password = String(password || "");
  if (username.length < 3 || username.length > 32) {
    const e = new Error("Username must be 3–32 characters");
    e.status = 400;
    throw e;
  }
  if (password.length < 6) {
    const e = new Error("Password must be at least 6 characters");
    e.status = 400;
    throw e;
  }
  const db = getDb();
  const id = crypto.randomUUID();
  try {
    db.prepare(
      "INSERT INTO users (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)"
    ).run(id, username, hashPassword(password), displayName || username);
  } catch (err) {
    if (String(err.message).includes("UNIQUE")) {
      const e = new Error("Username already taken");
      e.status = 409;
      throw e;
    }
    throw err;
  }
  wallet.getWallet(id); // creates funded wallet
  return createSession(id, {});
}

function login({ username, password }, meta = {}) {
  const db = getDb();
  const user = db
    .prepare("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
    .get(String(username || "").trim());
  if (!user || !verifyPassword(password || "", user.password_hash)) {
    const e = new Error("Invalid credentials");
    e.status = 401;
    throw e;
  }
  return createSession(user.id, meta);
}

function createSession(userId, meta = {}) {
  const db = getDb();
  const sessionId = crypto.randomUUID();
  const jti = crypto.randomUUID();
  const expires = new Date(Date.now() + config.sessionTtlHours * 3600 * 1000);
  db.prepare(
    `INSERT INTO sessions (id, user_id, token_jti, ip, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sessionId, userId, jti, meta.ip || null, meta.userAgent || null, expires.toISOString());

  const token = jwt.sign(
    { sub: userId, sid: sessionId, jti },
    config.jwtSecret,
    { expiresIn: config.jwtExpires }
  );

  const user = db.prepare("SELECT id, username, display_name, role FROM users WHERE id = ?").get(userId);
  return {
    token,
    expiresAt: expires.toISOString(),
    user,
    balance: wallet.getBalance(userId),
    currency: config.currency
  };
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const db = getDb();
    const session = db
      .prepare("SELECT * FROM sessions WHERE id = ? AND token_jti = ?")
      .get(payload.sid, payload.jti);
    if (!session || session.revoked_at) {
      return res.status(401).json({ error: "Session revoked" });
    }
    if (new Date(session.expires_at).getTime() < Date.now()) {
      return res.status(401).json({ error: "Session expired" });
    }
    req.user = { id: payload.sub, sessionId: payload.sid };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function logout(req) {
  const db = getDb();
  db.prepare("UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?").run(req.user.sessionId);
}

function me(userId) {
  const db = getDb();
  const user = db
    .prepare("SELECT id, username, display_name, role, created_at FROM users WHERE id = ?")
    .get(userId);
  return {
    user,
    balance: wallet.getBalance(userId),
    currency: config.currency
  };
}

module.exports = {
  register,
  login,
  logout,
  me,
  authMiddleware,
  createSession
};
