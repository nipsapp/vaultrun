# Vault Run

HTML5 slot — **Circuit Breach** math (original). Casino heist theme, **not** a Goblin Rush lock-respin clone.

Live demo: https://vaultrun.onrender.com

## Math identity (Stake originality)

| Item | Circuit Breach |
|------|----------------|
| Grid | **5×4** ways |
| Core | **Tumble / cascade** — winning symbols explode, board refills |
| Mult | **Breach Mult** ladder 1→2→3→5→8→12× per cascade |
| Wilds | **Drill** wilds with **personal** mults (2/3/5/10) — no gold barrels / global 2–20× |
| Collect | **Keys** collect visible **Cash Chip** values after cascades |
| Feature | **One** bonus: **Vault Breach** FS (3+ Circuits). Gauge upgrades Safe Crack → Strongroom → Vault Floor |
| Buys | Stake-style modes: `bonus` 80× · `bonus_max` 200× · `super` 500× |
| Max win | **20,000×** · RTP target **96%** |
| Books | Entire FS sequence resolves in **one** spin (stateless / Stake-ready) |

Removed on purpose (rejection risks): premium lock on reels 1–3, chained respins, barrel gold, blocked cells + arrows, 3/4/5/6 named bonus ladder (Kingpin / Money Run / Payday / Mob Job).

## Play

```bash
# Client only
npx serve .

# Full stack
cd server && npm install && npm start
# → http://localhost:8787
```

## Stake Engine path

1. Prototype math lives in `js/config.js` + `js/engine.js` (done — Circuit Breach).
2. Next: export **static books** (`index.json` + `.jsonl.zst` + CSV) via Stake math-sdk.
3. Wire frontend to Stake RGS: `authenticate` → `play` → `end-round` (replace invent-your-own wallet paths).
4. Submit math + FE for approval on [stake-engine.com](https://stake-engine.com/).

See `server/README.md` for API / RNG / RGS notes.

## Casino visuals

`assets/casino/` WebP frames. KEY→FREESPIN art alias, CHIP→COIN. Source art under `assets/antique/`.
