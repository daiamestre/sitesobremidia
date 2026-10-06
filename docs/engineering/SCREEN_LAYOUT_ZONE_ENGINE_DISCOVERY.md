# SOBRE MÍDIA
# SCREEN LAYOUT & ZONE ENGINE
# RELATÓRIO DE DESCOBERTA ARQUITETURAL (MG-SLZ-00)

> Data: 05/10/2026 · Turno somente de leitura: **nenhuma tabela, função, tela do painel ou arquivo do Player foi alterado; nada foi commitado.**
> Fontes: banco de produção (definições vivas via `scripts/ops/sql.mjs`), código do repositório, `docs/PLAYER_CONTRACT.md`, `docs/PLAYER_REFERENCIA.md`, `AGENTS.md`, `docs/engineering/FINDINGS_LEDGER.md`.
> Marcações: `REUSABLE` (existe e serve) · `PARTIAL` (existe em parte) · `CHANGE REQUIRED` (precisa mudar) · `NOT FOUND` (não existe) · `UNVERIFIED` (sem evidência suficiente).

---

## 1. Resumo executivo

1. **Hoje não existe nenhum conceito de layout, zona ou composição** — nem no banco, nem no painel, nem no Player (`NOT FOUND`). Uma tela toca **uma playlist em tela cheia**.
2. **A base é boa para evoluir sem duplicar nada.** A playlist já aceita mídia, widget, pasta da Biblioteca e link, com duração, horário e dias por item. Por isso a proposta é: **uma zona recebe uma playlist**. Não é preciso criar um "segundo tipo de conteúdo" nem uma tabela de atribuição separada.
3. **O contrato do Player é aditivo e tolerante** (campos desconhecidos são ignorados e já existe o padrão de liberar novidade por versão do aparelho). Dá para entregar o layout só aos aparelhos que entendem, e os demais continuam exatamente como estão.
4. **O ponto crítico é o Player Android.** O palco de reprodução foi construído para camadas de tela cheia. Ele é parametrizável (dá para instanciar um palco por zona), mas a mudança toca sincronização, cache, banco local e limite de decodificadores de vídeo — estruturas protegidas pelo `AGENTS.md` §8. Classificação: **ALTERAÇÃO CRÍTICA**, com caminho legado intocado quando a tela não tem layout.
5. **Painel de rede, mapa do Brasil e "Nossos Clientes" não dependem do Player** e podem andar em trilha separada, reutilizando `screens`, `devices`, `pontos`, `clientes` e `empresas`.
6. **Recomendação: GO WITH CONDITIONS** (seção 31). A principal condição é concluir o teste em aparelho do Player 5.6.9, que está pendente, antes de empilhar outra mudança no Player.

Achados que não fazem parte do pedido, mas afetam o projeto (detalhes na seção 26):
- `docs/PLAYER_CONTRACT.md` descreve um formato de resposta diferente do que o banco devolve de fato.
- Existem três entidades parecidas com "tela": `screens` (20 linhas, a real), `telas` (0 linhas) e `players` (3 linhas).
- O campo `resolution` não guarda resolução de verdade (valores misturados: `16x9`, `9x16`, `1920x1080`, `1080x1920`) e `orientation` tem grafias diferentes (`landscape`, `LANDSCAPE`, `PORTRAIT`).
- 28 dos 30 aparelhos ativos não têm versão do Player registrada.
- `screens.cliente_id` está vazio em todas as 20 telas; o vínculo que existe é com o ponto (`ponto_id`, 10 telas).

---

## 2. Arquitetura atual

```text
PAINEL WEB (React + Vite, Vercel)
  src/pages/dashboard/Screens.tsx, ScreenDetails.tsx, components/screens/ScreenDialog.tsx
  src/pages/dashboard/Playlists.tsx, Medias.tsx, Biblioteca.tsx, Widgets.tsx, DashboardHome.tsx
        ↓ supabase-js (leitura/gravação direta com RLS) + RPCs
BANCO (Supabase / Postgres, projeto bhwsybgsyvvhqtkdqozb)
  screens ── playlist_id ──> playlists ──< playlist_items ──> media | widgets | biblioteca_pastas | external_links
  devices (aparelho pareado: screen_id, identity_hash) · device_health · remote_commands · app_releases
  pontos (estabelecimento) · clientes · empresas · campanhas · ponto_anuncios
        ↓ RPC get_player_playlist_for_screen(p_identifier, p_device_id)  [SECURITY DEFINER]
        ↓ Realtime (playlist_items, playlists, screens, remote_commands) + consulta a cada 60 s
PLAYER ANDROID (native-android-player, Kotlin, Media3 1.2.1, Room 2.6.1)
  sync-network  → RemoteDataSource, DTOs, RealtimeManager, HeartbeatManager
  app/data      → PlayerRepositoryImpl (baixar → validar → trocar de uma vez)
  cache-manager → arquivos + SHA-256 + Room (playlist, media_item, logs)
  app/playback  → PlaybackStage (2 vídeos + 2 imagens em revezamento + 1 contêiner de widget)
  app/util      → NativeWidgetEngine (widgets nativos), OTAUpdateManager
PLAYER WEB (src/components/player/PlayerEngine.tsx — protegido)
```

Funções de borda ligadas a conteúdo: `sports-engine-sync`, `news-engine-sync`, `fetch-rss`, `conteudo-automatico`, `process-media`, `get-upload-url`, `delete-media-object`. Nenhuma trata layout.

---

## 3. Arquitetura da Tela

| Item | Situação atual (evidência) |
|---|---|
| Tabela | `public.screens` (20 linhas). PK `id uuid`. |
| Empresa (tenant) | `empresa_operadora_id` → `empresa_operadora` (preenchido por gatilho `trg_screens_empresa_padrao`). |
| Dono | `user_id` (quem criou). |
| Estabelecimento | `ponto_id` → `pontos` (10 de 20 preenchidas). Também há texto livre: `location`, `local_instalacao`, `cidade`, `estado`, `endereco_instalacao`. |
| Cliente | `cliente_id` → `clientes` — **0 de 20 preenchidas**. |
| Playlist | `playlist_id` → `playlists` (8 de 20 com playlist) e `saved_playlist_id`. |
| Aparelho | `bound_device_id` (hash do aparelho; 5 telas pareadas) e, do outro lado, `devices.screen_id`. `player_id` → `players` (legado). |
| Formato | `resolution` (texto) e `orientation` (texto). Sem largura/altura numéricas. |
| Estado | `is_active`, `status`, `last_ping_at`, `bloqueada_por_inadimplencia`, `status_grade`, `tipo_tela` (`PROPRIA`/`PARCEIRA`). |
| Onde cria/edita | `ScreenDialog.tsx` (escolhe só `16x9` ou `9x16` e deriva a orientação), `Screens.tsx`, `ScreenDetails.tsx`, `useScreens.ts`. |
| Onde pareia | `DevicePairingScreen.tsx`, RPCs `fn_request_pairing_code`, `fn_link_device_to_screen`, `admin_unpair_screen`. |
| Onde monitora | `DashboardHome.tsx` (RPC `fn_dashboard_resumo_owner` / `_gestor`, `fn_alertas_dispositivos`), `ScreenDetails.tsx`. |
| Tabelas parecidas | `telas` (0 linhas, modelo antigo do ERP) e `players` (3 linhas). **Não usar como base**; a autoridade é `screens`. |

---

## 4. Arquitetura da Playlist

- **Relação Tela → Playlist: N para 1.** Cada tela aponta para uma playlist; a mesma playlist pode servir várias telas. Evidência: 3 playlists estão em 2 telas cada, 2 playlists em 1 tela. `REUSABLE`.
- **Ordem:** `playlist_items.position`. **Duração:** `duration` por item (vídeo usa a duração real via `fn_media_duracao_item`).
- **Agenda por item:** `start_time`, `end_time`, `days` — já chega ao Player (`days_of_week`). `REUSABLE`.
- **Agenda por tela:** `screen_schedules` existe (com `priority`), mas tem **0 linhas** e não entra na função do Player. `PARTIAL` (não está em uso).
- **Prioridade entre playlists:** `NOT FOUND` no caminho do Player.
- **Vínculo com campanha/anúncio:** os anúncios pagos de pontos parceiros (`ponto_anuncios`, status `ATIVO`) são **acrescentados ao final da playlist da tela** pela própria função do Player (posição 100000+). Gatilhos `fn_campanhas_touch_playlists` e `fn_ofertas_touch_playlists` avisam as playlists quando campanha/oferta muda.
- **Pasta inteira na playlist:** `biblioteca_pasta_id` (rodízio no Player 5.6.8+).
- **Gravação:** `fn_save_playlist_items`. RLS por dono (`user_id`) e administrador da empresa.

Conclusão: a playlist já é o "contêiner de conteúdo" completo. Uma zona pode apontar para uma playlist sem duplicar nada.

---

## 5. Arquitetura de Conteúdo

- **Minhas Mídias:** `media` (432 linhas) — `file_url` (R2), `file_type`, `file_hash`, `duration_ms`, `aspect_ratio`, `processing_status`, `user_id`.
- **Biblioteca (acervo oficial):** mesma tabela `media` com `biblioteca = true`, organizada em `biblioteca_pastas` (com `conteudo_automatico`). Visibilidade por `fn_media_biblioteca_visivel`.
- **Caminho até a tela:** `media` → `playlist_items` → `playlists` → `screens.playlist_id` → Player. Uma mídia nunca é copiada; a playlist referencia. `REUSABLE`.
- **Moderação própria** (20 s anunciante, 30 s gestor) roda no envio. Continua valendo para qualquer zona.

---

## 6. Arquitetura de Widgets

- **Armazenamento:** `widgets` (`widget_type`, `config jsonb`, `is_active`, `thumbnail_url`, `user_id`). Em uso hoje: `clock`, `weather`, `sports`, `instagram` (7 widgets). O catálogo do código (`src/lib/widgetCatalog.ts`) cobre também notícias (RSS), esportes news, oferta, publicidade, QR, YouTube, social e institucional.
- **Como entra na tela:** como **item de playlist** (`playlist_items.widget_id`). Ou seja, o widget já é "conteúdo independente" com duração própria. `REUSABLE`.
- **Como chega ao Player:** dentro do item, com `config` já resolvido no servidor (`fn_widget_config_resolvido`). Trava por versão do aparelho: `fn_widget_suportado_no_aparelho`.
- **Como é desenhado:** `NativeWidgetEngine.renderWidget(context, container, …)` mede o **contêiner que recebe** e desenha proporcionalmente (regra do projeto: tamanhos relativos, igual à prévia web com `cqmin`). Isso é favorável: o mesmo motor pode desenhar dentro de uma zona menor. `REUSABLE` (com validação visual por tamanho de zona — `UNVERIFIED` para zonas muito estreitas, como uma faixa de rodapé).
- **Fundo:** cada widget aceita imagem de fundo. Não existe "fundo de tela" compartilhado entre conteúdos (`NOT FOUND`).
- **Loterias:** não é widget; é conteúdo automático da Biblioteca (pasta com artes geradas pelo robô).

---

## 7. Arquitetura do Painel (Dashboard)

- `DashboardHome.tsx` usa `fn_dashboard_resumo_owner` (telas: total, online, offline, sem playlist, lista de offline) e `fn_dashboard_resumo_gestor`; alertas por `fn_alertas_dispositivos` (F-141).
- Online/offline vem de `devices.last_heartbeat` / `screens.last_ping_at`; saúde detalhada em `device_health` (inclui `media_count`, `pending_media_count`, `last_sync_at`, `screen_width/height`, `screen_orientation`).
- **Agrupamento por estabelecimento** ("Mercado Silva — 6 telas, 5 online"): `NOT FOUND` como visão pronta; os dados existem (`screens.ponto_id` → `pontos`).
- **Mídias por tela:** dá para obter contando os itens da playlist da tela; o aparelho também informa `media_count`.
- **Zonas por tela:** `NOT FOUND` (não existe zona).

---

## 8. Arquitetura do Player Android

Respostas às 27 perguntas, com a evidência:

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Onde a tela é identificada? | `SessionManager.currentUUID` / `currentUserId` (custom_id), gravados após o pareamento ou escolha em `ScreenSelectionActivity`. |
| 2 | Como sabe qual tela executa? | Envia o identificador da tela + hash do aparelho à RPC; o servidor confere o vínculo (`bound_device_id`, `devices`). |
| 3 | Como a playlist chega? | RPC `get_player_playlist_for_screen` via `RemoteDataSource.getPlaylistForScreen`. |
| 4 | Onde é guardada? | Room: tabelas `playlist` e `media_item` (`cache-manager`). |
| 5 | Como as mídias são baixadas? | `syncContent` + `MediaDownloader`/`MediaDownloadWorker`; arquivo validado por hash (`doesFileExistAndMatchHash`). |
| 6 | Como sabe qual mídia tocar? | Lista ordenada vinda do cache, filtrada por horário/dias (`SchedulingEngine`). |
| 7 | Como decide a ordem? | `orderIndex` (= `position`), com rodízio de pasta por `grupo` (`RodizioDePastas`). |
| 8 | Existe modelo de layout? | `NOT FOUND`. |
| 9 | Existe abstração de zona? | `NOT FOUND`. |
| 10 | Existe estrutura de composição? | Só camadas empilhadas em tela cheia (`activity_main.xml`). |
| 11 | Onde o renderizador é criado? | `MainActivity` cria dois `ExoPlayerRenderer` e monta `PlaybackStage(layers, r1, r2, hooks)`. |
| 12 | Há só uma superfície? | Duas de vídeo (`playerView1/2`, revezamento) e duas de imagem (`static_image_layer/2`), **todas em tela cheia e sobrepostas**; uma por vez fica visível. |
| 13 | Como o ExoPlayer trabalha? | Dois players: um toca, o outro pré-carrega o próximo vídeo; troca com dissolução (F-56). |
| 14 | Imagens e vídeos? | Vídeo no `PlayerView` (modo FIT); imagem via Glide nas camadas de imagem. |
| 15 | Widgets? | `NativeWidgetEngine` desenha em `native_widget_container` (acima das mídias). |
| 16 | Orientação? | Vem da resolução da **playlist** (soberana) com a orientação da tela como reserva (`PlaylistOrientation.fromResolutionOrOrientation`); trava a rotação da atividade. |
| 17 | Escala? | `PresentationResolver`: encaixa sem cortar nem esticar (barras laterais ou superiores). Só conhece **dois formatos: 16:9 e 9:16**. |
| 18 | Resolução? | Não há resolução lógica; usa o tamanho real do visor. Em TV, `tvCanvasTransform` gira/redimensiona a tela inteira. |
| 19 | Reação a mudança de configuração? | Compara uma assinatura da playlist (`PlayerFlowPolicy.configSignature`: itens, duração, horário, dias); se mudou, reinicia o ciclo de reprodução. |
| 20 | Como a publicação nova chega? | Aviso em tempo real (mudança em `playlist_items`) + consulta em segundo plano a cada 60 s (`scheduleNextBackgroundSync`). |
| 21 | Como detecta que mudou? | Pela assinatura acima e pela integridade do cache. |
| 22 | Como volta atrás (rollback)? | Não há versão anterior guardada. Se o servidor devolver lista vazia ou falhar, **mantém o cache atual** (`PAYLOAD_INTEGRITY`). Voltar conteúdo = republicar. `PARTIAL`. |
| 23 | Reprodução durante a sincronização? | Sim: baixa, valida e só então troca de uma vez; a reprodução segue pelo cache. |
| 24 | Suporta várias superfícies simultâneas? | Não hoje. O `PlaybackStage` é parametrizado por `Layers` e pelos dois renderizadores, então **pode ser instanciado mais de uma vez** — mas isso nunca foi exercitado. `UNVERIFIED` em aparelho. |
| 25 | Mudança mínima necessária? | Um contêiner de zonas; um `PlaybackStage` por zona; sincronização/cache/Room por zona; limpeza de arquivos considerando todas as zonas; assinatura incluindo o layout; escala para proporção qualquer. |
| 26 | Quebra algo homologado? | Não, **se** a tela sem layout continuar no caminho atual sem tocar nele. O risco real está no código compartilhado (cache, limpeza, Room). |
| 27 | Dá para evoluir sem mudar a autoridade de reprodução? | Sim. O servidor só descreve **onde** cada zona fica e **qual playlist** ela toca; **como** tocar continua sendo decisão do Player. |

Outros fatos relevantes:
- Limite de decodificação: `HardwareConstraintManager` limita a 1920 px e 15 Mbps nos aparelhos comuns e libera 4K só no perfil de alto desempenho (`ChipsetDetector`). Quantos vídeos simultâneos cada TV Box aguenta: `UNVERIFIED` (depende do chip).
- Banco local: Room na versão 12 com migrações explícitas, **mas ainda com `fallbackToDestructiveMigration()`** — qualquer mudança de esquema sem migração apaga o cache das telas.
- Limpeza: a sincronização calcula os "arquivos oficiais" a partir da playlist única e remove o resto. Com zonas, isso apagaria as mídias das outras zonas se não for ajustado. **Risco alto.**
- Regra "REPRODUZINDO = SÓ MÍDIA" (F-27, F-43, F-44): nenhuma mensagem administrativa sobre a área de reprodução. A proposta não cria avisos; zona sem conteúdo fica preta.
- Testes JVM existentes: 40 arquivos de teste no Player (F-56, F-45…F-53, etc.).
- Pendência: Player 5.6.9 gerado e **aguardando teste em aparelho**; a frota registrada está na 5.6.8 ou sem versão informada.

---

## 9. Arquitetura do Banco

| Tabela | Papel | Linhas | Observação |
|---|---|---|---|
| `screens` | Tela (autoridade) | 20 | por empresa |
| `devices` | Aparelho pareado | 32 (30 ativos) | `screen_id`, `identity_hash`, dimensões do visor |
| `device_health` | Saúde/telemetria | — | `media_count`, `last_sync_at` |
| `playlists` / `playlist_items` | Conteúdo ordenado | 15 / 46 | por dono |
| `media` | Mídias + Biblioteca | 432 | R2 |
| `widgets` | Widgets | 7 | `config jsonb` |
| `screen_schedules` | Agenda por tela | 0 | fora do caminho do Player |
| `pontos` | Estabelecimento / ponto | 25 | endereço, `latitude`, `longitude` |
| `clientes` / `empresas` | Cliente e dados cadastrais | 218 / 193 | endereço em `empresas` |
| `app_releases` | Versões do Player | — | OTA |
| `telas`, `players` | Modelos antigos | 0 / 3 | não usar |

Índices úteis já existentes: `idx_screens_ponto`, `screens_cliente_idx`, `idx_screens_codigo_tenant`, `idx_devices_screen_id`, `idx_devices_identity_hash_unique`.
Tempo real publicado para: `playlists`, `playlist_items`, `screens`, `remote_commands` (entre outras).

---

## 10. Arquitetura de Acesso (RLS)

- **`screens`:** leitura por dono, por empresa ou administrador; alteração/exclusão por `fn_player_can_access_screen` **e** pela regra restritiva `fn_perfil_sem_gestao_de_telas` (anunciante, cliente, parceiro, representante e gestor só mexem nas telas que eles mesmos criaram); tela parceira só é excluída por dono/administrador.
- **`playlists`, `playlist_items`, `widgets`, `media`:** por dono (`user_id`) + administrador da empresa (`fn_admin_da_empresa_do_usuario`). Biblioteca com regra própria.
- **`devices`:** quem tem acesso à tela do aparelho.
- **Player:** não lê tabelas; usa RPCs `SECURITY DEFINER` que conferem tela, aparelho, empresa e situação financeira.
- Pendência conhecida (memória do projeto): o perfil GESTOR é tratado como equipe interna em 28 regras; decisão do proprietário em aberto. Afeta quem poderá editar layout.

---

## 11. Contratos atuais

**Resposta real** de `get_player_playlist_for_screen(p_identifier text, p_device_id text)` (definição viva, 285 linhas):

```text
{ status: SUCCESS | DEVICE_ACCESS_DENIED | SCREEN_NOT_FOUND | SCREEN_SUSPENDED | SCREEN_ACCESS_DENIED
          | DEVICE_REVOKED | DEVICE_ALREADY_BOUND | NO_PLAYLIST_ASSIGNED | PLAYLIST_NOT_FOUND | PLAYLIST_EMPTY,
  data: { id, name, custom_id, is_active, playlist_id, orientation, resolution,
          playlists: { id, name, resolution, playlist_resolution, audio_enabled,
                       playlist_items: [ { id, position, duration, start_time, end_time, days_of_week, grupo?,
                                           media: {id, name, file_url, file_type, file_hash} | null,
                                           widget: {id, name, widget_type, config} | null } ] } } }
```

- Itens = itens da playlist + mídias de pastas da Biblioteca (com `grupo`) + anúncios ativos do ponto (posição 100000+).
- Consumidor: `RemotePlaylist`, `RemotePlaylistItem`, `RemoteMedia`, `RemoteWidget` (`sync-network/dto/RemoteDTOs.kt`), com valores padrão e campos opcionais.
- **Divergência:** `docs/PLAYER_CONTRACT.md` descreve `device` e `playlist.items` com `url`/`sha256`/`title`. O banco devolve `data.playlists.playlist_items` com `file_url`/`file_hash`/`name`. O documento está desatualizado (`CHANGE REQUIRED` no documento, não no sistema).
- Outros contratos: `get_authorized_screens_for_player`, `fn_request_pairing_code`, `fn_check_pairing_status`, `fn_link_device_to_screen`, `admin_unpair_screen`, `player_unpair_screen`, `fn_device_heartbeat_v2`, `pulse_screen`, `fn_player_report_telemetry`, `fn_player_minha_marca`, tabela `app_releases`, `remote_commands`.
- Padrão de compatibilidade já usado (W11/W12): novidade só para aparelho com versão conhecida e suficiente (`fn_widget_suportado_no_aparelho`); versão desconhecida = não recebe.

---

## 12. Análise de lacunas

| Necessidade | Já existe? | Onde? | Reutilizável? | Lacuna |
|---|---|---|---|---|
| Tela | Sim | `screens` | `REUSABLE` | — |
| Estabelecimento | Sim | `pontos` | `REUSABLE` | metade das telas sem `ponto_id` |
| Cliente | Sim | `clientes` + `empresas` | `REUSABLE` | `screens.cliente_id` vazio |
| Conteúdo ordenado com agenda | Sim | `playlists` / `playlist_items` | `REUSABLE` | — |
| Widget como conteúdo | Sim | `playlist_items.widget_id` | `REUSABLE` | validar em zonas pequenas |
| Layout da tela | Não | — | — | `NOT FOUND` |
| Zona | Não | — | — | `NOT FOUND` |
| Conteúdo por zona | Não | — | — | resolver com "zona → playlist" |
| Resolução real / tela sob medida | Em parte | `screens.resolution` (texto), `devices.screen_width/height` | `PARTIAL` | campos numéricos de tela (canvas) |
| Escala/encaixe | Em parte | `PresentationResolver` (16:9 e 9:16) | `CHANGE REQUIRED` | proporção qualquer; modos cobrir/esticar |
| Editor visual (arrastar, redimensionar) | Não | — | — | `NOT FOUND` (nenhuma biblioteca de arrastar/desenho no `package.json`) |
| Prévia fiel ao Player | Sim (widgets) | `WidgetPreview`, regra `cqmin` | `REUSABLE` | prévia de composição |
| Publicação | Implícita | gravar = publicar | `PARTIAL` | não há rascunho/versão |
| Entrega ao Player | Sim | RPC + tempo real + 60 s | `REUSABLE` | campo aditivo `layout` |
| Várias superfícies no Player | Não | `PlaybackStage` (parametrizável) | `CHANGE REQUIRED` | contêiner de zonas |
| Cache/banco local por zona | Não | Room v12 | `CHANGE REQUIRED` | migração + limpeza |
| Prova de exibição por zona | Não | `play_logs`, `registerPlayProof` | `CHANGE REQUIRED` | identificar a zona |
| Painel por estabelecimento | Em parte | `fn_dashboard_resumo_owner` | `PARTIAL` | agrupar por ponto |
| Mapa do Brasil | Não | `pontos.latitude/longitude` (5 de 23), cidade/UF | `PARTIAL` | componente de mapa; coordenadas |
| "Nossos Clientes" público | Não | `clientes.brand_logo_url`, `empresas.nome_fantasia` | `PARTIAL` | autorização de exibição pública |
| Painel LED / controladora | Não | — | — | `NOT FOUND` (perfil de display) |

---

## 13. Motor de Layout proposto

Princípio: **o layout diz onde; a playlist diz o quê; o Player decide como tocar.**

```text
screens (existente)
   └─ layout_id (novo, opcional) ──> screen_layouts (novo)
                                        └─< layout_zones (novo) ── playlist_id ──> playlists (existente)
```

**`screen_layouts`** (novo — indispensável, não há onde guardar isso hoje)
- Finalidade: a composição espacial (a "planta") de uma tela.
- Campos: `id` (PK), `empresa_operadora_id` (FK), `nome`, `largura_px`, `altura_px` (a tela lógica em pixels), `cor_fundo`, `versao` (inteiro, sobe a cada publicação), `status` (`RASCUNHO`/`PUBLICADO`), `created_by`, `created_at`, `updated_at`, `deleted_at`.
- Relação: `screens.layout_id` (nulo = tela legada em tela cheia). Um layout pode servir várias telas do mesmo formato — **decisão em aberto** (seção 27): layout por tela ou modelo reutilizável.
- Ciclo de vida: rascunho → publicado; alterar um publicado gera nova versão; exclusão lógica.
- RLS: mesma regra de `screens` (empresa + `fn_perfil_sem_gestao_de_telas`). Sem nova autoridade.
- Auditoria: trilha já usada no projeto (`created_by`/`updated_by` + registro de evento).
- Impacto no ERP: nenhum (contratos, cobranças e campanhas não mudam).
- Impacto no Player: campo novo e opcional na resposta, só para versão compatível.

---

## 14. Motor de Zonas proposto

**`layout_zones`** (novo)
- Campos: `id` (PK), `layout_id` (FK, cascata), `numero` (1..N, único por layout), `nome`, `x`, `y`, `largura`, `altura` (inteiros, em pixels da tela lógica), `ordem_z`, `rotacao` (0/90/180/270), `visivel`, `travada` (só para o editor), `modo_encaixe` (`CONTER`/`COBRIR`/`ESTICAR`), `principal` (booleano, uma por layout), `playlist_id` (FK → `playlists`, nulo = zona vazia), `audio` (booleano; no máximo uma zona com som).
- Regras no banco: zona dentro dos limites da tela lógica; `numero` único; uma única zona `principal`; no máximo uma com `audio`.
- **Por que não criar `zone_content_assignment`:** a playlist já aceita mídia, widget, pasta e link, com duração e agenda por item. Uma tabela de atribuição repetiria isso e criaria uma segunda fonte de verdade para "o que toca". Arrastar uma mídia para a zona = acrescentar um item à playlist da zona (criada automaticamente na primeira vez). Arrastar um widget = idem. Arrastar uma playlist pronta = apontar a zona para ela.
- **Zona principal = a playlist atual da tela.** A zona marcada como `principal` usa `screens.playlist_id`. Assim os anúncios pagos do ponto (que hoje entram no fim da playlist da tela) continuam indo para um lugar definido, e o Player antigo continua tocando essa mesma playlist em tela cheia.
- RLS: herda do layout. A playlist de cada zona continua com a regra própria de playlists.

---

## 15. Motor de Resolução

- Hoje: `resolution` é um rótulo de formato (`16x9`/`9x16`), não uma resolução. `PARTIAL`.
- Proposta (aditiva): a resolução real passa a morar em `screen_layouts.largura_px/altura_px`. Para a tela física, um **perfil de display** em `screens` (colunas novas e opcionais): `largura_fisica_mm`, `altura_fisica_mm`, `passo_pixel_mm` (LED), `tipo_superficie` (TV, totem, celular, PC, LED interno, LED externo, videowall). Não criar tabela nova para isso enquanto não houver cadastro de controladoras.
- `resolution` e `orientation` atuais **não mudam** (o Player e o painel dependem deles). A orientação continua derivada do formato.
- Coordenadas das zonas em **pixels inteiros da tela lógica**; o Player converte para o visor real com uma única escala (mesma regra de hoje: encaixar sem distorcer). Percentual e proporção são derivados no editor, não gravados.
- Suporta 1920×1080, 3840×2160, 1080×1920, 1920×960, 3840×960 e qualquer formato sob medida.

---

## 16. Estratégia para LED

- Em painel LED, a controladora normalmente recebe a imagem de um computador ou aparelho Android pela saída de vídeo e mapeia os pixels para os módulos. Para o sistema, isso é "um visor com resolução sob medida". Modelo e forma de ligação das controladoras do projeto: `UNVERIFIED` (não há nenhum cadastro nem código sobre isso).
- O mesmo modelo atende: TV, totem, celular, PC, LED interno/externo e videowall = `screen_layouts` com a resolução em pixels + zonas em pixels. Exemplo do pedido (1920×960 com zonas 1440×700, 480×700 e 1920×260) cabe sem adaptação.
- Dimensão física e passo de pixel entram só como dado do perfil de display (distância de leitura, relatórios). Não mudam a renderização.
- Videowall com vários aparelhos (um por coluna de telas) fica fora do primeiro ciclo: exigiria sincronismo de relógio entre aparelhos (`NOT FOUND`).

---

## 17. Estratégia de integração com o Player

**Contrato (evolução mínima e aditiva):** a resposta atual fica idêntica; entra um campo opcional `data.layout`, enviado **somente** a aparelho com versão conhecida e suficiente (nova função no padrão de `fn_widget_suportado_no_aparelho`):

```text
data.layout: { id, versao, largura, altura, cor_fundo,
               zonas: [ { id, numero, x, y, largura, altura, ordem_z, rotacao, modo_encaixe, principal, audio,
                          playlist: { …mesmo formato de data.playlists… } | null } ] }
```

- `data.playlists` continua sendo a playlist principal. Player antigo: ignora `layout` (ou nem recebe) e segue em tela cheia.
- A zona principal aponta para a mesma playlist de `data.playlists` (sem repetir os itens: referência por `id`).

**No Android (mudança mínima, por etapas):**
1. Contêiner de zonas acima de `main_engine_layer`, criado só quando há `layout`. Sem layout, nada muda.
2. Um `PlaybackStage` por zona, cada um com as suas camadas dentro do retângulo da zona.
3. Vídeo: por padrão **uma única zona com vídeo e som** (a principal). Nas demais, vídeo só se o aparelho declarar capacidade; caso contrário a zona pula o vídeo. A capacidade é medida no aparelho de teste antes de liberar.
4. Sincronização: baixar e validar as mídias de **todas** as zonas antes da troca atômica; a lista de "arquivos oficiais" da limpeza passa a ser a união das zonas.
5. Banco local: coluna de zona em `playlist`/`media_item` com **migração Room explícita** (12 → 13).
6. Assinatura de configuração inclui o layout (posição/tamanho/versão), para a troca acontecer sem reiniciar o aplicativo.
7. `PresentationResolver` passa a aceitar proporção qualquer, mantendo o comportamento atual para 16:9 e 9:16 (testes existentes continuam valendo).
8. Prova de exibição leva o identificador da zona (campo opcional).

**Classificação do impacto no Player**
- Tela sem layout: **SEM ALTERAÇÃO** de comportamento.
- Contrato/DTOs: **ALTERAÇÃO MÍNIMA** (campo opcional).
- Escala e desenho de widgets em zona: **ALTERAÇÃO MODERADA**.
- Palco por zona, sincronização, cache, limpeza e Room: **ALTERAÇÃO CRÍTICA** (estruturas protegidas pelo `AGENTS.md` §8; exige teste em emulador nos dois perfis e em aparelho real, e canário antes do OTA).

Player web (`PlayerEngine.tsx`, protegido): fica em tela cheia no primeiro ciclo; se for necessário para a prévia, a prévia de composição do painel cumpre esse papel.

---

## 18. Compatibilidade com o que já existe

| Cenário | Resultado esperado |
|---|---|
| A — tela atual sem layout | Resposta idêntica à de hoje; Player inalterado. |
| B — layout de 1 zona (principal, tela inteira) | Igual à tela cheia tradicional. |
| C — 2 zonas | Cada zona toca a sua playlist; som só na principal. |
| D — 4 zonas | Idem; limite de vídeo simultâneo respeitado. |
| E — widget + mídia + playlist | Todos são playlists (de 1 item ou mais); sem caso especial. |
| F — LED sob medida | Layout com a resolução do painel; escala única. |
| G — layout alterado remotamente | Nova versão chega pelo ciclo normal (tempo real/60 s); baixa o que falta, troca de uma vez; reprodução não para. |
| Aparelho antigo numa tela com layout | Toca a playlist principal em tela cheia (degradação previsível). O painel deve avisar "este aparelho não mostra as zonas; atualize o Player". |

Não há migração obrigatória das 20 telas atuais. O caminho "tela legada = tela cheia" é o correto e foi confirmado pelo código.

---

## 19. Evolução do Painel

Tudo com dados existentes, por uma RPC nova de leitura (agrupada por `ponto_id`):

| Indicador | Origem |
|---|---|
| Telas por estabelecimento | `screens` agrupadas por `ponto_id` → `pontos.nome` |
| Online / offline | mesma regra de `fn_dashboard_resumo_owner` (último sinal em `devices`/`screens`) |
| Mídias por tela | contagem de itens das playlists da tela (principal + zonas) |
| Zonas por tela | contagem em `layout_zones` (0 ou 1 para tela legada) |
| Último sinal / última sincronização | `devices.last_heartbeat`, `device_health.last_sync_at` |
| Problemas | `fn_alertas_dispositivos`, `device_health.playback_error_count`, `pending_media_count` |

Pré-requisito de dados: preencher `ponto_id` nas telas que ainda não têm (10 de 20). Sem isso elas aparecem como "sem estabelecimento".

---

## 20. Mapa do Brasil (Rede SOBRE MÍDIA)

- Sem entidade nova. Pontos no mapa = `pontos` (estabelecimentos) e/ou `clientes` via `empresas` (endereço).
- Situação dos dados: `pontos` com latitude/longitude: 5 de 23; com cidade: 9. `empresas` com cidade: 192 de 193; com CEP: 113; sem colunas de coordenada.
- Estratégia: primeiro por **cidade/UF** (um marcador por cidade, com contagem), usando uma tabela estática de coordenadas de municípios; coordenada exata só onde já existe. Sem serviço pago de geocodificação.
- Componente de mapa: `NOT FOUND` no projeto. Opção de menor risco: SVG do Brasil próprio, sem dependência externa nem marca de terceiros.

---

## 21. Nossos Clientes

- Fonte: `clientes` (+ `empresas.nome_fantasia`, `clientes.brand_logo_url`, cidade/UF).
- Falta: **autorização de exibição pública** (`NOT FOUND`). Proposta: uma coluna booleana em `clientes` (padrão desligado) e uma RPC pública que devolve **somente** nome fantasia, logo, cidade e UF dos autorizados.
- Nunca expor: valores, contratos, CNPJ, e-mail, telefone, endereço completo, telas, aparelhos, IP.
- A tela inicial é pública (sem login); a RPC precisa ser segura por construção (lista fixa de campos, sem filtros livres) e testada com usuário anônimo.

---

## 22. Segurança

| # | Pergunta | Proposta (sem nova autoridade) |
|---|---|---|
| 1–3 | Criar/editar layout e zonas | Quem hoje pode alterar a tela: dono, administrador e quem criou a tela (regra de `screens`). |
| 4 | Atribuir conteúdo | Quem pode editar a playlist da zona (regra de `playlists`). |
| 5 | Publicar | Mesmo de 1–3. |
| 6 | Ver telas | Regra de leitura atual de `screens` (empresa). |
| 7 | Ver métricas | Perfis que já veem o painel (`cardsDoPerfil`). |
| 8 | Alterar painel LED / perfil de display | Dono e administrador. |
| 9 | Configuração do Player | Dono e administrador (como hoje nos comandos remotos). |
| 10 | Ver o mapa | Interno: dono/administrador. Público: só cidades e clientes autorizados. |
| 11 | Autorizar cliente em público | Dono e administrador. |

Anunciante e ponto parceiro não editam layout. O que o anunciante paga continua entrando pela playlist principal. Pendência que influencia: definição do perfil GESTOR (equipe ou cliente).

---

## 23. Desempenho

- **Consulta do Player:** cada aparelho chama a RPC a cada 60 s. Com 10.000 telas são ~170 chamadas por segundo de uma função com várias subconsultas — isso já seria o gargalo **hoje**, sem zonas. Estratégia: o aparelho envia a versão que já tem e o servidor responde "sem mudança" sem montar a lista (campo opcional; aparelho antigo segue como está).
- **Zonas:** N playlists por tela multiplicam o trabalho da RPC; limitar zonas por layout (sugestão: 8) e montar tudo numa única chamada.
- **Aparelho:** memória de imagem por zona (Glide), decodificadores de vídeo e aquecimento. Limite de vídeo simultâneo e teste térmico em TV Box.
- **Tempo real:** um canal por aparelho; em escala nacional o limite do plano do Supabase precisa ser conferido (`UNVERIFIED`).
- **Painel:** agregação por estabelecimento no banco (uma RPC), nunca tela por tela no navegador; atualização por intervalo, não por linha.
- **Armazenamento:** telemetria e provas de exibição crescem com zonas; já existe retenção (F-123).

---

## 24. Estratégia de testes

| Camada | O que testar |
|---|---|
| Unidade (web, vitest) | geometria (limites, sobreposição, encaixe, escala), conversão pixel ↔ tela, validação do layout |
| Banco | regras das tabelas novas; simulação com reversão por perfil (dono, administrador, gestor, anunciante, outra empresa) |
| Contrato | resposta da RPC **idêntica** para tela sem layout (comparação antes/depois nas 5 telas de referência — `comparar-telas.mjs`); `layout` ausente para aparelho antigo |
| Painel (navegador) | editor em computador, tablet e celular; prévia igual ao Player |
| Android (JVM) | DTO com e sem `layout`; assinatura; limpeza por união de zonas; migração Room; escala em proporção qualquer; testes atuais intactos |
| Emulador | perfis celular e TV; 1, 2 e 4 zonas; troca de layout com a reprodução rodando; sem rede |
| Aparelho real | TV Box e tablet: vídeo simultâneo, temperatura, memória, 24 h |
| Ponta a ponta | criar tela → layout → zonas → conteúdo → publicar → aparelho → prova de exibição → painel |

---

## 25. Estratégia de migração

- Só mudanças aditivas: 2 tabelas novas, colunas opcionais em `screens`, 1 coluna em `clientes`, funções novas. Nenhuma coluna existente muda de tipo ou significado.
- Função do Player: partir da definição **viva** (receita `migracao-segura`), acrescentar o bloco `layout` condicionado à versão, provar resposta idêntica para as telas atuais.
- Dados: nenhuma tela é convertida automaticamente. Layout nasce quando o usuário cria.
- Android: Room 12 → 13 com `Migration` explícita.
- Reversão: remover `screens.layout_id` das telas (voltam a tela cheia) e, se necessário, desligar o bloco na função.

---

## 26. Riscos

| Risco | Gravidade | Mitigação |
|---|---|---|
| Limpeza de cache apagar mídias de outras zonas | Alta | lista oficial = união das zonas; teste JVM dedicado |
| Mudança no Room sem migração apaga o cache das telas | Alta | migração explícita + teste de migração |
| Vários vídeos simultâneos travarem TV Box | Alta | uma zona de vídeo por padrão; capacidade medida em aparelho |
| Empilhar mudança sobre o Player 5.6.9 ainda não testado em aparelho | Alta | concluir o canário da 5.6.9 antes |
| 28 de 30 aparelhos sem versão registrada | Média | versão desconhecida não recebe layout; corrigir o registro de versão |
| Documento de contrato desatualizado induzir erro | Média | corrigir `docs/PLAYER_CONTRACT.md` no MG-SLZ-01 |
| Rótulos de resolução/orientação inconsistentes | Média | não reaproveitar esses campos para resolução real |
| Telas sem estabelecimento | Média | preencher `ponto_id` antes do painel por rede |
| Anúncio pago cair numa zona pequena | Média | anúncios sempre na zona principal (regra no banco) |
| Carga da RPC em escala | Média | resposta "sem mudança" por versão |
| Exposição de dados em "Nossos Clientes" | Alta | RPC com lista fixa de campos + teste anônimo |
| Editor visual complexo em celular | Baixa | editor completo em computador/tablet; celular só visualiza e troca conteúdo |

---

## 27. Perguntas em aberto (decisão do proprietário)

1. Layout **por tela** ou **modelo reutilizável** (um layout servindo várias telas do mesmo formato)?
2. Anúncios pagos entram **só na zona principal**? Ou o anunciante poderá comprar uma zona específica?
3. Vídeo em **mais de uma zona** ao mesmo tempo é requisito? E o som, sempre só de uma?
4. A **prova de exibição** (que alimenta relatórios e cobrança) precisa ser por zona?
5. O **Player web** precisa mostrar zonas, ou só o Android?
6. "Nossos Clientes": quem autoriza a exibição (o cliente, no contrato? o dono?), e o que aparece (logo, nome, cidade)?
7. O mapa é **público** (tela inicial) ou **interno**?
8. Limite de zonas por tela (sugestão: 8).
9. Painéis LED: quais controladoras/modelos serão usados e como recebem a imagem?
10. Gestor de Mídias poderá criar layout nas telas dele?
11. Há aparelho(s) de teste disponíveis (TV Box, tablet) para medir vídeo simultâneo?

---

## 28. Roteiro de Micro-Gates

| Gate | Escopo | Toca o Player? |
|---|---|---|
| MG-SLZ-00 | Descoberta e arquitetura (este relatório) | Não |
| MG-SLZ-01 | Contrato de dados: tabelas, regras, RLS; correção do documento de contrato | Não |
| MG-SLZ-02 | Contrato do Player: bloco `layout` na RPC, trava por versão, prova de resposta idêntica | Não (servidor) |
| MG-SLZ-03 | Núcleo de layout no web: geometria, validação, escala e prévia de composição | Não |
| MG-SLZ-04 | Editor visual de zonas | Não |
| MG-SLZ-05 | Conteúdo na zona (arrastar mídia, widget, playlist) | Não |
| MG-SLZ-06 | Player Android — fundação: DTO, Room, limpeza, assinatura, escala (sem zonas visíveis) | Sim |
| MG-SLZ-07 | Player Android — zonas: contêiner, palco por zona, limite de vídeo; emulador + aparelho + canário | Sim |
| MG-SLZ-08 | Assistente de criação de tela (integra layout ao fluxo atual) | Não |
| MG-SLZ-09 | Resolução sob medida e perfil de display (LED) | Parcial |
| MG-SLZ-10 | Painel da rede por estabelecimento | Não |
| MG-SLZ-11 | Mapa do Brasil | Não |
| MG-SLZ-12 | Nossos Clientes | Não |
| MG-SLZ-13 | Validação ponta a ponta | Sim |

Mudanças em relação à sequência sugerida: o **contrato do Player sobe para o início** (ele condiciona todo o resto) e a integração Android é **dividida em duas** (fundação invisível antes das zonas), para isolar o risco de cache e banco local.

---

## 29. Ordem recomendada

1. Pré-requisito: canário do Player 5.6.9 concluído.
2. Trilha A (núcleo): 01 → 02 → 03 → 04 → 05 → 06 → 07 → 08 → 09 → 13.
3. Trilha B (independente do Player, pode começar já): 10 → 11 → 12.
4. Cada gate: verificação prévia → evidência → implementação → testes → build → reauditoria → commit → publicação → homologação. Um commit por escopo.

---

## 30. Diagrama final

```text
                    PAINEL WEB
   Telas · Editor de Layout · Playlists · Biblioteca · Widgets · Painel da Rede · Mapa
        │ (RLS de screens / playlists — sem nova autoridade)
        ▼
   screens ──layout_id──> screen_layouts ──< layout_zones ──playlist_id──> playlists ──< playlist_items
      │                                         (principal = screens.playlist_id)          │
      │ ponto_id                                                              media · widgets · pastas · links
      ▼
   pontos ── clientes/empresas ──> Painel da Rede · Mapa · Nossos Clientes (somente leitura)
        │
        ▼
   RPC get_player_playlist_for_screen
      data.playlists  (como hoje — todos os aparelhos)
      data.layout     (novo, opcional — só versão compatível)
        │  tempo real + 60 s
        ▼
   PLAYER ANDROID
      sem layout → caminho atual, intocado (tela cheia)
      com layout → contêiner de zonas → 1 palco por zona → mesmas regras de reprodução
      sincronização: baixar tudo → validar → trocar de uma vez   |   REPRODUZINDO = SÓ MÍDIA
```

---

## 31. Recomendação GO / NO-GO

```text
ARCHITECTURE STATUS: GO WITH CONDITIONS
```

Motivo: o sistema atual comporta a evolução sem duplicar entidades e sem quebrar as telas existentes; o risco está concentrado no Player Android e é controlável por etapas.

Condições:
1. Concluir o teste em aparelho do **Player 5.6.9** antes de qualquer mudança nova no Player.
2. Responder às **perguntas 1 a 5** da seção 27 antes do MG-SLZ-01 (definem o modelo de dados e o contrato).
3. Aceitar a regra **"zona recebe playlist"** (sem tabela de atribuição) e **"zona principal = playlist atual da tela"**.
4. Aceitar o limite inicial de **uma zona com vídeo e som**, ampliado só depois de medição em aparelho real.
5. Ter **aparelho de teste** (TV Box e tablet) para os gates 06 e 07; sem isso, esses dois gates não podem ser dados como aprovados.
6. Layout só é entregue a aparelho com **versão conhecida**; corrigir o registro de versão da frota.
7. Toda mudança de banco **aditiva**, partindo da definição viva, com prova de que a resposta das telas atuais não muda.
8. Toda mudança no banco local do Player com **migração explícita**.
9. "Nossos Clientes" e mapa público só com **autorização explícita por cliente** e lista fixa de campos.
