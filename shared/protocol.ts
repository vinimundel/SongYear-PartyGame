export const ROOM_CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 4;
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;
export const STARTING_TOKENS = 2;
export const WINNING_CARD_COUNT = 10;
export const MIN_CUSTOM_DECK_SIZE = 20;
export const MAX_CUSTOM_DECK_SIZE = 500;
export const MAX_SONGS_PER_ARTIST = 3;
export const CHALLENGE_WINDOW_MS = 10_000;
export const ROOM_IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000;

export type GameMode = "original" | "pro" | "expert";
export type RoomPhase =
  | "lobby"
  | "listening"
  | "placing"
  | "challenge_open"
  | "challenge_placing"
  | "revealed"
  | "finished";

export interface PublicSongCard {
  id: string;
  title: string;
  artists: string[];
  year: number;
  links: {
    spotify?: string;
    youtube?: string;
    genius?: string;
    store?: string;
  };
}

export interface SongCard extends PublicSongCard {
  durationMs?: number;
  preview: {
    itunesTrackId?: number;
    deezerTrackId?: number;
  };
}

export interface ParticipantSnapshot {
  id: string;
  name: string;
  tokens: number;
  connected: boolean;
  timeline: PublicSongCard[];
  isHost: boolean;
}

export interface PlacementSnapshot {
  playerId: string;
  gapIndex: number;
  exactYear?: number;
  bonusAttempted: boolean;
}

export interface ChallengeSnapshot {
  playerId: string;
  gapIndex?: number;
  exactYear?: number;
}

export interface RoomSnapshot {
  version: number;
  code: string;
  mode: GameMode;
  phase: RoomPhase;
  participants: ParticipantSnapshot[];
  activePlayerId: string | null;
  hiddenCard: { id: string } | null;
  revealedCard: PublicSongCard | null;
  placement: PlacementSnapshot | null;
  challenge: ChallengeSnapshot | null;
  deadline: number | null;
  isBonusRound: boolean;
  bonusUsedThisTurn: boolean;
  pendingBonusJudge: boolean;
  audioIssue: "unavailable" | null;
  result: {
    kind: "active" | "challenger" | "discarded";
    recipientId?: string;
    activeCorrect: boolean;
    challengeCorrect: boolean;
  } | null;
  winnerId: string | null;
  discardCount: number;
  drawCount: number;
  expiresAt: number;
}

export interface ClientIdentity {
  playerId: string;
  playerToken: string;
  hostToken?: string;
}

type ActionBase = { actionId: string };

export type ClientMessage =
  | { type: "join:display" }
  | { type: "join:player"; name?: string; identity?: ClientIdentity }
  | ({ type: "host:start"; firstPlayerId?: string } & ActionBase)
  | ({ type: "round:play" } & ActionBase)
  | ({ type: "round:swap" } & ActionBase)
  | ({ type: "round:place"; gapIndex: number; exactYear?: number; bonusAttempted?: boolean } & ActionBase)
  | ({ type: "round:challenge" } & ActionBase)
  | ({ type: "round:challenge-place"; gapIndex: number; exactYear?: number } & ActionBase)
  | ({ type: "round:buy-extra" } & ActionBase)
  | ({ type: "round:next" } & ActionBase)
  | ({ type: "host:bonus-verdict"; correct: boolean } & ActionBase)
  | ({ type: "host:audio-started"; audioRun: number } & ActionBase)
  | ({ type: "host:audio-failed"; status: "absent" | "unavailable"; audioRun: number } & ActionBase)
  | ({ type: "host:skip-audio" } & ActionBase)
  | { type: "ping" };

export type ServerMessage =
  | { type: "state"; snapshot: RoomSnapshot; you: { role: "display" | "player"; playerId?: string; isHost: boolean } }
  | { type: "identity"; identity: ClientIdentity }
  | { type: "audio:play"; cardId: string; card?: SongCard; audioRun: number }
  | { type: "audio:stop" }
  | { type: "error"; code: string; message: string }
  | { type: "pong" };

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const value = JSON.parse(raw) as { type?: unknown };
    if (!value || typeof value !== "object" || typeof value.type !== "string") return null;
    return value as ClientMessage;
  } catch {
    return null;
  }
}
