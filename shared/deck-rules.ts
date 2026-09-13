import { MAX_SONGS_PER_ARTIST, type SongCard } from "./protocol";

type ArtistCard = Pick<SongCard, "artists">;

function artistKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLocaleLowerCase("pt-BR");
}

function cardArtistKeys(card: ArtistCard): string[] {
  return [...new Set(card.artists.map(artistKey).filter(Boolean))];
}

function artistCounts(cards: ArtistCard[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const card of cards) {
    for (const artist of cardArtistKeys(card)) counts.set(artist, (counts.get(artist) ?? 0) + 1);
  }
  return counts;
}

export function shuffledCopy<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function selectWithinArtistLimit<T extends ArtistCard>(
  candidates: T[],
  existing: ArtistCard[] = [],
  maximum = MAX_SONGS_PER_ARTIST
): { accepted: T[]; rejected: number } {
  const counts = artistCounts(existing);
  const accepted: T[] = [];
  let rejected = 0;

  for (const card of candidates) {
    const artists = cardArtistKeys(card);
    if (artists.some((artist) => (counts.get(artist) ?? 0) >= maximum)) {
      rejected += 1;
      continue;
    }
    accepted.push(card);
    for (const artist of artists) counts.set(artist, (counts.get(artist) ?? 0) + 1);
  }

  return { accepted, rejected };
}

export function respectsArtistLimit(cards: ArtistCard[], maximum = MAX_SONGS_PER_ARTIST): boolean {
  return [...artistCounts(cards).values()].every((count) => count <= maximum);
}
