# Stake Engine upload pack

Generated packages for **Vault Run** readiness checklist.

## 1. Media (do first)

Folder: `stake/media/`

| File | Aspect | Use |
|------|--------|-----|
| `vault-run-tile-3x4.png` | 900×1200 (3:4) | Media library → set as **game tile / cover** |
| `vault-run-cover-16x9.png` | 1920×1080 (16:9) | Media library → **cover art** |

On Stake Engine → **Media** → upload both → set 3:4 as cover/tile.

Also open **Tile Editor** (pen on thumbnail) and compose a bright tile from background + emblem if the checklist still wants the layered tile.

## 2. Math

Folder: `stake/math/publish_files/`

Contains:
- `index.json`
- `books_*.jsonl.zst` (base, bonus, bonus_max, super)
- `lookUpTable_*_0.csv` (weights tilted to ~96% RTP)

**Files → Import** the whole `publish_files` folder → **Publish Game → Math**.

## 3. Front end

Folder: `stake/front/`

Static build with Stake RGS client (`authenticate` / `play` / `end-round`).

**Files → Import** the whole `front` folder → **Publish Game → Front End**.

## 4. Bet levels

After math is published: **Settings** → apply a bet-level template (use a `us_` template if targeting Stake.us).

## 5. Regenerate

```bash
python tools/make_stake_media.py
node tools/package_stake_front.js
node tools/export_stake_math.js --sims=100000 --rtp=0.96
```
