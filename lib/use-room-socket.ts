"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gameSocketBase, loadIdentity, saveIdentity } from "@/lib/room-storage";
import type { ClientMessage, RoomSnapshot, ServerMessage } from "@/shared/protocol";

type OptionalActionId<T> = T extends { actionId: string }
  ? Omit<T, "actionId"> & { actionId?: string }
  : T;
export type OutboundMessage = OptionalActionId<ClientMessage>;

export interface AudioEvent {
  sequence: number;
  message: Extract<ServerMessage, { type: "audio:play" | "audio:stop" }>;
}

export function useRoomSocket(options: {
  code: string;
  role: "player" | "display";
  name?: string;
}) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [you, setYou] = useState<{ role: "display" | "player"; playerId?: string; isHost: boolean } | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const [audioEvent, setAudioEvent] = useState<AudioEvent | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    let disposed = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (disposed) return;
      const socket = new WebSocket(`${gameSocketBase()}/rooms/${options.code.toUpperCase()}/ws`);
      socketRef.current = socket;
      socket.onopen = () => {
        setConnected(true);
        setError("");
        if (options.role === "display") {
          socket.send(JSON.stringify({ type: "join:display" } satisfies ClientMessage));
        } else {
          const identity = loadIdentity(options.code);
          socket.send(JSON.stringify({
            type: "join:player",
            ...(identity ? { identity } : { name: options.name }),
          } satisfies ClientMessage));
        }
      };
      socket.onmessage = (event) => {
        let message: ServerMessage;
        try {
          message = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        if (message.type === "identity") {
          saveIdentity(options.code, message.identity);
          return;
        }
        if (message.type === "state") {
          setSnapshot(message.snapshot);
          setYou(message.you);
          return;
        }
        if (message.type === "audio:play" || message.type === "audio:stop") {
          sequenceRef.current += 1;
          setAudioEvent({ sequence: sequenceRef.current, message });
          return;
        }
        if (message.type === "error") setError(message.message);
      };
      socket.onclose = () => {
        setConnected(false);
        if (!disposed) reconnectTimer = setTimeout(connect, 1500);
      };
      socket.onerror = () => setError("Conexão instável. Tentando novamente…");
    }

    connect();
    return () => {
      disposed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socketRef.current?.close();
    };
  }, [options.code, options.name, options.role]);

  const send = useCallback((message: OutboundMessage) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Sem conexão com a sala.");
      return false;
    }
    const withId = "actionId" in message || message.type === "ping"
      ? message
      : { ...message, actionId: crypto.randomUUID() };
    socket.send(JSON.stringify(withId));
    return true;
  }, []);

  return { snapshot, you, connected, error, send, audioEvent };
}
