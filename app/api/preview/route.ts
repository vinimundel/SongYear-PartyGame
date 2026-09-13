import { NextRequest, NextResponse } from "next/server";
import { resolvePreview } from "@/lib/preview";
import { validCustomDeck } from "@/shared/deck";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  if (!validCustomDeck([body], 1, 1)) return NextResponse.json({ error: "Faixa inválida." }, { status: 400 });
  const result = await resolvePreview(body);
  return NextResponse.json(result, {
    status: result.status === "unavailable" ? 503 : 200,
    headers: { "Cache-Control": "no-store" },
  });
}
