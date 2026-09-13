import { NextRequest, NextResponse } from "next/server";
import { clearSession, getSession } from "@/lib/spotify-dev";

export async function GET(request: NextRequest) {
  const cookieResponse = NextResponse.json({});
  const session = await getSession(request, cookieResponse);
  if (!session) clearSession(cookieResponse);
  return NextResponse.json({
    enabled: Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET && process.env.SPOTIFY_REDIRECT_URI),
    connected: Boolean(session),
    ...(session?.displayName ? { displayName: session.displayName } : {}),
  }, { headers: cookieResponse.headers });
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  clearSession(response);
  return response;
}
