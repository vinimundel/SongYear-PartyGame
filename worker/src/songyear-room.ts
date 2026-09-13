import { DurableObject } from "cloudflare:workers";
import { SONGS_BY_ID } from "../../shared/deck";
import {
  addParticipant,
  applyGameAction,
  createRoomState,
  makeSnapshot,
  resolveExpiredDeadline,
  type GameEffect,
  type StoredRoom,
} from "../../shared/game-engine";
import {
  ROOM_IDLE_TIMEOUT_MS,
  parseClientMessage,
  type ClientIdentity,
  type GameMode,
  type ServerMessage,
  type SongCard,
} from "../../shared/protocol";

export interface Env {
  SONGYEAR_ROOM: DurableObjectNamespace<SongYearRoom>;
  ALLOWED_ORIGINS: string;
}

interface SocketAttachment {
  role: "display" | "player";
  playerId?: string;
  isHost: boolean;
}

const STORAGE_KEY = "room";

export class SongYearRoom extends DurableObject<Env> {
  private room: StoredRoom | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get<StoredRoom>(STORAGE_KEY)) ?? null;
    });
  }

  async claim(code: string, hostName: string, mode: GameMode, deck: SongCard[] = []): Promise<{
    hostToken: string;
    identity: ClientIdentity;
    expiresAt: number;
  } | null> {
    if (this.room && Date.now() < this.room.expiresAt) return null;
    const hostToken = crypto.randomUUID();
    const playerId = crypto.randomUUID();
    const playerToken = crypto.randomUUID();
    this.room = createRoomState(code, hostName, hostToken, playerId, playerToken, mode, Date.now(), deck);
    await this.persistAndSchedule();
    return {
      hostToken,
      identity: { playerId, playerToken, hostToken },
      expiresAt: this.room.expiresAt,
    };
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected websocket", { status: 426 });
    }
    if (!this.room || Date.now() >= this.room.expiresAt) {
      return new Response("Room not found", { status: 404 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (!this.room) return this.fail(ws, "room_expired", "A sala expirou.");
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const message = parseClientMessage(text);
    if (!message) return this.fail(ws, "bad_message", "Mensagem inválida.");
    if (message.type === "ping") return this.send(ws, { type: "pong" });
    if (message.type === "join:display") return this.joinDisplay(ws);
    if (message.type === "join:player") return this.joinPlayer(ws, message.name, message.identity);

    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    if (!attachment || attachment.role !== "player") {
      return this.fail(ws, "not_joined", "Entre como jogador primeiro.");
    }

    const result = applyGameAction(
      this.room,
      { playerId: attachment.playerId, isHost: attachment.isHost },
      message,
      this.cards(),
      Date.now()
    );
    if (!result.ok) return this.fail(ws, "invalid_action", result.error ?? "Ação inválida.");
    if (!result.changed) return;

    this.touch();
    await this.persistAndSchedule();
    this.deliverEffects(result.effects);
    this.broadcastState();
  }

  override async webSocketClose(): Promise<void> {
    this.broadcastState();
  }

  override async webSocketError(): Promise<void> {
    this.broadcastState();
  }

  override async alarm(): Promise<void> {
    if (!this.room) return;
    const now = Date.now();
    if (now >= this.room.expiresAt) {
      for (const ws of this.ctx.getWebSockets()) ws.close(1000, "expired");
      await this.ctx.storage.deleteAll();
      this.room = null;
      return;
    }
    const effects = resolveExpiredDeadline(this.room, this.cards(), now);
    if (effects.length) {
      await this.persistAndSchedule();
      this.deliverEffects(effects);
      this.broadcastState();
    } else {
      await this.schedule();
    }
  }

  private async joinDisplay(ws: WebSocket) {
    ws.serializeAttachment({ role: "display", isHost: false } satisfies SocketAttachment);
    this.sendState(ws);
  }

  private async joinPlayer(ws: WebSocket, rawName?: string, identity?: ClientIdentity) {
    if (!this.room) return;
    let playerId: string;
    let isHost = false;

    if (identity) {
      const participant = this.room.participants.find(
        (player) => player.id === identity.playerId && player.token === identity.playerToken
      );
      if (!participant) return this.fail(ws, "invalid_identity", "Não foi possível recuperar este jogador.");
      playerId = participant.id;
      isHost = participant.isHost && identity.hostToken === this.room.hostToken;
    } else {
      const id = crypto.randomUUID();
      const token = crypto.randomUUID();
      const problem = addParticipant(this.room, rawName ?? "", id, token);
      if (problem) return this.fail(ws, "join_failed", problem);
      playerId = id;
      const newIdentity = { playerId: id, playerToken: token } satisfies ClientIdentity;
      this.send(ws, { type: "identity", identity: newIdentity });
      await this.persistAndSchedule();
    }

    ws.serializeAttachment({ role: "player", playerId, isHost } satisfies SocketAttachment);
    this.broadcastState();
  }

  private connectedPlayerIds(): Set<string> {
    const ids = new Set<string>();
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment?.role === "player" && attachment.playerId) ids.add(attachment.playerId);
    }
    return ids;
  }

  private sendState(ws: WebSocket) {
    if (!this.room) return;
    const attachment = ws.deserializeAttachment() as SocketAttachment | null;
    this.send(ws, {
      type: "state",
      snapshot: makeSnapshot(this.room, this.cards(), this.connectedPlayerIds()),
      you: {
        role: attachment?.role ?? "display",
        ...(attachment?.playerId ? { playerId: attachment.playerId } : {}),
        isHost: Boolean(attachment?.isHost),
      },
    });
  }

  private broadcastState() {
    for (const socket of this.ctx.getWebSockets()) {
      const attachment = socket.deserializeAttachment() as SocketAttachment | null;
      if (attachment) this.sendState(socket);
    }
  }

  private deliverEffects(effects: GameEffect[]) {
    for (const effect of effects) {
      for (const socket of this.ctx.getWebSockets()) {
        const attachment = socket.deserializeAttachment() as SocketAttachment | null;
        if (attachment?.role !== "player" || !attachment.isHost) continue;
        if (effect.type === "audio:play") {
          const card = this.cards().get(effect.cardId);
          this.send(socket, { ...effect, ...(card ? { card } : {}) });
        }
        else this.send(socket, { type: "audio:stop" });
      }
    }
  }

  private touch() {
    if (this.room) this.room.expiresAt = Date.now() + ROOM_IDLE_TIMEOUT_MS;
  }

  private cards(): ReadonlyMap<string, SongCard> {
    if (!this.room?.deck?.length) return SONGS_BY_ID;
    return new Map(this.room.deck.map((card) => [card.id, card]));
  }

  private async persistAndSchedule() {
    if (!this.room) return;
    await this.ctx.storage.put(STORAGE_KEY, this.room);
    await this.schedule();
  }

  private async schedule() {
    if (!this.room) return;
    const next = Math.min(this.room.expiresAt, this.room.deadline ?? Infinity);
    if (Number.isFinite(next)) await this.ctx.storage.setAlarm(next);
  }

  private send(ws: WebSocket, message: ServerMessage) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // A próxima snapshot/reconexão recompõe todo o estado.
    }
  }

  private fail(ws: WebSocket, code: string, message: string) {
    this.send(ws, { type: "error", code, message });
  }
}
