# Stake Engine launch notes

Vault Run math id: **circuit-breach** (original).

## Upload pack (ready)

Everything for the readiness checklist is under `stake/`:

| Checklist item | What to upload |
|----------------|----------------|
| Game tile 3:4 | `stake/media/vault-run-tile-3x4.png` (or `media-upload.zip`) |
| Cover art 16:9 | `stake/media/vault-run-cover-16x9.png` |
| Math version | `stake/math/publish_files/` (or `math-upload.zip`) → Publish **Math** |
| Front version | `stake/front/` (or `front-upload.zip`) → Publish **Front End** |
| Bet levels | Settings → apply a bet-level template (`us_` prefix for Stake.us) |

### Dashboard steps

1. **Media** → upload both PNGs → set 3:4 as cover/tile  
2. **Files** → Import `publish_files` → **Publish Game → Math**  
3. **Files** → Import `front` → **Publish Game → Front End**  
4. **Settings** → bet-level template  
5. **Start Approval** → refresh readiness

### Regenerate

```bash
python tools/make_stake_media.py
node tools/package_stake_front.js
node tools/export_stake_math.js --sims=100000 --rtp=0.965
```

## Why Goblin-like math was removed

Stake originality rules reject clones. The previous build matched Goblin Rush’s
lock-respin / barrel / expanding-block / 3–6 bonus ladder fingerprint. That is gone.

## What reviewers should see

- 5×4 tumble ways + Breach Mult
- Key → Cash Chip collect
- Single **Vault Breach** free-spin feature with Vault Gauge
- Max 20,000× · modes base / bonus / bonus_max / super

## Suggested approval blurb

> Vault Run is a 5×4 ways tumble slot. Cascades raise a Breach multiplier; Keys collect Cash Chips. Three or more Circuits trigger Vault Breach free spins with a Vault Gauge upgrade path. Max win 20,000×.

Do **not** describe the game as Goblin Rush–like.
