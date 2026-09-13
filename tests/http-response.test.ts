import { describe, expect, it } from "vitest";
import { readJsonResponse } from "@/lib/http-response";

describe("respostas HTTP da interface", () => {
  it("lê JSON válido", async () => {
    const response = Response.json({ ok: true });
    await expect(readJsonResponse<{ ok: boolean }>(response, "Falha")).resolves.toEqual({ ok: true });
  });

  it("troca texto de erro do servidor por uma mensagem útil", async () => {
    const response = new Response("Internal Server Error", { status: 500 });
    await expect(readJsonResponse(response, "Servidor indisponível")).rejects.toThrow("Servidor indisponível (HTTP 500).");
  });
});
