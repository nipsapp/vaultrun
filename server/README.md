# Vault Run Game Server

Authoritative backend for **Vault Run · Circuit Breach**: wallet, sessions, one-shot spin books, pluggable RNG, Stake Engine / RGS adapter stub.

## Math

Server loads `../js/config.js` + `../js/engine.js` (same Circuit Breach engine as the client). Free spins are fully resolved inside a single `playSpin` — no cross-spin bonus mask.

## Quick start

```bash
cd server
npm install
npm run migrate
npm start
```

- API: `http://localhost:8787/api/v1/health`
- Client (static): `http://localhost:8787/`

## API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | `/api/v1/auth/register` | no | Create user + funded wallet |
| POST | `/api/v1/auth/login` | no | JWT session |
| POST | `/api/v1/auth/logout` | yes | Revoke session |
| GET | `/api/v1/auth/me` | yes | Profile + balance |
| GET | `/api/v1/wallet` | yes | Balance + ledger |
| GET | `/api/v1/game/config` | no | Public math/UI config |
| GET | `/api/v1/game/state` | yes | Bonus state |
| POST | `/api/v1/game/spin` | yes | **Bet + resolve** (authoritative) |

### Spin body

```json
{
  "bet": 1,
  "forceBonus": "kingpin",
  "enhanced": "heat",
  "mystery": false,
  "featureSpin": false
}
```

Response includes `result.steps` for client animation, updated `balance`, `rng` seed/proof, and `playerState`.

## Certified RNG

This server is **RNG-agnostic**. It does **not** ship a lab certificate.

| `RNG_MODE` | Behavior |
|------------|----------|
| `crypto` (default) | Node CSPRNG seeds a per-round stream; seed + SHA-256 proof stored on `game_rounds` |
| `external` | Each draw fetched from `RNG_EXTERNAL_URL` (your certified RNG service) |

Lab certification (GLI / BMM / iTech, etc.) is performed against **your** approved RNG + this game’s math docs — outside this repo.

## Stake Engine / RGS

| `RGS_MODE` | Behavior |
|------------|----------|
| `local` | This DB is the wallet of record |
| `stake` | Bet/win/balance forwarded to `STAKE_ENGINE_BASE_URL` wallet API |

Set in `.env`:

```
RGS_MODE=stake
STAKE_ENGINE_BASE_URL=https://your-operator-rgs.example
STAKE_ENGINE_API_KEY=...
STAKE_ENGINE_GAME_ID=vault-run
STAKE_ENGINE_OPERATOR_ID=...
```

Adapter paths (adjust to your operator contract in `src/rgs/stakeEngine.js`):

- `POST /wallet/balance`
- `POST /wallet/bet`
- `POST /wallet/win`
- `POST /wallet/refund`

## Database

SQLite by default (`data/vaultrun.sqlite`): users, sessions, wallets, ledger, game_rounds, player_game_state, audit_log.

## Security notes

- Change `JWT_SECRET` before any shared deploy
- Use HTTPS termination in production
- Feature-buy / enhanced spins may be restricted by jurisdiction — gate in operator config
