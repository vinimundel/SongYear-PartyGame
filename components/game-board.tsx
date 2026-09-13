"use client";

import { HiddenCard, SongCardView, Timeline } from "@/components/timeline";
import { Countdown } from "@/components/countdown";
import type { ParticipantSnapshot, RoomSnapshot } from "@/shared/protocol";

function PlayerBoard({ player, snapshot }: { player: ParticipantSnapshot; snapshot: RoomSnapshot }) {
  const active = snapshot.activePlayerId === player.id;
  const showPending =
    active &&
    snapshot.hiddenCard &&
    snapshot.placement &&
    snapshot.placement.playerId === player.id &&
    (snapshot.phase === "challenge_open" || snapshot.phase === "challenge_placing");
  const cards = [...player.timeline];
  const gap = snapshot.placement?.gapIndex ?? cards.length;

  return (
    <section className={`player-board${active ? " active" : ""}`}>
      <header>
        <div>
          <span className="turn-dot" />
          <h2>{player.name}</h2>
          {player.isHost && <small>HOST</small>}
        </div>
        <div className="token-pill">● {player.tokens}</div>
      </header>
      {showPending ? (
        <div className="timeline">
          {cards.slice(0, gap).map((card) => <SongCardView card={card} compact key={card.id} />)}
          <HiddenCard />
          {cards.slice(gap).map((card) => <SongCardView card={card} compact key={card.id} />)}
        </div>
      ) : <Timeline cards={cards} compact />}
      <p className="card-count">{player.timeline.length}/10 cartas</p>
    </section>
  );
}

function resultText(snapshot: RoomSnapshot): string {
  if (!snapshot.result) return "";
  if (snapshot.result.kind === "discarded") return "Ninguém levou esta carta.";
  const recipient = snapshot.participants.find((player) => player.id === snapshot.result?.recipientId);
  return snapshot.result.kind === "challenger"
    ? `${recipient?.name ?? "O desafiante"} roubou a carta!`
    : `${recipient?.name ?? "O jogador"} acertou a posição!`;
}

export function GameBoard({ snapshot }: { snapshot: RoomSnapshot }) {
  const active = snapshot.participants.find((player) => player.id === snapshot.activePlayerId);
  const host = snapshot.participants.find((player) => player.isHost);
  const winner = snapshot.participants.find((player) => player.id === snapshot.winnerId);
  const challenger = snapshot.participants.find((player) => player.id === snapshot.challenge?.playerId);

  return (
    <div className="game-board">
      <div className="round-banner">
        <div>
          <span className="eyebrow">SALA {snapshot.code} · {snapshot.mode.toUpperCase()} · DJ {host?.name ?? "HOST"}</span>
          <h1>
            {snapshot.phase === "lobby" && "Preparando a festa"}
            {(snapshot.phase === "listening" || snapshot.phase === "placing") && `Vez de ${active?.name ?? "—"}`}
            {snapshot.phase === "challenge_open" && "Vale contestação!"}
            {snapshot.phase === "challenge_placing" && `${challenger?.name ?? "Desafiante"} escolhe a posição`}
            {snapshot.phase === "revealed" && resultText(snapshot)}
            {snapshot.phase === "finished" && `${winner?.name ?? "Temos um vencedor"}!`}
          </h1>
        </div>
        <Countdown deadline={snapshot.deadline} />
      </div>

      {snapshot.isBonusRound && <div className="bonus-ribbon">RODADA BÔNUS</div>}

      {snapshot.revealedCard && (
        <div className="reveal-stage">
          <SongCardView card={snapshot.revealedCard} />
          <div>
            <p className="eyebrow">CARTA REVELADA</p>
            <h2>{snapshot.revealedCard.title}</h2>
            <p>{snapshot.revealedCard.artists.join(", ")} · {snapshot.revealedCard.year}</p>
          </div>
        </div>
      )}

      <div className={`boards count-${snapshot.participants.length}`}>
        {snapshot.participants.map((player) => <PlayerBoard key={player.id} player={player} snapshot={snapshot} />)}
      </div>
    </div>
  );
}
