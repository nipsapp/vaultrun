/**
 * Export Circuit Breach math into Stake Engine publish_files format.
 * Generates books, then exponential-tilts CSV weights to ~96% RTP.
 *
 * Usage: node tools/export_stake_math.js [--sims=100000] [--rtp=0.96]
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { CONFIG, Engine } = require("../server/src/game/engineBridge");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "stake", "math", "publish_files");
const TMP = path.join(ROOT, "stake", "math", "_tmp");

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : fallback;
}

const SIMS = Math.max(100, Number(arg("sims", "100000")) || 100000);
const RTP = Math.min(0.98, Math.max(0.9, Number(arg("rtp", "0.96")) || 0.96));

const MODES = [
  { name: "base", cost: 1 },
  { name: "bonus", cost: 80 },
  { name: "bonus_max", cost: 200 },
  { name: "super", cost: 500 }
];

const ZSTD_CANDIDATES = [
  "zstd",
  "C:\\Users\\GAMING X\\AppData\\Local\\Microsoft\\WinGet\\Packages\\oschwartz10612.Poppler_Microsoft.Winget.Source_8wekyb3d8bbwe\\poppler-25.07.0\\Library\\bin\\zstd.exe"
];

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function cellToSym(cell) {
  if (!cell) return { name: "H1" };
  const o = { name: cell.id };
  if (cell.mult) o.multiplier = cell.mult;
  if (cell.chip != null) o.prize = cell.chip;
  return o;
}

function gridToBoard(grid) {
  return (grid || []).map((col) => (col || []).map(cellToSym));
}

/** Keep animatable events compact for FE + file size. */
function stepsToEvents(steps) {
  return (steps || []).map((step, index) => {
    const ev = {
      index,
      type: "vrStep",
      stepType: step.type
    };
    if (step.grid) ev.board = gridToBoard(step.grid);
    if (step.win != null) ev.win = step.win;
    if (step.total != null) ev.total = step.total;
    if (step.amount != null) ev.amount = step.amount;
    if (step.breachMult != null) ev.breachMult = step.breachMult;
    if (step.wins) ev.wins = step.wins;
    if (step.removed) ev.removed = step.removed;
    if (step.keys) ev.keys = step.keys;
    if (step.chips) ev.chips = step.chips;
    if (step.chipSum != null) ev.chipSum = step.chipSum;
    if (step.spinsLeft != null) ev.spinsLeft = step.spinsLeft;
    if (step.gauge != null) ev.gauge = step.gauge;
    if (step.gaugeName) ev.gaugeName = step.gaugeName;
    if (step.add != null) ev.add = step.add;
    if (step.trigger) ev.trigger = step.trigger;
    return ev;
  });
}

function payoutMultInt(totalWin, bet) {
  return Math.max(0, Math.round(((totalWin || 0) / Math.max(bet, 1e-9)) * 100));
}

function zstdCompress(src, dest) {
  for (const bin of ZSTD_CANDIDATES) {
    const r = spawnSync(bin, ["-f", "-19", "-o", dest, src], { encoding: "utf8" });
    if (r.status === 0) return;
  }
  throw new Error("zstd not available");
}

/**
 * Exponential tilt weights so weighted mean(payoutMultiplier) ≈ targetPm.
 * Weights become large integers suitable for Stake CSV uint64 column.
 */
function optimizeWeights(payouts, targetPm) {
  const n = payouts.length;
  let lo = 0;
  let hi = 1e-4;

  function weightsFor(lam) {
    let maxScore = -Infinity;
    const scores = new Array(n);
    for (let i = 0; i < n; i++) {
      scores[i] = -lam * payouts[i];
      if (scores[i] > maxScore) maxScore = scores[i];
    }
    const w = new Array(n);
    let sumW = 0;
    let sumWP = 0;
    for (let i = 0; i < n; i++) {
      w[i] = Math.exp(scores[i] - maxScore);
      sumW += w[i];
      sumWP += w[i] * payouts[i];
    }
    return { w, mean: sumWP / sumW, sumW };
  }

  // Raise lambda until mean drops to / below target
  let probe = weightsFor(hi);
  let guard = 0;
  while (probe.mean > targetPm && guard < 60) {
    hi *= 1.8;
    probe = weightsFor(hi);
    guard++;
  }

  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const { mean } = weightsFor(mid);
    if (mean > targetPm) lo = mid;
    else hi = mid;
  }
  const lambda = (lo + hi) / 2;
  const { w, mean, sumW } = weightsFor(lambda);

  const SCALE = 1e12;
  const ints = w.map((x) => Math.max(1, Math.round((x / sumW) * SCALE)));
  let maxP = 0;
  for (const p of payouts) if (p > maxP) maxP = p;
  for (let i = 0; i < n; i++) {
    if (payouts[i] === maxP) ints[i] = Math.max(ints[i], Math.round(SCALE / 5e6));
  }

  let sumWI = 0;
  let sumWPI = 0;
  let hitW = 0;
  for (let i = 0; i < n; i++) {
    sumWI += ints[i];
    sumWPI += ints[i] * payouts[i];
    if (payouts[i] > 0) hitW += ints[i];
  }
  return {
    weights: ints,
    meanPm: sumWPI / sumWI,
    hitRate: hitW / sumWI,
    lambda
  };
}

function withNerf(nerf, fn) {
  if (!nerf) return fn();
  const saved = {
    fsWeights: { ...CONFIG.fsWeights },
    chipWeights: CONFIG.chipWeights.slice(),
    wildMultWeights: CONFIG.wildMultWeights.slice(),
    feature: JSON.parse(JSON.stringify(CONFIG.feature))
  };
  try {
    // Starve chips/wilds so buy-mode books can reach ~96% RTP after tilt
    CONFIG.fsWeights.CHIP = Math.max(0.4, CONFIG.fsWeights.CHIP * 0.25);
    CONFIG.fsWeights.WILD = Math.max(0.3, CONFIG.fsWeights.WILD * 0.3);
    CONFIG.fsWeights.KEY = Math.max(0.4, CONFIG.fsWeights.KEY * 0.5);
    CONFIG.chipWeights = CONFIG.chipWeights.map((w, i) => w * Math.pow(0.55, i));
    CONFIG.wildMultWeights = [70, 20, 8, 2];
    for (const g of Object.values(CONFIG.feature.gauge)) {
      g.stickyWildChance *= 0.25;
      g.chipBias = 0;
      g.startBreachIndex = Math.min(g.startBreachIndex, 1);
    }
    return fn();
  } finally {
    Object.assign(CONFIG.fsWeights, saved.fsWeights);
    CONFIG.chipWeights = saved.chipWeights;
    CONFIG.wildMultWeights = saved.wildMultWeights;
    CONFIG.feature = saved.feature;
  }
}

function runMode(modeName, cost, count) {
  const booksPath = path.join(TMP, `books_${modeName}.jsonl`);
  const csvPath = path.join(OUT, `lookUpTable_${modeName}_0.csv`);
  const zstPath = path.join(OUT, `books_${modeName}.jsonl.zst`);
  const outBooks = fs.createWriteStream(booksPath, { encoding: "utf8" });
  const payouts = [];
  const bet = 1;
  let rawSum = 0;
  let rawHits = 0;
  let maxP = 0;
    const isBuy = modeName !== "base";
  const nerfPct = modeName === "super" ? 75 : modeName === "bonus_max" ? 65 : modeName === "bonus" ? 60 : 0;

  for (let id = 1; id <= count; id++) {
    const nerf = isBuy && id % 100 < nerfPct;
    Engine.seed((id * 2654435761) >>> 0);
    const result = withNerf(nerf, () => Engine.playSpin({ bet, mode: modeName }));
    const pm = payoutMultInt(result.totalWin, bet);
    payouts.push(pm);
    rawSum += pm;
    if (pm > 0) rawHits++;
    if (pm > maxP) maxP = pm;

    outBooks.write(
      JSON.stringify({
        id,
        payoutMultiplier: pm,
        events: stepsToEvents(result.steps)
      }) + "\n"
    );
    if (id % 5000 === 0 || id === count) process.stdout.write(`\r  ${modeName} sims: ${id}/${count}`);
  }

  return new Promise((resolve, reject) => {
    outBooks.on("error", reject);
    outBooks.on("finish", () => {
      try {
        const targetPm = RTP * cost * 100;
        const opt = optimizeWeights(payouts, targetPm);
        const lines = payouts.map((pm, i) => `${i + 1},${opt.weights[i]},${pm}`);
        fs.writeFileSync(csvPath, lines.join("\n") + "\n", "utf8");
        zstdCompress(booksPath, zstPath);
        const rawMean = rawSum / count / 100;
        const optRtp = opt.meanPm / 100 / cost;
        console.log(
          `\n  ${modeName}: rawMean=${rawMean.toFixed(2)}x → optRTP=${(optRtp * 100).toFixed(2)}% (target ${(RTP * 100).toFixed(1)}%) hit≈${(opt.hitRate * 100).toFixed(1)}% max=${(maxP / 100).toFixed(0)}x`
        );
        if (optRtp > 0.98 || optRtp < 0.9) {
          console.warn(`  WARNING: ${modeName} RTP ${(optRtp * 100).toFixed(2)}% outside Stake 90–98% band`);
        }
        resolve({
          modeName,
          cost,
          rawMean,
          optRtp,
          hitRate: opt.hitRate,
          maxP,
          count,
          targetPm
        });
      } catch (e) {
        reject(e);
      }
    });
    outBooks.end();
  });
}

async function main() {
  ensureDir(OUT);
  ensureDir(TMP);
  console.log(`Exporting Stake math → ${OUT}`);
  console.log(`Sims/mode=${SIMS}  RTP target=${RTP}`);

  const stats = [];
  for (const m of MODES) stats.push(await runMode(m.name, m.cost, SIMS));

  fs.writeFileSync(
    path.join(OUT, "index.json"),
    JSON.stringify(
      {
        modes: MODES.map((m) => ({
          name: m.name,
          cost: m.cost,
          events: `books_${m.name}.jsonl.zst`,
          weights: `lookUpTable_${m.name}_0.csv`
        }))
      },
      null,
      2
    )
  );
  fs.writeFileSync(
    path.join(ROOT, "stake", "math", "export-stats.json"),
    JSON.stringify({ sims: SIMS, rtpTarget: RTP, maxWinCap: CONFIG.maxWinCap, stats }, null, 2)
  );
  console.log("\nReady:", OUT);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
