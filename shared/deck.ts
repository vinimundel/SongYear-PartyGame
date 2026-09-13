import rawDeck from "../data/deck.json";
import type { SongCard } from "./protocol";

export function isSongCard(value: unknown): value is SongCard {
  if (!value || typeof value !== "object") return false;
  const card = value as Partial<SongCard>;
  const linksValid = Boolean(
    card.links &&
      typeof card.links === "object" &&
      Object.values(card.links).every((link) => link === undefined || typeof link === "string")
  );
  const previewValid = Boolean(
    card.preview &&
      typeof card.preview === "object" &&
      (card.preview.itunesTrackId === undefined || (Number.isInteger(card.preview.itunesTrackId) && card.preview.itunesTrackId > 0)) &&
      (card.preview.deezerTrackId === undefined || (Number.isInteger(card.preview.deezerTrackId) && card.preview.deezerTrackId > 0))
  );
  return Boolean(
    typeof card.id === "string" &&
      typeof card.title === "string" &&
      Array.isArray(card.artists) &&
      card.artists.length > 0 &&
      card.artists.length <= 12 &&
      card.artists.every((artist) => typeof artist === "string" && artist.length > 0 && artist.length <= 120) &&
      Number.isInteger(card.year) &&
      card.year! >= 1800 &&
      card.year! <= 2200 &&
      card.id.length > 0 &&
      card.id.length <= 80 &&
      card.title.length > 0 &&
      card.title.length <= 160 &&
      (card.durationMs === undefined || (Number.isFinite(card.durationMs) && card.durationMs > 0)) &&
      previewValid &&
      linksValid
  );
}

export function validCustomDeck(value: unknown, minimum = 20, maximum = 500): value is SongCard[] {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum || !value.every(isSongCard)) return false;
  const ids = new Set(value.map((card) => card.id));
  return ids.size === value.length && value.every((card) =>
    Object.values(card.links).every((link) => link === undefined || link.startsWith("https://"))
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
