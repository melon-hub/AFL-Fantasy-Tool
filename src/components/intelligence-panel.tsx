"use client";

import { useMemo } from "react";
import {
  Flame,
  AlertTriangle,
  Clock,
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

function textIndicatesSeasonOut(text: string): boolean {
  const lower = text.toLowerCase();
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

  const teamBalance = useMemo(() => {
    const counts: Record<Position, number> = { DEF: 0, MID: 0, RUC: 0, FWD: 0 };
    for (const p of myDraftedPlayers) {
      counts[getIntendedRosterPosition(p)] += 1;
    }

    const coreTargets: Record<Position, number> = {
      DEF: settings.starters.DEF + settings.emergencies.DEF,
      MID: settings.starters.MID + settings.emergencies.MID,
      RUC: settings.starters.RUC + settings.emergencies.RUC,
      FWD: settings.starters.FWD + settings.emergencies.FWD,
    };

    const coreRemaining = POSITIONS.reduce(
      (sum, pos) => sum + Math.max(0, coreTargets[pos] - counts[pos]),
      0
    );

    const totalTeamSlots =
      Object.values(settings.starters).reduce((sum, n) => sum + n, 0) +
      Object.values(settings.emergencies).reduce((sum, n) => sum + n, 0) +
      settings.benchSize;

    const totalRemaining = Math.max(0, totalTeamSlots - myDraftedCount);
    const flexBenchRemaining = Math.max(0, totalRemaining - coreRemaining);

    return {
      counts,
      coreTargets,
      coreRemaining,
      totalRemaining,
      flexBenchRemaining,
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
      .slice(0, 8);
  }, [players, countdown.myNextOverallPick]);

  return (
    <div className="flex flex-col gap-4">
      {/* Pick Countdown */}
      <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Clock className="h-3.5 w-3.5" />
          Pick Countdown
        </h3>
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xs text-zinc-500">Current Phase</span>
          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
            {phaseState.phase.toUpperCase()}
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {countdown.picksUntilMyTurn}
          </span>
          <span className="text-sm text-zinc-500">
            picks until yours (#{countdown.myNextOverallPick})
          </span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {POSITIONS.map((pos) => {
            const proj = countdown.projectedAvailableByPosition[pos];
            return (
              <div key={pos} className="text-center">
                <span
                  className={clsx(
                    "inline-block rounded px-1.5 py-0.5 text-xs font-medium text-white",
                    POSITION_COLORS[pos]
                  )}
                >
                  {pos}
                </span>
                <p className="mt-0.5 font-mono text-xs text-zinc-600 dark:text-zinc-400">
                  {proj.now} → {proj.projected}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* My Team Balance */}
      <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Users className="h-3.5 w-3.5" />
          My Team Balance
        </h3>
        <p className="mb-2 text-xs text-zinc-500">
          DPP intent mapping: FWD → DEF → RUC (then MID).
        </p>

        <div className="flex flex-col gap-2">
          {POSITIONS.map((pos) => {
            const count = teamBalance.counts[pos];
            const target = teamBalance.coreTargets[pos];
            const need = Math.max(0, target - count);
            const pct = Math.min(100, Math.round((count / Math.max(1, target)) * 100));

            return (
              <div key={pos} className="flex items-center gap-2">
                <span className="w-8 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {pos}
                </span>
                <div className="flex-1">
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
                <span className="w-16 text-right font-mono text-xs text-zinc-500">
                  {count}/{target}
                </span>
                <span
                  className={clsx(
                    "w-14 text-right text-xs",
                    need > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"
                  )}
                >
                  {need > 0 ? `need ${need}` : "filled"}
                </span>
              </div>
            );
          })}
        </div>

        <div className="mt-3 border-t border-zinc-200 pt-2 text-xs text-zinc-500 dark:border-zinc-700">
          <p>
            Core spots left: <strong className="text-zinc-700 dark:text-zinc-300">{teamBalance.coreRemaining}</strong>
          </p>
          <p>
            Flex bench left: <strong className="text-zinc-700 dark:text-zinc-300">{teamBalance.flexBenchRemaining}</strong>
          </p>
          <p>
            Team slots remaining: <strong className="text-zinc-700 dark:text-zinc-300">{teamBalance.totalRemaining}</strong>
          </p>
        </div>
      </section>

      {/* Position Run Alerts */}
      {positionRuns.length > 0 && (
        <section className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/50">
          <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            Position Run
          </h3>
          {positionRuns.map((alert, i) => (
            <p
              key={i}
              className="text-sm text-amber-800 dark:text-amber-200"
            >
              {alert.message}
            </p>
          ))}
        </section>
      )}

      {/* Smokies Near Next Pick */}
      <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Flame className="h-3.5 w-3.5 text-orange-500" />
          Smokies Near Next Pick
        </h3>

        {smokiesForNextPick.length === 0 ? (
          <p className="text-sm text-zinc-500">No smoky candidates available right now.</p>
        ) : (
          <div className="flex flex-col gap-2">
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
                  className="group flex items-start gap-2 rounded-lg p-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700 dark:bg-orange-900 dark:text-orange-300">
                    {i + 1}
                  </span>
                  <div className="flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                        {p.name}
                      </span>
                      <span className="text-xs text-zinc-500">{p.positionString}</span>
                      <span className="ml-auto font-mono text-xs text-zinc-400">
                        NPV {entry.nextPickValueScore.toFixed(1)}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {adpText} · {urgencyText}
                    </p>
                    <p className="text-xs text-orange-700 dark:text-orange-300">
                      {p.smokyNote || p.notes || "Smoky upside based on role/value profile."}
                    </p>
                  </div>
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 group-hover:text-zinc-500" />
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
