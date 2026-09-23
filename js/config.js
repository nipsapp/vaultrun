/**
 * Vault Run — Goblin Rush–style rules (theme variant)
 * 6×3 ways base · premium lock + chained respins · barrel wild global mult · expanding bonus board
 */
window.VR = window.VR || {};

VR.CONFIG = {
  title: "VAULT RUN",
  tagline: "Lock · Respin · Crack the vault",
  version: "1.2.1",
  reels: 6,
  rowsBase: 3,
  rowsMax: 7,
  maxWinCap: 40000,
  rtpTarget: 0.96,
  startBalance: 10000,
  betSteps: [0.2, 0.4, 0.6, 0.8, 1, 1.6, 2, 4, 6, 8, 10, 20, 40, 60, 80, 100],
  defaultBetIndex: 4,
  autoOptions: [10, 25, 50, 100],
  sessionReminderMs: 1000 * 60 * 30,
  maxRespinChain: 25,

  /** Premium symbols that can start a lock-respin when present on reels 1–3 */
  premiums: ["H1", "H2", "H3", "H4", "H5", "H6"],

  wildMults: [2, 3, 5, 10, 15, 20],
  wildMultWeights: [28, 24, 20, 14, 9, 5],

  symbols: {
    H1: { id: "H1", name: "Alpha", tier: "high", color: "#fbbf24" },
    H2: { id: "H2", name: "Beta", tier: "high", color: "#7dd3fc" },
    H3: { id: "H3", name: "Psi", tier: "high", color: "#34d399" },
    H4: { id: "H4", name: "Sigma", tier: "high", color: "#f87171" },
    H5: { id: "H5", name: "Diamond", tier: "high", color: "#c084fc" },
    H6: { id: "H6", name: "Heart", tier: "high", color: "#fb923c" },
    L1: { id: "L1", name: "Spade", tier: "low", color: "#94a3b8" },
    L2: { id: "L2", name: "Club", tier: "low", color: "#a78bfa" },
    L3: { id: "L3", name: "Spade II", tier: "low", color: "#67e8f9" },
    L4: { id: "L4", name: "Club II", tier: "low", color: "#a3e635" },
    L5: { id: "L5", name: "Coin", tier: "low", color: "#facc15" },
    WILD: { id: "WILD", name: "Wild", tier: "special", color: "#fde68a" },
    SCAT: { id: "SCAT", name: "Scatter", tier: "special", color: "#f472b6" },
    BLOCK: { id: "BLOCK", name: "Blocked", tier: "special", color: "#334155" }
  },
  artPack: "MK Antique Casino Bundle — Greek",

  // Pays × total bet for ways length 3–6
  pays: {
    H1: [0, 0, 2.0, 6, 18, 40],
    H2: [0, 0, 1.6, 5, 14, 30],
    H3: [0, 0, 1.4, 4, 12, 25],
    H4: [0, 0, 1.2, 3.5, 10, 20],
    H5: [0, 0, 1.0, 3, 8, 16],
    H6: [0, 0, 0.8, 2.5, 7, 14],
    L1: [0, 0, 0.4, 1.2, 3, 6],
    L2: [0, 0, 0.4, 1.2, 3, 6],
    L3: [0, 0, 0.3, 1.0, 2.5, 5],
    L4: [0, 0, 0.3, 1.0, 2.5, 5],
    L5: [0, 0, 0.25, 0.8, 2, 4]
  },

  baseWeights: {
    H1: 2.5, H2: 3, H3: 3.5, H4: 4, H5: 4.5, H6: 5,
    L1: 10, L2: 10, L3: 11, L4: 11, L5: 11,
    WILD: 2.0, SCAT: 1.35
  },
  bonusWeights: {
    H1: 3.5, H2: 4, H3: 4.5, H4: 5, H5: 5.5, H6: 6,
    L1: 8, L2: 8, L3: 8, L4: 8, L5: 8,
    WILD: 4.5, SCAT: 2.0
  },

  bonuses: {
    kingpin: {
      id: "kingpin",
      name: "Kingpin",
      scatters: 3,
      spins: 10,
      rows: 5,
      minWildMult: 2,
      buyCost: 80,
      buyable: true,
      vol: "5/5"
    },
    moneyrun: {
      id: "moneyrun",
      name: "Money Run",
      scatters: 4,
      spins: 12,
      rows: 6,
      minWildMult: 2,
      buyCost: 200,
      buyable: true,
      vol: "4/5"
    },
    payday: {
      id: "payday",
      name: "Payday",
      scatters: 5,
      spins: 12,
      rows: 6,
      minWildMult: 5,
      buyCost: 0,
      buyable: false,
      vol: "4/5"
    },
    mobjob: {
      id: "mobjob",
      name: "Mob Job",
      scatters: 6,
      spins: 12,
      rows: 7,
      minWildMult: 10,
      buyCost: 0,
      buyable: false,
      vol: "4/5"
    }
  },

  mystery: {
    name: "Mystery Bonus",
    buyCost: 100,
    outcomes: [
      { w: 0.51, type: "dead" },
      { w: 0.40, type: "moneyrun" },
      { w: 0.08, type: "payday" },
      { w: 0.01, type: "mobjob" }
    ]
  },

  enhanced: {
    heat: { name: "Enhanced Spin", costMult: 3 },
    overload: { name: "Hot Enhanced", costMult: 25, minScat: 4 },
    feature: {
      name: "Feature Spin",
      costMult: 500,
      boards: [5, 6, 7],
      guaranteeWilds: 4
    }
  },

  scatterRetrigger: 1
};
