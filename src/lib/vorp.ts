// src/lib/vorp.ts
// VORP (Value Over Replacement Player) calculation engine
//
// Corrected algorithm for DPP players: calculates VORP at EACH eligible
// position and uses the MAXIMUM. This prevents the overwrite bug from
// naive single-loop approaches.

import type {
  Player,
  PlayerWithMetrics,
  LeagueSettings,
  Position,
} from "@/types";
import { POSITIONS } from "./constants";

/**
 * Calculate replacement levels for each position based on the current
 * available player pool.
 *
 * Replacement level = projected score of the LAST rostered player at
 * that position across all teams. "Rostered" includes starters + emergencies
 * (not flexible bench — those are position-agnostic).
 */
export function calculateReplacementLevels(
  availablePlayers: Player[],
  settings: LeagueSettings
): Record<Position, number> {
  const levels: Record<Position, number> = { DEF: 0, MID: 0, RUC: 0, FWD: 0 };

  for (const pos of POSITIONS) {
    const starters = settings.starters[pos];
    const emerg = settings.emergencies[pos];
    const totalRostered = (starters + emerg) * settings.numTeams;

    // All available players eligible at this position, sorted by projection
    const eligible = availablePlayers
      .filter((p) => p.positions.includes(pos))
      .sort((a, b) => b.projScore - a.projScore);

    if (eligible.length >= totalRostered) {
      levels[pos] = eligible[totalRostered - 1].projScore;
    } else {
      // Fewer players than roster spots → replacement level is 0
      levels[pos] = eligible.length > 0
        ? eligible[eligible.length - 1].projScore
        : 0;
    }
  }

  return levels;
}

/**
 * Calculate VORP and derived metrics for all players.
 *
 * This recalculates from scratch on every call. Call it after each
 * draft/undraft action so replacement levels reflect the current pool.
 */
export function calculateVorp(
  players: Player[],
  settings: LeagueSettings
): PlayerWithMetrics[] {
  const available = players.filter((p) => !p.isDrafted);
  const replacementLevels = calculateReplacementLevels(available, settings);

  // First pass: compute finalValue for all players so we can rank them
  const withMetrics: PlayerWithMetrics[] = players.map((player) => {
    const vorpByPosition: Partial<Record<Position, number>> = {};

    // Calculate VORP at EACH eligible position (the DPP fix!)
    for (const pos of player.positions) {
      vorpByPosition[pos] = player.projScore - replacementLevels[pos];
    }

    // Best VORP = maximum across all eligible positions
    let bestVorp = -Infinity;
    let bestPos: Position = player.positions[0];
    for (const pos of player.positions) {
      const v = vorpByPosition[pos] ?? 0;
      if (v > bestVorp) {
        bestVorp = v;
        bestPos = pos;
      }
    }

    // DPP bonus: static bonus for players with 2+ positions
    const dppBonus = player.positions.length > 1 ? settings.dppBonusValue : 0;
    const finalValue = bestVorp + dppBonus;

    return {
      ...player,
      vorpByPosition,
      vorp: bestVorp,
      bestVorpPosition: bestPos,
      dppBonus,
      finalValue,
      valueOverAdp: null, // computed in second pass
    };
  });

  // Second pass: rank by finalValue and compute valueOverAdp
  const ranked = [...withMetrics]
    .filter((p) => !p.isDrafted)
    .sort((a, b) => b.finalValue - a.finalValue);

  const rankMap = new Map<string, number>();
  ranked.forEach((p, i) => rankMap.set(p.id, i + 1));

  return withMetrics.map((p) => {
    const rank = rankMap.get(p.id);
    return {
      ...p,
      valueOverAdp:
        p.adp != null && rank != null ? p.adp - rank : null,
    };
  });
}

// ──────────────────────────────────────────────
// Why this is correct for 6-team leagues:
//
// With 6 teams and your roster (6 DEF starters + 1 DEF emerg = 7 per team):
//   DEF replacement = 42nd best DEF  (7 × 6)
//   MID replacement = 36th best MID  (6 × 6)
//   FWD replacement = 42nd best FWD  (7 × 6)
//   RUC replacement = 12th best RUC  (2 × 6)
//
// A DEF/MID DPP player gets TWO VORP scores:
//   VORP_DEF = projScore − replacementLevel_DEF
//   VORP_MID = projScore − replacementLevel_MID
//   Their VORP = max(VORP_DEF, VORP_MID)
//   Their finalValue = VORP + 3.0 (DPP bonus)
//
// DPP players in a 6-team league are EXTREMELY valuable because they
// can fill the scarcer position AND get a bonus.
// ──────────────────────────────────────────────
