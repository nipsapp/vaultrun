/**
 * Stake Engine RGS client (authenticate / play / end-round).
 * Activated when URL has sessionID + (rgs_url | api).
 */
window.VR = window.VR || {};

VR.StakeRGS = (function () {
  const params = new URLSearchParams(location.search);
  const sessionID = params.get("sessionID") || params.get("sessionId") || "";
  const rgsUrl = (params.get("rgs_url") || params.get("rgsUrl") || params.get("api") || "").replace(/\/$/, "");
  const currency = params.get("currency") || "USD";
  const lang = params.get("lang") || "en";
  const social = params.get("social") === "true";

  let balanceAmount = 0; // integer micro-units from RGS
  let betLevels = [];
  let minBet = 0;
  let maxBet = 0;
  let stepBet = 1;
  let activeRound = null;

  function enabled() {
    return !!(sessionID && rgsUrl);
  }

  async function post(path, body) {
    const res = await fetch(rgsUrl + path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || data.error || "RGS " + res.status);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  /** Display dollars from RGS integer amount (1e6 = $1). */
  function toDisplay(amountInt) {
    return (Number(amountInt) || 0) / 1e6;
  }

  function toRgsAmount(display) {
    return Math.round(Number(display) * 1e6);
  }

  async function authenticate() {
    const data = await post("/wallet/authenticate", { sessionID });
    const bal = data.balance || {};
    balanceAmount = bal.amount != null ? bal.amount : 0;
    minBet = data.minBet || bal.minBet || 100000;
    maxBet = data.maxBet || bal.maxBet || 1000000000;
    stepBet = data.stepBet || bal.stepBet || 10000;
    betLevels = data.betLevels || bal.betLevels || [];
    activeRound = data.round || null;
    return {
      balance: toDisplay(balanceAmount),
      minBet: toDisplay(minBet),
      maxBet: toDisplay(maxBet),
      stepBet: toDisplay(stepBet),
      betLevels: betLevels.map(toDisplay),
      currency: bal.currency || currency,
      lang,
      social,
      round: activeRound
    };
  }

  /**
   * Convert Stake book events back into Vault Run animation steps.
   */
  function bookToResult(book, betDisplay) {
    const events = (book && book.events) || [];
    const steps = events
      .filter((e) => e.type === "vrStep" || e.stepType)
      .map((e) => {
        const step = {
          type: e.stepType || e.type,
          label: e.label || e.stepType || e.type
        };
        if (e.board) {
          step.grid = e.board.map((col) =>
            (col || []).map((sym) => {
              if (!sym) return null;
              const cell = { id: sym.name || sym.id };
              if (sym.multiplier) cell.mult = sym.multiplier;
              if (sym.prize != null) cell.chip = sym.prize;
              return cell;
            })
          );
        }
        if (e.win != null) step.win = e.win;
        if (e.total != null) step.total = e.total;
        if (e.amount != null) step.amount = e.amount;
        if (e.breachMult != null) step.breachMult = e.breachMult;
        if (e.wins) step.wins = e.wins;
        if (e.removed) step.removed = e.removed;
        if (e.keys) step.keys = e.keys;
        if (e.chips) step.chips = e.chips;
        if (e.chipSum != null) step.chipSum = e.chipSum;
        if (e.spinsLeft != null) step.spinsLeft = e.spinsLeft;
        if (e.gauge != null) step.gauge = e.gauge;
        if (e.gaugeName) step.gaugeName = e.gaugeName;
        if (e.add != null) step.add = e.add;
        if (e.trigger) step.trigger = e.trigger;
        return step;
      });

    const pm = (book && book.payoutMultiplier) || 0;
    const totalWin = (pm / 100) * betDisplay;
    const lastGrid =
      (steps.length && steps[steps.length - 1].grid) ||
      null;

    return {
      steps,
      grid: lastGrid,
      totalWin,
      scatterCount: 0,
      trigger: null,
      fsTotal: 0,
      hitCap: pm / 100 >= (VR.CONFIG.maxWinCap || 20000),
      mode: book.mode || "base",
      costMult: 1,
      payoutMultiplier: pm
    };
  }

  async function play({ amountDisplay, mode }) {
    const amount = toRgsAmount(amountDisplay);
    const data = await post("/wallet/play", {
      sessionID,
      amount,
      mode: mode || "BASE"
    });
    if (data.balance && data.balance.amount != null) balanceAmount = data.balance.amount;
    activeRound = data.round || data;
    const book = (data.round && (data.round.book || data.round.state)) || data.book || data;
    const result = bookToResult(book, amountDisplay);
    const winAmount = data.round && data.round.payout != null
      ? toDisplay(data.round.payout)
      : result.totalWin;
    result.totalWin = winAmount;
    return {
      balance: toDisplay(balanceAmount),
      win: winAmount,
      result,
      raw: data
    };
  }

  async function endRound() {
    const data = await post("/wallet/end-round", { sessionID });
    if (data.balance && data.balance.amount != null) balanceAmount = data.balance.amount;
    activeRound = null;
    return { balance: toDisplay(balanceAmount), raw: data };
  }

  function isSocial() {
    return social || (VR.StakeRGS && VR.StakeRGS.params && VR.StakeRGS.params().social);
  }

  /** Stake.us social mode — swap restricted casino phrases. */
  function applySocialCopy() {
    if (!isSocial()) return;
    const map = {
      BALANCE: "COINS",
      BET: "PLAY",
      BUY: "PLAY",
      WIN: "WIN",
      SPIN: "PLAY",
      AUTO: "AUTO"
    };
    document.querySelectorAll(".meter .label").forEach((el) => {
      const t = (el.textContent || "").trim();
      if (map[t]) el.textContent = map[t];
    });
    const buy = document.getElementById("btn-buy");
    if (buy) buy.textContent = "FEATURE";
    const spin = document.getElementById("btn-spin");
    if (spin && !spin.getAttribute("data-social")) {
      spin.setAttribute("data-social", "1");
      spin.setAttribute("aria-label", "Play");
    }
    document.querySelectorAll(".buy-row small, .panel-note, .rules-note, .info-body, .rules-lead").forEach((el) => {
      el.innerHTML = el.innerHTML
        .replace(/\bbet\b/gi, "play")
        .replace(/\bbets\b/gi, "plays")
        .replace(/\bbuy\b/gi, "play")
        .replace(/\bpurchase\b/gi, "play")
        .replace(/\bcash\b/gi, "coins")
        .replace(/\bmoney\b/gi, "coins");
    });
    document.querySelectorAll(".cost-tag").forEach((el) => {
      el.textContent = (el.textContent || "").replace(/\bbet\b/gi, "play");
    });
  }

  return {
    enabled,
    authenticate,
    play,
    endRound,
    toDisplay,
    toRgsAmount,
    getBalance: () => toDisplay(balanceAmount),
    getBetLevels: () => betLevels.map(toDisplay),
    params: () => ({ sessionID, rgsUrl, currency, lang, social }),
    isSocial,
    applySocialCopy
  };
})();
