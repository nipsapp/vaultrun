/**
 * Copy static client into stake/front for Stake Engine upload.
 * Upload the contents of stake/front/ (or the zip) as Front End files.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DEST = path.join(ROOT, "stake", "front");

const FILES = [
  "index.html",
  "manifest.json",
  "sw.js",
  "css/main.css",
  "css/casino.css",
  "css/vault-art.css",
  "css/polish.css",
  "js/loading.js",
  "js/config.js",
  "js/engine.js",
  "js/assets.js",
  "js/render.js",
  "js/audio.js",
  "js/ui.js",
  "js/api.js",
  "js/stakeRgs.js",
  "js/app.js",
  "assets/casino/manifest.json",
  "assets/casino/manifest-hq.json",
  "assets/casino/casino-bg.webp",
  "assets/casino/vault-emblem.webp",
  "assets/casino/vault-title-v2.webp",
  "assets/casino/vault-frame-v2.webp",
  "assets/casino/vault-cash-chip-v2.webp"
];

function copyFile(rel) {
  const src = path.join(ROOT, rel);
  const dest = path.join(DEST, rel);
  if (!fs.existsSync(src)) {
    console.warn("skip missing", rel);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(rel) {
  const src = path.join(ROOT, rel);
  if (!fs.existsSync(src)) return;
  for (const name of fs.readdirSync(src)) {
    const p = path.join(rel, name);
    const st = fs.statSync(path.join(ROOT, p));
    if (st.isDirectory()) copyDir(p);
    else copyFile(p);
  }
}

fs.rmSync(DEST, { recursive: true, force: true });
fs.mkdirSync(DEST, { recursive: true });
for (const f of FILES) copyFile(f);
copyDir("assets/casino/symbols");
copyDir("assets/casino/symbols-hq");
copyDir("assets/audio");

const readme = `# Vault Run — Stake Front End package

Upload THIS FOLDER (all contents) on Stake Engine → Files → Import → Publish Front End.

RGS query params (provided by Stake launch):
  sessionID, rgs_url (or api), currency, lang, social

Math id: circuit-breach
`;
fs.writeFileSync(path.join(DEST, "README-STAKE.txt"), readme);
console.log("Front package ready:", DEST);
