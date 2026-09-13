import { describe, expect, it } from "vitest";
import {
  addParticipant,
  applyGameAction,
  createRoomState,
  isGapCorrect,
  resolveExpiredDeadline,
  type StoredRoom,
} from "@/shared/game-engine";
import type { GameMode, SongCard } from "@/shared/protocol";

const cards = new Map<string, SongCard>(
  Array.from({ length: 14 }, (_, index) => {
    const card: SongCard = {
      id: `c${index}`,
      title: `Faixa ${index}`,
      artists: ["Artista"],
      year: 2000 + index,
      durationMs: 180_000,
      preview: {},
      links: {},
    };
    return [card.id, card];
  })
);

function setup(mode: GameMode = "original"): StoredRoom {
  const room = createRoomState("TEST", "Host", "host-secret", "p1", "p1-secret", mode, 1_000);
  expect(addParticipant(room, "Convidado", "p2", "p2-secret")).toBeNull();
  const started = applyGameAction(room, { playerId: "p1", isHost: true }, { type: "host:start", actionId: "start", firstPlayerId: "p1" }, cards, 2_000, () => 0.999);
  expect(started.ok).toBe(true);
  return room;
}

function listen(room: StoredRoom, id = "play") {
  const result = applyGameAction(room, { playerId: "p1", isHost: true }, { type: "round:play", actionId: id }, cards, 3_000);
  expect(result.effects[0]?.type).toBe("audio:play");
  const audioRun = room.audioRun;
  applyGameAction(room, { playerId: "p1", isHost: true }, { type: "host:audio-started", actionId: `${id}-started`, audioRun }, cards, 3_100);
  expect(room.phase).toBe("placing");
}

describe("ordem cronológica", () => {
  it("aceita anos iguais em qualquer limite compatível", () => {
    expect(isGapCorrect([1980, 1990, 1990, 2000], 1, 1990)).toBe(true);
    expect(isGapCorrect([1980, 1990, 1990, 2000], 3, 1990)).toBe(true);
    expect(isGapCorrect([1980, 1990, 2000], 1, 2001)).toBe(false);
  });
});

describe("rodada competitiva", () => {
  it("dá prioridade ao acerto do jogador ativo mesmo com contestação", () => {
    const room = setup();
    listen(room);
    applyGameAction(room, { playerId: "p1", isHost: true }, { type: "round:place", actionId: "place", gapIndex: 0 }, cards, 4_000);
    applyGameAction(room, { playerId: "p2", isHost: false }, { type: "round:challenge", actionId: "challenge" }, cards, 4_100);
    applyGameAction(room, { playerId: "p2", isHost: false }, { type: "round:challenge-place", actionId: "challenge-place", gapIndex: 1 }, cards, 4_200);

    expect(room.result).toMatchObject({ kind: "active", recipientId: "p1", activeCorrect: true });
    expect(room.participants[0].timeline).toHaveLength(2);
    expect(room.participants[1].tokens).toBe(1);
  });

  it("faz o desafiante roubar a carta e receber de volta a aposta mais um bônus", () => {
    const room = setup();
    listen(room);
    applyGameAction(room, { playerId: "p1", isHost: true }, { type: "round:place", actionId: "place", gapIndex: 1 }, cards, 4_000);
    applyGameAction(room, { playerId: "p2", isHost: false }, { type: "round:challenge", actionId: "challenge" }, cards, 4_100);
    applyGameAction(room, { playerId: "p2", isHost: false }, { type: "round:challenge-place", actionId: "challenge-place", gapIndex: 0 }, cards, 4_200);

    expect(room.result).toMatchObject({ kind: "challenger", recipientId: "p2" });
    expect(room.participants[1].timeline).toHaveLength(2);
    expect(room.participants[1].tokens).toBe(3);
  });

  it("revela automaticamente quando a janela de contestação expira", () => {
    const room = setup();
    listen(room);
    applyGameAction(room, { playerId: "p1", isHost: true }, { type: "round:place", actionId: "place", gapIndex: 0 }, cards, 4_000);
    expect(resolveExpiredDeadline(room, cards, 13_999)).toEqual([]);
    expect(resolveExpiredDeadline(room, cards, 14_000)).toEqual([{ type: "audio:stop" }]);
    expect(room.phase).toBe("revealed");
  });

  it("exige posição e ano no modo Expert", () => {
    const room = setup("expert");
    listen(room);
    const missing = applyGameAction(room, { playerId: "p1", isHost: true }, { type: "round:place", actionId: "missing", gapIndex: 0 }, cards, 4_000);
    expect(missing.ok).toBe(false);
    const placed = applyGameAction(room, { playerId: "p1", isHost: true }, { type: "round:place", actionId: "placed", gapIndex: 0, exactYear: 1900 }, cards, 4_100);
    expect(placed.ok).toBe(true);
    resolveExpiredDeadline(room, cards, 14_100);
    expect(room.result?.kind).toBe("discarded");
  });

  it("limita a compra a uma carta extra Pro por turno", () => {
    const room = setup("pro");
    listen(room);
    room.participants[0].tokens = 4;
    applyGameAction(room, { playerId: "p1", isHost: true }, { type: "round:place", actionId: "place", gapIndex: 0 }, cards, 4_000);
    resolveExpiredDeadline(room, cards, 14_000);
    const bought = applyGameAction(room, { playerId: "p1", isHost: true }, { type: "round:buy-extra", actionId: "buy" }, cards, 14_100);

    expect(bought.ok).toBe(true);
    expect(room.isBonusRound).toBe(true);
    expect(room.bonusUsedThisTurn).toBe(true);
    expect(room.participants[0].tokens).toBe(1);
  });
});
