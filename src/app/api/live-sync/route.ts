// API route: polls AFL Fantasy for draft picks using X-SID cookie.
// Server-side fetch — no CORS issues.
//
// Accepts credentials in the POST body, or falls back to stored
// credentials from the bookmarklet connect endpoint.

import { NextRequest, NextResponse } from "next/server";
import { getCredentials } from "@/lib/live-sync-state";

interface SyncTeamMeta {
  id: string;
  name: string;
  ownerName: string;
  isAutopick: boolean;
}

interface TeamLookupEntry {
  name: string;
  ownerName: string;
  isAutopick: boolean;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function parseTeams(data: unknown): SyncTeamMeta[] {
  if (!data || typeof data !== "object") return [];
  const root = data as Record<string, unknown>;
  const success = root.success as Record<string, unknown> | undefined;
  const teams = success?.teams;
  if (!Array.isArray(teams)) return [];

  return teams
    .filter((team) => team && typeof team === "object")
    .map((team) => {
      const t = team as Record<string, unknown>;
      const owner = (t.owner ?? {}) as Record<string, unknown>;
      return {
        id: String(t.id ?? ""),
        name: String(t.name ?? `Team ${t.id ?? ""}`),
        ownerName: String(owner.displayName ?? ""),
        isAutopick: Boolean(t.isAutopick),
      };
    })
    .filter((team) => team.id.length > 0);
}

function parseLeague(data: unknown) {
  if (!data || typeof data !== "object") return null;
  const root = data as Record<string, unknown>;
  const success = root.success as Record<string, unknown> | undefined;
  const league = success?.league as Record<string, unknown> | undefined;
  if (!league) return null;

  return {
    id: String(league.id ?? ""),
    name: String(league.name ?? ""),
    draftStatus: String(league.draftStatus ?? ""),
    draftType: String(league.draftType ?? ""),
    numTeams: toNumber(league.numTeams),
    draftStart: String(league.draftStart ?? ""),
    pickTurnTime: toNumber(league.pickTurnTime),
  };
}

function looksLikePickArray(arr: unknown[]): boolean {
  return arr.some((item) => {
    if (!item || typeof item !== "object") return false;
    const keys = Object.keys(item as Record<string, unknown>);
    const hasPlayerSignal = keys.some((k) => /player|name/i.test(k));
    const hasPickSignal = keys.some((k) =>
      /pick|team|club|selection|overall|draft/i.test(k)
    );
    return hasPlayerSignal && hasPickSignal;
  });
}

function extractRawPicks(data: unknown): unknown[] {
  if (Array.isArray(data) && looksLikePickArray(data)) return data;
  if (!data || typeof data !== "object") return [];

  const direct = data as Record<string, unknown>;
  const directKeys = [
    "picks",
    "selections",
    "drafted",
    "draftPicks",
    "draft_picks",
    "results",
    "events",
  ];

  for (const key of directKeys) {
    if (Array.isArray(direct[key]) && looksLikePickArray(direct[key] as unknown[])) {
      return direct[key] as unknown[];
    }
  }

  // Breadth-first search through nested payloads to find the first array
  // that resembles pick objects.
  const queue: unknown[] = [data];
  const seen = new WeakSet<object>();
  let steps = 0;

  while (queue.length > 0 && steps < 8000) {
    steps++;
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current)) {
      if (looksLikePickArray(current)) return current;
      for (const item of current) queue.push(item);
      continue;
    }

    if (typeof current === "object") {
      if (seen.has(current)) continue;
      seen.add(current);
      const obj = current as Record<string, unknown>;

      for (const key of directKeys) {
        const value = obj[key];
        if (Array.isArray(value) && looksLikePickArray(value)) {
          return value;
        }
      }

      for (const value of Object.values(obj)) queue.push(value);
    }
  }

  return [];
}

function mapDraftSlot(
  slotRaw: unknown,
  teamLookup: Map<string, TeamLookupEntry>
): {
  teamId: string | null;
  teamName: string | null;
  ownerName: string | null;
  isAutopick: boolean | null;
  originalTeamId: string | null;
  overallPick: number | null;
  round: number | null;
  pickInRound: number | null;
} {
  const slot = (slotRaw ?? {}) as Record<string, unknown>;

  const teamIdRaw =
    slot.teamId ?? slot.team_id ?? slot.draftTeamId ?? slot.fantasyTeamId ?? null;
  const teamId = teamIdRaw == null ? null : String(teamIdRaw);

  const originalTeamIdRaw =
    slot.originalTeamId ?? slot.original_team_id ?? slot.originalDraftTeamId ?? null;
  const originalTeamId = originalTeamIdRaw == null ? null : String(originalTeamIdRaw);

  const team = teamId ? teamLookup.get(teamId) : undefined;

  return {
    teamId,
    teamName: team?.name ?? null,
    ownerName: team?.ownerName ?? null,
    isAutopick: team?.isAutopick ?? null,
    originalTeamId,
    overallPick:
      toNumber(slot.overallPick) ??
      toNumber(slot.overall_pick) ??
      toNumber(slot.pickNumber) ??
      null,
    round: toNumber(slot.round) ?? toNumber(slot.roundNumber),
    pickInRound:
      toNumber(slot.pick) ??
      toNumber(slot.pickInRound) ??
      toNumber(slot.roundPick),
  };
}

function mapPicks(
  rawPicks: unknown[],
  teamLookup: Map<string, TeamLookupEntry>
) {
  return rawPicks.map((p: unknown, idx: number) => {
    const pick = p as Record<string, unknown>;
    const player = (pick.player ?? {}) as Record<string, unknown>;
    const slot = mapDraftSlot(p, teamLookup);

    return {
      playerId: String(player.id ?? pick.playerId ?? pick.player_id ?? ""),
      name: String(player.name ?? pick.playerName ?? pick.name ?? "").trim(),
      club: String(
        player.club ??
          player.clubAbbr ??
          player.clubCode ??
          pick.playerClub ??
          pick.club ??
          pick.team ??
          ""
      ).trim(),
      teamId: slot.teamId,
      teamName: slot.teamName,
      ownerName: slot.ownerName,
      isAutopick: slot.isAutopick,
      originalTeamId: slot.originalTeamId,
      overallPick: Number(
        slot.overallPick ??
          toNumber(pick.pick) ??
          idx + 1
      ),
      round: slot.round,
      pickInRound: slot.pickInRound,
    };
  });
}

function extractNextData(html: string): unknown | null {
  const match = html.match(
    /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (!match) return null;

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function extractCandidateUrlsFromHtml(html: string, leagueId: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (raw: string) => {
    let url = raw.replace(/&amp;/g, "&").replace(/\\\//g, "/").trim();
    if (!url) return;

    if (url.startsWith("//")) url = `https:${url}`;
    else if (url.startsWith("/")) url = `https://fantasy.afl.com.au${url}`;

    if (!url.startsWith("https://fantasy.afl.com.au")) return;
    if (!url.includes(leagueId)) return;
    if (!/api|draft|pick|selection|league|_next\/data/i.test(url)) return;
    if (/\.(js|css|png|jpg|jpeg|svg|woff2?)($|\?)/i.test(url)) return;

    if (!seen.has(url)) {
      seen.add(url);
      out.push(url);
    }
  };

  const patterns = [
    /https?:\/\/fantasy\.afl\.com\.au[^"'`\s<>)]+/gi,
    /\/api\/[^"'`\s<>)]*/gi,
    /\/_next\/data\/[^"'`\s<>)]*\.json[^"'`\s<>)]*/gi,
    new RegExp(`/[^"'\\s<>)]*${leagueId}[^"'\\s<>)]*`, "gi"),
  ];

  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      add(match[0]);
    }
  }

  return out;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const stored = getCredentials();

  const leagueId = body.leagueId || stored?.leagueId;
  const xSid = body.xSid || stored?.xSid;

  if (!leagueId || !xSid) {
    return NextResponse.json(
      { success: false, error: "Not connected. Paste credentials or use the bookmarklet." },
      { status: 400 }
    );
  }

  try {
    const teamsUrl = `https://fantasy.afl.com.au/api/en/draft/league/teams/${leagueId}`;
    const leagueUrl = `https://fantasy.afl.com.au/api/en/draft/league/${leagueId}`;

    // AFL endpoints have changed between seasons. Start with known patterns,
    // then discover more URLs from returned HTML when possible.
    const queue = [
      `https://fantasy.afl.com.au/api/en/draft/draft-process/${leagueId}/draft-board`,
      teamsUrl,
      leagueUrl,
      `https://fantasy.afl.com.au/draft/league/${leagueId}/picks`,
      `https://fantasy.afl.com.au/draft/leagues/${leagueId}/picks`,
      `https://fantasy.afl.com.au/draft/league/${leagueId}/overview`,
      `https://fantasy.afl.com.au/draft/league/${leagueId}/draft`,
      `https://fantasy.afl.com.au/_next/data/${leagueId}/draft/league/${leagueId}/draft.json`,
    ];
    const tried = new Set<string>();
    const endpointErrors: string[] = [];

    for (let i = 0; i < queue.length && i < 30; i++) {
      const url = queue[i];
      if (tried.has(url)) continue;
      tried.add(url);

      const response = await fetch(url, {
        headers: {
          Cookie: `X-SID=${xSid}`,
          Accept: "application/json,text/plain,*/*",
        },
        redirect: "follow",
        cache: "no-store",
      });

      if (response.status === 401 || response.status === 403) {
        return NextResponse.json(
          { success: false, error: "Session expired — reconnect", expired: true },
          { status: 401 }
        );
      }

      if (!response.ok) {
        endpointErrors.push(`${url} -> HTTP ${response.status}`);
        continue;
      }

      const text = await response.text();
      const contentType = response.headers.get("content-type") ?? "";
      let jsonData: unknown;
      let parsedJson = false;

      try {
        jsonData = JSON.parse(text);
        parsedJson = true;
      } catch {
        parsedJson = false;
      }

      if (parsedJson) {
        const payload = jsonData as Record<string, unknown>;
        const successNode = payload.success as Record<string, unknown> | undefined;

        // 2026 endpoint shape:
        // /api/en/draft/draft-process/{leagueId}/draft-board
        // -> { success: { completedPicks: [...] }, errors: [] }
        if (successNode && Array.isArray(successNode.completedPicks)) {
          const [teamsResponse, leagueResponse] = await Promise.all([
            fetch(teamsUrl, {
              headers: {
                Cookie: `X-SID=${xSid}`,
                Accept: "application/json,text/plain,*/*",
              },
              cache: "no-store",
            }),
            fetch(leagueUrl, {
              headers: {
                Cookie: `X-SID=${xSid}`,
                Accept: "application/json,text/plain,*/*",
              },
              cache: "no-store",
            }),
          ]);

          if (
            teamsResponse.status === 401 ||
            teamsResponse.status === 403 ||
            leagueResponse.status === 401 ||
            leagueResponse.status === 403
          ) {
            return NextResponse.json(
              { success: false, error: "Session expired — reconnect", expired: true },
              { status: 401 }
            );
          }

          const teamsData = teamsResponse.ok
            ? await teamsResponse.json().catch(() => null)
            : null;
          const leagueData = leagueResponse.ok
            ? await leagueResponse.json().catch(() => null)
            : null;

          const teams = parseTeams(teamsData);
          const teamLookup = new Map<string, TeamLookupEntry>(
            teams.map((team) => [
              team.id,
              {
                name: team.name,
                ownerName: team.ownerName,
                isAutopick: team.isAutopick,
              },
            ])
          );
          const league = parseLeague(leagueData);

          const completedPicks = mapPicks(
            successNode.completedPicks as unknown[],
            teamLookup
          );
          const activePick = successNode.activePick
            ? mapDraftSlot(successNode.activePick, teamLookup)
            : null;
          const nextUp = Array.isArray(successNode.futurePicks)
            ? (successNode.futurePicks as unknown[])
                .slice(0, 8)
                .map((slot) => mapDraftSlot(slot, teamLookup))
            : [];

          return NextResponse.json({
            success: true,
            picks: completedPicks,
            meta: {
              sourceUrl: url,
              league,
              teams,
              activePick,
              nextUp,
              totalCompletedPicks: completedPicks.length,
              polledAt: new Date().toISOString(),
            },
            raw: jsonData, // included so "Test Connection" can log full shape
          });
        }

        const rawPicks = extractRawPicks(jsonData);
        if (rawPicks.length > 0) {
          const teamLookup = new Map<string, TeamLookupEntry>();
          return NextResponse.json({
            success: true,
            picks: mapPicks(rawPicks, teamLookup),
            meta: {
              sourceUrl: url,
              polledAt: new Date().toISOString(),
            },
            raw: jsonData, // included so "Test Connection" can log full shape
          });
        }

        const apiErrors = Array.isArray(payload.errors)
          ? payload.errors.filter((e) => e && typeof e === "object")
          : [];
        if (apiErrors.length > 0) {
          const first = apiErrors[0] as Record<string, unknown>;
          const message = String(first.message ?? "unknown API error");
          endpointErrors.push(`${url} -> API error (${message})`);
          continue;
        }

        endpointErrors.push(
          `${url} -> JSON but no pick-like array (content-type: ${contentType || "unknown"})`
        );
        continue;
      }

      // HTML fallback: try extracting Next.js embedded JSON, then discover
      // additional candidate URLs inside the page source.
      const nextData = extractNextData(text);
      if (nextData) {
        const rawPicks = extractRawPicks(nextData);
        if (rawPicks.length > 0) {
          const teamLookup = new Map<string, TeamLookupEntry>();
          return NextResponse.json({
            success: true,
            picks: mapPicks(rawPicks, teamLookup),
            meta: {
              sourceUrl: url,
              polledAt: new Date().toISOString(),
            },
            raw: nextData,
          });
        }
      }

      for (const discovered of extractCandidateUrlsFromHtml(text, leagueId)) {
        if (!tried.has(discovered) && !queue.includes(discovered)) {
          queue.push(discovered);
        }
      }

      const preview = text.slice(0, 80).replace(/\s+/g, " ");
      endpointErrors.push(`${url} -> non-JSON response (${preview})`);
    }

    return NextResponse.json(
      {
        success: false,
        error:
          "Could not find a JSON draft endpoint. AFL likely returned HTML (login/overview page) or changed the API URL.",
        details: endpointErrors,
      },
      { status: 502 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Sync failed";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
