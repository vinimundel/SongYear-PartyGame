import { describe, expect, it } from "vitest";
import { parseClientMessage, ROOM_CODE_ALPHABET } from "../../shared/protocol";
import { validCustomDeck } from "../../shared/deck";
import { originMatchesAllowed } from "../src/origins";

describe("protocolo do Worker", () => {
  it("aceita mensagens JSON conhecidas e rejeita payload inválido", () => {
    expect(parseClientMessage('{"type":"ping"}')).toEqual({ type: "ping" });
    expect(parseClientMessage("não é JSON")).toBeNull();
    expect(parseClientMessage('{"value":1}')).toBeNull();
  });

  it("não usa caracteres ambíguos nos códigos de sala", () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });

  it("rejeita baralhos pequenos enviados na criação da sala", () => {
    expect(validCustomDeck([], 20, 500)).toBe(false);
  });

  it("aceita subdomínios do Quick Tunnel somente quando o curinga está configurado", () => {
    const allowed = ["http://127.0.0.1:8000", "https://*.trycloudflare.com"];
    expect(originMatchesAllowed("https://songyear.trycloudflare.com", allowed)).toBe(true);
    expect(originMatchesAllowed("https://eviltrycloudflare.com", allowed)).toBe(false);
    expect(originMatchesAllowed("http://songyear.trycloudflare.com", allowed)).toBe(false);
  });
});
