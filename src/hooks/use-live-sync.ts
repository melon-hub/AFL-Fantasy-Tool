"use client";

// Client-side polling hook for AFL Fantasy live sync.
//
// Uses refs for store access to avoid stale closures in the
// setInterval callback. Subscribes to Zustand outside React
// so the interval always sees the latest player list.

import { useState, useEffect, useRef, useCallback } from "react";
import { useDraftStore, type DraftExport } from "@/stores/draft-store";
import { useUiStore } from "@/stores/ui-store";

const POLL_INTERVAL_MS = 10_000;
const MAX_RETRIES = 3;
const LIVE_SYNC_SNAPSHOT_KEY = "afl-live-sync:last-snapshot:v1";

interface SyncPick {
  playerId?: string;
  name: string;
  club: string;
  teamId: string | null;
  teamName?: string | null;
  ownerName?: string | null;
  isAutopick?: boolean | null;
  originalTeamId?: string | null;
  overallPick: number;
  round?: number | null;
  pickInRound?: number | null;
}

interface SyncTeamMeta {
  id: string;
  name: string;
  ownerName: string;
  isAutopick: boolean;
}

interface SyncLeagueMeta {
  id: string;
  name: string;
  draftStatus: string;
  draftType: string;
  numTeams: number | null;
  draftStart: string;
  pickTurnTime: number | null;
}

interface SyncSlotMeta {
  teamId: string | null;
  teamName: string | null;
  ownerName: string | null;
  isAutopick: boolean | null;
  originalTeamId: string | null;
  overallPick: number | null;
  round: number | null;
  pickInRound: number | null;
}

interface SyncMeta {
  sourceUrl?: string;
  league?: SyncLeagueMeta | null;
  teams?: SyncTeamMeta[];
  activePick?: SyncSlotMeta | null;
  nextUp?: SyncSlotMeta[];
  totalCompletedPicks?: number;
  polledAt?: string;
}

interface SavedLiveSyncSnapshot {
  version: 1;
  savedAt: number;
  totalPicks: number;
  leagueName: string | null;
  draftStatus: string | null;
  teamNames: string[];
  sourceUrl: string | null;
  exportState: DraftExport;
}

interface SavedLiveSyncSnapshotInfo {
  exists: boolean;
  savedAt: number | null;
  totalPicks: number;
  leagueName: string | null;
  draftStatus: string | null;
  teamNames: string[];
}

export interface LiveSyncStatus {
  isActive: boolean;
  status: string;
  statusColor: "gray" | "yellow" | "green" | "red";
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

/** Normalise a string for fuzzy matching: lowercase, trim, strip punctuation */
function normalise(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[.''`-]/g, "")
    .replace(/\s+/g, " ");
}

function formatOnClock(slot?: SyncSlotMeta | null): string | null {
  if (!slot) return null;
  const team = slot.teamName || slot.ownerName || slot.teamId;
  if (!team) return null;

  const pickLabel =
    slot.overallPick != null
      ? `#${slot.overallPick}`
      : slot.round != null && slot.pickInRound != null
        ? `R${slot.round}.${slot.pickInRound}`
        : null;

  return pickLabel ? `${team} (${pickLabel})` : team;
}

export function useLiveSync() {
  const [state, setState] = useState<LiveSyncStatus>({
    isActive: false,
    status: "Disconnected",
    statusColor: "gray",
    lastSyncTime: null,
    totalSynced: 0,
    pollIntervalSec: Math.round(POLL_INTERVAL_MS / 1000),
    leagueName: null,
    draftStatus: null,
    onClockLabel: null,
    teamNames: [],
    sourceUrl: null,
    nextPollAt: null,
  });

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef(0);
  const processedRef = useRef<Set<string>>(new Set());
  const teamMapRef = useRef<Map<string, number>>(new Map());
  const teamNameByIdRef = useRef<Map<string, string>>(new Map());

  // Subscribe to store outside React render cycle — always fresh
  const playersRef = useRef(useDraftStore.getState().players);
  const draftPlayerRef = useRef(useDraftStore.getState().draftPlayer);
  const setCurrentOverallPickRef = useRef(
    useDraftStore.getState().setCurrentOverallPick
  );
  const exportStateRef = useRef(useDraftStore.getState().exportState);
  const importStateRef = useRef(useDraftStore.getState().importState);

  useEffect(() => {
    const unsub = useDraftStore.subscribe((s) => {
      playersRef.current = s.players;
      draftPlayerRef.current = s.draftPlayer;
      setCurrentOverallPickRef.current = s.setCurrentOverallPick;
      exportStateRef.current = s.exportState;
      importStateRef.current = s.importState;
    });
    return unsub;
  }, []);

  const persistCurrentSnapshot = useCallback(
    (result: { totalPicks?: number; meta?: SyncMeta }) => {
      if (typeof window === "undefined") return;
      try {
        const snapshot: SavedLiveSyncSnapshot = {
          version: 1,
          savedAt: Date.now(),
          totalPicks: result.totalPicks ?? 0,
          leagueName: result.meta?.league?.name ?? null,
          draftStatus: result.meta?.league?.draftStatus ?? null,
          teamNames:
            result.meta?.teams && result.meta.teams.length > 0
              ? result.meta.teams.map((team) => team.name)
              : [],
          sourceUrl: result.meta?.sourceUrl ?? null,
          exportState: exportStateRef.current(),
        };
        window.localStorage.setItem(
          LIVE_SYNC_SNAPSHOT_KEY,
          JSON.stringify(snapshot)
        );
      } catch {
        // Ignore snapshot persistence issues; live sync should keep running.
      }
    },
    []
  );

  const readSavedSnapshot = useCallback((): SavedLiveSyncSnapshot | null => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(LIVE_SYNC_SNAPSHOT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<SavedLiveSyncSnapshot>;
      if (parsed.version !== 1) return null;
      if (!parsed.exportState || parsed.exportState.version !== 1) return null;
      if (typeof parsed.savedAt !== "number") return null;

      return {
        version: 1,
        savedAt: parsed.savedAt,
        totalPicks:
          typeof parsed.totalPicks === "number" ? parsed.totalPicks : 0,
        leagueName:
          typeof parsed.leagueName === "string" ? parsed.leagueName : null,
        draftStatus:
          typeof parsed.draftStatus === "string" ? parsed.draftStatus : null,
        teamNames: Array.isArray(parsed.teamNames)
          ? parsed.teamNames.filter((name): name is string => typeof name === "string")
          : [],
        sourceUrl:
          typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : null,
        exportState: parsed.exportState,
      };
    } catch {
      return null;
    }
  }, []);

  const getSavedSnapshotInfo = useCallback((): SavedLiveSyncSnapshotInfo => {
    const snapshot = readSavedSnapshot();
    if (!snapshot) {
      return {
        exists: false,
        savedAt: null,
        totalPicks: 0,
        leagueName: null,
        draftStatus: null,
        teamNames: [],
      };
    }
    return {
      exists: true,
      savedAt: snapshot.savedAt,
      totalPicks: snapshot.totalPicks,
      leagueName: snapshot.leagueName,
      draftStatus: snapshot.draftStatus,
      teamNames: snapshot.teamNames,
    };
  }, [readSavedSnapshot]);

  const restoreSavedSnapshot = useCallback(() => {
    const snapshot = readSavedSnapshot();
    if (!snapshot) {
      return { success: false, error: "No saved live-sync snapshot found." };
    }

    importStateRef.current(snapshot.exportState);
    setState((s) => ({
      ...s,
      status: `Restored saved snapshot — ${snapshot.totalPicks} picks`,
      statusColor: "yellow",
      lastSyncTime: snapshot.savedAt,
      totalSynced: snapshot.totalPicks,
      leagueName: snapshot.leagueName ?? s.leagueName,
      draftStatus: snapshot.draftStatus ?? s.draftStatus,
      teamNames:
        snapshot.teamNames.length > 0 ? snapshot.teamNames : s.teamNames,
      sourceUrl: snapshot.sourceUrl ?? s.sourceUrl,
    }));

    return { success: true, restoredAt: snapshot.savedAt };
  }, [readSavedSnapshot]);

  const clearSavedSnapshot = useCallback(() => {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(LIVE_SYNC_SNAPSHOT_KEY);
  }, []);

  // Publish live sync state to global UI store for header display.
  useEffect(() => {
    useUiStore.getState().setLiveSyncSnapshot({
      isActive: state.isActive,
      status: state.status,
      statusColor: state.statusColor,
      lastSyncTime: state.lastSyncTime,
      totalSynced: state.totalSynced,
      pollIntervalSec: state.pollIntervalSec,
      leagueName: state.leagueName,
      draftStatus: state.draftStatus,
      onClockLabel: state.onClockLabel,
      teamNames: state.teamNames,
      sourceUrl: state.sourceUrl,
      nextPollAt: state.nextPollAt,
    });
  }, [state]);

  // Seed disconnected header context from last saved snapshot,
  // so draft-night state can still be reviewed offline.
  useEffect(() => {
    const snapshot = readSavedSnapshot();
    if (!snapshot) return;
    setState((s) => ({
      ...s,
      totalSynced: s.totalSynced > 0 ? s.totalSynced : snapshot.totalPicks,
      lastSyncTime: s.lastSyncTime ?? snapshot.savedAt,
      leagueName: s.leagueName ?? snapshot.leagueName,
      draftStatus: s.draftStatus ?? snapshot.draftStatus,
      teamNames: s.teamNames.length > 0 ? s.teamNames : snapshot.teamNames,
      sourceUrl: s.sourceUrl ?? snapshot.sourceUrl,
    }));
  }, [readSavedSnapshot]);

  // Map AFL team IDs to 1-6 in the order they first appear
  const getTeamNumber = useCallback((teamId: string | null): number => {
    if (!teamId) return 0;
    if (!teamMapRef.current.has(teamId)) {
      teamMapRef.current.set(teamId, teamMapRef.current.size + 1);
    }
    return teamMapRef.current.get(teamId)!;
  }, []);

  // If AFL provides official team ordering, use that deterministic map.
  const applyTeamMeta = useCallback((meta?: SyncMeta) => {
    if (!meta?.teams || meta.teams.length === 0) return;

    teamMapRef.current.clear();
    teamNameByIdRef.current.clear();

    meta.teams.forEach((team, idx) => {
      teamMapRef.current.set(team.id, idx + 1);
      teamNameByIdRef.current.set(team.id, team.name);
    });
  }, []);

  // Match AFL picks against CSV players and draft them
  const processPicks = useCallback(
    (picks: SyncPick[], meta?: SyncMeta): number => {
      applyTeamMeta(meta);

      const players = playersRef.current;
      const draftPlayer = draftPlayerRef.current;
      let newCount = 0;

      const playersById = new Map<string, (typeof players)[number]>();
      const playersByNameClub = new Map<string, (typeof players)[number][]>();
      const playersByName = new Map<string, (typeof players)[number][]>();

      for (const player of players) {
        const idKey = String(player.id).trim();
        if (idKey) playersById.set(idKey, player);

        const nameKey = normalise(player.name);
        const clubKey = normalise(player.club);
        const nameClubKey = `${nameKey}__${clubKey}`;

        const byNameClub = playersByNameClub.get(nameClubKey);
        if (byNameClub) byNameClub.push(player);
        else playersByNameClub.set(nameClubKey, [player]);

        const byName = playersByName.get(nameKey);
        if (byName) byName.push(player);
        else playersByName.set(nameKey, [player]);
      }

      for (const pick of picks) {
        const pickPlayerId = String(pick.playerId ?? "").trim();
        const pickName = normalise(pick.name);
        const pickClub = normalise(pick.club);

        const pickKey =
          (pickPlayerId.length > 0
            ? pickPlayerId
            : `${pickName}_${pickClub}`) +
          `_${pick.overallPick}`;
        if (processedRef.current.has(pickKey)) continue;

        let match: (typeof players)[number] | undefined;

        // Primary match: AFL player id against CSV id/player_id.
        if (pickPlayerId) {
          match = playersById.get(pickPlayerId);
        }

        // Fallback 1: name + club exact (normalised), if unique.
        if (!match && pickName && pickClub) {
          const byNameClub = playersByNameClub.get(`${pickName}__${pickClub}`);
          if (byNameClub?.length === 1) match = byNameClub[0];
        }

        // Fallback 2: name only, if unique.
        if (!match && pickName) {
          const byName = playersByName.get(pickName);
          if (byName?.length === 1) match = byName[0];
        }

        if (match && !match.isDrafted) {
          const teamId = pick.teamId ?? null;
          const teamNum = Math.max(1, getTeamNumber(teamId));
          draftPlayer(match.id, teamNum, {
            overallPick: pick.overallPick,
            teamName:
              pick.teamName ??
              (teamId ? teamNameByIdRef.current.get(teamId) ?? null : null),
            sourceTeamId: teamId,
            round: pick.round ?? null,
            pickInRound: pick.pickInRound ?? null,
          });
          newCount++;
        }

        // Mark as processed even if no match (player not in CSV — skip)
        processedRef.current.add(pickKey);
      }

      return newCount;
    },
    [applyTeamMeta, getTeamNumber]
  );

  // Single poll request
  const poll = useCallback(
    async (leagueId?: string, xSid?: string) => {
      try {
        const body: Record<string, string> = {};
        if (leagueId) body.leagueId = leagueId;
        if (xSid) body.xSid = xSid;

        const res = await fetch("/api/live-sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const data = await res.json();

        if (!res.ok) {
          const details = Array.isArray(data.details)
            ? data.details.filter((d: unknown) => typeof d === "string")
            : [];
          const detailSuffix = details.length > 0 ? ` (${details[0]})` : "";
          return {
            success: false,
            error: (data.error || "Sync failed") + detailSuffix,
            expired: !!data.expired,
          };
        }

        const picks = Array.isArray(data.picks) ? (data.picks as SyncPick[]) : [];
        const meta = (data.meta ?? {}) as SyncMeta;
        const newCount = processPicks(picks, meta);
        const totalPicks = picks.length;

        // Keep local overall pick aligned with AFL even if some picks
        // couldn't be matched to CSV players.
        setCurrentOverallPickRef.current(totalPicks + 1);

        return {
          success: true,
          totalPicks,
          newPicks: newCount,
          raw: data.raw,
          meta,
        };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Network error";
        return { success: false, error: message, expired: false };
      }
    },
    [processPicks]
  );

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setState((s) => ({
      ...s,
      isActive: false,
      status: "Disconnected",
      statusColor: "gray",
      nextPollAt: null,
    }));
  }, []);

  const applySuccessState = useCallback(
    (
      result: {
        totalPicks?: number;
        newPicks?: number;
        meta?: SyncMeta;
      },
      context: "initial" | "poll" | "test"
    ) => {
      const totalPicks = result.totalPicks ?? 0;
      const newPicks = result.newPicks ?? 0;
      const onClock = formatOnClock(result.meta?.activePick);

      const statusBase =
        context === "test"
          ? `Test OK — ${totalPicks} picks found`
          : `Live — ${totalPicks} picks${context === "poll" && newPicks ? `, ${newPicks} new` : ""}`;

      setState((s) => ({
        ...s,
        status:
          onClock && context !== "test"
            ? `${statusBase} • On clock: ${onClock}`
            : statusBase,
        statusColor: "green",
        lastSyncTime: Date.now(),
        totalSynced: totalPicks,
        leagueName: result.meta?.league?.name || s.leagueName,
        draftStatus: result.meta?.league?.draftStatus || s.draftStatus,
        onClockLabel: onClock ?? s.onClockLabel,
        teamNames:
          result.meta?.teams && result.meta.teams.length > 0
            ? result.meta.teams.map((team) => team.name)
            : s.teamNames,
        sourceUrl: result.meta?.sourceUrl || s.sourceUrl,
        nextPollAt: s.nextPollAt,
      }));
      persistCurrentSnapshot(result);
    },
    [persistCurrentSnapshot]
  );

  const startPolling = useCallback(
    (leagueId?: string, xSid?: string) => {
      // Clean up any existing interval
      if (intervalRef.current) clearInterval(intervalRef.current);

      processedRef.current.clear();
      teamMapRef.current.clear();
      teamNameByIdRef.current.clear();
      retryCountRef.current = 0;

      setState((s) => ({
        ...s,
        isActive: true,
        status: "Connecting...",
        statusColor: "yellow",
        nextPollAt: Date.now() + POLL_INTERVAL_MS,
      }));

      // Initial poll
      poll(leagueId, xSid).then((result) => {
        if (result.success) {
          applySuccessState(result, "initial");
        } else {
          setState((s) => ({
            ...s,
            status: result.error || "Connection failed",
            statusColor: "red",
          }));
          if (result.expired) {
            stopPolling();
          }
        }
      });

      // Recurring polls
      intervalRef.current = setInterval(async () => {
        setState((s) => ({
          ...s,
          nextPollAt: Date.now() + POLL_INTERVAL_MS,
        }));
        const result = await poll(leagueId, xSid);

        if (result.success) {
          retryCountRef.current = 0;
          applySuccessState(result, "poll");
        } else {
          retryCountRef.current++;
          if (result.expired || retryCountRef.current >= MAX_RETRIES) {
            stopPolling();
            setState((s) => ({
              ...s,
              status: result.expired
                ? "Session expired — reconnect"
                : `Sync failed after ${MAX_RETRIES} retries`,
              statusColor: "red",
            }));
          } else {
            setState((s) => ({
              ...s,
              status: `Retry ${retryCountRef.current}/${MAX_RETRIES} — ${result.error}`,
              statusColor: "yellow",
            }));
          }
        }
      }, POLL_INTERVAL_MS);
    },
    [applySuccessState, poll, stopPolling]
  );

  // One-off test — fires a single poll and logs raw JSON to console
  const testConnection = useCallback(
    async (leagueId?: string, xSid?: string) => {
      setState((s) => ({
        ...s,
        status: "Testing...",
        statusColor: "yellow",
      }));

      const result = await poll(leagueId, xSid);

      if (result.success) {
        console.log("[Live Sync Test] Raw AFL response:", result.raw);
        console.log("[Live Sync Test] Parsed picks:", result.totalPicks);
        console.log("[Live Sync Test] Parsed meta:", result.meta);
        applySuccessState(result, "test");
      } else {
        setState((s) => ({
          ...s,
          status: result.error || "Test failed",
          statusColor: "red",
        }));
      }

      return result;
    },
    [applySuccessState, poll]
  );

  // Check if bookmarklet has sent credentials
  const checkBookmarklet = useCallback(async () => {
    try {
      const res = await fetch("/api/live-sync/connect");
      return (await res.json()) as { connected: boolean; leagueId: string | null };
    } catch {
      return { connected: false, leagueId: null };
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return {
    ...state,
    startPolling,
    stopPolling,
    testConnection,
    checkBookmarklet,
    getSavedSnapshotInfo,
    restoreSavedSnapshot,
    clearSavedSnapshot,
  };
}
