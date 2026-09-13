"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SongCard } from "@/shared/protocol";

interface DraftTrack {
  key: string;
  title: string;
  artist: string;
  year: string;
  durationMs?: number;
  spotifyUrl?: string;
  geniusUrl?: string;
  reviewed: boolean;
  status?: string;
  source?: string;
}

function fingerprint(track: Pick<DraftTrack, "title" | "artist" | "spotifyUrl">): string {
  const spotifyId = track.spotifyUrl?.match(/track\/([A-Za-z0-9]+)/)?.[1];
  if (spotifyId) return `spotify:${spotifyId}`;
  return `${track.artist}::${track.title}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function appendUnique(current: DraftTrack[], incoming: DraftTrack[]): { tracks: DraftTrack[]; added: number } {
  const known = new Set(current.map(fingerprint));
  const unique = incoming.filter((track) => {
    const key = fingerprint(track);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
  return { tracks: [...current, ...unique], added: unique.length };
}

function splitCsvLine(line: string, separator: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') { current += '"'; index += 1; }
    else if (char === '"') quoted = !quoted;
    else if (char === separator && !quoted) { cells.push(current.trim()); current = ""; }
    else current += char;
  }
  cells.push(current.trim());
  return cells;
}

function csvTracks(value: string): DraftTrack[] {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return [];
  const separator = (lines[0].match(/;/g)?.length ?? 0) > (lines[0].match(/,/g)?.length ?? 0) ? ";" : ",";
  const first = splitCsvLine(lines[0], separator).map((cell) => cell.toLowerCase());
  const hasHeader = first.some((cell) => ["title", "titulo", "título", "artist", "artista", "year", "ano"].includes(cell));
  const indexes = {
    title: hasHeader ? first.findIndex((cell) => ["title", "titulo", "título", "track"].includes(cell)) : 0,
    artist: hasHeader ? first.findIndex((cell) => ["artist", "artista", "artists"].includes(cell)) : 1,
    year: hasHeader ? first.findIndex((cell) => ["year", "ano"].includes(cell)) : 2,
    spotify: hasHeader ? first.findIndex((cell) => ["spotify", "spotifyurl", "spotify_url"].includes(cell)) : 3,
  };
  return lines.slice(hasHeader ? 1 : 0).flatMap((line, index) => {
    const cells = splitCsvLine(line, separator);
    const title = cells[indexes.title]?.trim();
    const artist = cells[indexes.artist]?.trim();
    if (!title || !artist) return [];
    return [{
      key: crypto.randomUUID(), title, artist, year: indexes.year >= 0 ? cells[indexes.year]?.trim() ?? "" : "",
      spotifyUrl: indexes.spotify >= 0 ? cells[indexes.spotify]?.trim() || undefined : undefined,
      reviewed: false, status: `CSV ${index + 1}`,
    }];
  });
}

function slug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 44);
}

function toDeck(tracks: DraftTrack[]): SongCard[] {
  const used = new Set<string>();
  return tracks.filter((track) => track.reviewed && /^\d{4}$/.test(track.year)).map((track, index) => {
    const base = slug(`${track.artist}-${track.title}`) || `faixa-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (used.has(id)) { id = `${base}-${suffix}`; suffix += 1; }
    used.add(id);
    return {
      id,
      title: track.title.trim(),
      artists: track.artist.split(/\s*[;&]\s*/).filter(Boolean),
      year: Number(track.year),
      ...(track.durationMs ? { durationMs: track.durationMs } : {}),
      preview: {},
      links: {
        ...(track.spotifyUrl ? { spotify: track.spotifyUrl } : {}),
        youtube: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${track.artist} ${track.title}`)}`,
        ...(track.geniusUrl ? { genius: track.geniusUrl } : {}),
      },
    };
  });
}

export function DeckStudio() {
  const [tracks, setTracks] = useState<DraftTrack[]>([]);
  const [csv, setCsv] = useState("title,artist,year,spotifyUrl\n");
  const [playlist, setPlaylist] = useState("");
  const [spotify, setSpotify] = useState<{ connected: boolean; displayName?: string } | null>(null);
  const [sources, setSources] = useState<Array<{ name: string; count: number }>>([]);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);
  const approved = useMemo(() => toDeck(tracks), [tracks]);

  useEffect(() => {
    fetch("/api/spotify/session", { cache: "no-store" }).then((response) => response.json()).then(setSpotify).catch(() => setSpotify({ connected: false }));
  }, []);

  function update(key: string, patch: Partial<DraftTrack>) {
    setTracks((current) => current.map((track) => track.key === key ? { ...track, ...patch } : track));
  }

  async function importPlaylist() {
    setBusy("spotify"); setMessage("");
    const response = await fetch("/api/spotify/playlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ playlist }) });
    const body = await response.json() as { name?: string; tracks?: Array<{ title: string; artists: string[]; year: number | null; durationMs?: number; spotifyUrl?: string }>; error?: string };
    if (!response.ok || !body.tracks) setMessage(body.error ?? "Falha ao importar playlist.");
    else {
      const source = body.name ?? "Playlist Spotify";
      const incoming = body.tracks.map((track) => ({ key: crypto.randomUUID(), title: track.title, artist: track.artists.join("; "), year: track.year?.toString() ?? "", durationMs: track.durationMs, spotifyUrl: track.spotifyUrl, reviewed: false, status: `Spotify · ${source}`, source }));
      const merged = appendUnique(tracks, incoming);
      setTracks(merged.tracks);
      setSources((current) => [...current, { name: source, count: incoming.length }]);
      setMessage(`${merged.added} novas faixas adicionadas de “${source}” (${incoming.length - merged.added} duplicadas ignoradas). Você pode importar outra playlist agora.`);
    }
    setBusy("");
  }

  async function consultGenius(track: DraftTrack) {
    update(track.key, { status: "Consultando…" });
    const response = await fetch("/api/dev/genius", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: track.title, artist: track.artist }) });
    const body = await response.json() as { match?: { title?: string; artist?: string; year?: number | null; geniusUrl?: string } | null; error?: string };
    if (!response.ok) return update(track.key, { status: body.error ?? "Erro no Genius" });
    if (!body.match) return update(track.key, { status: "Sem resultado no Genius" });
    update(track.key, {
      title: body.match.title ?? track.title,
      artist: body.match.artist ?? track.artist,
      year: body.match.year?.toString() ?? track.year,
      geniusUrl: body.match.geniusUrl,
      status: body.match.year ? "Ano sugerido pelo Genius" : "Genius sem ano",
    });
  }

  async function consultAll() {
    setBusy("genius"); setMessage("Consultando o Genius faixa por faixa…");
    for (const track of tracks) await consultGenius(track);
    setBusy(""); setMessage("Consulta concluída. Confirme manualmente cada faixa.");
  }

  async function testPreview(track: DraftTrack) {
    update(track.key, { status: "Buscando prévia…" });
    const response = await fetch("/api/dev/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: track.title, artists: [track.artist], year: Number(track.year), durationMs: track.durationMs, preview: {}, links: {} }) });
    const result = await response.json() as { status?: string; source?: string; previewUrl?: string | null };
    if (result.previewUrl && audioRef.current) {
      audioRef.current.src = result.previewUrl;
      await audioRef.current.play().catch(() => undefined);
      update(track.key, { status: `Prévia OK · ${result.source}` });
    } else update(track.key, { status: result.status === "absent" ? "Sem prévia" : "Serviço indisponível" });
  }

  function download() {
    const blob = new Blob([`${JSON.stringify(approved, null, 2)}\n`], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href; link.download = "deck.json"; link.click();
    URL.revokeObjectURL(href);
  }

  return (
    <main className="studio shell">
      <header className="studio-header">
        <div><p className="eyebrow">FERRAMENTA LOCAL</p><h1>Deck Studio</h1><p>Importe uma vez, valide os metadados e gere o baralho estático do jogo.</p></div>
        <Link href="/" className="secondary link-button">Voltar ao jogo</Link>
      </header>

      <section className="studio-imports">
        <div className="panel">
          <p className="eyebrow">ÁREA DO HOST</p>
          <h2>Spotify</h2>
          {spotify?.connected ? <p>Conectado como <strong>{spotify.displayName ?? "conta Spotify"}</strong>.</p> : <a className="primary link-button" href="/api/spotify/login?returnTo=/dev/deck">Conectar Spotify</a>}
          <label>Link ou ID da sua playlist<input value={playlist} onChange={(event) => setPlaylist(event.target.value)} placeholder="https://open.spotify.com/playlist/…" /></label>
          <button className="secondary" disabled={!spotify?.connected || !playlist || Boolean(busy)} onClick={importPlaylist}>{busy === "spotify" ? "Importando…" : "Importar playlist"}</button>
          {sources.length > 0 && <div className="source-list">{sources.map((source, index) => <span key={`${source.name}-${index}`}>{source.name} · {source.count}</span>)}</div>}
        </div>
        <div className="panel">
          <h2>CSV</h2>
          <p className="muted">Colunas: title, artist, year e spotifyUrl. Vírgula ou ponto e vírgula.</p>
          <textarea rows={6} value={csv} onChange={(event) => setCsv(event.target.value)} />
          <button className="secondary" onClick={() => {
            const parsed = csvTracks(csv).map((track) => ({ ...track, source: "CSV" }));
            const merged = appendUnique(tracks, parsed);
            setTracks(merged.tracks);
            setMessage(`${merged.added} faixas do CSV adicionadas (${parsed.length - merged.added} duplicadas ignoradas).`);
          }}>Adicionar CSV</button>
        </div>
      </section>

      {message && <div className="notice">{message}</div>}
      {tracks.length > 0 && (
        <>
          <section className="studio-toolbar panel">
            <div><strong>{tracks.length}</strong> faixas · <strong>{approved.length}</strong> aprovadas com ano</div>
            <button className="secondary" disabled={Boolean(busy)} onClick={consultAll}>{busy === "genius" ? "Consultando…" : "Sugerir anos com Genius"}</button>
            <button className="text-button" onClick={() => setTracks((current) => current.map((track) => ({ ...track, reviewed: /^\d{4}$/.test(track.year) })))}>Aprovar as que têm ano</button>
            <button className="text-button" onClick={() => { setTracks([]); setSources([]); setMessage("Baralho limpo."); }}>Limpar baralho</button>
            <button className="primary link-button" disabled={approved.length < 40} onClick={download}>Baixar deck.json</button>
          </section>
          {approved.length < 40 && <p className="warning">O jogo exige pelo menos 40 cartas aprovadas. Faltam {40 - approved.length}.</p>}
          <div className="track-editor">
            {tracks.map((track, index) => (
              <article className={`track-row${track.reviewed ? " reviewed" : ""}`} key={track.key}>
                <span className="track-index">{index + 1}</span>
                <label>Título<input value={track.title} onChange={(event) => update(track.key, { title: event.target.value, reviewed: false })} /></label>
                <label>Artista<input value={track.artist} onChange={(event) => update(track.key, { artist: event.target.value, reviewed: false })} /></label>
                <label>Ano<input className="year-input" inputMode="numeric" value={track.year} onChange={(event) => update(track.key, { year: event.target.value.replace(/\D/g, "").slice(0, 4), reviewed: false })} /></label>
                <div className="track-actions">
                  <button className="text-button" onClick={() => consultGenius(track)}>Genius</button>
                  <button className="text-button" onClick={() => testPreview(track)}>Ouvir</button>
                  <label className="review-check"><input type="checkbox" checked={track.reviewed} disabled={!/^\d{4}$/.test(track.year)} onChange={(event) => update(track.key, { reviewed: event.target.checked })} /> Revisada</label>
                  <button className="remove-button" aria-label={`Remover ${track.title}`} onClick={() => setTracks((current) => current.filter((item) => item.key !== track.key))}>×</button>
                </div>
                <small>{track.status}</small>
              </article>
            ))}
          </div>
        </>
      )}
      <audio ref={audioRef} onEnded={() => setMessage("")} />
    </main>
  );
}
