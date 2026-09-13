"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { gameHttpBase, saveIdentity, savePendingName } from "@/lib/room-storage";
import type { ClientIdentity, GameMode } from "@/shared/protocol";

export default function HomePage() {
  const router = useRouter();
  const [hostName, setHostName] = useState("");
  const [mode, setMode] = useState<GameMode>("original");
  const [joinName, setJoinName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [displayCode, setDisplayCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createRoom(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`${gameHttpBase()}/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hostName, mode }),
      });
      const body = (await response.json()) as { code?: string; identity?: ClientIdentity; error?: string };
      if (!response.ok || !body.code || !body.identity) throw new Error(body.error || "Não foi possível criar a sala.");
      saveIdentity(body.code, body.identity);
      router.push(`/room/${body.code}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar a sala.");
      setBusy(false);
    }
  }

  function join(event: FormEvent) {
    event.preventDefault();
    const code = joinCode.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4);
    if (code.length !== 4 || !joinName.trim()) return setError("Informe nome e código da sala.");
    savePendingName(code, joinName.trim());
    router.push(`/room/${code}`);
  }

  function display(event: FormEvent) {
    event.preventDefault();
    const code = displayCode.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4);
    if (code.length !== 4) return setError("Informe o código de quatro caracteres.");
    router.push(`/display/${code}`);
  }

  return (
    <main className="landing shell">
      <header className="hero">
        <div className="logo-placeholder">SY</div>
        <p className="eyebrow">PARTY GAME MUSICAL</p>
        <h1>Song<span>Year</span></h1>
        <p>Escute. Aposte. Posicione a música no tempo.</p>
      </header>

      {error && <div className="notice error">{error}</div>}

      <section className="home-grid">
        <form className="panel" onSubmit={createRoom}>
          <span className="step">01</span>
          <h2>Criar uma sala</h2>
          <label>Seu nome ou equipe<input value={hostName} onChange={(event) => setHostName(event.target.value)} maxLength={24} required /></label>
          <fieldset>
            <legend>Dificuldade</legend>
            {([
              ["original", "Original", "Cronologia + fichas"],
              ["pro", "Pro", "Artista e faixa rendem bônus"],
              ["expert", "Expert", "Ano exato obrigatório"],
            ] as const).map(([value, title, detail]) => (
              <label className={`mode-card${mode === value ? " selected" : ""}`} key={value}>
                <input type="radio" name="mode" value={value} checked={mode === value} onChange={() => setMode(value)} />
                <strong>{title}</strong><small>{detail}</small>
              </label>
            ))}
          </fieldset>
          <button className="primary" disabled={busy}>{busy ? "Criando…" : "Criar partida"}</button>
        </form>

        <div className="stack">
          <form className="panel" onSubmit={join}>
            <span className="step">02</span>
            <h2>Entrar para jogar</h2>
            <label>Seu nome ou equipe<input value={joinName} onChange={(event) => setJoinName(event.target.value)} maxLength={24} required /></label>
            <label>Código<input className="code-input" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={4} required /></label>
            <button className="secondary">Entrar na sala</button>
          </form>
          <form className="panel compact-panel" onSubmit={display}>
            <h2>Abrir na TV</h2>
            <div className="inline-form">
              <input className="code-input" aria-label="Código da sala" value={displayCode} onChange={(event) => setDisplayCode(event.target.value.toUpperCase())} maxLength={4} placeholder="ABCD" />
              <button className="secondary">Exibir</button>
            </div>
          </form>
        </div>
      </section>

      <footer className="footer-note">2–4 jogadores · uma TV · celulares como controles</footer>
    </main>
  );
}
