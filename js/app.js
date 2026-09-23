/**
 * Vault Run — app (Circuit Breach)
 * Prefers authoritative server resolve; falls back to local engine if API offline.
 * Free spins resolve in one spin result (Stake-ready book style).
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
    grid: null,
    serverMode: false,
    breachMult: 1,
    gauge: 0
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

    const up = await VR.API.probe();
    if (up) {
      try {
        const session = await VR.API.ensureAuth();
        state.serverMode = true;
        if (session && session.balance != null) state.balance = session.balance;
        else {
          const st = await VR.API.state();
          state.balance = st.balance;
        }
        VR.UI.toast("Connected to game server");
      } catch (e) {
        console.warn("Auth failed, local mode", e);
        state.serverMode = false;
      }
    }

    state.grid = VR.Engine.createEmptyGrid();
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
        if (state.busy) return;
        state.autoLeft = n;
        VR.UI.refresh(state);
        requestSpin();
      },
      buy: (id) => buyFeature(id),
      enhanced: () => {},
      mute: () => {
        state.muted = !state.muted;
        VR.Audio.setMuted(state.muted);
        VR.UI.refresh(state);
      }
    });

    VR.UI.refresh(state);
    VR.UI.setStatus(
      state.serverMode
        ? "Online · Circuit Breach · server RNG"
        : "Offline demo · Circuit Breach local RNG"
    );

    setInterval(() => {
      VR.UI.toast("Play responsibly — check your session time.");
    }, VR.CONFIG.sessionReminderMs);

    document.body.addEventListener("pointerdown", () => VR.Audio.unlock(), { once: true });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    }
  }

  function changeBet(dir) {
    if (state.busy) return;
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

    const mode = opts.mode || "base";
    const modeCfg = VR.CONFIG.modes[mode] || VR.CONFIG.modes.base;
    const cost = opts.cost != null ? opts.cost : state.bet * (modeCfg.cost || 1);

    if (!canAfford(cost)) {
      VR.UI.toast("Insufficient balance");
      state.autoLeft = 0;
      VR.UI.refresh(state);
      return;
    }

    state.busy = true;
    state.inBonus = false;
    VR.UI.refresh(state);

    try {
      VR.UI.setStatus("Spinning…");
      VR.Audio.spin();

      let result;

      if (state.serverMode) {
        const res = await VR.API.spin({
          bet: state.bet,
          mode,
          forceBonus: mode !== "base" ? mode : null
        });
        state.balance = res.balance;
        result = res.result;
        await playTimeline(result, { skipWallet: true });
      } else {
        state.balance = +(state.balance - cost).toFixed(2);
        state.lastWin = 0;
        VR.UI.refresh(state);
        result = VR.Engine.playSpin({ bet: state.bet, mode });
        await playTimeline(result, { skipWallet: false });
      }
    } catch (err) {
      console.error(err);
      VR.UI.toast(err.message || "Spin failed");
      if (err.status === 401) state.serverMode = false;
    } finally {
      state.busy = false;
      state.inBonus = false;
      VR.UI.refresh(state);
      VR.UI.setStatus("Ready");
    }

    if (state.autoLeft > 0) {
      state.autoLeft -= 1;
      VR.UI.refresh(state);
      await wait(520);
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
    await wait(160);

    for (let i = 1; i < result.steps.length; i++) {
      const step = result.steps[i];
      if (step.grid) state.grid = step.grid;

      if (step.type === "tumbleWin") {
        const pos = [];
        (step.wins || []).forEach((w) => pos.push(...(w.positions || [])));
        VR.Render.setFlash(pos);
        VR.UI.setStatus(
          (step.breachMult > 1 ? step.breachMult + "× Breach · " : "") +
            "Win " +
            VR.UI.money(step.total)
        );
        VR.Audio.win();
        await VR.Render.playWinAnim(state.grid, pos, 900);
        await wait(180);
        VR.Render.clearFlash();
        VR.Render.drawFrame(state.grid);
      } else if (step.type === "tumble") {
        await VR.Render.animateSpin(state.grid, step.grid, 900, { respin: true });
        state.grid = step.grid;
        VR.Render.drawFrame(state.grid);
        VR.Audio.cascade();
        await wait(100);
      } else if (step.type === "breach") {
        state.breachMult = step.breachMult || 1;
        VR.UI.setStatus("Breach Mult " + state.breachMult + "×");
        VR.Audio.heat();
        VR.Render.drawFrame(state.grid);
        await wait(280);
      } else if (step.type === "collect") {
        const pos = (step.keys || []).concat(step.chips || []);
        VR.Render.setFlash(pos);
        VR.UI.setStatus("Keys collect · " + VR.UI.money(step.amount));
        VR.Audio.collect();
        await VR.Render.playWinAnim(state.grid, pos, 1000);
        await wait(200);
        VR.Render.clearFlash();
        VR.Render.drawFrame(state.grid);
      } else if (step.type === "fsStart") {
        state.inBonus = true;
        state.bonusName = (step.trigger && step.trigger.name) || "Vault Breach";
        state.bonusSpinsLeft = (step.trigger && step.trigger.spins) || 0;
        state.gauge = step.gauge || 1;
        VR.UI.refresh(state);
        VR.Audio.bonus();
        await VR.UI.showBonusIntro(step.trigger || { name: state.bonusName, spins: state.bonusSpinsLeft });
      } else if (step.type === "fsSpin") {
        state.bonusSpinsLeft = step.spinsLeft;
        state.gauge = step.gauge || state.gauge;
        VR.UI.refresh(state);
        VR.UI.setStatus((step.gaugeName || "FS") + " · " + step.spinsLeft + " left");
        await VR.Render.animateSpin(state.grid, step.grid, 1400);
        state.grid = step.grid;
        VR.Render.drawFrame(state.grid);
        await wait(120);
      } else if (step.type === "fsGauge") {
        state.gauge = step.gauge;
        VR.UI.toast("Vault Gauge → " + (step.gaugeName || step.gauge));
        VR.Audio.heat();
        await wait(400);
      } else if (step.type === "fsRetrigger") {
        state.bonusSpinsLeft = step.spinsLeft;
        VR.UI.toast("+" + step.add + " free spins");
        VR.UI.refresh(state);
        await wait(350);
      } else if (step.type === "fsEnd") {
        state.inBonus = false;
        VR.UI.refresh(state);
        if (step.total > 0) {
          await VR.UI.showWinBanner(step.total, state.bet, "bonus");
        }
      } else if (step.type === "pay") {
        VR.Render.drawFrame(state.grid);
      } else {
        VR.Render.drawFrame(state.grid);
      }
    }

    state.grid = result.grid;
    VR.Render.drawFrame(state.grid);
    state.lastWin = result.totalWin;
    state.inBonus = false;

    if (!flags.skipWallet && result.totalWin > 0) {
      state.balance = +(state.balance + result.totalWin).toFixed(2);
    }

    if (result.totalWin > 0) {
      const mult = result.totalWin / state.bet;
      if (mult >= 8 || result.hitCap) {
        VR.Audio.bigWin();
        await VR.UI.showWinBanner(result.totalWin, state.bet, result.fsTotal > 0 ? "bonus" : "base");
      }
    }
  }

  function buyFeature(id) {
    if (state.busy) return;
    const mode = VR.CONFIG.modes[id];
    if (!mode || id === "base") return;
    const cost = state.bet * mode.cost;
    if (!canAfford(cost)) {
      VR.UI.toast("Insufficient balance");
      return;
    }
    requestSpin({ mode: id, cost });
  }

  function wait(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  return { init, state };
})();

document.addEventListener("DOMContentLoaded", () => VR.App.init());
