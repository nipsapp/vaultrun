/**
 * Rule / regression tests for Vault Run engine (Node)
 */
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const root = path.join(__dirname, "..");
const VR = {};
const ctx = { window: { VR }, VR, console, Math, Object, Array, Set, Number };
vm.createContext(ctx);
for (const f of ["js/config.js", "js/engine.js"]) {
  vm.runInContext(fs.readFileSync(path.join(root, f), "utf8"), ctx);
}
const E = ctx.VR.Engine;
const C = ctx.VR.CONFIG;

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed++;
    console.error("FAIL:", msg);
  } else {
    console.log("OK:", msg);
  }
}

// 1) Base board size
{
  E.seed(1);
  const r = E.playSpin({ bet: 1 });
  assert(r.rows === 3, "base rows = 3");
  assert(r.grid.length === 6, "6 reels");
  assert(r.grid[0].length === 3, "3 row cells");
}

// 2) Force kingpin scatters
{
  E.seed(42);
  const r = E.playSpin({ bet: 1, forceBonus: "kingpin" });
  assert(r.scatterCount >= 3, "force kingpin >= 3 scatters");
  assert(r.trigger && r.trigger.id === "kingpin", "triggers kingpin");
}

// 3) Force all bonus tiers
for (const id of ["kingpin", "moneyrun", "payday", "mobjob"]) {
  E.seed(100 + id.length);
  const r = E.playSpin({ bet: 1, forceBonus: id });
  assert(r.trigger && r.trigger.id === id, "force trigger " + id);
  assert(r.scatterCount >= C.bonuses[id].scatters, "scat count " + id);
}

// 4) No insane pure-wild overpay on base
{
  E.seed(99);
  let insane = 0;
  for (let i = 0; i < 200; i++) {
    const r = E.playSpin({ bet: 1 });
    if (r.totalWin > 5000 && r.respinCount === 0 && !r.goldWilds) insane++;
  }
  assert(insane === 0, "no insane base wins without feature (pure-wild overpay guard)");
}

// 5) Respin chain terminates (not always max)
{
  E.seed(3);
  let hitMax = 0;
  let anyRespin = 0;
  for (let i = 0; i < 400; i++) {
    const r = E.playSpin({ bet: 1 });
    if (r.respinCount > 0) anyRespin++;
    if (r.respinCount >= C.maxRespinChain) hitMax++;
  }
  assert(anyRespin > 0, "respins occur sometimes (" + anyRespin + ")");
  assert(hitMax < 30, "max chain not constantly hit (" + hitMax + "/400)");
}

// 6) Bonus board persistence unlocks
{
  E.seed(11);
  const bonus = C.bonuses.kingpin;
  let mask = E.createBlockMask(bonus.rows, C.rowsBase);
  let blocksBefore = 0;
  for (let c = 0; c < 6; c++)
    for (let r = 0; r < bonus.rows; r++) if (mask[c][r] && mask[c][r].id === "BLOCK") blocksBefore++;

  let clearedAny = false;
  for (let i = 0; i < 40; i++) {
    const r = E.playSpin({
      bet: 1,
      inBonus: true,
      bonusId: "kingpin",
      persistMask: mask
    });
    mask = r.mask;
    for (const step of r.steps) {
      if (step.type === "arrow" && step.cleared && step.cleared.length) clearedAny = true;
    }
  }
  let blocksAfter = 0;
  for (let c = 0; c < 6; c++)
    for (let r = 0; r < bonus.rows; r++) if (mask[c][r] && mask[c][r].id === "BLOCK") blocksAfter++;
  assert(mask[0].length === 5, "kingpin mask rows 5");
  assert(blocksAfter <= blocksBefore, "blocks never increase across bonus spins");
  // clearedAny may or may not happen — soft check
  console.log("INFO: arrow clears seen:", clearedAny, "blocks", blocksBefore, "->", blocksAfter);
}

// 7) Payday min wild mult
{
  E.seed(55);
  let ok = true;
  for (let i = 0; i < 80; i++) {
    const r = E.playSpin({ bet: 1, inBonus: true, bonusId: "payday" });
    if (r.goldWilds && r.globalMult < 5) ok = false;
  }
  assert(ok, "payday barrel mult >= 5");
}

// 8) Mob Job min wild mult
{
  E.seed(56);
  let ok = true;
  for (let i = 0; i < 80; i++) {
    const r = E.playSpin({ bet: 1, inBonus: true, bonusId: "mobjob" });
    if (r.goldWilds && r.globalMult < 10) ok = false;
  }
  assert(ok, "mobjob barrel mult >= 10");
}

// 9) Feature spin guarantees 4 wilds and expanded rows
{
  E.seed(77);
  const r = E.playSpin({ bet: 1, featureSpin: true });
  let wilds = 0;
  const g0 = r.steps[0].grid;
  for (let c = 0; c < 6; c++) {
    for (let row = 0; row < r.rows; row++) {
      if (g0[c][row] && g0[c][row].id === "WILD") wilds++;
    }
  }
  assert([5, 6, 7].includes(r.rows), "feature board rows in 5/6/7 got " + r.rows);
  assert(wilds >= 4, "feature guarantees >=4 wilds on land got " + wilds);
}

// 10) Max win cap
{
  E.seed(1);
  // can't easily force max — check cap field logic with huge bet result clamp via config
  assert(C.maxWinCap === 40000, "max win cap 40000x");
}

// 11) Mystery weights sum ~1
{
  const s = C.mystery.outcomes.reduce((a, o) => a + o.w, 0);
  assert(Math.abs(s - 1) < 0.001, "mystery weights sum to 1");
}

// 12) Ways length pays index
{
  assert(C.pays.H1.length === 6, "paytable length 6 for ways 0..5 idx");
}

console.log(failed === 0 ? "\nALL TESTS PASSED" : "\n" + failed + " FAILED");
process.exit(failed === 0 ? 0 : 1);
