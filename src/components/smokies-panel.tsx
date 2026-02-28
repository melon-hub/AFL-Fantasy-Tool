"use client";

import { useMemo } from "react";
import { Flame, AlertCircle } from "lucide-react";
import clsx from "clsx";
import type { PlayerWithMetrics, Position } from "@/types";
import type { LeagueSettings } from "@/types";
import { POSITIONS, POSITION_COLORS } from "@/lib/constants";
import { calculatePositionalScarcity } from "@/lib/vorp";

interface SmokiesPanelProps {
  players: PlayerWithMetrics[];
  settings: LeagueSettings;
  onDraftClick: (playerId: string) => void;
}

export function SmokiesPanel({
  players,
  settings,
  onDraftClick,
}: SmokiesPanelProps) {
  const smokies = useMemo(
    () =>
      players
        .filter((p) => p.category === "smoky" && !p.isDrafted)
        .sort((a, b) => b.finalValue - a.finalValue),
    [players]
  );

  const draftedSmokies = useMemo(
    () => players.filter((p) => p.category === "smoky" && p.isDrafted),
    [players]
  );

  const scarcity = useMemo(
    () => calculatePositionalScarcity(players, settings),
    [players, settings]
  );

  // Generate dynamic alerts: when a position's premiums are depleted,
  // suggest the best smoky at that position
  const alerts = useMemo(() => {
    const result: { message: string; playerId: string | null }[] = [];
    for (const pos of POSITIONS) {
      const s = scarcity[pos];
      if (s.urgency === "high" || s.urgency === "critical") {
        const bestSmoky = smokies.find((p) => p.positions.includes(pos));
        if (bestSmoky) {
          result.push({
            message: `${pos} premiums ${s.urgency === "critical" ? "almost gone" : "getting scarce"} (${s.premiumsLeft} left) — consider ${bestSmoky.name} (${bestSmoky.finalValue.toFixed(1)} value${bestSmoky.smokyNote ? `: ${bestSmoky.smokyNote}` : ""})`,
            playerId: bestSmoky.id,
          });
        }
      }
    }
    return result;
  }, [scarcity, smokies]);

  return (
    <div className="flex flex-col gap-4">
      {/* Alerts */}
      {alerts.length > 0 && (
        <section className="flex flex-col gap-2">
          {alerts.map((alert, i) => (
            <button
              key={i}
              onClick={() => alert.playerId && onDraftClick(alert.playerId)}
              className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-left transition-colors hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/50 dark:hover:bg-orange-950"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600 dark:text-orange-400" />
              <p className="text-sm text-orange-800 dark:text-orange-200">
                {alert.message}
              </p>
            </button>
          ))}
        </section>
      )}

      {/* Available smokies */}
      <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-700">
        <h3 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Flame className="h-3.5 w-3.5 text-orange-500" />
          Available Smokies ({smokies.length})
        </h3>
        {smokies.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No smokies available. All have been drafted or none tagged.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {smokies.map((p) => (
              <button
                key={p.id}
                onClick={() => onDraftClick(p.id)}
                className="flex items-start gap-3 rounded-lg p-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {p.name}
                    </span>
                    <div className="flex gap-1">
                      {p.positions.map((pos) => (
                        <span
                          key={pos}
                          className={clsx(
                            "rounded px-1.5 py-0.5 text-xs font-medium text-white",
                            POSITION_COLORS[pos]
                          )}
                        >
                          {pos}
                        </span>
                      ))}
                    </div>
                    <span className="text-xs text-zinc-400">{p.club}</span>
                  </div>
                  {p.smokyNote && (
                    <p className="mt-0.5 text-sm text-orange-700 dark:text-orange-300">
                      {p.smokyNote}
                    </p>
                  )}
                  <div className="mt-1 flex gap-3 text-xs text-zinc-500">
                    <span>
                      Proj: <strong>{p.projScore.toFixed(1)}</strong>
                    </span>
                    <span>
                      VORP: <strong>{p.vorp.toFixed(1)}</strong>
                    </span>
                    <span>
                      Value: <strong>{p.finalValue.toFixed(1)}</strong>
                    </span>
                    <span>Bye: R{p.bye}</span>
                    {p.adp && <span>ADP: {p.adp}</span>}
                  </div>
                </div>
                <span className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white">
                  Draft
                </span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Drafted smokies */}
      {draftedSmokies.length > 0 && (
        <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Drafted Smokies
          </h3>
          <div className="flex flex-wrap gap-1">
            {draftedSmokies.map((p) => (
              <span
                key={p.id}
                className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-500 line-through dark:bg-zinc-800"
              >
                {p.name} (T{p.draftedBy})
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
