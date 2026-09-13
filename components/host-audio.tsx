"use client";

import { useEffect, useRef, useState } from "react";
import type { AudioEvent } from "@/lib/use-room-socket";

const SILENCE_WAV = "data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YRAAAACAgICAgICAgICAgICAgIA=";

export function HostAudio({
  event,
  send,
  onUnlocked,
}: {
  event: AudioEvent | null;
  send: (message: Record<string, unknown>) => boolean;
  onUnlocked?: (value: boolean) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handledRef = useRef(0);
  const [unlocked, setUnlocked] = useState(false);
  const [status, setStatus] = useState("Som ainda não ativado");

  async function unlock() {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.src = SILENCE_WAV;
      await audio.play();
      audio.pause();
      setUnlocked(true);
      onUnlocked?.(true);
      setStatus("Áudio pronto");
    } catch {
      setStatus("O navegador bloqueou o áudio. Toque novamente.");
    }
  }

  useEffect(() => {
    if (!event || event.sequence === handledRef.current) return;
    if (event.message.type === "audio:stop") {
      handledRef.current = event.sequence;
      if (timerRef.current) clearTimeout(timerRef.current);
      audioRef.current?.pause();
      return;
    }
    if (!unlocked) {
      return;
    }

    handledRef.current = event.sequence;
    const command = event.message;
    let cancelled = false;
    (async () => {
      setStatus("Buscando prévia…");
      let response: Response;
      try {
        response = await fetch(`/api/cards/${encodeURIComponent(command.cardId)}/preview`, { cache: "no-store" });
      } catch {
        send({ type: "host:audio-failed", status: "unavailable", audioRun: command.audioRun });
        setStatus("Serviço de áudio indisponível");
        return;
      }
      const body = (await response.json().catch(() => ({}))) as { previewUrl?: string | null; status?: "found" | "absent" | "unavailable" };
      if (cancelled) return;
      if (!response.ok || !body.previewUrl) {
        send({ type: "host:audio-failed", status: body.status === "absent" ? "absent" : "unavailable", audioRun: command.audioRun });
        setStatus(body.status === "absent" ? "Sem prévia; sorteando outra" : "Prévia indisponível");
        return;
      }
      const audio = audioRef.current;
      if (!audio) return;
      audio.pause();
      audio.src = body.previewUrl;
      audio.currentTime = 0;
      try {
        await audio.play();
        if (cancelled) return audio.pause();
        send({ type: "host:audio-started", audioRun: command.audioRun });
        setStatus("Tocando trecho de 30 segundos");
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => audio.pause(), 30_000);
      } catch {
        send({ type: "host:audio-failed", status: "unavailable", audioRun: command.audioRun });
        setStatus("Toque em “Ativar som” novamente");
        setUnlocked(false);
        onUnlocked?.(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [event, onUnlocked, send, unlocked]);

  return (
    <div className="audio-dock">
      <audio ref={audioRef} preload="none" />
      <button type="button" className={unlocked ? "secondary" : "primary"} onClick={unlock}>
        {unlocked ? "Som ativado" : "Ativar som neste celular"}
      </button>
      <small>{!unlocked && event?.message.type === "audio:play" ? "Ative o som para tocar a faixa solicitada" : status}</small>
    </div>
  );
}
