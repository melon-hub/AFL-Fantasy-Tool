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
