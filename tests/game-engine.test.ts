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
import { validCustomDeck } from "@/shared/deck";
import { selectWithinArtistLimit, shuffledCopy } from "@/shared/deck-rules";

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

describe("baralho do host", () => {
  it("valida quantidade, IDs únicos e links HTTPS", () => {
    const custom = [...cards.values()].slice(0, 3).map((card) => ({ ...card, links: { spotify: "https://open.spotify.com/track/test" } }));
    expect(validCustomDeck(custom, 3, 10)).toBe(true);
    expect(validCustomDeck([...custom, { ...custom[0] }], 3, 10)).toBe(false);
    expect(validCustomDeck(custom.map((card, index) => index ? card : { ...card, links: { spotify: "javascript:alert(1)" } }), 3, 10)).toBe(false);
    expect(validCustomDeck(custom.map((card, index) => index ? card : { ...card, id: "" }), 3, 10)).toBe(false);
  });

  it("embaralha a seleção e limita cada artista a três músicas", () => {
    expect(shuffledCopy([1, 2, 3], () => 0)).toEqual([2, 3, 1]);
    const sameArtist = [...cards.values()].slice(0, 5).map((card, index) => ({
      ...card,
      artists: [index % 2 ? "Ártista " : "artista"],
    }));
    const selection = selectWithinArtistLimit(sameArtist);
    expect(selection.accepted).toHaveLength(3);
    expect(selection.rejected).toBe(2);
    expect(selectWithinArtistLimit(sameArtist.slice(2), sameArtist.slice(0, 2))).toMatchObject({
      accepted: [sameArtist[2]],
      rejected: 2,
    });
    expect(validCustomDeck(sameArtist.slice(0, 4), 4, 10)).toBe(true);
    expect(validCustomDeck(sameArtist.slice(0, 4), 4, 10, 3)).toBe(false);
  });

  it("inicia a partida usando somente as cartas escolhidas pelo host", () => {
    const custom = [...cards.values()].slice(0, 5);
    const room = createRoomState("HOST", "Host", "host-secret", "p1", "p1-secret", "original", 1_000, custom);
    addParticipant(room, "Convidado", "p2", "p2-secret");
    const customMap = new Map(custom.map((card) => [card.id, card]));
    applyGameAction(room, { playerId: "p1", isHost: true }, { type: "host:start", actionId: "custom-start", firstPlayerId: "p1" }, customMap, 2_000, () => 0.999);
    expect([...room.drawPile, ...room.participants.flatMap((player) => player.timeline), room.currentCardId]).toSatisfy(
      (ids: Array<string | null>) => ids.every((id) => id === null || customMap.has(id))
    );
  });
});

describe("rodada competitiva", () => {
  it("mantém o host como DJ quando a vez é de um convidado", () => {
    const room = createRoomState("DJAY", "Host", "host-secret", "p1", "p1-secret", "original", 1_000);
    addParticipant(room, "Convidado", "p2", "p2-secret");
    applyGameAction(room, { playerId: "p1", isHost: true }, { type: "host:start", actionId: "start-guest", firstPlayerId: "p2" }, cards, 2_000, () => 0.999);

    const guestPlay = applyGameAction(room, { playerId: "p2", isHost: false }, { type: "round:play", actionId: "guest-play" }, cards, 3_000);
    const hostPlay = applyGameAction(room, { playerId: "p1", isHost: true }, { type: "round:play", actionId: "host-play" }, cards, 3_100);

    expect(room.participants[room.turnIndex].id).toBe("p2");
    expect(guestPlay).toMatchObject({ ok: false, effects: [] });
    expect(hostPlay).toMatchObject({ ok: true, effects: [{ type: "audio:play" }] });
  });

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
