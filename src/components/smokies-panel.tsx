"use client";

import { useMemo, useState } from "react";
import { Flame, AlertCircle } from "lucide-react";
import clsx from "clsx";
import type { PlayerWithMetrics } from "@/types";
import type { LeagueSettings } from "@/types";
import { POSITIONS, POSITION_COLORS } from "@/lib/constants";
import { calculatePositionalScarcity } from "@/lib/vorp";

const PREMIUM_ADP_CUTOFF = 50;
const PREMIUM_PROJ_CUTOFF = 90;

interface SmokiesPanelProps {
  players: PlayerWithMetrics[];
  settings: LeagueSettings;
  onDraftClick: (playerId: string) => void;
}

function isPremiumPricedSmoky(player: PlayerWithMetrics): boolean {
  const adpPremium = player.adp != null && player.adp <= PREMIUM_ADP_CUTOFF;
  const projectionPremium = player.projScore >= PREMIUM_PROJ_CUTOFF;
  return adpPremium || projectionPremium;
}

export function SmokiesPanel({
  players,
  settings,
  onDraftClick,
}: SmokiesPanelProps) {
  const [showPremiumTagged, setShowPremiumTagged] = useState(false);

  const smokies = useMemo(
    () =>
      players
        .filter((p) => p.category === "smoky" && !p.isDrafted)
        .sort((a, b) => b.finalValue - a.finalValue),
    [players]
  );

  const trueSmokies = useMemo(
    () => smokies.filter((p) => !isPremiumPricedSmoky(p)),
    [smokies]
  );

  const premiumTaggedSmokies = useMemo(
    () => smokies.filter((p) => isPremiumPricedSmoky(p)),
    [smokies]
  );

  const draftedSmokies = useMemo(
    () => players.filter((p) => p.category === "smoky" && p.isDrafted),
    [players]
  );
  const draftedByMeCount = useMemo(
    () =>
      draftedSmokies.filter((p) => p.draftedBy === settings.myTeamNumber).length,
    [draftedSmokies, settings.myTeamNumber]
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
        const bestSmoky = trueSmokies.find((p) => p.positions.includes(pos));
        if (bestSmoky) {
          result.push({
            message: `${pos} premiums ${s.urgency === "critical" ? "almost gone" : "getting scarce"} (${s.premiumsLeft} left) — consider ${bestSmoky.name} (${bestSmoky.finalValue.toFixed(1)} value${bestSmoky.smokyNote ? `: ${bestSmoky.smokyNote}` : ""})`,
            playerId: bestSmoky.id,
          });
        }
      }
    }
    return result;
  }, [scarcity, trueSmokies]);

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
          Available Smokies ({trueSmokies.length})
        </h3>
        <div className="mb-3 flex items-center justify-between rounded bg-zinc-50 px-2 py-1.5 text-xs text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
          <span>
            Hidden premium-priced smoky tags:{" "}
            <strong className="text-zinc-700 dark:text-zinc-300">
              {premiumTaggedSmokies.length}
            </strong>
          </span>
          {premiumTaggedSmokies.length > 0 && (
            <button
              onClick={() => setShowPremiumTagged((v) => !v)}
              className="rounded border border-zinc-300 px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {showPremiumTagged ? "Hide" : "Show"} premium tags
            </button>
          )}
        </div>
        {trueSmokies.length === 0 ? (
          <p className="text-sm text-zinc-400">
            No true smokies available. All are drafted or flagged as premium-priced.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {trueSmokies.map((p) => (
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
                    {p.avgScore2025 != null && (
                      <span>
                        Avg25: <strong>{p.avgScore2025.toFixed(1)}</strong>
                      </span>
                    )}
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

        {showPremiumTagged && premiumTaggedSmokies.length > 0 && (
          <div className="mt-4 rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Premium-Priced Smoky Tags ({premiumTaggedSmokies.length})
            </h4>
            <div className="flex flex-col gap-2">
              {premiumTaggedSmokies.map((p) => (
                <button
                  key={p.id}
                  onClick={() => onDraftClick(p.id)}
                  className="flex items-center gap-2 rounded p-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">
                    {p.name}
                  </span>
                  <span className="text-xs text-zinc-500">{p.positionString}</span>
                  {p.adp != null && (
                    <span className="ml-auto rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      ADP {Math.round(p.adp)}
                    </span>
                  )}
                  {p.avgScore2025 != null && (
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      Avg25 {p.avgScore2025.toFixed(1)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Drafted smokies */}
      {draftedSmokies.length > 0 && (
        <section className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700">
          <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-zinc-500">
            <span>Drafted Smokies</span>
            <span className="text-[11px] font-medium normal-case tracking-normal text-zinc-500">
              You drafted {draftedByMeCount}
            </span>
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {draftedSmokies.map((p) => (
              <span
                key={p.id}
                className={clsx(
                  "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs line-through",
                  p.draftedBy === settings.myTeamNumber
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800"
                )}
              >
                <span>{p.name}</span>
                {p.draftedBy === settings.myTeamNumber ? (
                  <span className="rounded bg-emerald-200 px-1 py-0 text-[10px] font-semibold uppercase leading-4 text-emerald-900 dark:bg-emerald-800 dark:text-emerald-100">
                    You
                  </span>
                ) : (
                  <span className="rounded bg-zinc-200 px-1 py-0 text-[10px] font-semibold uppercase leading-4 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200">
                    {p.draftedBy ? `T${p.draftedBy}` : "—"}
                  </span>
                )}
              </span>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
