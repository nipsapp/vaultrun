# Stake Engine launch notes

Vault Run math id: **circuit-breach** (original).

## Why Goblin-like math was removed

Stake originality rules reject clones. The previous build matched Goblin Rush’s
lock-respin / barrel / expanding-block / 3–6 bonus ladder fingerprint. That is gone.

## What reviewers should see

- 5×4 tumble ways + Breach Mult
- Key → Cash Chip collect
- Single **Vault Breach** free-spin feature with Vault Gauge
- Max 20,000× · modes base / bonus / bonus_max / super

## Remaining work before submit

1. Port math to [engineio/math-sdk](https://github.com/engineio/math-sdk) → publish books
2. Frontend: Stake web-sdk or wire `authenticate` / `play` / `end-round`
3. Static build only (no CDN fonts)
4. Create publisher + game on stake-engine.com → upload math + FE → approval

Do **not** describe the game as Goblin Rush–like in the approval blurb.
