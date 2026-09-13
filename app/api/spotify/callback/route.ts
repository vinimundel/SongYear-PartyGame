import { NextRequest, NextResponse } from "next/server";
import {
  clearSession,
  exchangeCode,
  safeReturnTo,
  setSession,
  SPOTIFY_RETURN_COOKIE,
  SPOTIFY_STATE_COOKIE,
} from "@/lib/spotify-dev";

function callbackDestination(request: NextRequest, returnTo: string, spotify: "conectado" | "erro"): URL {
  // Atrás de um Quick Tunnel, request.url pode conter o host interno 0.0.0.0.
  // O redirect URI configurado é a origem pública canônica do fluxo OAuth.
  const publicBase = process.env.SPOTIFY_REDIRECT_URI?.trim() || request.url;
  const destination = new URL(returnTo, publicBase);
  destination.searchParams.set("spotify", spotify);
  return destination;
}

export async function GET(request: NextRequest) {
  const expected = request.cookies.get(SPOTIFY_STATE_COOKIE)?.value;
  const returned = request.nextUrl.searchParams.get("state");
  const code = request.nextUrl.searchParams.get("code");
  const returnTo = safeReturnTo(request.cookies.get(SPOTIFY_RETURN_COOKIE)?.value ?? null);
  if (!expected || expected !== returned || !code) {
    const response = NextResponse.redirect(callbackDestination(request, returnTo, "erro"));
    clearSession(response);
    return response;
  }
  try {
    const session = await exchangeCode(code);
    const response = NextResponse.redirect(callbackDestination(request, returnTo, "conectado"));
    setSession(response, session);
    return response;
  } catch {
    const response = NextResponse.redirect(callbackDestination(request, returnTo, "erro"));
    clearSession(response);
    return response;
  }
}
