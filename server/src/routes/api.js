const express = require("express");
const auth = require("../auth/service");
const wallet = require("../wallet/service");
const game = require("../game/service");
const config = require("../config");

const router = express.Router();

router.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "vaultrun-server",
    rgsMode: config.rgsMode,
    rngMode: config.rngMode,
    time: new Date().toISOString()
  });
});

router.get("/game/config", (_req, res) => {
  res.json(game.getConfigPublic());
});

router.post("/auth/register", (req, res) => {
  try {
    const out = auth.register({
      username: req.body.username,
      password: req.body.password,
      displayName: req.body.displayName
    });
    res.status(201).json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post("/auth/login", (req, res) => {
  try {
    const out = auth.login(
      { username: req.body.username, password: req.body.password },
      { ip: req.ip, userAgent: req.headers["user-agent"] }
    );
    res.json(out);
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post("/auth/logout", auth.authMiddleware, (req, res) => {
  auth.logout(req);
  res.json({ ok: true });
});

router.get("/auth/me", auth.authMiddleware, (req, res) => {
  res.json(auth.me(req.user.id));
});

router.get("/wallet", auth.authMiddleware, (req, res) => {
  res.json({
    balance: wallet.getBalance(req.user.id),
    currency: config.currency,
    ledger: wallet.listLedger(req.user.id, 30)
  });
});

router.get("/game/state", auth.authMiddleware, (req, res) => {
  res.json({
    balance: wallet.getBalance(req.user.id),
    currency: config.currency,
    playerState: game.getPlayerState(req.user.id)
  });
});

/**
 * POST /api/v1/game/spin
 * Body: { bet, forceBonus?, enhanced?, mystery?, featureSpin? }
 * Authoritative resolve — client must animate returned steps only.
 */
router.post("/game/spin", auth.authMiddleware, async (req, res) => {
  try {
    const out = await game.resolveSpin(req.user.id, req.body || {}, {
      playerToken: req.headers["x-player-token"] || req.user.id
    });
    res.json(out);
  } catch (e) {
    console.error("[spin]", e);
    res.status(e.status || 500).json({ error: e.message, payload: e.payload || undefined });
  }
});

/**
 * RGS-facing helpers (operator sandbox)
 */
router.post("/rgs/ping", (_req, res) => {
  res.json({
    ok: true,
    mode: config.rgsMode,
    gameId: config.stake.gameId,
    note: "Configure STAKE_ENGINE_* env vars for live operator wallet bridging"
  });
});

module.exports = router;
