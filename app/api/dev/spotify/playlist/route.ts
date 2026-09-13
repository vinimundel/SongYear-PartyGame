import { NextRequest, NextResponse } from "next/server";
import { deckStudioEnabled, getSession, importSpotifyPlaylist, playlistId } from "@/lib/spotify-dev";

export async function POST(request: NextRequest) {
  if (!deckStudioEnabled()) return NextResponse.json({ error: "Deck Studio desativado." }, { status: 404 });
  const response = NextResponse.json({});
  const session = await getSession(request, response);
  if (!session) return NextResponse.json({ error: "Conecte o Spotify primeiro." }, { status: 401 });
  const body = await request.json().catch(() => null) as { playlist?: unknown } | null;
  const id = typeof body?.playlist === "string" ? playlistId(body.playlist.trim()) : null;
  if (!id) return NextResponse.json({ error: "Link ou ID de playlist inválido." }, { status: 400 });
  try {
    const result = await importSpotifyPlaylist(id, session.accessToken);
    return NextResponse.json(result, { headers: response.headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao importar playlist." }, { status: 502, headers: response.headers });
  }
}
