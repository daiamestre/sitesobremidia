# Projeto: SOBRE MÍDIA em telões de LED e computadores (P-31)

> Pedido do dono (09/11/2026): o sistema e o Player não ficam só no Android. Devem tocar em **computadores** e em **painéis de LED
> indoor e outdoor**, ligados a **qualquer processador de vídeo de LED**, e a mesma mídia deve poder passar em **vários telões ao
> mesmo tempo**. Este documento é o plano de trabalho, feito para começar logo depois das entregas F-275..F-279.

## 1. Como um telão de LED recebe imagem

| Tipo de controladora | Exemplos | Como a mídia chega | O que a SOBRE MÍDIA precisa |
|---|---|---|---|
| **Síncrona (sending card)** | Novastar MCTRL/VX, Colorlight S/X, Linsn, Huidu síncrona | O computador manda a imagem pela **HDMI/DVI**; a placa recorta um pedaço da tela do PC (ex.: 384×192 a partir de x=0,y=0) | Player no PC em tela cheia, desenhando **exatamente** no tamanho e na posição do pedaço que o processador lê |
| **Assíncrona (com memória)** | Novastar Taurus/TB, Colorlight A/C, Huidu HD-A | Arquivos enviados pela rede/USB e tocados pela própria placa | Fase 2: exportar a playlist no formato aceito (vídeo MP4 no tamanho do painel) e enviar pelo software da placa |
| **Box Android ligada no processador** | TV box/HDMI → processador | Igual à TV | Já funciona com o Player Android (5.7.10) |

A grande maioria dos painéis de loja e outdoor no Brasil usa controladora **síncrona com PC**. Por isso, o primeiro passo é o
**Player para computador**.

## 2. Fases

### Fase 1: Player para computador (Windows e Linux)
- Base: o player web que já existe (`src/components/player/PlayerEngine.tsx`, zonas em `ZonasDoPlayer.tsx`), empacotado como aplicativo
  de PC (Electron ou Tauri) com início automático, tela cheia, sem barra e com cache das mídias no disco (funciona sem internet).
- **Modo LED** na tela: largura e altura em pixels do painel (ex.: 448×256), **posição na saída de vídeo** (x, y), rotação,
  escolha de qual saída HDMI usar (PC com 2–4 saídas = 2–4 processadores), brilho por horário e fundo preto fora da área.
- Pareamento igual ao do Android (código na tela + painel), o mesmo contrato de playlist (`get_player_playlist_for_screen`), sem
  quebrar o Player 5.7.10 (`node scripts/ops/contrato-player.mjs`).

### Fase 2: Vários telões tocando juntos (sincronismo)
- Relógio comum: o player acerta a hora pelo servidor (diferença medida várias vezes, como no NTP).
- Cada item da playlist começa num **instante combinado** (época + duração): todas as telas do mesmo grupo trocam juntas.
- Grupo de telas no painel ("Telões do Shopping"): uma playlist, várias telas, cada uma com o seu tamanho (a mídia se adapta sem
  deformar, como os encartes em 7 tamanhos).
- **Videowall**: um vídeo grande dividido em pedaços (cada PC ou saída mostra a sua parte).

### Fase 3: Controladoras assíncronas e monitoramento
- Exportar a playlist como MP4 no tamanho exato do painel, para enviar pelo software da placa (ViPlex, LEDVISION, HDPlayer).
- Estudar as integrações abertas (SDK/LAN) de Novastar, Colorlight e Huidu, para enviar sem passar pelo software deles.
- Monitoramento: captura da tela do PC (prova de exibição), temperatura e brilho quando a placa informar.

## 3. Painel (o que muda para o cliente)
- Ao criar uma tela: **Tipo = Android | Computador | Telão de LED**.
- Telão de LED: tamanho em pixels, posição, quantas saídas, grupo de sincronismo e brilho por horário.
- As artes do Studio (encartes, palcos, modelos) já saem em vários tamanhos; o LED ganha **tamanho livre** (ex.: 1:3 de fachada).

## 4. Regras
- Nunca quebrar o Player Android 5.7.10 (contrato).
- Mídia própria passa pela mesma moderação.
- Sem custo novo de servidor: o PC baixa as mídias do mesmo R2 e guarda em cache.

## 5. Andamento
- **09/11/2026 — Fase 1 começou (F-281):** página `/led` no ar: painéis no tamanho/posição exatos, vários painéis, tela cheia, link para o modo quiosque do Chrome.

## 6. Próximo passo concreto
1. Protótipo do **Modo LED** no player web: rota `/player/led?w=448&h=256&x=0&y=0` desenhando a playlist no tamanho exato, com fundo preto.
2. Empacotar como aplicativo de PC com início automático e tela cheia.
3. Teste com um processador Novastar/Colorlight real (ou só com a área recortada da tela do PC, que é o que a sending card lê).
