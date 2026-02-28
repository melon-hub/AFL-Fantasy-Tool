// src/lib/vorp.ts
// VORP (Value Over Replacement Player) calculation engine + Smart Rank
//
// Corrected algorithm for DPP players: calculates VORP at EACH eligible
// position and uses the MAXIMUM. This prevents the overwrite bug from
// naive single-loop approaches.
//
// Smart Rank = composite of VORP + positional scarcity + bye desirability.
// All weights are transparent and user-configurable.

import type {
  Player,
  PlayerWithMetrics,
  LeagueSettings,
  Position,
  PositionScarcity,
  DraftRecommendation,
} from "@/types";
import { POSITIONS, BYE_ROUNDS } from "./constants";

// ──────────────────────────────────────────────
// Replacement levels
// ──────────────────────────────────────────────

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

    const eligible = availablePlayers
      .filter((p) => p.positions.includes(pos))
      .sort((a, b) => b.projScore - a.projScore);

    if (eligible.length >= totalRostered) {
      levels[pos] = eligible[totalRostered - 1].projScore;
    } else {
      levels[pos] =
        eligible.length > 0 ? eligible[eligible.length - 1].projScore : 0;
    }
  }

  return levels;
}

// ──────────────────────────────────────────────
// Positional scarcity
// ──────────────────────────────────────────────

/**
 * Calculate how depleted each position is based on drafted vs available.
 * Returns scarcityPct 0–100 (100 = almost no one left) and urgency level.
 */
export function calculatePositionalScarcity(
  allPlayers: Player[],
  settings: LeagueSettings
): Record<Position, PositionScarcity> {
  const result = {} as Record<Position, PositionScarcity>;

  for (const pos of POSITIONS) {
    const starters = settings.starters[pos];
    const emerg = settings.emergencies[pos];
    const totalStarters = starters * settings.numTeams;
    const totalRostered = (starters + emerg) * settings.numTeams;

    const allEligible = allPlayers.filter((p) => p.positions.includes(pos));
    const available = allEligible.filter((p) => !p.isDrafted);
    const premiumsLeft = available.filter(
      (p) => p.category === "premium"
    ).length;

    // Scarcity: what % of rosterable spots have been consumed from the pool?
    // If you started with 60 eligible DEFs and now have 30 left, but only
    // need 42 roster spots, scarcity = (60-30) / 42 = 71%
    const drafted = allEligible.length - available.length;
    const scarcityPct = Math.min(
      100,
      Math.round((drafted / Math.max(totalRostered, 1)) * 100)
    );

    let urgency: PositionScarcity["urgency"] = "low";
    if (scarcityPct >= 80 || premiumsLeft === 0) urgency = "critical";
    else if (scarcityPct >= 60 || premiumsLeft <= 2) urgency = "high";
    else if (scarcityPct >= 40) urgency = "medium";

    result[pos] = {
      position: pos,
      totalStarters,
      totalRostered,
      availableCount: available.length,
      premiumsLeft,
      scarcityPct,
      urgency,
    };
  }

  return result;
}

// ──────────────────────────────────────────────
// Bye value
// ──────────────────────────────────────────────

/**
 * Calculate bye desirability for a player given the current team's bye
 * distribution. Players on under-represented bye rounds score higher.
 *
 * Returns a normalised 0–100 score.
 */
export function calculateByeValue(
  playerBye: number,
  myTeamPlayers: Player[]
): number {
  // Count how many of my current players are on each bye round
  const byeCounts: Record<number, number> = {};
  for (const round of BYE_ROUNDS) {
    byeCounts[round] = 0;
  }
  for (const p of myTeamPlayers) {
    byeCounts[p.bye] = (byeCounts[p.bye] || 0) + 1;
  }

  if (myTeamPlayers.length === 0) return 50; // neutral when team is empty

  // The most crowded bye gets the lowest score
  const maxCount = Math.max(...Object.values(byeCounts), 1);
  const playerByeCount = byeCounts[playerBye] || 0;

  // Inverse: fewer team players on this bye = higher value
  // Normalise to 0–100
  return Math.round(((maxCount - playerByeCount) / maxCount) * 100);
}

// ──────────────────────────────────────────────
// VORP + Smart Rank
// ──────────────────────────────────────────────

/**
 * Calculate VORP, Smart Rank, and derived metrics for all players.
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
  const scarcity = calculatePositionalScarcity(players, settings);

  // My team's players (for bye value calculation)
  const myTeamPlayers = players.filter(
    (p) => p.isDrafted && p.draftedBy === settings.myTeamNumber
  );

  const { vorpWeight, scarcityWeight, byeWeight } = settings.smartRankWeights;

  // First pass: compute all metrics
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

    // Positional scarcity for this player's best position
    const positionalScarcity = scarcity[bestPos].scarcityPct;

    // Bye value relative to my team
    const byeValue = calculateByeValue(player.bye, myTeamPlayers);

    // Smart Rank: weighted composite (normalised VORP component)
    // finalValue is the raw score, scarcity and bye are 0–100
    // We normalise finalValue to a 0–100 scale based on available pool
    const smartRank =
      finalValue * vorpWeight +
      positionalScarcity * scarcityWeight +
      byeValue * byeWeight;

    return {
      ...player,
      vorpByPosition,
      vorp: bestVorp,
      bestVorpPosition: bestPos,
      dppBonus,
      finalValue,
      valueOverAdp: null, // computed in second pass
      smartRank,
      positionalScarcity,
      byeValue,
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
      valueOverAdp: p.adp != null && rank != null ? p.adp - rank : null,
    };
  });
}

// ──────────────────────────────────────────────
// Draft recommendations (intelligence alerts)
// ──────────────────────────────────────────────

/**
 * Generate top draft recommendations with human-readable reasons.
 * Called by the UI to populate the "intelligence" panel / smokies alerts.
 */
export function generateRecommendations(
  players: PlayerWithMetrics[],
  settings: LeagueSettings,
  count: number = 5
): DraftRecommendation[] {
  const available = players.filter((p) => !p.isDrafted);
  const scarcity = calculatePositionalScarcity(players, settings);
  const topBySmartRank = [...available].sort(
    (a, b) => b.smartRank - a.smartRank
  );

  return topBySmartRank.slice(0, count).map((p) => {
    const reasons: string[] = [];
    const posScarcity = scarcity[p.bestVorpPosition];

    // VORP reason
    if (p.finalValue > 20) {
      reasons.push(`Elite value: ${p.finalValue.toFixed(1)} VORP above replacement`);
    } else if (p.finalValue > 10) {
      reasons.push(`Strong value: ${p.finalValue.toFixed(1)} VORP`);
    }

    // DPP reason
    if (p.dppBonus > 0) {
      reasons.push(
        `DPP flexibility (${p.positionString}) — fills multiple roster needs`
      );
    }

    // Scarcity reason
    if (posScarcity.urgency === "critical") {
      reasons.push(
        `${p.bestVorpPosition} is CRITICAL — only ${posScarcity.availableCount} left, ${posScarcity.premiumsLeft} premiums remaining`
      );
    } else if (posScarcity.urgency === "high") {
      reasons.push(
        `${p.bestVorpPosition} getting scarce — ${posScarcity.premiumsLeft} premiums left`
      );
    }

    // Bye reason
    if (p.byeValue > 75) {
      reasons.push(`Great bye (R${p.bye}) — balances your team's bye spread`);
    }

    // Smoky reason
    if (p.category === "smoky" && p.smokyNote) {
      reasons.push(`Smoky: ${p.smokyNote}`);
    }

    // ADP value reason
    if (p.valueOverAdp != null && p.valueOverAdp > 5) {
      reasons.push(
        `Sliding in draft: ADP ${p.adp} but ranked ${p.adp! - p.valueOverAdp} by value`
      );
    }

    if (reasons.length === 0) {
      reasons.push("Solid pick based on overall value");
    }

    return {
      playerId: p.id,
      playerName: p.name,
      position: p.positionString,
      smartRank: p.smartRank,
      reasons,
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
// Smart Rank adds context on top of VORP:
//   - Positional scarcity: if DEF premiums are 80% gone, DEF picks
//     get a scarcity boost because waiting = settling for depth players.
//   - Bye value: if your team is stacked on R12, a R14 player scores
//     higher because it balances your bye spread.
//   - Weights are visible and tuneable (default 0.7/0.2/0.1).
//
// The generateRecommendations function gives you the "why" for each pick:
//   "Sam Flanders: DPP flexibility (DEF/MID), DEF getting scarce (3
//    premiums left), great bye R13 — balances your team's bye spread"
// ──────────────────────────────────────────────
