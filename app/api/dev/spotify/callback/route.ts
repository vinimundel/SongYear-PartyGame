import { NextRequest, NextResponse } from "next/server";
import { clearSession, deckStudioEnabled, exchangeCode, setSession, SPOTIFY_STATE_COOKIE } from "@/lib/spotify-dev";

export async function GET(request: NextRequest) {
  if (!deckStudioEnabled()) return NextResponse.json({ error: "Deck Studio desativado." }, { status: 404 });
  const expected = request.cookies.get(SPOTIFY_STATE_COOKIE)?.value;
  const state = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  if (!expected || expected !== state || !code) {
    const response = NextResponse.redirect(new URL("/dev/deck?spotify=erro", request.url));
    clearSession(response);
    return response;
  }
  try {
    const session = await exchangeCode(code);
    const response = NextResponse.redirect(new URL("/dev/deck?spotify=conectado", request.url));
    setSession(response, session);
    return response;
  } catch {
    const response = NextResponse.redirect(new URL("/dev/deck?spotify=erro", request.url));
    clearSession(response);
    return response;
  }
}
