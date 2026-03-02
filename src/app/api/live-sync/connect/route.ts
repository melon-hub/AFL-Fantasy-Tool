// Connect endpoint: receives league ID + X-SID from the bookmarklet.
// Also serves as a check endpoint (GET) so the client can see if
// the bookmarklet has connected.
//
// CORS headers are required when the connector uses cross-origin POST.
// The endpoint also supports a CSP-safe GET flow via top-level navigation.

import { NextRequest, NextResponse } from "next/server";
import {
  setCredentials,
  getCredentials,
  clearCredentials,
} from "@/lib/live-sync-state";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function isValidLeagueId(value: string): boolean {
  return /^\d+$/.test(value);
}

function isValidXSid(value: string): boolean {
  return value.length >= 10 && value.length <= 256 && !/\s/.test(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// Preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Bookmarklet sends credentials here
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const leagueId = String(body?.leagueId ?? "").trim();
  const xSid = String(body?.xSid ?? "").trim();

  if (!leagueId || !xSid) {
    return NextResponse.json(
      { error: "leagueId and xSid required" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!isValidLeagueId(leagueId) || !isValidXSid(xSid)) {
    return NextResponse.json(
      { error: "invalid leagueId or xSid format" },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  setCredentials(leagueId, xSid);

  return NextResponse.json(
    { success: true, leagueId },
    { headers: CORS_HEADERS }
  );
}

// Client checks if bookmarklet has connected
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const leagueId = url.searchParams.get("leagueId")?.trim() ?? "";
  const xSid = url.searchParams.get("xSid")?.trim() ?? "";

  // CSP-safe connect path: AFL page can open this URL in a new tab
  // without cross-origin fetch. If params are present, store creds.
  if (leagueId && xSid) {
    if (!isValidLeagueId(leagueId) || !isValidXSid(xSid)) {
      return NextResponse.json(
        { error: "invalid leagueId or xSid format" },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    setCredentials(leagueId, xSid);
    const leagueIdSafe = escapeHtml(leagueId);
    const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8"><title>AFL Live Sync Connected</title></head>
  <body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;line-height:1.4">
    <h2 style="margin:0 0 8px">Connected</h2>
    <p style="margin:0 0 6px">League <strong>${leagueIdSafe}</strong> is now linked to your local draft tool.</p>
    <p style="margin:0;color:#666">Return to your app and click <strong>Start Live Sync</strong>.</p>
  </body>
</html>`;
    return new NextResponse(html, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  }

  const creds = getCredentials();
  return NextResponse.json(
    { connected: !!creds, leagueId: creds?.leagueId ?? null },
    { headers: CORS_HEADERS }
  );
}

// Disconnect
export async function DELETE() {
  clearCredentials();
  return NextResponse.json(
    { success: true },
    { headers: CORS_HEADERS }
  );
}
