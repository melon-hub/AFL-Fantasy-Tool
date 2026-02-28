"use client";

import { useMemo, useState } from "react";
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, Search, Eye, EyeOff } from "lucide-react";
import clsx from "clsx";
import type { PlayerWithMetrics, Position } from "@/types";
import { POSITION_COLORS, CATEGORY_COLORS } from "@/lib/constants";
import { useUiStore, type PositionFilter } from "@/stores/ui-store";

const POS_FILTERS: { label: string; value: PositionFilter }[] = [
  { label: "All", value: "ALL" },
  { label: "DEF", value: "DEF" },
  { label: "MID", value: "MID" },
  { label: "RUC", value: "RUC" },
  { label: "FWD", value: "FWD" },
  { label: "DPP", value: "DPP" },
];

function vorpHeatColor(value: number, max: number): string {
  if (max <= 0) return "";
  const pct = Math.max(0, Math.min(1, value / max));
  if (pct > 0.7) return "bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-200";
  if (pct > 0.4) return "bg-yellow-50 text-yellow-900 dark:bg-yellow-900/30 dark:text-yellow-200";
  if (pct > 0.15) return "bg-orange-50 text-orange-900 dark:bg-orange-900/20 dark:text-orange-200";
  return "";
}

interface DraftBoardProps {
  players: PlayerWithMetrics[];
  onDraftClick: (playerId: string) => void;
}

export function DraftBoard({ players, onDraftClick }: DraftBoardProps) {
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
    { id: "finalValue", desc: true },
  ]);

  const maxVorp = useMemo(
    () => Math.max(...players.filter((p) => !p.isDrafted).map((p) => p.finalValue), 1),
    [players]
  );

  const filteredPlayers = useMemo(() => {
    let list = players;

    if (!showDrafted) {
      list = list.filter((p) => !p.isDrafted);
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
          p.club.toLowerCase().includes(q)
      );
    }

    return list;
  }, [players, showDrafted, positionFilter, searchQuery]);

  const columns = useMemo<ColumnDef<PlayerWithMetrics>[]>(
    () => [
      {
        id: "rank",
        header: "#",
        size: 45,
        cell: ({ row }) => (
          <span className="text-xs text-zinc-400">{row.index + 1}</span>
        ),
        enableSorting: false,
      },
      {
        accessorKey: "name",
        header: "Player",
        size: 180,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex flex-col">
              <span
                className={clsx(
                  "font-medium",
                  p.isDrafted && "text-zinc-400 line-through"
                )}
              >
                {p.name}
              </span>
              <span className="text-xs text-zinc-500">{p.club}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "positionString",
        header: "Pos",
        size: 80,
        cell: ({ row }) => (
          <div className="flex gap-1">
            {row.original.positions.map((pos) => (
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
        ),
      },
      {
        accessorKey: "projScore",
        header: "Proj",
        size: 60,
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">{(getValue() as number).toFixed(1)}</span>
        ),
      },
      {
        accessorKey: "vorp",
        header: "VORP",
        size: 60,
        cell: ({ row }) => (
          <span
            className={clsx(
              "rounded px-1 font-mono text-sm",
              vorpHeatColor(row.original.vorp, maxVorp)
            )}
          >
            {row.original.vorp.toFixed(1)}
          </span>
        ),
      },
      {
        accessorKey: "finalValue",
        header: "Value",
        size: 65,
        cell: ({ row }) => (
          <span
            className={clsx(
              "rounded px-1 font-mono text-sm font-semibold",
              vorpHeatColor(row.original.finalValue, maxVorp)
            )}
          >
            {row.original.finalValue.toFixed(1)}
          </span>
        ),
      },
      {
        accessorKey: "smartRank",
        header: "Smart",
        size: 65,
        cell: ({ getValue }) => (
          <span className="font-mono text-sm">
            {(getValue() as number).toFixed(1)}
          </span>
        ),
      },
      {
        accessorKey: "vona",
        header: "VONA",
        size: 55,
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          if (v == null) return <span className="text-zinc-400">-</span>;
          return (
            <span
              className={clsx(
                "font-mono text-sm",
                v > 10 && "font-bold text-red-600 dark:text-red-400"
              )}
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
        cell: ({ getValue }) => (
          <span className="text-sm">R{getValue() as number}</span>
        ),
      },
      {
        accessorKey: "category",
        header: "Cat",
        size: 85,
        cell: ({ getValue }) => {
          const cat = getValue() as string;
          return (
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-xs font-medium",
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
        size: 50,
        cell: ({ getValue }) => {
          const v = getValue() as number | null;
          return <span className="font-mono text-sm">{v ?? "-"}</span>;
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
      },
    ],
    [maxVorp, onDraftClick]
  );

  const table = useReactTable({
    data: filteredPlayers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  // Tier break detection: check for >8pt gap in finalValue between adjacent sorted rows
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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Position filters */}
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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search player or club..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 rounded-lg border border-zinc-200 bg-white pl-8 pr-3 text-sm outline-none focus:border-blue-500 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>

        {/* Sort mode toggle */}
        <button
          onClick={() =>
            setSortMode(sortMode === "vorp" ? "smartRank" : "vorp")
          }
          className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          <ArrowUpDown className="h-3 w-3" />
          {sortMode === "vorp" ? "Classic VORP" : "Smart Rank"}
        </button>

        {/* Show drafted toggle */}
        <button
          onClick={() => setShowDrafted(!showDrafted)}
          className="flex items-center gap-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {showDrafted ? (
            <Eye className="h-3 w-3" />
          ) : (
            <EyeOff className="h-3 w-3" />
          )}
          {showDrafted ? "Showing drafted" : "Hiding drafted"}
        </button>

        <span className="ml-auto text-xs text-zinc-500">
          {filteredPlayers.filter((p) => !p.isDrafted).length} available
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
        <table className="w-full text-left">
          <thead className="border-b border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className={clsx(
                      "px-2 py-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400",
                      header.column.getCanSort() && "cursor-pointer select-none hover:text-zinc-700 dark:hover:text-zinc-200"
                    )}
                    style={{ width: header.getSize() }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" && " ↑"}
                    {header.column.getIsSorted() === "desc" && " ↓"}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <>
                {tierBreaks.has(idx) && (
                  <tr key={`break-${idx}`}>
                    <td
                      colSpan={columns.length}
                      className="border-t-2 border-dashed border-amber-400/60 dark:border-amber-600/40"
                    />
                  </tr>
                )}
                <tr
                  key={row.id}
                  className={clsx(
                    "border-b border-zinc-100 transition-colors dark:border-zinc-800",
                    row.original.isDrafted
                      ? "bg-zinc-50/50 opacity-50 dark:bg-zinc-900/30"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/40",
                    row.original.category === "smoky" &&
                      !row.original.isDrafted &&
                      "border-l-2 border-l-orange-400"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-2 py-1.5">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              </>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-sm text-zinc-500"
                >
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
