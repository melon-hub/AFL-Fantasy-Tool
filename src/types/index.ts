// src/types/index.ts
// All TypeScript interfaces for the AFL Fantasy Draft Tool

// ──────────────────────────────────────────────
// Core enums and types
// ──────────────────────────────────────────────

export type Position = "DEF" | "MID" | "RUC" | "FWD";

export type PlayerCategory =
  | "premium"
  | "value"
  | "smoky"
  | "rookie"
  | "depth"
  | "uncategorised";

// ──────────────────────────────────────────────
// Player data
// ──────────────────────────────────────────────

/** Raw player data from CSV import */
export interface Player {
  id: string;
  name: string;
  positions: Position[];
  positionString: string; // e.g. "DEF/MID"
  club: string;
  projScore: number;
  preseason26: number | null;
  bye: number;
  age: number | null;
  games2025: number | null;
  category: PlayerCategory;
  smokyNote: string;
  notes: string;
  adp: number | null;
  isDrafted: boolean;
  draftedBy: number | null; // Team number (1–6), null = undrafted
  draftOrder: number | null; // Overall pick number
}

/** Calculated metrics — computed dynamically, not stored in CSV */
export interface PlayerWithMetrics extends Player {
  vorpByPosition: Partial<Record<Position, number>>;
  vorp: number;
  bestVorpPosition: Position;
  dppBonus: number;
  finalValue: number;
  valueOverAdp: number | null;
  // Smart Rank: composite score (toggleable vs classic VORP)
  smartRank: number;
  positionalScarcity: number; // 0–100: how depleted best position is
  byeValue: number; // Bye round desirability for your team
}

// ──────────────────────────────────────────────
// League settings
// ──────────────────────────────────────────────

export interface LeagueSettings {
  numTeams: number; // Default: 6
  starters: Record<Position, number>; // DEF:6, MID:5, FWD:6, RUC:1
  emergencies: Record<Position, number>; // 1 per position
  // Total bench = 10 (4 position-specific emergencies + 6 flexible bench spots)
  // VORP only uses starters + emergencies for replacement level
  benchSize: number; // 6 additional flex bench spots
  dppBonusValue: number; // Static DPP bonus (default: 3.0)
  myTeamNumber: number; // "I am Team X" (1–6)
  smartRankWeights: SmartRankWeights; // Configurable composite weights
}

// ──────────────────────────────────────────────
// Draft state
// ──────────────────────────────────────────────

/** A single draft pick for history/undo */
export interface DraftPick {
  playerId: string;
  playerName: string;
  position: string;
  teamNumber: number; // 1–6
  overallPick: number; // 1, 2, 3…
  timestamp: number;
}

/** Draft store shape (managed by Zustand) */
export interface DraftState {
  players: Player[];
  draftPicks: DraftPick[];
  currentOverallPick: number;

  // Actions
  loadPlayers: (players: Player[]) => void;
  draftPlayer: (playerId: string, teamNumber: number) => void;
  undraftPlayer: (playerId: string) => void;
  undoLastPick: () => void;
  undoLastN: (n: number) => void;
  resetDraft: () => void;
}

// ──────────────────────────────────────────────
// Draft intelligence / recommendations
// ──────────────────────────────────────────────

/** Positional scarcity snapshot for a single position */
export interface PositionScarcity {
  position: Position;
  totalStarters: number; // starters × numTeams
  totalRostered: number; // (starters + emerg) × numTeams
  availableCount: number; // undrafted players at this position
  premiumsLeft: number; // undrafted premiums at this position
  scarcityPct: number; // 0–100: how depleted (higher = scarcer)
  urgency: "low" | "medium" | "high" | "critical";
}

/** A single draft recommendation with reasoning */
export interface DraftRecommendation {
  playerId: string;
  playerName: string;
  position: string;
  smartRank: number;
  reasons: string[]; // Human-readable reasons, e.g. "DEF premiums 80% gone"
}

/** Smart Rank weight configuration (user-tunable) */
export interface SmartRankWeights {
  vorpWeight: number; // default 0.7
  scarcityWeight: number; // default 0.2
  byeWeight: number; // default 0.1
}

// ──────────────────────────────────────────────
// CSV mapping
// ──────────────────────────────────────────────

/** Maps CSV column headers (case-insensitive) to Player fields */
export interface CsvColumnMapping {
  name: string[];
  positions: string[];
  club: string[];
  projScore: string[];
  preseason26: string[];
  bye: string[];
  age: string[];
  games2025: string[];
  id: string[];
  category: string[];
  smokyNote: string[];
  adp: string[];
  notes: string[];
}
