const path = require("path");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const config = require("./config");
const { migrate } = require("./db/client");
const api = require("./routes/api");

migrate();

const app = express();
app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(
  cors({
    origin: config.corsOrigin === "*" ? true : config.corsOrigin.split(",").map((s) => s.trim()),
    credentials: true
  })
);
app.use(express.json({ limit: "256kb" }));

app.use("/api/v1", api);

// Serve the HTML5 client from repo root in local mode
const clientRoot = path.resolve(__dirname, "../..");
app.use(express.static(clientRoot));

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(config.port, config.host, () => {
  console.log(`[vaultrun] http://${config.host}:${config.port}`);
  console.log(`[vaultrun] API  http://${config.host}:${config.port}/api/v1/health`);
  console.log(`[vaultrun] RNG=${config.rngMode} RGS=${config.rgsMode}`);
});
