import {
  CHALLENGE_WINDOW_MS,
  MAX_PLAYERS,
  MIN_PLAYERS,
  ROOM_IDLE_TIMEOUT_MS,
  STARTING_TOKENS,
  WINNING_CARD_COUNT,
  type ClientMessage,
  type GameMode,
  type RoomSnapshot,
  type SongCard,
} from "./protocol";

export interface StoredParticipant {
  id: string;
  token: string;
  name: string;
  tokens: number;
  timeline: string[];
  isHost: boolean;
}

export interface StoredPlacement {
  playerId: string;
  gapIndex: number;
  exactYear?: number;
  bonusAttempted: boolean;
}

export interface StoredChallenge {
  playerId: string;
  gapIndex?: number;
  exactYear?: number;
}

export interface StoredRoom {
  code: string;
  hostToken: string;
  mode: GameMode;
  phase: RoomSnapshot["phase"];
  participants: StoredParticipant[];
  turnIndex: number;
  drawPile: string[];
  discardPile: string[];
  blockedCards: string[];
  currentCardId: string | null;
  placement: StoredPlacement | null;
  challenge: StoredChallenge | null;
  deadline: number | null;
  isBonusRound: boolean;
  bonusUsedThisTurn: boolean;
  pendingBonusJudge: boolean;
  audioIssue: "unavailable" | null;
  audioRun: number;
  result: RoomSnapshot["result"];
  winnerId: string | null;
  version: number;
  recentActionIds: string[];
  createdAt: number;
  expiresAt: number;
}

export interface GameActor {
  playerId?: string;
  isHost: boolean;
}

export type GameEffect =
  | { type: "audio:play"; cardId: string; audioRun: number }
  | { type: "audio:stop" };

export type GameAction = Exclude<ClientMessage, { type: "join:display" | "join:player" | "ping" }>;

export interface ApplyResult {
  ok: boolean;
  error?: string;
  effects: GameEffect[];
  changed: boolean;
}

type RandomFn = () => number;

export function shuffled<T>(items: T[], random: RandomFn = Math.random): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapWith = Math.floor(random() * (index + 1));
    [result[index], result[swapWith]] = [result[swapWith], result[index]];
  }
  return result;
}

export function createRoomState(
  code: string,
  hostName: string,
  hostToken: string,
  hostPlayerId: string,
  hostPlayerToken: string,
  mode: GameMode,
  now: number
): StoredRoom {
  return {
    code,
    hostToken,
    mode,
    phase: "lobby",
    participants: [{
      id: hostPlayerId,
      token: hostPlayerToken,
      name: hostName.trim().slice(0, 24),
      tokens: STARTING_TOKENS,
      timeline: [],
      isHost: true,
    }],
    turnIndex: 0,
    drawPile: [],
    discardPile: [],
    blockedCards: [],
    currentCardId: null,
    placement: null,
    challenge: null,
    deadline: null,
    isBonusRound: false,
    bonusUsedThisTurn: false,
    pendingBonusJudge: false,
    audioIssue: null,
    audioRun: 0,
    result: null,
    winnerId: null,
    version: 1,
    recentActionIds: [],
    createdAt: now,
    expiresAt: now + ROOM_IDLE_TIMEOUT_MS,
  };
}

export function addParticipant(
  room: StoredRoom,
  name: string,
  id: string,
  token: string
): string | null {
  const cleanName = name.trim().slice(0, 24);
  if (room.phase !== "lobby") return "A partida já começou.";
  if (!cleanName) return "Digite um nome.";
  if (room.participants.length >= MAX_PLAYERS) return "A sala já tem quatro participantes.";
  if (room.participants.some((player) => player.name.toLocaleLowerCase("pt-BR") === cleanName.toLocaleLowerCase("pt-BR"))) {
    return "Esse nome já está em uso.";
  }
  room.participants.push({ id, token, name: cleanName, tokens: STARTING_TOKENS, timeline: [], isHost: false });
  bump(room);
  return null;
}

function bump(room: StoredRoom) {
  room.version += 1;
}

function rememberAction(room: StoredRoom, actionId: string): boolean {
  if (room.recentActionIds.includes(actionId)) return false;
  room.recentActionIds.push(actionId);
  if (room.recentActionIds.length > 80) room.recentActionIds.shift();
  return true;
}

function activePlayer(room: StoredRoom): StoredParticipant | null {
  return room.participants[room.turnIndex] ?? null;
}

function requireActive(room: StoredRoom, actor: GameActor): StoredParticipant | null {
  const active = activePlayer(room);
  return active && active.id === actor.playerId ? active : null;
}

function cardYear(cardId: string, cards: ReadonlyMap<string, SongCard>): number {
  const card = cards.get(cardId);
  if (!card) throw new Error(`Carta desconhecida: ${cardId}`);
  return card.year;
}

export function isGapCorrect(years: number[], gapIndex: number, year: number): boolean {
  if (!Number.isInteger(gapIndex) || gapIndex < 0 || gapIndex > years.length) return false;
  const left = gapIndex === 0 ? -Infinity : years[gapIndex - 1];
  const right = gapIndex === years.length ? Infinity : years[gapIndex];
  return left <= year && year <= right;
}

function refillDrawPile(room: StoredRoom, random: RandomFn): boolean {
  if (room.drawPile.length > 0) return true;
  if (room.discardPile.length === 0) return false;
  room.drawPile = shuffled(room.discardPile, random);
  room.discardPile = [];
  return room.drawPile.length > 0;
}

function draw(room: StoredRoom, random: RandomFn): boolean {
  if (!refillDrawPile(room, random)) return false;
  room.currentCardId = room.drawPile.pop() ?? null;
  room.phase = room.currentCardId ? "listening" : "finished";
  room.placement = null;
  room.challenge = null;
  room.deadline = null;
  room.pendingBonusJudge = false;
  room.audioIssue = null;
  room.result = null;
  return Boolean(room.currentCardId);
}

function sortedInsert(timeline: string[], cardId: string, cards: ReadonlyMap<string, SongCard>): string[] {
  const year = cardYear(cardId, cards);
  const index = timeline.findIndex((existing) => cardYear(existing, cards) > year);
  const target = index === -1 ? timeline.length : index;
  return [...timeline.slice(0, target), cardId, ...timeline.slice(target)];
}

function reveal(room: StoredRoom, cards: ReadonlyMap<string, SongCard>): GameEffect[] {
  const cardId = room.currentCardId;
  const placement = room.placement;
  if (!cardId || !placement) return [];

  const active = room.participants.find((player) => player.id === placement.playerId);
  if (!active) return [];
  const year = cardYear(cardId, cards);
  const activePositionCorrect = isGapCorrect(
    active.timeline.map((id) => cardYear(id, cards)),
    placement.gapIndex,
    year
  );
  const activeYearCorrect = room.mode !== "expert" || placement.exactYear === year;
  const activeCorrect = activePositionCorrect && activeYearCorrect;

  let challengeCorrect = false;
  let recipientId: string | undefined;
  if (room.challenge?.gapIndex !== undefined) {
    const positionCorrect = isGapCorrect(
      active.timeline.map((id) => cardYear(id, cards)),
      room.challenge.gapIndex,
      year
    );
    const yearCorrect = room.mode !== "expert" || room.challenge.exactYear === year;
    challengeCorrect = positionCorrect && yearCorrect;
  }

  if (activeCorrect) {
    active.timeline.splice(placement.gapIndex, 0, cardId);
    recipientId = active.id;
    room.result = { kind: "active", recipientId, activeCorrect: true, challengeCorrect };
  } else if (challengeCorrect && room.challenge) {
    const challenger = room.participants.find((player) => player.id === room.challenge!.playerId);
    if (challenger) {
      challenger.timeline = sortedInsert(challenger.timeline, cardId, cards);
      challenger.tokens += 2;
      recipientId = challenger.id;
    }
    room.result = { kind: "challenger", recipientId, activeCorrect: false, challengeCorrect: true };
  } else {
    room.discardPile.push(cardId);
    room.result = { kind: "discarded", activeCorrect: false, challengeCorrect };
  }

  const winner = room.participants.find((player) => player.timeline.length >= WINNING_CARD_COUNT);
  room.winnerId = winner?.id ?? null;
  room.pendingBonusJudge = Boolean(
    !winner && activeCorrect && room.mode !== "original" && placement.bonusAttempted
  );
  room.phase = winner ? "finished" : "revealed";
  room.deadline = null;
  room.audioIssue = null;
  bump(room);
  return [{ type: "audio:stop" }];
}

function newRound(room: StoredRoom, random: RandomFn, bonus: boolean): GameEffect[] {
  room.isBonusRound = bonus;
  if (!draw(room, random)) {
    room.phase = "finished";
  }
  bump(room);
  return [{ type: "audio:stop" }];
}

function error(message: string): ApplyResult {
  return { ok: false, error: message, effects: [], changed: false };
}

export function applyGameAction(
  room: StoredRoom,
  actor: GameActor,
  action: GameAction,
  cards: ReadonlyMap<string, SongCard>,
  now: number,
  random: RandomFn = Math.random
): ApplyResult {
  if (!rememberAction(room, action.actionId)) {
    return { ok: true, effects: [], changed: false };
  }

  const active = activePlayer(room);
  const effects: GameEffect[] = [];

  switch (action.type) {
    case "host:start": {
      if (!actor.isHost) return error("Somente o host pode iniciar.");
      if (room.phase !== "lobby") return error("A partida já começou.");
      if (room.participants.length < MIN_PLAYERS) return error("São necessários ao menos dois participantes.");
      const firstIndex = action.firstPlayerId
        ? room.participants.findIndex((player) => player.id === action.firstPlayerId)
        : Math.floor(random() * room.participants.length);
      room.turnIndex = firstIndex >= 0 ? firstIndex : 0;
      room.drawPile = shuffled([...cards.keys()], random);
      for (const participant of room.participants) {
        const firstCard = room.drawPile.pop();
        if (!firstCard) return error("O baralho não tem cartas suficientes.");
        participant.timeline = [firstCard];
      }
      draw(room, random);
      bump(room);
      return { ok: true, effects, changed: true };
    }

    case "round:play": {
      if (!requireActive(room, actor)) return error("Apenas o jogador da vez pode tocar a música.");
      if ((room.phase !== "listening" && room.phase !== "placing") || !room.currentCardId) {
        return error("A música não pode ser tocada agora.");
      }
      room.audioRun += 1;
      room.audioIssue = null;
      bump(room);
      effects.push({ type: "audio:play", cardId: room.currentCardId, audioRun: room.audioRun });
      return { ok: true, effects, changed: true };
    }

    case "host:audio-started": {
      if (!actor.isHost || action.audioRun !== room.audioRun) return error("Confirmação de áudio inválida.");
      if (room.phase === "listening") room.phase = "placing";
      room.audioIssue = null;
      bump(room);
      return { ok: true, effects, changed: true };
    }

    case "host:audio-failed": {
      if (!actor.isHost || action.audioRun !== room.audioRun) return error("Falha de áudio inválida.");
      if (action.status === "unavailable") {
        room.audioIssue = "unavailable";
        bump(room);
        return { ok: true, effects, changed: true };
      }
      if (room.currentCardId) room.blockedCards.push(room.currentCardId);
      return { ok: true, effects: newRound(room, random, room.isBonusRound), changed: true };
    }

    case "host:skip-audio": {
      if (!actor.isHost || room.audioIssue !== "unavailable") return error("Não há áudio pendente para pular.");
      if (room.currentCardId) room.blockedCards.push(room.currentCardId);
      return { ok: true, effects: newRound(room, random, room.isBonusRound), changed: true };
    }

    case "round:swap": {
      const player = requireActive(room, actor);
      if (!player || room.phase !== "placing" || !room.currentCardId) return error("A troca não está disponível.");
      if (player.tokens < 1) return error("Você não tem fichas para trocar.");
      player.tokens -= 1;
      room.discardPile.push(room.currentCardId);
      return { ok: true, effects: newRound(room, random, room.isBonusRound), changed: true };
    }

    case "round:place": {
      const player = requireActive(room, actor);
      if (!player || room.phase !== "placing" || !room.currentCardId) return error("Não é possível posicionar agora.");
      if (action.gapIndex < 0 || action.gapIndex > player.timeline.length) return error("Posição inválida.");
      if (room.mode === "expert" && !Number.isInteger(action.exactYear)) return error("Informe o ano exato.");
      room.placement = {
        playerId: player.id,
        gapIndex: action.gapIndex,
        ...(room.mode === "expert" ? { exactYear: action.exactYear } : {}),
        bonusAttempted: room.mode !== "original" && Boolean(action.bonusAttempted),
      };
      room.phase = "challenge_open";
      room.deadline = now + CHALLENGE_WINDOW_MS;
      bump(room);
      return { ok: true, effects, changed: true };
    }

    case "round:challenge": {
      if (room.phase !== "challenge_open" || !room.placement || !actor.playerId) return error("A contestação está fechada.");
      if (actor.playerId === room.placement.playerId) return error("Você não pode contestar a própria jogada.");
      const challenger = room.participants.find((player) => player.id === actor.playerId);
      if (!challenger || challenger.tokens < 1) return error("Você não tem fichas para contestar.");
      challenger.tokens -= 1;
      room.challenge = { playerId: challenger.id };
      room.phase = "challenge_placing";
      room.deadline = now + CHALLENGE_WINDOW_MS;
      bump(room);
      return { ok: true, effects, changed: true };
    }

    case "round:challenge-place": {
      if (
        room.phase !== "challenge_placing" ||
        !room.challenge ||
        room.challenge.playerId !== actor.playerId ||
        !room.placement ||
        !active
      ) return error("Você não é o desafiante desta rodada.");
      if (action.gapIndex < 0 || action.gapIndex > active.timeline.length) return error("Posição inválida.");
      if (room.mode !== "expert" && action.gapIndex === room.placement.gapIndex) {
        return error("Escolha uma posição diferente da jogada original.");
      }
      if (room.mode === "expert" && !Number.isInteger(action.exactYear)) return error("Informe o ano exato.");
      room.challenge.gapIndex = action.gapIndex;
      if (room.mode === "expert") room.challenge.exactYear = action.exactYear;
      return { ok: true, effects: reveal(room, cards), changed: true };
    }

    case "host:bonus-verdict": {
      if (!actor.isHost || room.phase !== "revealed" || !room.pendingBonusJudge || !active) {
        return error("Não há palpite para validar.");
      }
      if (action.correct) active.tokens += 1;
      room.pendingBonusJudge = false;
      bump(room);
      return { ok: true, effects, changed: true };
    }

    case "round:buy-extra": {
      const player = requireActive(room, actor);
      if (!player || room.phase !== "revealed" || room.pendingBonusJudge) return error("A compra não está disponível.");
      if (room.mode === "original") return error("Cartas extras ficam disponíveis no Pro e Expert.");
      if (room.isBonusRound || room.bonusUsedThisTurn) return error("Só é permitida uma carta extra por turno.");
      if (player.tokens < 3) return error("São necessárias 3 fichas.");
      player.tokens -= 3;
      room.bonusUsedThisTurn = true;
      return { ok: true, effects: newRound(room, random, true), changed: true };
    }

    case "round:next": {
      if (room.phase !== "revealed" || room.pendingBonusJudge) return error("A rodada ainda não terminou.");
      if (!actor.isHost && actor.playerId !== active?.id) return error("Apenas o jogador da vez ou o host pode avançar.");
      room.turnIndex = (room.turnIndex + 1) % room.participants.length;
      room.bonusUsedThisTurn = false;
      return { ok: true, effects: newRound(room, random, false), changed: true };
    }
  }
}

export function resolveExpiredDeadline(
  room: StoredRoom,
  cards: ReadonlyMap<string, SongCard>,
  now: number
): GameEffect[] {
  if (!room.deadline || now < room.deadline) return [];
  if (room.phase === "challenge_open" || room.phase === "challenge_placing") {
    return reveal(room, cards);
  }
  return [];
}

export function makeSnapshot(
  room: StoredRoom,
  cards: ReadonlyMap<string, SongCard>,
  connectedPlayerIds: ReadonlySet<string>
): RoomSnapshot {
  const revealed = room.phase === "revealed" || room.phase === "finished";
  return {
    version: room.version,
    code: room.code,
    mode: room.mode,
    phase: room.phase,
    participants: room.participants.map((player) => ({
      id: player.id,
      name: player.name,
      tokens: player.tokens,
      connected: connectedPlayerIds.has(player.id),
      timeline: player.timeline.map((id) => cards.get(id)).filter((card): card is SongCard => Boolean(card)).map((card) => ({
        id: card.id,
        title: card.title,
        artists: card.artists,
        year: card.year,
        links: card.links,
      })),
      isHost: player.isHost,
    })),
    activePlayerId: activePlayer(room)?.id ?? null,
    hiddenCard: !revealed && room.currentCardId ? { id: room.currentCardId } : null,
    revealedCard: revealed && room.currentCardId
      ? (() => {
          const card = cards.get(room.currentCardId!);
          return card ? { id: card.id, title: card.title, artists: card.artists, year: card.year, links: card.links } : null;
        })()
      : null,
    placement: room.placement,
    challenge: room.challenge,
    deadline: room.deadline,
    isBonusRound: room.isBonusRound,
    bonusUsedThisTurn: room.bonusUsedThisTurn,
    pendingBonusJudge: room.pendingBonusJudge,
    audioIssue: room.audioIssue,
    result: room.result,
    winnerId: room.winnerId,
    discardCount: room.discardPile.length,
    drawCount: room.drawPile.length,
    expiresAt: room.expiresAt,
  };
}
