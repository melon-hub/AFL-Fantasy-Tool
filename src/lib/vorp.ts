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
  DraftPhase,
  PositionScarcity,
  DraftRecommendation,
  DraftPick,
  PositionRunAlert,
  DraftPickCountdown,
} from "@/types";
import { POSITIONS, BYE_ROUNDS } from "./constants";

interface DraftPhaseState {
  phase: DraftPhase;
  hybridProgress: number;
  pickProgress: number;
  myRosterProgress: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normaliseMinMax(
  value: number,
  min: number,
  max: number,
  fallback: number = 50
): number {
  if (max - min <= 0.0001) return fallback;
  return ((value - min) / (max - min)) * 100;
}

function normaliseText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseRiskBase(risk: string | null | undefined): number {
  const r = normaliseText(risk).toLowerCase();
  if (r === "low") return 15;
  if (r === "medium") return 40;
  if (r === "high") return 75;
  return 35;
}

function textIndicatesSeasonOut(text: string | null | undefined): boolean {
  const lower = normaliseText(text).toLowerCase();
  if (!lower) return false;
  return (
    lower.includes("out for season") ||
    lower.includes("season-ending") ||
    lower.includes("season ending") ||
    lower.includes("season over") ||
    lower.includes("injury: season") ||
    lower.includes("miss the season")
  );
}

function isSeasonLongUnavailable(player: Player): boolean {
  return (
    textIndicatesSeasonOut(player.injury) ||
    textIndicatesSeasonOut(player.notes)
  );
}

function calculateRiskScore(player: Player): number {
  if (isSeasonLongUnavailable(player)) return 100;
  const injuryPenalty = normaliseText(player.injury) ? 10 : 0;
  const games = player.games2025;

  // Durability overlay: force at least medium risk for thin seasons.
  let durabilityFloor = 0;
  if (games != null) {
    if (games <= 14) durabilityFloor = 45;
    else if (games <= 17) durabilityFloor = 35;
  }

  // Continuous missed-games penalty so risk scales smoothly as availability drops.
  const missedGamesPenalty =
    games == null
      ? 0
      : clamp(((23 - clamp(games, 0, 23)) / 23) * 10, 0, 10);

  const baseRisk = parseRiskBase(player.risk) + injuryPenalty + missedGamesPenalty;
  return clamp(Math.max(baseRisk, durabilityFloor), 0, 100);
}

function calculateConsistencyScore(player: Player): number {
  const availabilityScore =
    player.games2025 == null
      ? 60
      : clamp((player.games2025 / 23) * 100, 25, 100);

  const x100 = player.x100_2025;
  const x120 = player.x120_2025;
  if (x100 == null && x120 == null) return availabilityScore;

  // Rate of premium scores; x120 is rarer so it gets extra emphasis.
  const sampleGames = Math.max(
    player.games2025 ?? 0,
    x100 ?? 0,
    x120 ?? 0,
    1
  );
  const x100RateScore = clamp(((x100 ?? 0) / sampleGames) * 100, 0, 100);
  const x120RateScore = clamp(((x120 ?? 0) / sampleGames) * 170, 0, 100);
  const premiumCeilingScore = 0.65 * x100RateScore + 0.35 * x120RateScore;

  if (player.games2025 == null) {
    return clamp(0.45 * 60 + 0.55 * premiumCeilingScore, 25, 100);
  }

  return clamp(0.65 * availabilityScore + 0.35 * premiumCeilingScore, 25, 100);
}

export function calculateDraftPhase(
  currentOverallPick: number,
  settings: LeagueSettings,
  myDraftedPlayersCount: number
): DraftPhaseState {
  const totalTeamSlots =
    Object.values(settings.starters).reduce((sum, n) => sum + n, 0) +
    Object.values(settings.emergencies).reduce((sum, n) => sum + n, 0) +
    settings.benchSize;
  const totalDraftPicks = Math.max(1, totalTeamSlots * settings.numTeams);

  const pickProgress = clamp((currentOverallPick - 1) / totalDraftPicks, 0, 1);
  const myRosterProgress = clamp(myDraftedPlayersCount / Math.max(1, totalTeamSlots), 0, 1);
  const hybridProgress = 0.6 * pickProgress + 0.4 * myRosterProgress;

  const { earlyToMid, midToLate } = settings.phaseBoundaries;
  let phase: DraftPhase = "early";
  if (hybridProgress >= midToLate) phase = "late";
  else if (hybridProgress >= earlyToMid) phase = "mid";

  return { phase, hybridProgress, pickProgress, myRosterProgress };
}

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
  settings: LeagueSettings,
  currentOverallPick?: number
): PlayerWithMetrics[] {
  const available = players.filter((p) => !p.isDrafted);
  const replacementLevels = calculateReplacementLevels(available, settings);
  const scarcity = calculatePositionalScarcity(players, settings);

  // My team's players (for bye value calculation)
  const myTeamPlayers = players.filter(
    (p) => p.isDrafted && p.draftedBy === settings.myTeamNumber
  );
  const draftPhase = calculateDraftPhase(
    currentOverallPick ?? players.filter((p) => p.isDrafted).length + 1,
    settings,
    myTeamPlayers.length
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

    // Form/durability overlay to reduce projection-only bias:
    // - rewards sustained scoring history relative to projection
    // - lightly penalises thin game samples
    const avg25 = player.avgScore2025 ?? player.projScore;
    const formAdjustment = clamp((avg25 - player.projScore) * 0.35, -8, 8);
    const availabilityAdjustment =
      player.games2025 == null
        ? 0
        : clamp((player.games2025 - 18) * 0.25, -2, 1.5);

    const finalValue = bestVorp + dppBonus + formAdjustment + availabilityAdjustment;

    // Positional scarcity for this player's best position
    const positionalScarcity = scarcity[bestPos].scarcityPct;

    // Bye value relative to my team
    const byeValue = calculateByeValue(player.bye, myTeamPlayers);

    // Smart Rank is set in a second pass once finalValue can be
    // normalised against the available pool.
    const smartRank = 0;

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
      vona: null, // computed in second pass
      pickNowScore: 0,
      consistencyScore: calculateConsistencyScore(player),
      riskScore: calculateRiskScore(player),
      draftPhaseAtCalc: draftPhase.phase,
    };
  });

  // Normalise raw value to 0-100 so Smart Rank weights are comparable.
  // Without this, scarcity/bye (already 0-100) can dominate early picks.
  const availableValuePool = withMetrics
    .filter((p) => !p.isDrafted)
    .map((p) => p.finalValue);
  const finalValueMin =
    availableValuePool.length > 0 ? Math.min(...availableValuePool) : 0;
  const finalValueMax =
    availableValuePool.length > 0 ? Math.max(...availableValuePool) : 100;

  const withSmartRank = withMetrics.map((p) => {
    const finalValueNorm = normaliseMinMax(
      p.finalValue,
      finalValueMin,
      finalValueMax,
      50
    );

    return {
      ...p,
      smartRank:
        finalValueNorm * vorpWeight +
        p.positionalScarcity * scarcityWeight +
        p.byeValue * byeWeight,
    };
  });

  // Second pass: rank by finalValue, compute valueOverAdp and VONA
  const ranked = [...withSmartRank]
    .filter((p) => !p.isDrafted)
    .sort((a, b) => b.finalValue - a.finalValue);

  const rankMap = new Map<string, number>();
  ranked.forEach((p, i) => rankMap.set(p.id, i + 1));

  // Build sorted-by-finalValue lists per position for VONA
  const availableByPosition: Record<Position, PlayerWithMetrics[]> = {
    DEF: [], MID: [], RUC: [], FWD: [],
  };
  for (const p of ranked) {
    availableByPosition[p.bestVorpPosition].push(p);
  }

  // VONA map: for each player, gap to the next-best available at their position
  const vonaMap = new Map<string, number>();
  for (const pos of POSITIONS) {
    const list = availableByPosition[pos];
    for (let i = 0; i < list.length; i++) {
      const nextBest = list[i + 1];
      vonaMap.set(
        list[i].id,
        nextBest ? list[i].finalValue - nextBest.finalValue : list[i].finalValue
      );
    }
  }

  const withSecondary = withSmartRank.map((p) => {
    const rank = rankMap.get(p.id);
    return {
      ...p,
      valueOverAdp: p.adp != null && rank != null ? p.adp - rank : null,
      vona: vonaMap.get(p.id) ?? null,
    };
  });

  // Team-shape context for Pick-Now:
  // scale scarcity by how many starter slots YOU still need at that position.
  // This prevents 1-slot RUC from crowding out 5/6-slot lines unnecessarily.
  const myStarterCountByPos: Record<Position, number> = {
    DEF: 0,
    MID: 0,
    RUC: 0,
    FWD: 0,
  };
  for (const p of withSecondary) {
    if (p.isDrafted && p.draftedBy === settings.myTeamNumber) {
      myStarterCountByPos[p.bestVorpPosition] += 1;
    }
  }
  const remainingStarterNeedByPos: Record<Position, number> = {
    DEF: Math.max(0, settings.starters.DEF - myStarterCountByPos.DEF),
    MID: Math.max(0, settings.starters.MID - myStarterCountByPos.MID),
    RUC: Math.max(0, settings.starters.RUC - myStarterCountByPos.RUC),
    FWD: Math.max(0, settings.starters.FWD - myStarterCountByPos.FWD),
  };
  const maxStarterNeed = Math.max(
    1,
    ...POSITIONS.map((pos) => remainingStarterNeedByPos[pos])
  );

  const pickNowWeights = settings.pickNowWeights;
  const pickNowWeightTotal =
    pickNowWeights.avg25 +
    pickNowWeights.projection +
    pickNowWeights.consistency +
    pickNowWeights.adp +
    pickNowWeights.scarcity;
  const safeTotal = pickNowWeightTotal > 0 ? pickNowWeightTotal : 1;
  const wAvg = pickNowWeights.avg25 / safeTotal;
  const wProj = pickNowWeights.projection / safeTotal;
  const wConsistency = pickNowWeights.consistency / safeTotal;
  const wAdp = pickNowWeights.adp / safeTotal;
  const wScarcity = pickNowWeights.scarcity / safeTotal;

  const availableSecondary = withSecondary.filter((p) => !p.isDrafted);
  const smartValues = availableSecondary.map((p) => p.smartRank);
  const adpValues = availableSecondary
    .map((p) => p.adp)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const avgValues = availableSecondary.map((p) => p.avgScore2025 ?? p.projScore);
  const projValues = availableSecondary.map((p) => p.projScore);

  const smartMin = smartValues.length > 0 ? Math.min(...smartValues) : 0;
  const smartMax = smartValues.length > 0 ? Math.max(...smartValues) : 100;
  const adpMin = adpValues.length > 0 ? Math.min(...adpValues) : 1;
  const adpMax = adpValues.length > 0 ? Math.max(...adpValues) : 200;
  const avgMin = avgValues.length > 0 ? Math.min(...avgValues) : 0;
  const avgMax = avgValues.length > 0 ? Math.max(...avgValues) : 100;
  const projMin = projValues.length > 0 ? Math.min(...projValues) : 0;
  const projMax = projValues.length > 0 ? Math.max(...projValues) : 100;

  const scored = withSecondary.map((p) => {
    const smartNorm = normaliseMinMax(p.smartRank, smartMin, smartMax, 50);

    const avgNorm = normaliseMinMax(
      p.avgScore2025 ?? p.projScore,
      avgMin,
      avgMax,
      50
    );
    const projNorm = normaliseMinMax(p.projScore, projMin, projMax, 50);
    const consistencyNorm = clamp(p.consistencyScore, 0, 100);
    const adpPriorityNorm =
      p.adp != null
        ? 100 - normaliseMinMax(p.adp, adpMin, adpMax, 50)
        : 40;
    const scarcityRawNorm = clamp(p.positionalScarcity, 0, 100);
    const starterNeedScale =
      remainingStarterNeedByPos[p.bestVorpPosition] / maxStarterNeed;
    const scarcityNorm = scarcityRawNorm * starterNeedScale;

    const pickNowScore = settings.usePickNowScore
      ? wAvg * avgNorm +
        wProj * projNorm +
        wConsistency * consistencyNorm +
        wAdp * adpPriorityNorm +
        wScarcity * scarcityNorm
      : smartNorm;

    return {
      ...p,
      pickNowScore,
      draftPhaseAtCalc: draftPhase.phase,
    };
  });

  return scored;
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
  const availableForRecommendations = available.filter(
    (p) => !isSeasonLongUnavailable(p)
  );
  const scarcity = calculatePositionalScarcity(players, settings);
  const phase = available[0]?.draftPhaseAtCalc ?? "early";

  const rankedPool = [...(availableForRecommendations.length > 0 ? availableForRecommendations : available)].sort(
    (a, b) =>
      settings.usePickNowScore
        ? b.pickNowScore - a.pickNowScore
        : b.smartRank - a.smartRank
  );

  return rankedPool.slice(0, count).map((p) => {
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

    if (p.avgScore2025 != null) {
      reasons.push(`Avg25 ${p.avgScore2025.toFixed(1)}`);
    }
    reasons.push(`Projection ${p.projScore.toFixed(1)}`);
    if (p.consistencyScore >= 80) {
      reasons.push(`Strong consistency ${p.consistencyScore.toFixed(0)}`);
    }
    if (p.adp != null && p.adp <= 30) {
      reasons.push(`Market priority ADP ${p.adp.toFixed(0)}`);
    }

    if (p.notes.trim()) {
      reasons.push(`Notes: ${p.notes.trim().slice(0, 100)}${p.notes.trim().length > 100 ? "..." : ""}`);
    }

    if (reasons.length === 0) {
      reasons.push("Solid pick based on overall value");
    }

    return {
      playerId: p.id,
      playerName: p.name,
      position: p.positionString,
      smartRank: p.smartRank,
      pickNowScore: p.pickNowScore,
      draftPhase: phase,
      reasons,
    };
  });
}

// ──────────────────────────────────────────────
// Position run detection
// ──────────────────────────────────────────────

/**
 * Detect when a position is being heavily drafted in recent picks.
 * A "run" = 3+ players at the same position within the last `windowSize` picks.
 *
 * This warns you when opponents are draining a position, so you can decide
 * whether to jump in or pivot to a position that's being ignored.
 */
export function detectPositionRuns(
  draftPicks: DraftPick[],
  allPlayers: Player[],
  windowSize: number = 5
): PositionRunAlert[] {
  if (draftPicks.length < 3) return [];

  const recentPicks = draftPicks.slice(-windowSize);
  const alerts: PositionRunAlert[] = [];

  // Count positions drafted in the window
  const posCounts: Record<Position, number> = { DEF: 0, MID: 0, RUC: 0, FWD: 0 };

  for (const pick of recentPicks) {
    const player = allPlayers.find((p) => p.id === pick.playerId);
    if (!player) continue;
    // Count against primary position (first listed)
    posCounts[player.positions[0]] += 1;
  }

  for (const pos of POSITIONS) {
    if (posCounts[pos] >= 3) {
      alerts.push({
        position: pos,
        count: posCounts[pos],
        windowSize: recentPicks.length,
        message: `${pos} run: ${posCounts[pos]} of the last ${recentPicks.length} picks were ${pos} — consider acting now or pivoting`,
      });
    }
  }

  return alerts;
}

// ──────────────────────────────────────────────
// Draft pick countdown + positional forecasting
// ──────────────────────────────────────────────

/**
 * Calculate how many picks until your next turn in a snake draft,
 * and estimate how many players at each position will be gone by then.
 *
 * Snake draft order for 6 teams:
 *   Round 1: 1, 2, 3, 4, 5, 6
 *   Round 2: 6, 5, 4, 3, 2, 1
 *   Round 3: 1, 2, 3, 4, 5, 6
 *   ...
 *
 * Given currentOverallPick, we figure out where you pick next.
 */
export function calculatePickCountdown(
  currentOverallPick: number,
  settings: LeagueSettings,
  allPlayers: Player[],
  draftPicks: DraftPick[]
): DraftPickCountdown {
  const numTeams = settings.numTeams;
  const myTeam = settings.myTeamNumber; // 1-indexed

  // Find the next overall pick number belonging to myTeam
  const myNextOverallPick = findNextPickForTeam(
    currentOverallPick,
    myTeam,
    numTeams
  );
  const picksUntilMyTurn = myNextOverallPick - currentOverallPick;

  // Estimate positional attrition based on recent draft trends
  const estimatedLossByPosition = estimatePositionalAttrition(
    picksUntilMyTurn,
    draftPicks,
    allPlayers,
    numTeams
  );

  // Current available counts
  const available = allPlayers.filter((p) => !p.isDrafted);
  const projectedAvailableByPosition = {} as Record<
    Position,
    { now: number; projected: number }
  >;

  for (const pos of POSITIONS) {
    const now = available.filter((p) => p.positions.includes(pos)).length;
    projectedAvailableByPosition[pos] = {
      now,
      projected: Math.max(0, now - estimatedLossByPosition[pos]),
    };
  }

  return {
    picksUntilMyTurn,
    myNextOverallPick,
    estimatedLossByPosition,
    projectedAvailableByPosition,
  };
}

/**
 * In a snake draft with N teams, find the next overall pick for a given team.
 *
 * Pick mapping: in odd rounds team T picks at position T,
 * in even rounds team T picks at position (N+1-T).
 */
function findNextPickForTeam(
  currentOverallPick: number,
  team: number,
  numTeams: number
): number {
  // Check every pick from currentOverallPick onward
  for (let pick = currentOverallPick; pick <= currentOverallPick + 2 * numTeams; pick++) {
    const pickInRound = ((pick - 1) % numTeams) + 1; // 1-indexed within round
    const round = Math.ceil(pick / numTeams);
    const isOddRound = round % 2 === 1;

    // In odd rounds: slot 1 = team 1, slot 2 = team 2, etc.
    // In even rounds: slot 1 = team N, slot 2 = team N-1, etc.
    const teamAtThisPick = isOddRound
      ? pickInRound
      : numTeams + 1 - pickInRound;

    if (teamAtThisPick === team) return pick;
  }

  // Fallback (shouldn't happen)
  return currentOverallPick + numTeams;
}

/**
 * Estimate how many players at each position will be taken in the next N picks,
 * based on the recent draft trend.
 *
 * Uses a blend of:
 * 1. Recent positional draft rate (last 12 picks)
 * 2. Uniform baseline (when not enough history)
 */
function estimatePositionalAttrition(
  picksAhead: number,
  draftPicks: DraftPick[],
  allPlayers: Player[],
  numTeams: number
): Record<Position, number> {
  const result: Record<Position, number> = { DEF: 0, MID: 0, RUC: 0, FWD: 0 };

  if (picksAhead === 0) return result;

  // Look at the last 2 rounds of picks for rate estimation
  const windowSize = Math.min(draftPicks.length, numTeams * 2);

  if (windowSize < 3) {
    // Not enough history — assume uniform distribution
    const perPos = picksAhead / POSITIONS.length;
    for (const pos of POSITIONS) {
      result[pos] = Math.round(perPos);
    }
    return result;
  }

  const recentPicks = draftPicks.slice(-windowSize);
  const posCounts: Record<Position, number> = { DEF: 0, MID: 0, RUC: 0, FWD: 0 };

  for (const pick of recentPicks) {
    const player = allPlayers.find((p) => p.id === pick.playerId);
    if (!player) continue;
    posCounts[player.positions[0]] += 1;
  }

  // Convert counts to rates and project forward
  for (const pos of POSITIONS) {
    const rate = posCounts[pos] / windowSize;
    result[pos] = Math.round(rate * picksAhead);
  }

  return result;
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
