// Connect endpoint: receives league ID + X-SID from the bookmarklet.
// Also serves as a check endpoint (GET) so the client can see if
// the bookmarklet has connected.
//
// CORS headers are required because the bookmarklet runs on
// fantasy.afl.com.au and POSTs to localhost:3000.

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

// Preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// Bookmarklet sends credentials here
export async function POST(request: NextRequest) {
  const { leagueId, xSid } = await request.json();

  if (!leagueId || !xSid) {
    return NextResponse.json(
      { error: "leagueId and xSid required" },
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
export async function GET() {
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
