// src/stores/ui-store.ts
import { create } from "zustand";
import type { Position } from "@/types";

export type Tab = "board" | "team" | "bye" | "picks" | "smokies";
export type SortMode = "vorp" | "smartRank";
export type PositionFilter = "ALL" | Position | "DPP";

interface UiStore {
  activeTab: Tab;
  positionFilter: PositionFilter;
  searchQuery: string;
  sortMode: SortMode;
  showDrafted: boolean;
  sidebarOpen: boolean;
  draftModalPlayerId: string | null;

  setActiveTab: (tab: Tab) => void;
  setPositionFilter: (filter: PositionFilter) => void;
  setSearchQuery: (query: string) => void;
  setSortMode: (mode: SortMode) => void;
  setShowDrafted: (show: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setDraftModalPlayerId: (id: string | null) => void;
}

export const useUiStore = create<UiStore>()((set) => ({
  activeTab: "board",
  positionFilter: "ALL",
  searchQuery: "",
  sortMode: "vorp",
  showDrafted: false,
  sidebarOpen: false,
  draftModalPlayerId: null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setPositionFilter: (filter) => set({ positionFilter: filter }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortMode: (mode) => set({ sortMode: mode }),
  setShowDrafted: (show) => set({ showDrafted: show }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setDraftModalPlayerId: (id) => set({ draftModalPlayerId: id }),
}));
