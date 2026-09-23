# Vault Run

HTML5 slot demo — **Goblin Rush rule family**, vault theme variant.

## Rules (aligned with Goblin Rush brief)

| Item | Implementation |
|------|----------------|
| Grid | **6×3** ways base; bonus expands to **6×5 / 6×6 / 6×7** |
| Core | Premium on reels **1–2–3** → lock premium + wilds → chained **respins** |
| Wilds | Barrel wilds → gold when full L→R coverage → global mult **2–20×** |
| Bonus board | Blocked cells with **↔ / ↕** arrows; adjacent lock clears path |
| Bonuses | Kingpin (3) · Money Run (4) · Payday (5) · Mob Job (6) |
| Mystery | 51% dead / 40% Money Run / 8% Payday / 1% Mob Job |
| Enhanced | 3× · 25× (4+ scat) · **500× Feature Spin** (4 wilds, random board) |
| Max win | **40,000×** |

## Play

Serve the folder over HTTP, then open it in a browser (hard-refresh / Ctrl+F5 if an older service worker is cached).

```bash
npx serve .
```

Particle spam and the idle redraw loop were removed for smoother play.

## Casino visuals

The live game uses `assets/casino/`: a generated WebP backdrop and vault emblem,
plus four optimized WebP frames per symbol. The original source artwork remains
under `assets/antique/` for future editing. The active image set is about 1.2 MB;
the background is about 138 KB. Buttons, meters, and reel framing are CSS so they
stay crisp on phones and desktops.
