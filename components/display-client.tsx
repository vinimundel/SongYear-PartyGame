"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { GameBoard } from "@/components/game-board";
import { QrCode } from "@/components/qr-code";
import { useRoomSocket } from "@/lib/use-room-socket";

export function DisplayClient({ code }: { code: string }) {
  const { snapshot, connected, error } = useRoomSocket({ code, role: "display" });
  const [joinUrl, setJoinUrl] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => setJoinUrl(`${window.location.origin}/room/${code}`), 0);
    return () => window.clearTimeout(timer);
  }, [code]);

  if (!snapshot) {
    return <main className="display-loading"><div className="loader" /><h1>Conectando à sala {code}</h1>{error && <p>{error}</p>}</main>;
  }

  return (
    <main className="display-page">
      <div className={`display-connection ${connected ? "online" : ""}`} />
      {snapshot.phase === "lobby" ? (
        <div className="display-lobby">
          <div>
            <div className="logo-placeholder">SY</div>
            <p className="eyebrow">SALA ABERTA</p>
            <h1>{code}</h1>
            <p>Escaneie para entrar. Até quatro jogadores.</p>
          </div>
          {joinUrl && <QrCode value={joinUrl} label="QR code para entrar na sala" />}
          <div className="display-roster">
            {snapshot.participants.map((player) => <span key={player.id}>{player.name}</span>)}
          </div>
        </div>
      ) : <GameBoard snapshot={snapshot} />}
      {error && <div className="notice error floating">{error}</div>}
      <Link href="/" className="display-home">SongYear</Link>
    </main>
  );
}
