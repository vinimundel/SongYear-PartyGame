import { NextRequest, NextResponse } from "next/server";
import { deckStudioEnabled } from "@/lib/spotify-dev";

interface GeniusHit {
  result?: { id?: number; title?: string; artist_names?: string; url?: string };
}

export async function POST(request: NextRequest) {
  if (!deckStudioEnabled()) return NextResponse.json({ error: "Deck Studio desativado." }, { status: 404 });
  const accessToken = process.env.GENIUS_ACCESS_TOKEN?.trim();
  if (!accessToken) return NextResponse.json({ error: "GENIUS_ACCESS_TOKEN não configurado." }, { status: 503 });
  const body = await request.json().catch(() => null) as { title?: unknown; artist?: unknown } | null;
  if (typeof body?.title !== "string" || typeof body.artist !== "string") {
    return NextResponse.json({ error: "Faixa inválida." }, { status: 400 });
  }
  try {
    const search = await fetch(`https://api.genius.com/search?q=${encodeURIComponent(`${body.artist} ${body.title}`)}`, {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
    });
    if (!search.ok) throw new Error(`Genius respondeu ${search.status}.`);
    const hit = ((await search.json()) as { response?: { hits?: GeniusHit[] } }).response?.hits?.[0]?.result;
    if (!hit?.id) return NextResponse.json({ match: null });
    const detail = await fetch(`https://api.genius.com/songs/${hit.id}?text_format=plain`, {
      headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store",
    });
    if (!detail.ok) throw new Error(`Genius respondeu ${detail.status}.`);
    const song = ((await detail.json()) as {
      response?: { song?: { title?: string; artist_names?: string; url?: string; release_date_components?: { year?: number } } };
    }).response?.song;
    return NextResponse.json({
      match: song ? { title: song.title ?? hit.title, artist: song.artist_names ?? hit.artist_names, year: song.release_date_components?.year ?? null, geniusUrl: song.url ?? hit.url } : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Falha ao consultar Genius." }, { status: 502 });
  }
}
