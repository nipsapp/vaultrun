/**
 * Vault Run — Circuit Breach
 * Original math: 5×4 ways tumble + Key/Chip collect + Vault Breach free spins.
 * Not a lock-respin / barrel-wild / expanding-block design.
 */
window.VR = window.VR || {};

VR.CONFIG = {
  title: "VAULT RUN",
  tagline: "Tumble · Collect · Breach the vault",
  version: "2.0.0",
  mathId: "circuit-breach",
  reels: 5,
  rowsBase: 4,
  rowsMax: 4,
  maxWinCap: 20000,
  rtpTarget: 0.96,
  startBalance: 10000,
  betSteps: [0.2, 0.4, 0.6, 0.8, 1, 1.6, 2, 4, 6, 8, 10, 20, 40, 60, 80, 100],
  defaultBetIndex: 4,
  autoOptions: [10, 25, 50, 100],
  sessionReminderMs: 1000 * 60 * 30,
  maxCascades: 20,
  maxFsTotal: 24,

  /** Breach mult ladder — advances each cascade win (resets each paid spin) */
  breachLadder: [1, 2, 3, 5, 8, 12],

  /** Drill wild personal mult weights */
  wildMults: [2, 3, 5, 10],
  wildMultWeights: [50, 30, 15, 5],
  wildWinMultCap: 50,

  /** Cash chip face values × bet */
  chipValues: [0.5, 1, 2, 5, 10, 25, 50, 100],
  chipWeights: [30, 28, 18, 12, 6, 3.5, 1.8, 0.7],

  symbols: {
    H1: { id: "H1", name: "Lambda Tile", tier: "high", color: "#fbbf24" },
    H2: { id: "H2", name: "Beta Tile", tier: "high", color: "#7dd3fc" },
    H3: { id: "H3", name: "Psi Tile", tier: "high", color: "#34d399" },
    H4: { id: "H4", name: "Sigma Tile", tier: "high", color: "#f87171" },
    H5: { id: "H5", name: "Ruby Diamond", tier: "high", color: "#c084fc" },
    L1: { id: "L1", name: "Spade I", tier: "low", color: "#94a3b8" },
    L2: { id: "L2", name: "Club I", tier: "low", color: "#a78bfa" },
    L3: { id: "L3", name: "Spade II", tier: "low", color: "#67e8f9" },
    L4: { id: "L4", name: "Club II", tier: "low", color: "#a3e635" },
    WILD: { id: "WILD", name: "Drill", tier: "special", color: "#fde68a" },
    KEY: { id: "KEY", name: "Key", tier: "special", color: "#fbbf24" },
    CHIP: { id: "CHIP", name: "Cash Chip", tier: "special", color: "#facc15" },
    SCAT: { id: "SCAT", name: "Circuit", tier: "special", color: "#f472b6" }
  },
  artPack: "MK Antique Casino Bundle — Greek",
  artAlias: {
    KEY: "FREESPIN"
  },

  // Pays × total bet for ways length 3–5
  pays: {
    H1: [0, 0, 1.5, 5, 20],
    H2: [0, 0, 1.2, 4, 15],
    H3: [0, 0, 1.0, 3, 12],
    H4: [0, 0, 0.8, 2.5, 10],
    H5: [0, 0, 0.6, 2, 8],
    L1: [0, 0, 0.4, 1.2, 4],
    L2: [0, 0, 0.35, 1.0, 3.5],
    L3: [0, 0, 0.3, 0.9, 3],
    L4: [0, 0, 0.25, 0.8, 2.5]
  },

  baseWeights: {
    H1: 3, H2: 3.5, H3: 4, H4: 4.5, H5: 5,
    L1: 11, L2: 11, L3: 12, L4: 12,
    WILD: 2.2, KEY: 1.8, CHIP: 3.2, SCAT: 1.1
  },
  fsWeights: {
    H1: 3.5, H2: 4, H3: 4.5, H4: 5, H5: 5.5,
    L1: 9, L2: 9, L3: 9.5, L4: 9.5,
    WILD: 3.5, KEY: 2.8, CHIP: 4.5, SCAT: 1.4
  },

  /** Single feature — Vault Breach (scatter count only tweaks spins / start gauge) */
  feature: {
    id: "vault_breach",
    name: "Vault Breach",
    byScat: {
      3: { spins: 8, gauge: 1 },
      4: { spins: 10, gauge: 1 },
      5: { spins: 12, gauge: 2 }
    },
    retriggerSpins: 2,
    maxGauge: 3,
    gauge: {
      1: { name: "Safe Crack", startBreachIndex: 1, stickyWildChance: 0.1, chipBias: 0 },
      2: { name: "Strongroom", startBreachIndex: 2, stickyWildChance: 0.25, chipBias: 1 },
      3: { name: "Vault Floor", startBreachIndex: 4, stickyWildChance: 0.4, chipBias: 2 }
    }
  },

  /** Stake-style bet modes (buy panel) */
  modes: {
    base: { id: "base", name: "Base", cost: 1 },
    bonus: { id: "bonus", name: "Vault Breach", cost: 80, forceScat: 3, startGauge: 1 },
    bonus_max: { id: "bonus_max", name: "Strongroom Buy", cost: 200, forceScat: 4, startGauge: 2 },
    super: { id: "super", name: "Vault Floor Buy", cost: 500, forceScat: 5, startGauge: 3, stickyOnFirst: 3 }
  }
};
