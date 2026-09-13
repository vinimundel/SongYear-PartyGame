import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const API_URL = "https://api.spotify.com/v1";
export const SPOTIFY_SESSION_COOKIE = "songyear_spotify_session";
export const SPOTIFY_STATE_COOKIE = "songyear_spotify_state";
export const SPOTIFY_RETURN_COOKIE = "songyear_spotify_return";
const COOKIE_AGE = 30 * 24 * 60 * 60;

interface Config { clientId: string; clientSecret: string; redirectUri: string }
export interface SpotifySession { accessToken: string; refreshToken: string; expiresAt: number; displayName?: string }
export interface ImportedSpotifyTrack {
  title: string;
  artists: string[];
  year: number | null;
  durationMs?: number;
  spotifyUrl?: string;
}

function config(): Config {
  const clientId = process.env.SPOTIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET?.trim();
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) throw new Error("Spotify não está configurado.");
  return { clientId, clientSecret, redirectUri };
}

export function deckStudioEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.ENABLE_DECK_STUDIO === "true";
}

function secureCookie(): boolean {
  try { return new URL(config().redirectUri).protocol === "https:"; } catch { return true; }
}

function key(): Buffer {
  const value = config();
  return createHash("sha256").update(`songyear:${value.clientId}:${value.clientSecret}`).digest();
}

function seal(session: SpotifySession): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((part) => part.toString("base64url")).join(".");
}

function unseal(value: string): SpotifySession | null {
  try {
    const [iv, tag, body, extra] = value.split(".");
    if (!iv || !tag || !body || extra) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    const json = Buffer.concat([decipher.update(Buffer.from(body, "base64url")), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(json) as Partial<SpotifySession>;
    return typeof parsed.accessToken === "string" && typeof parsed.refreshToken === "string" && typeof parsed.expiresAt === "number"
      ? parsed as SpotifySession : null;
  } catch { return null; }
}

function basic(value: Config): string {
  return `Basic ${Buffer.from(`${value.clientId}:${value.clientSecret}`).toString("base64")}`;
}

async function token(body: URLSearchParams): Promise<{ access_token?: string; refresh_token?: string; expires_in?: number }> {
  const value = config();
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { Authorization: basic(value), "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Spotify OAuth falhou (${response.status}).`);
  return response.json();
}

export function spotifyAuthorizeUrl(state: string): URL {
  const value = config();
  const url = new URL("https://accounts.spotify.com/authorize");
  url.searchParams.set("client_id", value.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", value.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "playlist-read-private playlist-read-collaborative user-read-private");
  return url;
}

export function beginSpotifyAuth(response: NextResponse): void {
  response.cookies.set(SPOTIFY_STATE_COOKIE, randomBytes(24).toString("base64url"), {
    httpOnly: true, sameSite: "lax", secure: secureCookie(), path: "/", maxAge: 600,
  });
}

export function newSpotifyState(): string { return randomBytes(24).toString("base64url"); }

export function safeReturnTo(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && value.length <= 500 ? value : "/";
}

export async function exchangeCode(code: string): Promise<SpotifySession> {
  const value = config();
  const result = await token(new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: value.redirectUri }));
  if (!result.access_token || !result.refresh_token) throw new Error("Resposta OAuth incompleta.");
  let displayName: string | undefined;
  const profile = await fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${result.access_token}` }, cache: "no-store" });
  if (profile.ok) displayName = ((await profile.json()) as { display_name?: string }).display_name;
  return { accessToken: result.access_token, refreshToken: result.refresh_token, expiresAt: Date.now() + (result.expires_in ?? 3600) * 1000, displayName };
}

export function setSession(response: NextResponse, session: SpotifySession): void {
  response.cookies.set(SPOTIFY_SESSION_COOKIE, seal(session), {
    httpOnly: true, sameSite: "lax", secure: secureCookie(), path: "/", maxAge: COOKIE_AGE,
  });
  response.cookies.delete(SPOTIFY_STATE_COOKIE);
  response.cookies.delete(SPOTIFY_RETURN_COOKIE);
}

export function clearSession(response: NextResponse): void {
  response.cookies.delete(SPOTIFY_SESSION_COOKIE);
  response.cookies.delete(SPOTIFY_STATE_COOKIE);
  response.cookies.delete(SPOTIFY_RETURN_COOKIE);
}

export async function getSession(request: NextRequest, response?: NextResponse): Promise<SpotifySession | null> {
  const raw = request.cookies.get(SPOTIFY_SESSION_COOKIE)?.value;
  const session = raw ? unseal(raw) : null;
  if (!session) return null;
  if (session.expiresAt > Date.now() + 60_000) return session;
  try {
    const refreshed = await token(new URLSearchParams({ grant_type: "refresh_token", refresh_token: session.refreshToken }));
    if (!refreshed.access_token) return null;
    const next = { ...session, accessToken: refreshed.access_token, refreshToken: refreshed.refresh_token ?? session.refreshToken, expiresAt: Date.now() + (refreshed.expires_in ?? 3600) * 1000 };
    if (response) setSession(response, next);
    return next;
  } catch { return null; }
}

export function playlistId(value: string): string | null {
  return value.match(/playlist[/:]([A-Za-z0-9]+)/)?.[1] ?? (/^[A-Za-z0-9]{12,}$/.test(value) ? value : null);
}

interface SpotifyItem {
  item?: { type?: string; name?: string; duration_ms?: number; artists?: Array<{ name?: string }>; album?: { release_date?: string }; external_urls?: { spotify?: string } };
  track?: SpotifyItem["item"];
}

export async function importSpotifyPlaylist(id: string, accessToken: string): Promise<{ name: string; tracks: ImportedSpotifyTrack[] }> {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const metadata = await fetch(`${API_URL}/playlists/${id}?fields=id,name`, { headers, cache: "no-store" });
  if (!metadata.ok) throw new Error(`Não foi possível ler a playlist (${metadata.status}).`);
  const name = ((await metadata.json()) as { name?: string }).name ?? "Playlist";
  const tracks: ImportedSpotifyTrack[] = [];
  let offset = 0;
  while (tracks.length < 500) {
    const response = await fetch(`${API_URL}/playlists/${id}/items?limit=50&offset=${offset}`, { headers, cache: "no-store" });
    if (!response.ok) throw new Error(`Não foi possível ler as faixas (${response.status}).`);
    const page = (await response.json()) as { items?: SpotifyItem[]; next?: string | null };
    const items = page.items ?? [];
    for (const wrapper of items) {
      const item = wrapper.item ?? wrapper.track;
      if (!item || item.type && item.type !== "track" || !item.name) continue;
      const year = Number.parseInt(item.album?.release_date?.slice(0, 4) ?? "", 10);
      tracks.push({
        title: item.name,
        artists: (item.artists ?? []).flatMap((artist) => artist.name ? [artist.name] : []),
        year: Number.isFinite(year) ? year : null,
        ...(item.duration_ms ? { durationMs: item.duration_ms } : {}),
        ...(item.external_urls?.spotify ? { spotifyUrl: item.external_urls.spotify } : {}),
      });
    }
    if (!page.next || items.length === 0) break;
    offset += items.length;
  }
  return { name, tracks };
}
