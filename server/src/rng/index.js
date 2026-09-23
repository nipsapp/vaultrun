/**
 * RNG facade — cert-lab ready.
 * Production: set RNG_MODE=external and point at your certified RNG service.
 * This server never claims lab certification itself; it is RNG-agnostic.
 */
const crypto = require("crypto");
const config = require("../config");

function cryptoFloat() {
  // 53-bit float in [0,1) from CSPRNG
  const buf = crypto.randomBytes(8);
  const n = buf.readUInt32BE(0) * 0x100000000 + buf.readUInt32BE(4);
  return n / Math.pow(2, 64);
}

function cryptoSeedHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString("hex");
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function externalFloat() {
  if (!config.rngExternalUrl) {
    throw new Error("RNG_MODE=external but RNG_EXTERNAL_URL is empty");
  }
  const res = await fetch(config.rngExternalUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: config.rngExternalKey ? `Bearer ${config.rngExternalKey}` : ""
    },
    body: JSON.stringify({ count: 1, format: "float53" })
  });
  if (!res.ok) throw new Error("Certified RNG HTTP " + res.status);
  const data = await res.json();
  const v = Array.isArray(data.values) ? data.values[0] : data.value;
  if (typeof v !== "number" || v < 0 || v >= 1) throw new Error("Invalid RNG payload");
  return v;
}

/**
 * Create a draw stream for one round.
 * Returns { nextFloat, seed, proof, mode }
 */
async function createRoundRng() {
  const mode = config.rngMode;
  if (mode === "external") {
    const seed = cryptoSeedHex(16);
    const draws = [];
    return {
      mode,
      seed,
      proof: null,
      async nextFloat() {
        const v = await externalFloat();
        draws.push(v);
        return v;
      },
      finalize() {
        return {
          mode,
          seed,
          drawCount: draws.length,
          proof: crypto.createHash("sha256").update(draws.join(",")).digest("hex")
        };
      }
    };
  }

  // Default: CSPRNG seed → deterministic stream for the round (replayable audit)
  const seedHex = cryptoSeedHex(16);
  const seedInt = parseInt(seedHex.slice(0, 8), 16) >>> 0;
  const stream = mulberry32(seedInt);
  let drawCount = 0;
  return {
    mode: "crypto",
    seed: seedHex,
    proof: null,
    async nextFloat() {
      drawCount++;
      return stream();
    },
    // sync helper used by engine
    nextFloatSync() {
      drawCount++;
      return stream();
    },
    finalize() {
      return {
        mode: "crypto",
        seed: seedHex,
        drawCount,
        proof: crypto
          .createHash("sha256")
          .update(`vault-run|${seedHex}|${drawCount}`)
          .digest("hex")
      };
    }
  };
}

module.exports = {
  createRoundRng,
  cryptoFloat,
  cryptoSeedHex,
  mulberry32
};
