import { SongYearRoom, type Env } from "./songyear-room";
import { originMatchesAllowed } from "./origins";
import { validCustomDeck } from "../../shared/deck";
import {
  MAX_CUSTOM_DECK_SIZE,
  MAX_SONGS_PER_ARTIST,
  MIN_CUSTOM_DECK_SIZE,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type GameMode,
  type SongCard,
} from "../../shared/protocol";

export { SongYearRoom };

function configuredOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);
}

function originAllowed(origin: string, env: Env): boolean {
  return originMatchesAllowed(origin, configuredOrigins(env));
}

function cors(origin: string | null, env: Env): HeadersInit {
  const allowed = origin && originAllowed(origin, env) ? origin : "";
  return {
    ...(allowed ? { "Access-Control-Allow-Origin": allowed } : {}),
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(value: unknown, status: number, origin: string | null, env: Env): Response {
  return Response.json(value, { status, headers: cors(origin, env) });
}

function randomCode(): string {
  const values = new Uint32Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(values);
  return Array.from(values, (value) => ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length]).join("");
}

function validMode(value: unknown): value is GameMode {
  return value === "original" || value === "pro" || value === "expert";
}

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin, env) });
    }

    if (origin && !originAllowed(origin, env)) {
      return json({ error: "origin_not_allowed" }, 403, origin, env);
    }

    if (request.method === "POST" && url.pathname === "/rooms") {
      let body: { hostName?: unknown; mode?: unknown; deck?: unknown; variedArtists?: unknown };
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid_json" }, 400, origin, env);
      }
      const hostName = typeof body.hostName === "string" ? body.hostName.trim().slice(0, 24) : "";
      if (!hostName || !validMode(body.mode)) {
        return json({ error: "hostName_and_mode_required" }, 400, origin, env);
      }
      if (body.variedArtists !== undefined && typeof body.variedArtists !== "boolean") {
        return json({ error: "variedArtists_must_be_boolean" }, 400, origin, env);
      }
      const variedArtists = body.variedArtists === true;
      let deck: SongCard[] = [];
      if (body.deck !== undefined) {
        if (!validCustomDeck(body.deck, MIN_CUSTOM_DECK_SIZE, MAX_CUSTOM_DECK_SIZE, variedArtists ? MAX_SONGS_PER_ARTIST : undefined)) {
          return json({
            error: "custom_deck_invalid",
            minimum: MIN_CUSTOM_DECK_SIZE,
            maximum: MAX_CUSTOM_DECK_SIZE,
            ...(variedArtists ? { maximumPerArtist: MAX_SONGS_PER_ARTIST } : {}),
          }, 400, origin, env);
        }
        deck = body.deck;
      }

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const code = randomCode();
        const stub = env.SONGYEAR_ROOM.getByName(code);
        const claimed = await stub.claim(code, hostName, body.mode, deck);
        if (claimed) return json({ code, ...claimed }, 201, origin, env);
      }
      return json({ error: "room_code_exhausted" }, 503, origin, env);
    }

    const match = url.pathname.match(/^\/rooms\/([A-Z0-9]{4})\/ws$/);
    if (request.method === "GET" && match) {
      return env.SONGYEAR_ROOM.getByName(match[1]).fetch(request);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true }, 200, origin, env);
    }

    return json({ error: "not_found" }, 404, origin, env);
  },
};

export default worker;
