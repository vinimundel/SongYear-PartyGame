"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Countdown } from "@/components/countdown";
import { GameBoard } from "@/components/game-board";
import { HostAudio } from "@/components/host-audio";
import { QrCode } from "@/components/qr-code";
import { GapPicker, HiddenCard, SongCardView, Timeline } from "@/components/timeline";
import { loadIdentity, savePendingName, takePendingName } from "@/lib/room-storage";
import { useRoomSocket } from "@/lib/use-room-socket";

export function RoomEntry({ code }: { code: string }) {
  const [ready, setReady] = useState(false);
  // null = ainda precisa informar o nome; undefined = identidade já salva.
  const [name, setName] = useState<string | undefined | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const identity = loadIdentity(code);
      const pending = takePendingName(code);
      if (identity) setName(undefined);
      else if (pending) setName(pending);
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [code]);

  if (!ready) return <main className="center-page"><div className="loader" /></main>;
  if (name === null) {
    function enter(event: FormEvent) {
      event.preventDefault();
      const clean = draft.trim();
      if (!clean) return;
      savePendingName(code, clean);
      setName(clean);
    }
    return (
      <main className="center-page shell narrow">
        <div className="logo-placeholder small">SY</div>
        <form className="panel" onSubmit={enter}>
          <p className="eyebrow">SALA {code}</p>
          <h1>Como vamos chamar você?</h1>
          <label>Nome ou equipe<input autoFocus value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={24} /></label>
          <button className="primary">Entrar na partida</button>
        </form>
      </main>
    );
  }
  return <ConnectedRoom code={code} name={name || undefined} />;
}

function ConnectedRoom({ code, name }: { code: string; name?: string }) {
  const { snapshot, you, connected, error, send, audioEvent } = useRoomSocket({ code, role: "player", name });
  const [origin, setOrigin] = useState("");
  const [firstPlayer, setFirstPlayer] = useState("");
  const [gap, setGap] = useState<number | null>(null);
  const [exactYear, setExactYear] = useState("");
  const [bonusAttempted, setBonusAttempted] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setOrigin(window.location.origin), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setGap(null);
      setExactYear("");
      setBonusAttempted(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [snapshot?.hiddenCard?.id]);

  const me = snapshot?.participants.find((player) => player.id === you?.playerId);
  const active = snapshot?.participants.find((player) => player.id === snapshot.activePlayerId);
  const isActive = Boolean(me && active?.id === me.id);
  const isChallenger = Boolean(me && snapshot?.challenge?.playerId === me.id);
  const activeTimeline = active?.timeline ?? [];
  const canBuy = Boolean(
    snapshot && me && isActive && snapshot.phase === "revealed" && !snapshot.pendingBonusJudge &&
      snapshot.mode !== "original" && !snapshot.isBonusRound && !snapshot.bonusUsedThisTurn && me.tokens >= 3
  );

  const statusLabel = useMemo(() => {
    if (!snapshot) return "Entrando na sala…";
    if (snapshot.phase === "lobby") return "Aguardando jogadores";
    if (snapshot.phase === "listening") {
      if (you?.isHost) return `Toque a música para ${active?.name ?? "o jogador da vez"}`;
      return isActive ? "Aguarde o DJ tocar a música" : `Vez de ${active?.name}`;
    }
    if (snapshot.phase === "placing") return isActive ? "Escolha uma posição" : `${active?.name} está decidindo`;
    if (snapshot.phase === "challenge_open") return "Janela de contestação";
    if (snapshot.phase === "challenge_placing") return isChallenger ? "Escolha onde deveria estar" : "Desafio em andamento";
    if (snapshot.phase === "revealed") return "Carta revelada";
    return "Fim de jogo";
  }, [active?.name, isActive, isChallenger, snapshot, you?.isHost]);

  if (!snapshot || !you || !me) {
    return (
      <main className="center-page shell narrow">
        <div className="loader" />
        <h1>Conectando à sala {code}</h1>
        {error && <div className="notice error">{error}</div>}
        <Link href="/" className="text-link">Voltar</Link>
      </main>
    );
  }

  function submitPlacement() {
    if (gap === null) return;
    send({
      type: "round:place",
      gapIndex: gap,
      ...(snapshot?.mode === "expert" ? { exactYear: Number(exactYear) } : {}),
      bonusAttempted,
    });
  }

  function submitChallengePlacement() {
    if (gap === null) return;
    send({
      type: "round:challenge-place",
      gapIndex: gap,
      ...(snapshot?.mode === "expert" ? { exactYear: Number(exactYear) } : {}),
    });
  }

  const winner = snapshot.participants.find((player) => player.id === snapshot.winnerId);

  return (
    <main className="controller shell">
      <header className="controller-header">
        <Link href="/" className="brand">Song<span>Year</span></Link>
        <div className="room-chip">Sala <strong>{code}</strong></div>
        <span className={`connection ${connected ? "online" : ""}`}>{connected ? "online" : "reconectando"}</span>
      </header>

      {error && <div className="notice error">{error}</div>}

      {you.isHost && <HostAudio event={audioEvent} send={send as (message: Record<string, unknown>) => boolean} onUnlocked={setAudioUnlocked} />}

      {snapshot.phase === "lobby" ? (
        <section className="lobby-layout">
          <div className="panel">
            <p className="eyebrow">VOCÊ É {you.isHost ? "HOST, DJ E JOGADOR" : "JOGADOR"}</p>
            <h1>{you.isHost ? "Monte a mesa" : "Você entrou!"}</h1>
            <div className="roster">
              {snapshot.participants.map((player) => (
                <label className="roster-row" key={player.id}>
                  {you.isHost && <input type="radio" name="first" checked={firstPlayer === player.id} onChange={() => setFirstPlayer(player.id)} />}
                  <span>{player.name}{player.isHost ? " · host e DJ" : ""}</span>
                  <span className={player.connected ? "online-dot" : "offline-dot"} />
                </label>
              ))}
            </div>
            {you.isHost ? (
              <>
                <p className="muted">Selecione quem começa ou deixe vazio para sortear.</p>
                <button
                  className="primary"
                  disabled={snapshot.participants.length < 2 || !audioUnlocked}
                  onClick={() => send({ type: "host:start", ...(firstPlayer ? { firstPlayerId: firstPlayer } : {}) })}
                >
                  Começar partida
                </button>
                {!audioUnlocked && <small className="warning">Ative o som antes de começar.</small>}
              </>
            ) : <p className="muted">O host iniciará quando todos estiverem prontos.</p>}
          </div>
          <div className="panel invite-card">
            <h2>Abra na TV</h2>
            {origin && <QrCode value={`${origin}/display/${code}`} label="QR code para abrir a mesa" />}
            <p>Na TV, acesse <strong>{origin.replace(/^https?:\/\//, "")}</strong> e digite <b>{code}</b>.</p>
            <hr />
            <p>Outros jogadores usam o mesmo código na tela inicial.</p>
          </div>
        </section>
      ) : (
        <>
          <section className="player-status">
            <div><p className="eyebrow">{snapshot.isBonusRound ? "RODADA BÔNUS" : snapshot.mode.toUpperCase()}</p><h1>{statusLabel}</h1></div>
            <div className="my-tokens">● {me.tokens}<small>fichas</small></div>
            <Countdown deadline={snapshot.deadline} />
          </section>

          {snapshot.phase === "finished" && (
            <section className="panel victory">
              <p className="eyebrow">LINHA COMPLETA</p>
              <h1>{winner?.name} venceu!</h1>
              <Timeline cards={winner?.timeline ?? []} />
              <Link href="/" className="primary link-button">Nova partida</Link>
            </section>
          )}

          {snapshot.revealedCard && snapshot.phase === "revealed" && (
            <section className="panel reveal-controller">
              <SongCardView card={snapshot.revealedCard} />
              <div>
                <p className="eyebrow">RESPOSTA</p>
                <h2>{snapshot.revealedCard.title}</h2>
                <p>{snapshot.revealedCard.artists.join(", ")} · {snapshot.revealedCard.year}</p>
                <div className="external-links">
                  {Object.entries(snapshot.revealedCard.links).map(([source, href]) => href && (
                    <a key={source} href={href} target="_blank" rel="noreferrer">Abrir no {source}</a>
                  ))}
                </div>
              </div>
            </section>
          )}

          {snapshot.phase !== "finished" && (
            <section className="panel action-panel">
              {(snapshot.phase === "listening" || snapshot.phase === "placing") && (
                <div className="hidden-stage">
                  <HiddenCard label="▶" />
                  <p>{you.isHost ? `Você é o DJ · vez de ${active?.name}` : isActive ? "O host é o DJ · esta é sua rodada." : `O host é o DJ · vez de ${active?.name}`}</p>
                </div>
              )}

              {you.isHost && (snapshot.phase === "listening" || snapshot.phase === "placing") && (
                <div className="action-stack">
                  <button className="primary play-button" onClick={() => send({ type: "round:play" })}>
                    {snapshot.phase === "placing" ? "↻ Repetir trecho" : "▶ Tocar 30 segundos"}
                  </button>
                </div>
              )}

              {snapshot.audioIssue && you.isHost && (
                <div className="action-stack">
                  <p className="warning">O serviço de prévia não respondeu.</p>
                  <button className="secondary" onClick={() => send({ type: "host:skip-audio" })}>Pular faixa sem custo</button>
                </div>
              )}

              {isActive && snapshot.phase === "placing" && (
                <div className="placement-form">
                  <h2>Onde esta música entra?</h2>
                  <GapPicker cards={me.timeline} selected={gap} onSelect={setGap} />
                  {snapshot.mode === "expert" && <label>Ano exato<input inputMode="numeric" type="number" min="1800" max="2200" value={exactYear} onChange={(event) => setExactYear(event.target.value)} /></label>}
                  {snapshot.mode !== "original" && (
                    <label className="check-row"><input type="checkbox" checked={bonusAttempted} onChange={(event) => setBonusAttempted(event.target.checked)} /> Vou dizer artista e título em voz alta</label>
                  )}
                  <div className="button-row">
                    <button className="secondary" disabled={me.tokens < 1} onClick={() => send({ type: "round:swap" })}>Trocar · 1 ficha</button>
                    <button className="primary" disabled={gap === null || (snapshot.mode === "expert" && !exactYear)} onClick={submitPlacement}>Confirmar posição</button>
                  </div>
                </div>
              )}

              {!isActive && snapshot.phase === "challenge_open" && (
                <div className="challenge-callout">
                  <h2>Acha que está errado?</h2>
                  <button className="danger" disabled={me.tokens < 1} onClick={() => send({ type: "round:challenge" })}>⚡ Contestar · 1 ficha</button>
                </div>
              )}

              {isActive && snapshot.phase === "challenge_open" && <p className="waiting-copy">Sua posição está travada. Os adversários têm 10 segundos.</p>}

              {isChallenger && snapshot.phase === "challenge_placing" && (
                <div className="placement-form">
                  <h2>Marque a posição correta</h2>
                  <GapPicker
                    cards={activeTimeline}
                    selected={gap}
                    onSelect={setGap}
                    blockedGap={snapshot.mode === "expert" ? undefined : snapshot.placement?.gapIndex}
                  />
                  {snapshot.mode === "expert" && <label>Ano exato<input inputMode="numeric" type="number" min="1800" max="2200" value={exactYear} onChange={(event) => setExactYear(event.target.value)} /></label>}
                  <button className="primary" disabled={gap === null || (snapshot.mode === "expert" && !exactYear)} onClick={submitChallengePlacement}>Confirmar desafio</button>
                </div>
              )}

              {snapshot.phase === "revealed" && snapshot.pendingBonusJudge && you.isHost && (
                <div className="judge-box">
                  <h2>Artista e título estavam corretos?</h2>
                  <div className="button-row">
                    <button className="secondary" onClick={() => send({ type: "host:bonus-verdict", correct: false })}>Não</button>
                    <button className="primary" onClick={() => send({ type: "host:bonus-verdict", correct: true })}>Sim · +1 ficha</button>
                  </div>
                </div>
              )}

              {snapshot.phase === "revealed" && !snapshot.pendingBonusJudge && (isActive || you.isHost) && (
                <div className="button-row end-actions">
                  {canBuy && <button className="secondary" onClick={() => send({ type: "round:buy-extra" })}>Comprar carta extra · 3</button>}
                  <button className="primary" onClick={() => send({ type: "round:next" })}>Próximo jogador</button>
                </div>
              )}
            </section>
          )}

          <details className="mini-board"><summary>Ver a mesa completa</summary><GameBoard snapshot={snapshot} /></details>
        </>
      )}
    </main>
  );
}
