import "server-only";
import { getCacheStore } from "@/lib/kv";
import type { SongCard } from "@/shared/protocol";

export type PreviewStatus = "found" | "absent" | "unavailable";
export interface PreviewResult {
  previewUrl: string | null;
  status: PreviewStatus;
  source?: "itunes" | "deezer";
}

interface CachedPreview extends PreviewResult {
  resolvedAt: number;
}

const TIMEOUT_MS = 3500;
const FOUND_TTL = 365 * 24 * 60 * 60;
const ABSENT_TTL = 7 * 24 * 60 * 60;
const UNAVAILABLE_TTL = 90;

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function titleMatches(expected: string, actual: string): boolean {
  const left = normalize(expected);
  const right = normalize(actual);
  return left === right || left.includes(right) || right.includes(left);
}

function artistMatches(expected: string[], actual: string): boolean {
  const haystack = normalize(actual);
  return expected.some((artist) => {
    const needle = normalize(artist);
    return needle === haystack || haystack.includes(needle) || needle.includes(haystack);
  });
}

function durationClose(expected: number | undefined, actual: number | undefined): boolean {
  if (!expected || !actual) return true;
  return Math.abs(expected - actual) <= 12_000;
}

async function safeFetch(url: string): Promise<Response | null> {
  try {
    return await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  } catch {
    return null;
  }
}

async function fromItunes(card: SongCard): Promise<PreviewResult> {
  const urls = card.preview.itunesTrackId
    ? [`https://itunes.apple.com/lookup?id=${card.preview.itunesTrackId}&entity=song&country=BR`]
    : [
        `https://itunes.apple.com/search?term=${encodeURIComponent(`${card.artists[0]} ${card.title}`)}&entity=musicTrack&country=BR&limit=10`,
        `https://itunes.apple.com/search?term=${encodeURIComponent(card.title)}&entity=musicTrack&country=BR&limit=10`,
      ];

  for (const url of urls) {
    const response = await safeFetch(url);
    if (!response?.ok) return { previewUrl: null, status: "unavailable" };
    const body = (await response.json()) as {
      results?: Array<{ trackName?: string; artistName?: string; previewUrl?: string; trackTimeMillis?: number }>;
    };
    const match = (body.results ?? []).find((candidate) =>
      Boolean(
        candidate.previewUrl &&
          titleMatches(card.title, candidate.trackName ?? "") &&
          artistMatches(card.artists, candidate.artistName ?? "") &&
          durationClose(card.durationMs, candidate.trackTimeMillis)
      )
    );
    if (match?.previewUrl) return { previewUrl: match.previewUrl, status: "found", source: "itunes" };
  }
  return { previewUrl: null, status: "absent" };
}

async function fromDeezer(card: SongCard): Promise<PreviewResult> {
  const url = card.preview.deezerTrackId
    ? `https://api.deezer.com/track/${card.preview.deezerTrackId}`
    : `https://api.deezer.com/search?q=${encodeURIComponent(`artist:\"${card.artists[0]}\" track:\"${card.title}\"`)}&limit=10`;
  const response = await safeFetch(url);
  if (!response?.ok) return { previewUrl: null, status: "unavailable" };
  const body = (await response.json()) as {
    title?: string;
    preview?: string;
    duration?: number;
    artist?: { name?: string };
    data?: Array<{ title?: string; preview?: string; duration?: number; artist?: { name?: string } }>;
  };
  const candidates = body.data ?? [body];
  const match = candidates.find((candidate) =>
    Boolean(
      candidate.preview &&
        titleMatches(card.title, candidate.title ?? "") &&
        artistMatches(card.artists, candidate.artist?.name ?? "") &&
        durationClose(card.durationMs, candidate.duration ? candidate.duration * 1000 : undefined)
    )
  );
  return match?.preview
    ? { previewUrl: match.preview, status: "found", source: "deezer" }
    : { previewUrl: null, status: "absent" };
}

export async function resolvePreview(card: SongCard, refresh = false): Promise<PreviewResult> {
  const key = `songyear:preview:${card.id}`;
  const cache = getCacheStore();
  if (!refresh) {
    try {
      const cached = await cache.get<CachedPreview>(key);
      if (cached) return cached;
    } catch {
      // Cache fail-open.
    }
  }

  const itunes = await fromItunes(card);
  let result = itunes;
  if (itunes.status !== "found") {
    const deezer = await fromDeezer(card);
    if (deezer.status === "found") result = deezer;
    else if (itunes.status === "unavailable" || deezer.status === "unavailable") {
      result = { previewUrl: null, status: "unavailable" };
    } else result = { previewUrl: null, status: "absent" };
  }

  const record: CachedPreview = { ...result, resolvedAt: Date.now() };
  const ttl = result.status === "found" ? FOUND_TTL : result.status === "absent" ? ABSENT_TTL : UNAVAILABLE_TTL;
  try {
    await cache.set(key, record, ttl);
  } catch {
    // A resposta continua útil mesmo quando o cache falha.
  }
  return result;
}
