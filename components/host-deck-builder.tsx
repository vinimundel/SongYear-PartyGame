"use client";

import { useEffect, useMemo, useState } from "react";
import { readJsonResponse } from "@/lib/http-response";
import { selectWithinArtistLimit, shuffledCopy } from "@/shared/deck-rules";
import { MAX_CUSTOM_DECK_SIZE, MAX_SONGS_PER_ARTIST, MIN_CUSTOM_DECK_SIZE, type SongCard } from "@/shared/protocol";

interface ImportedTrack {
  title: string;
  artists: string[];
  year: number | null;
  durationMs?: number;
  spotifyUrl?: string;
}

interface Source { name: string; imported: number; added: number }

function spotifyTrackId(url?: string): string | null {
  return url?.match(/track\/([A-Za-z0-9]+)/)?.[1] ?? null;
}

function fallbackId(track: ImportedTrack): string {
  return `${track.artists.join("-")}-${track.title}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
}

function toCard(track: ImportedTrack): SongCard | null {
  if (!track.year || track.year < 1800 || track.year > 2200 || !track.title || !track.artists.length) return null;
  const spotifyId = spotifyTrackId(track.spotifyUrl);
  return {
    id: spotifyId ? `spotify-${spotifyId}` : `host-${fallbackId(track)}`,
    title: track.title,
    artists: track.artists,
    year: track.year,
    ...(track.durationMs ? { durationMs: track.durationMs } : {}),
    preview: {},
    links: {
      ...(track.spotifyUrl ? { spotify: track.spotifyUrl } : {}),
      youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.artists.join(" ")} ${track.title}`)}`,
    },
  };
}

export function HostDeckBuilder({ onChange }: { onChange: (deck: SongCard[], variedArtists: boolean) => void }) {
  const [session, setSession] = useState<{ enabled: boolean; connected: boolean; displayName?: string }>({ enabled: true, connected: false });
  const [playlist, setPlaylist] = useState("");
  const [deck, setDeck] = useState<SongCard[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [variedArtists, setVariedArtists] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/spotify/session", { cache: "no-store" })
      .then((response) => response.json())
      .then(setSession)
      .catch(() => setSession({ enabled: false, connected: false }));
  }, []);

  const valid = deck.length === 0 || deck.length >= MIN_CUSTOM_DECK_SIZE;
  const summary = useMemo(() => deck.length
    ? `${deck.length} músicas de ${sources.length} playlist${sources.length === 1 ? "" : "s"}`
    : "Usando o baralho base do SongYear", [deck.length, sources.length]);

  async function addPlaylist() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/spotify/playlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playlist }),
      });
      const body = await readJsonResponse<{ name?: string; tracks?: ImportedTrack[]; error?: string }>(
        response,
        "O servidor do Spotify não respondeu corretamente; confira o terminal do npm run dev",
      );
      if (!response.ok || !body.tracks) throw new Error(body.error ?? "Não foi possível importar a playlist.");
      const candidates = shuffledCopy(body.tracks).flatMap((track) => {
        const card = toCard(track);
        return card ? [card] : [];
      });
      const known = new Set(deck.map((card) => card.id));
      const unique = candidates.filter((card) => {
        if (known.has(card.id)) return false;
        known.add(card.id);
        return true;
      });
      const artistSelection = variedArtists
        ? selectWithinArtistLimit(unique, deck)
        : { accepted: unique, rejected: 0 };
      const accepted = artistSelection.accepted.slice(0, Math.max(0, MAX_CUSTOM_DECK_SIZE - deck.length));
      const next = [...deck, ...accepted];
      setDeck(next);
      onChange(next, variedArtists);
      setSources((current) => [...current, { name: body.name ?? "Playlist", imported: body.tracks!.length, added: accepted.length }]);
      setPlaylist("");
      const capped = artistSelection.accepted.length - accepted.length;
      const ignored = [
        `${body.tracks.length - candidates.length} sem ano`,
        `${candidates.length - unique.length} duplicadas`,
        ...(variedArtists ? [`${artistSelection.rejected} acima do limite de ${MAX_SONGS_PER_ARTIST} por artista`] : []),
        ...(capped ? [`${capped} acima do limite de ${MAX_CUSTOM_DECK_SIZE}`] : []),
      ];
      setMessage(`${accepted.length} músicas adicionadas em ordem aleatória; ${ignored.join(", ")} foram ignoradas.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao importar playlist.");
    } finally {
      setBusy(false);
    }
  }

  function clear() {
    setDeck([]);
    setSources([]);
    setMessage("");
    onChange([], variedArtists);
  }

  function toggleVariedArtists(enabled: boolean) {
    setVariedArtists(enabled);
    if (!enabled) {
      setMessage("Limite por artista desativado; as próximas playlists continuam sendo embaralhadas.");
      onChange(deck, false);
      return;
    }
    const selection = selectWithinArtistLimit(shuffledCopy(deck));
    setDeck(selection.accepted);
    onChange(selection.accepted, true);
    setMessage(selection.rejected
      ? `${selection.rejected} músicas foram removidas para manter no máximo ${MAX_SONGS_PER_ARTIST} por artista.`
      : `O deck já respeita o máximo de ${MAX_SONGS_PER_ARTIST} músicas por artista.`);
  }

  return (
    <div className="host-deck-builder">
      <div className="deck-heading">
        <div><strong>Baralho do host</strong><small>{summary}</small></div>
        {deck.length > 0 && <button type="button" className="text-button" onClick={clear}>Usar baralho base</button>}
      </div>

      <label className="check-row">
        <input type="checkbox" checked={variedArtists} onChange={(event) => toggleVariedArtists(event.target.checked)} />
        <span><strong>Artistas mais variados</strong><small>Limita o mesmo artista a {MAX_SONGS_PER_ARTIST} músicas nesta sala.</small></span>
      </label>

      {session.connected ? (
        <small className="spotify-account">Spotify: {session.displayName ?? "conta conectada"}</small>
      ) : (
        <a className="secondary link-button" href="/api/spotify/login?returnTo=/">Conectar Spotify para adicionar playlists</a>
      )}

      <div className="inline-form">
        <input aria-label="Link da playlist" value={playlist} onChange={(event) => setPlaylist(event.target.value)} placeholder="Cole uma playlist do Spotify" />
        <button type="button" className="secondary" disabled={busy || !playlist.trim() || deck.length >= MAX_CUSTOM_DECK_SIZE} onClick={addPlaylist}>{busy ? "…" : "Adicionar"}</button>
      </div>
      {!session.enabled && <small className="muted">A configuração do Spotify não pôde ser confirmada; tente conectar novamente.</small>}

      {sources.length > 0 && <div className="source-list">{sources.map((source, index) => <span key={`${source.name}-${index}`}>{source.name} · +{source.added} de {source.imported}</span>)}</div>}
      {message && <small className="deck-message">{message}</small>}
      {!valid && <small className="warning">Adicione pelo menos {MIN_CUSTOM_DECK_SIZE} músicas ou limpe para usar o baralho base.</small>}
      <small className="muted">A seleção de cada playlist é sempre embaralhada.</small>
    </div>
  );
}
