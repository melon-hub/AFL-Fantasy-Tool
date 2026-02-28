"use client";

import { useMemo } from "react";
import {
  Flame,
  AlertTriangle,
  Clock,
  History,
  ChevronRight,
  Users,
} from "lucide-react";
import clsx from "clsx";
import type { PlayerWithMetrics, DraftPick, Position } from "@/types";
import type { LeagueSettings } from "@/types";
import { POSITIONS, POSITION_COLORS } from "@/lib/constants";
import {
  calculateDraftPhase,
  detectPositionRuns,
  calculatePickCountdown,
} from "@/lib/vorp";

interface IntelligencePanelProps {
  players: PlayerWithMetrics[];
  settings: LeagueSettings;
  draftPicks: DraftPick[];
  currentOverallPick: number;
  onDraftClick: (playerId: string) => void;
}

const PRIORITY_INTENDED_POSITION: Position[] = ["FWD", "DEF", "RUC", "MID"];
const MINI_LINEUP_COLORS: Record<Position, string> = {
  DEF: "#3b82f6",
  MID: "#22c55e",
  RUC: "#a855f7",
  FWD: "#ef4444",
};

function textIndicatesSeasonOut(text: string | null | undefined): boolean {
  const lower = typeof text === "string" ? text.toLowerCase() : "";
  return (
    lower.includes("out for season") ||
    lower.includes("season-ending") ||
    lower.includes("season ending") ||
    lower.includes("season over") ||
    lower.includes("injury: season") ||
    lower.includes("miss the season") ||
    lower.includes("miss the entirety")
  );
}

function isSeasonLongUnavailable(player: PlayerWithMetrics): boolean {
  return textIndicatesSeasonOut(player.injury) || textIndicatesSeasonOut(player.notes);
}

function getIntendedRosterPosition(player: PlayerWithMetrics): Position {
  for (const pos of PRIORITY_INTENDED_POSITION) {
    if (player.positions.includes(pos)) return pos;
  }
  return player.positions[0] ?? "MID";
}

function getSurnameLabel(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const surname = parts[parts.length - 1] ?? name.trim();
  if (!surname) return "—";
  return surname.length > 11 ? `${surname.slice(0, 11)}…` : surname;
}

export function IntelligencePanel({
  players,
  settings,
  draftPicks,
  currentOverallPick,
  onDraftClick,
}: IntelligencePanelProps) {
  const myDraftedPlayers = useMemo(
    () => players.filter((p) => p.isDrafted && p.draftedBy === settings.myTeamNumber),
    [players, settings.myTeamNumber]
  );

  const myDraftedCount = myDraftedPlayers.length;

  const phaseState = useMemo(
    () => calculateDraftPhase(currentOverallPick, settings, myDraftedCount),
    [currentOverallPick, myDraftedCount, settings]
  );

  const positionRuns = useMemo(
    () => detectPositionRuns(draftPicks, players),
    [draftPicks, players]
  );

  const countdown = useMemo(
    () =>
      calculatePickCountdown(
        currentOverallPick,
        settings,
        players,
        draftPicks
      ),
    [currentOverallPick, settings, players, draftPicks]
  );

  const myRecentPicks = useMemo(
    () =>
      draftPicks
        .filter((pick) => pick.teamNumber === settings.myTeamNumber)
        .slice(-5)
        .reverse(),
    [draftPicks, settings.myTeamNumber]
  );

  const teamBalance = useMemo(() => {
    const counts: Record<Position, number> = { DEF: 0, MID: 0, RUC: 0, FWD: 0 };
    for (const p of myDraftedPlayers) {
      counts[getIntendedRosterPosition(p)] += 1;
    }

    const starterTargets: Record<Position, number> = {
      DEF: settings.starters.DEF,
      MID: settings.starters.MID,
      RUC: settings.starters.RUC,
      FWD: settings.starters.FWD,
    };

    const interchangeSlots =
      Object.values(settings.emergencies).reduce((sum, n) => sum + n, 0) +
      settings.benchSize;

    // Interchange guide:
    // 1 spare ruck, then split remaining slots across DEF/MID/FWD.
    const backupTargets: Record<Position, number> = { DEF: 0, MID: 0, RUC: 0, FWD: 0 };
    if (interchangeSlots > 0) {
      backupTargets.RUC = 1;
    }

    const remainingNonRuckBackups = Math.max(0, interchangeSlots - backupTargets.RUC);
    const nonRuckOrder: Position[] = ["DEF", "MID", "FWD"];
    const basePerNonRuck = Math.floor(remainingNonRuckBackups / nonRuckOrder.length);
    for (const pos of nonRuckOrder) {
      backupTargets[pos] = basePerNonRuck;
    }
    let remainder = remainingNonRuckBackups - basePerNonRuck * nonRuckOrder.length;
    for (const pos of nonRuckOrder) {
      if (remainder <= 0) break;
      backupTargets[pos] += 1;
      remainder -= 1;
    }

    const guideTargets: Record<Position, number> = {
      DEF: starterTargets.DEF + backupTargets.DEF,
      MID: starterTargets.MID + backupTargets.MID,
      RUC: starterTargets.RUC + backupTargets.RUC,
      FWD: starterTargets.FWD + backupTargets.FWD,
    };

    const byPosition = POSITIONS.map((pos) => {
      const totalCount = counts[pos];
      const primaryTarget = starterTargets[pos];
      const benchTarget = backupTargets[pos];

      const primaryFilled = Math.min(totalCount, primaryTarget);
      const primaryNeed = Math.max(0, primaryTarget - primaryFilled);

      const remainingAfterPrimary = Math.max(0, totalCount - primaryTarget);
      const benchFilled = Math.min(remainingAfterPrimary, benchTarget);
      const benchNeed = Math.max(0, benchTarget - benchFilled);
      const overflow = Math.max(0, remainingAfterPrimary - benchTarget);

      return {
        pos,
        totalCount,
        primaryTarget,
        primaryFilled,
        primaryNeed,
        benchTarget,
        benchFilled,
        benchNeed,
        overflow,
        guideTarget: guideTargets[pos],
      };
    });

    const primaryRemaining = byPosition.reduce((sum, row) => sum + row.primaryNeed, 0);
    const benchRemaining = byPosition.reduce((sum, row) => sum + row.benchNeed, 0);
    const guideRemaining = primaryRemaining + benchRemaining;

    const totalTeamSlots = Object.values(starterTargets).reduce((sum, n) => sum + n, 0) + interchangeSlots;

    const totalRemaining = Math.max(0, totalTeamSlots - myDraftedCount);

    return {
      counts,
      starterTargets,
      backupTargets,
      guideTargets,
      byPosition,
      primaryRemaining,
      benchRemaining,
      guideRemaining,
      totalRemaining,
      interchangeSlots,
      totalTeamSlots,
    };
  }, [myDraftedPlayers, myDraftedCount, settings]);

  const smokiesForNextPick = useMemo(() => {
    const nextPick = countdown.myNextOverallPick;
    return players
      .filter(
        (p) =>
          !p.isDrafted &&
          p.category === "smoky" &&
          !isSeasonLongUnavailable(p)
      )
      .map((p) => {
        const adp = p.adp ?? nextPick + 24;
        const urgencyBeforeNextPick = Math.max(0, nextPick - adp);
        const valueSignal = Math.max(0, p.adpValueGap ?? 0);
        const vonaSignal = Math.max(0, p.vona ?? 0);

        // Higher score => stronger case to take before your next turn.
        const nextPickValueScore =
          p.pickNowScore +
          urgencyBeforeNextPick * 2.2 +
          valueSignal * 1.1 +
          vonaSignal * 0.7 -
          p.riskScore * 0.08;

        return {
          player: p,
          nextPickValueScore,
          urgencyBeforeNextPick,
          nextPick,
        };
      })
      .sort((a, b) => b.nextPickValueScore - a.nextPickValueScore)
      .slice(0, 4);
  }, [players, countdown.myNextOverallPick]);

  const miniStarterLineup = useMemo(() => {
    const grouped: Record<Position, PlayerWithMetrics[]> = {
      DEF: [],
      MID: [],
      RUC: [],
      FWD: [],
    };

    for (const player of myDraftedPlayers) {
      grouped[getIntendedRosterPosition(player)].push(player);
    }

    for (const pos of POSITIONS) {
      grouped[pos].sort((a, b) => b.projScore - a.projScore);
    }

    return POSITIONS.map((pos) => {
      const starters = grouped[pos].slice(0, settings.starters[pos]);
      const labels = Array.from({ length: settings.starters[pos] }, (_, index) =>
        starters[index] ? getSurnameLabel(starters[index].name) : "—"
      );
      return { pos, labels };
    });
  }, [myDraftedPlayers, settings.starters]);

  return (
    <div className="grid auto-rows-min grid-cols-2 gap-2">
      {/* Pick Countdown */}
      <section className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-700">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <Clock className="h-3.5 w-3.5" />
          Pick Countdown
        </h3>
        <div className="mb-1.5 flex items-center gap-2">
          <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
            {phaseState.phase.toUpperCase()}
          </span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
            {countdown.picksUntilMyTurn}
          </span>
          <span className="text-[11px] text-zinc-500">to #{countdown.myNextOverallPick}</span>
        </div>
        <div className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5">
          {POSITIONS.map((pos) => {
            const proj = countdown.projectedAvailableByPosition[pos];
            return (
              <div key={pos} className="flex items-center justify-between text-[11px]">
                <span className={clsx("rounded px-1 py-0.5 font-medium text-white", POSITION_COLORS[pos])}>
                  {pos}
                </span>
                <span className="font-mono text-zinc-500">
                  {proj.now}{" > "}{proj.projected}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      {/* My Recent Picks */}
      <section className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-700">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <History className="h-3.5 w-3.5" />
          My Last 5
        </h3>
        {myRecentPicks.length === 0 ? (
          <p className="text-[11px] text-zinc-500">No picks yet.</p>
        ) : (
          <div className="space-y-1">
            {myRecentPicks.map((pick) => (
              <div key={`${pick.playerId}-${pick.overallPick}`} className="flex items-center gap-1.5 text-[11px]">
                <span className="w-7 shrink-0 font-mono text-zinc-500">#{pick.overallPick}</span>
                <span className="min-w-0 flex-1 truncate text-zinc-800 dark:text-zinc-200">
                  {pick.playerName}
                </span>
                <span className="shrink-0 rounded bg-zinc-100 px-1 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  {pick.position}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* My Team Balance */}
      <section className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-700">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Users className="h-3.5 w-3.5" />
          My Team Balance
        </h3>

        <div className="flex flex-col gap-1">
          {teamBalance.byPosition.map((row) => {
            return (
              <div key={row.pos} className="rounded border border-zinc-200 px-2 py-1.5 dark:border-zinc-700">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                    {row.pos}
                  </span>
                  <span className="font-mono text-zinc-500">
                    P {row.primaryFilled}/{row.primaryTarget} · B {row.benchFilled}/{row.benchTarget}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between text-sm">
                  <span
                    className={clsx(
                      row.primaryNeed + row.benchNeed > 0
                        ? "text-amber-600 dark:text-amber-400"
                        : "text-green-600 dark:text-green-400"
                    )}
                  >
                    need P{row.primaryNeed} B{row.benchNeed}
                  </span>
                  {row.overflow > 0 && (
                    <span className="text-rose-600 dark:text-rose-400">
                      +{row.overflow} over
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-1.5 border-t border-zinc-200 pt-1.5 text-xs text-zinc-500 dark:border-zinc-700">
          Need P
          <strong className="px-1 text-zinc-700 dark:text-zinc-300">{teamBalance.primaryRemaining}</strong>
          B
          <strong className="px-1 text-zinc-700 dark:text-zinc-300">{teamBalance.benchRemaining}</strong>
          · Slots left
          <strong className="pl-1 text-zinc-700 dark:text-zinc-300">{teamBalance.totalRemaining}</strong>
        </div>

      </section>

      {/* Position Run Alerts */}
      {positionRuns.length > 0 && (
        <section className="col-span-2 rounded-lg border border-amber-300 bg-amber-50 p-2.5 dark:border-amber-700 dark:bg-amber-950/50">
          <h3 className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Position Run
          </h3>
          {positionRuns.map((alert, i) => (
            <p
              key={i}
              className="text-[11px] text-amber-800 dark:text-amber-200"
            >
              {alert.message}
            </p>
          ))}
        </section>
      )}

      {/* Smokies Near Next Pick */}
      <section className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-700">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Flame className="h-3.5 w-3.5 text-orange-500" />
          Smokies Near Next Pick
        </h3>

        {smokiesForNextPick.length === 0 ? (
          <p className="text-sm text-zinc-500">No smoky candidates available right now.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {smokiesForNextPick.map((entry, i) => {
              const p = entry.player;
              const adp = p.adp;
              const adpText = adp == null ? "ADP n/a" : `ADP ${adp.toFixed(0)}`;
              const urgencyText =
                adp == null
                  ? "Unknown availability"
                  : entry.urgencyBeforeNextPick > 0
                    ? `Likely gone before pick #${entry.nextPick}`
                    : `Could still be there at #${entry.nextPick}`;

              return (
                <button
                  key={p.id}
                  onClick={() => onDraftClick(p.id)}
                  className="group flex min-w-0 items-start gap-2 rounded-lg p-1.5 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {p.name}
                      </span>
                      <span className="shrink-0 text-[10px] text-zinc-500">{p.positionString}</span>
                    </div>
                    <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                      NPV {entry.nextPickValueScore.toFixed(1)} · {adpText}
                    </p>
                    <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                      {urgencyText}
                    </p>
                    <p className="line-clamp-1 text-[11px] text-orange-700 dark:text-orange-300">
                      {(p.smokyNote || p.notes || "Smoky upside based on role/value profile.")
                        .replace(/\s+/g, " ")
                        .trim()
                        .slice(0, 110)}
                    </p>
                  </div>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 group-hover:text-zinc-500" />
                </button>
              );
            })}
          </div>
        )}
      </section>

      <section className="col-span-2 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-700">
        <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          Starter Map (Last Names)
        </h3>
        <svg
          viewBox="0 0 400 132"
          className="h-[132px] w-full"
          role="img"
          aria-label="Starter lineup map by position"
        >
          <rect x="0" y="0" width="400" height="132" rx="10" fill="#0a0f1a" />
          {miniStarterLineup.map((row, rowIndex) => {
            const y = 18 + rowIndex * 29;
            const total = row.labels.length;
            return (
              <g key={row.pos}>
                <text x="11" y={y + 5} fill="#94a3b8" fontSize="11" fontWeight="700">
                  {row.pos}
                </text>
                {row.labels.map((label, index) => {
                  const x =
                    total <= 1
                      ? 225
                      : 90 + (index * 282) / Math.max(1, total - 1);
                  const isEmpty = label === "—";
                  return (
                    <g key={`${row.pos}-${index}`}>
                      <rect
                        x={x - 24}
                        y={y - 9}
                        width="48"
                        height="18"
                        rx="4"
                        fill={isEmpty ? "#1f2937" : MINI_LINEUP_COLORS[row.pos]}
                        opacity={isEmpty ? 0.45 : 0.95}
                      />
                      <text
                        x={x}
                        y={y + 4}
                        fill={isEmpty ? "#64748b" : "#ffffff"}
                        fontSize="9"
                        textAnchor="middle"
                        fontWeight={isEmpty ? "500" : "700"}
                      >
                        {label}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </section>
    </div>
  );
}
