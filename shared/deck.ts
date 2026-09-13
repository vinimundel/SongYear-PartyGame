import rawDeck from "../data/deck.json";
import type { SongCard } from "./protocol";

function isSongCard(value: unknown): value is SongCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<SongCard>;
  return Boolean(
    typeof card.id === "string" &&
      typeof card.title === "string" &&
      Array.isArray(card.artists) &&
      card.artists.length > 0 &&
      card.artists.every((artist) => typeof artist === "string") &&
      Number.isInteger(card.year) &&
      card.year! >= 1800 &&
      card.year! <= 2200 &&
      card.preview &&
      typeof card.preview === "object" &&
      card.links &&
      typeof card.links === "object"
  );
}

export const SONG_DECK: SongCard[] = (rawDeck as unknown[]).filter(isSongCard);

if (SONG_DECK.length < 40) {
  throw new Error("O baralho precisa ter ao menos 40 cartas válidas.");
}

export const SONGS_BY_ID = new Map(SONG_DECK.map((card) => [card.id, card]));

export function publicCard(card: SongCard) {
  return {
    id: card.id,
    title: card.title,
    artists: card.artists,
    year: card.year,
    links: card.links,
  };
}
