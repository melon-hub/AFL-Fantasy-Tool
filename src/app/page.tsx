"use client";

import { useEffect, useMemo, useState } from "react";
import {
  LayoutGrid,
  Users,
  Calendar,
  History,
  Flame,
  Settings,
  Menu,
} from "lucide-react";
import clsx from "clsx";

import { useDraftStore } from "@/stores/draft-store";
import { useSettingsStore } from "@/stores/settings-store";
import { useUiStore, type Tab } from "@/stores/ui-store";
import { calculateVorp } from "@/lib/vorp";

import { CsvUpload } from "@/components/csv-upload";
import { DraftBoard } from "@/components/draft-board";
import { DraftModal } from "@/components/draft-modal";
import { IntelligencePanel } from "@/components/intelligence-panel";
import { MyTeamPanel } from "@/components/my-team-panel";
import { RecentPicks } from "@/components/recent-picks";
import { ByePlanner } from "@/components/bye-planner";
import { SmokiesPanel } from "@/components/smokies-panel";
import { SettingsSidebar } from "@/components/settings-sidebar";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "board", label: "Draft Board", icon: <LayoutGrid className="h-4 w-4" /> },
  { id: "team", label: "My Team", icon: <Users className="h-4 w-4" /> },
  { id: "bye", label: "Bye Planner", icon: <Calendar className="h-4 w-4" /> },
  { id: "picks", label: "Recent Picks", icon: <History className="h-4 w-4" /> },
  { id: "smokies", label: "Smokies", icon: <Flame className="h-4 w-4" /> },
];

export default function Home() {
  const {
    players,
    draftPicks,
    currentOverallPick,
    draftPlayer,
    undraftPlayer,
    undoLastPick,
    undoLastN,
  } = useDraftStore();

  const settingsStore = useSettingsStore();
  const settings = settingsStore.getSettings();

  const {
    activeTab,
    setActiveTab,
    sidebarOpen,
    setSidebarOpen,
    draftModalPlayerId,
    setDraftModalPlayerId,
    liveSyncSnapshot,
  } = useUiStore();

  const [nowTs, setNowTs] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNowTs(Date.now());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Recalculate VORP on every render (players/settings change)
  const playersWithMetrics = useMemo(
    () =>
      players.length > 0
        ? calculateVorp(players, settings, currentOverallPick)
        : [],
    [players, settings, currentOverallPick]
  );

  const draftedCount = players.filter((p) => p.isDrafted).length;
  const availableCount = players.length - draftedCount;
  const nextSyncCountdownSec = useMemo(() => {
    if (!liveSyncSnapshot.isActive || !liveSyncSnapshot.nextPollAt) return null;
    return Math.max(0, Math.ceil((liveSyncSnapshot.nextPollAt - nowTs) / 1000));
  }, [liveSyncSnapshot.isActive, liveSyncSnapshot.nextPollAt, nowTs]);

  const modalPlayer = draftModalPlayerId
    ? playersWithMetrics.find((p) => p.id === draftModalPlayerId)
    : null;

  const handleDraftClick = (playerId: string) => {
    setDraftModalPlayerId(playerId);
  };

  const handleDraft = (teamNumber: number) => {
    if (draftModalPlayerId) {
      draftPlayer(draftModalPlayerId, teamNumber);
      setDraftModalPlayerId(null);
    }
  };

  // Show CSV upload if no players loaded
  if (players.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          AFL Fantasy Draft Tool 2026
        </h1>
        <p className="mb-8 text-zinc-500">
          VORP-based draft assistant for 6-team leagues
        </p>
        <CsvUpload />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2 dark:border-zinc-700 dark:bg-zinc-900">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="rounded p-1.5 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          {sidebarOpen ? (
            <Settings className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
        <h1 className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
          AFL Draft Tool
        </h1>

        {/* Tabs */}
        <nav className="ml-4 flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
              )}
            >
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          ))}
        </nav>

        {/* Status */}
        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          <span>
            <strong className="text-zinc-700 dark:text-zinc-300">
              {availableCount}
            </strong>{" "}
            available
          </span>
          <span>
            <strong className="text-zinc-700 dark:text-zinc-300">
              {draftedCount}
            </strong>{" "}
            drafted
          </span>
          <span>
            Pick{" "}
            <strong className="text-zinc-700 dark:text-zinc-300">
              #{currentOverallPick}
            </strong>
          </span>
          <span className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
          <span className="inline-flex items-center gap-1.5">
            <span
              className={clsx(
                "h-2 w-2 rounded-full",
                liveSyncSnapshot.statusColor === "green" && "bg-green-500",
                liveSyncSnapshot.statusColor === "yellow" && "bg-yellow-500",
                liveSyncSnapshot.statusColor === "red" && "bg-red-500",
                liveSyncSnapshot.statusColor === "gray" && "bg-zinc-300 dark:bg-zinc-600"
              )}
            />
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {liveSyncSnapshot.isActive ? "Live Sync" : "Sync Off"}
            </span>
          </span>
          {liveSyncSnapshot.isActive && (
            <span className="hidden lg:inline">
              next sync in{" "}
              <strong className="text-zinc-700 dark:text-zinc-300">
                {nextSyncCountdownSec ?? "—"}s
              </strong>
            </span>
          )}
          {liveSyncSnapshot.isActive && liveSyncSnapshot.onClockLabel && (
            <span className="hidden xl:inline">
              on clock{" "}
              <strong className="text-zinc-700 dark:text-zinc-300">
                {liveSyncSnapshot.onClockLabel}
              </strong>
            </span>
          )}
        </div>
      </header>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Settings sidebar */}
        <SettingsSidebar />

        {/* Main content area */}
        <div className="flex flex-1 overflow-hidden">
          {/* Tab content */}
          <main className="flex-1 overflow-y-auto p-4">
            {activeTab === "board" && (
              <DraftBoard
                players={playersWithMetrics}
                settings={settings}
                onDraftClick={handleDraftClick}
              />
            )}
            {activeTab === "team" && (
              <MyTeamPanel
                players={playersWithMetrics}
                settings={settings}
              />
            )}
            {activeTab === "bye" && (
              <ByePlanner
                players={playersWithMetrics}
                settings={settings}
              />
            )}
            {activeTab === "picks" && (
              <RecentPicks
                draftPicks={draftPicks}
                onUndoLast={undoLastPick}
                onUndoLastN={undoLastN}
                onUndraftPlayer={undraftPlayer}
              />
            )}
            {activeTab === "smokies" && (
              <SmokiesPanel
                players={playersWithMetrics}
                settings={settings}
                onDraftClick={handleDraftClick}
              />
            )}
          </main>

          {/* Intelligence panel — visible on Draft Board tab */}
          {activeTab === "board" && (
            <aside className="hidden w-[26rem] shrink-0 overflow-y-auto border-l border-zinc-200 p-3 lg:block dark:border-zinc-700">
              <IntelligencePanel
                players={playersWithMetrics}
                settings={settings}
                draftPicks={draftPicks}
                currentOverallPick={currentOverallPick}
                onDraftClick={handleDraftClick}
              />
            </aside>
          )}
        </div>
      </div>

      {/* Draft modal */}
      {modalPlayer && (
        <DraftModal
          player={modalPlayer}
          numTeams={settings.numTeams}
          myTeamNumber={settings.myTeamNumber}
          onDraft={handleDraft}
          onClose={() => setDraftModalPlayerId(null)}
        />
      )}
    </div>
  );
}
