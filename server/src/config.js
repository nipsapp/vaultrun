require("dotenv").config();
const path = require("path");

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

const config = {
  port: num(process.env.PORT, 8787),
  host: process.env.HOST || "0.0.0.0",
  nodeEnv: process.env.NODE_ENV || "development",
  jwtSecret: process.env.JWT_SECRET || "dev-insecure-secret",
  jwtExpires: process.env.JWT_EXPIRES || "12h",
  sessionTtlHours: num(process.env.SESSION_TTL_HOURS, 12),
  startingBalance: num(process.env.STARTING_BALANCE, 10000),
  currency: process.env.CURRENCY || "USD",
  minBet: num(process.env.MIN_BET, 0.2),
  maxBet: num(process.env.MAX_BET, 100),
  rngMode: process.env.RNG_MODE || "crypto",
  rngExternalUrl: process.env.RNG_EXTERNAL_URL || "",
  rngExternalKey: process.env.RNG_EXTERNAL_KEY || "",
  rgsMode: process.env.RGS_MODE || "local",
  stake: {
    baseUrl: process.env.STAKE_ENGINE_BASE_URL || "",
    apiKey: process.env.STAKE_ENGINE_API_KEY || "",
    gameId: process.env.STAKE_ENGINE_GAME_ID || "vault-run",
    operatorId: process.env.STAKE_ENGINE_OPERATOR_ID || ""
  },
  corsOrigin: process.env.CORS_ORIGIN || "*",
  databasePath: path.resolve(
    __dirname,
    "..",
    process.env.DATABASE_PATH || "./data/vaultrun.sqlite"
  ),
  gameCode: "vault-run"
};

if (config.nodeEnv === "production" && config.jwtSecret.includes("dev")) {
  console.warn("[warn] JWT_SECRET looks insecure for production");
}

module.exports = config;
