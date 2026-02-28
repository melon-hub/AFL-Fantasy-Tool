// Server-side only — stores bookmarklet credentials in memory.
// Dies when you stop pnpm dev, which is fine (draft-night only).

let credentials: { leagueId: string; xSid: string } | null = null;

export function setCredentials(leagueId: string, xSid: string) {
  credentials = { leagueId, xSid };
}

export function getCredentials() {
  return credentials;
}

export function clearCredentials() {
  credentials = null;
}
