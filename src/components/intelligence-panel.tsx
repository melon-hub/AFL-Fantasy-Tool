"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Clock,
  History,
  ListOrdered,
  Users,
} from "lucide-react";
import clsx from "clsx";
import type { PlayerWithMetrics, DraftPick, Position } from "@/types";
import type { LeagueSettings } from "@/types";
import { POSITIONS } from "@/lib/constants";
import {
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
const SHORTLIST_STORAGE_KEY = "afl:draft-board:shortlist:v1";
const SHORTLIST_ORDER_STORAGE_KEY = "afl:draft-board:shortlist-order:v1";
const SHORTLIST_UPDATED_EVENT = "afl:shortlist-updated";
const MINI_LINEUP_COLORS: Record<Position, string> = {
  DEF: "#3b82f6",
  MID: "#22c55e",
  RUC: "#a855f7",
  FWD: "#ef4444",
};

interface ShortlistState {
  ids: string[];
  order: string[];
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
  return surname.length > 9 ? `${surname.slice(0, 9)}…` : surname;
}

function readShortlistState(): ShortlistState {
  if (typeof window === "undefined") return { ids: [], order: [] };

  try {
    const rawIds = window.localStorage.getItem(SHORTLIST_STORAGE_KEY);
    const parsedIds = rawIds ? JSON.parse(rawIds) : [];
    const ids = Array.isArray(parsedIds)
      ? parsedIds.filter((id): id is string => typeof id === "string")
      : [];

    const rawOrder = window.localStorage.getItem(SHORTLIST_ORDER_STORAGE_KEY);
    const parsedOrder = rawOrder ? JSON.parse(rawOrder) : [];
    const order = Array.isArray(parsedOrder)
      ? parsedOrder.filter((id): id is string => typeof id === "string")
      : [];

    return { ids, order };
  } catch {
    return { ids: [], order: [] };
  }
}

export function IntelligencePanel({
  players,
  settings,
  draftPicks,
  currentOverallPick,
  onDraftClick,
}: IntelligencePanelProps) {
  const [shortlistState, setShortlistState] = useState<ShortlistState>({
    ids: [],
    order: [],
  });

  useEffect(() => {
    const refresh = () => {
      setShortlistState(readShortlistState());
    };

    refresh();
    window.addEventListener(SHORTLIST_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(SHORTLIST_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const myDraftedPlayers = useMemo(
    () => players.filter((p) => p.isDrafted && p.draftedBy === settings.myTeamNumber),
    [players, settings.myTeamNumber]
  );

  const myDraftedCount = myDraftedPlayers.length;

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

  const leagueRecentPicks = useMemo(
    () => draftPicks.slice(-5).reverse(),
    [draftPicks]
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

  const shortlistRows = useMemo(() => {
    if (shortlistState.ids.length === 0) return [];

    const playersById = new Map(players.map((p) => [p.id, p]));
    const shortlistSet = new Set(shortlistState.ids);
    const orderedKnown = shortlistState.order.filter((id) => shortlistSet.has(id));
    const orderedSet = new Set(orderedKnown);
    const mergedOrder = [
      ...orderedKnown,
      ...shortlistState.ids.filter((id) => !orderedSet.has(id)),
    ];

    return mergedOrder
      .map((id, idx) => {
        const player = playersById.get(id);
        if (!player) return null;
        return {
          rank: idx + 1,
          player,
        };
      })
      .filter((entry): entry is { rank: number; player: PlayerWithMetrics } => entry !== null);
  }, [players, shortlistState.ids, shortlistState.order]);

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
      <section className="col-span-2 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-700">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <Clock className="h-3.5 w-3.5" />
          Pick Countdown
        </h3>
        {countdown.picksUntilMyTurn <= 0 ? (
          <p className="text-sm font-medium text-green-600 dark:text-green-400">
            You are on the clock.
          </p>
        ) : (
          <p className="text-sm text-zinc-500">
            <strong className="text-lg leading-none text-zinc-900 dark:text-zinc-100">
              {countdown.picksUntilMyTurn}
            </strong>{" "}
            picks until your turn
          </p>
        )}
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

      {/* League Recent Picks */}
      <section className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-700">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          <History className="h-3.5 w-3.5" />
          League Last 5
        </h3>
        {leagueRecentPicks.length === 0 ? (
          <p className="text-[11px] text-zinc-500">No picks yet.</p>
        ) : (
          <div className="space-y-1">
            {leagueRecentPicks.map((pick) => (
              <div key={`${pick.playerId}-${pick.overallPick}-league`} className="flex items-center gap-1.5 text-[11px]">
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
      <section className="col-span-2 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-700">
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Users className="h-3.5 w-3.5" />
          My Team Balance
        </h3>

        <div className="grid grid-cols-4 gap-1.5">
          {teamBalance.byPosition.map((row) => {
            return (
              <div
                key={row.pos}
                className="rounded border border-zinc-200 px-2 py-1.5 dark:border-zinc-700"
              >
                <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {row.pos}
                </div>
                <div className="font-mono text-[11px] text-zinc-500 whitespace-nowrap">
                  P {row.primaryFilled}/{row.primaryTarget} B {row.benchFilled}/{row.benchTarget}
                </div>
                <div
                  className={clsx(
                    "text-[10px] font-medium",
                    row.primaryNeed + row.benchNeed > 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-green-600 dark:text-green-400"
                  )}
                >
                  P{row.primaryNeed} B{row.benchNeed}
                </div>
                {row.overflow > 0 && (
                  <div className="text-[10px] text-rose-600 dark:text-rose-400">
                    +{row.overflow}
                  </div>
                )}
              </div>
            );
          })}
        </div>

      </section>

      {/* Custom Shortlist */}
      <section className="col-span-2 rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-700">
        <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <ListOrdered className="h-3.5 w-3.5" />
          Custom Shortlist
        </h3>

        {shortlistRows.length === 0 ? (
          <p className="text-sm text-zinc-500">No shortlisted players yet.</p>
        ) : (
          <div className="max-h-[170px] overflow-y-auto rounded border border-zinc-200 dark:border-zinc-700">
            <div className="grid grid-cols-[2.4rem_minmax(0,1fr)_3.4rem_3.6rem] border-b border-zinc-200 bg-zinc-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800/60">
              <span>SL</span>
              <span>Name</span>
              <span>Club</span>
              <span>Pos</span>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {shortlistRows.map(({ rank, player }) => (
                <button
                  key={player.id}
                  onClick={() => {
                    if (!player.isDrafted) onDraftClick(player.id);
                  }}
                  className={clsx(
                    "grid w-full grid-cols-[2.4rem_minmax(0,1fr)_3.4rem_3.6rem] items-center gap-1 px-2 py-1.5 text-left text-[11px] transition-colors",
                    player.isDrafted
                      ? "cursor-default bg-zinc-50 text-zinc-400 dark:bg-zinc-900/40 dark:text-zinc-500"
                      : "text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/50"
                  )}
                  title={player.isDrafted ? "Already drafted" : "Click to draft"}
                >
                  <span className="font-mono text-zinc-500">#{rank}</span>
                  <span className={clsx("truncate", player.isDrafted && "line-through")}>
                    {player.name}
                  </span>
                  <span className="truncate uppercase text-zinc-500">{player.club}</span>
                  <span className="truncate text-zinc-500">{player.positionString}</span>
                </button>
              ))}
            </div>
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
                      ? 228
                      : 86 + (index * 284) / Math.max(1, total - 1);
                  const isEmpty = label === "—";
                  return (
                    <g key={`${row.pos}-${index}`}>
                      <rect
                        x={x - 27}
                        y={y - 9}
                        width="54"
                        height="18"
                        rx="4"
                        fill={isEmpty ? "#1f2937" : MINI_LINEUP_COLORS[row.pos]}
                        opacity={isEmpty ? 0.45 : 0.95}
                      />
                      <text
                        x={x}
                        y={y + 4}
                        fill={isEmpty ? "#64748b" : "#ffffff"}
                        fontSize="8.5"
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
