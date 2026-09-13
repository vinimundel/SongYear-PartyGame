import { NextRequest, NextResponse } from "next/server";
import { resolvePreview } from "@/lib/preview";
import { deckStudioEnabled } from "@/lib/spotify-dev";
import type { SongCard } from "@/shared/protocol";

export async function POST(request: NextRequest) {
  if (!deckStudioEnabled()) return NextResponse.json({ error: "Deck Studio desativado." }, { status: 404 });
  const body = await request.json().catch(() => null) as Partial<SongCard> | null;
  if (!body?.title || !Array.isArray(body.artists) || !body.artists[0]) {
    return NextResponse.json({ error: "Faixa inválida." }, { status: 400 });
  }
  const card: SongCard = {
    id: `dev-${body.title}-${body.artists[0]}`,
    title: body.title,
    artists: body.artists,
    year: Number(body.year) || new Date().getFullYear(),
    durationMs: body.durationMs,
    preview: body.preview ?? {},
    links: body.links ?? {},
  };
  return NextResponse.json(await resolvePreview(card, true));
}
