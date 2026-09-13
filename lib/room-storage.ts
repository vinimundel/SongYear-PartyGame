"use client";

import type { ClientIdentity } from "@/shared/protocol";

function key(code: string) {
  return `songyear:identity:${code.toUpperCase()}`;
}

export function loadIdentity(code: string): ClientIdentity | null {
  try {
    const raw = localStorage.getItem(key(code));
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ClientIdentity>;
    return typeof value.playerId === "string" && typeof value.playerToken === "string"
      ? (value as ClientIdentity)
      : null;
  } catch {
    return null;
  }
}

export function saveIdentity(code: string, identity: ClientIdentity) {
  try {
    localStorage.setItem(key(code), JSON.stringify(identity));
  } catch {
    // A sessão ainda funciona; só não sobreviverá ao refresh.
  }
}

export function savePendingName(code: string, name: string) {
  try {
    sessionStorage.setItem(`songyear:pending-name:${code.toUpperCase()}`, name);
  } catch {}
}

export function takePendingName(code: string): string {
  try {
    const storageKey = `songyear:pending-name:${code.toUpperCase()}`;
    const name = sessionStorage.getItem(storageKey) ?? "";
    sessionStorage.removeItem(storageKey);
    return name;
  } catch {
    return "";
  }
}

export function gameSocketBase(): string {
  const configured = process.env.NEXT_PUBLIC_GAME_WS_URL?.replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${protocol}//${window.location.host}/game-worker`;
  }
  return "ws://127.0.0.1:8787";
}

export function gameHttpBase(): string {
  return gameSocketBase().replace(/^ws:/, "http:").replace(/^wss:/, "https:");
}
