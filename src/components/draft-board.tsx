"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type ColumnOrderState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  ArrowUpDown,
  Columns3,
  Eye,
  EyeOff,
  GripVertical,
  Search,
} from "lucide-react";
import clsx from "clsx";
import type { DraftPhase, LeagueSettings, PlayerWithMetrics, Position } from "@/types";
import { CATEGORY_COLORS, POSITION_COLORS } from "@/lib/constants";
import { useUiStore, type PositionFilter } from "@/stores/ui-store";

const POS_FILTERS: { label: string; value: PositionFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "DEF", value: "DEF" },
  { label: "MID", value: "MID" },
  { label: "RUC", value: "RUC" },
  { label: "FWD", value: "FWD" },
  { label: "DPP", value: "DPP" },
];

const DEFAULT_COLUMN_ORDER: ColumnOrderState = [
  "rank",
  "shortlistRank",
  "name",
  "positionString",
  "avgScore2025",
  "projScore",
  "pickNowScore",
  "category",
  "adp",
  "games2025",
  "notes",
  "action",
  "vorp",
  "finalValue",
  "smartRank",
  "vona",
  "bye",
  "risk",
  "consistencyScore",
  "cbaPct",
  "adpValueGap",
  "maxScore2025",
];

const DEFAULT_VISIBLE_COLUMNS = new Set([
  "rank",
  "shortlistRank",
  "name",
  "positionString",
  "avgScore2025",
  "projScore",
  "pickNowScore",
  "category",
  "adp",
  "games2025",
  "notes",
]);

const DEFAULT_COLUMN_VISIBILITY: VisibilityState = Object.fromEntries(
  DEFAULT_COLUMN_ORDER.map((id) => [id, DEFAULT_VISIBLE_COLUMNS.has(id)])
) as VisibilityState;

const COLUMN_LABELS: Record<string, string> = {
  rank: "#",
  shortlistRank: "SL#",
  name: "Player",
  positionString: "Pos",
  projScore: "Proj",
  pickNowScore: "Pick now",
  vorp: "VORP",
  finalValue: "Value",
  smartRank: "Smart",
  vona: "VONA",
  bye: "Bye",
  category: "Cat",
  adp: "ADP",
  risk: "Risk",
  games2025: "Gms25",
  avgScore2025: "Avg 25",
  consistencyScore: "Cons",
  cbaPct: "CBA%",
  adpValueGap: "Gap",
  maxScore2025: "Max",
  notes: "Notes",
  action: "Draft",
};

const COLUMN_ORDER_STORAGE_KEY = "afl:draft-board:column-order:v2";
const COLUMN_VISIBILITY_STORAGE_KEY = "afl:draft-board:column-visibility:v2";
const SHORTLIST_STORAGE_KEY = "afl:draft-board:shortlist:v1";
const SHORTLIST_ORDER_STORAGE_KEY = "afl:draft-board:shortlist-order:v1";
const SHORTLIST_ONLY_STORAGE_KEY = "afl:draft-board:shortlist-only:v1";
const SHORTLIST_SORT_MODE_STORAGE_KEY = "afl:draft-board:shortlist-sort-mode:v1";
const SHORTLIST_UPDATED_EVENT = "afl:shortlist-updated";
const NON_DRAGGABLE_COLUMNS = new Set(["action"]);
const NON_TOGGLEABLE_COLUMNS = new Set<string>();

function sanitiseColumnOrder(order: unknown): ColumnOrderState {
  const allowed = new Set(DEFAULT_COLUMN_ORDER);
  const seen = new Set<string>();
  const cleaned: string[] = [];

  if (Array.isArray(order)) {
    for (const id of order) {
      if (typeof id !== "string") continue;
      if (!allowed.has(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      cleaned.push(id);
    }
  }

  for (const id of DEFAULT_COLUMN_ORDER) {
    if (!seen.has(id)) cleaned.push(id);
  }
  return cleaned;
}

function sanitiseColumnVisibility(visibility: unknown): VisibilityState {
  const next: VisibilityState = { ...DEFAULT_COLUMN_VISIBILITY };
  if (!visibility || typeof visibility !== "object") return next;
  for (const id of DEFAULT_COLUMN_ORDER) {
    const value = (visibility as Record<string, unknown>)[id];
    if (typeof value === "boolean") next[id] = value;
  }
  return next;
}

function normaliseText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function getAvailabilityIssue(player: PlayerWithMetrics): string | null {
  if (textIndicatesSeasonOut(player.injury) || textIndicatesSeasonOut(player.notes)) {
    const source = normaliseText(player.injury) || normaliseText(player.notes);
    return `Season-out flag: ${source || "Marked unavailable for season"}`;
  }
  const injury = normaliseText(player.injury);
  const risk = normaliseText(player.risk).toLowerCase();
  if (injury) return `Injury note: ${injury}`;
  if (risk === "high") return "High risk profile";
  return null;
}

function shortPlayerName(name: string): string {
  const clean = name.trim();
  if (!clean) return "";
  if (clean.length <= 18) return clean;

  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return clean;

  const firstInitial = parts[0].charAt(0).toUpperCase();
  let surname = parts[parts.length - 1];
  if (surname.includes("-")) {
    const hyphenParts = surname.split("-").filter(Boolean);
    surname = hyphenParts[hyphenParts.length - 1] || surname;
  }
  surname = surname.charAt(0).toUpperCase() + surname.slice(1);
  return `${firstInitial}.${surname}`;
}

function vorpHeatColor(value: number, max: number): string {
  if (max <= 0) return "";
  const pct = Math.max(0, Math.min(1, value / max));
  if (pct > 0.7) return "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200";
  if (pct > 0.4) return "bg-yellow-50 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200";
  if (pct > 0.15) return "bg-orange-50 text-orange-900 dark:bg-orange-900/20 dark:text-orange-200";
  return "";
}

function normaliseMinMax(value: number, min: number, max: number, fallback: number = 50): number {
  if (max - min <= 0.0001) return fallback;
  return ((value - min) / (max - min)) * 100;
}

function nextSortMode(mode: "pickNow" | "vorp" | "smartRank") {
  if (mode === "pickNow") return "smartRank" as const;
  if (mode === "smartRank") return "vorp" as const;
  return "pickNow" as const;
}

function sortModeLabel(mode: "pickNow" | "vorp" | "smartRank"): string {
  if (mode === "pickNow") return "Pick-Now";
  if (mode === "smartRank") return "Smart Rank";
  return "Classic VORP";
}

function phaseLabel(phase: DraftPhase): string {
  return phase === "early" ? "Early" : phase === "mid" ? "Mid" : "Late";
}

interface DraftBoardProps {
  players: PlayerWithMetrics[];
  settings: LeagueSettings;
  onDraftClick: (playerId: string) => void;
}

type ShortlistSortMode = "pickNow" | "custom";

export function DraftBoard({ players, settings, onDraftClick }: DraftBoardProps) {
  const {
    positionFilter,
    setPositionFilter,
    searchQuery,
    setSearchQuery,
    sortMode,
    setSortMode,
    showDrafted,
    setShowDrafted,
  } = useUiStore();

  const [sorting, setSorting] = useState<SortingState>([
    { id: "pickNowScore", desc: true },
  ]);
  const [columnOrder, setColumnOrder] = useState<ColumnOrderState>(DEFAULT_COLUMN_ORDER);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
    DEFAULT_COLUMN_VISIBILITY
  );
  const [isColumnsMenuOpen, setIsColumnsMenuOpen] = useState(false);
  const [draggingColumnId, setDraggingColumnId] = useState<string | null>(null);
  const [shortlistIds, setShortlistIds] = useState<Set<string>>(new Set());
  const [shortlistOrder, setShortlistOrder] = useState<string[]>([]);
  const [showShortlistOnly, setShowShortlistOnly] = useState(false);
  const [shortlistSortMode, setShortlistSortMode] = useState<ShortlistSortMode>(
    "pickNow"
  );
  const [shortlistPrefsHydrated, setShortlistPrefsHydrated] = useState(false);
  const [draggingShortlistId, setDraggingShortlistId] = useState<string | null>(
    null
  );
  const [shortlistDropTargetId, setShortlistDropTargetId] = useState<
    string | null
  >(null);
  const columnsMenuRef = useRef<HTMLDivElement>(null);
  const isCustomShortlistMode = showShortlistOnly && shortlistSortMode === "custom";
  const broadcastShortlistUpdate = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent(SHORTLIST_UPDATED_EVENT));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawOrder = window.localStorage.getItem(COLUMN_ORDER_STORAGE_KEY);
      const parsedOrder = rawOrder ? JSON.parse(rawOrder) : null;
      setColumnOrder(sanitiseColumnOrder(parsedOrder));
    } catch {
      setColumnOrder(DEFAULT_COLUMN_ORDER);
    }

    try {
      const rawVisibility = window.localStorage.getItem(COLUMN_VISIBILITY_STORAGE_KEY);
      const parsedVisibility = rawVisibility ? JSON.parse(rawVisibility) : null;
      setColumnVisibility(sanitiseColumnVisibility(parsedVisibility));
    } catch {
      setColumnVisibility(DEFAULT_COLUMN_VISIBILITY);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(COLUMN_ORDER_STORAGE_KEY, JSON.stringify(columnOrder));
  }, [columnOrder]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      COLUMN_VISIBILITY_STORAGE_KEY,
      JSON.stringify(columnVisibility)
    );
  }, [columnVisibility]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawShortlist = window.localStorage.getItem(SHORTLIST_STORAGE_KEY);
      const parsedShortlist = rawShortlist ? JSON.parse(rawShortlist) : [];
      const shortlistArray = Array.isArray(parsedShortlist)
        ? parsedShortlist.filter((id): id is string => typeof id === "string")
        : [];
      setShortlistIds(new Set(shortlistArray));

      const rawOrder = window.localStorage.getItem(SHORTLIST_ORDER_STORAGE_KEY);
      const parsedOrder = rawOrder ? JSON.parse(rawOrder) : [];
      const storedOrder = Array.isArray(parsedOrder)
        ? parsedOrder.filter((id): id is string => typeof id === "string")
        : [];
      const orderSet = new Set(storedOrder);
      const mergedOrder = [
        ...storedOrder.filter((id) => shortlistArray.includes(id)),
        ...shortlistArray.filter((id) => !orderSet.has(id)),
      ];
      setShortlistOrder(mergedOrder);
    } catch {
      setShortlistIds(new Set());
      setShortlistOrder([]);
    }

    try {
      const rawShortlistOnly = window.localStorage.getItem(SHORTLIST_ONLY_STORAGE_KEY);
      setShowShortlistOnly(rawShortlistOnly === "1");
    } catch {
      setShowShortlistOnly(false);
    }

    try {
      const rawSortMode = window.localStorage.getItem(
        SHORTLIST_SORT_MODE_STORAGE_KEY
      );
      setShortlistSortMode(rawSortMode === "custom" ? "custom" : "pickNow");
    } catch {
      setShortlistSortMode("pickNow");
    }
    setShortlistPrefsHydrated(true);
  }, []);

  useEffect(() => {
    if (!shortlistPrefsHydrated) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      SHORTLIST_STORAGE_KEY,
      JSON.stringify(Array.from(shortlistIds))
    );
    broadcastShortlistUpdate();
  }, [shortlistIds, shortlistPrefsHydrated, broadcastShortlistUpdate]);

  useEffect(() => {
    if (!shortlistPrefsHydrated) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      SHORTLIST_ORDER_STORAGE_KEY,
      JSON.stringify(shortlistOrder)
    );
    broadcastShortlistUpdate();
  }, [shortlistOrder, shortlistPrefsHydrated, broadcastShortlistUpdate]);

  useEffect(() => {
    if (!shortlistPrefsHydrated) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SHORTLIST_ONLY_STORAGE_KEY, showShortlistOnly ? "1" : "0");
  }, [showShortlistOnly, shortlistPrefsHydrated]);

  useEffect(() => {
    if (!shortlistPrefsHydrated) return;
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      SHORTLIST_SORT_MODE_STORAGE_KEY,
      shortlistSortMode
    );
  }, [shortlistSortMode, shortlistPrefsHydrated]);

  // Prune shortlist entries that are no longer present after CSV reloads.
  useEffect(() => {
    const validIds = new Set(players.map((p) => p.id));
    setShortlistIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      for (const id of prev) {
        if (validIds.has(id)) next.add(id);
      }
      return next.size === prev.size ? prev : next;
    });
    setShortlistOrder((prev) => prev.filter((id) => validIds.has(id)));
  }, [players]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!columnsMenuRef.current) return;
      if (!columnsMenuRef.current.contains(event.target as Node)) {
        setIsColumnsMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (isCustomShortlistMode) {
      setSorting([{ id: "shortlistRank", desc: false }]);
      return;
    }
    const id =
      sortMode === "pickNow"
        ? "pickNowScore"
        : sortMode === "smartRank"
          ? "smartRank"
          : "finalValue";
    setSorting([{ id, desc: true }]);
  }, [sortMode, isCustomShortlistMode]);

  useEffect(() => {
    if (!showShortlistOnly) return;
    setColumnVisibility((prev) => ({ ...prev, shortlistRank: true }));
  }, [showShortlistOnly]);

  useEffect(() => {
    if (isCustomShortlistMode) return;
    setDraggingShortlistId(null);
    setShortlistDropTargetId(null);
  }, [isCustomShortlistMode]);

  const maxVorp = useMemo(
    () => Math.max(...players.filter((p) => !p.isDrafted).map((p) => p.finalValue), 1),
    [players]
  );

  const availablePlayers = useMemo(
    () => players.filter((p) => !p.isDrafted),
    [players]
  );
  const activePhase = availablePlayers[0]?.draftPhaseAtCalc ?? "early";
  const smartWeights = settings.smartRankWeights;

  const normByPlayerId = useMemo(() => {
    const smartValues = availablePlayers.map((p) => p.smartRank);

    const smartMin = smartValues.length > 0 ? Math.min(...smartValues) : 0;
    const smartMax = smartValues.length > 0 ? Math.max(...smartValues) : 100;

    const map = new Map<string, { smartNorm: number }>();
    for (const p of players) {
      map.set(p.id, {
        smartNorm: normaliseMinMax(p.smartRank, smartMin, smartMax, 50),
      });
    }
    return map;
  }, [availablePlayers, players]);

  const shortlistRankById = useMemo(() => {
    const map = new Map<string, number>();
    shortlistOrder.forEach((id, idx) => map.set(id, idx + 1));
    return map;
  }, [shortlistOrder]);

  const filteredPlayers = useMemo(() => {
    let list = players;

    if (!showDrafted) {
      list = list.filter((p) => !p.isDrafted);
    }

    if (showShortlistOnly) {
      list = list.filter((p) => shortlistIds.has(p.id));
    }

    if (positionFilter !== "ALL") {
      if (positionFilter === "DPP") {
        list = list.filter((p) => p.positions.length > 1);
      } else {
        list = list.filter((p) => p.positions.includes(positionFilter as Position));
      }
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.club.toLowerCase().includes(q) ||
          p.notes.toLowerCase().includes(q)
      );
    }

    if (isCustomShortlistMode) {
      const fallbackRank = shortlistOrder.length + 9999;
      list = [...list].sort(
        (a, b) =>
          (shortlistRankById.get(a.id) ?? fallbackRank) -
          (shortlistRankById.get(b.id) ?? fallbackRank)
      );
    }

    return list;
  }, [
    players,
    showDrafted,
    showShortlistOnly,
    isCustomShortlistMode,
    positionFilter,
    searchQuery,
    shortlistIds,
    shortlistOrder,
    shortlistRankById,
  ]);

  const shortlistedCount = useMemo(
    () => players.filter((p) => shortlistIds.has(p.id)).length,
    [players, shortlistIds]
  );

  const toggleShortlist = (playerId: string) => {
    setShortlistIds((prev) => {
      const next = new Set(prev);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
    setShortlistOrder((prev) => {
      if (prev.includes(playerId)) {
        return prev.filter((id) => id !== playerId);
      }
      return [...prev, playerId];
    });
  };

  const moveShortlistBefore = useCallback((sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    setShortlistOrder((prev) => {
      const sourceIndex = prev.indexOf(sourceId);
      const targetIndex = prev.indexOf(targetId);
      if (sourceIndex === -1 || targetIndex === -1) return prev;

      const next = [...prev];
      next.splice(sourceIndex, 1);
      const insertIndex = next.indexOf(targetId);
      if (insertIndex === -1) return prev;
      next.splice(insertIndex, 0, sourceId);
      return next;
    });
  }, []);

  const pickNow = settings.pickNowWeights;
  const pickNowTotal =
    pickNow.avg25 +
    pickNow.projection +
    pickNow.consistency +
    pickNow.adp +
    pickNow.scarcity;
  const pickNowSafeTotal = pickNowTotal > 0 ? pickNowTotal : 1;
  const phaseSummary = `Pick-Now factors (normalised)\nAvg25 ${(pickNow.avg25 / pickNowSafeTotal * 100).toFixed(0)}% | Projection ${(pickNow.projection / pickNowSafeTotal * 100).toFixed(0)}% | Consistency ${(pickNow.consistency / pickNowSafeTotal * 100).toFixed(0)}% | ADP ${(pickNow.adp / pickNowSafeTotal * 100).toFixed(0)}% | Scarcity ${(pickNow.scarcity / pickNowSafeTotal * 100).toFixed(0)}%`;
  const smartSummary = `Smart weights\nVORP ${smartWeights.vorpWeight.toFixed(2)} | Scarcity ${smartWeights.scarcityWeight.toFixed(2)} | Bye ${smartWeights.byeWeight.toFixed(2)}`;

  const moveColumn = (sourceId: string, targetId: string) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (NON_DRAGGABLE_COLUMNS.has(sourceId) || NON_DRAGGABLE_COLUMNS.has(targetId)) return;

    setColumnOrder((prev) => {
      const next = sanitiseColumnOrder(prev);
      const sourceIdx = next.indexOf(sourceId);
      const targetIdx = next.indexOf(targetId);
      if (sourceIdx === -1 || targetIdx === -1) return next;

      const reordered = [...next];
      const [moved] = reordered.splice(sourceIdx, 1);
      reordered.splice(targetIdx, 0, moved);
      return reordered;
    });
  };

  const resetColumns = () => {
    setColumnOrder(DEFAULT_COLUMN_ORDER);
    setColumnVisibility(DEFAULT_COLUMN_VISIBILITY);
  };

  const columns = useMemo<ColumnDef<PlayerWithMetrics>[]>(
    () => [
      {
        id: "rank",
        header: "#",
        size: 50,
        cell: ({ row, table }) => {
          const sortedRows = table.getRowModel().rows;
          const rank = sortedRows.findIndex((r) => r.id === row.id) + 1;
          return <span className="text-sm text-zinc-400">{rank}</span>;
        },
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "shortlistRank",
        accessorFn: (row) =>
          shortlistRankById.get(row.id) ?? Number.MAX_SAFE_INTEGER,
        header: () => (
          <span title="Your manual shortlist rank. Right-click row to shortlist.">
            SL#
          </span>
        ),
        size: 84,
        cell: ({ row }) => {
          const playerId = row.original.id;
          const rank = shortlistRankById.get(playerId);
          if (rank == null) return <span className="text-zinc-400">-</span>;

          if (!isCustomShortlistMode) {
            return <span className="font-mono text-sm">{rank}</span>;
          }

          return (
            <div className="flex items-center gap-1">
              <span className="w-5 text-center font-mono text-xs">{rank}</span>
              <span
                draggable
                onDragStart={(e) => {
                  e.stopPropagation();
                  e.dataTransfer.setData("text/shortlist-id", playerId);
                  e.dataTransfer.effectAllowed = "move";
                  setDraggingShortlistId(playerId);
                  setShortlistDropTargetId(playerId);
                }}
                onDragEnd={(e) => {
                  e.stopPropagation();
                  setDraggingShortlistId(null);
                  setShortlistDropTargetId(null);
                }}
                className="cursor-grab rounded border border-zinc-300 px-1 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
                title="Drag to reorder shortlist"
              >
                <GripVertical className="h-3 w-3" />
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "name",
        header: "Player",
        size: 205,
        cell: ({ row }) => {
          const p = row.original;
          const shortlisted = shortlistIds.has(p.id);
          const issue = getAvailabilityIssue(p);
          const displayName = shortPlayerName(p.name);
          return (
            <div className="flex items-center gap-1.5">
              <span className="flex min-w-0 items-center gap-1">
                {shortlisted && (
                  <span
                    className="shrink-0 text-xs leading-none text-amber-500"
                    title="Shortlisted"
                  >
                    ★
                  </span>
                )}
                <span
                  className={clsx(
                    "truncate text-sm font-medium",
                    p.isDrafted && "text-zinc-400 line-through"
                  )}
                  title={p.name}
                >
                  {displayName}
                </span>
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-zinc-500">
                  {p.club}
                </span>
                {issue && (
                  <span
                    className="shrink-0 rounded bg-rose-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-rose-700 dark:bg-rose-900/60 dark:text-rose-200"
                    title={issue}
                  >
                    Flag
                  </span>
                )}
              </span>
            </div>
          );
        },
      },
      {
        accessorKey: "positionString",
        header: "Pos",
        size: 98,
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.positions.map((pos) => (
              <span
                key={pos}
                className={clsx(
                  "rounded px-1.5 py-0.5 text-[11px] font-medium text-white",
                  POSITION_COLORS[pos]
                )}
              >
                {pos}
              </span>
            ))}
          </div>
        ),
      },
      {
        accessorKey: "projScore",
        header: "Proj",
        size: 72,
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">{(getValue() as number).toFixed(1)}</span>
        ),
      },
      {
        accessorKey: "pickNowScore",
        header: () => (
          <span
            title={`Pick-Now score (single recommendation metric).\n${phaseSummary}`}
          >
            Pick now
          </span>
        ),
        size: 90,
        cell: ({ row }) => {
          const p = row.original;
          const n = normByPlayerId.get(p.id);
          const title =
            `Pick-Now ${p.pickNowScore.toFixed(1)}\n` +
            `Avg25: ${(p.avgScore2025 ?? p.projScore).toFixed(1)}\n` +
            `Projection: ${p.projScore.toFixed(1)}\n` +
            `Consistency: ${p.consistencyScore.toFixed(1)}\n` +
            `ADP: ${p.adp != null ? p.adp.toFixed(1) : "n/a"}\n` +
            `Scarcity (team-need adjusted): ${p.positionalScarcity.toFixed(1)}\n` +
            `SmartNorm: ${(n?.smartNorm ?? 0).toFixed(1)}\n` +
            phaseSummary;
          return (
            <span className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-300" title={title}>
              {p.pickNowScore.toFixed(1)}
            </span>
          );
        },
      },
      {
        accessorKey: "vorp",
        header: () => (
          <span title={`VORP = projected score minus replacement at best eligible position.\n${phaseSummary}`}>
            VORP
          </span>
        ),
        size: 68,
        cell: ({ row }) => (
          <span
            className={clsx(
              "rounded px-1 font-mono text-sm",
              vorpHeatColor(row.original.vorp, maxVorp)
            )}
            title={`Best position: ${row.original.bestVorpPosition}\nRaw VORP: ${row.original.vorp.toFixed(1)}`}
          >
            {row.original.vorp.toFixed(1)}
          </span>
        ),
      },
      {
        accessorKey: "finalValue",
        header: () => (
          <span title={`Value = best-position VORP + DPP + form/durability adjustments.`}>Value</span>
        ),
        size: 72,
        cell: ({ row }) => (
          <span
            className={clsx(
              "rounded px-1 font-mono text-sm font-semibold",
              vorpHeatColor(row.original.finalValue, maxVorp)
            )}
            title={`Final value score ${row.original.finalValue.toFixed(1)} (VORP + DPP + form/durability)`}
          >
            {row.original.finalValue.toFixed(1)}
          </span>
        ),
      },
      {
        accessorKey: "smartRank",
        header: () => (
          <span title={`Smart Rank combines VORP, scarcity, and bye fit.\n${smartSummary}`}>
            Smart
          </span>
        ),
        size: 72,
        cell: ({ row }) => (
          <span
            className="font-mono text-sm"
            title={`Smart ${row.original.smartRank.toFixed(1)}\nScarcity ${row.original.positionalScarcity.toFixed(0)} | Bye ${row.original.byeValue.toFixed(0)}\n${smartSummary}`}
          >
            {row.original.smartRank.toFixed(1)}
          </span>
        ),
      },
      {
        accessorKey: "vona",
        header: () => (
          <span title={`VONA = gap to the next-best available player at this position.\nContext metric only (not a direct Pick-Now factor).`}>
            VONA
          </span>
        ),
        size: 66,
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v == null) return <span className="text-zinc-400">-</span>;
          return (
            <span
              className={clsx(
                "font-mono text-sm",
                v > 10 && "font-bold text-red-600 dark:text-red-400"
              )}
              title={`VONA ${v.toFixed(1)}\nContext metric (not directly weighted in Pick-Now).`}
            >
              {v.toFixed(1)}
            </span>
          );
        },
      },
      {
        accessorKey: "bye",
        header: "Bye",
        size: 45,
        cell: ({ getValue }) => <span className="text-sm">R{getValue() as number}</span>,
      },
      {
        accessorKey: "category",
        header: "Cat",
        size: 90,
        cell: ({ getValue }) => {
          const cat = getValue() as string;
          return (
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-[11px] font-medium",
                CATEGORY_COLORS[cat] || CATEGORY_COLORS.uncategorised
              )}
            >
              {cat}
            </span>
          );
        },
      },
      {
        accessorKey: "adp",
        header: "ADP",
        size: 58,
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return <span className="font-mono text-sm">{v ?? "-"}</span>;
        },
      },
      {
        accessorKey: "risk",
        header: () => (
          <span title={`Risk and injury availability signal.\nShown for context.`}>
            Risk
          </span>
        ),
        size: 70,
        cell: ({ row }) => {
          const risk = row.original.risk;
          const injury = row.original.injury;
          if (!risk && !injury) return <span className="text-zinc-400">-</span>;
          const label = risk || "—";
          const hasInjury = !!injury;
          return (
            <span
              className={clsx(
                "text-sm font-medium",
                label === "High" && "text-red-600 dark:text-red-400",
                label === "Medium" && "text-yellow-600 dark:text-yellow-400",
                label === "Low" && "text-green-600 dark:text-green-400"
              )}
              title={`Risk score ${row.original.riskScore.toFixed(1)}${hasInjury ? `\nInjury: ${injury}` : ""}`}
            >
              {label}
              {hasInjury && " ⚠"}
            </span>
          );
        },
      },
      {
        accessorKey: "games2025",
        header: () => (
          <span title={`Games played in 2025.\nUsed in consistency with x100/x120 (when available).\nMissing values are neutral (~60).`}>
            Gms25
          </span>
        ),
        size: 60,
        cell: ({ row }) => (
          <span
            className="font-mono text-sm"
            title={`Games 2025: ${row.original.games2025 ?? "N/A"}\nConsistency score ${row.original.consistencyScore.toFixed(1)}`}
          >
            {row.original.games2025 ?? "-"}
          </span>
        ),
      },
      {
        accessorKey: "avgScore2025",
        header: () => (
          <span title={`Average fantasy score in 2025.\nUses rankings/ultimate source when available.`}>
            Avg25
          </span>
        ),
        size: 72,
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return <span className="font-mono text-sm">{v == null ? "-" : v.toFixed(1)}</span>;
        },
      },
      {
        accessorKey: "consistencyScore",
        header: () => (
          <span title={`Consistency score from games played + premium score rates (x100/x120 when available).`}>Cons</span>
        ),
        size: 64,
        cell: ({ getValue }) => {
          const v = getValue() as number;
          return (
            <span
              className={clsx(
                "font-mono text-sm",
                v >= 85 && "text-green-600 dark:text-green-400",
                v < 60 && "text-yellow-600 dark:text-yellow-400"
              )}
            >
              {v.toFixed(0)}
            </span>
          );
        },
      },
      {
        accessorKey: "cbaPct",
        header: () => (
          <span title={`Centre bounce attendance %.\nHigher CBA can indicate stronger midfield role stability.`}>
            CBA%
          </span>
        ),
        size: 58,
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v == null) return <span className="text-zinc-400">-</span>;
          return (
            <span
              className={clsx(
                "font-mono text-sm",
                v >= 70 && "text-green-600 dark:text-green-400",
                v >= 40 && v < 70 && "text-yellow-600 dark:text-yellow-400"
              )}
            >
              {v}
            </span>
          );
        },
      },
      {
        id: "adpValueGap",
        accessorFn: (row) => row.valueOverAdp,
        header: () => (
          <span title={`Gap = ADP - live value rank.\nPositive = value/steal; negative = reach.`}>
            Gap
          </span>
        ),
        size: 58,
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v == null) return <span className="text-zinc-400">-</span>;
          return (
            <span
              className={clsx(
                "font-mono text-sm font-medium",
                v > 5 && "text-green-600 dark:text-green-400",
                v < -5 && "text-red-500 dark:text-red-400"
              )}
              title={v > 0 ? "Steal signal" : v < 0 ? "Reach signal" : "Fair value"}
            >
              {v > 0 ? "+" : ""}{v.toFixed(0)}
            </span>
          );
        },
      },
      {
        accessorKey: "maxScore2025",
        header: () => (
          <span title={`Best single-game score in 2025 (ceiling indicator).`}>Max</span>
        ),
        size: 56,
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return <span className="font-mono text-sm">{v ?? "-"}</span>;
        },
      },
      {
        accessorKey: "notes",
        header: "Notes",
        size: 300,
        cell: ({ getValue }) => {
          const note = (getValue() as string) || "";
          if (!note.trim()) return <span className="text-zinc-400">-</span>;
          const text = note.length > 48 ? `${note.slice(0, 48)}...` : note;
          return (
            <span className="line-clamp-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400" title={note}>
              {text}
            </span>
          );
        },
      },
      {
        id: "action",
        header: "",
        size: 70,
        cell: ({ row }) => {
          const p = row.original;
          if (p.isDrafted) {
            return (
              <span className="text-xs text-zinc-400">
                T{p.draftedBy} #{p.draftOrder}
              </span>
            );
          }
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDraftClick(p.id);
              }}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-blue-700"
            >
              Draft
            </button>
          );
        },
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [
      shortlistIds,
      shortlistRankById,
      isCustomShortlistMode,
      maxVorp,
      normByPlayerId,
      onDraftClick,
      phaseSummary,
      smartSummary,
    ]
  );

  const table = useReactTable({
    data: filteredPlayers,
    columns,
    state: { sorting, columnOrder, columnVisibility },
    onSortingChange: setSorting,
    onColumnOrderChange: setColumnOrder,
    onColumnVisibilityChange: setColumnVisibility,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  const rows = table.getRowModel().rows;
  const tierBreaks = useMemo(() => {
    const breaks = new Set<number>();
    for (let i = 1; i < rows.length; i++) {
      const prev = rows[i - 1].original.finalValue;
      const curr = rows[i].original.finalValue;
      if (prev - curr > 8) breaks.add(i);
    }
    return breaks;
  }, [rows]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {POS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setPositionFilter(f.value)}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                positionFilter === f.value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search player, club, or notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 rounded-lg border border-zinc-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        <button
          onClick={() => setSortMode(nextSortMode(sortMode))}
          className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          title={`Current sort: ${sortModeLabel(sortMode)}\nClick to cycle Pick-Now → Smart → VORP`}
        >
          <ArrowUpDown className="h-3 w-3" />
          {sortModeLabel(sortMode)}
        </button>

        <button
          onClick={() => setShowDrafted(!showDrafted)}
          className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {showDrafted ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {showDrafted ? "Showing drafted" : "Hiding drafted"}
        </button>

        <button
          onClick={() => setShowShortlistOnly((v) => !v)}
          className={clsx(
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
            showShortlistOnly
              ? "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
          )}
          title="Show only shortlisted players (respects Hiding drafted toggle)"
        >
          Shortlist {shortlistedCount > 0 ? `(${shortlistedCount})` : ""}
        </button>

        {showShortlistOnly && (
          <button
            onClick={() =>
              setShortlistSortMode((m) => (m === "custom" ? "pickNow" : "custom"))
            }
            className={clsx(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
              shortlistSortMode === "custom"
                ? "border-blue-300 bg-blue-100 text-blue-800 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                : "border-zinc-200 text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            )}
            title="Toggle shortlist ordering between your manual rank and Pick-Now score"
          >
            {shortlistSortMode === "custom"
              ? "Shortlist order: Custom"
              : "Shortlist order: Pick-Now"}
          </button>
        )}

        <div className="relative" ref={columnsMenuRef}>
          <button
            onClick={() => setIsColumnsMenuOpen((v) => !v)}
            className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            title="Show/hide columns. Drag table headers to reorder."
          >
            <Columns3 className="h-3 w-3" />
            Columns
          </button>

          {isColumnsMenuOpen && (
            <div className="absolute left-0 top-9 z-20 w-56 rounded-lg border border-zinc-200 bg-white p-2 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
              <p className="mb-2 px-1 text-[11px] text-zinc-500">
                Toggle columns here. Drag table headers to reorder.
              </p>
              <div className="max-h-64 space-y-1 overflow-auto">
                {table
                  .getAllLeafColumns()
                  .filter((col) => !NON_TOGGLEABLE_COLUMNS.has(col.id))
                  .map((col) => (
                    <label
                      key={col.id}
                      className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    >
                      <input
                        type="checkbox"
                        checked={col.getIsVisible()}
                        onChange={(e) => col.toggleVisibility(e.target.checked)}
                        className="h-3.5 w-3.5 rounded border-zinc-300"
                      />
                      <span>{COLUMN_LABELS[col.id] ?? col.id}</span>
                    </label>
                  ))}
              </div>
              <button
                onClick={resetColumns}
                className="mt-2 w-full rounded border border-zinc-200 px-2 py-1 text-xs text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Reset columns
              </button>
            </div>
          )}
        </div>

        <span className="text-xs text-zinc-500">
          Phase: <strong className="text-zinc-700 dark:text-zinc-300">{phaseLabel(activePhase)}</strong>
        </span>

        <span className="ml-auto text-xs text-zinc-500">
          {filteredPlayers.filter((p) => !p.isDrafted).length} available
        </span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => {
                  const isDraggable = !NON_DRAGGABLE_COLUMNS.has(header.column.id);
                  const isDragging = draggingColumnId === header.column.id;
                  return (
                    <th
                      key={header.id}
                      className={clsx(
                        "px-2 py-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400",
                        header.column.getCanSort() &&
                          "cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200",
                        isDraggable && "cursor-grab",
                        isDragging && "opacity-50"
                      )}
                      style={{ width: header.getSize() }}
                      draggable={isDraggable}
                      onDragStart={(e) => {
                        if (!isDraggable) return;
                        setDraggingColumnId(header.column.id);
                        e.dataTransfer.setData("text/column-id", header.column.id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragOver={(e) => {
                        if (!isDraggable) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(e) => {
                        if (!isDraggable) return;
                        e.preventDefault();
                        const sourceId = e.dataTransfer.getData("text/column-id");
                        moveColumn(sourceId, header.column.id);
                        setDraggingColumnId(null);
                      }}
                      onDragEnd={() => setDraggingColumnId(null)}
                      onClick={header.column.getToggleSortingHandler()}
                      title={`${header.column.getCanSort() ? "Click to sort. " : ""}${isDraggable ? "Drag to reorder." : ""}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {isDraggable && <GripVertical className="h-3 w-3 opacity-50" />}
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === "asc" && " ↑"}
                        {header.column.getIsSorted() === "desc" && " ↓"}
                      </span>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <Fragment key={row.id}>
                {tierBreaks.has(idx) && (
                  <tr>
                    <td
                      colSpan={table.getVisibleLeafColumns().length}
                      className="border-t-2 border-dashed border-amber-400/60 dark:border-amber-600/40"
                    />
                  </tr>
                )}
                <tr
                  className={clsx(
                    "border-b border-zinc-100 transition-colors dark:border-zinc-800",
                    row.original.isDrafted
                      ? "bg-zinc-50/50 opacity-50 dark:bg-zinc-900/30"
                      : "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
                    shortlistIds.has(row.original.id) &&
                      "bg-amber-50/40 dark:bg-amber-900/10",
                    isCustomShortlistMode &&
                      shortlistDropTargetId === row.original.id &&
                      draggingShortlistId !== row.original.id &&
                      "bg-blue-50/50 dark:bg-blue-900/20",
                    row.original.category === "smoky" &&
                      !row.original.isDrafted &&
                      "border-l-2 border-l-orange-400"
                  )}
                  onClick={() => {
                    if (!row.original.isDrafted) onDraftClick(row.original.id);
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleShortlist(row.original.id);
                  }}
                  onDragOver={(e) => {
                    if (!isCustomShortlistMode || !draggingShortlistId) return;
                    e.preventDefault();
                    if (shortlistDropTargetId !== row.original.id) {
                      setShortlistDropTargetId(row.original.id);
                    }
                  }}
                  onDrop={(e) => {
                    if (!isCustomShortlistMode) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const sourceId =
                      e.dataTransfer.getData("text/shortlist-id") || draggingShortlistId;
                    if (sourceId) moveShortlistBefore(sourceId, row.original.id);
                    setDraggingShortlistId(null);
                    setShortlistDropTargetId(null);
                  }}
                  title={
                    row.original.isDrafted
                      ? "Right-click to add/remove shortlist"
                      : isCustomShortlistMode
                        ? "Click row to draft. Right-click to add/remove shortlist. Drag SL# handle to reorder."
                        : "Click row to draft. Right-click to add/remove shortlist."
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="h-9 px-2 py-1 align-middle">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={table.getVisibleLeafColumns().length} className="px-3 py-6 text-center text-sm text-zinc-500">
                  No players match your filters
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
