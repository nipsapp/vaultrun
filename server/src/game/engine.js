/**
 * Vault Run engine — Goblin Rush–accurate lock / respin / barrel wild
 * RGS_HOOK: swap playSpin for remote resolve before certification
 */
window.VR = window.VR || {};

VR.Engine = (function () {
  const C = () => VR.CONFIG;
  let rng = Math.random;

  function mulberry32(a) {
    return function () {
      let t = (a += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seed(n) {
    rng = typeof n === "number" ? mulberry32(n >>> 0) : Math.random;
  }

  function pickWeighted(map) {
    let total = 0;
    const entries = Object.entries(map);
    for (const [, w] of entries) total += w;
    if (total <= 0) return entries[0][0];
    let r = rng() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r <= 0) return k;
    }
    return entries[entries.length - 1][0];
  }

  function pickWildMult(minMult) {
    const vals = C().wildMults;
    const weights = C().wildMultWeights.slice();
    for (let i = 0; i < vals.length; i++) {
      if (vals[i] < (minMult || 2)) weights[i] = 0;
    }
    let total = 0;
    for (const w of weights) total += w;
    if (total <= 0) return minMult || 2;
    let r = rng() * total;
    for (let i = 0; i < vals.length; i++) {
      r -= weights[i];
      if (r <= 0) return vals[i];
    }
    return vals[vals.length - 1];
  }

  function emptyGrid(rows) {
    const g = [];
    for (let c = 0; c < C().reels; c++) {
      g[c] = [];
      for (let r = 0; r < rows; r++) g[c][r] = null;
    }
    return g;
  }

  function cloneGrid(g) {
    if (!g) return null;
    return g.map((col) => col.map((cell) => (cell ? Object.assign({}, cell) : null)));
  }

  function rowsOf(grid) {
    return grid && grid[0] ? grid[0].length : C().rowsBase;
  }

  function createBlockMask(rows, unlockedRows) {
    const mask = emptyGrid(rows); // null = playable, BLOCK cell template
    const playFrom = Math.max(0, rows - unlockedRows);
    for (let c = 0; c < C().reels; c++) {
      for (let r = 0; r < rows; r++) {
        if (r < playFrom) {
          mask[c][r] = { id: "BLOCK", arrow: rng() < 0.5 ? "H" : "V" };
        }
      }
    }
    return mask;
  }

  function cloneMask(mask) {
    return cloneGrid(mask);
  }

  function isBlocked(mask, c, r) {
    return !!(mask && mask[c] && mask[c][r] && mask[c][r].id === "BLOCK");
  }

  function fillBoard(weights, rows, mask, opts) {
    opts = opts || {};
    const g = emptyGrid(rows);
    for (let c = 0; c < C().reels; c++) {
      for (let r = 0; r < rows; r++) {
        if (isBlocked(mask, c, r)) {
          g[c][r] = Object.assign({}, mask[c][r]);
        } else {
          g[c][r] = { id: pickWeighted(weights) };
        }
      }
    }
    if (opts.guaranteeWilds) {
      placeGuaranteedWilds(g, mask, opts.guaranteeWilds);
    }
    return g;
  }

  function placeGuaranteedWilds(grid, mask, n) {
    const spots = [];
    for (let c = 0; c < C().reels; c++) {
      for (let r = 0; r < rowsOf(grid); r++) {
        if (isBlocked(mask, c, r)) continue;
        if (grid[c][r] && grid[c][r].id !== "SCAT") spots.push({ c, r });
      }
    }
    shuffle(spots);
    for (let i = 0; i < Math.min(n, spots.length); i++) {
      grid[spots[i].c][spots[i].r] = { id: "WILD" };
    }
  }

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }

  function forceScatters(grid, mask, minCount) {
    let n = countScatters(grid).n;
    const spots = [];
    for (let c = 0; c < C().reels; c++) {
      for (let r = 0; r < rowsOf(grid); r++) {
        if (isBlocked(mask, c, r)) continue;
        if (grid[c][r] && grid[c][r].id !== "BLOCK") spots.push({ c, r });
      }
    }
    shuffle(spots);
    let i = 0;
    while (n < minCount && i < spots.length) {
      const p = spots[i++];
      if (grid[p.c][p.r].id === "SCAT") continue;
      grid[p.c][p.r] = { id: "SCAT" };
      n++;
    }
    return grid;
  }

  function stripScatters(grid) {
    for (let c = 0; c < C().reels; c++) {
      for (let r = 0; r < rowsOf(grid); r++) {
        if (grid[c][r] && grid[c][r].id === "SCAT") {
          grid[c][r] = { id: pickWeighted({ L1: 1, L2: 1, L3: 1, L4: 1, L5: 1 }) };
        }
      }
    }
    return grid;
  }

  function countScatters(grid) {
    let n = 0;
    const positions = [];
    for (let c = 0; c < C().reels; c++) {
      for (let r = 0; r < rowsOf(grid); r++) {
        if (grid[c][r] && grid[c][r].id === "SCAT") {
          n++;
          positions.push({ c, r });
        }
      }
    }
    return { n, positions };
  }

  function reelHasExact(grid, col, sym) {
    for (let r = 0; r < rowsOf(grid); r++) {
      const cell = grid[col][r];
      if (cell && cell.id === sym) return true;
    }
    return false;
  }

  function reelHasSymOrWild(grid, col, sym) {
    for (let r = 0; r < rowsOf(grid); r++) {
      const cell = grid[col][r];
      if (!cell || cell.id === "BLOCK") continue;
      if (cell.id === sym || cell.id === "WILD") return true;
    }
    return false;
  }

  function countSymOrWildOnReel(grid, col, sym) {
    let n = 0;
    for (let r = 0; r < rowsOf(grid); r++) {
      const cell = grid[col][r];
      if (!cell || cell.id === "BLOCK") continue;
      if (cell.id === sym || cell.id === "WILD") n++;
    }
    return n;
  }

  /** Premium must appear for real on reels 1–3 zone; wilds may fill gaps. */
  function detectPremiumTrigger(grid) {
    for (const sym of C().premiums) {
      const exact =
        reelHasExact(grid, 0, sym) || reelHasExact(grid, 1, sym) || reelHasExact(grid, 2, sym);
      if (!exact) continue;
      if (
        reelHasSymOrWild(grid, 0, sym) &&
        reelHasSymOrWild(grid, 1, sym) &&
        reelHasSymOrWild(grid, 2, sym)
      ) {
        return sym;
      }
    }
    return null;
  }

  /**
   * Ways pay. Wild substitutes, but a symbol win requires at least one real
   * instance of that symbol (pure-wild boards do not pay every paytable).
   */
  function evaluateWays(grid, bet, globalMult) {
    const pays = C().pays;
    const wins = [];
    let total = 0;
    const mult = globalMult || 1;

    for (const sym of Object.keys(pays)) {
      let ways = 1;
      let len = 0;
      let realCount = 0;
      const positions = [];

      for (let c = 0; c < C().reels; c++) {
        let n = 0;
        let hasReal = false;
        for (let r = 0; r < rowsOf(grid); r++) {
          const cell = grid[c][r];
          if (!cell || cell.id === "BLOCK") continue;
          if (cell.id === sym) {
            n++;
            hasReal = true;
            positions.push({ c, r });
          } else if (cell.id === "WILD") {
            n++;
            positions.push({ c, r });
          }
        }
        if (n === 0) break;
        ways *= n;
        len = c + 1;
        if (hasReal) realCount += 1;
      }

      if (len >= 3 && realCount > 0) {
        const payArr = pays[sym];
        const pay = payArr[Math.min(len, payArr.length - 1)] || 0;
        if (pay > 0) {
          const amount = +(pay * bet * ways * mult).toFixed(2);
          // dedupe positions
          const seen = new Set();
          const pos = [];
          for (const p of positions) {
            if (p.c >= len) continue;
            const k = p.c + "," + p.r;
            if (seen.has(k)) continue;
            seen.add(k);
            pos.push(p);
          }
          wins.push({ type: "ways", symbol: sym, length: len, ways, pay, amount, positions: pos });
          total += amount;
        }
      }
    }
    return { wins, total: +total.toFixed(2) };
  }

  /** Symbol covers all 6 reels (wild may help); used for barrel gold. */
  function hasFullBoardSymbol(grid) {
    for (const sym of Object.keys(C().pays)) {
      let ok = true;
      let real = false;
      for (let c = 0; c < C().reels; c++) {
        if (!reelHasSymOrWild(grid, c, sym)) {
          ok = false;
          break;
        }
        if (reelHasExact(grid, c, sym)) real = true;
      }
      if (ok && real) return sym;
    }
    return null;
  }

  function anyWild(grid) {
    for (let c = 0; c < C().reels; c++) {
      for (let r = 0; r < rowsOf(grid); r++) {
        if (grid[c][r] && grid[c][r].id === "WILD") return true;
      }
    }
    return false;
  }

  function collectLocked(grid, premium) {
    const locked = [];
    for (let c = 0; c < C().reels; c++) {
      for (let r = 0; r < rowsOf(grid); r++) {
        const cell = grid[c][r];
        if (!cell || cell.id === "BLOCK") continue;
        if (cell.id === premium || cell.id === "WILD") {
          locked.push({ c, r, cell: Object.assign({}, cell, { locked: true }) });
        }
      }
    }
    return locked;
  }

  /** Drop locked symbols to bottom of each reel; clear other playable cells for respin. */
  function prepareRespin(grid, mask, premium) {
    const rows = rowsOf(grid);
    const next = emptyGrid(rows);

    for (let c = 0; c < C().reels; c++) {
      // preserve blocks
      for (let r = 0; r < rows; r++) {
        if (isBlocked(mask, c, r)) {
          next[c][r] = Object.assign({}, mask[c][r]);
        }
      }
      // collect locked from bottom to top
      const keep = [];
      for (let r = rows - 1; r >= 0; r--) {
        if (isBlocked(mask, c, r)) continue;
        const cell = grid[c][r];
        if (!cell || cell.id === "BLOCK") continue;
        if (cell.id === premium || cell.id === "WILD") {
          keep.push(Object.assign({}, cell, { locked: true }));
        }
      }
      // place locked stack on bottom playable cells
      let ki = 0;
      for (let r = rows - 1; r >= 0 && ki < keep.length; r--) {
        if (isBlocked(mask, c, r)) continue;
        next[c][r] = keep[ki++];
      }
    }
    return next;
  }

  function refillPlayable(grid, mask, weights) {
    const rows = rowsOf(grid);
    const filled = [];
    for (let c = 0; c < C().reels; c++) {
      for (let r = 0; r < rows; r++) {
        if (isBlocked(mask, c, r)) continue;
        if (!grid[c][r]) {
          grid[c][r] = { id: pickWeighted(weights) };
          filled.push({ c, r });
        }
      }
    }
    return filled;
  }

  function adjacentToLocked(grid, mask, c, r, premium) {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ];
    for (const [dc, dr] of dirs) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nc >= C().reels || nr < 0 || nr >= rowsOf(grid)) continue;
      if (isBlocked(mask, nc, nr)) continue;
      const cell = grid[nc][nr];
      if (cell && (cell.id === premium || cell.id === "WILD")) return true;
    }
    return false;
  }

  function resolveBlocks(grid, mask, premium) {
    const rows = rowsOf(grid);
    let changed = true;
    const cleared = [];
    while (changed) {
      changed = false;
      const toClear = [];
      for (let c = 0; c < C().reels; c++) {
        for (let r = 0; r < rows; r++) {
          if (!isBlocked(mask, c, r)) continue;
          if (adjacentToLocked(grid, mask, c, r, premium)) {
            toClear.push({ c, r, arrow: mask[c][r].arrow });
          }
        }
      }
      for (const t of toClear) {
        if (!isBlocked(mask, t.c, t.r)) continue;
        mask[t.c][t.r] = null;
        grid[t.c][t.r] = null;
        cleared.push(t);
        changed = true;
        if (t.arrow === "H") {
          for (let cc = 0; cc < C().reels; cc++) {
            if (isBlocked(mask, cc, t.r)) {
              mask[cc][t.r] = null;
              grid[cc][t.r] = null;
              cleared.push({ c: cc, r: t.r, arrow: "H" });
            }
          }
        } else if (t.arrow === "V") {
          for (let rr = 0; rr < rows; rr++) {
            if (isBlocked(mask, t.c, rr)) {
              mask[t.c][rr] = null;
              grid[t.c][rr] = null;
              cleared.push({ c: t.c, r: rr, arrow: "V" });
            }
          }
        }
      }
    }
    return cleared;
  }

  /** True only if newly filled cells contain premium or wild. */
  function respinGrew(filled, grid, premium) {
    for (const p of filled) {
      const cell = grid[p.c][p.r];
      if (cell && (cell.id === premium || cell.id === "WILD")) return true;
    }
    return false;
  }

  function bonusFromScatters(n) {
    if (n >= 6) return C().bonuses.mobjob;
    if (n >= 5) return C().bonuses.payday;
    if (n >= 4) return C().bonuses.moneyrun;
    if (n >= 3) return C().bonuses.kingpin;
    return null;
  }

  function playSpin(opts) {
    opts = opts || {};
    const bet = opts.bet;
    if (!(bet > 0)) {
      return {
        steps: [],
        grid: emptyGrid(C().rowsBase),
        totalWin: 0,
        globalMult: 1,
        goldWilds: false,
        scatterCount: 0,
        scatterPositions: [],
        trigger: null,
        retriggerSpins: 0,
        premium: null,
        respinCount: 0,
        hitCap: false,
        rows: C().rowsBase,
        mask: null
      };
    }

    const inBonus = !!opts.inBonus;
    const bonusCfg = opts.bonusId ? C().bonuses[opts.bonusId] : null;
    const weights = Object.assign({}, inBonus ? C().bonusWeights : C().baseWeights);

    let rows = C().rowsBase;
    if (inBonus && bonusCfg) rows = bonusCfg.rows;
    else if (opts.forceRows) rows = opts.forceRows;
    else if (opts.featureSpin) {
      const boards = C().enhanced.feature.boards;
      rows = boards[(rng() * boards.length) | 0];
    }

    let mask;
    if (opts.persistMask && opts.persistMask.length) {
      mask = cloneMask(opts.persistMask);
      rows = rowsOf(mask);
    } else if (inBonus || opts.featureSpin) {
      mask = createBlockMask(rows, C().rowsBase);
    } else {
      mask = createBlockMask(rows, rows); // fully unlocked
    }

    if (opts.enhanced === "heat") {
      weights.SCAT *= 1.4;
      weights.WILD *= 1.25;
    }

    let grid = fillBoard(weights, rows, mask, {
      guaranteeWilds: opts.featureSpin ? C().enhanced.feature.guaranteeWilds : 0
    });

    if (opts.forceBonus) {
      forceScatters(grid, mask, C().bonuses[opts.forceBonus].scatters);
    } else if (opts.enhanced === "overload") {
      forceScatters(grid, mask, C().enhanced.overload.minScat);
    } else if (opts.mystery) {
      const roll = rng();
      let acc = 0;
      let picked = "dead";
      for (const o of C().mystery.outcomes) {
        acc += o.w;
        if (roll <= acc) {
          picked = o.type;
          break;
        }
      }
      if (picked === "dead") stripScatters(grid);
      else forceScatters(grid, mask, C().bonuses[picked].scatters);
    }

    const steps = [];
    steps.push({ type: "spin", grid: cloneGrid(grid), label: "spin" });

    const landScat = countScatters(grid);
    let premium = detectPremiumTrigger(grid);
    let chain = 0;

    while (premium && chain < C().maxRespinChain) {
      chain++;
      const lockedList = collectLocked(grid, premium);
      steps.push({
        type: "lock",
        grid: cloneGrid(grid),
        premium,
        locked: lockedList.map((x) => x.c + "," + x.r),
        label: "lock " + premium
      });

      grid = prepareRespin(grid, mask, premium);
      const filled = refillPlayable(grid, mask, weights);

      if (inBonus || opts.featureSpin) {
        const cleared = resolveBlocks(grid, mask, premium);
        if (cleared.length) {
          refillPlayable(grid, mask, weights);
          steps.push({
            type: "arrow",
            grid: cloneGrid(grid),
            cleared,
            label: "board expand"
          });
        }
      }

      // re-mark locks after drop
      collectLocked(grid, premium);
      steps.push({
        type: "respin",
        grid: cloneGrid(grid),
        premium,
        label: "respin"
      });

      if (!respinGrew(filled, grid, premium)) break;
    }

    let globalMult = 1;
    let goldWilds = false;
    const wildPositions = [];
    if (anyWild(grid) && hasFullBoardSymbol(grid)) {
      goldWilds = true;
      const minMult = bonusCfg ? bonusCfg.minWildMult : 2;
      globalMult = pickWildMult(minMult);
      for (let c = 0; c < C().reels; c++) {
        for (let r = 0; r < rowsOf(grid); r++) {
          if (grid[c][r] && grid[c][r].id === "WILD") {
            grid[c][r].gold = true;
            grid[c][r].mult = globalMult;
            wildPositions.push({ c, r });
          }
        }
      }
      steps.push({
        type: "barrel",
        grid: cloneGrid(grid),
        globalMult,
        wildPositions,
        label: "barrel " + globalMult + "x"
      });
    }

    const evalResult = evaluateWays(grid, bet, globalMult);
    let totalWin = evalResult.total;
    const cap = C().maxWinCap * bet;
    if (totalWin > cap) totalWin = cap;

    steps.push({
      type: "pay",
      grid: cloneGrid(grid),
      wins: evalResult.wins,
      total: +totalWin.toFixed(2),
      globalMult,
      label: "pay"
    });

    let trigger = null;
    if (!inBonus) trigger = bonusFromScatters(landScat.n);

    let retriggerSpins = 0;
    if (inBonus && landScat.n > 0) {
      retriggerSpins = landScat.n * C().scatterRetrigger;
    }

    return {
      steps,
      grid: cloneGrid(grid),
      totalWin: +totalWin.toFixed(2),
      globalMult,
      goldWilds,
      scatterCount: landScat.n,
      scatterPositions: landScat.positions,
      trigger,
      retriggerSpins,
      premium,
      respinCount: chain,
      hitCap: totalWin >= cap - 0.01,
      rows,
      mask: cloneMask(mask)
    };
  }

  return {
    seed,
    playSpin,
    bonusFromScatters,
    emptyGrid,
    cloneGrid,
    countScatters,
    rowsOf,
    createBlockMask,
    cloneMask
  };
})();
