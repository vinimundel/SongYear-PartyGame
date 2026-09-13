import { NextRequest, NextResponse } from "next/server";
import {
  newSpotifyState,
  safeReturnTo,
  SPOTIFY_RETURN_COOKIE,
  SPOTIFY_STATE_COOKIE,
  spotifyAuthorizeUrl,
} from "@/lib/spotify-dev";

export async function GET(request: NextRequest) {
  try {
    const state = newSpotifyState();
    const destination = spotifyAuthorizeUrl(state);
    const secure = destination.searchParams.get("redirect_uri")?.startsWith("https://") ?? true;
    const response = NextResponse.redirect(destination);
    response.cookies.set(SPOTIFY_STATE_COOKIE, state, { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 600 });
    response.cookies.set(SPOTIFY_RETURN_COOKIE, safeReturnTo(request.nextUrl.searchParams.get("returnTo")), { httpOnly: true, sameSite: "lax", secure, path: "/", maxAge: 600 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Spotify não configurado." }, { status: 500 });
  }
}
