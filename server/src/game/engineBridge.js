/**
 * Load browser engine/config into Node via VM (single source of truth with client).
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const clientRoot = path.resolve(__dirname, "../../../js");

function loadEngine() {
  const VR = {};
  const sandbox = {
    window: { VR },
    VR,
    console,
    Math,
    Object,
    Array,
    Set,
    Number,
    parseInt,
    performance: { now: () => Date.now() }
  };
  vm.createContext(sandbox);
  for (const file of ["config.js", "engine.js"]) {
    const code = fs.readFileSync(path.join(clientRoot, file), "utf8");
    vm.runInContext(code, sandbox, { filename: file });
  }
  return sandbox.VR;
}

const VR = loadEngine();

/**
 * Run a spin with an injected RNG stream (round-scoped).
 */
function playSpinWithRng(opts, roundRng) {
  const prev = Math.random;
  // Engine.seed() without args binds rng to Math.random reference
  Math.random = () => {
    if (typeof roundRng.nextFloatSync === "function") return roundRng.nextFloatSync();
    throw new Error("RNG stream missing nextFloatSync");
  };
  try {
    VR.Engine.seed();
    return VR.Engine.playSpin(opts || {});
  } finally {
    Math.random = prev;
    VR.Engine.seed();
  }
}

module.exports = {
  CONFIG: VR.CONFIG,
  Engine: VR.Engine,
  playSpinWithRng
};
