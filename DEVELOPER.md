# Vault Run — Developer Handoff

**Product:** Vault Run  
**Math ID:** `circuit-breach` (v2.0.0)  
**Theme:** Casino heist / vault crack  
**Live demo:** https://vaultrun.onrender.com  
**Repo:** https://github.com/nipsapp/vaultrun  
**Local path:** `C:\Users\GAMING X\Downloads\VaultRun`

This document is for engineers taking over the project: what the game is, how rules work, how it was built, and what remains for Stake Engine submission.

---

## 1. One-line pitch

**Vault Run** is a **5×4 ways tumble slot**. Cascades raise a **Breach Mult**; **Keys** collect **Cash Chips**; **3+ Circuit** scatters trigger **Vault Breach** free spins with a **Vault Gauge** upgrade path. Max win **20,000×**. Target RTP **96%**.

It is an **original** math design (not a Goblin Rush lock-respin clone). An earlier prototype matched Goblin Rush mechanics; that was deliberately replaced for Stake originality review.

---

## 2. Game rules (Circuit Breach)

### 2.1 Grid & pays

| Item | Value |
|------|--------|
| Reels × rows | **5 × 4** |
| Pay model | Left-to-right **ways** (length 3–5) |
| Max ways | 4⁴ = 1024 |
| Max win | **20,000×** bet |
| RTP target | **0.96** |

**Pay symbols**

| ID | Name | 3-of-kind | 4 | 5 |
|----|------|-----------|---|---|
| H1 | Crown | 1.5× | 5× | 20× |
| H2 | Safe | 1.2× | 4× | 15× |
| H3 | Chipstack | 1.0× | 3× | 12× |
| H4 | Cuff | 0.8× | 2.5× | 10× |
| H5 | Lens | 0.6× | 2× | 8× |
| L1–L4 | Ace–Jack | 0.25–0.4× | 0.8–1.2× | 2.5–4× |

Pays are **× total bet × ways count × wild mult × Breach Mult**.

### 2.2 Special symbols

| ID | Name | Role |
|----|------|------|
| WILD | Drill | Substitutes for H/L only. Each wild has a **personal mult** 2 / 3 / 5 / 10 (weights 50/30/15/5). Product of wilds in a win, capped at **50×** before Breach Mult. |
| KEY | Key | Does **not** pay ways. After cascades settle, each Key collects Cash Chips. |
| CHIP | Cash Chip | Face value × bet: 0.5, 1, 2, 5, 10, 25, 50, 100 (weighted toward low). |
| SCAT | Circuit | Scatter. **3+** anywhere → Vault Breach FS. |

### 2.3 Base loop (one paid spin)

1. Reveal 5×4 board.  
2. Evaluate ways wins.  
3. Winning symbols **explode**; new symbols **tumble** in from above.  
4. Each cascade win advances **Breach Mult**: `1 → 2 → 3 → 5 → 8 → 12` (resets next paid spin).  
5. Repeat until no ways win (cap 20 cascades).  
6. **Collect phase:**  
   `collect = bet × (sum of CHIP faces) × (number of KEYS)`  
   If ≥1 Key and ≥1 Chip.  
7. Optional: 2+ Keys in that collect nudges Breach Mult one step (UI/math uses this mainly in FS for Gauge).  
8. If **3+ Circuits** remain / land → enter **Vault Breach** (entire FS sequence is part of the same result book).

### 2.4 Free spins — Vault Breach

**One feature only** (not a 3/4/5/6 named bonus ladder).

| Circuits on trigger | Free spins | Starting Vault Gauge |
|---------------------|------------|----------------------|
| 3 | 8 | 1 — Safe Crack |
| 4 | 10 | 1 — Safe Crack |
| 5 | 12 | 2 — Strongroom |

**Vault Gauge** (levels 1–3)

| Level | Name | Start Breach step | Sticky Drill chance | Chip weight skew |
|-------|------|-------------------|---------------------|------------------|
| 1 | Safe Crack | 2× | 10% | base |
| 2 | Strongroom | 3× | 25% | mid chips ↑ |
| 3 | Vault Floor | 8× | 40% | high chips ↑ |

- Upgrade: land **2+ Keys** in one cascade/collect sequence during FS → Gauge +1 (max 3).  
- Retrigger: **3+ Circuits** during FS → **+2** spins (soft cap total FS played ≈ 24).  
- **Entire FS sequence is resolved inside one `playSpin` return** (stateless / Stake-book friendly).

### 2.5 Buy modes (Stake-style)

| Mode ID | UI name | Cost × bet | Behavior |
|---------|---------|------------|----------|
| `base` | Base | 1× | Natural play |
| `bonus` | Vault Breach | 80× | Force 3 Circuits, Gauge 1, 8 FS |
| `bonus_max` | Strongroom Buy | 200× | Force 4 Circuits, Gauge 2, 10 FS |
| `super` | Vault Floor Buy | 500× | Force 5 Circuits, Gauge 3, 3 sticky Drills on first FS board |

### 2.6 What we deliberately do **not** ship

These were removed so Stake originality review does not treat the game as a Goblin Rush clone:

- Premium lock on reels 1–3 + chained respins  
- Barrel / gold wilds with global 2–20×  
- Expanding board + blocked cells + arrow clears  
- Named ladder: Kingpin / Money Run / Payday / Mob Job  
- Mystery dead-buy / Enhanced Spin trio as Goblin-style extras  
- Cross-spin server `bonusMask` persistence  

---

## 3. How the product was built

### 3.1 Stack

| Layer | Tech |
|-------|------|
| Client | Vanilla HTML/CSS/JS, canvas reels |
| Math | Shared `js/config.js` + `js/engine.js` |
| Server | Node + Express + better-sqlite3 + JWT |
| RNG | Pluggable: `crypto` (CSPRNG seed → stream) or `external` |
| Hosting | Render free Node service; GitHub `nipsapp/vaultrun` |
| Art | MK Antique Casino Bundle (WebP under `assets/casino/`) |
| Audio | Pack from Slot Machine Casino Game → `assets/audio/` |

### 3.2 Architecture

```
Browser (index.html)
  ├─ config.js / engine.js     ← single math source of truth
  ├─ render.js / app.js / ui.js
  ├─ audio.js                  ← BGM + SFX from assets/audio
  └─ api.js                    ← JWT + POST /game/spin when online
           │
           ▼
Express server (server/)
  ├─ Auth + wallet (SQLite)
  ├─ engineBridge.js           ← loads same js/config + js/engine via VM
  ├─ rng/                      ← seed + SHA-256 proof per round
  └─ rgs/stakeEngine.js        ← stub for operator wallet bridge
```

**Online:** client animates `result.steps` only; server owns bet, RNG, win, ledger.  
**Offline demo:** same engine runs in-browser with local balance if API is down.

### 3.3 Spin timeline step types (client animation)

| `step.type` | Meaning |
|-------------|---------|
| `spin` | Initial reveal |
| `tumbleWin` | Ways win + positions |
| `tumble` | Board after refill |
| `breach` | Breach Mult updated |
| `collect` | Keys collect chips |
| `fsStart` / `fsSpin` / `fsGauge` / `fsRetrigger` / `fsEnd` | Free-spin book |
| `pay` | Round total |

### 3.4 Key source files

| Path | Purpose |
|------|---------|
| `js/config.js` | All math constants, pays, modes, feature |
| `js/engine.js` | `playSpin()` resolve |
| `js/app.js` | Spin UX, timeline playback |
| `js/render.js` | Canvas drawing / animations |
| `js/audio.js` | Casino pack audio |
| `js/api.js` | Backend client |
| `server/src/game/service.js` | Authoritative spin + wallet |
| `server/src/game/engineBridge.js` | Load client math in Node |
| `server/src/rng/index.js` | Round RNG + proof |
| `tools/test_rules.js` | Circuit Breach regression tests |
| `STAKE.md` | Stake Engine submit notes |
| `render.yaml` | Render deploy blueprint |

### 3.5 Run locally

```bash
# Full stack (client + API on one port)
cd server
npm install
npm start
# → http://localhost:8787

# Client-only static
cd ..
npx serve . -p 5500
# → http://localhost:5500
```

```bash
# Math regression
node tools/test_rules.js
```

Hard-refresh (Ctrl+F5) after updates — a service worker can cache old HTML.

### 3.6 Deploy

- **Render:** Web service from `nipsapp/vaultrun`, build `cd server && npm install`, start `cd server && npm start`, `NODE_VERSION=20.x` (better-sqlite3 fails on Node 26).  
- Env: `JWT_SECRET`, `NODE_ENV=production`, `CORS_ORIGIN=*`, optional `RNG_MODE`, `RGS_MODE`.  
- Health: `GET /api/v1/health`

---

## 4. API (developer summary)

Base: `/api/v1`

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | `/health` | no | `rngMode`, `rgsMode` |
| GET | `/game/config` | no | Public config |
| POST | `/auth/register` | no | Guest demo users OK |
| POST | `/auth/login` | no | JWT |
| POST | `/game/spin` | Bearer | Authoritative resolve |

**Spin request**

```json
{
  "bet": 1,
  "mode": "base"
}
```

`mode`: `base` | `bonus` | `bonus_max` | `super`  
(Legacy aliases like `forceBonus: "kingpin"` are remapped server-side to new modes.)

**Spin response (shape)**

```json
{
  "roundId": "...",
  "bet": 1,
  "cost": 1,
  "win": 12.5,
  "balance": 9987.5,
  "rng": { "mode": "crypto", "seed": "...", "proof": "..." },
  "result": {
    "steps": [ /* animation book */ ],
    "grid": [ /* final 5×4 */ ],
    "totalWin": 12.5,
    "trigger": null,
    "fsTotal": 0,
    "hitCap": false,
    "mode": "base"
  }
}
```

---

## 5. Audio & art

### Art
- Live frames: `assets/casino/` (WebP).  
- Aliases: `KEY` → `FREESPIN` art, `CHIP` → `COIN` art.  
- Source originals: `assets/antique/`.

### Audio (`assets/audio/`)
Imported from Slot Machine Casino Game “Audio Selected” pack:

| Event | File |
|-------|------|
| BGM | `bgm.mp3` (Game Play Music) |
| Spin loop | `spin.mp3` |
| Stop | `stop.wav` |
| Win / big win | `win.mp3` / `bigwin.mp3` |
| Bonus | `bonus.mp3` + `bonus_popup.mp3` |
| Tumble | `cascade.mp3` |
| Collect | `collect.mp3` |
| Mult / gauge | `mult.mp3` / `levelup.mp3` |
| Click | `click.mp3` |

BGM starts after first user gesture (browser autoplay policy). Mute stops BGM + SFX.

---

## 6. Stake Engine path (next for store listing)

Current build is a **playable demo + authoritative server**. It is **not** yet a Stake Engine publish package.

Remaining work (see `STAKE.md`):

1. Port math to [Stake math-sdk](https://github.com/engineio/math-sdk) → static books (`index.json` + `.jsonl.zst` + CSV).  
2. Frontend: Stake `authenticate` → `play` → `end-round` (or web-sdk).  
3. Static FE build (no CDN fonts).  
4. Upload on [stake-engine.com](https://stake-engine.com/) → Publish Math + Front End → **two** approval requests.  

**Suggested approval blurb:**  
> Vault Run is a 5×4 ways tumble slot. Cascades raise a Breach multiplier; Keys collect Cash Chips. Three or more Circuits trigger Vault Breach free spins with a Vault Gauge upgrade path. Max win 20,000×.

Do **not** describe the game as Goblin Rush–like.

Roobet / Gamdom / Shuffle / Rollbit are not open indie upload stores; they typically need aggregator / provider deals after (or instead of) Stake Engine.

---

## 7. Testing checklist for QA

- [ ] Base spin: tumble + Breach Mult UI  
- [ ] Key + Chip collect SFX / win  
- [ ] Natural 3+ Circuit → FS intro + full FS book in one spin  
- [ ] Buy: bonus / bonus_max / super costs and FS  
- [ ] Max win cap never exceeds 20,000×  
- [ ] Online: balance updates from server; offline fallback if API down  
- [ ] Audio: BGM after first click; mute works  
- [ ] `node tools/test_rules.js` passes  

---

## 8. Contacts / ownership notes

- Math authority: `js/config.js` + `js/engine.js` (keep client/server identical via bridge).  
- After Stake approval, **math/modes must not change** without a new submission.  
- Demo wallet is for sandbox only — replace with Stake RGS / certified wallet for real money.

---

*Generated for developer handoff — Vault Run Circuit Breach v2.0.0*
