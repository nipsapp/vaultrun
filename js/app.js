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
    ready: false,
    muted: false,
    autoLeft: 0,
    inBonus: false,
    bonusId: null,
    bonusName: "",
    bonusSpinsLeft: 0,
    bonusWin: 0,
    grid: null,
    serverMode: false,
    stakeMode: false,
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
      await VR.Assets.init(progress => VR.Loading?.progress(progress * 85, "Loading the vault…"));
    } catch (e) {
      console.warn(e);
    }
    document.body.classList.add("art-ready");
    VR.Loading?.progress(88, "Preparing your session…");

    try {
      if (VR.StakeRGS && VR.StakeRGS.enabled()) {
        const session = await VR.StakeRGS.authenticate();
        state.serverMode = true;
        state.stakeMode = true;
        if (session.balance != null) state.balance = session.balance;
        if (session.betLevels && session.betLevels.length) {
          VR.CONFIG.betSteps = session.betLevels;
          state.betIndex = Math.min(state.betIndex, VR.CONFIG.betSteps.length - 1);
          state.bet = betValue();
        }
        VR.UI.toast("Connected to Stake RGS");
      } else {
        const up = await Promise.race([
          VR.API.probe(),
          new Promise((r) => setTimeout(() => r(false), 1500))
        ]);
        if (up) {
          const session = await Promise.race([
            VR.API.ensureAuth(),
            new Promise((_, rej) => setTimeout(() => rej(new Error("auth timeout")), 4000))
          ]);
          state.serverMode = true;
          if (session && session.balance != null) {
            state.balance = session.balance;
          } else {
            try {
              const st = await Promise.race([
                VR.API.state(),
                new Promise((_, rej) => setTimeout(() => rej(new Error("state timeout")), 3000))
              ]);
              state.balance = st.balance;
            } catch (_) {
              /* keep startBalance */
            }
          }
          VR.UI.toast("Connected to game server");
        }
      }
    } catch (e) {
      console.warn("Auth failed, local mode", e);
      state.serverMode = false;
      state.stakeMode = false;
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
      toggleAuto: () => {
        if (state.autoLeft > 0) { state.autoLeft = 0; VR.UI.refresh(state); }
        else if (!state.busy) VR.UI.openPanel("auto");
      },
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
      state.stakeMode
        ? "Stake RGS · Circuit Breach"
        : state.serverMode
          ? "Online · Circuit Breach · server RNG"
          : "Offline demo · Circuit Breach local RNG"
    );

    setInterval(() => {
      VR.UI.toast("Play responsibly — check your session time.");
    }, VR.CONFIG.sessionReminderMs);

    document.body.addEventListener("pointerdown", () => VR.Audio.unlock(), { once: true });

    if (VR.Loading) await VR.Loading.finish();
    state.ready = true;
    if (VR.StakeRGS && VR.StakeRGS.applySocialCopy) VR.StakeRGS.applySocialCopy();

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

  // One owner holds the input lock through playback, settlement and autoplay gaps.
  async function requestSpin(opts) {
    if (state.busy || !state.ready) return;
    state.busy = true;
    VR.UI.refresh(state);
    try {
      do {
        await playRound(opts);
        if (state.autoLeft > 0) state.autoLeft--;
        VR.UI.refresh(state);
        if (state.autoLeft <= 0) break;
        await wait(650);
        if (state.autoLeft <= 0) break;
        opts = undefined;
      } while (state.autoLeft > 0);
    } finally {
      state.busy = false;
      VR.UI.refresh(state);
      VR.UI.setStatus("Ready");
    }
  }

  async function playRound(opts) {
    opts = opts || {};
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
    state.breachMult = 1;
    state.lastWin = 0;
    VR.UI.refresh(state);

    try {
      VR.UI.setStatus("Spinning…");
      VR.Audio.spin();

      let resultPromise;
      if (state.stakeMode) {
        resultPromise = VR.StakeRGS.play({ amountDisplay: state.bet, mode }).then((res) => {
          state.balance = res.balance;
          return res.result;
        });
      } else if (state.serverMode) {
        resultPromise = VR.API.spin({ bet: state.bet, mode,
          forceBonus: mode !== "base" ? mode : null
        }).then(res => {
          state.balance = res.balance;
          return res.result;
        });
      } else {
        state.balance = +(state.balance - cost).toFixed(2);
        VR.UI.refresh(state);
        resultPromise = Promise.resolve(VR.Engine.playSpin({ bet: state.bet, mode }));
      }
      await VR.Render.animateSpin(state.grid, resultPromise.then(result => (result.steps[0] && result.steps[0].grid) || result.grid), 2100,
        { onReelStopped: c => VR.Audio.reelStop(c) });
      const result = await resultPromise;
      state.grid = (result.steps[0] && result.steps[0].grid) || result.grid;
      await playTimeline(result, { skipWallet: state.serverMode || state.stakeMode });
      if (state.stakeMode && result.totalWin > 0) {
        const ended = await VR.StakeRGS.endRound();
        if (ended && ended.balance != null) state.balance = ended.balance;
      }
    } catch (err) {
      state.autoLeft = 0;
      console.error(err);
      VR.UI.toast(err.message || "Spin failed");
      if (err.status === 401) {
        state.serverMode = false;
        state.stakeMode = false;
      }
    } finally {
      VR.Audio.cancelSpin();
      VR.Render.clearFlash();
      VR.Render.clearAnim();
      state.inBonus = false;
      VR.UI.refresh(state);
      VR.UI.setStatus("Ready");
    }

  }

  async function playTimeline(result, flags) {
    flags = flags || {};
    VR.Audio.stop();
    await wait(160);

    for (let i = 1; i < result.steps.length; i++) {
      const step = result.steps[i];
      // tumbleWin.grid is already exploded in existing server books.
      // Keep the displayed board until its winners have been presented.
      if (step.grid && !["tumbleWin", "tumble", "fsSpin", "fsStart"].includes(step.type)) state.grid = step.grid;

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
        await VR.Render.playWinAnim(state.grid, pos, 1000, step.wins);
        await VR.Render.animateRemove(state.grid, step.removed || pos);
        state.grid = step.grid;
        VR.Render.clearFlash();
        VR.Render.drawFrame(state.grid);
      } else if (step.type === "tumble") {
        VR.Audio.cascade();
        await VR.Render.animateTumble(state.grid, step.grid);
        state.grid = step.grid;
        VR.Render.drawFrame(state.grid);
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
        VR.Audio.spin();
        await VR.Render.animateSpin(state.grid, step.grid, 1400, { onReelStopped: c => VR.Audio.reelStop(c) });
        VR.Audio.stop();
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

    VR.UI.refresh(state);
    if (result.totalWin > 0) {
      const mult = result.totalWin / state.bet;
      if ((mult >= 8 || result.hitCap) && !result.fsTotal) {
        VR.Audio.bigWin();
        await VR.UI.showWinBanner(result.totalWin, state.bet, result.fsTotal > 0 ? "bonus" : "base");
      }
    }
    // A complete settled board remains readable before another spin is allowed.
    await wait(result.totalWin > 0 ? 600 : 280);
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
