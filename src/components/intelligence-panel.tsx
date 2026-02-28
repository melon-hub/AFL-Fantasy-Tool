"use client";

import { useMemo } from "react";
import {
  Brain,
  TrendingUp,
  AlertTriangle,
  Clock,
  ChevronRight,
} from "lucide-react";
import clsx from "clsx";
import type { PlayerWithMetrics, DraftPick, Position } from "@/types";
import type { LeagueSettings } from "@/types";
import { POSITIONS, POSITION_COLORS } from "@/lib/constants";
import {
  generateRecommendations,
  calculatePositionalScarcity,
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

const URGENCY_COLORS = {
  low: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
  critical: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
};

export function IntelligencePanel({
  players,
  settings,
  draftPicks,
  currentOverallPick,
  onDraftClick,
}: IntelligencePanelProps) {
  const recommendations = useMemo(
    () => generateRecommendations(players, settings, 5),
    [players, settings]
  );

  const scarcity = useMemo(
    () => calculatePositionalScarcity(players, settings),
    [players, settings]
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

  return (
    <div className="flex flex-col gap-4">
      {/* Pick Countdown */}
      <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Clock className="h-3.5 w-3.5" />
          Pick Countdown
        </h3>
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

      {/* Positional Scarcity */}
      <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <TrendingUp className="h-3.5 w-3.5" />
          Position Scarcity
        </h3>
        <div className="flex flex-col gap-2">
          {POSITIONS.map((pos) => {
            const s = scarcity[pos];
            return (
              <div key={pos} className="flex items-center gap-2">
                <span className="w-8 text-xs font-medium text-zinc-600 dark:text-zinc-400">
                  {pos}
                </span>
                <div className="flex-1">
                  <div className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <div
                      className={clsx(
                        "h-full rounded-full transition-all",
                        s.urgency === "critical"
                          ? "bg-red-500"
                          : s.urgency === "high"
                            ? "bg-orange-500"
                            : s.urgency === "medium"
                              ? "bg-yellow-500"
                              : "bg-green-500"
                      )}
                      style={{ width: `${s.scarcityPct}%` }}
                    />
                  </div>
                </div>
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    URGENCY_COLORS[s.urgency]
                  )}
                >
                  {s.urgency}
                </span>
                <span className="w-16 text-right text-xs text-zinc-500">
                  {s.availableCount} left
                </span>
              </div>
            );
          })}
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

      {/* Top Recommendations */}
      <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Brain className="h-3.5 w-3.5" />
          Recommendations
        </h3>
        <div className="flex flex-col gap-2">
          {recommendations.map((rec, i) => (
            <button
              key={rec.playerId}
              onClick={() => onDraftClick(rec.playerId)}
              className="group flex items-start gap-2 rounded-lg p-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                {i + 1}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {rec.playerName}
                  </span>
                  <span className="text-xs text-zinc-500">{rec.position}</span>
                  <span className="ml-auto font-mono text-xs text-zinc-400">
                    {rec.smartRank.toFixed(1)}
                  </span>
                </div>
                {rec.reasons.slice(0, 2).map((reason, j) => (
                  <p
                    key={j}
                    className="text-xs text-zinc-500 dark:text-zinc-400"
                  >
                    {reason}
                  </p>
                ))}
              </div>
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 group-hover:text-zinc-500" />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
