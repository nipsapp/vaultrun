const crypto = require("crypto");
const { getDb } = require("../db/client");
const config = require("../config");
const wallet = require("../wallet/service");
const { createRoundRng } = require("../rng");
const { playSpinWithRng, CONFIG, Engine } = require("./engineBridge");
const rgs = require("../rgs/stakeEngine");

const BET_STEPS = new Set(CONFIG.betSteps);

function getPlayerState(userId) {
  const db = getDb();
  const row = db
    .prepare("SELECT state_json FROM player_game_state WHERE user_id = ? AND game_code = ?")
    .get(userId, config.gameCode);
  if (!row) {
    return {
      inBonus: false,
      bonusId: null,
      bonusName: null,
      bonusSpinsLeft: 0,
      bonusWin: 0,
      bonusMask: null
    };
  }
  return JSON.parse(row.state_json);
}

function savePlayerState(userId, state) {
  const db = getDb();
  db.prepare(
    `INSERT INTO player_game_state (user_id, game_code, state_json, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, game_code) DO UPDATE SET
       state_json = excluded.state_json,
       updated_at = datetime('now')`
  ).run(userId, config.gameCode, JSON.stringify(state));
}

function validateBet(bet, opts = {}) {
  const cost = wallet.money(bet * (opts.costMult || 1));
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
  if (!(cost > 0) && (opts.costMult || 1) > 0) {
    const e = new Error("Invalid stake");
    e.status = 400;
    throw e;
  }
  return cost;
}

async function resolveSpin(userId, body = {}, meta = {}) {
  const bet = wallet.money(body.bet);
  const player = getPlayerState(userId);
  const opts = {
    forceBonus: body.forceBonus || null,
    enhanced: body.enhanced || null,
    mystery: !!body.mystery,
    featureSpin: !!body.featureSpin,
    forceRows: body.forceRows || null
  };

  let costMult = 1;
  if (opts.forceBonus === "kingpin") costMult = CONFIG.bonuses.kingpin.buyCost;
  else if (opts.forceBonus === "moneyrun") costMult = CONFIG.bonuses.moneyrun.buyCost;
  else if (opts.mystery) costMult = CONFIG.mystery.buyCost;
  else if (opts.enhanced === "heat") costMult = CONFIG.enhanced.heat.costMult;
  else if (opts.enhanced === "overload") costMult = CONFIG.enhanced.overload.costMult;
  else if (opts.featureSpin) costMult = CONFIG.enhanced.feature.costMult;

  const cost = player.inBonus ? 0 : validateBet(bet, { costMult });
  const roundId = crypto.randomUUID();
  const betTxId = crypto.randomUUID();
  const winTxId = crypto.randomUUID();

  const roundRng = await createRoundRng();
  const spinOpts = {
    bet,
    inBonus: player.inBonus,
    bonusId: player.bonusId,
    forceBonus: opts.forceBonus,
    enhanced: opts.enhanced,
    mystery: opts.mystery,
    featureSpin: opts.featureSpin,
    forceRows: opts.forceRows,
    persistMask: player.inBonus ? player.bonusMask : null
  };

  let result;
  try {
    result = playSpinWithRng(spinOpts, roundRng);
  } catch (err) {
    throw err;
  }
  const rngMeta = roundRng.finalize();

  // Wallet / RGS
  let balance;
  if (!player.inBonus && cost > 0) {
    if (rgs.isRemote()) {
      await rgs.remoteBet({
        playerToken: meta.playerToken || userId,
        amount: cost,
        roundId,
        transactionId: betTxId
      });
      // mirror locally for ledger consistency if desired — skip local debit in remote mode
      balance = (await rgs.getRemoteBalance(meta.playerToken || userId)).balance;
    } else {
      balance = wallet.debit(userId, cost, {
        type: "bet",
        refType: "spin",
        refId: roundId,
        meta: { costMult, opts }
      });
    }
  } else {
    balance = rgs.isRemote()
      ? (await rgs.getRemoteBalance(meta.playerToken || userId)).balance
      : wallet.getBalance(userId);
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

  // Update bonus state (authoritative on server)
  const next = { ...player };
  let bonusJustEnded = null;
  if (player.inBonus) {
    const newBonusWin = wallet.money((player.bonusWin || 0) + win);
    next.bonusWin = newBonusWin;
    next.bonusSpinsLeft = (player.bonusSpinsLeft || 0) - 1;
    if (result.retriggerSpins > 0) next.bonusSpinsLeft += result.retriggerSpins;
    if (result.mask) next.bonusMask = result.mask;
    if (next.bonusSpinsLeft <= 0) {
      bonusJustEnded = { name: player.bonusName, total: newBonusWin };
      next.inBonus = false;
      next.bonusId = null;
      next.bonusName = null;
      next.bonusSpinsLeft = 0;
      next.bonusMask = null;
      next.bonusWin = 0;
    }
  } else if (result.trigger) {
    const b = result.trigger;
    next.inBonus = true;
    next.bonusId = b.id;
    next.bonusName = b.name;
    next.bonusSpinsLeft = b.spins;
    next.bonusWin = 0;
    next.bonusMask = Engine.createBlockMask(b.rows, CONFIG.rowsBase);
  }

  savePlayerState(userId, next);

  const db = getDb();
  db.prepare(
    `INSERT INTO game_rounds
      (id, user_id, game_code, bet, win, currency, status, request_json, result_json, rng_seed, rng_proof, rgs_round_id, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, 'resolved', ?, ?, ?, ?, ?, datetime('now'))`
  ).run(
    roundId,
    userId,
    config.gameCode,
    player.inBonus ? 0 : cost,
    win,
    config.currency,
    JSON.stringify({ bet, opts, inBonus: player.inBonus }),
    JSON.stringify({
      steps: result.steps,
      grid: result.grid,
      totalWin: win,
      globalMult: result.globalMult,
      goldWilds: result.goldWilds,
      scatterCount: result.scatterCount,
      trigger: result.trigger,
      retriggerSpins: result.retriggerSpins,
      respinCount: result.respinCount,
      hitCap: result.hitCap,
      rows: result.rows
    }),
    rngMeta.seed,
    rngMeta.proof,
    rgs.isRemote() ? roundId : null
  );

  return {
    roundId,
    bet,
    cost: player.inBonus ? 0 : cost,
    win,
    balance: wallet.money(balance),
    currency: config.currency,
    rng: { mode: rngMeta.mode, seed: rngMeta.seed, proof: rngMeta.proof },
    result: {
      steps: result.steps,
      grid: result.grid,
      totalWin: win,
      globalMult: result.globalMult,
      goldWilds: result.goldWilds,
      scatterCount: result.scatterCount,
      scatterPositions: result.scatterPositions,
      trigger: result.trigger,
      retriggerSpins: result.retriggerSpins,
      premium: result.premium,
      respinCount: result.respinCount,
      hitCap: result.hitCap,
      rows: result.rows
    },
    playerState: {
      inBonus: next.inBonus,
      bonusId: next.bonusId,
      bonusName: next.bonusName,
      bonusSpinsLeft: next.bonusSpinsLeft,
      bonusWin: next.bonusWin
    },
    bonusJustEnded
  };
}

function getConfigPublic() {
  return {
    gameCode: config.gameCode,
    title: CONFIG.title,
    version: CONFIG.version,
    reels: CONFIG.reels,
    rowsBase: CONFIG.rowsBase,
    maxWinCap: CONFIG.maxWinCap,
    betSteps: CONFIG.betSteps,
    bonuses: CONFIG.bonuses,
    mystery: { name: CONFIG.mystery.name, buyCost: CONFIG.mystery.buyCost },
    enhanced: CONFIG.enhanced,
    currency: config.currency,
    rgsMode: config.rgsMode,
    rngMode: config.rngMode,
    certificationNote:
      "Server is RNG-agnostic. Lab certification requires your approved RNG + jurisdiction process."
  };
}

module.exports = {
  resolveSpin,
  getPlayerState,
  getConfigPublic,
  CONFIG
};
