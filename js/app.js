/**
 * Vault Run — app
 * Prefers authoritative server resolve; falls back to local engine if API offline.
 */
window.VR = window.VR || {};

VR.App = (function () {
  const state = {
    balance: 0,
    betIndex: 0,
    bet: 1,
    lastWin: 0,
    busy: false,
    muted: false,
    autoLeft: 0,
    inBonus: false,
    bonusId: null,
    bonusName: "",
    bonusSpinsLeft: 0,
    bonusWin: 0,
    bonusMask: null,
    grid: null,
    serverMode: false
  };

  function betValue() {
    return VR.CONFIG.betSteps[state.betIndex];
  }

  async function init() {
    state.balance = VR.CONFIG.startBalance;
    state.betIndex = VR.CONFIG.defaultBetIndex;
    state.bet = betValue();

    VR.UI.setStatus("Loading…");
    try {
      await VR.Assets.init();
    } catch (e) {
      console.warn(e);
    }
    document.body.classList.add("art-ready");
    // Connect game server if available
    const up = await VR.API.probe();
    if (up) {
      try {
        const session = await VR.API.ensureAuth();
        state.serverMode = true;
        if (session && session.balance != null) state.balance = session.balance;
        else {
          const st = await VR.API.state();
          state.balance = st.balance;
          applyPlayerState(st.playerState);
        }
        VR.UI.toast("Connected to game server");
      } catch (e) {
        console.warn("Auth failed, local mode", e);
        state.serverMode = false;
      }
    }

    const boot = VR.Engine.playSpin({ bet: state.bet });
    state.grid = boot.grid;

    VR.Render.init(document.getElementById("reels"));
    VR.Render.setRows(VR.CONFIG.rowsBase);
    VR.Render.drawFrame(state.grid);

    VR.UI.bind(state, {
      spin: () => requestSpin(),
      bet: (dir) => changeBet(dir),
      toggleAuto: () => VR.UI.openPanel("auto"),
      setAuto: (n) => {
        if (state.busy || state.inBonus) return;
        state.autoLeft = n;
        VR.UI.refresh(state);
        requestSpin();
      },
      buy: (id) => buyFeature(id),
      enhanced: (id) => enhancedSpin(id),
      mute: () => {
        state.muted = !state.muted;
        VR.Audio.setMuted(state.muted);
        VR.UI.refresh(state);
      }
    });

    VR.UI.refresh(state);
    VR.UI.setStatus(
      state.serverMode
        ? "Online · server-resolved spins"
        : "Offline demo · local RNG (start server for full backend)"
    );

    setInterval(() => {
      VR.UI.toast("Play responsibly — check your session time.");
    }, VR.CONFIG.sessionReminderMs);

    document.body.addEventListener("pointerdown", () => VR.Audio.unlock(), { once: true });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  function applyPlayerState(ps) {
    if (!ps) return;
    state.inBonus = !!ps.inBonus;
    state.bonusId = ps.bonusId;
    state.bonusName = ps.bonusName || "";
    state.bonusSpinsLeft = ps.bonusSpinsLeft || 0;
    state.bonusWin = ps.bonusWin || 0;
  }

  function changeBet(dir) {
    if (state.busy || state.inBonus) return;
    state.betIndex = Math.max(0, Math.min(VR.CONFIG.betSteps.length - 1, state.betIndex + dir));
    state.bet = betValue();
    VR.Audio.click();
    VR.UI.refresh(state);
  }

  function canAfford(cost) {
    return state.balance >= cost - 0.001;
  }

  async function requestSpin(opts) {
    opts = opts || {};
    if (state.busy) return;
    VR.Audio.unlock();

    const cost = opts.cost != null ? opts.cost : state.bet;
    if (!state.inBonus && !canAfford(cost)) {
      VR.UI.toast("Insufficient balance");
      state.autoLeft = 0;
      VR.UI.refresh(state);
      return;
    }

    state.busy = true;
    VR.UI.refresh(state);

    try {
      VR.UI.setStatus(state.inBonus ? "Bonus spin…" : "Spinning…");
      VR.Audio.spin();

      let result;
      let bonusJustEnded = null;

      if (state.serverMode) {
        const payload = {
          bet: state.bet,
          forceBonus: opts.forceBonus || null,
          enhanced: opts.enhanced || null,
          mystery: !!opts.mystery,
          featureSpin: !!opts.featureSpin,
          forceRows: opts.forceRows || null
        };
        const res = await VR.API.spin(payload);
        state.balance = res.balance;
        result = res.result;
        applyPlayerState(res.playerState);
        bonusJustEnded = res.bonusJustEnded;
        // Server already applied wallet; don't double-credit locally
        await playTimeline(result, { skipWallet: true, bonusJustEnded });
      } else {
        // Local fallback (demo only)
        if (!state.inBonus) {
          state.balance = +(state.balance - cost).toFixed(2);
          state.lastWin = 0;
        }
        VR.UI.refresh(state);
        result = VR.Engine.playSpin({
          bet: state.bet,
          inBonus: state.inBonus,
          bonusId: state.bonusId,
          forceBonus: opts.forceBonus || null,
          enhanced: opts.enhanced || null,
          mystery: !!opts.mystery,
          featureSpin: !!opts.featureSpin,
          forceRows: opts.forceRows || null,
          persistMask: state.inBonus ? state.bonusMask : null
        });
        if (state.inBonus && result.mask) state.bonusMask = VR.Engine.cloneMask(result.mask);
        await playTimeline(result, { skipWallet: false });
      }
    } catch (err) {
      console.error(err);
      VR.UI.toast(err.message || "Spin failed");
      if (err.status === 401) state.serverMode = false;
    } finally {
      state.busy = false;
      VR.UI.refresh(state);
      VR.UI.setStatus(state.inBonus ? state.bonusName + " active" : "Ready");
    }

    if (state.autoLeft > 0 && !state.inBonus) {
      state.autoLeft -= 1;
      VR.UI.refresh(state);
      await wait(520);
      requestSpin();
    } else if (state.inBonus && state.bonusSpinsLeft > 0) {
      await wait(560);
      requestSpin();
    }
  }

  async function playTimeline(result, flags) {
    flags = flags || {};
    const first = result.steps[0] && result.steps[0].grid;
    if (first) {
      await VR.Render.animateSpin(state.grid, first, 2100);
      state.grid = first;
      VR.Render.drawFrame(state.grid);
    }
    VR.Audio.stop();
    await wait(180);

    for (let i = 1; i < result.steps.length; i++) {
      const step = result.steps[i];
      state.grid = step.grid;

      if (step.type === "lock") {
        const pos = (step.locked || []).map((k) => {
          const parts = String(k).split(",");
          return { c: +parts[0], r: +parts[1] };
        });
        VR.Render.setFlash(pos);
        VR.UI.setStatus("LOCK " + step.premium + " · Respinning…");
        VR.Audio.cascade();
        await VR.Render.playWinAnim(state.grid, pos, 900);
        await wait(220);
        VR.Render.clearFlash();
        VR.Render.drawFrame(state.grid);
      } else if (step.type === "respin") {
        await VR.Render.animateSpin(state.grid, step.grid, 1200, { respin: true });
        state.grid = step.grid;
        VR.Render.drawFrame(state.grid);
        VR.UI.setStatus("Respin ×" + (result.respinCount || ""));
        await wait(160);
      } else if (step.type === "arrow") {
        VR.UI.setStatus("Board unlocked");
        VR.Audio.heat();
        VR.Render.drawFrame(state.grid);
        await wait(520);
      } else if (step.type === "barrel") {
        VR.Render.setGold(step.wildPositions || []);
        VR.UI.setStatus("Wild barrels · Global " + step.globalMult + "×");
        VR.Audio.collect();
        await VR.Render.playWinAnim(state.grid, step.wildPositions || [], 1100);
        await wait(280);
        VR.Render.setGold([]);
        VR.Render.drawFrame(state.grid);
      } else if (step.type === "pay") {
        if (step.wins && step.wins.length) {
          const pos = [];
          step.wins.forEach((w) => pos.push(...w.positions));
          VR.Render.setFlash(pos);
          VR.Audio.win();
          VR.UI.setStatus(
            (step.globalMult > 1 ? step.globalMult + "× · " : "") +
              "Win " +
              VR.UI.money(step.total)
          );
          await VR.Render.playWinAnim(state.grid, pos, 1000);
          await wait(240);
          VR.Render.clearFlash();
          VR.Render.drawFrame(state.grid);
        } else {
          VR.Render.drawFrame(state.grid);
        }
      } else {
        VR.Render.drawFrame(state.grid);
      }
    }

    state.grid = result.grid;
    VR.Render.drawFrame(state.grid);
    state.lastWin = result.totalWin;

    if (!flags.skipWallet) {
      // Local mode wallet + bonus transitions
      if (state.inBonus) {
        state.bonusWin = +(state.bonusWin + result.totalWin).toFixed(2);
        state.bonusSpinsLeft -= 1;
        if (result.retriggerSpins > 0) {
          state.bonusSpinsLeft += result.retriggerSpins;
          VR.UI.toast("+" + result.retriggerSpins + " free spins");
        }
      }
      if (result.totalWin > 0) {
        state.balance = +(state.balance + result.totalWin).toFixed(2);
      }
      if (!state.inBonus && result.trigger) {
        await enterBonusLocal(result.trigger);
      } else if (state.inBonus && state.bonusSpinsLeft <= 0) {
        await exitBonusLocal();
      } else if (!state.inBonus) {
        VR.Render.setRows(VR.CONFIG.rowsBase);
        VR.Render.drawFrame(state.grid);
      }
    } else {
      // Server mode: state already applied; handle UI for bonus enter/exit
      if (result.trigger && state.inBonus && state.bonusSpinsLeft === result.trigger.spins) {
        VR.Render.setRows(result.trigger.rows);
        VR.Audio.bonus();
        await VR.UI.showBonusIntro(result.trigger);
        VR.Render.drawFrame(state.grid);
      }
      if (flags.bonusJustEnded) {
        VR.Render.setRows(VR.CONFIG.rowsBase);
        VR.Render.drawFrame(state.grid);
        await VR.UI.showWinBanner(flags.bonusJustEnded.total, state.bet, "bonus");
        VR.UI.toast(flags.bonusJustEnded.name + " total " + VR.UI.money(flags.bonusJustEnded.total));
      } else if (!state.inBonus) {
        VR.Render.setRows(VR.CONFIG.rowsBase);
        VR.Render.drawFrame(state.grid);
      }
      if (result.retriggerSpins > 0) {
        VR.UI.toast("+" + result.retriggerSpins + " free spins");
      }
    }

    if (result.totalWin > 0) {
      const mult = result.totalWin / state.bet;
      if (mult >= 8 || result.hitCap) {
        VR.Audio.bigWin();
        await VR.UI.showWinBanner(result.totalWin, state.bet, state.inBonus ? "bonus" : "base");
      }
    }
  }

  async function enterBonusLocal(bonus) {
    state.inBonus = true;
    state.bonusId = bonus.id;
    state.bonusName = bonus.name;
    state.bonusSpinsLeft = bonus.spins;
    state.bonusWin = 0;
    state.autoLeft = 0;
    state.bonusMask = VR.Engine.createBlockMask(bonus.rows, VR.CONFIG.rowsBase);
    VR.Render.setRows(bonus.rows);
    VR.Audio.bonus();
    await VR.UI.showBonusIntro(bonus);
    VR.UI.refresh(state);
  }

  async function exitBonusLocal() {
    const payout = state.bonusWin;
    const name = state.bonusName;
    state.inBonus = false;
    state.bonusId = null;
    state.bonusName = "";
    state.bonusSpinsLeft = 0;
    state.bonusMask = null;
    VR.Render.setRows(VR.CONFIG.rowsBase);
    VR.UI.refresh(state);
    if (payout > 0) {
      await VR.UI.showWinBanner(payout, state.bet, "bonus");
      VR.UI.toast(name + " total " + VR.UI.money(payout));
    }
  }

  function buyFeature(id) {
    if (state.busy || state.inBonus) return;
    let cost = 0;
    let opts = {};
    if (id === "kingpin") {
      cost = state.bet * VR.CONFIG.bonuses.kingpin.buyCost;
      opts = { cost, forceBonus: "kingpin" };
    } else if (id === "moneyrun") {
      cost = state.bet * VR.CONFIG.bonuses.moneyrun.buyCost;
      opts = { cost, forceBonus: "moneyrun" };
    } else if (id === "mystery") {
      cost = state.bet * VR.CONFIG.mystery.buyCost;
      opts = { cost, mystery: true };
    } else return;
    if (!canAfford(cost)) {
      VR.UI.toast("Insufficient balance");
      return;
    }
    requestSpin(opts);
  }

  function enhancedSpin(id) {
    if (state.busy || state.inBonus) return;
    if (id === "feature") {
      const cost = state.bet * VR.CONFIG.enhanced.feature.costMult;
      if (!canAfford(cost)) {
        VR.UI.toast("Insufficient balance");
        return;
      }
      requestSpin({ cost, featureSpin: true });
      return;
    }
    const cfg = VR.CONFIG.enhanced[id];
    if (!cfg) return;
    const cost = state.bet * cfg.costMult;
    if (!canAfford(cost)) {
      VR.UI.toast("Insufficient balance");
      return;
    }
    requestSpin({ cost, enhanced: id });
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  return { init, state };
})();

document.addEventListener("DOMContentLoaded", () => VR.App.init());
