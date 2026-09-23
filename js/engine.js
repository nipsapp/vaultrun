/**
 * Vault Run engine — Circuit Breach (original tumble + collect + FS)
 * RGS_HOOK: serialize playSpin → Stake book events for certification
 */
window.VR = window.VR || {};

VR.Engine = (function () {
  let rng = Math.random;

  function C() {
    return VR.CONFIG;
  }

  function mulberry32(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seed(n) {
    rng = typeof n === "number" ? mulberry32(n >>> 0) : Math.random;
  }

  function pickWeighted(map) {
    let total = 0;
    for (const k in map) total += map[k];
    let r = rng() * total;
    for (const k in map) {
      r -= map[k];
      if (r <= 0) return k;
    }
    return Object.keys(map)[0];
  }

  function pickFromLists(vals, weights) {
    let total = 0;
    for (let i = 0; i < weights.length; i++) total += weights[i];
    let r = rng() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) return vals[i];
    }
    return vals[0];
  }

  function money(n) {
    return Math.round(n * 100) / 100;
  }

  function cloneGrid(grid) {
    return grid.map((col) => col.map((cell) => (cell ? { ...cell } : null)));
  }

  function emptyGrid(rows) {
    const g = [];
    for (let c = 0; c < C().reels; c++) {
      g[c] = [];
      for (let r = 0; r < rows; r++) g[c][r] = null;
    }
    return g;
  }

  function makeCell(id, extra) {
    const cell = { id };
    if (extra) Object.assign(cell, extra);
    return cell;
  }

  function makeChip(chipBias) {
    let vals = C().chipValues.slice();
    let w = C().chipWeights.slice();
    if (chipBias > 0) {
      for (let i = 0; i < w.length; i++) {
        w[i] = w[i] * (1 + chipBias * (i / (w.length - 1)));
      }
    }
    return makeCell("CHIP", { chip: pickFromLists(vals, w) });
  }

  function makeWild() {
    return makeCell("WILD", {
      mult: pickFromLists(C().wildMults, C().wildMultWeights)
    });
  }

  function fillCell(weights, chipBias) {
    const id = pickWeighted(weights);
    if (id === "CHIP") return makeChip(chipBias || 0);
    if (id === "WILD") return makeWild();
    return makeCell(id);
  }

  function fillBoard(weights, rows, chipBias) {
    const g = emptyGrid(rows);
    for (let c = 0; c < C().reels; c++) {
      for (let r = 0; r < rows; r++) {
        g[c][r] = fillCell(weights, chipBias);
      }
    }
    return g;
  }

  function forceScatters(grid, n) {
    const rows = grid[0].length;
    const slots = [];
    for (let c = 0; c < C().reels; c++) {
      for (let r = 0; r < rows; r++) slots.push({ c, r });
    }
    for (let i = slots.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = slots[i];
      slots[i] = slots[j];
      slots[j] = t;
    }
    for (let i = 0; i < Math.min(n, slots.length); i++) {
      const { c, r } = slots[i];
      grid[c][r] = makeCell("SCAT");
    }
  }

  function countScat(grid) {
    let n = 0;
    const pos = [];
    for (let c = 0; c < grid.length; c++) {
      for (let r = 0; r < grid[c].length; r++) {
        if (grid[c][r] && grid[c][r].id === "SCAT") {
          n++;
          pos.push({ c, r });
        }
      }
    }
    return { n, pos };
  }

  function isPaySym(id) {
    return !!(C().pays[id]);
  }

  /**
   * L→R ways. Wild substitutes for pay symbols only.
   * KEY / CHIP / SCAT do not pay ways.
   */
  function evalWays(grid, bet, breachMult) {
    const rows = grid[0].length;
    const wins = [];
    let total = 0;
    const payIds = Object.keys(C().pays);

    for (const sym of payIds) {
      const counts = [];
      const usedWildMults = [];
      const positions = [];
      let length = 0;

      for (let c = 0; c < C().reels; c++) {
        const hits = [];
        let reelWildMults = [];
        for (let r = 0; r < rows; r++) {
          const cell = grid[c][r];
          if (!cell) continue;
          if (cell.id === sym) hits.push({ c, r });
          else if (cell.id === "WILD") {
            hits.push({ c, r });
            reelWildMults.push(cell.mult || 1);
          }
        }
        if (!hits.length) break;
        // Prefer real symbol presence for ways adjacency
        length++;
        counts.push(hits.length);
        positions.push(...hits);
        if (reelWildMults.length) usedWildMults.push(...reelWildMults);
      }

      if (length < 3) continue;
      const table = C().pays[sym];
      const pay = table[length] || 0;
      if (!(pay > 0)) continue;

      let ways = 1;
      for (let i = 0; i < length; i++) ways *= counts[i];

      let wildMult = 1;
      for (const m of usedWildMults) wildMult *= m;
      if (wildMult > C().wildWinMultCap) wildMult = C().wildWinMultCap;

      const amount = money(bet * pay * ways * wildMult * breachMult);
      if (amount <= 0) continue;
      wins.push({
        sym,
        length,
        ways,
        wildMult,
        breachMult,
        amount,
        positions: positions.filter((p) => {
          const cell = grid[p.c][p.r];
          return cell && (cell.id === sym || cell.id === "WILD");
        })
      });
      total = money(total + amount);
    }

    return { wins, total };
  }

  function explodeWinners(grid, wins) {
    const kill = new Set();
    for (const w of wins) {
      for (const p of w.positions) kill.add(p.c + "," + p.r);
    }
    for (const key of kill) {
      const [c, r] = key.split(",").map(Number);
      grid[c][r] = null;
    }
    return [...kill].map((k) => {
      const [c, r] = k.split(",").map(Number);
      return { c, r };
    });
  }

  function tumbleDown(grid, weights, chipBias) {
    const rows = grid[0].length;
    const filled = [];
    for (let c = 0; c < C().reels; c++) {
      const stack = [];
      for (let r = 0; r < rows; r++) {
        if (grid[c][r]) stack.push(grid[c][r]);
      }
      const missing = rows - stack.length;
      const newCells = [];
      for (let i = 0; i < missing; i++) newCells.push(fillCell(weights, chipBias));
      const col = newCells.concat(stack);
      for (let r = 0; r < rows; r++) {
        const prev = grid[c][r];
        grid[c][r] = col[r];
        if (!prev && col[r]) filled.push({ c, r });
      }
    }
    return filled;
  }

  function collectKeys(grid, bet) {
    const keys = [];
    const chips = [];
    for (let c = 0; c < grid.length; c++) {
      for (let r = 0; r < grid[c].length; r++) {
        const cell = grid[c][r];
        if (!cell) continue;
        if (cell.id === "KEY") keys.push({ c, r });
        if (cell.id === "CHIP") chips.push({ c, r, value: cell.chip || 1 });
      }
    }
    if (!keys.length || !chips.length) {
      return { amount: 0, keys, chips, chipSum: 0 };
    }
    let chipSum = 0;
    for (const ch of chips) chipSum += ch.value;
    chipSum = money(chipSum);
    const amount = money(bet * chipSum * keys.length);
    return { amount, keys, chips, chipSum };
  }

  function featureFromScats(n) {
    const map = C().feature.byScat;
    const key = Math.min(5, Math.max(3, n));
    const cfg = map[key] || map[3];
    return {
      id: C().feature.id,
      name: C().feature.name,
      spins: cfg.spins,
      gauge: cfg.gauge,
      scatters: n
    };
  }

  function resolveCascade(grid, bet, opts) {
    const steps = [];
    const weights = opts.weights;
    const chipBias = opts.chipBias || 0;
    let breachIndex = opts.startBreachIndex || 0;
    let total = 0;
    let cascades = 0;

    while (cascades < C().maxCascades) {
      const breachMult = C().breachLadder[Math.min(breachIndex, C().breachLadder.length - 1)];
      const evaled = evalWays(grid, bet, breachMult);
      if (!evaled.wins.length) break;

      const removed = explodeWinners(grid, evaled.wins);
      steps.push({
        type: "tumbleWin",
        grid: cloneGrid(grid),
        wins: evaled.wins,
        total: evaled.total,
        breachMult,
        removed,
        label: "ways " + breachMult + "x"
      });
      total = money(total + evaled.total);

      if (breachIndex < C().breachLadder.length - 1) breachIndex++;
      steps.push({
        type: "breach",
        grid: cloneGrid(grid),
        breachMult: C().breachLadder[Math.min(breachIndex, C().breachLadder.length - 1)],
        label: "breach"
      });

      tumbleDown(grid, weights, chipBias);
      steps.push({
        type: "tumble",
        grid: cloneGrid(grid),
        label: "tumble"
      });
      cascades++;
    }

    // Key collect after cascades settle
    const col = collectKeys(grid, bet);
    if (col.amount > 0) {
      if (breachIndex < C().breachLadder.length - 1) {
        breachIndex = Math.min(C().breachLadder.length - 1, breachIndex + 1);
      }
      steps.push({
        type: "collect",
        grid: cloneGrid(grid),
        keys: col.keys,
        chips: col.chips,
        chipSum: col.chipSum,
        amount: col.amount,
        breachMult: C().breachLadder[breachIndex],
        label: "collect"
      });
      total = money(total + col.amount);
    }

    // Key upgrade for FS gauge (2+ keys in one collect)
    const keyUpgrade = col.keys.length >= 2;

    return {
      steps,
      total,
      breachIndex,
      keyUpgrade,
      grid: cloneGrid(grid)
    };
  }

  function placeStickyWilds(grid, count) {
    const rows = grid[0].length;
    const slots = [];
    for (let c = 0; c < C().reels; c++) {
      for (let r = 0; r < rows; r++) {
        if (grid[c][r] && grid[c][r].id !== "SCAT") slots.push({ c, r });
      }
    }
    for (let i = slots.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const t = slots[i];
      slots[i] = slots[j];
      slots[j] = t;
    }
    for (let i = 0; i < Math.min(count, slots.length); i++) {
      const { c, r } = slots[i];
      grid[c][r] = makeWild();
      grid[c][r].sticky = true;
    }
  }

  function maybeStickyWilds(grid, chance) {
    const rows = grid[0].length;
    for (let c = 0; c < C().reels; c++) {
      for (let r = 0; r < rows; r++) {
        if (grid[c][r] && grid[c][r].id === "WILD" && rng() < chance) {
          grid[c][r].sticky = true;
        }
      }
    }
  }

  function playFreeSpins(bet, trigger, modeCfg) {
    const steps = [];
    let total = 0;
    let gauge = trigger.gauge || 1;
    let spinsLeft = trigger.spins;
    let spun = 0;

    steps.push({
      type: "fsStart",
      grid: emptyGrid(C().rowsBase),
      trigger,
      gauge,
      label: "Vault Breach"
    });

    while (spinsLeft > 0 && spun < C().maxFsTotal) {
      spinsLeft--;
      spun++;
      const gCfg = C().feature.gauge[gauge] || C().feature.gauge[1];
      const weights = C().fsWeights;
      const grid = fillBoard(weights, C().rowsBase, gCfg.chipBias);

      if (spun === 1 && modeCfg && modeCfg.stickyOnFirst) {
        placeStickyWilds(grid, modeCfg.stickyOnFirst);
      } else {
        maybeStickyWilds(grid, gCfg.stickyWildChance);
      }

      steps.push({
        type: "fsSpin",
        grid: cloneGrid(grid),
        spinsLeft,
        gauge,
        gaugeName: gCfg.name,
        label: "FS " + spun
      });

      const cascade = resolveCascade(grid, bet, {
        weights,
        chipBias: gCfg.chipBias,
        startBreachIndex: gCfg.startBreachIndex
      });
      for (const s of cascade.steps) steps.push(s);
      total = money(total + cascade.total);

      if (cascade.keyUpgrade && gauge < C().feature.maxGauge) {
        gauge++;
        steps.push({
          type: "fsGauge",
          grid: cascade.grid,
          gauge,
          gaugeName: (C().feature.gauge[gauge] || {}).name,
          label: "gauge " + gauge
        });
      }

      const sc = countScat(cascade.grid);
      if (sc.n >= 3) {
        const add = C().feature.retriggerSpins;
        spinsLeft = Math.min(C().maxFsTotal - spun, spinsLeft + add);
        steps.push({
          type: "fsRetrigger",
          grid: cascade.grid,
          add,
          spinsLeft,
          label: "+" + add + " FS"
        });
      }
    }

    steps.push({
      type: "fsEnd",
      grid: steps[steps.length - 1].grid,
      total,
      label: "FS end"
    });

    return { steps, total, gauge };
  }

  function playSpin(opts) {
    opts = opts || {};
    const bet = opts.bet || 1;
    const rows = C().rowsBase;
    const modeId = opts.mode || (opts.forceBonus ? opts.forceBonus : "base");
    const modeCfg = C().modes[modeId] || C().modes.base;

    // Buy / force modes skip natural base and go to FS
    const buyMode = modeId !== "base" && modeCfg.forceScat;

    let steps = [];
    let totalWin = 0;
    let grid;
    let trigger = null;
    let scatterCount = 0;
    let hitCap = false;

    if (!buyMode) {
      grid = fillBoard(C().baseWeights, rows, 0);
      steps.push({ type: "spin", grid: cloneGrid(grid), label: "spin" });

      const cascade = resolveCascade(grid, bet, {
        weights: C().baseWeights,
        chipBias: 0,
        startBreachIndex: 0
      });
      for (const s of cascade.steps) steps.push(s);
      totalWin = money(totalWin + cascade.total);
      grid = cascade.grid;

      const sc = countScat(grid);
      scatterCount = sc.n;
      if (sc.n >= 3) {
        trigger = featureFromScats(sc.n);
      }
    } else {
      // Forced feature buy
      const scatN = modeCfg.forceScat || 3;
      trigger = featureFromScats(scatN);
      trigger.gauge = modeCfg.startGauge || trigger.gauge;
      trigger.spins = (C().feature.byScat[scatN] || C().feature.byScat[3]).spins;
      scatterCount = scatN;
      grid = fillBoard(C().baseWeights, rows, 0);
      forceScatters(grid, scatN);
      steps.push({ type: "spin", grid: cloneGrid(grid), label: "buy" });
    }

    let fsTotal = 0;
    if (trigger) {
      const fs = playFreeSpins(bet, trigger, buyMode ? modeCfg : null);
      for (const s of fs.steps) steps.push(s);
      fsTotal = fs.total;
      totalWin = money(totalWin + fsTotal);
      grid = fs.steps[fs.steps.length - 1].grid || grid;
    }

    if (totalWin > bet * C().maxWinCap) {
      totalWin = money(bet * C().maxWinCap);
      hitCap = true;
    }

    steps.push({
      type: "pay",
      grid: cloneGrid(grid),
      total: totalWin,
      label: "pay"
    });

    return {
      steps,
      grid: cloneGrid(grid),
      totalWin,
      scatterCount,
      trigger,
      fsTotal,
      hitCap,
      rows,
      mode: modeId,
      costMult: modeCfg.cost || 1,
      // legacy fields cleared so Goblin UI paths don't fire
      premium: null,
      respinCount: 0,
      globalMult: 1,
      goldWilds: false,
      retriggerSpins: 0,
      mask: null
    };
  }

  function createEmptyGrid() {
    return emptyGrid(C().rowsBase);
  }

  return {
    seed,
    playSpin,
    cloneGrid,
    createEmptyGrid,
    // stubs kept so old callers don't crash
    createBlockMask: function () {
      return null;
    },
    cloneMask: function () {
      return null;
    }
  };
})();
