import { describe, expect, it } from "vitest";
import { parseClientMessage, ROOM_CODE_ALPHABET } from "../../shared/protocol";

describe("protocolo do Worker", () => {
  it("aceita mensagens JSON conhecidas e rejeita payload inválido", () => {
    expect(parseClientMessage('{"type":"ping"}')).toEqual({ type: "ping" });
    expect(parseClientMessage("não é JSON")).toBeNull();
    expect(parseClientMessage('{"value":1}')).toBeNull();
  });

  it("não usa caracteres ambíguos nos códigos de sala", () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01ILO]/);
  });
});
