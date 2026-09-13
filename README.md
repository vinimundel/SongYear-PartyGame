# SongYear

Party game musical em português para 2–4 jogadores. Cada pessoa usa o celular como controle e uma TV ou notebook mostra a mesa compartilhada. O objetivo é ser o primeiro a montar uma linha do tempo correta com 10 músicas.

O repositório contém um MVP funcional com:

- salas em tempo real, reconexão e estado autoritativo no servidor;
- modos Original, Pro e Expert;
- fichas, troca de música, contestação por ordem de chegada e compra de carta extra;
- reprodução de prévias no celular do host, priorizando iTunes e usando Deezer como fallback;
- tela pública para TV com QR code;
- Deck Studio local para importar uma playlist do Spotify ou CSV, consultar o Genius, revisar anos e exportar um `deck.json` estático;
- baralho inicial de desenvolvimento com 40 faixas e imagens provisórias feitas em CSS.

## Arquitetura

O frontend e as rotas HTTP usam Next.js. As salas vivem em um Cloudflare Durable Object, que serializa as ações concorrentes — inclusive o primeiro clique em uma contestação — e mantém a regra do jogo fora dos clientes.

```text
celulares + TV ── WebSocket ──> Worker + Durable Object
      │                              │
      └── preview HTTP ──> Next.js   └── estado da sala
                            │
                            ├── iTunes Search API
                            └── Deezer API (fallback)
```

O Spotify e o Genius são usados apenas no Deck Studio do host. Ele pode acumular quantas playlists quiser, com remoção automática de faixas duplicadas, antes de exportar o baralho. Convidados não montam nem alteram o deck. Uma partida normal lê o arquivo estático [`data/deck.json`](data/deck.json) e não depende dessas contas.

## Rodar localmente

Requisitos: Node.js 22+ e npm.

```bash
npm install
npm --prefix worker install
cp .env.example .env.local
```

Em dois terminais:

```bash
npm run worker:dev
npm run dev
```

Abra `http://127.0.0.1:8000`. O frontend usa `ws://127.0.0.1:8787` como Worker local por padrão.

Para expor temporariamente o Deck Studio ao callback do Spotify, mantenha o Next rodando e abra outro terminal:

```bash
npm run tunnel
```

Copie o endereço HTTPS mostrado pelo Cloudflare para `SPOTIFY_REDIRECT_URI`, acrescentando `/api/dev/spotify/callback`, e cadastre exatamente a mesma URI no Spotify Dashboard. Quick Tunnels mudam de endereço quando reiniciados e são indicados apenas para desenvolvimento.

Para testar em celulares na mesma rede, exponha os dois processos em um endereço HTTPS/WSS acessível e ajuste:

```env
NEXT_PUBLIC_GAME_WS_URL=wss://seu-worker.exemplo.com
```

Inclua também a origem do frontend em `worker/wrangler.jsonc` durante o desenvolvimento ou configure `ALLOWED_ORIGINS` no deploy.

## Montar o baralho

Abra `http://127.0.0.1:8000/dev/deck` em desenvolvimento.

### Via Spotify

1. Crie um app no Spotify for Developers e adicione exatamente o redirect URI abaixo:

   `http://127.0.0.1:8000/api/dev/spotify/callback`

2. Preencha `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` e `SPOTIFY_REDIRECT_URI` em `.env.local`.
3. Conecte sua conta no Deck Studio e adicione quantas playlists quiser que essa conta possa acessar. Cada importação é acumulada no baralho atual.

### Via CSV

Cole CSV com vírgulas ou ponto e vírgula. Cabeçalho recomendado:

```csv
title,artist,year,spotifyUrl
Heroes,David Bowie,1977,https://open.spotify.com/track/...
```

Configure `GENIUS_ACCESS_TOKEN` para obter sugestões de título, artista e ano. A sugestão nunca é aprovada automaticamente: revise e marque cada faixa. O botão de exportação é liberado com pelo menos 40 músicas revisadas e com ano válido. Substitua [`data/deck.json`](data/deck.json) pelo arquivo baixado e rode os testes.

Em produção, o Deck Studio fica desativado. Para habilitá-lo explicitamente, configure `ENABLE_DECK_STUDIO=true`; não é recomendado expor essa ferramenta publicamente.

## Regras implementadas

- Todos começam com 2 fichas e uma carta aberta.
- O jogador da vez também é o DJ e pode repetir a prévia sem custo.
- Depois da posição ser confirmada, adversários têm 10 segundos para contestar; o primeiro clique válido leva a disputa e recebe mais 10 segundos para posicionar.
- A contestação custa 1 ficha. Se o desafiante roubar a carta, recupera a aposta e ganha mais 1 ficha.
- O acerto do jogador ativo sempre tem prioridade sobre o desafiante.
- Uma troca custa 1 ficha e pode ser repetida enquanto houver fichas.
- Pro e Expert permitem trocar 3 fichas por uma rodada bônus contestável, no máximo uma vez por turno.
- No Pro, artista + título corretos rendem 1 ficha após validação manual do host.
- No Expert, posição e ano exato precisam estar corretos.
- Músicas do mesmo ano são aceitas em qualquer posição que mantenha a linha não decrescente.
- Descartes voltam embaralhados quando o monte acaba; cartas sem prévia confirmada ficam bloqueadas para aquela sala.

## Qualidade

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run worker:typecheck
npm run worker:test
```

## Deploy

1. Publique o Worker com `npm --prefix worker run deploy` e configure `ALLOWED_ORIGINS` com a origem exata do frontend.
2. Publique o Next.js em uma plataforma compatível e configure `NEXT_PUBLIC_GAME_WS_URL` com a URL `wss://` do Worker.
3. Configure Upstash (`UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`) para compartilhar o cache de prévias entre instâncias. Sem essas variáveis, o app usa memória local.

## Nota sobre APIs e direitos

Este projeto foi estruturado como protótipo privado e não comercial. A política atual do Spotify restringe o uso da plataforma em jogos; por isso o Spotify está isolado no fluxo local de preparação e não é usado para tocar a partida. Mesmo assim, a importação de metadados de playlist e o uso de prévias de iTunes/Deezer devem ser revistos antes de qualquer lançamento público ou comercial. As prévias continuam pertencendo aos respectivos provedores, e a disponibilidade pode variar por país e faixa.

Não há licença de redistribuição definida para este repositório privado.
