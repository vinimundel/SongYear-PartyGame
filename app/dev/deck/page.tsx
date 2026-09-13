import { notFound } from "next/navigation";
import { DeckStudio } from "@/components/deck-studio";
import { deckStudioEnabled } from "@/lib/spotify-dev";

export const dynamic = "force-dynamic";

export default function DeckStudioPage() {
  if (!deckStudioEnabled()) notFound();
  return <DeckStudio />;
}
