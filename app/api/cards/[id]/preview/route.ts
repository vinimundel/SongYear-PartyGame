import { NextRequest, NextResponse } from "next/server";
import { getSongCard } from "@/lib/deck-server";
import { resolvePreview } from "@/lib/preview";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const card = getSongCard(id);
  if (!card) return NextResponse.json({ error: "card_not_found" }, { status: 404 });
  const refresh = request.nextUrl.searchParams.get("refresh") === "1";
  const result = await resolvePreview(card, refresh);
  return NextResponse.json(result, {
    status: result.status === "unavailable" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
