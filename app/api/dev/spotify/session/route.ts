import { NextRequest, NextResponse } from "next/server";
import { clearSession, deckStudioEnabled, getSession } from "@/lib/spotify-dev";

export async function GET(request: NextRequest) {
  if (!deckStudioEnabled()) return NextResponse.json({ enabled: false, connected: false });
  const response = NextResponse.json({ enabled: true, connected: false });
  const session = await getSession(request, response);
  if (!session) {
    clearSession(response);
    return response;
  }
  return NextResponse.json({ enabled: true, connected: true, displayName: session.displayName }, { headers: response.headers });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSession(response);
  return response;
}
