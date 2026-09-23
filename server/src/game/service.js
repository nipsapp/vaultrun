const crypto = require("crypto");
const { getDb } = require("../db/client");
const config = require("../config");
const wallet = require("../wallet/service");
const { createRoundRng } = require("../rng");
const { playSpinWithRng, CONFIG } = require("./engineBridge");
const rgs = require("../rgs/stakeEngine");

const BET_STEPS = new Set(CONFIG.betSteps);

function getPlayerState(userId) {
  // Circuit Breach resolves FS in one book — no cross-spin bonus mask
  return {
    inBonus: false,
    bonusId: null,
    bonusName: null,
    bonusSpinsLeft: 0,
    bonusWin: 0
  };
}

function savePlayerState(userId, state) {
  const db = getDb();
  db.prepare(
    `INSERT INTO player_game_state (user_id, game_code, state_json, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, game_code) DO UPDATE SET
       state_json = excluded.state_json,
       updated_at = datetime('now')`
  ).run(userId, config.gameCode, JSON.stringify(state || getPlayerState(userId)));
}

function resolveMode(body) {
  let mode = body.mode || "base";
  if (body.forceBonus && CONFIG.modes[body.forceBonus]) mode = body.forceBonus;
  // legacy aliases remapped away from Goblin names
  if (mode === "kingpin") mode = "bonus";
  if (mode === "moneyrun") mode = "bonus_max";
  if (mode === "mobjob" || mode === "payday") mode = "super";
  if (!CONFIG.modes[mode]) mode = "base";
  return mode;
}

function validateBet(bet, costMult) {
  const cost = wallet.money(bet * (costMult || 1));
  if (!BET_STEPS.has(Number(bet))) {
    const e = new Error("Bet not in allowed betSteps");
    e.status = 400;
    throw e;
  }
  if (bet < config.minBet || bet > config.maxBet) {
    const e = new Error(`Bet must be between ${config.minBet} and ${config.maxBet}`);
    e.status = 400;
    throw e;
  }
  if (!(cost > 0)) {
    const e = new Error("Invalid stake");
    e.status = 400;
    throw e;
  }
  return cost;
}

async function resolveSpin(userId, body = {}, meta = {}) {
  const bet = wallet.money(body.bet);
  const mode = resolveMode(body);
  const modeCfg = CONFIG.modes[mode] || CONFIG.modes.base;
  const costMult = modeCfg.cost || 1;
  const cost = validateBet(bet, costMult);
  const roundId = crypto.randomUUID();
  const betTxId = crypto.randomUUID();
  const winTxId = crypto.randomUUID();

  const roundRng = await createRoundRng();
  let result;
  try {
    result = playSpinWithRng({ bet, mode }, roundRng);
  } catch (err) {
    throw err;
  }
  const rngMeta = roundRng.finalize();

  let balance;
  if (rgs.isRemote()) {
    await rgs.remoteBet({
      playerToken: meta.playerToken || userId,
      amount: cost,
      roundId,
      transactionId: betTxId
    });
    balance = (await rgs.getRemoteBalance(meta.playerToken || userId)).balance;
  } else {
    balance = wallet.debit(userId, cost, {
      type: "bet",
      refType: "spin",
      refId: roundId,
      meta: { mode, costMult }
    });
  }

  const win = wallet.money(result.totalWin);
  if (win > 0) {
    if (rgs.isRemote()) {
      const remote = await rgs.remoteWin({
        playerToken: meta.playerToken || userId,
        amount: win,
        roundId,
        transactionId: winTxId
      });
      balance = remote.balance != null ? remote.balance : balance;
    } else {
      balance = wallet.credit(userId, win, {
        type: "win",
        refType: "spin",
        refId: roundId
      });
    }
  }

  savePlayerState(userId, getPlayerState(userId));

  const db = getDb();
  db.prepare(
    `INSERT INTO game_rounds
      (id, user_id, game_code, bet, win, currency, status, request_json, result_json, rng_seed, rng_proof, rgs_round_id, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, 'resolved', ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    roundId,
    userId,
    config.gameCode,
    cost,
    win,
    config.currency,
    JSON.stringify({ bet, mode }),
    JSON.stringify({
      steps: result.steps,
      grid: result.grid,
      totalWin: win,
      scatterCount: result.scatterCount,
      trigger: result.trigger,
      fsTotal: result.fsTotal,
      hitCap: result.hitCap,
      rows: result.rows,
      mode: result.mode,
      mathId: CONFIG.mathId
    }),
    rngMeta.seed,
    rngMeta.proof,
    rgs.isRemote() ? roundId : null
  );

  return {
    roundId,
    bet,
    cost,
    win,
    balance: wallet.money(balance),
    currency: config.currency,
    rng: { mode: rngMeta.mode, seed: rngMeta.seed, proof: rngMeta.proof },
    result: {
      steps: result.steps,
      grid: result.grid,
      totalWin: win,
      scatterCount: result.scatterCount,
      trigger: result.trigger,
      fsTotal: result.fsTotal,
      hitCap: result.hitCap,
      rows: result.rows,
      mode: result.mode
    },
    playerState: getPlayerState(userId),
    bonusJustEnded: null
  };
}

function getConfigPublic() {
  return {
    gameCode: config.gameCode,
    title: CONFIG.title,
    version: CONFIG.version,
    mathId: CONFIG.mathId,
    reels: CONFIG.reels,
    rowsBase: CONFIG.rowsBase,
    maxWinCap: CONFIG.maxWinCap,
    betSteps: CONFIG.betSteps,
    modes: CONFIG.modes,
    feature: CONFIG.feature,
    currency: config.currency,
    rgsMode: config.rgsMode,
    rngMode: config.rngMode,
    certificationNote:
      "Circuit Breach math is original (tumble + collect). Stake Engine publish requires static books + authenticate/play/end-round."
  };
}

module.exports = {
  resolveSpin,
  getPlayerState,
  getConfigPublic,
  CONFIG
};
