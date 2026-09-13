import { NextResponse } from "next/server";
import { deckStudioEnabled, newSpotifyState, SPOTIFY_STATE_COOKIE, spotifyAuthorizeUrl } from "@/lib/spotify-dev";

export async function GET() {
  if (!deckStudioEnabled()) return NextResponse.json({ error: "Deck Studio desativado." }, { status: 404 });
  try {
    const state = newSpotifyState();
    const destination = spotifyAuthorizeUrl(state);
    const response = NextResponse.redirect(destination);
    response.cookies.set(SPOTIFY_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: destination.searchParams.get("redirect_uri")?.startsWith("https://") ?? true,
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Spotify não configurado." }, { status: 500 });
  }
}
