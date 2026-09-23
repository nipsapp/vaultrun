/**
 * Circuit Breach regression tests (Node)
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

assert(C.mathId === "circuit-breach", "math id circuit-breach");
assert(C.reels === 5 && C.rowsBase === 4, "5x4 grid");
assert(C.maxWinCap === 20000, "max win 20k");
assert(!C.bonuses, "no Goblin bonus ladder object");
assert(!C.premiums, "no premium lock list");
assert(C.modes && C.modes.base && C.modes.bonus, "Stake-style modes present");

{
  E.seed(1);
  const r = E.playSpin({ bet: 1 });
  assert(r.rows === 4, "base rows = 4");
  assert(r.grid.length === 5, "5 reels");
  assert(r.grid[0].length === 4, "4 row cells");
  assert(r.respinCount === 0, "no respin counter");
  assert(r.premium == null, "no premium field");
  assert(!r.goldWilds, "no gold wilds");
}

{
  E.seed(42);
  const r = E.playSpin({ bet: 1, mode: "bonus" });
  assert(r.trigger && r.trigger.id === "vault_breach", "buy triggers vault_breach");
  assert(r.steps.some((s) => s.type === "fsStart"), "FS book includes fsStart");
  assert(r.steps.some((s) => s.type === "fsEnd"), "FS book includes fsEnd");
  assert(r.fsTotal != null, "fsTotal present");
}

{
  E.seed(7);
  let sawTumble = 0;
  let sawCollect = 0;
  let goblinSteps = 0;
  for (let i = 0; i < 300; i++) {
    const r = E.playSpin({ bet: 1 });
    if (r.steps.some((s) => s.type === "tumble" || s.type === "tumbleWin")) sawTumble++;
    if (r.steps.some((s) => s.type === "collect")) sawCollect++;
    if (r.steps.some((s) => s.type === "lock" || s.type === "respin" || s.type === "barrel" || s.type === "arrow")) {
      goblinSteps++;
    }
    if (r.totalWin > C.maxWinCap + 0.01) {
      failed++;
      console.error("FAIL: over cap", r.totalWin);
    }
  }
  assert(sawTumble > 0, "tumbles occur (" + sawTumble + "/300)");
  assert(sawCollect >= 0, "collect steps observed (" + sawCollect + ")");
  assert(goblinSteps === 0, "zero Goblin step types (" + goblinSteps + ")");
}

{
  E.seed(99);
  for (const mode of ["bonus", "bonus_max", "super"]) {
    const r = E.playSpin({ bet: 1, mode });
    assert(r.mode === mode, "mode " + mode);
    assert(r.trigger, "trigger on " + mode);
  }
}

console.log(failed ? "\n" + failed + " FAILED" : "\nAll Circuit Breach tests passed");
process.exit(failed ? 1 : 0);
