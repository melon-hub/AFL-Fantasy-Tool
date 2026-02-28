// src/lib/constants.ts

import type { LeagueSettings, SmartRankWeights, Position, CsvColumnMapping } from "@/types";

// ──────────────────────────────────────────────
// Positions
// ──────────────────────────────────────────────

export const POSITIONS: Position[] = ["DEF", "MID", "RUC", "FWD"];

export const POSITION_LABELS: Record<Position, string> = {
  DEF: "Defender",
  MID: "Midfielder",
  RUC: "Ruck",
  FWD: "Forward",
};

export const POSITION_COLORS: Record<Position, string> = {
  DEF: "bg-blue-500",
  MID: "bg-green-500",
  RUC: "bg-purple-500",
  FWD: "bg-red-500",
};

// ──────────────────────────────────────────────
// Default league settings (6-team standard)
// ──────────────────────────────────────────────

export const DEFAULT_SMART_RANK_WEIGHTS: SmartRankWeights = {
  vorpWeight: 0.7,
  scarcityWeight: 0.2,
  byeWeight: 0.1,
};

export const DEFAULT_LEAGUE_SETTINGS: LeagueSettings = {
  numTeams: 6,
  starters: { DEF: 6, MID: 5, FWD: 6, RUC: 1 },
  emergencies: { DEF: 1, MID: 1, FWD: 1, RUC: 1 },
  benchSize: 6, // 6 additional flexible bench spots
  dppBonusValue: 3.0,
  myTeamNumber: 1,
  smartRankWeights: DEFAULT_SMART_RANK_WEIGHTS,
};

// Total roster per team = 18 starters + 4 emergencies + 6 bench = 28

// ──────────────────────────────────────────────
// CSV column aliases (case-insensitive matching)
// ──────────────────────────────────────────────

export const CSV_COLUMN_MAPPING: CsvColumnMapping = {
  name: ["name", "player_name", "player", "full_name"],
  positions: ["pos", "position", "positions"],
  club: ["club", "team", "squad"],
  projScore: ["proj", "proj_score", "projection", "projected", "avg"],
  preseason26: ["ps26", "preseason", "preseason_score", "preseason26", "pre"],
  bye: ["bye", "bye_round"],
  age: ["age"],
  games2025: ["games25", "games_2025", "games", "gms"],
  id: ["player_id", "id", "playerId"],
  category: ["category", "cat", "tier"],
  smokyNote: ["smoky_note", "smoky", "smoky_reason"],
  adp: ["adp", "average_draft_position"],
  notes: ["notes", "note", "comment"],
};

// ──────────────────────────────────────────────
// Bye rounds (2026 AFL season)
// ──────────────────────────────────────────────

export const BYE_ROUNDS = [12, 13, 14] as const;

// ──────────────────────────────────────────────
// Category display helpers
// ──────────────────────────────────────────────

export const CATEGORY_COLORS: Record<string, string> = {
  premium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  value: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  smoky: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  rookie: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  depth: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
  uncategorised: "bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};
