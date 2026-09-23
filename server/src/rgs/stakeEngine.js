/**
 * Stake Engine / RGS adapter (stub → real Stake paths)
 *
 * Stake Engine expects:
 *   POST /wallet/authenticate  { sessionID }
 *   POST /wallet/play          { sessionID, amount, mode }
 *   POST /wallet/end-round     { sessionID }
 *
 * Current demo still uses local wallet when RGS_MODE=local.
 * When integrating Stake Engine, replace bet/win with play book responses
 * (math already in static books — do not live-RNG resolve on the operator).
 */
const config = require("../config");

async function stakeRequest(path, body) {
  if (!config.stake.baseUrl) {
    throw Object.assign(new Error("STAKE_ENGINE_BASE_URL not configured"), { status: 503 });
  }
  const url = config.stake.baseUrl.replace(/\/$/, "") + path;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": config.stake.apiKey || "",
      "x-game-id": config.stake.gameId,
      "x-operator-id": config.stake.operatorId
    },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(data.message || data.error || "RGS error " + res.status);
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

async function getRemoteBalance(playerToken) {
  return stakeRequest("/wallet/balance", {
    playerToken,
    gameId: config.stake.gameId,
    currency: config.currency
  });
}

async function remoteBet({ playerToken, amount, roundId, transactionId }) {
  return stakeRequest("/wallet/bet", {
    playerToken,
    gameId: config.stake.gameId,
    amount,
    currency: config.currency,
    roundId,
    transactionId
  });
}

async function remoteWin({ playerToken, amount, roundId, transactionId }) {
  return stakeRequest("/wallet/win", {
    playerToken,
    gameId: config.stake.gameId,
    amount,
    currency: config.currency,
    roundId,
    transactionId
  });
}

async function remoteRefund({ playerToken, amount, roundId, transactionId }) {
  return stakeRequest("/wallet/refund", {
    playerToken,
    gameId: config.stake.gameId,
    amount,
    currency: config.currency,
    roundId,
    transactionId
  });
}

function isRemote() {
  return config.rgsMode === "stake";
}

module.exports = {
  isRemote,
  getRemoteBalance,
  remoteBet,
  remoteWin,
  remoteRefund,
  stakeRequest
};
