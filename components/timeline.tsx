"use client";

import type { PublicSongCard } from "@/shared/protocol";

export function SongCardView({ card, compact = false }: { card: PublicSongCard; compact?: boolean }) {
  return (
    <article className={`song-card revealed${compact ? " compact" : ""}`}>
      <strong>{card.year}</strong>
      {!compact && (
        <>
          <span>{card.title}</span>
          <small>{card.artists.join(", ")}</small>
        </>
      )}
    </article>
  );
}

export function HiddenCard({ label = "?" }: { label?: string }) {
  return (
    <article className="song-card hidden-card" aria-label="Carta escondida">
      <span className="mini-logo">SY</span>
      <strong>{label}</strong>
    </article>
  );
}

export function Timeline({ cards, compact = false }: { cards: PublicSongCard[]; compact?: boolean }) {
  return (
    <div className="timeline">
      {cards.map((card) => <SongCardView key={card.id} card={card} compact={compact} />)}
    </div>
  );
}

export function GapPicker({
  cards,
  selected,
  onSelect,
  blockedGap,
}: {
  cards: PublicSongCard[];
  selected: number | null;
  onSelect: (index: number) => void;
  blockedGap?: number;
}) {
  return (
    <div className="gap-picker" aria-label="Escolha uma posição na linha do tempo">
      {Array.from({ length: cards.length + 1 }, (_, index) => (
        <div className="gap-unit" key={index}>
          <button
            type="button"
            className={`gap-button${selected === index ? " selected" : ""}`}
            disabled={blockedGap === index}
            onClick={() => onSelect(index)}
            aria-label={`Posição ${index + 1}`}
          >
            {selected === index ? "✓" : "+"}
          </button>
          {cards[index] && <SongCardView card={cards[index]} />}
        </div>
      ))}
    </div>
  );
}
