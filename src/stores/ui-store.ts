// src/stores/ui-store.ts
import { create } from "zustand";
import type { Position } from "@/types";

export type Tab = "board" | "team" | "bye" | "picks" | "smokies";
export type SortMode = "pickNow" | "vorp" | "smartRank";
export type PositionFilter = "ALL" | Position | "DPP";
export type SyncStatusColor = "gray" | "yellow" | "green" | "red";

export interface LiveSyncSnapshot {
  isActive: boolean;
  status: string;
  statusColor: SyncStatusColor;
  lastSyncTime: number | null;
  totalSynced: number;
  pollIntervalSec: number;
  leagueName: string | null;
  draftStatus: string | null;
  onClockLabel: string | null;
  teamNames: string[];
  sourceUrl: string | null;
  nextPollAt: number | null;
}

const DEFAULT_LIVE_SYNC_SNAPSHOT: LiveSyncSnapshot = {
  isActive: false,
  status: "Disconnected",
  statusColor: "gray",
  lastSyncTime: null,
  totalSynced: 0,
  pollIntervalSec: 0,
  leagueName: null,
  draftStatus: null,
  onClockLabel: null,
  teamNames: [],
  sourceUrl: null,
  nextPollAt: null,
};

interface UiStore {
  activeTab: Tab;
  positionFilter: PositionFilter;
  searchQuery: string;
  sortMode: SortMode;
  showDrafted: boolean;
  sidebarOpen: boolean;
  draftModalPlayerId: string | null;
  liveSyncSnapshot: LiveSyncSnapshot;

  setActiveTab: (tab: Tab) => void;
  setPositionFilter: (filter: PositionFilter) => void;
  setSearchQuery: (query: string) => void;
  setSortMode: (mode: SortMode) => void;
  setShowDrafted: (show: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setDraftModalPlayerId: (id: string | null) => void;
  setLiveSyncSnapshot: (snapshot: LiveSyncSnapshot) => void;
}

export const useUiStore = create<UiStore>()((set) => ({
  activeTab: "board",
  positionFilter: "ALL",
  searchQuery: "",
  sortMode: "pickNow",
  showDrafted: false,
  sidebarOpen: false,
  draftModalPlayerId: null,
  liveSyncSnapshot: DEFAULT_LIVE_SYNC_SNAPSHOT,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setPositionFilter: (filter) => set({ positionFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortMode: (mode) => set({ sortMode: mode }),
  setShowDrafted: (show) => set({ showDrafted: show }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setDraftModalPlayerId: (id) => set({ draftModalPlayerId: id }),
  setLiveSyncSnapshot: (snapshot) => set({ liveSyncSnapshot: snapshot }),
}));
