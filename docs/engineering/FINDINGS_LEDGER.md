# FINDINGS LEDGER — Micro-Gate 0 (2026-09-23)

> Achados da auditoria read-only. **Nada foi corrigido.** Cada item exige o seu próprio Micro-Gate (AGENTS.md §3).
> Confiança: CONFIRMED · PARTIALLY_CONFIRMED · UNCONFIRMED · CONTRADICTED · UNKNOWN.
> Evidência: STATIC_CODE, salvo quando indicado. Este ledger não substitui `MASTER_ISSUE_LEDGER.md` nem `.agents/memory/master_ledger.md`; ver a questão aberta Q-05 no relatório.

| ID | Sev | Status |
|---|---|---|
| F-01 | CRITICAL | OPEN |
| F-02 | HIGH | OPEN |
| F-03 | HIGH | OPEN |
| F-04 | MEDIUM | OPEN |
| F-05 | MEDIUM | OPEN |
| F-06 | MEDIUM | OPEN |
| F-07 | LOW | OPEN |
| F-08 | MEDIUM | OPEN |
| F-09 | MEDIUM | OPEN |
| F-10 | MEDIUM | OPEN |
| F-11 | LOW | OPEN |
| F-12 | INFO | OPEN |
| F-13 | LOW | OPEN |
| F-14 | MEDIUM | OPEN |
| F-15 | LOW | OPEN (limitação conhecida) |
| F-16 | LOW | OPEN |
| F-17 | LOW | OPEN |
| F-18 | HIGH | FIXED (runtime emulador; hardware pendente) |
| F-19 | MEDIUM | OPEN |
| F-20 | HIGH | FIXED (unit; runtime/hardware pendente) |

---

### F-01 — Webhook PIX insere pagamento sem autenticação
- **Severity:** CRITICAL
- **Location:** `supabase/functions/inter-pix-engine/index.ts:414-550` (bloco `isPixWebhook`)
- **Observed reality:**
  - O branch de webhook é acionado por `action==='webhook'` **ou** por qualquer body que contenha `pix`, `txid` ou `endToEndId`.
  - Não há nenhuma verificação de token, HMAC, mTLS ou IP. Diferente do `inter-billing-engine`, **não existe checagem de `INTER_WEBHOOK_TOKEN`**.
  - O branch não consulta a API do Inter para confirmar a transação.
  - Com service role, ele insere em `pagamentos` usando o `valor` do payload, ou `cobranca.valor` quando o payload não traz o valor.
  - O trigger `trg_concilia_pagamento` então marca a cobrança como `PAGA`, e `trg_fn_regras_financeiras_operacionais` libera a operação.
- **Expected behavior:** "PAGA somente após confirmação real do pagamento". O webhook precisa autenticar o remetente ou confirmar a transação no Inter (GET `/pix/v2/cob/{txid}`) antes de inserir o pagamento.
- **Evidence:** as linhas 417 (condição), 505 (`pagamentos.insert`) e 35 do bloco (fallback `finalValor = cobranca.valor`), além de `20261230_anunciante_status_canonico_automacao_pagamento.sql:7-71`.
- **Impact:** quem souber um `txid` válido (ou o fizer por tentativa) e conseguir alcançar a função consegue baixar uma cobrança sem pagamento real, o que também desbloqueia telas suspensas (`SCREEN_SUSPENDED`).
- **Confidence:** PARTIALLY_CONFIRMED. A lógica está CONFIRMED no código. Já a alcançabilidade depende do flag `verify_jwt` usado no deploy, que é UNKNOWN: com `verify_jwt=true`, a anon key pública já basta; com `false`, a função fica totalmente aberta. Como o Inter não envia JWT, um webhook funcional em produção implica `false`.
- **Next investigation:** confirmar os flags de deploy (`supabase functions list`); conferir se o Inter está configurado com mTLS ou token; rever `pagamentos` com `metodo` PIX sem `inter_pix_status` remoto correspondente.

### F-02 — `contract-signature-flow` confia no body e ignora o token seguro
- **Severity:** HIGH
- **Location:** `supabase/functions/contract-signature-flow/index.ts:168, 425-585`
- **Observed reality:**
  - A função usa service role e lê `usuarioId`/`clienteId` do body.
  - Não chama `auth.getUser()`.
  - A action `sign` exige só `envelopeId` + `usuarioId` e **não valida** o `secure_token` gerado em `create`.
  - A action `download` exige só `envelopeId`.
  - O front não invoca essa função: usa a RPC `fn_assinar_contrato`.
- **Expected behavior:** a assinatura deve ficar ligada à identidade autenticada ou ao token entregue ao signatário.
- **Evidence:** a busca por consumidores em `src/` retorna vazio; `SignatureRequest` é desestruturado do `req.json()`.
- **Impact:** se a função estiver implantada, quem tiver um `envelopeId` consegue assinar ou baixar o contrato em nome de terceiros. Há também duplicação de fluxo de assinatura (ver F-10).
- **Confidence:** CONFIRMED no código; o deploy está UNKNOWN.
- **Next investigation:** verificar se a função está implantada; se estiver órfã, propor a remoção dela em um Micro-Gate próprio.

### F-03 — RPCs de frota chamadas pelo Android não existem nas migrations ativas
- **Severity:** HIGH
- **Location:** `native-android-player/app/.../util/DeviceFleetManager.kt:343, 397, 420`
- **Observed reality:** o player chama `fn_device_register_extended`, `fn_device_heartbeat_v2` e `fn_device_telemetry_batch`. Essas funções só estão definidas em `supabase/migrations_archive/20260825_device_fleet.sql` e não aparecem em `types.ts`.
- **Expected behavior:** todo contrato consumido pelo player deve estar em `supabase/migrations/` (AGENTS.md §13).
- **Impact:** se o banco vivo não tiver essas funções, heartbeat v2 e telemetria da frota falham em silêncio (o erro é capturado e logado). Um reset ou recriação do ambiente a partir de `migrations/` quebra esse consumidor.
- **Confidence:** PARTIALLY_CONFIRMED. A ausência no repositório está CONFIRMED; a presença no banco vivo é UNKNOWN.
- **Next investigation:** consultar `pg_proc` em produção (só leitura) e o logcat de um device canary.

### F-04 — Fallback proibido `role?.name` para perfil
- **Severity:** MEDIUM
- **Location:** `src/modules/crm/pages/ContratosListPage.tsx:321`; `src/core/identity/IdentityService.ts:83-85`
- **Observed reality:** `isAdmin` aceita `usuario?.role?.name === 'ADMIN'` como alternativa a `perfil?.nome`. O `IdentityService` deriva a visibilidade a partir de `role?.name`.
- **Expected behavior:** AGENTS.md §7 exige a fonte única `perfil?.nome || (is_owner ? 'OWNER' : null)`.
- **Impact:** pode haver promoção de UI (ações de admin em contratos) quando `role` e `perfil` divergirem. O RLS continua sendo a barreira final.
- **Confidence:** CONFIRMED (STATIC_CODE).

### F-05 — Room com `fallbackToDestructiveMigration` + `exportSchema=false`
- **Severity:** MEDIUM
- **Location:** `native-android-player/cache-manager/.../db/PlayerDatabase.kt:22, 81-82`
- **Observed reality:** a versão é 11 e só há as migrações 7→8→9→10→11. Qualquer gap de migração ou versão menor que 7 apaga o banco local, o que inclui a playlist em cache. Sem o schema exportado, não dá para testar as migrações.
- **Impact:** perda do cache offline em um OTA que pule versões, o que conflita com a regra de "atualização atômica de playlist" (AGENTS.md §14.2).
- **Confidence:** CONFIRMED no código; o impacto em campo depende das versões instaladas (UNKNOWN).

### F-06 — Webhook de boleto não gera `pagamentos`
- **Severity:** MEDIUM
- **Location:** `supabase/functions/inter-billing-engine/index.ts:186-298`
- **Observed reality:** o evento é deduplicado em `inter_webhook_events` e a função só faz `contas_receber.inter_status = situacao`. Nenhum trigger lendo `inter_status` foi encontrado nas migrations; a única outra referência a ele fica em `fn_excluir_contrato_atomo`.
- **Impact:** um boleto pago pode não virar `PAGA` de forma automática.
- **Confidence:** UNCONFIRMED. Pode haver conciliação em `billing-worker` ou em um processo manual.
- **Next investigation:** ler `billing-worker/index.ts` inteiro e conferir, em produção, se há `contas_receber` com `inter_status='RECEBIDO'` e `status<>'PAGA'`.

### F-07 — Edge functions sem consumidor no repositório
- **Severity:** LOW
- **Observed reality:** 10 das 27 funções não são invocadas por `src/`: `contract-signature-flow`, `generate-contract-pdf`, `billing-worker`, `check-offline-screens`, `communication-core`, `fetch-rss`, `maintenance`, `payment-webhook`, `public-billing-og` e `upload-audit-log`. Algumas são chamadas por cron, webhook ou pelo Android; isso não foi verificado.
- **Additional reality:** `deploy-functions.yml` só implanta `inter-billing-engine`.
- **Confidence:** PARTIALLY_CONFIRMED.

### F-08 — Tabelas sem `ENABLE ROW LEVEL SECURITY` nas migrations
- **Severity:** MEDIUM
- **Observed reality:** 11 tabelas estão nessa situação: `assinaturas_digitais`, `feature_flags`, `feature_flags_empresa`, `historico_financeiro`, `pedidos_insercao_versoes`, `perfis`, `planos`, `roles_permissoes`, `sequencias_numeracao`, `storage_migration_map` e `visita_checkins`.
- **Evidence gap:** `remote_schema.sql` tem 0 bytes.
- **Impact:** se o RLS também estiver desligado no banco vivo, `authenticated` e `anon` poderiam ler e escrever essas tabelas via PostgREST, dependendo dos GRANTs.
- **Confidence:** PARTIALLY_CONFIRMED. A análise foi textual e não detecta habilitação feita por bloco `DO`.
- **Next investigation:** `select relname, relrowsecurity from pg_class …` em produção (só leitura).

### F-09 — `types.ts` desatualizado em relação ao schema
- **Severity:** MEDIUM
- **Observed reality:** o último commit de `src/integrations/supabase/types.ts` é de 2026-08-29. Faltam 34 tabelas criadas depois (lista em ENGINEERING_BASELINE §6) e as RPCs de frota. Há 36 arquivos com `as any` fora dos testes.
- **Impact:** o `tsc --noEmit` passa sem validar o contrato real, então a paridade entre UI e banco não é verificada em tempo de build.
- **Confidence:** CONFIRMED.

### F-10 — Múltiplas fontes de verdade (duplicação de modelo)
- **Severity:** MEDIUM
- **Observed reality (tabelas coexistentes no mesmo domínio):**
  - Mídia: `media`, `medias`, `midias`, `biblioteca_midias`.
  - Tela: `screens`, `telas`, `players`, `operacao_players`, `equipamentos`, `devices`.
  - Playlist: `playlists`/`playlist_items` e `playlists_cliente`/`cliente_playlist_itens`.
  - Cobrança: `contas_receber`, `cobrancas`, `pix_cobrancas`, `boletos`, `parcelas`.
  - Eventos de webhook: `inter_webhook_events`, `inter_pix_webhook_events`, `webhook_pagamentos`.
  - RBAC: `roles`, `user_roles`, `role_permissions`, `roles_permissoes`, `permissions`, `permissoes_usuarios`, `perfis`.
  - Usuário: `usuarios`, `profiles`.
  - Assinatura: `assinaturas`, `assinaturas_digitais`.
  - Feature flags: `feature_flags`, `feature_flags_empresa`.
  - Assinatura de contrato: 2 fluxos (RPC × edge function).
- **Confidence:** CONFIRMED que as tabelas existem; qual delas é canônica em cada domínio está PARTIALLY_CONFIRMED (ENGINEERING_BASELINE §14).

### F-11 — Código duplicado e órfão no player Android
- **Severity:** LOW
- **Observed reality:**
  - `sync-network/.../repository/PlayerRepositoryImpl.kt` não tem nenhum consumidor; o `ServiceLocator` usa o de `app/data`.
  - Há três abstrações de cache, dois `MaintenanceWorker` e quatro emissores de heartbeat (`device_health` recebe upsert de dois lugares).
- **Impact:** confusão ao fazer correções, com risco de corrigir a cópia morta.
- **Confidence:** CONFIRMED (por grep de referências).

### F-12 — Pipeline Retail Media / ERP inexistente
- **Severity:** INFO
- **Observed reality:** não existe Product Master, Price Sync, Offer Engine nem integração com ERP. `produtos`, `produto_precos`, `ofertas` e `encartes` são CRUD usados por um único service cada. As telas de "IA"/"BI" (`AIDashboard`, `ai_predicoes`) não chamam nenhum provedor de LLM.
- **Confidence:** CONFIRMED (ausência em STATIC_CODE).

### F-13 — Variável `VITE_R2_SECRET_KEY` ainda documentada
- **Severity:** LOW
- **Location:** `.env.example:7-8`; `.env` local define o valor.
- **Observed reality:** nenhum código lê essa variável hoje, então ela não é embutida no bundle. Mas o prefixo `VITE_` torna trivial reintroduzir o vazamento.
- **Confidence:** CONFIRMED.

### F-14 — Arquivos de credenciais não ignorados pelo git
- **Severity:** MEDIUM
- **Observed reality:** `CREDENCIAIS_FINAIS.md`, `CREDENCIAIS_RELATORIO.md` e `_restore_creds.ps1` estão não rastreados e **fora** do `.gitignore`. Um `git add -A` (proibido pela governança, mas possível) os incluiria. O conteúdo deles não foi lido.
- **Confidence:** CONFIRMED (`git check-ignore`).

### F-15 — Semântica de `dirty_shutdown`
- **Severity:** LOW (limitação de telemetria)
- **Location:** `app/.../data/PlayerRepositoryImpl.kt:681-694`
- **Observed reality:** a flag é marcada `true` a cada início e nunca é resetada. O comentário afirma que a MainActivity limpa a flag no `onStop`, mas isso é **falso**. O resultado é que todo boot, exceto o primeiro, reporta `REBOOT_BY_POWER_LOSS`.
- **Decision:** **não corrigir** com `onStop`/`onDestroy`, conforme a instrução do proprietário. Classificação: limitação semântica conhecida, acrescida de comentário enganoso.
- **Confidence:** CONFIRMED.

### F-16 — APK local ≠ HEAD
- **Severity:** LOW
- **Observed reality:** `app/build/outputs/apk/debug/app-debug.apk` foi gerado em 2026-09-23 09:39, com 28 arquivos do player modificados e não commitados. Não serve como evidência de HEAD nem de produção.
- **Confidence:** CONFIRMED.

### F-17 — Numeração de migrations e drift documental
- **Severity:** LOW
- **Observed reality:**
  - Os prefixos das migrations não são datas: `20261039_*` é inválido e `2026-10..12` está no futuro. Três esquemas de numeração convivem.
  - `README.md` e `package.json#name` ainda são do template Lovable.
  - O CI usa Node 22 e a Vercel usa Node 24.x.
  - `MASTER_ISSUE_LEDGER.md` tem contagens inconsistentes.
- **Confidence:** CONFIRMED.

---

## Acréscimos da reconciliação do handoff (2026-09-23, Micro-Gate 0 v2)

### F-18 — Adoção de playlist no Room sem transação real
- **Severity:** HIGH
- **Location:** `native-android-player/cache-manager/src/main/java/com/antigravity/cache/dao/PlayerDao.kt:14-24`; código gerado em `cache-manager/build/generated/ksp/debug/java/com/antigravity/cache/dao/PlayerDao_Impl.java:526-528`
- **Observed:**
  - `insertPlaylistWithItems` é um método *default* de interface, anotado com `@Transaction` **e** com `@Insert`.
  - O corpo faz `deleteAllPlaylists()`, `deleteAllMediaItems()`, `insertPlaylist()` e `insertItems()`.
  - A implementação gerada pelo Room 2.6.1/KSP apenas chama `PlayerDao.DefaultImpls.insertPlaylistWithItems(...)`, **sem `withTransaction`**, e o arquivo gerado não contém nenhum `withTransaction`.
- **Expected:** a troca da playlist deve ser atômica (AGENTS.md §14.2; handoff §23; finding histórico "P0.4.8R-F02", citado como CLOSED no relatório colado).
- **Root cause (hipótese):** a combinação de `@Insert` com um método que tem corpo faz o processador não gerar o wrapper transacional. Isso ainda **não foi confirmado com um teste Room real** (instrumentado ou Robolectric).
- **Evidence:** STATIC_CODE do artefato gerado a partir do worktree atual (`PlayerDao.kt` não tem modificações em relação ao HEAD). O teste JVM `BackgroundSyncAtomicAdoptionTest` usa `MockRoomDatabase` e **não cobre** o DAO real.
- **Impact:** um crash, kill ou queda de energia entre o delete e o insert deixa o Room vazio, e no próximo boot offline não há playlist local. Um sync concorrente pode ler um estado intermediário.
- **Confidence:** PARTIALLY_CONFIRMED (confirmado no código gerado; falta prova em runtime).
- **Recommendation:** criar um Micro-Gate de player com um teste Room in-memory (Robolectric) que injete falha entre o delete e o insert, **antes** de qualquer correção.

### F-19 — Findings históricos citados no handoff não existem no repositório
- **Severity:** MEDIUM (governança/rastreabilidade)
- **Observed:**
  - Nenhum arquivo do repositório (`.md`, `.json`, `.jsonl`, `.kt`, `.mjs`, `.txt`) contém `P0.3-001`, `P0.4.6R`, `P0.4.8R`, `C3.2`, `P0.5` ou "READY FOR HARDWARE". Os 5654 JSONs de `.agents/memory/executions` também não têm nada sobre C3.
  - `P0.4.8` só aparece como comentário em `MainActivity.kt` e em `CanonicalSurfaceConsumerUnificationTest.kt`.
  - `.agents/memory/master_ledger.md` diz "zero pendências" e não registra nenhum desses IDs.
- **Impact:** os status informados no relatório colado (CLOSED, ARCHITECTURAL_LIMITATION) **não são verificáveis** no repositório. Pela regra do handoff §49 ("consulte o ledger real"), eles ficam como UNCONFIRMED.
- **Recommendation:** se existir um ledger do Antigravity fora do repositório, importá-lo para `.agents/memory/master_ledger.md`, com autorização.

---

## Forensic Repair — Android Player (2026-09-24)

### F-20 (= P0.4.8R-F01 atual) — `onNewIntent` forçava SYNC_GUARD sobre mídia em reprodução
- **Severity:** HIGH
- **Location:** `native-android-player/app/src/main/java/com/antigravity/player/MainActivity.kt`, em `onNewIntent`. O bloco de re-entrada RC2 faz parte do trabalho **não commitado** da v5.2.3.
- **Actual (antes da correção):**
  - `applySurface(SurfaceState.SYNC_GUARD, …)` era chamado de forma incondicional sempre que existia `saved_screen_id`. Esse era o único bypass da projeção canônica que restava.
  - Com a `MainActivity` viva (`singleInstance`, filtro HOME), `onNewIntent` também é disparado por: tecla HOME, watchdog `AlarmManager` (`startWatchdog`), relaunch do `UserApplication` e retorno de manutenção do `SelfHealingService`.
  - Resultado: overlay "Sincronizando mídias..." e os dois `PlayerView` invisíveis por cima do playback válido. `startPlaybackLoop()` retorna cedo (o loop já está ativo), então só o watchdog de 25 s do `SyncGuard` ou o próximo swap desfazem o estado.
- **Root cause:** a decisão de superfície na re-entrada não consultava o `PlayerRuntimeState`.
- **Proof before:** `OnNewIntentReentrySurfaceTest.f01_playingSameScreen_onNewIntent_appliesNoSurface`, falhando com `expected null, but was:<SYNC_GUARD>` (UNIT, função de produção + `SurfaceProjectionEngine` real).
- **Fix:** função `resolveReentrySurface()` em `MainActivity.kt` (+20/−1 linhas). Quando a mesma tela já projeta `MEDIA_ONLY`, nenhuma superfície é aplicada. Nos demais casos (idle, renderer não inicializado, tela diferente), o `SYNC_GUARD` do RC2 é mantido.
  - Não se usa `showMediaOnlySurface()` nesse ponto porque ela força `playerView1` VISIBLE, o que é arriscado com o A/B renderer quando o ativo é o `playerView2`.
- **Proof after:** 4/4 testes passando; regressão JVM 101/101.
- **Pendente:** RUNTIME (tecla HOME ou watchdog em device) e HARDWARE.

### F-18 — fechamento
- **Proof before (RUNTIME, emulador Pixel_API28 / Android 9):** `PlaylistAdoptionAtomicityTest.f18_failureDuringAdoption_keepsPreviousPlaylistIntact` falhou com `expected:<[A]> but was:<[B]>`: a playlist anterior foi apagada e a nova ficou gravada parcialmente.
- **Root cause (confirmada):** `@Insert` junto com `@Transaction` no mesmo método com corpo fazia o Room gerar só a delegação para `DefaultImpls`, sem `withTransaction`.
- **Fix:** remoção da anotação `@Insert` desse método (`PlayerDao.kt`). O Room passou a gerar `RoomDatabaseKt.withTransaction(__db, … DefaultImpls.insertPlaylistWithItems …)`. Foram adicionadas também duas dependências `androidTestImplementation` no `cache-manager`, apenas para teste.
- **Proof after:** 2/2 testes no emulador; regressão JVM 101/101; `assembleRelease` OK.
- **Pendente:** HARDWARE (durabilidade física após power loss).

---

## Fluxo do cliente + painel (2026-09-24) — v5.2.5

> Correções de afirmações minhas anteriores: (1) eu havia dito que não existia sync periódico de reserva; **existe**: `syncInBackground` agenda a si mesmo a cada 60 s. (2) Suspeitei que o `PixelCopy` da janela não captaria o vídeo por ser SurfaceView; o `PlayerView` usa `texture_view`, mas mesmo assim o teste no emulador mostrou o vídeo **transparente** no `PixelCopy` (F-26).
> Nível de prova: UNIT = JVM; EMULADOR = Android 9 real (Pixel_API28); NÃO VERIFICADO = precisa de login real / aparelho.

### F-21 — Player voltava ao Login e se fechava logo após escolher a tela (HIGH) — FIXED (UNIT)
- **Local:** `MainActivity.sampleRuntimeState()` → `SessionStateAdapter` → `SurfaceProjectionEngine` → `showLoginSurface()` (que faz `finish()`).
- **Causa:** o `SessionManager` só sai de `UNKNOWN` no 1º sync bem-sucedido, e o token em memória some se o processo renasce (watchdog/OS). `UNKNOWN`/`INITIALIZING`/`AUTHENTICATING` ou token vazio projetavam "não autenticado" → LOGIN. O 1º `syncSurfaceWithCanonicalProjection()` (início de `startSyncAndPlay`, sem cache = logo após escolher a tela) fechava a `MainActivity`. Os testes existentes montavam o estado sempre como `AUTHORIZED`, então não pegavam.
- **Prova antes:** `SessionSurfaceAtBootTest` — 3 dos 7 cenários falhavam (LOGIN em vez de SYNC_GUARD). **Depois:** 7/7.
- **Correção:** `PlayerFlowPolicy.effectiveSessionInputs()`: com tela já escolhida neste aparelho (`saved_screen_id`), a sessão local é válida. Deslogado de verdade, sem tela, suspensa e revogada mantêm o comportamento.
- **NÃO VERIFICADO:** o fluxo real de login → seleção → sync (exige credenciais e aparelho).

### F-22 — Sync periódico reiniciava a reprodução a cada 60 s (MEDIUM) — FIXED (UNIT)
- `syncInBackground` chamava `startPlaybackLoop()` após TODO sync com sucesso, mesmo sem mudança na playlist (o repositório devolve `success` também em "config inalterada"), cortando a mídia em exibição. Além disso, cada nudge/execução acumulava mais uma cadeia paralela de timers de 60 s.
- **Correção:** reinicia só se a assinatura da playlist mudou (`shouldRestartPlaybackLoop`); um único timer (`scheduleNextBackgroundSync`). Testes: 4 dos 13 iniciais falhavam antes; 15/15 depois.

### F-23 — Erros passageiros expulsavam o usuário (MEDIUM) — FIXED (UNIT)
- Qualquer texto com "404" (ex.: arquivo de mídia) limpava `saved_screen_id` e mandava à seleção de tela; qualquer número contendo "401" era tratado como sessão expirada; uma exceção no boot mostrava "ERRO CRÍTICO: Reiniciando em 5s..." e ia ao Login soltando o kiosk.
- **Correção:** `PlayerFlowPolicy.classifySyncError` (só `[PERMANENT]`/"Tela não encontrada" vai à seleção; só `JWT expired`/HTTP 401 isolado reautentica); o erro de boot agora tenta de novo em silêncio.

### F-24 — Mensagens ao cliente no fluxo de login/seleção/sync (MEDIUM) — FIXED (UNIT p/ textos; UI não verificada)
- Removidos: Toasts "Login realizado com sucesso!" e "Conectado com Sucesso!", o "Sessão Expirada" (a volta ao Login já comunica) e o "Erro ao buscar telas: <exceção>" (agora tenta de novo sozinho, com o indicador de carregamento).
- A tela de sincronização só mostra "Sincronizando mídias..." ou o contador "Sincronizando: X de Y" (`sanitizeSyncProgress`). Mantidas, por serem ação do usuário que falhou: validação de email/senha, credenciais inválidas (agora sem texto técnico), falha ao transferir tela e "Nenhuma tela disponível".

### F-25 — Toque longo na tela de sincronização desvinculava a tela sem proteção (MEDIUM) — FIXED (código; UI não testada)
- `statusTextView`/overlay: toque longo executava `unpairScreen` no backend e ia à seleção. Agora é consumido com o kiosk ativo; só funciona na janela de manutenção. A troca de tela pelo cliente passa a ser feita pelo painel (Desvincular).

### F-26 — Screenshot: vídeo preto e comandos sem plano B (HIGH) — FIXED
- **Captura (EMULADOR 3/3):** o teste `ScreenCaptureTest` mostrou que o `PixelCopy` da janela devolve o `TextureView` transparente. Nova `media-engine/ScreenCapture`: PixelCopy (API 26+) + sobreposição do frame de cada `TextureView` visível; abaixo do Android 8 ou com PixelCopy falhando, desenho da hierarquia + TextureViews (antes: erro "Screenshot não suportado"). Imagem reduzida (lado maior ≤ 1280 px), poupando RAM/upload de TV Box fraca.
- **Comandos:** só chegavam por WebSocket e só passavam a ser escutados após um sync bem-sucedido (sem playlist ou offline no boot = nunca). Agora ligam assim que a tela é conhecida e há polling de reserva a cada 10 s (`screenshot`/`reload` com até 2 min de idade, mesma deduplicação). **NÃO VERIFICADO em runtime** (precisa de tela pareada real).

### F-27 — Tela de sincronização sumia antes da mídia e ficava sobre a mídia (MEDIUM) — FIXED (UNIT p/ política; UI não verificada)
- O timer de segurança de 25 s soltava a tela aos 25 s mesmo sem mídia (aparecia o logo sobre preto no meio do download), e nenhum código a soltava quando o `ViewModel` entrava em `PLAYING`: o overlay ficava sobre a mídia até o timer (o comentário no código afirmava o contrário).
- **Correção:** o timer só solta quando já há mídia (`keepSyncScreenLocked`) e `PLAYING` libera o overlay imediatamente (sem forçar PlayerView).

### Verificações de produção (SOMENTE LEITURA, chave anon pública)
- Realtime aceita `postgres_changes` em `screens`, `devices`, `playlists`, `playlist_items` e `remote_commands` (as 5 que o player escuta) — **confirmado**.
- Bucket `screenshots` existe e é **público** (o painel lê por URL pública) — **confirmado**.
- RPCs de frota (`fn_device_register_extended`, `fn_device_heartbeat_v2`, `fn_device_telemetry_batch`, F-03): **não verificável sem credencial** (o anon não enxerga nenhuma RPC). Seguem OPEN. O heartbeat que alimenta o painel usa `devices`/`device_health` diretamente e não depende delas.

### Regras do proprietário (2026-09-24) — v5.2.6
- **Avisos de sucesso restaurados:** "Login realizado com sucesso!" (Login) e "Conectado com Sucesso!" (seleção de tela) voltam a aparecer, por decisão do proprietário. Continuam removidos o "Sessão Expirada" e o "Erro ao buscar telas: <exceção>" (F-24).
- **Tela de sincronização:** nome "Sincronizando Mídias" + contador ("2 de 5"); ao terminar, "Mídias sincronizadas" (visível por no mínimo 1,5 s) e então a mídia assume. Nenhum outro texto (aguarde/erro/bloqueio/etapas) é exibido. Depois disso nenhuma mensagem, Toast ou overlay é exibido sobre o player/mídia: o único overlay de texto é o de tela bloqueada (suspensão), que é estado do sistema. `PlayerFlowPolicy.sanitizeSyncProgress` / `remainingDoneVisibilityMs` — 18/18 testes; antes 4 falhavam.
- **Screenshot:** captura imediata (removidos `System.gc()` e a espera de 2 s); o print vive só em memória (bitmap reciclado logo após a compressão, nada gravado no aparelho); o upload sobrescreve `screenshots/<tela>.jpg` (upsert), então há **um único print por tela no painel** e o anterior deixa de existir. O print automático (checagem a cada 6 h) usa o mesmo arquivo e agora é marcado como `heartbeat` ("Check de Mídia" no painel; antes saía como `manual`). Verificado: nenhum código do player nativo, do player web ou do painel grava histórico de prints; a tabela `screenshots_logs` não tem escritor.
- **Web/Supabase:** nenhuma alteração necessária nesta entrega (o painel já lê o arquivo único e atualiza pelo ack do comando).

---

## Verificação de produção com credenciais + incidente de segredos (2026-09-24)

> Consultas SOMENTE LEITURA (Management API do Supabase e API da Vercel). Nenhuma escrita em produção.

### F-28 — Tokens pessoais (Supabase e Vercel) versionados em texto puro (HIGH) — FIXED antes de sair da máquina
- Estavam como texto de teste ("rawLeak") em `.agents/scripts/test_credential_runtime.mjs:67`, presentes nos 20 commits locais ainda não enviados. O push protection do GitHub bloqueou (GH013); **o bloqueio NÃO foi contornado**.
- **Correção:** os 20 commits locais foram reescritos (filter-branch) trocando os literais por valores falsos montados em tempo de execução (`'vcp_' + 'X'.repeat(56)`, `'sbp_' + '0'.repeat(40)`); o teste continua verificando o mascaramento. Varredura pós-reescrita: 0 segredos nos 20 commits; a única diferença de conteúdo é essa linha. Nada foi enviado ao GitHub com os tokens.
- Os tokens agora ficam fora de qualquer repositório, em `C:\Users\Jairan Santos\.sobremidia-secrets\tokens.env`. Como já estiveram em arquivo do projeto e na conversa, recomenda-se rotacioná-los.

### Estado real de produção
- **Vercel:** produção publicada em 2026-09-17 (commit `3904dea`); desde então só mudaram 8 arquivos de teste em `src/tests` (0 arquivos web de produção) → deploy de produção NÃO necessário. O push da branch gerou um deploy de preview (READY, commit `2e1edbc`).
- **Supabase:** 14 migrations locais não constam em `supabase_migrations.schema_migrations`, mas os objetos que elas criam (funções/tabelas/colunas/triggers) **já existem** no banco (0 ausentes) → foram aplicadas fora do controle de versões; nada a aplicar. Esta entrega não altera `supabase/`.
- **F-03 CONFIRMADO:** `fn_device_register_extended`, `fn_device_heartbeat_v2` e `fn_device_telemetry_batch` **não existem** em produção (só em `migrations_archive/20260825_device_fleet.sql`). As demais RPCs do player existem (`get_player_playlist_for_screen`, `get_authorized_screens_for_player`, `fn_device_bind`, `fn_device_attest`, `player_unpair_screen`, `admin_unpair_screen`, `fn_player_report_telemetry`). O `DeviceFleetManager` falha em silêncio nessas 3 chamadas; heartbeat/telas usam as tabelas diretamente. **Decisão pendente:** promover a migration arquivada (revisar antes: é do período anterior ao hardening de RLS).
- **F-08 CONFIRMADO em produção:** RLS desligado em `perfis`, `planos`, `roles_permissoes`, `feature_flags`, `feature_flags_empresa`, `historico_financeiro`, `assinaturas_digitais`, `pedidos_insercao_versoes`, `sequencias_numeracao`, `storage_migration_map`, `visita_checkins`. Teste anônimo (chave pública): só `perfis` é legível (12 linhas, nomes de perfil); `planos`/`roles_permissoes`/`feature_flags*` legíveis porém vazias; as demais retornam 401. Exposição real baixa hoje, mas depende de GRANTs — endurecer é um Micro-Gate próprio (habilitar RLS + políticas sem quebrar o `AuthContext`).
- **Confirmado:** o `CHECK` de `remote_commands` aceita `reload`, `reboot`, `screenshot`, `take_screenshot`, `sync`…; bucket `screenshots` público com as 4 políticas `scr_shot_*`; Realtime publica as 5 tabelas do player.

### F-29 — Player fechava no celular logo após escolher a tela (CRITICAL) — FIXED (RUNTIME emulador Android 16)
- **Sintoma:** ~10 s depois de o player abrir numa 1ª sincronização (sem cache), o app sumia e o celular voltava à tela inicial.
- **Causa raiz (tombstone):** `SIGSEGV — null pointer dereference` em `libGLESv1_CM.so (glGetString)` ← `DeviceInfoCollector.getGpu()` ← `DeviceInfoCollector.collect` ← `DeviceFleetManager` (iniciado após o 1º sync ok). `GLES20.glGetString` era chamado em thread de fundo SEM contexto OpenGL; crash nativo não é capturável por try/catch nem pelo handler "anti-crash" do `UserApplication`. Só ocorria sem cache (1ª conexão), porque com cache a frota já estava iniciada/o caminho era outro.
- **Prova antes:** Pixel_5 / Android 16, cache apagado, abertura pelo ícone → processo morto em 11 s (`Process ... has died`, `Force finishing activity MainActivity`).
- **Correção:** `getGpu()` usa `Build.SOC_MANUFACTURER/SOC_MODEL` (API 31+) ou `Build.HARDWARE`, sem OpenGL. Teste de regressão `NoOffThreadGlCallsTest` impede nova chamada de `glGetString` no app.
- **Prova depois:** mesmo cenário, 120 s aberto, mesmo PID, 0 crashes nativos, mídia tocando; reconexão da mesma tela e seleção com player vivo/não vivo também 60 s abertos. JVM 127/127.
- **Achado paralelo (não corrigido):** exceções do supabase-kt no `DeviceFleetManager` imprimem o cabeçalho `Authorization: Bearer <JWT da sessão>` no logcat. Recomenda-se não logar `e.message` dessas exceções.

### F-30 — Player no celular girava com o sensor em vez de respeitar a orientação da playlist (HIGH) — FIXED (RUNTIME emulador Android 16)
- **Causa:** `MainActivity` é `screenOrientation="fullSensor"` e `applyScreenRotation()` só travava a orientação física quando chegava o comando remoto `rotate_*` (`forcePhysicalLock`). A orientação da playlist (16x9/9x16) só ajustava o enquadramento; o celular girava junto com a mão.
- **Correção:** `PlayerFlowPolicy.physicalOrientationLock()` — celular/tablet travam SEMPRE na orientação da playlist (`SCREEN_ORIENTATION_LANDSCAPE`/`PORTRAIT`); TV mantém o comportamento anterior (só trava por comando do painel). Aplicado em todos os pontos que já chamavam `applyScreenRotation` (boot com orientação salva, sync, troca de playlist, Realtime).
- **Prova:** `OrientationLockPolicyTest` — 2 de 5 falhavam antes (celular), 5/5 depois; JVM 132/132. Emulador Pixel_5 (Android 16), playlist 16x9: 5 giros físicos do aparelho → tela permanece `ROTATION_90` (paisagem); controle: o app Configurações gira normalmente (0 → 270) com o mesmo comando. 0 crashes.
- **Não verificado em runtime:** playlist 9x16 no celular (coberta só pelo teste unitário) e TV Box física.

### F-31 — TV Box / Smart TV não respeitavam a orientação da playlist (HIGH) — FIXED (RUNTIME emulador com perfil TV)
- **Regra definida pelo proprietário (padrão permanente):** 16x9 = mídia deitada (TV normal / tela cheia no celular); 9x16 = mídia em pé (totem com a TV virada / stories no celular). Vale para celular, tablet, TV Box e Smart TV.
- **Antes:** na TV nada girava; mídia 9x16 aparecia pequena no centro de uma TV deitada (RESIZE_MODE_FIT) e, com a TV virada em pé, aparecia de lado. O `PresentationResolver` só registrava log, não aplicava nada.
- **Correção:** TV ignora pedido de orientação do app, então o player gira o PRÓPRIO canvas (raiz do layout: vídeo, imagem, widget, sync e bloqueio) 90° quando a playlist não casa com o painel físico: `PlayerFlowPolicy.tvCanvasTransform()` + `MainActivity.applyTvCanvasOrientation()` (aplicado na troca de orientação da playlist, no boot e em mudanças de configuração). Se a TV Box obedecer ao pedido de orientação, não há giro duplo (compara com o painel real). Celular/tablet seguem com a trava do sistema (F-30).
- **Prova:** `TvCanvasRotationTest` — 3 de 6 falhavam antes, 6/6 depois; JVM 138/138. Emulador Android 16 com perfil TELEVISION forçado, painel em pé e playlist 16x9 → log `TV canvas: playlist=landscape panel=1080x2204 -> 2204x1080 rot=90.0`, vídeo ocupando o painel inteiro girado; 0 crashes.
- **Montagem do totem:** o canvas gira 90° no sentido horário; a TV deve ser virada de modo que a lateral DIREITA dela fique para cima. Se instalada ao contrário, a imagem fica de cabeça para baixo (não há opção de inverter ainda).
- **Não verificado:** TV Box/Smart TV física e playlist 9x16 em runtime (só teste unitário + simulação simétrica).

### F-32 — Timestamps do Player 3 h atrasados ("último print 09:12" para um print de 12:12) (HIGH) — FIXED (JVM)
- **Causa:** `TimeManager.currentTimeMillis()` soma o fuso de Brasília (-3 h) ao UTC (é "hora local" para agenda/exibição) e `RemoteDataSource.getIsoTimestamp()` rotulava esse valor com "Z". Evidência em produção: `last_screenshot_at = 12:12:05Z` para um upload feito às 15:12:05Z no Storage.
- **Correção:** `TimeManager.utcMillis()` (UTC real) usado só em `getIsoTimestamp()` e no corte do polling de comandos. Agenda/exibição (`currentTimeMillis`) intocados. `TimeManagerUtcTest`.
- **Aberto (não alterado de propósito):** `PlayerRepositoryImpl.registerPlayProof` usa `getSyncedDate()` com o mesmo desvio (played_at). Consumidores/relatórios de prova de exibição não foram auditados; alterar exige análise própria.

### F-33 — Heartbeat pausado pelo screenshot sem prazo → dispositivo OFFLINE / botão carregando (HIGH) — FIXED (JVM); reprodução física não obtida
- **Causa provável:** `ScreenshotCoordinator.isHeartbeatPaused` era liberado só no callback da captura/`finally` do upload. Sem callback (Activity destruída, PixelCopy travado) o `PersistentHeartbeatService` ficava em espera para sempre → `last_ping_at` velho → painel OFFLINE (janela de 3 min) e comando sem ack.
- **Correção:** a pausa expira sozinha em 20 s (`MAX_PAUSE_MS`); vigia de 15 s na captura envia ack `failed`; ack do comando com até 3 tentativas. `ScreenshotHeartbeatPauseTest`.

### F-34 — Fleet RPCs nunca aplicadas + checagem `"ok":true` nunca casava (HIGH) — FIXED no código; MIGRAÇÃO PENDENTE DE APLICAÇÃO EM PRODUÇÃO
- **Causa:** `20260825_device_fleet.sql` ficou em `migrations_archive` (nunca aplicada). O Player chamava `fn_device_register_extended`/`fn_device_heartbeat_v2`/`fn_device_telemetry_batch` (inexistentes) e o painel lia colunas inexistentes de `devices`/`device_health`. Além disso o Postgres devolve `{"ok": true}` (com espaço) e o Player checava a substring sem espaço.
- **Correção:** migração aditiva `supabase/migrations/20261231_device_fleet_dashboard_info.sql` (colunas, `device_telemetry`, 3 RPCs SECURITY DEFINER validando `fn_player_can_access_screen`, espelho em `screens`); `rpcResponseOk()` no Player. `FleetRpcOkTest`.

### F-35 — Painel: cartão "Dispositivo Vinculado" vazio e screenshot preso (HIGH) — FIXED (vitest)
- **Causa:** `device_health` era consultada por `screens.bound_device_id` (hash), mas `device_health.device_id` é o UUID de `devices.id` (erro de UUID inválido → sempre vazio). O card de screenshot só concluía pelo ack do comando e o rodapé dizia "enviada automaticamente" mesmo para print manual.
- **Correção:** consulta de saúde por `devices.id`; conclusão da captura quando `last_screenshot_at` muda (polling 3 s enquanto espera); rodapé manual/automático; bloco "Último Heartbeat da Tela" (dados de `screens`) como fallback. `screenshotStatus.test.ts`.

### F-36…F-41 — Controle Remoto do Dashboard (Atualizar Player / Reiniciar Player / Tela Ativa) (HIGH) — FIXED (JVM 104/104 + EMULADOR contra o banco real)
Emulador Pixel_5 (Android 16) logado na tela de homologação `a3ee35da`, comandos inseridos em `remote_commands` exatamente como o painel faz; logcat como prova.
- **F-39 (RAIZ de todo comando ficar `pending` para sempre):** `acknowledgeCommand` montava o corpo com `Map<String, Any>`; o supabase-kt não serializa `Any` (`Serializer for class 'Any' is not found`). O ack SEMPRE falhava (antes e depois da minha correção de retry). Agora `JsonObject`. Prova: `executed_at` gravado em UTC correto.
- **F-41 (Realtime nunca funcionou para o Player):** o WebSocket do Realtime não passava pelo interceptor de JWT das chamadas HTTP e entrava como `anon`: filtro em `screens` falhava (`invalid column for filter id`, anon sem SELECT) e a RLS descartava todo evento; comandos e Tela Ativa dependiam só de polling (10 s / 60 s). Correção: `ensureRealtimeAuth()` importa o JWT do Player no Auth (antes de assinar e a cada ciclo do polling). Prova: `Screen Update Detected via CDC` e `COMMAND PACKET RECEIVED` pela primeira vez.
- **F-40:** o canal único pedia `playlists` e `devices`, fora da publicação `supabase_realtime`; o servidor recusa o canal inteiro. Canal próprio para `screens` (`yeloo_screens_channel`); assinatura de `devices` removida (cada heartbeat geraria evento/sync e a tabela tem `screen_token`); `playlists` publicada (migração `20261232`); nudge de sync só em MUDANÇA real de playlist (todo heartbeat atualiza `screens`).
- **F-36 Reiniciar Player:** só tentava reiniciar o APARELHO (Device Owner) e respondia "unsupported" em celular/TV Box comum. Agora `restartPlayerApp`: ack → `PlayerRestartActivity` (processo `:restart`, padrão ProcessPhoenix) encerra o processo e reabre pela Splash (mesmo fluxo do primeiro acesso: Sincronizando Mídias). Idempotente entre processos (`last_restart_command_id`); `reboot` entra no polling de segurança. Reinício físico continua como `reboot_device`. Prova: PID 4275→4478, ack `executed`, comando reentregue foi ignorado (sem laço).
- **F-37 Atualizar Player:** confirmava `executed` antes de sincronizar. Agora `updatePlayerNow`: sincroniza de fato (delta por hash, restart do laço só se a sequência mudou) e responde `executed`/`failed` pelo resultado real.
- **F-38 Tela Ativa:** ao bloquear, o laço de reprodução NÃO era cancelado (seguia tocando por baixo do aviso e o overlay era 90% preto, com a mídia visível). Agora o laço é cancelado, o overlay é opaco e a reativação retoma a reprodução. Prova: bloqueio 0,7 s após o UPDATE (antes ~35 s via polling), sem `PLAYBACK_LOOP` depois do bloqueio, tela de suporte opaca, reativação retomou a mídia.
- **Não alterado (achado):** `reportDownloadProgress`/`upsertDeviceHealth` também usam mapas heterogêneos (`Map<String, Any>`) e falham em silêncio no mesmo ponto; fora do escopo desta rodada.

### F-42 — `reportDownloadProgress` e `upsertDeviceHealth` nunca gravavam (mesma causa do ack, F-39) (MEDIUM) — FIXED (JVM + EMULADOR)
- **Causa:** as duas funções enviavam mapas heterogêneos (`Map<String, Any>` com `Int` e `String`; `buildMap<String, Any?>`) ao supabase-kt, que não serializa `Any`; o `catch` engolia o erro. `download_status` ficou com **0 linhas** mesmo com dezenas de downloads.
- **Prova RED (emulador Pixel_5):** mídia apagada do cache + comando `reload` → "Download complete, verified and persisted" e `download_status` continuou com 0 linhas. **GREEN:** mesma sequência com o APK novo → 1 linha (`progress=100`, `updated_at` em UTC correto). O `device_id` gravado é o `custom_id` da tela (a policy `fn_player_can_access_screen_text` aceita UUID ou custom_id).
- **Correção:** `JsonObject` nas duas; a falha de `reportDownloadProgress` agora vai para o log (`DOWNLOAD_STATUS`). `HeterogeneousMapSerializationTest` (3 testes; falhavam antes). JVM app 107/107, core-player 59/59.
- **Auditoria dos demais escritores:** todo `insert/update/upsert` restante do Player usa mapas só de String ou `@Serializable` (ok). `RealtimeManager.kt` é código morto.
- **Notas:** `upsertDeviceHealth` não tem chamador (o fallback foi substituído pelas RPCs `fn_device_heartbeat_v2`); a correção o deixa correto caso volte a ser usado. `download_status` não tem leitor no painel hoje (só o tipo gerado): os dados agora existem, a exibição no Dashboard é uma feature à parte.

### F-43 — Reativar a Tela Ativa não voltava a reproduzir (tablet físico: "Sincronizando" → logo sobre preto) (HIGH) — FIXED (JVM 110/110 + EMULADOR)
- **Sintoma (tablet):** desativar mostra o aviso (ok); reativar vai para "Sincronizando Mídias", fica um tempo e cai numa tela preta com o logo, sem reproduzir.
- **Causa:** o bloqueio (F-38) cancela o laço de reprodução e, pelo servidor (`SCREEN_SUSPENDED`), o Player apaga o cache local (`deleteAllPlaylists`/`deleteAllMediaItems`) mantendo `SessionManager.lastConfigHash`. A reativação só executava um sync silencioso, que reinicia o laço apenas se a playlist MUDAR; o próximo sync respondia "Config Unchanged and Cache Valid" e re-emitia de um banco vazio. Nada iniciava a reprodução até o timeout de 25 s do SyncGuard liberar a tela (logo sobre preto). Reproduzido no emulador esperando >60 s bloqueado: PLAYING só ~40 s depois. O teste anterior de F-38 reativou em 9 s (antes do apagamento) e por isso passou.
- **Correção:** (1) `resumeAfterReactivation()`: sincroniza, e com playlist pronta reinicia o laço explicitamente (`prepararPrimeiraMidia` + `startPlaybackLoop`); sem playlist cai no fluxo visível completo (`startSyncAndPlay`, com retry). (2) `PlayerRepositoryImpl`: ao apagar o cache por suspensão também zera `lastConfigHash`, forçando o re-download/re-salvamento no próximo sync. `ReactivationResumesPlaybackTest` (3, falhavam antes).
- **Prova (emulador, após >90 s bloqueado com 2 confirmações do servidor):** reativação → PLAYING em 0,5 s, SyncGuard liberado em 1,8 s, mídia na tela aos 4 s; ciclos curtos (8 s) → PLAYING em ~0,1 s.

### F-44 — Tela preta com o logo (e quadro preto) piscando antes da "Sincronizando Mídias" após escolher a tela (HIGH) — FIXED (JVM 116/116 + EMULADOR)
- **Regra do produto:** depois de escolher a tela o usuário vê SÓ a "Sincronizando Mídias"; nada antes, nada piscando por cima.
- **Causa (provada por `dumpsys activity top` na abertura a frio):** `standbyImage` (logo sobre preto, `padding=64dp`) nascia `visible` no layout e o `onCreate` ainda a mostrava de propósito ("Show Standby initially"); o overlay de sincronização nascia `gone` e só era travado depois. Sequência observada: `standby=V sync=G` (logo) → `standby=G sync=G` (~1,5 s de preto puro) → `sync=V`. Cadeia: `ScreenSelectionActivity → MainActivity` direto (a Splash não participa).
- **Correção:** (1) `standbyImage` sem logo (`@drawable/logo` removido) e `gone` por padrão — a tela preta com logo deixou de existir (fallbacks de falha mostram preto puro); (2) `sync_guard_overlay` nasce `visible`; (3) `onCreate` deixa de mostrar o standby e chama `syncGuard.lockScreen()` já no 1º quadro (arma o timer de segurança); (4) tema `Theme.Player.Main` (janela `#0F172A`, mesma cor da tela de sincronização) para não haver quadro preto antes do 1º desenho. `SyncScreenOnlyAfterSelectionTest` (6, falhavam antes).
- **Prova (emulador, abertura a frio):** `standby` = G em TODAS as amostras e `sync` = V desde a primeira até a mídia assumir; nenhuma amostra com as duas ocultas antes. Regressão Tela Ativa: bloqueio mostra o aviso, reativação volta a tocar em ~0,1 s.
- **Não alterado:** a `SplashActivity` de boot do aparelho (logo do app ao ligar) é outro fluxo e continua igual.

### F-45…F-53 — Auditoria forense da PLAYLIST (Painel → Banco → RPC → Player) + duração/agendamento por item (HIGH) — FIXED (JVM core 71 + app 133, vitest 32 novos, EMULADOR contra o banco real)
Cadeia auditada: `ScreenDetails` (Lista de Reprodução) e `PlaylistItemsDialog` (editor) → `playlist_items` (RLS) → RPC `get_player_playlist_for_screen` → DTO/`RemoteDataSource` → Room (`media_item`) → `QueueManager`/`SchedulingEngine` → motores de vídeo/imagem. Dado real: 35 itens de playlist, **0 com agendamento**; 2 playlists de produção com mídia repetida (7 itens, 6 mídias).
- **F-47 (a edição não chegava ao Player):** `calculateConfigSignature` só via `id:hash:ordem`. Mudar duração/horário/dias respondia "Config Unchanged and Cache Valid". Provado: banco 30→12 s + 08:00–23:00, Room seguiu com 30 s e sem horário. Agora `PlayerFlowPolicy.configSignature` (SHA-256 de tudo que o painel edita, incl. duração, horário, dias, áudio, resolução).
- **F-49 (agendamento com dias derrubava a sincronização inteira):** o RPC devolvia `days_of_week` como array JSON (`days integer[]`), o DTO lia String → "Expected beginning of the string, but got [" e o Player caía no cache offline sem receber mais nada. Provado no emulador. Correção dupla e retrocompatível: RPC entrega texto (`array_to_string`, migração `20261233`, vale para todos os Players já instalados) e o DTO aceita texto OU array (`FlexibleDaysSerializer`).
- **F-48 (mídia repetida corrompia a playlist):** `media_item.id` (PK) = id da mídia → a 2ª ocorrência sobrescrevia a 1ª (servidor A30,B15,A5 → Room B,A5) e `QueueManager` (cursor por id) nunca passava da repetida (A,B,A,C tocava A,B,A,B…). Linhas do Room com id único (`id`, `id~1`… só na persistência; domínio/arquivos/logs seguem com o id da mídia) e fila com cursor por posição. Prova: A,B,A → 3 linhas e ordem real `A B A A B A A B A`.
- **F-45 (fuso do agendamento):** `SchedulingEngine` usava `Calendar.getInstance()` (fuso do aparelho) sobre um relógio que já soma o fuso de Brasília; só acertava com o aparelho em UTC (emulador). Num tablet em America/Sao_Paulo a janela valia 3 h antes. `TimeManager.getSyncedCalendar()` agora entrega a hora local do Brasil em qualquer fuso do aparelho (testes com Sao_Paulo/UTC/Tokyo/Auckland).
- **F-46:** duração 0/negativa (o painel permitia `min=0`) gerava imagem/widget de 0 s; `PlaybackDuration` (imagem/widget ≥ 10 s padrão; vídeo 0 = vídeo inteiro).
- **F-50 (painel: salvar destrutivo e sem agendamento):** `ScreenDetails.handleSavePlaylist` e `PlaylistItemsDialog.handleSave` faziam DELETE de tudo + INSERT em chamadas separadas (o editor nem checava o erro do DELETE) e o INSERT omitia `start_time/end_time/days`: agendamento nunca gravado e cada "Salvar" da tela apagava o existente; falha no INSERT deixava a playlist VAZIA. Nova RPC `fn_save_playlist_items` (migração `20261234`, SECURITY INVOKER = mesmas RLS): uma transação, valida tudo antes de apagar, normaliza (duração 1 s–24 h, dias 0–6, horários), mantém a mesma mídia repetida e avisa o Player. Testado em transação revertida: válido, item inválido (nada muda), dia/hora inválidos, usuário sem permissão.
- **F-51 (editar mídia sempre falhava):** `MediaUploadDialog` enviava `duration` para `media` (coluna inexistente → PGRST204, provado por chamada real) e, se funcionasse, sobrescreveria a duração de todos os itens dessa mídia em todas as playlists. Removido; só propaga se o usuário alterou o campo.
- **F-52 (painel):** edições não salvas eram descartadas em silêncio quando a tela recarregava (heartbeat/foco); duração de widget travada no editor; lixeira só aparecia com hover (invisível no celular); reordenar só por arrastar (não funciona no toque, agora há setas); vídeo entrava com 10 s e o Player usa a duração do item como TETO (vídeo cortado) — agora a duração é lida dos metadados do vídeo.
- **Feature pedida:** na Lista de Reprodução da tela cada item tem **duração + agendamento (horário e dias) + lixeira**, os mesmos controles do editor (`PlaylistItemControls`), tudo salvo pelo caminho atômico. Prova de ponta a ponta no emulador (gravação no formato do painel, chegada só por Realtime): durações 12/20 s aplicadas, agenda com dias como texto sem quebrar a sync, janela fora/dentro do horário, janela que atravessa a meia-noite (23:04–00:04) e dia da semana certo/errado filtrando corretamente.
- **Achados NÃO alterados (ficam para decisão):** (a) links externos não chegam ao Player (o RPC não envia `external_link` e o mapeamento os trata como widget); nenhum dado real usa links; (b) `get_player_playlist_for_screen` é executável por `anon` (a checagem de dono só roda com usuário autenticado); (c) `publicar_playlist_cliente` (portal do cliente) espelha a playlist apagando e recriando os itens (por desenho, apaga agendamentos ao republicar); (d) `registerPlayProof` segue com o desvio de 3 h (F-32); (e) o fuso do agendamento é fixo em GMT-3 (não há tela para mudar `TimeManager.setTimeZoneOffset`); (f) 1 teste do front (dimensão do `logo.png` do Android, 1024×277) já falhava e não tem relação.

### F-54 — Upload de Mídias: "Tempo de Mídia" não mostrava o tempo da mídia adicionada (MEDIUM) — FIXED (vitest 46, incl. teste de tela)
- **Pedido do proprietário:** toda mídia adicionada na tela de Upload deve entrar JÁ com o tempo dela no campo "Tempo de Mídia".
- **Antes:** o campo nascia em 10 s para qualquer arquivo (a tabela `media` não guarda duração), aceitava no máximo 120 s (vídeo/áudio de 3 min nem cabia) e o mesmo valor ia para todos os arquivos do lote — e, como o Player usa a duração do item como TETO, um vídeo de 60 s entrava na playlist cortado em 10 s.
- **Agora:** ao adicionar o arquivo, `probeFileDuration` lê a duração real dos metadados do ARQUIVO LOCAL (nada é enviado) e preenche o campo: vídeo/áudio = duração real; imagem (sem duração própria) = 10 s; leitura impossível = 10 s (nunca 0). O campo acompanha a última mídia adicionada, aceita até 24 h e mostra o equivalente ("= 3m 5s"); a linha de cada arquivo mostra o tempo dele. Cada arquivo do lote entra na playlist com o SEU tempo, a menos que o usuário digite outro valor (vale para todos). Ao substituir o arquivo de uma mídia existente, o tempo novo é o que será salvo; ao abrir a edição de uma mídia existente (vídeo/áudio) o campo mostra o tempo real dela sem contar como alteração. `defaultDurationForFile`/`durationForUpload`/`probeFileDuration` + `uploadDialogDuration.render.test.tsx`.

### F-55 — Botão "Duplicar mídia" na Lista de Reprodução e no editor da playlist (FEATURE) — DONE (vitest 43 + EMULADOR)
- **Pedido do proprietário:** ao lado de duração, agendamento e lixeira, um botão de duplicar a mídia, conectado e funcional com o sistema.
- **Comportamento:** `duplicateItem` (lib pura, imutável) insere a cópia logo depois do original, com a MESMA mídia/widget/link, duração e agendamento (id provisório único; dias clonados: a cópia é independente). O botão (`ItemDuplicateButton`, ícone de cópia, "Duplicar mídia") fica entre o agendamento e a lixeira, nas duas telas (Lista de Reprodução da tela e editor da playlist). A cópia vale ao clicar em "Salvar Alterações" (gravação atômica).
- **Conexão com o sistema (cadeia provada):** o RPC `fn_save_playlist_items` aceita a mesma mídia repetida e grava duração/agenda da cópia; o Player (5.3.5, F-48) mantém uma linha por item (`id`, `id~1`) e a fila avança por posição. Emulador: banco com A, A(cópia), B → Room com 3 linhas (cópia com a mesma agenda) chegando só por Realtime → ordem real em regime `A A B | A A B | A A B`. Sem mudança de banco nem de Player.

### F-56 — Motor de reprodução profissional do Player: tempo exato + transições sem buraco preto (5.4.0) — DONE (JVM 22 testes + EMULADOR nos dois perfis de hardware)
- **Pedido do proprietário:** cada mídia tocar SEMPRE no tempo em que foi adicionada e transições iguais ou melhores que as de um player de sinalização comercial.
- **Referências de mercado:** Xibo (transição de entrada dentro da duração, a de saída SOMA à duração: inconsistência reconhecida); Yodeck (25+ transições, só entre imagens e não em 4K); BrightSign (crossfade de imagens, sem transição vídeo→vídeo); Screenly/Anthias (flash preto de 100-200 ms entre ativos). Meta do SOBRE MÍDIA: cruzamento em TODOS os pares, dentro da janela do item que entra, sem quadro preto e com o tempo exato.
- **Linha de base (motor 5.3.5, emulador):** vídeo de 6 s durava 7,06-7,32 s (+18-22%), 3 buracos pretos de 713-864 ms em ~72 s, todas as viradas eram corte seco, imagem→imagem piscava (Glide limpava a view), imagem ~+1 s quando seguida de vídeo.
- **Causa raiz:** cada item media o tempo a partir do início do PREPARO (o preparo do decoder entrava na conta); o próximo item só era preparado depois de o anterior acabar; a virada era troca instantânea de visibilidade.
- **Correção (novo `playback/PlaybackStage` + `PlaybackTimeline` + `TransitionPolicy` + `VideoFillPlan` + `LayerCrossfader`; `MainActivity` só delega):** (1) prazos ABSOLUTOS por item (janela [início, fim] = duração exata; sem deriva; item pronto antes do prazo espera, muito atrasado começa na hora com o tempo completo); (2) pré-carga do próximo item (imagem em camada ociosa; vídeo no outro decodificador) antes do fim do atual; (3) cruzamento de 500 ms (máx. 1/4 do item, "corte" respeitado) só depois de a nova mídia estar opaca e com o 1º quadro pronto; (4) vídeo maior que o tempo configurado é cortado no prazo; menor é repetido para preencher; (5) TV Box de decodificador único (perfil LEGACY): próximo vídeo ANEXADO à playlist do player atual (`ExoPlayerRenderer.appendNext/adoptCurrent/removeAppended`), virada gapless forçada no prazo; com imagem na tela o vídeo seguinte é pré-carregado normalmente.
- **Medição (emulador; playlist I 4s, I 4s, V 6s, V 6s, I 4s; 18 itens):** LEGADO (decodificador único) erro médio 5 ms / pior 101 ms, 0 buracos pretos; DECODIFICADOR DUPLO (forçado por `files/force_dual_decoder`, só depuração) erro médio 4 ms / pior 65 ms, 0 buracos, cruzamento também vídeo→vídeo. Vídeo repetido para preencher 20 s: 20,003 s; cortado em 3 s: 3,001 s. Antes: +700 ms a +1,2 s e 3 buracos pretos.
- **Instrumentação de depuração (desligada por padrão):** `PlaybackProbe` (só com `files/probe_enabled`) mede a luminância da janela ~25×/s e loga `PROBE_BLACK`; logs `PLAYBACK_SLOT show/end` dão o tempo real de cada item.
- **Limites conhecidos:** medição feita no emulador (Pixel_5); o ganho no TV Box físico deve ser homologado em Canary antes de distribuir à frota (AGENTS.md §14).

### F-57 — "Estatísticas de Exibição" paravam de contar desde 22-23/09 (BUG) — DONE (DB + painel + Player; vitest + JVM + EMULADOR)
- **Sintoma:** o Player exibia as mídias e o gráfico do painel não refletia (zerado/incompleto a partir de 23-24/09).
- **Causa raiz 1 (painel):** o gráfico baixava TODAS as linhas de `playback_logs` do período e contava no navegador; o PostgREST corta em 1000 linhas. Telas reais (`Mídia indoor`) passaram de 1000 exibições/dia (22/09: 1032; 23/09: 1228). Prova: consulta de 7 dias devolvia 1000 de 2875 linhas (o mesmo em Analytics e no Portal do Anunciante, `customerPortalData`).
- **Causa raiz 2 (Player):** o cofre `analytics_vault.json` só era enviado à meia-noite (troca de dia) ou no boot. "Hoje" ficava vazio o dia todo e uma queda do aparelho adiava tudo (tela `ACADEMIA TELA 1`: 8 logs no dia; `Mídia indoor` só recebia o lote às 00:00). Havia ainda uma corrida (gravar durante o envio + `file.delete()` apagava exibições novas) e o carimbo `played_at` saía em hora LOCAL com sufixo "Z" (3 h errado; à noite caía no dia errado). Ids duplicados (`abc~1`) iam como mídia inexistente.
- **Correção:** migração `20261235` — `fn_playback_stats` (agrega por hora/dia no banco, fuso do navegador) e `fn_playback_totals` (total + última exibição por tela), ambas SECURITY INVOKER (a RLS de `pbl_select_own` continua valendo), `anon` negado; índice `(screen_id, started_at desc)`. Painel: `src/lib/playbackStats.ts` usado por ScreenDetails, Analytics e Portal do Anunciante. Player 5.5.0: envio a cada exibição (máx. 1 por 30 s) + a cada batimento de 60 s; lote em arquivo `.sending` (só apagado com a confirmação do servidor; falha mantém tudo); timestamp UTC; id sem `~N`.
- **Prova:** RPC devolve 2875/2875 (antigo: 1000/2875), soma igual ao SQL direto; `anon` → 401; gráfico do painel na tela de homologação mostra 1093 em 24/09. Testes: `playbackStats.test.ts` (5), `AnalyticsFormatTest` (2).

### F-58 — Widgets: fundos não salvavam/apareciam e o Player ignorava o fundo (BUG) — DONE (Edge Function + painel + Player; EMULADOR com 3 widgets)
- **Pedido:** cada widget (Relógio, Clima, Notícias RSS) com a imagem de fundo escolhida pelo cliente, reproduzida no Player Android; várias imagens/vários widgets.
- **Causas raiz:** (1) a Edge Function `list-media-objects` nunca foi publicada (404) — a Galeria de Fundo não listava nenhuma imagem enviada; (2) mesmo publicada, a assinatura SigV4 ordenava os parâmetros com `localeCompare` (o R2 exige ordem por byte) → 502 — corrigido no fonte; (3) RSS exigia imagem de fundo e a prévia do RSS era um texto fixo (não lia o feed); a prévia do Clima só buscava dados com cidade injetada pelo Android; (4) **Player:** `NativeWidgetEngine` só desenhava Relógio e Clima, **ignorava o fundo e as opções do painel** (lia chaves inexistentes `formato24h`/`text_color`, clima vinha da cidade por IP e não da latitude/longitude) e o RSS caía em "Widget não suportado"; (5) editar um widget não avisava o Player (só `playlists` está no Realtime).
- **Correção:** `list-media-objects` publicada e corrigida. Painel: upload comprime (1920 px, JPG), RSS sem fundo obrigatório mas com URL https validada, campo "Nome do local" (Clima), "Faixa compacta" (RSS), prévias reais (fetch-rss; clima imediato). Player 5.5.0: `WidgetSpec` (lê exatamente o que o painel grava; escolhe fundo Horizontal/Vertical pela orientação da tela, com fallback para a outra), Relógio (saudação, hora, segundos, data em pt-BR, fuso regional), Clima (Open-Meteo pela lat/long, sensação/umidade/vento, nome do local), Notícias (RSS/Atom, rotação por `scrollSpeed`, barra de tempo, modo compacto) — tudo com cache offline (fundo no Glide, dados em `WidgetDataCache`) e aquecimento do próximo widget pelo `PlaybackStage` (tempo exato). Migração `20261235`: gatilho `tr_widgets_touch_playlists` — editar widget "toca" as playlists que o usam e o Player ressincroniza pelo Realtime.
- **Prova (emulador, playlist imagem + Relógio azul + Clima vermelho + Notícias verde + imagem):** cada widget aparece com o SEU fundo (screenshots), notícias reais do g1, clima real; tempo exato (erro médio 3 ms, pior 128 ms, cache frio). Painel: envio de foto 3000×1688 → JPG comprimido → widget salvo com `config.backgroundImageLandscape`/`thumbnail_url`; galeria lista as imagens novas. Gatilho testado por rollback. Testes: `WidgetLogicTest` (13).
- **Pendências conhecidas (não alteradas):** a RPC do Player não filtra `widgets.is_active`; links externos ainda não chegam ao Player (F-48).

### F-59 — Galeria de Fundo: imagens quebradas ("undefined/…") em produção (BUG) — DONE (Edge Function + painel; provado com o build sem a variável)
- **Sintoma (print do proprietário):** ao escolher a imagem na Galeria do widget, todas as miniaturas apareciam pretas com o texto alternativo e a escolhida não aparecia no fundo do widget.
- **Causa raiz:** a galeria montava a URL com `getCdnUrl` = `VITE_R2_PUBLIC_DOMAIN`/`VITE_R2_CDN_DOMAIN` do BUILD, e a Vercel não tem essa variável (só as do Supabase) → `undefined/<chave>`. No ambiente local a variável existia, por isso F-58 não acusou.
- **Correção:** `list-media-objects` devolve `url` pública de cada objeto (calculada no servidor com o `R2_PUBLIC_DOMAIN` da própria função); `WidgetAssetsGallery` e `SocialAssetsGallery` usam `file.url` (com `getCdnUrl` só como reserva). Nenhuma dependência de variável de build.
- **Prova:** painel local iniciado com `VITE_R2_PUBLIC_DOMAIN` e `VITE_R2_CDN_DOMAIN` vazios (como na Vercel): 8/8 imagens da galeria carregam; ao selecionar, o fundo aparece na miniatura e na prévia do widget. URLs devolvidas → HTTP 200 image/jpeg|png.

### F-60 — Vídeo repetia o começo, cortava após poucos segundos e saía distorcido/borrado na repetição (REGRESSÃO 5.4.0) — DONE (JVM + EMULADOR com o vídeo real)
- **Sintoma (proprietário, tablet Multilaser M10 4G PRO / Unisoc SC9863a, ACADEMIA TELA 1):** o vídeo toca inteiro, volta ao início, toca 3-5 s e corta; na volta a imagem sai distorcida/borrada.
- **Causa raiz:** regra "repetir para preencher" que eu introduzi na 5.4.0 (`VideoFillPlan`, F-56): vídeo mais curto que o "Tempo de Mídia" ganhava `REPEAT_MODE_ONE` até o fim do tempo. Na playlist real, ACADEMIA 3 tem 17,7 s e está configurado em 23 s (repete 5,3 s) e ACADEMIA 6 tem 11,1 s configurado em 12 s. A volta ao início reinicia o decodificador no mesmo vídeo; no decodificador de hardware do Unisoc isso produziu a imagem distorcida (não reproduzível no emulador, que decodifica por software). Prova no emulador com o próprio arquivo ACADEMIA 3: 5.5.0 ocupou 23,02 s.
- **Correção (5.5.1, mínima):** vídeo mais curto que o tempo configurado toca INTEIRO uma única vez e a playlist segue (padrão BrightSign/Yodeck/Xibo e comportamento anterior à 5.4.0); mais longo continua cortado no tempo configurado. `REPEAT_MODE_OFF` sempre; imagens e widgets inalterados.
- **Prova:** emulador 5.5.1 com a mesma playlist: ACADEMIA 3 ocupa 17,76 s (a duração real), sem repetição; trecho escuro de ~1,5 s aos 9,7 s é conteúdo do próprio vídeo (mesma posição em todos os ciclos). JVM: `PlaybackEngineRulesTest` atualizado (vídeo curto nunca repete) + suítes core/sync/app verdes.

### F-61 — Tempo de Mídia dos vídeos diferente da duração real; painel sem milésimos (DADO + FEATURE) — DONE (migração + painel; vitest + navegador)
- **Pedido do proprietário:** revisar todos os vídeos; o Tempo de Mídia tem que ser exatamente o tamanho da mídia original, mostrando milésimos; decidir entre tempo real ou segundos cheios.
- **Auditoria (17 vídeos, 27 itens em playlists):** nenhum item tinha o tempo exato. A tabela `media` não guardava duração; o painel estimava pelo `<video>` (inteiro arredondado; MP4 fragmentado não é lido -> 10 s padrão). Itens das playlists reais antes x depois (s): HOTEL MAXSUEL #0 HORIZONTAL 3 58->45 (real 44,587), #3 HORIZONTAL 1 63->64 (64,000; cortava 1 s), #4 HORIZONTAL 3 10->45 (cortava 34,5 s), #5 HORIZONTAL 2 15->10 (10,000), #6 PARATESTE 10->31 (30,601), #7 PARATESTEUIYH 10->31 (30,080); Mídia indoor #0 ACADENIA 1 10->7 (6,928), #1 PARATESTEUIYH 20->31, #2 PARATESTE 10->31, #3 ACADEMIA 2 16 (15,180), #4 ACADEMIA 3 18 (17,764), #5 ACADEMIA 4 14->15 (14,116); MODELO ACADEMIA FITNESS #0 ACADENIA 1 7 (6,928), #1 ACADEMIA 2 15->16 (15,180), #2 ACADEMIA 3 23->18 (17,764), #4 ACADEMIA 4 13->15 (14,116; cortava 1,1 s), #5 ACADEMIA 5 15 (14,907), #6 ACADEMIA 6 12 (11,171), #7 ACADEMIA 7 15 (14,997). Playlists de teste (F17/Homolog) mantidas.
- **Decisão:** tocar pelo tempo REAL (com milésimos), sem mudar o contrato do Player. `playlist_items.duration` segue inteiro em segundos (Players 1.0/5.3.x da frota continuam lendo), e recebe o segundo cheio para cima; o Player 5.5.1 toca min(configurado, real) = exatamente a duração real (nem corta o final, nem sobra tela parada). A duração exata fica em `media.duration_ms` (coluna nova, aditiva) — mesma régua do ExoPlayer (maior entre `mvhd` e trilhas; ACADEMIA 3 = 17764 ms, igual ao medido no Player).
- **Correção:** migração `20261236` (coluna + preenchimento dos 17 vídeos + itens das playlists reais). Painel: `mp4Duration.ts` lê a duração exata das caixas do MP4 no próprio navegador (inclusive fragmentado); Upload mostra "Duração real: 17,764 s — a tela toca o vídeo inteiro" (ou avisa o corte) e grava `duration_ms`; Lista de Reprodução (tela e editor da playlist) mostra ao lado do tempo o que a tela toca com milésimos (verde = inteiro, amarelo = "corta"); vídeo novo na lista entra com o segundo cheio da duração real.
- **Prova:** leitor TS conferido nos 17 arquivos reais (mesmos valores do parser de referência); banco pós-migração com os 19 itens reais = ceil(real); navegador: itens de teste em 6 s mostram "corta · 30,080 s", ao digitar 31 vira "30,080 s" (toca inteiro), nada salvo. Testes: `mp4Duration.test.ts` (6), `uploadDialogDuration.render.test.tsx` (8), `uploadMediaDuration.test.ts`.

### F-62 — Teste da logo do Android falhando: o teste exigia um print do Android Studio (TESTE ERRADO) — DONE
- **Sintoma:** `visual-identity-assets.test.ts` #10 falhava (`expected 383 to be 1024`), única falha da suíte.
- **Causa raiz:** o teste (2026-09-17) fixou 1024x277 como "logo canônica", mas o arquivo com essas medidas (commit 9cb9bd3, 2026-02) era um PRINT da tela de erro de build do Android Studio salvo como `res/drawable/logo.png`. Em 2026-09-23 (d3c1a0c, 5.2.4) ele foi trocado pela logo oficial SOBRE MÍDIA (383x207), correta, e o teste ficou apontando para o print.
- **Correção:** o teste passa a exigir a logo oficial (383x207) e bloqueia o print (hash `60ada7fa40…`). Nenhuma imagem mudou.
- **Prova:** com a logo oficial: 11/11; recolocando o print temporariamente: o teste #10 falha (depois restaurado, sem diff).

### F-63 — Painel espremido no tablet: menu lateral fixo sem opção de fechar (BUG de responsividade) — DONE (Fase 1 do plano de Dashboards)
- **Sintoma (foto do proprietário, tablet 800 px):** botões e cards espremidos, títulos quebrados no meio da palavra, botões cortados.
- **Causa raiz (medida no navegador a 800 px):** os 4 layouts (Workspace Owner/Admin, CRM Representante, Gestor, Portal do Anunciante) mostravam o menu fixo a partir de 768/1024 px sem botão de fechar: 256 px de menu, 544 px de painel, e as grades das páginas usam o tamanho da TELA (md/lg), não o do painel -> cards de 149 px com títulos em 3-4 linhas.
- **Correção:** menu fixo só a partir de 1280 px, recolhível para barra de ícones (72/64 px, com dica e bolinha de não lidas) e lembrado por navegador (`useSidebarCollapsed`, chave por layout); abaixo de 1280 px o botão ☰ abre o menu por cima do conteúdo (gaveta), sem espremer o painel. `Logo iconOnly`. Nenhuma rota, guarda ou permissão alterada.
- **Prova:** painel a 800 px: 544 -> 800 px; gaveta abre e fecha ao navegar; 1440 px: recolher 256 -> 72 px (painel 1176 -> 1360) e continua recolhido após recarregar; sem rolagem lateral em 360/390/768/1024/1280/1920 (Workspace e Gestor). Portal validado por teste de renderização (conta de anunciante de teste exige troca de senha). Testes: `collapsibleSidebar.render.test.tsx` (3); regressão `centro-controle` atualizada (o teste congelava o texto `w-64 bg-slate-950`; agora verifica o menu próprio do Portal com 256/72 px). Suíte completa: 1490/1490.

### F-64 — "Central do Dia" do Owner/Admin substitui a tela inicial estática (FEATURE, Fase 2) — DONE
- **Antes:** Corporate Command Center 100% estático (Zero Trust, Cloudflare R2, Tenant) — nenhuma informação de trabalho.
- **Agora:** faixa de alertas (telas offline > 10 min, cobranças vencidas, vencendo em 7 dias, aprovações pendentes, mensagens não lidas — cada uma leva à tela onde se resolve) + 9 cards com "Expandir" e "Ver tudo": Financeiro do mês (recebido x previsto, a receber, vencido, recebimentos 30 dias), Cobranças (vencidas e a vencer, clicáveis até a cobrança), Telas (online/offline/sem playlist, offline clicáveis), Representantes (ranking do mês pela mesma RPC da tela Desempenho), Comercial (funil e contratos a terminar em 30 dias), Exibições (hoje e 7 dias), Agenda de hoje, Aprovações e mensagens, Atividade recente. Atualiza a cada 60 s. Grade `auto-fill minmax(19rem)`: 1 coluna no celular, 2 no tablet, 3 no notebook, 5 em 1920. Cards técnicos movidos para Configurações (OWNER/ADMIN).
- **Dados:** migração `20261237` — `fn_dashboard_resumo_owner` (SECURITY INVOKER: RLS de cada tabela vale; trava `is_central_privileged()`; anon negado). Prova de isolamento: Owner real -> 10 telas do seu tenant; Owner/Admin de homologação -> só o próprio tenant (3 / 0 telas); Representante e Anunciante -> `SEM_PERMISSAO` (sem a trava recebiam o resumo inteiro — por isso ela existe).
- **Testes:** `centralDoDia.test.tsx` (5: alertas, formatação, card expande/leva à tela, tela inteira com destinos de todos os cards); navegador: todos os cards com dados reais, clique na tela offline abre a tela.

### F-65 — "Central do Dia" dos demais perfis (FEATURE, Fase 3) + números fixos em 0 no painel do Gestor (BUG §6) — DONE
- **Representante (/representantes):** bloco "Seu dia" no topo (o conteúdo antigo continua igual): alertas (cobranças vencidas da carteira, contratos aguardando assinatura/pagamento, propostas em rascunho, cobranças vencendo, mensagens) + cards Minhas propostas, Meus contratos, Cobranças da carteira, Minha carteira, Agenda de hoje. Migração `20261238` `fn_dashboard_resumo_representante` (SECURITY INVOKER + filtro pelo representante de auth.uid(); sem representante -> SEM_PERMISSAO). Conferido com o banco: e2e-rep 20 propostas / 21 clientes = contagem direta; anunciante bloqueado. Abas do painel antigo passam a quebrar linha no celular (cortavam a 390 px).
- **Gestor de Mídias (/dashboard):** os 4 números do topo (Telas Ativas, Playlists, Mídias, Agendamentos) estavam FIXOS em "0" no código (violação AGENTS.md §6). Substituídos pela Central do Dia com dados reais: alertas (telas offline, sem playlist, dia sem exibição, mensagens) + cards Minhas telas, Exibições (hoje/7 dias das SUAS telas), Playlists (em uso e itens com agendamento), Mídias (com a duração exata F-61). Migração `20261239` `fn_dashboard_resumo_gestor` (mesmo recorte das telas completas: user_id = auth.uid()). Conferido: 4 telas / 3 playlists / 14 mídias = contagem direta. Resumo da frota e comandos remotos preservados.
- **Anunciante (/portal):** "Seu dia" acima das ações rápidas: alertas de faturas vencidas/a vencer e mensagens + cards Faturas e Minhas campanhas. Migração `20261240` `fn_dashboard_resumo_anunciante` (só o cliente de auth.uid()). A RLS de `contratos` não libera leitura ao anunciante (o portal usa `get_kpis_portal_anunciante`): contratos ficaram fora do resumo e a política NÃO foi alterada. Conferido: dois anunciantes veem só as próprias faturas (R$ 300 / R$ 450); representante bloqueado.
- **Financeiro e Supervisor:** na Central do Dia do Workspace veem só os cards e alertas da própria área (`cardsDoPerfil`, fonte oficial do perfil `perfil.nome || is_owner`); Owner/Admin/Gerente/Gestor veem tudo.
- **Testes:** `centralDoDiaPerfis.test.tsx` (7: visão por perfil, alertas de cada perfil, destinos dos cards dos 3 painéis); navegador: Representante e Gestor com dados reais a 390/800/1440 px sem nada fora da tela.

### F-66 — Widget Engine W1: correções de produção (relógio fora de Brasília, Links Externos sem salvar, widget desativado tocando) — DONE (Player 5.5.2 + migração 20261241)
- **Preflight forense (read-only)** do Widget Engine concluído em 2026-09-25 (matriz completa no relatório ao proprietário). Achados QUEBRADO/AJUSTE priorizados neste micro-gate.
- **Relógio (invariantes 11/12):** o Player usava o fuso descoberto por IP ou o do aparelho (`zone()`) e a hora do sistema (`TextClock`); a web usava o fuso/relógio do navegador. Agora: `BrasiliaTime` (Android) e `brasiliaTime.ts` (web) calculam sempre em `America/Sao_Paulo` a partir do instante UTC corrigido — Android `TimeManager.utcMillis()` (NTP), web `fn_server_now()` (hora do servidor, compensando metade da ida-e-volta). Atualização agendada na virada exata do segundo/minuto (sem deriva). Selo "HORÁRIO DE BRASÍLIA" no widget.
  - Prova automatizada: instante UTC fixo 17:37:52Z -> "14:37:52 / SEXTA-FEIRA · 25 DE SETEMBRO DE 2026" com o aparelho em UTC, Tóquio, Nova York, Lisboa, Manaus e São Paulo; virada do dia 02:59:59Z -> 23:59:59 do dia 25 e 00:00:00 de SÁBADO 26; virada de segundo/minuto (`BrasiliaTimeTest` 4, `brasiliaTime.test.ts` 4, rodado com TZ do processo em Asia/Tokyo e UTC).
  - Prova no emulador: aparelho em Asia/Tokyo marcando 03:41:03 -> widget exibindo 15:41:03 (Brasília). Sem ANR do app e sem quadros pulados com o relógio na tela (um ANR "onStopJob" do WorkManager ocorreu só na abertura a frio logo após a troca de fuso do emulador, antes do widget; na segunda abertura, 0 ANR do app).
- **Links Externos:** a tela grava `external_links.embed_code`, coluna inexistente -> `42703` e nenhum link salvava (tabela vazia). Coluna criada (aditiva). Prova: inserção igual à da tela -> 201 (registro de teste apagado).
- **Widget desativado:** `get_player_playlist_for_screen` enviava widgets com `is_active = false`. Agora o item não é enviado (contrato do payload inalterado). Prova em transação desfeita: ativo -> enviado (1), desativado -> 0, demais 5 itens intactos. Permissões da função preservadas.

### F-67 — Widget Engine W2: fundação (Galeria de Widgets, Meus Widgets completo, fundo referenciado e protegido) — DONE (painel; sem mudança de banco/Player)
- **Galeria de Widgets ≠ Meus Widgets:** nova aba "Galeria de Widgets" = catálogo de MODELOS (`src/lib/widgetCatalog.ts`, 11 modelos: Relógio, Clima, RSS, Clima Futurista, Relógio Futurista, Institucional, Oferta, Publicidade, Social, YouTube, Instagram). Só os 3 que o Android Player já desenha podem ser criados; os demais aparecem "Em breve"/"Em construção" (nada dado como pronto só por existir na tela). "Usar este modelo" abre o formulário já no tipo; o modelo fica em `widgets.config.template` (mesma tabela, sem estrutura paralela; widgets antigos = modelo clássico do tipo).
- **Meus Widgets:** prévia (horizontal/vertical), editar, duplicar (mesma configuração e referência de fundo, sem copiar o arquivo), ativar/desativar direto no card (desativado sai das telas — W1), excluir; card mostra tipo, modelo e fundo.
- **Fundo como asset referenciado:** a identidade do fundo é o arquivo no R2 (`chaveDoFundo`: um arquivo, vários widgets). A Galeria de Fundo bloqueia excluir imagem em uso e lista os widgets que a usam (antes a exclusão quebrava esses widgets em silêncio). Sem tabela nova de assets (decisão: não criar um segundo sistema de assets; a pasta do R2 continua sendo a Galeria).
- **Prova (navegador, owner de homologação):** catálogo 11 modelos / 3 disponíveis; widget criado pelo modelo aparece em Meus Widgets com "Relógio + Data"; duplicar cria "(cópia)"; switch desativa; prévia mostra fundo e "HORÁRIO DE BRASÍLIA"; excluir o fundo em uso é bloqueado com "Esta imagem é o fundo de: W2 Relógio teste (cópia), W2 Relógio teste" e a imagem permanece. Dados de teste removidos. Testes: `widgetFoundation.test.tsx` (6).

### F-68 — Widget Engine W3: Clima Futurista (painel + Player 5.5.3) — DONE
- **Dados separados do visual:** web `src/lib/weatherData.ts` e Android `WeatherText.parseForecast` leem a mesma resposta da Open-Meteo (atual + bloco `daily`: máxima, mínima e 6 dias, fuso America/Sao_Paulo); local com UF ("Recife — PE", BigDataCloud, ignora "Região Metropolitana"). Os modelos só apresentam.
- **Modelo "Clima Futurista":** identidade SOBRE MÍDIA (#22004A/#5D1BFF/#8A2EFF, brilho #B04DFF, selo amarelo #FFD400 "CLIMA AGORA"), cidade, ícone, temperatura com glow, chips MÁX/SENSAÇÃO/MÍN e 5 dias em painéis de vidro ("HOJE" destacado). Com foto da Galeria, véu roxo em gradiente garante a leitura. Estados: carregando / pronto / indisponível ("Clima indisponível no momento" — nunca tela vazia). Web: `WeatherFuturista.tsx` (prévia e player web; medidas relativas ao contêiner — `container-type: size`). Android: `buildWeatherFuturista` (+ `fundoMarca`/`cabecalhoMarca` reutilizáveis). Catálogo marca o modelo como disponível; o formulário tem seletor de Modelo.
- **Achados no teste:** (1) o cache de clima do aparelho guardava respostas da versão anterior, sem previsão, por 15 min -> chave `weather2:` (respostas antigas não são reaproveitadas); (2) o brilho da temperatura era recortado e desenhava um retângulo -> raio menor + padding igual ao raio.
- **Prova:** prévia no painel (horizontal e vertical com foto) com dados reais de Recife; widget salvo com `config.template = weather-futurista`, latitude e fundo; no emulador (Player 5.5.3) cidade, 27 °C, chips e 5 dias corretos, 0 ANR. Testes: `WidgetLogicTest` +4 (previsão, ausência de previsão, rótulo dos dias, modelo), `weatherData.test.ts` (3). Dados de teste removidos.

### F-69 — Widget Engine W4: Relógio Futurista (painel + Player) — DONE
- Modelo "Relógio Futurista" sobre a base do W1 (sempre Horário de Brasília, relógio sincronizado): fundo e cabeçalho da identidade (reuso de `fundoMarca`/`cabecalhoMarca` do W3), selo amarelo "HORÁRIO DE BRASÍLIA", saudação, hora grande com glow (sem recorte), data longa em pílula; aceita foto da Galeria com véu roxo. Web `ClockFuturista.tsx` (prévia e player web) e Android `buildClockFuturista`; catálogo marca como disponível.
- **Prova:** prévia no painel = 16:09 com Brasília 16:09; emulador (aparelho em UTC) 19:10:56 -> widget 16:10:56 e, 16 s depois, 19:11:12 -> 16:11:12 (andando e virando o minuto), 0 ANR. Dados de teste removidos.

### F-70 — Widget Engine W5: QR Code gerado na hora (painel + Player) — DONE
- **Uma regra de conteúdo nos dois lados:** web `src/lib/qrCode.ts` e Android `widget/QrCode.kt` aceitam só `https://`/`http://`, `tel:`, `mailto:` e domínio sem esquema (vira `https://`), até 1000 caracteres; qualquer outra coisa (ex.: `javascript:`) não gera QR — o widget simplesmente não mostra o bloco, nunca quebra.
- **Sem imagem salva:** o QR é desenhado a partir de `widgets.config.qrConteudo` (web: pacote `qrcode`, SVG; Android: `com.google.zxing:core` 3.5.3, bitmap), correção de erro M, margem 1, módulos #22004A sobre branco. Não cria asset nem tabela.
- **Testes:** `qrCode.test.ts` (3: conteúdos aceitos/recusados, SVG gerado), `QrCodeTest` (4, inclusive ida-e-volta: o QR gerado é LIDO de volta pelo decodificador do zxing com o mesmo texto).

### F-71 — Widget Engine W6: modelo Institucional / Aviso (painel + Player 5.5.4) — DONE
- Novo tipo `institutional` na MESMA tabela `widgets` (tipo + `config`; sem estrutura paralela): selo, título, texto, até 6 linhas "rótulo — valor" (horários, preços de serviço, avisos), contato, endereço, site, chamada (botão) e QR com legenda. Formulário valida título obrigatório e QR permitido (F-70). Aceita foto da Galeria com véu roxo.
- Visual da identidade SOBRE MÍDIA (reuso de `fundoMarca`/`cabecalhoMarca`/`vidro`/`pill`); horizontal = texto + QR lado a lado, vertical = empilhado. Web `InstitutionalWidget.tsx` (prévia e player web); Android `buildInstitutional` + `WidgetKind.INSTITUTIONAL` (widgets antigos inalterados).
- **Prova:** widget "Horário de funcionamento" criado pelo painel (owner de homologação), prévia horizontal e vertical com QR; na tela de homologação o Player desenhou título, texto, 2 linhas de horário, contato/site, chamada "Matricule-se já" e QR com legenda; 0 ANR. Testes: `WidgetLogicTest` +1 (leitura do modelo), `widgetFoundation.test.tsx` (catálogo com Institucional disponível). Playlist de homologação restaurada e widget de teste apagado.

### F-72 — Widget Engine W7: widget de Oferta a partir do cadastro de ofertas (painel + Player 5.5.5 + migração 20261242) — DONE
- **Sem duplicar preço/produto:** o widget guarda só `config.ofertaId`. Produtos, preços, desconto e validade vêm de `ofertas`/`oferta_itens`/`produtos` (o mesmo cadastro da tela Ofertas do Portal). Painel: `src/lib/ofertaWidget.ts` lê a oferta com a permissão de quem está logado (RLS); o formulário lista as ofertas visíveis e avisa quando a escolhida não está no ar.
- **Até a tela:** `get_player_playlist_for_screen` passa a enviar `config` resolvido (`fn_widget_config_resolvido`: gravado + `oferta` atual de `fn_widget_oferta_dados`, até 6 itens, só produtos ativos) — NUNCA gravado no widget. Como o Player monta o hash do item pela URL do config, preço novo = item novo, sem mudar o sync. Players antigos ignoram a chave (`ignoreUnknownKeys`).
- **Nunca preço vencido:** oferta fora do ar (status fora de APPROVED/SCHEDULED/PUBLISHED — a regra da tela Ofertas — fora das datas no dia de Brasília, ou sem itens) não vai para a tela (`fn_widget_pode_exibir`); o Player também confere a data (Brasília) para o caso offline e mostra "Novas ofertas em breve" sem preço. O sync de 60 s do Player pega as viradas de data.
- **Atualização automática:** gatilhos em `ofertas`, `oferta_itens` e `produtos` tocam só as playlists com widget daquela oferta (Realtime -> Player ressincroniza, mesmo caminho do F-58).
- **Visual:** identidade SOBRE MÍDIA; 1 produto = destaque (foto, selo -%, nome, marca/unidade, "DE R$ X POR", preço de varejo com centavos no alto); 2 a 6 = grade (3 colunas na horizontal, 2 na vertical); QR opcional; "Válido até dd/mm". Web `OfferWidget.tsx`; Android `buildOffer` + `widget/Oferta.kt` (regras testáveis).
- **Prova:**
  - Banco (transações desfeitas): oferta vigente enviada com título e preço atual e nada gravado no widget; preço alterado chega; vencida, rascunho e sem itens NÃO são enviadas; demais 5 itens intactos. Gatilhos: item/produto/oferta tocam a playlist, outra oferta não. Payload das 8 telas idêntico antes/depois da migração.
  - Painel: widget criado pela Galeria com a oferta real; prévia horizontal e vertical com dados do cadastro; `widgets.config` = só `ofertaId`/QR.
  - Emulador (5.5.5): oferta desenhada com R$ 14,90; preço mudado no cadastro para 12,90 + 3 produtos novos -> em ~2 s o Player recebeu o aviso do Realtime, ressincronizou e mostrou a grade com 12,90 (-35%); 0 ANR.
  - Testes: `ofertaWidget.test.tsx` (4), `OfertaWidgetTest` (3). Dados de teste apagados, playlist restaurada.

### F-73 — Widgets nativos montados na orientação errada (BUG, Player) — FIXED (5.5.5)
- **Sintoma:** no teste do W7, a oferta em tela deitada saiu empilhada e o preço ficou fora da tela; revendo o W6, o Institucional também tinha saído empilhado (não percebido na homologação do F-71).
- **Causa raiz (log):** `render OFFER 1080x2138 (container 0x0)` — o widget é montado antes do contêiner ser medido e `sizeOf` caía no tamanho do DISPLAY, que não é o do canvas do Player quando ele está girado (celular, totem na TV Box). Efeito em todos os widgets: modelo na orientação errada e fundo vertical escolhido em tela deitada.
- **Correção mínima (só no motor de widgets):** usa o ancestral já medido mais próximo (medidas no próprio canvas); display só em último caso. Log de diagnóstico do tamanho mantido.
- **Prova:** depois: `render OFFER 2204x1080`; Institucional refeito na tela = texto à esquerda e QR à direita (igual à prévia do painel); relógio/clima usam o menor lado (inalterado). 0 ANR.

### OPEN FINDINGS registrados no W7 (fora do escopo, não alterados)
- **OF-W7-1 — Encarte nunca lista ofertas:** `customerCommerce.service.ts > listarOfertasParaEncarte` filtra `status = 'ATIVA'`, valor que a constraint `ofertas_status_check` não permite -> sempre vazio. Correção sugerida: usar os status no ar (APPROVED/SCHEDULED/PUBLISHED). Requer validar a tela Encarte do Portal.
- **OF-W7-2 — `tsc --noEmit` com 185 erros pré-existentes** (tipos gerados do Supabase desatualizados: CRM, MediaUploadDialog, ExternalLinks, testes CRM). Nenhum nos arquivos dos widgets; o build do Vercel (vite) não depende disso. Correção: regenerar `types.ts` e ajustar os usos, em micro-gate próprio.

### F-74 — Widget Engine W8: widget de Publicidade a partir da campanha (painel + Player 5.5.6 + migração 20261243) — DONE
- **Sem duplicar criativo:** o widget guarda só `config.campanhaId` (+ chamada e QR próprios do widget). Título, datas, status e criativos vêm de `campanhas`/`campanha_midias` (o mesmo cadastro do Portal; arquivos no bucket público `campanhas_midia`). Painel: `src/lib/campanhaWidget.ts` (RLS de campanhas); formulário lista as campanhas e avisa quando a escolhida não está no ar ou não tem criativo em imagem.
- **Até a tela:** `fn_widget_config_resolvido` ganhou o ramo `advertising` (`fn_widget_campanha_dados`: até 6 criativos em IMAGEM, URL pública igual à do painel). `get_player_playlist_for_screen` NÃO mudou (já usa os helpers do W7). Vídeos da campanha ficam fora do widget (vão como mídia comum).
- **Só no ar:** status APPROVED/ACTIVE, não excluída (`deleted_at`), dentro das datas no dia de Brasília e com ao menos 1 criativo; senão o item não vai para a tela. Player confere de novo (offline) e mostra "Anuncie aqui" sem criativo.
- **Atualização automática:** gatilhos em `campanhas` e `campanha_midias` tocam só as playlists com widget daquela campanha.
- **Visual:** identidade SOBRE MÍDIA; criativo inteiro (sem corte) + coluna com título, chamada e QR (horizontal) ou faixa abaixo (vertical); 2+ criativos alternam a cada 8 s com fade (mesmo tempo no painel e no Player).
- **Prova:**
  - Banco (transações desfeitas): ativa enviada só com a imagem (vídeo fora), URL pública correta, chamada, nada gravado no widget, oferta do W7 continua indo no mesmo payload; novo criativo toca a playlist, outra campanha não; pausada, vencida, excluída e só-vídeo NÃO vão. O primeiro teste usou `current_date` (UTC, 01:34 do dia 26) e a regra respondeu pelo dia de Brasília (25) — prova acidental da virada de data correta. Payload das 8 telas idêntico antes/depois da migração.
  - Ponta a ponta com campanha REAL (linha + 2 criativos enviados ao bucket como o Portal faz): widget criado pela Galeria, prévia com os criativos alternando; `widgets.config` = só referência; emulador (5.5.6) com criativo + título + "Compre já" + QR e, 9 s depois, o 2º criativo; campanha pausada no cadastro -> aviso do Realtime em ~1 s e a publicidade saiu da tela (60 s só com as 5 mídias). 0 ANR do app.
  - Observação: um criativo de 5,5 MB passou do limite de 4 s na primeira carga (emulador recém-ligado); o widget mostrou o que tinha e, na volta seguinte, os dois vieram do cache (Glide continua o download). Recomendação (não bloqueante): comprimir criativos no envio do Portal, como a Galeria de Fundo faz.
  - Testes: `campanhaWidget.test.tsx` (3), `CampanhaWidgetTest` (2). Dados de teste (campanha, criativos no bucket, widget) apagados; playlist restaurada.

### F-75 — Widget Engine W9: YouTube (player oficial), Instagram e Conteúdo Social (painel + Player 5.5.7) — DONE
- **YouTube só pelo player OFICIAL:** o widget guarda o link; `src/lib/youtube.ts` e `widget/Social.kt > YoutubeLink` (mesmas regras, testadas dos dois lados) aceitam vídeo, Shorts, live, embed, playlist e id de canal "UC..." (vira a playlist de envios); recusam @handle (exige API), outros sites e domínios falsos. Toca pelo embed `youtube-nocookie.com` mudo, sem controles e em loop — nada é baixado ou raspado.
  - Web: iframe (prévia e player web) com estados carregando / link inválido / sem internet.
  - Player: WebView criado SÓ para o item, com página de origem https (o YouTube recusa embed sem origem), sem navegação para fora do player, sem acesso a arquivo; destruído quando o item sai da tela (TV Box fraca não acumula vídeo/memória). Sem internet ou erro da página principal: cartão "Vídeo indisponível…" (nunca tela preta).
- **Instagram e Conteúdo Social com o que o usuário envia:** imagem do post (upload ou Galeria de Fundo), perfil (@), autor, título, texto e QR; rede escolhida no Social (Instagram, Facebook, TikTok, LinkedIn, X, geral), Instagram sempre Instagram. A tela não busca nada na rede social. A imagem do post entra na proteção da Galeria de Fundo (não pode ser apagada em uso — W2).
- **Galeria de Widgets completa:** os 11 modelos agora são desenhados pelo Player (nenhum "Em breve").
- **Prova:** painel — YouTube reconhecido e tocando na prévia pelo player oficial; Instagram com imagem da Galeria, perfil, título, texto e QR; `widgets.config` só com o que o usuário informou. Emulador (5.5.7): Big Buck Bunny tocando no player oficial (mudo) dentro do widget; post do Instagram com imagem, avatar no degradê do Instagram, @perfil, título, texto e QR; rede do aparelho desligada -> "Vídeo indisponível sem internet" e religada depois. 0 ANR / 0 crash. Testes: `youtubeSocialWidget.test.tsx` (6), `SocialYoutubeWidgetTest` (2), catálogo atualizado. Widgets de teste apagados; playlist restaurada.
- **Nota de teste (W8, registrada por transparência):** numa execução completa concorrente (emulador + Vite + Gradle + edições em `src`), o teste "nenhum token administrativo (sbp_) exposto em código frontend" falhou 1 vez. Investigado: nenhum `sbp_` em código de runtime, nas alterações (staged/working), em arquivos novos nem nos commits do dia; o teste passa isolado e as suítes de regressão+segurança passaram (272/272). Tratado como leitura concorrente transitória; a suíte completa final confirma.

### OPEN FINDINGS registrados no W9 (fora do escopo, não alterados)
- **OF-W9-1 — Links Externos não chegam à tela:** `playlist_items.external_link_id` existe e o Player tem o ramo de link, mas `get_player_playlist_for_screen` não envia `external_link` e o motor nativo mostra "Widget não suportado" para páginas web. Hoje 0 links cadastrados (sem impacto). Correção exige decidir quais páginas podem abrir na TV (WebView com lista de domínios permitidos) + RPC aditiva; para vídeo do YouTube usar o widget YouTube (W9).
- **OF-W9-2 — Instagram oficial automático (oEmbed/Graph API)** exige app e token da Meta (não existem no projeto). Entregue o modelo por imagem enviada (sem raspagem). Automatizar requer o proprietário criar o app Meta e aprovar as permissões.

### F-76 — Widget Engine W10: reauditoria final (2026-09-26) — DONE
| Modelo | Fonte dos dados (sem duplicar) | Painel | Player nativo | Prova |
|---|---|---|---|---|
| Relógio clássico / Futurista | Horário de Brasília (NTP no Player, `fn_server_now` na web) | ✔ | ✔ | F-66, F-69 |
| Clima clássico / Futurista | Open-Meteo + local com UF (cache offline) | ✔ | ✔ | F-68 |
| Notícias (RSS) | feed do usuário (cache offline) | ✔ | ✔ | pré-existente |
| Institucional / Aviso | `widgets.config` | ✔ | ✔ | F-71 (+F-73) |
| Oferta em destaque | `ofertas`/`oferta_itens`/`produtos` resolvidos no servidor | ✔ | ✔ | F-72 |
| Publicidade | `campanhas`/`campanha_midias` resolvidos no servidor | ✔ | ✔ | F-74 |
| Conteúdo Social / Instagram | post enviado pelo usuário (imagem da Galeria) | ✔ | ✔ | F-75 |
| YouTube | player oficial (embed) | ✔ | ✔ (WebView do item) | F-75 |
| QR Code (todos os modelos) | gerado na hora | ✔ | ✔ | F-70 |
- **Invariantes conferidas:** relógio sempre em America/Sao_Paulo; nenhuma cópia de produto, preço, campanha ou criativo (widget guarda só referência — conferido em `widgets.config`); oferta/campanha fora do ar nunca vai para a tela (servidor) e o Player confere a data de Brasília offline; mudança no cadastro ressincroniza as telas via Realtime (provado ~1-2 s); Galeria de Widgets ≠ Meus Widgets; fundo/imagem em uso protegidos; sem raspagem de rede social.
- **Banco:** helpers `fn_widget_*` só executáveis pelo dono (API pública: 401 permission denied); funções de gatilho não publicadas pela API (404); 6 gatilhos de ressincronização ativos; `get_player_playlist_for_screen` com permissões preservadas; payload das 6 telas de produção idêntico do início ao fim dos micro-gates (as 2 telas de homologação só mudaram os ids dos itens ao restaurar a playlist de teste).
- **Resíduos:** 0 ofertas/produtos/campanhas/criativos/widgets de teste; playlist de homologação restaurada (5 mídias); sessões temporárias apagadas.
- **Suítes:** web 1531/1531; Player JVM 190/190; APK debug 5.5.7 (versionCode 544) em `native-android-player/app/build/outputs/apk/debug/`.
- **Pendências (OPEN FINDINGS, não bloqueiam o Widget Engine):** OF-W7-1 (Encarte filtra status inexistente), OF-W7-2 (185 erros de tipo pré-existentes), OF-W9-1 (Links Externos não chegam à tela), OF-W9-2 (Instagram automático exige app Meta).
- **Ação do proprietário:** instalar/distribuir o APK 5.5.7 nas telas (widgets novos e a correção de orientação F-73 só valem nas telas com 5.5.4+; os modelos Oferta/Publicidade/Social/YouTube exigem 5.5.5–5.5.7). Recomendado validar em 1 TV Box canário antes da frota (AGENTS.md §14).

### F-77 — Biblioteca de Mídias (acervo oficial) + Minhas Mídias separada, integrada a Playlist/Tela/Player — DONE (migração 20261244, Player 5.5.8)
- **Auditoria (baseline 894c98a):** a única cadeia até o Player é `media -> playlist_items -> playlists -> screens`. O portal do Anunciante tem cadeia própria (`cliente_assets -> playlists_cliente -> cliente_playlist_itens -> publicar_playlist_cliente` que espelha em `media/playlist_items` -> telas do ponto contratado). `biblioteca_midias` existia vazia, sem pastas/Lixeira e sem ligação com playlists: NÃO usada nem alterada. O menu do portal chamava de "Biblioteca de Mídias" a mídia PRÓPRIA (`/portal/assets`).
- **Decisão:** o arquivo da Biblioteca é uma linha de `media` com `biblioteca = true` (Player inalterado; 1 arquivo, N referências). Novas: `biblioteca_pastas` (por empresa, Lixeira `deleted_at/deleted_by`) e `biblioteca_itens` (pasta <-> mídia; duplicar pasta = novas referências, sem copiar arquivo, numa transação). `cliente_playlist_itens` ganhou `biblioteca_media_id` (exatamente UMA origem: própria OU Biblioteca) e `publicar_playlist_cliente` entrega a MESMA mídia ao Player (sem espelho).
- **Segurança no banco:** administrar = OWNER/ADMIN do próprio tenant (`fn_biblioteca_admin`), por RLS + RPCs com checagem explícita; consumo = qualquer usuário do tenant, só nas playlists/telas que já pode alterar (painel: playlists/telas próprias — Owner/ADM: do tenant; portal: playlists do cliente e telas onde ele já publicou). Mídia da Biblioteca em uso numa playlist nunca é apagada de verdade (gatilho `tr_media_biblioteca_protege`; a Lixeira preserva e avisa). Conteúdo oficial NÃO gera a cobrança de "vídeo adicional" do portal (decisão registrada; 1 linha na RPC se o proprietário quiser cobrar).
- **Painel:** `/dashboard/biblioteca` (menu "Biblioteca de Mídias" abaixo de "Minhas Mídias") e `/portal/biblioteca` (portal: "Minhas Mídias" -> /portal/assets, "Biblioteca de Mídias" -> /portal/biblioteca). Mesma página: pastas com capa e contagem, busca global (nome, pasta, tags, descrição, tipo) mostrando a pasta de origem, filtros Todos/Vídeos/Imagens/Áudios, cartão com Preview / Adicionar à Playlist / Adicionar à Tela; Owner/ADM: Nova Pasta, Renomear, Duplicar, Excluir, Lixeira (restaurar / excluir de vez), Adicionar mídia (o MESMO uploader: R2 por URL assinada, thumbnail, duração exata), Editar (título/descrição/tags), Mover, Duplicar em outra pasta. Seletores de Playlist/Tela com busca no servidor (debounce) e seleção múltipla. "Minhas Mídias", editor de playlist, detalhe da tela e Analytics filtram `biblioteca = false` (não misturam).
- **Prova:**
  - Payload do Player idêntico nas 8 telas antes/depois da migração.
  - RLS como cada usuário real (transações desfeitas): Owner cria (duplicado/inválido/vazio recusados), envia, busca, duplica (só referência), Lixeira e restauração; ADM (não dono) edita; Anunciante e Gestor LEEM e todas as escritas diretas/RPCs de administração são negadas (INSERT 42501; UPDATE/DELETE 0 linhas); outro tenant não vê nem usa; purga preserva mídia em uso; DELETE direto bloqueado; 0 mídias duplicadas.
  - Anunciante: adiciona à playlist do portal (sem cobrança), publica e o Player recebe a MESMA mídia; "Adicionar à Tela" só lista a tela com publicação dele, recusa a alheia, republica e a tela recebe a mesma mídia (0 cópias). Mídia própria + Biblioteca na mesma playlist = origens distintas.
  - Painel real (Owner de homologação): pasta "Esporte Vídeos" criada (validação "a/b" recusada), vídeo enviado ao R2 com thumbnail e 14,997 s, "Adicionar à Tela" -> Tela Homolog A -> Realtime ~1 s -> Player 5.5.7 exibiu "Gol de Placa - Esporte 01" (14 840 ms de 14 837 planejados), proof-of-play COMPLETED; Duplicar, busca global com origem, Excluir -> Lixeira -> Restaurar -> Excluir de vez (mídia preservada: ainda na pasta original e na playlist). 0 ANR.
  - Testes: `biblioteca.test.tsx` (9), `uploadDialogDuration.render.test.tsx` (+2).
- **Limite do teste de interface do portal:** as contas de Anunciante disponíveis exigem troca de senha, cadastro PENDING ou onboarding pendente (regras existentes, não contornadas); o portal foi validado por renderização + provas no banco com o Anunciante de homologação.

### OPEN FINDINGS registrados na Biblioteca (fora do escopo, não alterados)
- **OF-BIB-1 — RLS de `screens` ampla demais:** `scr_select_own`/`scr_update_own` (`fn_player_can_access_screen`) liberam ler e ALTERAR qualquer tela do tenant para qualquer usuário do tenant, inclusive Anunciante (AGENTS.md §7). A Biblioteca não depende disso (restringe às telas próprias / publicações do anunciante). Correção exige revisão de RLS de telas com regressão de todos os perfis.
- **OF-BIB-2 — `biblioteca_midias` (tabela antiga, vazia) e `midia_versoes`** seguem sem uso; remover só com decisão do proprietário.
- **Fechamento da Biblioteca (F-77, 2026-09-26):**
  - Deploy: commit `c7712f6` na Vercel (READY; `/dashboard/biblioteca` e `/portal/biblioteca` 200; bundle com a Biblioteca). Migração 20261244 aplicada (2 tabelas com RLS, 9 políticas, 36 funções sem acesso anônimo, 8 índices, gatilho `tr_media_biblioteca_protege`, restrição `cpi_origem_unica`, 8 pastas iniciais por empresa).
  - APK Debug 5.5.8 (545), commit `fed1fff`, `native-android-player/app/build/outputs/apk/debug/app-debug.apk`, 15 755 651 bytes, SHA-256 `955aeb107f708acdd46490672f2adbd49bfeb6309c3330900cbc5e2615a45ee6`. Validado: SUPABASE_URL do projeto de produção, anon key = a atual (hash), papel anon, 0 ocorrência de service_role. JVM 190/190; web 1542/1542; build de produção OK.
  - Emulador (5.5.8): vídeo da Biblioteca exibido (14 842 ms de 14 837). 1 ANR no PRIMEIRO início logo após instalar (SplashActivity, "input dispatching timed out", carga do host 8,0 / CPU 54 % com Gradle+Vite+navegador); reproduzido com 3 inícios a frio seguidos: 0 ANR, 0 crash. Código do Player idêntico ao 5.5.7 (só versionCode). Ambiental.
  - Limpeza pelo fluxo real (Owner: Lixeira -> excluir de vez): o banco liberou vídeo + thumbnail (sem uso), Edge Function apagou do R2 (200; URLs públicas agora 404); 0 mídias/itens/pastas de teste; playlist de homologação restaurada.
  - **Observação operacional (não é regressão):** a tela real "ACADEMIA TELA 1" ficou sem aparelho vinculado: o aparelho que a exibia até 03:55 UTC passou a pedir "HOTEL MAXSUEL" às ~04:00 UTC (00:58–01:00 Brasília) e o Player o revinculou (regra existente da função do Player). A migração não altera aparelhos/vínculos e todos os testes que chamaram a função do Player foram desfeitos com o aparelho da própria tela. Conferir com o proprietário se a troca foi intencional.

### F-78 — Relógio e Clima: modelo único Futurista, cores à escolha, fundo opcional e capa viva (painel + Player 5.5.9 + migração 20261250) — DONE
- **Pedido do proprietário (2026-09-26):** "O Relógio Futurista tem que ser o único tema"; o Clima segue o mesmo comportamento; o usuário escolhe a cor na lateral direita da prévia e continua podendo usar imagem de fundo; a capa do widget é a imagem de fundo ou, sem ela, o próprio relógio/clima.
- **Catálogo:** "Relógio + Data" e "Clima" clássicos saíram; Relógio Futurista e Clima Futurista são os únicos modelos (a seção "Modelo" some sozinha). Widgets antigos aparecem e tocam como Futurista.
- **Cores:** `src/lib/widgetPaletas.ts` — 9 paletas prontas (Roxo SOBRE MÍDIA padrão, Azul Oceano, Turquesa, Verde Esmeralda, Pôr do Sol, Vermelho Rubi, Rosa Magenta, Dourado, Grafite) + Personalizada (qualquer cor; os tons são escurecidos até o texto branco ter contraste ≥ 4,5:1 no meio e ≥ 3,5:1 no fim). O widget grava `paleta`, `corBase` e as `cores` resolvidas; o Player lê `config.cores` (nova paleta não exige APK). Seletor `PaletaPicker` em 2 colunas à direita da prévia (só no formulário e só para Relógio/Clima).
- **Capa:** `CapaWidget` — imagem de fundo; sem ela, o próprio widget ao vivo nas cores escolhidas (Meus Widgets e Galeria de Widgets). Card mostra "Fundo: Cor: <paleta>".
- **Player:** `CoresWidget` (cores inválidas/ausentes -> padrão); `fundoMarca`/`cabecalhoMarca` aceitam as cores (demais widgets inalterados); Relógio/Clima sempre Futurista; renderizadores clássicos `buildClock`/`buildWeather` removidos (não eram mais chamados).
- **Migração 20261250:** 4 widgets passaram ao Futurista na paleta padrão mantendo o fundo (lista e rollback no arquivo); só as 2 telas com "HORA HOTEL" mudaram de payload (HOTEL MAXSUEL, com Player 5.5.7 que já desenha o Futurista, e Mídia indoor).
- **Prova:** painel — Galeria com 1 relógio/1 clima e capas vivas; Verde Esmeralda, amarelo personalizado (tom fechado, texto legível, selo branco), Azul Oceano salvo com capa viva; Clima em Pôr do Sol com dados reais. Emulador 5.5.9: relógio azul e clima Pôr do Sol idênticos à prévia; 0 ANR do app. Testes: `widgetPaletas.test.tsx` (7), `widgetFoundation.test.tsx` atualizado, `CoresWidgetTest` (3). JVM 193/193. APK 5.5.9 (546) SHA-256 `5da4dfd9c7fa073206e118affb7e9727ed0eeab5358b8a5a378044807dee251a` (15754724 bytes). Dados de teste apagados; playlist restaurada.

### F-79 — Conteúdo irregular no banco de produção: 11 jogos inventados + 30 notícias G1/GE — REMOVIDO com preservação forense
- **Origem:** um agente local fora do Claude Code, sem commit e sem transcrição, deixou rascunhos não versionados:
  - `supabase/functions/sports-engine-sync`, que tinha a lista fixa `BASELINE_FIXTURES`;
  - `supabase/functions/news-engine-sync`, com feeds da Globo;
  - `supabase/migrations/20261245`–`20261247` e `src/lib/contentEngine.ts`.
  Ele criou as tabelas `content_*` sem registro de migração e, em 26/09 entre 06:24 e 06:26 UTC, gravou 30 notícias e 11 jogos.
- **Classificação:**
  - Jogos: **FABRICATED**. `source = 'baseline'`, e nenhum confronto existe na data gravada, conforme cruzamento com openfootball CC0 e Wikipédia.
  - Notícias: **UNAUTHORIZED_SOURCE_FOR_CURRENT_CONTENT_PIPELINE**. São artigos reais da Globo, sem licença de reuso; 10 deles de 2018 a 2023.
- **Publicação:** nunca foram distribuídos nem exibidos: 0 exibições, 0 referências, nenhum código versionado lê as tabelas e as Edge Functions não foram publicadas.
- **Remoção:** transação atômica apenas sobre os 41 IDs inventariados, com o pós-commit em 0 + 0; as outras 187 tabelas ficaram com contagem idêntica.
- **Evidências:** `docs/engineering/evidence/F-79_limpeza_forense_conteudo/` (snapshots, manifesto, hashes, SQL executado, contagens antes e depois).
- **Mantidos e não alterados:** as tabelas e a estrutura `content_*` (4 competições, 10 categorias), que serão reavaliadas no Sports/News Engine. Os rascunhos da outra sessão seguem no disco, sem commit, e não são publicados enquanto não passarem por revisão.

### F-80 — SOBRE MÍDIA Sports Engine + Notícias de Esportes, a custo zero (migrações 20261251/20261252, Edge Functions, painel e Player 5.6.0) — DONE
- **Fontes:** as 4 oficiais (CBF, UEFA, LALIGA, Premier League) proíbem uso comercial ou coleta automática e não são usadas. As fontes adotadas são:
  - **openfootball** (CC0): Brasileirão 2026, Premier e La Liga 2026/27;
  - **Wikipédia** (CC BY-SA 4.0): validação das 3 ligas e fonte única da Champions, com cobertura PARTIAL e confirmação por 2 revisões com pelo menos 30 min de diferença;
  - **Agência Brasil** (CC BY 4.0): notícias de esportes, só texto, porque o feed não traz o crédito das fotos.
- **Contrato e regras:** `docs/engineering/SPORTS_ENGINE_CONTRATO.md`.
  - Resultado só é publicado quando as 2 fontes dão o mesmo placar.
  - Próximo jogo exige 2 commits iguais do openfootball e o confronto na Wikipédia.
  - Mudanças de horário, conflitos, goleadas, placar implausível e jogo em andamento não são publicados.
  - Sem placar ao vivo; UTC internamente e horário de Brasília na exibição.
  - O próprio banco recusa jogo publicado que seja LIVE/UNKNOWN ou FINISHED sem placar (`ck_csf_publicacao`).
- **Código:**
  - `supabase/functions/_shared/sports/*` e `_shared/noticias/rss.ts` (puros, testados);
  - Edge Functions `sports-engine-sync` e `news-engine-sync`, que substituíram os rascunhos com dados inventados e com feeds da Globo (os originais estão guardados em `evidence/F-79.../rascunhos_originais`);
  - pg_cron (15 min para esportes, 2x/h para notícias) → pg_net, autenticado por segredo no Vault.
- **Banco:** as tabelas `content_*` foram reaproveitadas como dado global (empresa NULL) e ganharam 4 tabelas de observabilidade: runs, saúde por fonte, snapshots (10 por fonte) e eventos. Escrita só por service_role. Os widgets são resolvidos no servidor, como Ofertas e Publicidade.
- **Linha W11 em `get_player_playlist_for_screen`:** o widget `sports` só vai para Player ≥ 5.6.0; aparelho antigo não recebe e não mostra "Widget não suportado".
  - Correção na 20261252: a versão vem de `screens.version` (heartbeat), porque `devices.app_version` fica parado — `initializeDeviceFleet` nunca é chamado (OF-F80-1).
  - Payload das telas antes/depois: 7/7 idêntico.
- **Painel:**
  - Galeria com Resultados do Futebol, Próximos Jogos, Jogos de Hoje e Notícias de Esportes, com capa viva;
  - formulário com competições, quantidade, filtro por time e cores (paleta);
  - Biblioteca de Mídias com a seção "Conteúdo automático", que abre o widget no modelo certo e segue o fluxo normal Playlist → Tela → Player; não aparece no portal do Anunciante.
- **Player 5.6.0 (547):**
  - `Esportes.kt` (sem java.time, pois o minSdk é 23), tipo SPORTS e `buildSports`: 4 jogos por página na horizontal, 6 na vertical, girando a cada 8 s; jogo já iniciado sai de "próximos" mesmo com cache antigo;
  - o widget de Notícias usa as manchetes prontas quando `origem = agencia-brasil`.
  - APK Debug SHA-256 `e416f6ac77fe23e8821106f6cf598dddf3387f6c49b04058c5cc0cb4fdbe5a9c` (15 765 748 bytes).
- **Prova real (26/09/2026):**
  - Coleta forçada em 28 s:

    | Competição | Jogos | Publicados | Pendentes |
    |---|---|---|---|
    | Brasileirão | 380 | 360 | 20 |
    | Premier League | 380 | 375 | 5 |
    | La Liga | 380 | 374 | 6 |
    | Champions | 144 | 144 | 0 |

    Nenhum conflito. Os pendentes são jogos passados sem resultado nas 2 fontes, mais 3 remarcações (29/07 → 02/10 e 03/10; 16/09 → 21/10) aguardando confirmação.
  - Exemplo: Flamengo 2×1 Bragantino (20/09, 18:30 de Brasília), commit `e674442` + revisão 73056133.
  - Notícias: 10 da Agência Brasil. Chamadas sem segredo recebem 401.
  - Cron automático: 200/SKIPPED (NORMAL) e notícias SEM_MUDANCA (ETag).
  - Emulador 5.6.0: Resultados (Athletico-PR 2×1 Bahia, Flamengo 2×1 Bragantino, Corinthians 1×3 Fluminense, Vitória 1×3 Cruzeiro) e Notícias de Esportes. 0 ANR/crash do app. Capturas em `evidence/F-80_sports_engine/`.
  - Dados de teste removidos; playlist de homologação idêntica à original.
- **Testes:** web `sportsEngine` (20), `noticiasRss` (5), `esportesWidget` (6), Biblioteca (+1); JVM `EsportesWidgetTest` (5), JVM total 198/198.

### OPEN FINDINGS do F-80
- **OF-F80-1:** `MainActivity.initializeDeviceFleet` nunca é chamado, então `devices.app_version`/`player_version` ficam desatualizados (ex.: o emulador aparece como 5.5.1 rodando 5.6.0). Não foi alterado (estrutura do Player). A trava W11 usa `screens.version`, que o heartbeat mantém.
- **OF-F80-2:** o openfootball atualiza de 2 a 3 vezes por semana, então resultados chegam com atraso de até ~4 dias. É o limite da fonte gratuita; não há dado inventado para compensar.
- **OF-F80-3:** o widget "Notícias (RSS)" comum ainda vem com o feed do G1 como padrão (`WidgetForm.getDefaultConfig`), e o usuário pode trocar. Recomenda-se decisão do proprietário sobre trocar o padrão pela Agência Brasil.
- **OF-F80-4:** os rascunhos `20261245`–`20261247`, `src/lib/contentEngine.ts` e a alteração em `src/lib/biblioteca.ts` são da outra sessão e continuam sem commit. Não devem ser aplicados: a 20261246 recriaria políticas por empresa e RPCs do modelo antigo.

### F-81 — "VIDEOS EM PE PARA MIDIA INDOR VARIADOS" transferidos para a Biblioteca de Mídias (empresa 7d62aaec) — DONE
- **Pastas criadas** com o nome exato de origem, pela RPC do botão "Nova Pasta":

  | Pasta | Arquivos |
  |---|---|
  | VIDEOS EM PE ACADEMIA | 9 |
  | VIDEOS EM PE HAMBURGUERIA | 10 |
  | VIDEOS EM PE LOJA VARIEDADES | 9 |
  | VIDEOS EM PE MERCADO | 6 |
  | VIDEOS EM PE PARA AÇAITERIA | 1 |
  | VIDEOS EM PE PARA AÇOUGUE E FRIGORIFICO | 9 vídeos + 2 imagens |
  | VIDEOS EM PE PARA PIZARARIA | 7 |
  | **Total** | **53 arquivos, 374,5 MB** |

- **Fluxo oficial:** diálogo "Adicionar mídia" da Biblioteca, com hash, duração exata, miniatura, URL assinada do R2 e `process-media`, seguido de `biblioteca_vincular_midias`. Feito no painel com a conta de TESTE `dbg.adm@sobremidia.test` (ADM da empresa, sessão por link mágico de admin, sem senha); a conta pessoal do proprietário não foi usada. Os arquivos chegaram à página por um servidor local temporário, encerrado ao final. A sessão foi apagada do disco e do navegador.
- **Títulos:** o diálogo exige um único nome para envio múltiplo, então cada item foi renomeado com `biblioteca_editar_item` para "<Segmento> NN" (Academia 01…, Hamburgueria 01…, Loja de Variedades…, Mercado…, Açaiteria…, Açougue e Frigorífico…, Pizzaria…), com descrição e tags do segmento. A numeração segue a ordem de gravação.
- **Proporção:**
  - As dimensões reais foram medidas em todos os arquivos: 576×1024, 720×1280, 1080×1920, 2160×3840 e imagens 608×1080 e 735×1041, todos verticais.
  - A Hamburgueria entrou como 16×9 porque o clique automático no "9x16" falhou. Foi corrigida por SQL pontual nos 10 IDs da pasta: a tabela `media` não tem política de UPDATE para o cliente, por projeto.
- **Miniaturas:** 11 vídeos ficaram sem miniatura, porque o navegador interno não desenhou o quadro durante o envio. Foram geradas do próprio vídeo publicado, enviadas por `get-upload-url` e gravadas em `thumbnail_url` (só onde era nulo).
- **Prova:**
  - 53/53 itens, com contagem por pasta igual à do disco; 53/53 em 9x16; 53 hashes distintos (0 duplicatas); 51/51 vídeos com duração exata; 53/53 com miniatura ou imagem; 53/53 URLs públicas com resposta 200; `biblioteca = true` em todos, sem aparecer em "Minhas Mídias".
  - A página da Biblioteca lista as 7 pastas com as contagens.
  - Player 5.6.0 no emulador reproduziu "Academia 01" (`show item=Academia 01 kind=VIDEO`), com 0 ANR/crash. Playlist de homologação restaurada, 7/7 telas iguais à linha de base. Evidência em `evidence/F-81_biblioteca_videos_em_pe/`.

### OPEN FINDINGS do F-81
- **OF-F81-1 (direitos de uso):** vários arquivos têm nome de baixadores de redes sociais (`ssstik.io_*` = TikTok, `PinDown.io_@Rezeptfood147_*` = Pinterest), o que indica conteúdo de terceiros. O uso comercial na Biblioteca oficial exige licença ou autorização dos autores; a decisão é do proprietário.
- **OF-F81-2 (compressão parada):** o workflow `compress-video` (repository_dispatch `novo_video`) não tem execuções, e todos os vídeos desde 25/09 ficam em `temp/`, inclusive os 7 anteriores a esta transferência. Eles tocam normalmente, mas "Açougue e Frigorífico 06" é 4K vertical (2160×3840, 174 MB), pesado para TV Box.
- **OF-F81-3 (pastas vazias):** 11 pastas vazias (Datas Comemorativas, Loterias, Sorteios, Apostas Esportivas, SOBREMÍDIA NEWS, Esportes, Futebol, Brasileirão, Champions League, La Liga, Premier League) foram criadas na empresa pela outra sessão. Não foram alteradas; o proprietário decide se ficam.
- **OF-F81-4 (diálogo de upload):** no envio múltiplo, todos os arquivos recebem o mesmo "Nome da Mídia", e as validações de nome, empresa e seguimento falham sem aviso visível. Registrado; a correção fica para a frente de UI, se o proprietário quiser.

### F-82 — Seletores "Selecionar Mídia / Widget / Link Externo / Playlist" (detalhe da tela) sem rolagem e gigantes — FIXED
- **Reprodução (1366×612):** a janela ficava com 1233 px de largura e as miniaturas com 382×215 px. O conteúdo tinha 958 px, mas só 406 px eram visíveis, com `overflow: hidden`, então não era possível rolar.
- **Causas:**
  1. a regra global `.flex, .grid { max-width: 100% }` em `src/index.css` anula `max-w-2xl`. Ela não foi alterada, porque é global;
  2. o `ScrollArea` com `flex-1` e sem `min-h-0` crescia até o tamanho do conteúdo em vez de rolar.
- **Correção mínima:** `src/components/screens/SeletorGrade.tsx`, com largura e altura por `style` inline, rolagem nativa (toque, roda do mouse e barra) e colunas automáticas. Os 4 diálogos de `ScreenDetails.tsx` passaram a usá-lo, com as mesmas ações de clique e avisos de lista vazia.
- **Prova no navegador:**

  | Tamanho | Colunas | Miniatura | Janela dentro da tela |
  |---|---|---|---|
  | PC 1366×612 | 5 | 175×99 | sim |
  | Tablet 768×1024 | 4 | 152×85 | sim |
  | Celular 375×812 | 2 | 145×82 | sim |

  Em 740×360, o conteúdo tem 499 px e a área visível 226 px; a lista rolou 273 px e a última mídia ficou visível. Widget e Link sem itens mostram aviso de lista vazia.

### F-83 — Capa em todos os widgets + imagem de fundo em todos (inclusive YouTube) — painel e Player 5.6.1 — DONE
- **Antes:**
  - Meus Widgets só tinha capa viva no Relógio, Clima e Esportes; os outros tipos sem fundo mostravam só um ícone apagado.
  - A Galeria só tinha capa nesses 3 tipos.
  - O YouTube não aceitava imagem de fundo (`suportaFundo: false`, e o Player não desenhava).
- **Capa (`CapaWidget`):**
  - usa a imagem de fundo quando existe;
  - senão, desenha o próprio widget (Relógio, Clima, Esportes, Notícias, Institucional, Oferta, Publicidade, Social, Instagram);
  - YouTube usa a miniatura oficial `i.ytimg.com/vi/<id>/hqdefault.jpg`, sem abrir o player;
  - Publicidade sem campanha mostra o estado real "Anuncie aqui";
  - Notícias, que usa texto de tamanho fixo, é desenhado em 640×360 e reduzido.
- **Galeria:** todos os 13 modelos têm capa (`src/lib/widgetExemplos.ts`). São dados reais quando existem sem configuração (relógio, clima, jogos confirmados, manchetes da Agência Brasil). Oferta, Institucional, Social e Instagram usam conteúdo de exemplo com o selo "EXEMPLO", que nunca vai para tela nenhuma.
- **Fundo no YouTube:**
  - Painel: formulário, prévia e Player web.
  - Player Android 5.6.1 (548), com `YoutubeLink.caixaSobreFundo`: com imagem, o vídeo 16:9 fica centralizado (até 94% da largura e 82% da altura) sobre o fundo da marca; sem imagem, tela cheia como antes. Players anteriores mostram o vídeo em tela cheia.
- **Prova:**
  - Galeria no navegador com os 13 modelos com capa.
  - Emulador 5.6.1 com o widget de teste "YouTube com fundo" (Big Buck Bunny, CC): fundo com véu da marca e vídeo centralizado, 0 ANR/crash. Widget de teste removido; playlist de homologação idêntica e 7/7 telas iguais à linha de base.
  - Testes: `widgetCapas` (5), JVM `YoutubeFundoTest` (2), JVM total 200/200.
  - APK 5.6.1: SHA-256 `6d20cea9657bf696f8ff9b5f0b78bb66d7cd4e77105f4941146fa63d163aa1e0` (15 765 980 bytes).
  - Evidência em `evidence/F-83_capas_widgets/`.

### F-84 — Dashboard do Owner/ADM na área Gestor de Mídias + dashboards que "só ficam carregando" — DONE
- **Antes:**
  - A área Gestor de Mídias (`/dashboard`) não tinha item "Dashboard" no menu.
  - O Owner/ADM via o painel do Gestor, que é por usuário, e não o da empresa.
  - Havia um aviso de chave duplicada no menu: Central e Mensagens usam `/dashboard/central`.
- **Dashboard do Owner/ADM:**
  - Nova RPC `fn_dashboard_resumo_midias_owner` (migração `20261253`, SECURITY DEFINER), restrita a `fn_biblioteca_admin()`; os demais recebem `SEM_PERMISSAO`.
  - Mostra dados reais da empresa inteira:
    - telas online/offline/sem playlist e versão do Player, lida de `screens.version` (heartbeat);
    - exibições de 7 dias, vindas de `playback_logs`;
    - playlists, mídias, Biblioteca e widgets;
    - saúde do conteúdo automático (esportes e notícias).
  - Componente `CentralDoDiaMidiasOwner`, com alertas e cards; o Gestor continua com o `CentralDoDiaGestor`.
  - Item "Dashboard" é o primeiro do menu; a chave do menu passou a ser `path-label`.
- **Carregamento eterno, causa raiz reproduzida em teste:**
  1. `AuthContext`: o `getSession()` inicial não tratava falha nem demora sem fim. Com o renovador de token falhando ou a rede travada, `loading` ficava `true` para sempre.
  2. `RequireApproval`: a checagem da sessão real não tinha prazo.
- **Correção mínima:**
  - `AuthContext`: `catch` + `finally` e vigia de 15 s (`TEMPO_MAX_VERIFICACAO_MS`, em `src/lib/tempoLimites.ts`).
  - `RequireApproval`: `Promise.race` com o mesmo prazo, **fail-closed**: sem sessão confirmada vai para o login, nunca libera o acesso.
  - O caminho normal não mudou: `loading` só é liberado depois de `fetchUserData`.
- **Prova:**
  - `authCarregamento` (3) e `guardaCarregamento` (2) falhavam antes e passam depois; `dashboardMidiasOwner` (3).
  - RPC por perfil:
    - Owner real e ADM → mesmos dados da empresa;
    - Owner de teste → só a própria empresa;
    - Anunciante e Gestor → `SEM_PERMISSAO`;
    - anon → permissão negada.
  - Navegador, dev, carga até o conteúdo:

    | Perfil | Rota | Tempo |
    |---|---|---|
    | Owner | `/dashboard` | 3,5 s, dashboard da empresa com 7 cards |
    | Owner | `/workspace` | 3,3 s |
    | Representante | `/representantes/dashboard` | 4,7 s |
    | Anunciante | `/portal` | 1,6 s → troca de senha obrigatória, bloqueio respeitado |

    Recarga com token vencido: 2,3 s.
- **Achados de dados de teste, sem relação com a alteração e sem correção:**
  - `e2e-t1-fluxob` tem 2 linhas em `solicitacoes_acesso`. O `.maybeSingle()` falha e a conta vê "Acesso Não Liberado". Nenhum usuário real tem duplicata (consulta: 0).
  - As contas `e2e-anunciante-corp-*` não têm `cliente_id`, e o `CustomerPortalLayout` as manda para `/auth`.
  - Não existe conta de Anunciante de teste completa, com cliente e sem troca de senha pendente.

### F-85 — Pendências abertas dos F-80/F-81/F-84 — DONE, com 2 decisões do proprietário registradas
- **OF-F81-1 (direitos de uso TikTok/Pinterest):** o proprietário declarou em 26/09/2026 que tem autorização de uso. Nada alterado.
- **OF-F81-3 (11 pastas vazias):** o proprietário decidiu manter. Nada alterado.
- **OF-F80-1 (`initializeDeviceFleet`) — REFUTADO:**
  - O método é chamado após o sync bem-sucedido (`MainActivity`).
  - Na tela real (ACADEMIA TELA 1), `devices.app_version`, `device_health` e `screens.version` batem (5.5.9). A divergência era do emulador, reinstalado várias vezes no dia.
- **Versão da tela alternando (novo, achado ao validar o release 5.6.1):**
  - `PlayerRepositoryImpl.sendHeartbeat` enviava a constante `PlayerConfig.APP_VERSION = "1.0.0"`; o `PersistentHeartbeatService` envia a versão real. `screens.version` alternava entre as duas.
  - Com isso a trava W11 (`fn_widget_suportado_no_aparelho`) liberaria o widget Esportes só em parte do tempo num aparelho 5.6.x.
  - Correção no servidor, para a frota atual: migração `20261254`, gatilho que mantém a versão real quando chega a constante "1.0.0" do mesmo aparelho. A troca de aparelho continua gravando.
  - Correção no Player (próximo APK): o batimento passa a enviar a versão instalada.
  - Prova: transação desfeita com 4 casos; depois de aplicado, 8 leituras em 160 s de batimentos reais do emulador → 5.6.1 estável.
- **Feed padrão da Globo:** o widget Notícias novo passa a usar a Agência Brasil (`/rss/ultimasnoticias/feed.xml`, CC BY 4.0). Nenhum widget existente usava a Globo.
- **Solicitação de acesso duplicada:**
  - Com 2 linhas em `solicitacoes_acesso`, o `.maybeSingle()` falhava e a conta aprovada via "Acesso Não Liberado".
  - O `AuthContext` passa a ler a mais recente (`order created_at desc` + `limit 1`).
  - Teste `pendenciasF85`: falha sem a correção e passa com ela. Nenhum usuário real tem duplicata.
- **OF-F81-4 (diálogo de upload):**
  - No envio múltiplo, o nome digitado vira prefixo numerado ("Academia 01", "Academia 02"…), com dica no formulário.
  - Campos obrigatórios vazios ficam marcados em vermelho com mensagem, além do aviso passageiro.
- **OF-F81-2 (compressão parada) — pipeline refeito:**
  - Causas:
    - a coluna `processing_status` não existia;
    - o retorno chamava uma função `process-media-webhook` inexistente, com um segredo inexistente no GitHub;
    - o workflow convertia para H.265 (muitas TV Boxes não decodificam) e apagava o original;
    - o hash não era atualizado. O Player compara o MD5 do arquivo com `media.file_hash` e rebaixaria o vídeo a cada sincronização.
  - **Falha de segurança:** a `process-media` usava o `file_path` enviado pelo navegador, sem conferir dono. Qualquer usuário logado podia fazer o workflow baixar, sobrescrever e **apagar** qualquer objeto do R2.
  - Correção:
    - migração `20261255` (coluna aditiva; a RPC do Player monta a mídia campo a campo);
    - `process-media` lê o caminho do banco e valida o escopo com `fn_r2_validate_object_scope`;
    - o retorno é autenticado por `MEDIA_PIPELINE_SECRET` e grava arquivo, URL, MD5 e tamanho novos só se a mídia ainda aponta para o original;
    - workflow em H.264 High 4.1, lado maior até 1920 px, faststart; só comprime quando vale a pena, confere a duração (±0,5 s) e o tamanho, e mantém o original.
  - Prova:
    - sem JWT → 401; segredo errado → 401; vídeo de outro usuário → 403;
    - vídeo próprio → disparo aceito pelo GitHub (o token salvo funciona).
  - **Proteção aplicada:** o workflow antigo "Compress Video" foi **desativado** no GitHub. Com o token válido, um disparo rodaria a versão antiga da `main` (H.265 + apagar original).
  - **Pendente de decisão:** o `repository_dispatch` só roda workflows da branch padrão (`main`), que também é a branch de produção da Vercel e está 60 commits atrás da release.

### F-86 — Widget Esportes v2: resultados e próximos jogos por campeonato, janela de 3 dias, 3 + 3 por página, continuação entre exibições e escudos oficiais — DONE (Player 5.6.2)
- **Pedido (26/09/2026):**
  - separado por campeonato, com o nome no topo ("Brasileirão Série A") e "Resultados e próximos jogos" embaixo;
  - resultados dos 3 dias anteriores e próximos jogos de hoje até 2 dias à frente (sábado → resultados de qua/qui/sex, próximos de sáb/dom/seg);
  - 3 resultados + 3 próximos por página, 8 s cada, 3 páginas por exibição;
  - na exibição seguinte continua de onde parou, até passar todos os jogos;
  - só as competições marcadas;
  - nome do time sempre com o escudo oficial do próprio time.
- **Servidor (migração `20261256`, aditiva):**
  - `config.esportes` ganha `layout=2`, `referencia` e `janela` (D-3..D+9, com `escudoMandante`/`escudoVisitante` e a ordem da competição). A lista antiga `jogos` continua igual para os Players 5.6.0/5.6.1.
  - Regra de exibição: o widget só entra na playlist se houver resultado em D-3..D-1 ou jogo de hoje a D+2 ainda não começado. Sem isso (ex.: Data FIFA combinada de 21/09 a 06/10), ele sai da reprodução em vez de ocupar a tela vazio.
  - Cron `esportes-virada-do-dia` (00:05 de Brasília) faz as telas ressincronizarem quando a janela anda.
  - Prévia do painel (`content_esportes_preview(p_config, p_referencia)`): com a janela de hoje vazia, mostra um EXEMPLO, marcado como tal, com a última rodada real. Nunca vai para as telas.
- **Escudos:**
  - Tabela `content_sports_teams` e bucket público `escudos-times`.
  - Edge Function `sports-escudos-sync` (cron semanal): nome gravado nos jogos → artigo do clube na Wikipédia, pelo mesmo vínculo que o Sports Engine usa para reconciliar → imagem principal do artigo (o escudo do infobox) → PNG 256 px no Storage.
  - **Conferência visual 96/96** (20 Brasileirão, 20 Premier, 20 La Liga, 36 Champions = 86 times únicos): cada escudo é do time do nome. `verificado_em` gravado só onde o arquivo copiado é idêntico ao conferido (86/86).
  - Escudo conferido nunca é trocado sozinho: se a Wikipédia mudar o arquivo, o conferido continua e a linha fica `pendente_revisao`.
  - Time sem escudo conferido mostra as iniciais, nunca o escudo de outro time.
- **Painel e Player web:**
  - `src/lib/esportesPaginas.ts` (regra única) e `SportsWidget` v2.
  - Catálogo com um só modelo ("Resultados e Próximos Jogos"); modelos antigos salvos caem nele.
  - O formulário explica como o widget passa na tela.
  - Duração padrão do item de Esportes na playlist: 24 s (3 × 8 s).
- **Player Android 5.6.2 (549):**
  - `EsportesPaginas.kt` (mesma regra, sem `java.time`) e `buildSportsV2`.
  - Escudos carregados antes de o widget entrar (prazo de 10 s), e os demais da janela aquecidos no cache de disco para funcionar offline.
  - Cursor por widget no aparelho (`esportes_cursor`), gravado a cada página mostrada.
  - Nomes longos em até 2 linhas com fonte ajustável.
- **Defeitos achados e corrigidos na validação:**
  1. A prévia derrubava a página (`somarDias` lançava erro com data vazia). As funções de data não lançam mais; teste acrescentado.
  2. Escudos com cache vazio estouravam o prazo de 4 s do fundo (Botafogo, Atlético-MG e Mirassol saíam com iniciais). Prazo próprio de 10 s e aquecimento; com dados limpos, todos carregaram.
  3. Nomes longos cortados na vertical.
- **Prova:**
  - Testes web: `esportesPaginas` (9, inclusive o exemplo do sábado), `esportesWidget` (v2, 8), `escudosTimes` (3).
  - JVM: `EsportesPaginasTest` (5), total 205/205.
  - Teste instrumentado `EsportesRenderTest` no emulador: o widget desenhado pelo Player com a janela real de 19/09 e os escudos do Storage, 8 páginas em 16:9 e 9:16 (evidência em `evidence/F-86_esportes_v2/`).
  - Na prévia do painel, com dados reais: 8 páginas; Brasileirão → Premier → La Liga.
  - Release 5.6.2: SHA-256 `4e09679bacdd49d6677031bd42aa983543ae8f86f8ba10cc82e474e01f23a89f` (5 736 035 bytes), certificado de produção.
- **Limites registrados:**
  - O emulador de homologação ficou na tela de login depois da limpeza de dados do teste de cache frio. Entrar exige a senha da conta de teste, que não é digitada por agente.
  - Escudos de clubes são marcas registradas: o uso comercial em telas de mídia é decisão e risco do proprietário.
  - Hoje (Data FIFA) não há jogos na janela: o widget volta a aparecer nas telas em 07/10, na virada do dia.

### F-85 (continuação) — decisões do proprietário aplicadas
- **`main` atualizada** (autorizada em 26/09/2026): avanço simples `d906c87..c74dc70`, sem perda (a `main` era ancestral da release).
  - A Vercel publicou a `main` (`dpl_Hyndu9…`), o mesmo código da produção.
  - O workflow "Deploy Supabase Edge Functions" disparou pela `main` e falhou por falta de token no GitHub. Nada foi publicado: `inter-billing-engine` segue na v39, de 30/08.
- **Compressão ligada:**
  - Workflow novo reativado.
  - Causa adicional de "0 execuções desde sempre": o segredo `GITHUB_REPO` da função apontava para outro repositório, sem o workflow. O GitHub aceitava o disparo sem efeito. Corrigido para `daiamestre/sitesobremidia`; só a `process-media` usa a variável.
- **OTA 5.6.2: NÃO publicado.**
  - A criação da release pública no GitHub, para hospedar o APK, foi bloqueada pelas permissões da sessão de agente.
  - O APK release 5.6.2 (SHA-256 `4e09679b…a89f`) está pronto.
  - Falta o proprietário publicar a release (ou autorizar), rodar o workflow `publish-player-apk` para copiar ao R2 e registrar em `app_releases`.
- **Compressão provada de ponta a ponta** (execução 36267796115):
  - "Açougue e Frigorífico 06": 2160×3840 H.264 a 40,7 Mbps, 182,8 MB → 28,5 MB, com a mesma duração (35,92 s).
  - A mídia passou a apontar para o arquivo novo com o MD5 novo (`f1cb9fd9…`, conferido no arquivo publicado), `processing_status = ready`.
  - O original em `temp/` continua disponível.
  - Não estava em playlist nenhuma, então nenhuma tela precisou baixar de novo.
  - Os demais vídeos não foram reprocessados em massa: já são leves, e os que estão em playlist fariam as telas baixarem tudo de novo. Os envios novos passam pelo pipeline automaticamente.

### F-87 — Esportes: tudo aparece junto, fundos temáticos por campeonato, Copa do Brasil e escudo só conferido — DONE (Player 5.6.3)
- **Escudos aparecendo aos poucos (painel e Player web):**
  - Causa: cada escudo era um `<img>` carregado na hora em que a linha aparecia.
  - Correção: ao chegar os dados, todos os escudos da janela e os fundos são baixados e decodificados antes da 1ª página (cache em memória; limite de segurança de 8 s). A troca de página não carrega mais nada e os 8 s só contam depois disso.
  - Teste `esportesWidget` "tudo aparece junto": com imagens de teste lentas, nenhuma linha aparece antes; depois, todas de uma vez com o fundo do campeonato.
  - No Android, o widget já era montado depois de carregar os escudos da exibição; agora também espera os fundos, e aquece no cache de disco os escudos e fundos da janela inteira para funcionar sem internet.
- **Fundos temáticos:**
  - Arte própria por campeonato (Brasileirão, Copa do Brasil, Premier League, La Liga, Champions): estádio à noite com refletores, arquibancada com torcida desfocada, gramado com as linhas, bola e a taça estilizada de cada competição.
  - Em 16:9 e 9:16, ~45 KB cada, servidos pelo site (`public/esportes/fundos`; gerador em `evidence/F-86_esportes_v2/gerador_fundos.mjs`).
  - Sem logotipos oficiais: os do Brasileirão e da La Liga levam patrocinador, inclusive de apostas.
  - O widget troca o fundo a cada campeonato; uma imagem de fundo escolhida no widget continua tendo prioridade.
  - Migração `20261257`: colunas `fundo_h_url`/`fundo_v_url` e `competicoes[].fundoH/fundoV` no payload (aditivo).
- **Copa do Brasil (masculino):**
  - A Wikipédia em português só tem as chaves, sem data nem horário por jogo; o openfootball 2026 não tem a Copa.
  - A página "2026 Copa do Brasil" em inglês tem uma caixa por jogo, com data e horário.
  - Configuração PARTIAL, como a Champions: publica o que duas revisões (≥ 30 min) confirmam.
  - Parser novo `parseCaixasClassicas`, só para essa competição: horário tratado como de Brasília; jogos em cidade de outro fuso (MT, MS, RO, AM, RR, AC) ou com outro UTC declarado ficam de fora, para nunca mostrar horário errado.
  - Nomes padronizados com o Brasileirão (Atlético-MG, Athletico-PR, Vasco, Bragantino).
  - Execução real: 133 jogos lidos (17 fora por fuso), **132 publicados**, 1 pendente (Grêmio × Internacional da volta, sem placar na fonte). Quartas conferem com a imagem de referência do proprietário.
  - As semifinais (1º e 8/11) já têm confrontos sorteados, mas ainda sem caixa com data e horário na fonte: entram assim que a fonte publicar.
- **Escudo só conferido:**
  - O payload só leva o escudo com `verificado_em`; sem conferência, as iniciais.
  - Conferência visual dos 93 escudos novos da Copa (5 páginas): todos corretos. **179/179 conferidos**; Maranhão fica sem escudo (a fonte só tem GIF).
- **Sincronização de escudos:** a Wikimedia recusava rajadas (429). Agora um download por vez, com intervalo, nova tentativa e aceite de JPG.
- **Prova:**
  - Testes web 160 arquivos / 1618; `copaDoBrasil` (5, com uma caixa real da página).
  - JVM 205/205, inclusive a leitura dos fundos (só https).
- **Validação visual:**
  - Painel com os fundos de produção: no instante em que a 1ª linha apareceu, 9/9 imagens (8 escudos + fundo) já estavam carregadas, com 0 pendentes.
  - Player 5.6.3 (`EsportesRenderTest`, cache limpo): fundo do campeonato e todos os escudos na mesma exibição, em 16:9 e 9:16.
  - Arte revisada (sem a caixa do refletor atrás do cabeçalho), com `?v=2` nas URLs para renovar o cache dos aparelhos.
- **Release 5.6.3 (550):** SHA-256 `6e91e20b36d9b4d3454e35328af027d42214e9e030ac61153009bad54467fbc2` (5 738 128 bytes), certificado de produção. Substitui a 5.6.2 no OTA, que continua aguardando a publicação do APK pelo proprietário.

### F-88 — Fundos do widget Esportes no estilo da referência do proprietário (taça original + nome da competição) — DONE (Player 5.6.4)
- **Pedido:** fundo "igual à terceira imagem" (estádio iluminado, taça original e nome da competição no alto), usando as fotos das taças enviadas pelo proprietário (Copa do Brasil e Brasileirão).
- **Montagem** (gerador `evidence/F-86_esportes_v2/gerador_fundos_v2.html`, canvas no navegador, 1920×1080 e 1080×1920):
  - o estádio é a própria faixa da referência (metade dourada = Copa, metade azul = Brasileirão), desfocado para esconder a baixa resolução;
  - brilho dos refletores e partículas iguais aos da referência (confete dourado na Copa, estrelas azuis no Brasileirão);
  - as taças das fotos do proprietário foram recortadas localmente, no navegador, sem enviar a imagem a nenhum serviço;
  - nome em letreiro Montserrat 900: dourado na Copa, prateado no Brasileirão, com "SÉRIE A".
- **Removido da referência:** a marca "NC NEWS" e os textos de terceiros ("Grandes competições…", "Viva o futebol brasileiro!", "Brasileirão é paixão!"). Não se publica marca de outra empresa nas telas.
- **Premier League, La Liga e Champions:** mesmo estilo com a cor de cada uma, só com o nome, até o proprietário enviar as taças.
- **Widget** (migração `20261258`, aditiva; `competicoes[].fundoComTitulo`):
  - quando a arte traz o nome, o título escrito sai (sem nome duplicado) e o conteúdo começa abaixo do cabeçalho da arte;
  - "Resultados e próximos jogos" continua visível;
  - na horizontal, as linhas ficam 14% menores para caber abaixo do cabeçalho;
  - vale para painel, Player web e Player 5.6.4 (551); os Players 5.6.3 ignoram o campo.
- **Direitos:** as fotos das taças e a arte de referência foram fornecidas pelo proprietário, que responde pelo direito de uso comercial.
- **Prova:** web 160/1620 (+2 testes do título na arte); JVM 205/205 (leitura de `fundoComTitulo`).
- **Encaixe validado no Player** (`EsportesRenderTest`, dados reais de 19/09):
  - O 1º desenho mostrou o subtítulo sobre o letreiro da arte. O espaço reservado passou a 25% da altura na horizontal (linhas a 80%) e 30% na vertical, com o subtítulo centralizado na vertical.
  - Resultado: taça + nome da arte, depois "RESULTADOS E PRÓXIMOS JOGOS" e os jogos, sem sobreposição (evidência `player564_*_arte.png`).
- **Release 5.6.4 (551):** SHA-256 `2d0ca099d6f9d20486d115e74dbbf0fb4b46ade64ebfbf1c9ab70114f50db04b`, certificado de produção. Substitui a 5.6.3 no OTA pendente (aguarda a publicação do APK pelo proprietário).

### F-89 — Esportes: taças da Premier, Champions e La Liga; textos centralizados; sem rodapé — DONE (Player 5.6.5)
- **Taças:** as três foram recortadas localmente da imagem enviada pelo proprietário e colocadas nos fundos 16:9 e 9:16, no mesmo padrão da Copa do Brasil e do Brasileirão. O letreiro se ajusta à largura disponível (CHAMPIONS LEAGUE / PREMIER LEAGUE). URLs `?v=4` (migração `20261259`).
- **Textos:**
  - "RESULTADOS E PRÓXIMOS JOGOS" centralizado e maior (4,4% da menor dimensão, proporcional em 16:9 e 9:16).
  - "RESULTADOS" e "PRÓXIMOS JOGOS" (amarelo) centralizados, com linha dos dois lados.
- **Rodapé removido da tela** (pedido do proprietário): sem "Horário de Brasília", sem a fonte dos dados e sem o contador de páginas.
  - A posição da página fica só para leitores de tela (`sr-only`).
  - As fontes continuam registradas no banco (`creditos`) e nesta documentação.
  - Nota: os fatos de jogo (placares, datas) vêm do openfootball (CC0) e da Wikipédia; não há texto da Wikipédia reproduzido na tela.
- **Prova:** web 160/1622 (+2 testes: sem rodapé visível; rótulos centralizados); JVM 205/205.
- **Validação no Player 5.6.5** (`EsportesRenderTest`, dados reais de 19/09): Premier League (16:9) e La Liga (9:16) com a taça na arte, subtítulo e rótulos centralizados, sem rodapé.
- **Release 5.6.5 (552):** SHA-256 `de9d47537106656bce28bb013fe303715242f4afb076c3e50a8c30147fc52399`, certificado de produção. Substitui a 5.6.4 no OTA pendente.

### F-90 — Widget "Esportes News" separado de "Notícias (RSS)", sempre com a imagem da notícia — DONE (Player 5.6.6)
- **Pedido do proprietário:**
  - notícias de esportes em uma opção própria, ao lado de "Notícias (RSS)";
  - toda notícia de esporte com a imagem de referência da notícia;
  - se a fonte não fornecer imagem, buscar outra fonte.
- **Auditoria de fontes (27/09):**
  - **Agência Brasil (CC BY 4.0).** Das últimas 45 matérias de esportes, só 3 têm imagem própria, e as três são artes de divulgação da TV Brasil ("Arte/Agência Brasil", "Arte/EBC"). As demais têm foto de terceiros (CBF, clubes, CBV, CBDV, "Divulgação"), ou "Direitos Reservados", ou Reuters "Proibida reprodução". A licença CC BY da Agência Brasil não cobre conteúdo de terceiros.
  - **Rádio Agência Nacional (EBC).** 0 de 10 fotos próprias.
  - **Feeds comerciais com foto.** ge/globo.com, Gazeta Esportiva, Trivela, Metrópoles e Estadão trazem imagem em 80–100% dos itens, mas não licenciam reuso comercial. A Globo já tinha sido classificada como não autorizada no F-79.
  - **gov.br Ministério do Esporte.** Bloqueia leitura automática (401).
  - **Conclusão:** hoje não existe fonte de notícias de esporte com licença aberta e foto em volume. Ativar uma fonte comercial é decisão do proprietário (autorização ou contrato de licenciamento). Depois disso, basta cadastrar a fonte com `imagem = 'feed'`, sem mudar código.
- **Banco (migração 20261260, aditiva):**
  - Coluna `content_news_sources.imagem` (`nenhuma` | `feed` | `artigo_propria`). A Agência Brasil fica com `artigo_propria`.
  - Colunas `content_news_items.image_credit` e `image_checked_at`.
  - Nova função `fn_widget_esportes_news_dados`: só entrega itens com imagem https.
  - `fn_widget_pode_exibir`: widget sem nenhuma notícia com imagem sai da reprodução.
  - `fn_widget_suportado_no_aparelho`: `sports_news` só vai para Player ≥ 5.6.6, porque a 5.6.5 trataria o tipo como RSS.
  - `content_touch_widgets('noticias')` também atualiza o novo widget.
  - `fn_widget_noticias_dados` (RSS legado) passa a ler só a Agência Brasil, que é o crédito fixo que ele devolve.
  - Nova prévia `content_esportes_news_preview`, só para authenticated.
  - `get_player_playlist_for_screen` não foi alterada.
  - Payload das 7 telas idêntico antes e depois (hash).
- **Motor (`news-engine-sync` + `_shared/noticias/fotos.ts`):**
  - Fonte `feed`: usa a imagem do item (media:content, enclosure ou `<img>`), ignorando logo, SVG e pixel de rastreio.
  - Fonte `artigo_propria`: abre a matéria e aceita a foto principal (1170x700) só com crédito do próprio veículo (Agência Brasil, EBC, TV Brasil, Rádio Nacional, sem "Proibida"/"Direitos reservados").
  - Até 12 matérias por execução; falha de rede tenta de novo na próxima execução.
  - Em produção: 12 matérias verificadas, 1 imagem própria aceita e 11 recusadas (terceiros ou sem foto).
- **Painel:**
  - Tipo "Esportes News" ao lado de "Notícias (RSS)".
  - Modelo `esportes-news` na Galeria e no Conteúdo Automático da Biblioteca; o modelo `rss-esportes` saiu do tipo RSS (nenhum widget o usava).
  - `SportsNewsWidget`:
    - horizontal: foto em tela cheia com a manchete por cima;
    - vertical: foto no alto sobre a mesma foto desfocada, texto abaixo;
    - na tela: horário (Brasília), manchete, resumo e crédito da foto sempre visível;
    - 3 notícias de 8 s por exibição (24 s), continuando da seguinte;
    - notícia cuja imagem não carrega é pulada.
- **Player 5.6.6 (553):**
  - `WidgetKind.SPORTS_NEWS`, avaliado antes de "news" para não cair em RSS.
  - `EsportesNews.kt` (parser e regras) e `buildSportsNews` com a mesma composição do painel.
  - Imagens pré-carregadas pelo Glide, as demais aquecidas no cache de disco; cursor em `esportes_news_cursor`.
- **Prova:**
  - Web: suíte completa 1196/1196 (125 arquivos), com `esportesNews.test.tsx` (10) e `noticiasFotos.test.ts` (9) novos; testes do catálogo atualizados (Esportes News é o único modelo sem imagem de fundo, porque a imagem é a da notícia).
  - JVM: 209/209, sendo 4 do `EsportesNewsTest`.
  - `EsportesNewsRenderTest` no emulador: 16:9 e 9:16 com a notícia real, crédito "Arte/Agência Brasil"; notícia com imagem inexistente não aparece.
  - Painel local: botão ao lado de RSS, capa ao vivo, prévia 16:9 e 9:16.
  - Banco: telas com 5.5.9, 5.6.1 e 1.0.0 não recebem o widget; 5.6.6 e 5.6.10 recebem.
- **Publicação:**
  - Vercel produção: `dpl_ExVp4oPUa7W5DW4YHj2SuWLXsffh` (commit `cf9d94e`), READY; os chunks de produção contêm `sports_news` e `content_esportes_news_preview`.
  - Edge Function `news-engine-sync` publicada; migração 20261260 aplicada.
  - **Release 5.6.6 (553):** SHA-256 `99e06350ffbc4e1f1dacf32e5396d3a3167952a4153bc6e8041210dab672482f` (5.743.552 bytes), certificado de produção `95a973c3…`, não depurável. GitHub `player-v5.6.6` → R2 `releases/sobremidia-player-v553.apk` (hash público conferido) → `app_releases` 553. Substitui a 5.6.5 no OTA.
  - APK debug 5.6.6: SHA-256 `bf892e00726afe40399f05319783c2e499962e324ab5f0ead0d1a4f5e8bfdfca`.

### F-91 — Esportes News girando várias notícias com a foto da notícia; RSS sempre com imagem; Resultados sem avisos — DONE (Player 5.6.7)
- **Problema relatado pelo proprietário (27/09):**
  - O Esportes News mostrava uma só notícia, parada. Causa: com a regra do F-90, só havia 1 notícia com imagem própria da Agência Brasil.
  - O widget Resultados mostrava um aviso amarelo ("EXEMPLO com a última rodada real…") e mensagens de "sem jogos" ou de erro.
- **Decisão do proprietário (por escrito, 27/09):**
  - Reproduzir a foto da própria notícia mesmo sem autorização do dono (CBF, clubes, agências, ge/Globo), assumindo o risco de direito autoral.
  - Toda notícia de esporte e toda notícia RSS com imagem.
  - **Não atendido:** "alterar ou disfarçar a imagem para não ter direito autoral". Editar a foto não remove o direito do autor e tiraria o crédito. A foto é exibida sem alteração e com o crédito original.
- **Motor de notícias:**
  - Modo `artigo` (foto principal da matéria, qualquer crédito): a Agência Brasil passou a ele.
  - Nova fonte `ge-esportes` (imagem do feed; sem ela, a imagem da página da matéria).
  - Filtro `naoENoticia`: páginas de jogo ao vivo "… - globoesporte.com", enquetes e link da página inicial; o emoji ▶️ sai do título.
  - Migrações 20261261 e 20261262.
  - `fn_widget_esportes_news_dados` intercala as fontes (1ª da Agência Brasil, 1ª do ge…), para que as notícias da Agência Brasil (CBF, Seleção) não sumam atrás do volume do ge.
  - Produção: 35 notícias ativas, 35 com foto (antes: 1). Payload das 7 telas idêntico.
- **Notícias (RSS):**
  - `fetch-rss` usa a mesma regra de imagem do motor (sem logo, SVG ou pixel). Sem imagem no feed, usa a foto da página da matéria (foto principal da Agência Brasil ou og:image, nunca a genérica do site; com guarda SSRF). Notícia sem imagem não vai para a tela. Os títulos têm as entidades decodificadas.
  - Painel: `RssWidget` usa o mesmo desenho do Esportes News, com o selo "NOTÍCIAS" e a fonte na tela; o RSS não tem mais fundo nem faixa compacta.
  - Player: `ImagemDaNoticia.kt` (mesma regra), `RssFeedParser` com link e imagem, imagem da página em cache por link, `buildRssComImagem`.
  - Teste real: Agência Brasil, g1 e CNN retornaram 5 de 5 notícias com imagem.
- **Resultados e Próximos Jogos:**
  - Saíram da tela o aviso amarelo de EXEMPLO e as mensagens "Sem jogos…" e "Não foi possível carregar…", no painel e no Player.
  - Na prévia com a última rodada real, as linhas mostram as datas de verdade (HOJE/ONTEM pelo dia real).
- **Prova:**
  - JVM 212/212 (+3 `ImagemDaNoticiaTest`).
  - Web: suíte completa 1201/1201 (125 arquivos), incluindo esportesNews (11), noticiasFotos (12), esportesWidget (14) e widgetCapas.
  - `EsportesNewsRenderTest` no emulador: 3 exibições seguidas com 3 notícias diferentes (Agência Brasil e ge, 16:9 e 9:16), e Notícias (RSS) da Agência Brasil com a foto da matéria.
- **Publicação:**
  - Vercel produção `dpl_9Zt91Jfu9StrzHBbnCYenMdQKudA` (commit `1dd75e6`); os bundles não contêm mais "EXEMPLO…" nem "Não foi possível carregar os jogos".
  - Edge Functions `news-engine-sync` e `fetch-rss` publicadas; migrações 20261261 e 20261262 aplicadas.
  - **Release 5.6.7 (554):** SHA-256 `72060371d79810950b977e8ff61a6bb0a3365735e3cc3cac853f32a46a6ecac7`, certificado `95a973c3…`. GitHub `player-v5.6.7` → R2 (hash público conferido) → `app_releases` 554.
  - APK debug 5.6.7: SHA-256 `6f5c29326d97e1ef932649003b3de631ccc0f49ce3d29d630322f11b58731ee7`.

### F-92 — Prévia dos widgets igual ao Player (Clima Futurista cortado na prévia) — DONE (só web)
- **Relato do proprietário (foto):**
  - Na prévia do Clima, a etiqueta "MÍN." quebrava de linha e ficava cortada.
  - A previsão dos 5 dias não aparecia.
  - A cidade encostava no selo "CLIMA AGORA".
- **Causa raiz:** os widgets web usavam `clamp(Npx, X cqmin, Mpx)`, ou seja, tamanho mínimo e máximo em pixels, e espaçamento `p-[5%]` (% da largura). O Android Player desenha tudo só em proporção ao menor lado (`base * fator`). Numa prévia pequena (302×169 px) os mínimos deixavam o texto maior que o quadro. Na TV (Android) o layout já era proporcional e correto. A prévia não representava a tela.
- **Correção:**
  - Em 8 widgets (Clima, Relógio, Institucional, Oferta, Publicidade, Social, QR e YouTube) e na capa do YouTube da Galeria, os limites em pixels saíram e ficou só a proporção, com os mesmos fatores do Android.
  - O espaçamento interno virou `cqmin` (5% ou 4,5% do menor lado, como no Player).
  - As etiquetas do clima ficam numa linha só, como o `LinearLayout` horizontal do Player.
- **Prova:**
  - Prévia 302×169 px no painel local: nenhum elemento fora do quadro, com cidade, temperatura, 3 etiquetas e 5 dias visíveis.
  - Web 1201/1201, mais o `widgetProporcao.test.ts` (10), que proíbe limite em pixels ou espaçamento em % nos widgets.

### F-93 — Pasta inteira da Biblioteca na playlist, com rodízio no Player — SERVIDOR/PAINEL DONE; Player 5.6.8 aguardando canário
- **Pedido do proprietário:** adicionar uma pasta completa (ex.: Memes) à playlist; a cada volta o Player toca um conteúdo diferente da pasta, do 1º ao último, e recomeça.
- **Desenho (mínima mudança no Player):** o servidor manda todas as mídias da pasta como itens comuns, marcadas com `grupo` (o id do item). Com isso download, cache offline, integridade, troca atômica e limpeza continuam iguais. O Player toca um item por grupo em cada volta, com cursor gravado no aparelho (`pasta_cursor`, igual ao cursor do Esportes).
- **Banco (20261263):**
  - `playlist_items.biblioteca_pasta_id`; `valid_item_source` passa a exigir exatamente uma origem entre mídia, widget, link ou pasta.
  - `fn_save_playlist_items` passa a gravar a pasta.
  - `get_player_playlist_for_screen` passo 7: os itens comuns mantêm o mesmo objeto; o item de pasta vira as mídias com `grupo`, na orientação da tela quando a pasta tem as duas.
  - W12: só Player ≥ 5.6.8 recebe itens de pasta.
  - Nova `biblioteca_adicionar_pasta_playlists`.
  - Gatilhos avisam as playlists (Realtime) quando o conteúdo da pasta muda.
  - Definições anteriores em `evidence/F-93_pasta_na_playlist/`.
- **Prova do banco:**
  - A resposta real da RPC para as 5 telas vinculadas ficou idêntica antes e depois (md5, chamada dentro de transação desfeita).
  - Simulação desfeita: pasta "VIDEOS EM PE ACADEMIA" (9 vídeos) na playlist de teste. O Player 5.6.8 recebe 9 itens com o mesmo grupo; o 5.6.7 não recebe nenhum.
- **Painel:**
  - Biblioteca, menu da pasta: "Adicionar pasta à playlist".
  - O editor da playlist e os detalhes da tela mostram e preservam o item "Pasta: …".
  - `playlistItems` grava `biblioteca_pasta_id`.
- **Player 5.6.8 (555):**
  - DTO, `MediaItem` e cache com `grupo`.
  - Room 11 → 12 (`ALTER TABLE media_item ADD COLUMN grupo`), provado no emulador: versão 12, coluna criada e linha existente preservada.
  - `RodizioDePastas` e `CursorDePastas`; o laço avança o cursor quando o conteúdo toca ou falha (conteúdo com defeito não prende a pasta).
  - Assinatura de configuração inclui o grupo.
- **Testes:** JVM app 218/218 (`RodizioDePastasTest` 6: pasta sozinha, pasta entre itens, duas pastas, conteúdo removido, sem grupo, pasta de 1) e core 71/71. Web 1222/1222.
- **Canário:** o proprietário testou o APK 5.6.8 no aparelho (27/09) e autorizou a distribuição.
- **Release 5.6.8 (555):** SHA-256 `2d5280d4df1e26734daab1f6e3920c7d6632b4e654f34ce4b1593fa3dbe01935`, certificado `95a973c3…`. GitHub `player-v5.6.8` → R2 (hash público conferido) → `app_releases` 555.

### F-94 — Pastas automáticas: Loterias e Sorteios com dados reais da CAIXA — DONE
- **Decisões do proprietário (27/09):** começar por Loterias + pasta na playlist; Memes/Humor com conteúdo próprio (sem Reddit); Apostas Esportivas com jogos da rodada, sem odds.
- **Fontes:**
  - API pública do portal de loterias da CAIXA, acessível pelo GitHub Actions. Ela bloqueia o servidor do Supabase (403).
  - Reserva: espelho público loteriascaixa-api (mesmos dados oficiais; pode atrasar 1 concurso). Vale o concurso mais novo.
  - 9 modalidades: Mega-Sena, Lotofácil, Quina, Lotomania, Timemania, Dupla Sena, Dia de Sorte, Super Sete e +Milionária.
- **Banco (20261264):** `biblioteca_pastas.conteudo_automatico` (pastas "Loterias" e "Sorteios" marcadas) e `conteudo_auto_publicar`, só para service_role.
  - Item novo vira mídia da Biblioteca com a tag `auto:<chave>`.
  - Arte nova substitui o arquivo na mesma mídia; a pasta na playlist continua válida e o Player baixa pelo hash.
  - Chave que sumiu vai para a Lixeira.
  - Itens colocados à mão nunca são tocados.
- **Edge Function `conteudo-automatico`:** segredo próprio `CONTENT_FACTORY_SECRET` (Supabase e GitHub), aceita só URLs do próprio bucket em `conteudo/`, recusa sem chave (401).
- **Robô** (`scripts/conteudo/*`, workflow `conteudo-automatico.yml`, 22:20 e 10:20 de Brasília e sob demanda):
  - Artes SOBRE MÍDIA em 16:9 e 9:16 com a cor de cada modalidade: dezenas, 2º sorteio, trevos, time do coração, mês da sorte, "ACUMULOU!" ou ganhadores, próximo concurso com estimativa, e aviso "Jogue com responsabilidade · Proibido para menores de 18 anos".
  - A identidade da arte é o conteúdo (hash do HTML), então sem sorteio novo nada muda nas telas.
  - Arquivos substituídos são apagados do R2.
- **Prova:**
  - 1ª execução: 18 itens em Loterias e 18 em Sorteios, dados da CAIXA.
  - Execução seguinte, sem sorteio novo: 18 + 18 "iguais", 0 alterações.
  - Imagem real publicada conferida (Dia de Sorte, concurso 1307).
  - `loteriasConteudo.test.ts` (9) com amostras reais das 9 modalidades nas duas fontes.
- **Próximas etapas pedidas:**
  - Datas Comemorativas (BrasilAPI e calendário), Cinema e Turismo (g1/CinePOP/Viagem e Turismo com foto), SOBREMÍDIA NEWS, Esportes e Futebol (motor de notícias).
  - Charadas, Humor e Memes (conteúdo próprio).
  - Apostas Esportivas (jogos da rodada, sem odds).
  - Pastas de vídeo: dependem de uma chave gratuita Pixabay/Pexels do proprietário.

### F-95 — Todas as pastas automáticas da Biblioteca preenchidas e atualizadas sozinhas — DONE
- **Pastas marcadas (20261265, só na empresa do proprietário):**
  - Datas Comemorativas, SOBREMÍDIA NEWS, Esportes, Futebol.
  - Vídeos Cinema, Vídeos Turismo, Charadas, Memes, Vídeos Humor, Vídeos Incrível (curiosidades), Vídeos Nostalgia.
  - Brasileirão, Premier League, La Liga, Champions League.
  - Apostas Esportivas: jogos da rodada, sem odds.
  - "Vídeos Esporte" aguarda uma fonte de vídeo: chave Pixabay/Pexels, que a conta do proprietário precisa criar.
- **Banco:**
  - `conteudo_esportes_dados()` (só service_role): últimos 6 resultados e próximos 6 jogos publicados, só escudos conferidos.
  - `conteudo_auto_estado()`: o robô não redesenha o que não mudou.
  - 20261266: item automático que sai da pasta (notícia velha) é apagado de vez, junto com a mídia e o arquivo no R2, se não estiver em uso. Não lota a Lixeira.
  - A Edge Function `conteudo-automatico` lê esses dados com o segredo do robô.
- **Robô (`scripts/conteudo/robo.mjs` + `produtores/*`, a cada 3 h e sob demanda):**
  - Notícias com a foto da própria notícia e crédito, 10 por pasta, fontes intercaladas: Agência Brasil e g1; g1 Cinema e CinePOP; g1 Turismo e Viagem e Turismo. Esportes e Futebol vêm do motor de notícias. Jogo ao vivo e enquete ficam de fora.
  - Campeonatos: arte oficial do campeonato com taça, 6 jogos (2 colunas na horizontal), escudos conferidos ou as iniciais.
  - Datas: as próximas 10 datas nacionais, com as móveis pela regra oficial (Páscoa por Meeus).
  - Conteúdo próprio (bancos escritos para a SOBRE MÍDIA, próprios para comércio), troca semanal: charada com pergunta e depois resposta, piada, meme em texto, curiosidade com fato consolidado, nostalgia "Quem lembra?".
  - Arte que não carrega uma foto ou escudo não é publicada.
- **Prova:**
  - 1ª execução: 346 mídias em 18 pastas (16x9 e 9x16), 0 falhas.
  - 2ª execução: tudo "iguais", 0 desenhadas.
  - Imagens reais conferidas: Futebol vertical, Memes horizontal, Brasileirão.
  - Testes `conteudoPastas.test.ts` (11) e `loteriasConteudo.test.ts` (9).

### F-96 — Conteúdo próprio troca a cada 3 dias, bancos ampliados — DONE
- **Pedido do proprietário:** charadas sem repetir tão cedo; Memes, Vídeos Incrível, Nostalgia e demais com troca a cada 3 dias (antes era semanal).
- **Bancos** (`bancos.mjs` + `bancos-ampliacao.mjs`, 0 duplicados): 118 charadas, 71 piadas, 88 memes, 86 curiosidades e 75 de nostalgia.
- **Por troca** (período de 3 dias, Brasília): 8 charadas (16 cartões: pergunta e resposta), 8 piadas, 10 memes, 10 curiosidades e 10 de nostalgia.
- **Sem repetir:**
  - charadas por 14 trocas (42 dias);
  - piadas por cerca de 26 dias;
  - memes e curiosidades por cerca de 25 dias;
  - nostalgia por cerca de 21 dias.
- **Prova:** teste de 14 trocas sem repetição e execução real (Charadas 32 itens, Memes 20, Curiosidades 20, Nostalgia 20, Humor 16).

### F-97 — Vídeos (Pexels) nas pastas de vídeo — DONE
- **Chave:** a chave da API do Pexels (conta do proprietário) foi validada (HTTP 200) e guardada em `~/.sobremidia-secrets/tokens.env` e no segredo `PEXELS_API_KEY` do GitHub. O proprietário a enviou pelo chat; ele pode trocá-la no Pexels quando quiser.
- **Migração 20261267:** `conteudo_auto_publicar` grava `duration_ms` e a miniatura do vídeo, e o Player toca o vídeo inteiro via `fn_media_duracao_item`. A pasta "Vídeos Esporte" fica marcada como `videos-esporte`.
- **Robô:** `produtores/videos.mjs`.
  - MP4 HD de 5 a 30 s, até 30 MB, horizontais para 16:9 e verticais para 9:16, troca semanal.
  - Vídeos Esporte: 6+6. Turismo, Incrível e Humor: 4+4 somados às artes.
  - Vídeo que não mudou não é baixado de novo.
  - Erro temporário do Pexels: nova tentativa e troca de termo. Pexels fora do ar: as pastas de vídeo e as mistas ficam como estão (provado com um HTTP 500 real).
- **Resultado:** 32 vídeos (Esporte 11, Humor 8, Incrível 7, Turismo 6), todos com duração, média de 8,5 a 11,5 MB; arquivo público conferido (HTTP 200, video/mp4).

### F-98 — Vídeos do Pixabay somados ao Pexels (também em Vídeos Cinema e Vídeos Nostalgia) — DONE
- **Chave:** a chave da API do Pixabay (conta do proprietário, enviada no chat) foi validada (HTTP 200) e guardada no arquivo de segredos e no segredo `PIXABAY_API_KEY` do GitHub.
- **Robô:** `produtores/videos.mjs` com as duas fontes.
  - Pixabay com busca segura (`safesearch`) e só filmagens, na versão até Full HD e até 30 MB, baixada e hospedada no R2 (sem link direto para o Pixabay).
  - Por pasta e orientação:
    - Vídeos Esporte: 6 Pexels + 3 Pixabay;
    - Turismo, Incrível e Humor: 4 + 2;
    - Cinema e Nostalgia: 3 Pixabay, somados às artes.
  - A identidade dos vídeos do Pexels não mudou (os 32 já publicados foram reaproveitados, sem novo download).
  - As duas fontes fora do ar: as pastas de vídeo ficam como estão.
- **Prova:** execução real com 28 vídeos novos do Pixabay, 0 falha de publicação; `conteudoPastas.test.ts` com 14 testes.

### F-99 — Atalhos de operação e mapa do projeto (economia de tokens) — DONE
- **Motivo:** o proprietário pediu para gastar menos e achar os pedidos mais rápido. Antes, cada sessão redescobria a estrutura e recriava na hora os mesmos scripts (SQL, deploy, conferência).
- **Mudança** (só documentação e ferramentas; o site, o banco e o Player não mudaram):
  - `scripts/ops/`, com os comandos reutilizáveis:
    - `sql.mjs`, `deploy-vercel.mjs`, `conferir-site.mjs`;
    - `comparar-telas.mjs` (antes/depois de todas as telas, numa transação desfeita);
    - `sessao-teste.mjs`, `publicar-player.mjs`;
    - `segredos.mjs` (lê `~/.sobremidia-secrets/tokens.env` sem imprimir).
  - `.claude/skills/`, com 5 receitas curtas que só carregam quando o assunto aparece: `deploy-producao`, `release-player`, `migracao-segura`, `conteudo-automatico`, `conferir-painel`.
  - `docs/MAPA_DO_PROJETO.md`: tabela "pedido → onde mexer".
  - `docs/PLAYER_REFERENCIA.md`: o que era útil de `.agents/memory/player_architecture_baseline.md`, mais as lições do ledger. Os ADR-001/002 do `.agents` falam só da própria estrutura `.agents` e não foram trazidos.
  - `CLAUDE.md`: 6 linhas de atalhos, curto porque carrega em toda mensagem.
- **Prova:**
  - `sql.mjs` devolveu as 5 telas vinculadas;
  - `comparar-telas.mjs antes/depois` deu 5 telas idênticas, saída 0;
  - `conferir-site.mjs` achou "Adicionar pasta à playlist" no ar;
  - todos os `.mjs` passaram na checagem de sintaxe (`node --check`);
  - todos os caminhos citados no mapa e nas receitas foram conferidos (dois corrigidos: `rss.mjs`/`bancos*.mjs` ficam em `scripts/conteudo/`, e `PlayerDatabase.kt` fica no `cache-manager`).

### F-100 — Portal do Anunciante mandava todo anunciante para a tela de "escolha a modalidade" — DONE
- **Sintoma:** o anunciante logado caía em `/portal/onboarding` ("Escolha a modalidade") em vez do painel, e o painel ficava sem o nome da empresa.
- **Causa raiz** (reproduzida com a regra de acesso do próprio anunciante, `alfa_…@homolog-sobremidia.com.br`):
  - a migração 20261207 (reforço de segurança, lote 4A) removeu a regra ampla de leitura de `clientes`;
  - a `cli_select_policy`, que ficou, só cobre equipe interna e representante;
  - com isso, o anunciante via 0 linha em `clientes` e `empresas` → `useClienteModalidade` devolvia modalidade nula → `CustomerPortalLayout` redirecionava para o onboarding.
- **Correção:**
  - Migração 20261268, aditiva e só de leitura: `cli_select_proprio_cliente` e `emp_select_proprio_cliente` deixam o usuário ler **apenas** a própria linha (`get_user_cliente_id()`, dentro do próprio tenant). A regra ampla não voltou.
  - Painel: título "Bem-vindo(a), <empresa>!" em `CustomerPortalDashboard.tsx`.
- **Prova:**
  - Isolamento, antes → depois:
    - Alfa: 0 → 1 (a própria);
    - Beta: 0 → 1, e não vê a Alfa;
    - Dono: 119 → 119;
    - Representante: 1 → 1.
  - `comparar-telas`: todas as telas idênticas.
  - 48 testes do portal passaram.
  - No navegador, com `usuario1anunciante@sobremidia.com.br`: `/portal` abre direto o painel com "Bem-vindo(a), Restaurante Alpha Premium!" e o menu completo do anunciante; `/portal/encarte` abre.
- **Pendente (fora do escopo):** `ctr_select_policy` de `contratos` só reconhece o papel `CLIENTE`, então o anunciante (papel `ANUNCIANTE`) não vê os próprios contratos.

### F-101 — Portal do Anunciante: primeira vista de pontos e campanhas, cabeçalho novo, faturas e contratos visíveis — DONE
- **Pedido do proprietário:**
  - faturas fora da primeira vista (só no menu);
  - cards grandes com pontos parceiros, exibições por ponto e campanhas rodando com seus pontos;
  - menu à esquerda, com foto em círculo + SOBRE MÍDIA + Anunciante; nome do cliente à direita;
  - Sair só no fim do menu; "Mais" vira "Perfil";
  - sem Brand Kit e sem Minha Equipe para o anunciante.
- **Causas encontradas:**
  - "Contratos e Faturas" vazio: a página pedia `contas_receber.valor_original`, coluna que não existe (o nome é `valor`). A consulta falhava inteira. Correção: `valor_original:valor`.
  - Contrato invisível: `ctr_select_policy` só reconhece o papel legado `CLIENTE`. Nova policy aditiva `ctr_select_proprio_cliente` (só leitura, só a própria linha).
  - Rodapé do menu mostrava "Anunciante / Anunciante": o código lia `user.name` e `usuario.cargo`, que não existem. Passou a usar o nome e a foto do usuário.
  - Menu do celular ficava atrás do cabeçalho e da barra inferior, escondendo o "Sair do Portal": o menu passou para a camada de cima (`z-[60]`).
- **Migração 20261269:** `fn_portal_anunciante_vitrine()` (só leitura, SECURITY DEFINER, escopo `get_user_cliente_id()`).
  - Pontos = contrato ∪ playlists publicadas ∪ telas das campanhas ∪ telas que exibiram o anúncio.
  - Exibições = `playback_logs` do contrato, da campanha ou de mídia do cliente.
  - Campanhas = `agendamentos` com a lista de pontos.
- **Observação de dados (sem inventar número):** hoje nenhum cliente tem pontos no contrato, playlist publicada ou tela ligada a ponto parceiro (`screens.ponto_id` vazio em todas), e nenhuma exibição está atribuída a contrato ou campanha. Os cards mostram zero e o convite para anunciar até essas ligações existirem.
- **Prova:**
  - isolamento por cliente na simulação desfeita; `comparar-telas`: telas idênticas;
  - 55 testes do portal/Central do Dia passaram;
  - navegador 800x1280 com `usuario1anunciante@sobremidia.com.br`: cabeçalho, menu à esquerda com Sair no fim, Perfil no rodapé, Contratos e Faturas com contrato CTR-8001 e histórico.

### F-102 — Central do Anunciante só com avisos + suporte com triagem (OWNER/ADMIN atendem) — DONE
- **Antes:** o anunciante usava a mesma Central da equipe interna (Receita Faturada, Inteligência, Solicitações, chat livre e criação de grupo). O `portal_chamados` legado (vazio) tem leitura para o tenant inteiro e não foi usado.
- **Regra do proprietário:**
  - o anunciante só recebe avisos (faturas a pagar/atrasadas, ativação de mídia) e fala só com o suporte;
  - ao abrir, escolhe o motivo (triagem);
  - a mensagem chega ao OWNER e a todos os ADMIN;
  - só eles respondem e encerram como resolvido;
  - depois de resolvido, abre-se um novo suporte;
  - o gestor de mídias mantém grupos e usa o mesmo suporte.
- **Migração 20261270 (aditiva):**
  - tabelas `suporte_chamados` e `suporte_mensagens`, com RLS só de leitura (quem abriu vê os seus; OWNER/ADMIN do tenant veem todos);
  - escrita só pelas RPCs `suporte_abrir_chamado` (motivo obrigatório, um aberto por usuário), `suporte_enviar_mensagem` e `suporte_resolver` (só OWNER/ADMIN);
  - avisos em `notificacoes_central` (tipo `SUPORTE`).
- **Telas:**
  - `/portal/central` → `CentralAnunciantePage`, com abas Avisos e Suporte;
  - Central da equipe ganhou a aba "Suporte": OWNER/ADMIN veem a fila de atendimento; os outros perfis (ex.: GESTOR) veem "Falar com o suporte";
  - `?aba=suporte` abre direto nessa aba.
- **Prova:**
  - simulação desfeita: anunciante abre; abrir de novo devolve o mesmo; outro anunciante e dono de outro tenant veem 0; os 3 atendentes do tenant recebem o aviso; admin responde e encerra; anunciante vê RESOLVIDO;
  - `suporteTriagem.test.tsx` (4 testes) + regressão/isolamento do portal (100 testes);
  - navegador: Central do anunciante e formulário de triagem (sem enviar, para não avisar o dono real); fila do admin `dbg.adm` sem erro.

### F-103 — Brand Kit do Gestor de Mídias ("Minha Marca") e marca dele no Player pelo login — DONE (site/banco) · Player 5.6.9 aguardando canário
- **Regra do proprietário:** Brand Kit não é do anunciante (saiu do portal no F-101). É do Gestor de Mídias, que trabalha como afiliado. Quando ele faz login no Player Android, o aparelho mostra o logo e as cores da empresa dele.
- **Migração 20261271 (aditiva):**
  - tabela `gestor_marcas` (1 por usuário; RLS: o próprio lê e grava; OWNER/ADMIN do tenant leem);
  - RPC `fn_player_minha_marca()` → `{status: OK|PADRAO, nome_marca, logo_url, cor_primaria, cor_secundaria, slogan}`;
  - o Player antigo não chama esta RPC (sem impacto na frota).
- **Site:** `/dashboard/marca` "Minha Marca" no menu do gestor: logo no R2 em `{usuario}/marca/`, nome, frase, cores, liga/desliga e prévia de como fica no Player.
- **Player 5.6.9 (556):**
  - `MarcaDoGestor` busca a marca na escolha de tela (logo após o login) e guarda no aparelho (vale offline e após reiniciar);
  - o logo do gestor substitui o SOBRE MÍDIA na abertura, na escolha da tela, no "Sincronizando Mídias" (com a cor de fundo da marca) e no aviso de suspensão; a tela de espera preta continua sem logo;
  - falha ao buscar ou baixar mantém o que já estava; sem marca → SOBRE MÍDIA.
- **Prova:**
  - simulação desfeita: gestor 1 recebe "Mídia Norte"; gestor 2 não vê nem altera e recebe PADRAO; dono do tenant lê; anunciante de outro tenant vê 0;
  - Gradle: 292 testes, 0 falhas (3 novos em `MarcaDoGestorTest`);
  - navegador: "Minha Marca" no menu e prévia ao vivo (sem salvar).
- **APK (saída padrão):**
  - release 5.6.9 (556) sha256 `81c9143853952bb21e48417dea41b275d5f688dc1ad66a1599b39502e754304f`;
  - debug sha256 `0380b6e0db2474e2d77d7d6f91bc25a9e4a6d45a857b62c319ed1445706164e7`.
- **Pendente:** canário no aparelho do proprietário (login de gestor com marca) → depois `node scripts/ops/publicar-player.mjs`.
- **Observação:** as contas de teste `gestor_*@sobremidia.com.pe` falham no login por magic link ("Database error finding user" no Supabase Auth). É um problema antigo, fora deste escopo. `sessao-teste.mjs` agora mostra o motivo da falha.

### F-104 — Senha do primeiro acesso "não salva" (cliente não consegue voltar a entrar) — DONE
- **Evidência (`security_logs`, conta anunciante `daiamestrsfgdse9@…`):**
  - 02:08 login com a senha temporária → troca obrigatória;
  - a troca terminou (`must_change_password=false`, o que só acontece depois do `updateUser` sem erro);
  - 02:15 duas tentativas com "Invalid login credentials";
  - 28/09 14:31 login OK.
  - A configuração do Supabase Auth está normal: sem hooks, sem reautenticação, mínimo 6. Nenhuma função do servidor regrava a senha sozinha: `authorize-password-reset` só age com autorização do administrador.
- **Causas no navegador:**
  - (1) na troca, o botão "mostrar senha" vira o campo em texto comum e o teclado do Android põe maiúscula ou corrige automaticamente; a senha salva fica diferente da que o cliente acha que digitou;
  - (2) sem o campo de conta (username), o gerenciador de senhas do navegador continua preenchendo a senha temporária antiga no login.
- **Correção:**
  - campos de senha com `autoCapitalize=none`, `autoCorrect=off`, `spellCheck=false` (troca, login, Meu Perfil);
  - campo `username` escondido na troca; `username`/`current-password` no login;
  - e-mail do login com `trim` e minúsculas;
  - **prova real:** depois do `updateUser`, entra com a senha nova (`signInWithPassword`); só então conclui. Se não conferir, avisa na hora e mantém a troca pendente.
- **Prova:** `senhaPrimeiroAcesso.test.ts` (4) + fluxos de senha e perfil (33).

### F-105 — Cobranças: pagamento do Inter sempre registrado, edição que vale no link, bloqueio automático por atraso — DONE
- **Causa raiz (Hotel Maxsuel, REC-2026-834997):**
  - a edição 622→618 manteve o PIX de 622 guardado (txid fixo por cobrança; o link mostrava o PIX antigo);
  - o cliente pagou 622; o webhook chegou em 23/09 13:03 e o registro foi recusado por `trg_valida_integridade_pagamento` (ERR_VALOR_EXCEDENTE 622 > saldo 618). Reproduzido no banco.
- **Achados extras:**
  - o webhook de PIX aceitava aviso falso sem consultar o banco (txid previsível);
  - o webhook de boleto só anotava a situação e nunca quitava a cobrança;
  - `inter-pix-engine` chamava `generatePixPayload`, que não existia nela;
  - a edição podia "salvar" sem gravar (update sem linhas não dá erro).
- **Correção:**
  - Migrações 20261272–20261274:
    - histórico de PIX/boleto aposentados;
    - gatilho que aposenta a emissão ao editar valor, vencimento ou formas;
    - `fn_registrar_pagamento_inter` (valor recebido pelo banco; aplica até o saldo e anota o excedente; idempotente);
    - `screens.cliente_id` + bloqueio a partir de 4 dias de atraso e reativação imediata ao pagar (controle manual preservado);
    - cron do bloqueio (de hora em hora) e da conciliação com o Inter (15 em 15 min);
    - `rpc_get_public_billing` + `valor_recebido_banco`.
  - Funções: txid único por emissão; aviso só vale depois de confirmado no próprio Inter (`/pix/v2/pix/{e2e}` ou `/cob/{txid}`; boleto `/cobrancas/{codigo}`); ação `reconciliar`; boleto reemitido com referência nova.
  - Telas:
    - edição de cobrança com mês, situação, valor já pago e valor recebido pelo Inter; mudar o mês cria uma cobrança nova e mantém a original;
    - página da fatura com "Cobrança em aberto", "Cobrança em atraso há N dias" e "Fatura paga" com o valor recebido;
    - portal do anunciante com Visualizar e Pagar em cada fatura;
    - campo "Cliente desta tela".
- **Prova:**
  - simulações desfeitas: edição aposenta o PIX; pagamento de 622 → PAGA (618 aplicados, 4 de excedente); repetir o aviso não duplica; atraso bloqueia; pagar reativa; liberação e desligamento manuais respeitados;
  - execução real: o Inter confirmou o PIX (e2e E0000000020260923130321413165624) → REC-2026-834997 PAGA;
  - navegador: página da fatura "FATURA PAGA / Valor recebido pelo Banco Inter: R$ 622,00".
- **Pendente do proprietário:**
  - o Hotel Maxsuel tem outra cobrança igual, REC-2026-338368 (618, vencida 22/09), aparentemente duplicada;
  - nenhuma tela está vinculada a cliente ainda: é preciso escolher o cliente em cada tela para o bloqueio automático valer.

### F-106 — Avisos vistos, avisos de fatura na Central do cliente, suporte e painel — DONE
- **Contador que não zerava:**
  - o aviso só saía ao ser tocado; agora aviso exibido = aviso visto;
  - no dono/ADM o sino somava avisos de clientes (visíveis por RLS); agora conta só os avisos do próprio usuário;
  - a marcação automática só vale para avisos do próprio usuário, para abrir a Central do dono não contar como "o cliente viu".
- **Migração 20261275:**
  - `notificacoes_central.lida_em`;
  - a régua de cobrança (jobs COLECTION_*) gera aviso na Central do cliente: vence em N dias, vence hoje, em atraso há N dias, pagamento confirmado;
  - o bloqueio avisa "Sua mídia foi pausada" e "Sua mídia voltou ao ar".
- **Telas:**
  - OWNER/ADMIN: "Avisos enviados aos clientes — quem já viu", com data e hora;
  - suporte com o texto "Envie para o suporte o que está acontecendo.";
  - a "Central de atendimento" antiga saiu do painel do anunciante;
  - cards "Onde seu anúncio passa" e "Suas campanhas" lado a lado e mais compactos.
- **Prova:**
  - simulação desfeita (aviso de atraso gerado, `lida_em` gravado, "Sua mídia foi pausada");
  - 123 testes;
  - navegador: o contador do anunciante zerou depois de abrir a Central (`lida_em` gravado no banco); cards lado a lado; painel do administrador mostrando "Hotel Maxsuel — Ainda não viu".

### F-107 — Pontos parceiros de Caruaru no portal + "Anunciar aqui" direto para o Player — DONE
- **Limpeza (pedido do proprietário):** Hotel Maxsuel ficou só com a fatura paga REC-2026-834997.
  - REC-2026-338368 (duplicada) e COB-2026-001329/-001330 (recorrência do contrato CTR-2026-10013) foram CANCELADAS, com `public_enabled=false`, nota e auditoria, em vez de apagadas: apagar faria a recorrência recriar outubro e novembro no dia seguinte (índice único contrato+competência).
  - `gerar_cobrancas_recorrentes` rodado em seguida: 0 geradas.
- **Migração 20261276 (aditiva):**
  - `pontos` + latitude, longitude, horario_funcionamento e publico_estimado_dia;
  - tabela `ponto_anuncios` (RLS de leitura: o cliente vê os seus, a equipe interna vê todos);
  - RPCs `portal_pontos_parceiros`, `portal_ponto_parceiro`, `anunciar_no_ponto` (só imagem ou vídeo do próprio cliente; espelho em `media` como em `publicar_playlist_cliente`) e `pausar_anuncio_no_ponto`;
  - `get_player_playlist_for_screen`: tela com `ponto_id` recebe os anúncios ATIVOS do ponto ao final, no mesmo formato de mídia;
  - vitrine: o ponto com anúncio entra em "Onde seu anúncio passa".
  - Definições anteriores guardadas em `docs/engineering/evidence/F-107/`.
- **Dados:** 5 pontos na empresa real (7d62…): Farmácia Capital do Agreste, Academia Forró Fit, Padaria Pátio do Forró, Mercadinho Feira de Caruaru e Clínica Saúde do Agreste.
  - Nomes inspirados em Caruaru, não de empresas reais, para não apresentar empresas sem vínculo como parceiras a anunciantes reais.
  - Ruas e bairros de Caruaru com coordenadas aproximadas; capas do Pexels hospedadas no R2 com crédito; horário, público por dia e valor.
- **Portal:**
  - `/portal/pontos-parceiros` (cards com capa) e `/portal/pontos-parceiros/:id` (capa, endereço, mapa OpenStreetMap, link para o Google Maps, informações e "Anunciar aqui");
  - sem mídia: "Você ainda não tem mídias para anúncios criadas" + "Crie sua primeira mídia" → `/portal/criar-midia` (em construção: por enquanto "Enviar mídia pronta");
  - o menu "Pontos para Anunciar" e os atalhos passam a apontar para os pontos parceiros.
- **Painel:** o campo "Ponto parceiro desta tela" na página da tela.
- **Prova:**
  - simulação desfeita: ponto + mídia + tela ligada → `anunciar_no_ponto` OK → o Player da tela recebe o anúncio no fim da playlist (posição 100001);
  - `comparar-telas`: as 5 telas atuais idênticas;
  - navegador 800x1280 com o anunciante de teste: 5 cards com capa, ficha com mapa, aviso sem mídia e botão para `/portal/criar-midia`;
  - 111 testes (4 novos).
- **Para tocar de verdade:** ligar uma tela a um ponto (campo "Ponto parceiro desta tela") e o anunciante ter uma imagem ou vídeo em Minhas Mídias.
- **Ainda sem cobrança:** o valor do ponto aparece, mas "Anunciar aqui" ainda não gera fatura.

### F-108 — "Ver ponto para anunciar" na página antiga + galeria e "Onde as telas estão" — DONE
- **Relato (foto do tablet):** em `/portal/expansao` (página antiga "Pontos para Anunciar"), o botão "Anunciar neste ponto" abria a "Seleção Comercial" (sem preço cadastrado) e nunca a ficha com localização.
- **Correção:**
  - na página antiga, o card inteiro (capa, nome) e o botão, agora "Ver ponto para anunciar", abrem `/portal/pontos-parceiros/:id`;
  - a lista nova ganhou o mesmo botão.
- **Migração 20261277:** `pontos.onde_ficam_as_telas` (jsonb), devolvido por `portal_ponto_parceiro`.
- **Dados:** cada um dos 5 pontos com 4 fotos na galeria (capa + 3 locais, Pexels → R2, com legenda e crédito) e a posição de cada tela (ex.: "Tela 1 · Balcão de atendimento").
- **Ficha:** galeria de miniaturas com rolagem lateral (deslizar ou setas) e foto ampliada ao tocar; seção "Onde as telas estão".
- **Prova:**
  - navegador 800x1280: em `/portal/expansao`, 5 cards com "Ver ponto para anunciar"; tocar na foto da clínica abre a ficha com 4 fotos, "Tela 1 · Sala de espera", mapa e "Anunciar aqui";
  - 105 testes.

### F-109 — Telas de pontos parceiros: cadastro de cada tela e criação automática; página só para OWNER/ADMIN — DONE (etapas 1 e 2)
- **Decisões do proprietário:**
  - representante, OWNER, ADMIN e gestor de mídia cadastram o ponto, cada tela (local, foto, orientação, tamanho, valor para anunciar) e o contrato de parceria assinado;
  - ao terminar, o sistema cria as telas parceiras "Aguardando grade"; tela criada por gestor leva identificação;
  - a página "Telas de pontos parceiros" é só de OWNER/ADMIN; anunciantes e gestores apenas consomem;
  - anúncio pago antes de ir ao ar, entrando depois do último anúncio que já toca (etapa 3);
  - diretrizes de conteúdo + robô de análise (etapa 3; precisa de chave de IA do proprietário).
- **Migrações:**
  - 20261278:
    - `screens` + tipo_tela, local_instalacao, foto_local_url, tamanho_polegadas, valor_anuncio, status_grade, cadastrada_por e cadastrada_por_papel;
    - gatilho: só OWNER/ADMIN alteram a configuração de tela PARCEIRA, e a telemetria do Player continua livre;
    - policy RESTRICTIVE de exclusão;
    - `fn_criar_telas_do_ponto` (idempotente; a tela pertence ao dono do tenant; atualiza quantidade, onde ficam as telas, valor "a partir de" e galeria do ponto).
  - 20261279: `fn_atualizar_valor_tela` (OWNER/ADMIN; recalcula o "a partir de" do ponto).
- **Telas:**
  - etapa 4 do assistente com `TelasDoPontoEditor` (foto obrigatória, local e valor);
  - ao finalizar, cria as telas;
  - gestor acessa o assistente em `/dashboard/prospeccao/ponto-parceiro` (menu "Cadastrar ponto parceiro");
  - `/dashboard/telas-parceiras` (menu e botão na página Telas, só OWNER/ADMIN): telas agrupadas por ponto com foto, local, grade, instalação e online, marca "Criada pelo gestor", valor editável e "Montar grade".
- **Dados:** 8 telas parceiras criadas para os 5 pontos de Caruaru.
- **Prova:**
  - simulação desfeita: cria 2 telas, repetir não duplica, anunciante barrado ao mudar o valor, telemetria ok;
  - `comparar-telas`: telas atuais idênticas;
  - navegador (dbg.adm): página com 8 telas em 5 pontos, menu, etapa 4 com a trava "Tela 1: informe onde a tela fica";
  - testes `telasParceiras` (4) + `pontosParceirosAnunciar` (5) + CRM/prospecção (14).
- **Observação para depois:** a policy de UPDATE de `screens` (`fn_player_can_access_screen`) deixou o anunciante chegar ao gatilho. Nas telas parceiras ele é barrado; nas telas próprias, auditar em outro item.

### F-110 — Anúncio em ponto parceiro: diretrizes, análise da mídia, escolha de telas e pagamento antes de ir ao ar — DONE (etapa 3)
- **Decisões do proprietário:**
  - paga antes; o anúncio entra no ar sozinho quando o Inter confirma o pagamento;
  - 4 dias de atraso → sai do ar;
  - diretrizes formais (vídeo até 30 s, sem conteúdo sexual explícito, sem racismo ou discriminação);
  - robô de análise recusa mídia imprópria;
  - o anunciante escolhe as telas (preço por tela);
  - o anúncio novo entra depois do último que já toca.
- **Causa raiz achada no caminho:** o envio de mídia do portal nunca funcionou. A tela esperava `uploadUrl`, mas `get-upload-url` devolve `signedUrl`, e havia 0 mídias de anunciante no banco. Corrigido em `AssetLibraryPage`.
- **Migrações:**
  - 20261280:
    - `cliente_assets` + moderação (PENDENTE, EM_ANALISE_MANUAL, APROVADA, RECUSADA, NAO_SE_APLICA), com gatilho: vídeo > 30 s é recusado, e só o sistema ou OWNER/ADMIN mudam a moderação;
    - `ponto_anuncios` + telas, valor_mensal, cobrança, validade e motivo; novos estados EM_ANALISE, AGUARDANDO_PAGAMENTO, SUSPENSO e RECUSADO;
    - `anunciar_no_ponto(p_ponto, p_asset, p_telas)` cria a cobrança (PIX/boleto, vence em 3 dias);
    - gatilhos: pagamento → ATIVO por 1 mês; mídia aprovada → cobrança; mídia recusada → aviso com motivo;
    - `fn_moderar_midia` e `fn_midias_em_analise` (OWNER/ADMIN);
    - `fn_renovar_anuncios_ponto` (renova 5 dias antes; suspende 4 dias após a validade), rodando diariamente às 06h25;
    - Player: filtra pelas telas escolhidas e ordena por `ativado_em`.
  - 20261281: agendamento `analisar-midias-pendentes` a cada 10 min.
- **Função `analisar-midia`:**
  - com `ANTHROPIC_API_KEY`, o Claude analisa a imagem ou até 4 quadros do vídeo;
  - sem a chave, em dúvida ou em erro → análise manual, com aviso para OWNER/ADMIN.
- **Telas:**
  - `DiretrizesConteudo` em Minhas Mídias, Criar mídia e Anunciar;
  - Minhas Mídias checa duração e extrai 3 quadros do vídeo;
  - diálogo "Anunciar aqui" em 2 passos (mídia → telas com valor e total → "Reservar e pagar" → "Pagar agora");
  - "Seus anúncios aqui" com Pagar, Pausar e Reativar;
  - fila "Mídias aguardando análise" em `/dashboard/telas-parceiras`.
- **Correção extra (reproduzida com teste):** a fatura pública (`PaginaCobranca`) lia datas "AAAA-MM-DD" como UTC. No Brasil, mostrava o vencimento um dia antes e a competência do mês anterior, e marcava "atrasada" desde as 21h da véspera. Agora usa `parseISO` com comparação por dia.
- **Prova (navegador, contas de teste):**
  - anunciante envia `promo-teste.jpg` pelo caminho real → "Em análise";
  - dbg.adm aprova na fila;
  - anunciante reserva 1 tela da Farmácia → anúncio AGUARDANDO_PAGAMENTO + cobrança COB-2026-002487 (149,90, PIX/boleto) → "Pagar agora" abre a fatura;
  - dados de teste desfeitos: cobrança CANCELADA e anúncio PAUSADO.
  - Testes: `pontosParceirosAnunciar`, `anuncioPontoAnalise`, `telasParceiras`, `paginaCobrancaDatas` (falhava antes da correção) e as regressões de cobrança (50).
- **Pendente do proprietário:** criar a chave da API da Anthropic para o robô analisar sozinho; até lá, a análise é manual na fila.

### F-111 — Analisador PRÓPRIO de mídia (imagem, vídeo e áudio, sem IA externa); anunciante até 20 s, gestor até 30 s — DONE
- **Decisão do proprietário:** nada de chave de IA de terceiros; o sistema analisa e aprova sozinho.
- **Vercel:**
  - `api/analise-visao` — duração real (ffmpeg), nudez por quadro a cada 2 s (NSFWJS MobileNetV2) e textos da imagem (Tesseract, português);
  - `api/analise-audio` — fala transcrita em português (Whisper base via transformers.js/onnxruntime);
  - segredo compartilhado `ANALISE_MIDIA_SEGREDO` (Vercel + Supabase); só baixa de `*.r2.dev` / `*.supabase.co`.
- **Tamanho das funções (limite de 250 MB):** `vercel-build` roda `scripts/ops/podar-analisadores.mjs`, que remove os binários de Mac, Windows, ARM e GPU (CUDA 343 MB). O ffmpeg é copiado para /tmp com permissão de execução, porque a Vercel não roda o "chmod" do pacote.
- **Política** (`supabase/functions/_shared/politicaConteudo.ts`):
  - termos proibidos (sexual, palavrão, discriminação e frases de exclusão como "proibido negros", drogas);
  - palavras coladas ("por no") e termos ambíguos → revisão;
  - nudez ≥ 70% recusa; ≥ 35% ou sensual ≥ 75% → revisão;
  - vídeo > 20 s recusa;
  - qualquer falha → equipe (nunca aprova sem análise).
- **`analisar-midia`:** chama os dois analisadores em paralelo, grava `moderacao_detalhes` (fala, textos, notas) e reserva a mídia contra análise dupla. A fila da equipe mostra o relatório.
- **Migração 20261282:**
  - limite de 20 s no banco (cliente_assets);
  - `trg_media_limite_gestor` (gestor: vídeo/áudio > 30 s barrado no envio);
  - `moderacao_detalhes`.
- **Prova:**
  - local: vídeo limpo transcrito; fala "vídeo pornô" transcrita; cartaz racista lido; 25 s medido; fotos de biquíni → revisão;
  - no ar pelo portal real: `limpo.mp4` → APROVADA sozinha; `audio_proibido.mp4` → revisão com "porno (palavras coladas)"; 25 s barrado no envio;
  - gestor 45 s barrado e 25 s aceito (simulação desfeita);
  - testes `politicaConteudo` (9).

### F-112 — Página Telas: 2 cartões (Pontos Parceiros em pastas / Anunciantes), botões organizados — DONE
- **Botões do topo:** em grade (2 por linha no celular), sem sobreposição. "Telas de parceiros" tem o mesmo estilo de "Nova Tela". "Nova Tela (R$ 22,99)" aparece só para o GESTOR (OWNER/ADMIN não pagam).
- **Cartões:**
  - **Telas Pontos Parceiros:** uma pasta por estabelecimento; dentro, cada tela separada (número do nome oficial) abre `/dashboard/screens/:codigo`, onde a grade e as mídias são só daquela tela;
  - **Telas Anunciantes:** a lista anterior, sem as telas parceiras.
- **Prova:**
  - navegador 390 px (dbg.adm): 5 pastas / 8 telas; a Academia abre as 2 telas; tocar abre TEL-2026-000061;
  - teste `pastasPontosParceiros` (2).

### F-113 — Representante vende telas de pontos parceiros no cadastro do anunciante; valor calculado e editável — DONE
- **Etapa 3 do assistente:** para cada ponto escolhido, as telas com foto, tamanho e valor (todas marcadas), com subtotal e total.
- **Etapa 4:** "Valor Mensal" e "Qtd. Telas" vêm preenchidos pelo total; representante, OWNER ou ADMIN podem digitar outro valor ("Valor ajustado manualmente · Usar o calculado").
- **Migração 20261283:**
  - `cliente_pontos.telas` e `valor_calculado`;
  - `fn_registrar_telas_anunciante` (só representante dono do cliente ou papel interno);
  - `portal_telas_contratadas`;
  - `ponto_anuncios.origem` (PORTAL/CONTRATO): nas telas do contrato não há cobrança avulsa; vai ao ar com mídia aprovada e contrato em dia (fatura paga e nada com 4+ dias de atraso); pagamento de fatura do contrato ativa; atraso de 4 dias suspende.
- **Causa raiz achada na homologação:** o gatilho `trg_cp_updated_at` (handle_updated_at) fazia `NEW.version = OLD.version + 1`, mas `cliente_pontos` não tinha a coluna `version`, então TODO UPDATE falhava (inclusive refazer a seleção de pontos de um cliente existente). Corrigido com a coluna, sem mexer no gatilho compartilhado por 8 tabelas.
- **Segundo defeito pego na simulação:** o tipo do aviso passava de 80 caracteres e travaria a baixa do pagamento. Corrigido antes de publicar.
- **Portal:** as telas do contrato aparecem "No seu contrato", com total R$ 0 e o botão "Colocar no ar".
- **Prova:**
  - simulação desfeita: venda de 1 tela (calculado 149,90, negociado 120); tela de outro ponto barrada; anunciante barrado ao mexer no valor; anúncio CONTRATO sem cobrança; com fatura em atraso fica aguardando (correto); fatura paga e contrato em dia → ATIVO só na Tela 2;
  - navegador (dbg.adm): Farmácia + Academia = R$ 559,60; ao desmarcar uma tela → 409,70; etapa 4 com o valor preenchido e a edição manual respeitada; cadastro não concluído, para não criar cliente;
  - testes `telasParaVender` (4) e `pontosParceirosAnunciar` (6).

### F-114 — Cartão "Telas Anunciantes" com as telas já existentes da empresa; limite de duração por perfil — DONE
- **Relato do proprietário:** as telas que já existiam não apareciam no cartão "Telas Anunciantes".
- **Causa:** a página só buscava telas cujo dono é o usuário logado. As 3 telas da empresa sem dono (LED Shopping Avenida, LED Restaurante Alpha, LED Academia Beta) nunca apareciam, e o ADMIN via 0 telas.
- **Correção (só na página):** para OWNER e ADMIN, o cartão junta as telas da conta com as telas da empresa, sem as parceiras. A leitura continua limitada pela regra do banco (própria conta ou mesma empresa). O total do cartão conta só as telas de anunciantes.
- **Não alterado de propósito:** as 4 telas do dono (Mídia indoor, HOTEL MAXSUEL, ACADEMIA TELA 1) estão sem `empresa_operadora_id`. O Player usa esse campo no bloqueio por fatura atrasada, então preencher o dado pode mudar a reprodução de clientes pagantes. Fica para decidir com teste em aparelho.
- **Limite por perfil no envio do painel** (migração 20261284 + `limiteDoPerfil` no MediaUploadDialog): ANUNCIANTE/CLIENTE 20 s, GESTOR 30 s, OWNER/ADMIN livre. O portal já limitava 20 s.
- **Prova:**
  - simulação desfeita: anunciante 25 s barrado e 15 s aceito; gestor 45 s barrado e 25 s aceito; dono e admin 90 s aceitos;
  - simulação da conta do dono: o cartão passa de 4 para 7 telas;
  - navegador (dbg.adm): cartão com 3 telas LED e total 3;
  - testes `limiteDuracaoPerfil` (2), `uploadDialogDuration` e `pastasPontosParceiros`.

### F-115 — ADMIN vê e edita as telas e a programação da empresa (autorizado pelo proprietário) — DONE
- **Autorização explícita (29/09/2026):** "Autorizo o ADMIN a ver e editar as playlists e mídias da empresa". Neste assunto o ADMIN tem as mesmas permissões do OWNER.
- **Causa 1:** telas antigas sem `empresa_operadora_id` (4 do dono e 3 de teste de outra empresa), que só o próprio dono enxergava.
- **Causa 2:** playlists, itens, mídias, widgets e links só "do próprio usuário".
- **Migração 20261285 (aditiva):**
  - preenche a empresa das 7 telas pela empresa do dono, com o gatilho de sinal desligado durante o UPDATE para não marcar "online"; último sinal preservado;
  - `trg_screens_empresa_padrao`: tela nova nasce com a empresa do dono;
  - `fn_admin_da_empresa_do_usuario` e políticas `empresa_admin_*`: playlists (ver/editar), playlist_items (tudo), media/widgets/external_links (ver), só para OWNER/ADMIN da mesma empresa.
- **Risco criado e fechado na mesma entrega** (migração 20261286): `scr_update_own`/`scr_delete_own` liberam qualquer usuário da empresa. Com a empresa preenchida, anunciante, representante e gestor poderiam alterar ou apagar as telas do dono; as telas LED sem dono já estavam expostas. A política RESTRICTIVE `scr_update_so_gestao`/`scr_delete_so_gestao` limita ANUNCIANTE, CLIENTE, PARCEIRO, REPRESENTANTE e GESTOR às telas deles mesmos.
- **Painel da tela:** listas de playlists, mídias, widgets e links = conteúdo de quem está logado + do dono da tela.
- **Player:** `get_player_playlist_for_screen` só usa a empresa da tela na trava de expansão (telas com ponto; as 7 não têm) e na checagem de dono (mesma empresa). `comparar-telas` = idêntico.
- **Prova** (`docs/engineering/evidence/F-115/isolamento.md`):
  - matriz dono / ADMIN / gestor / representante / anunciante / ADMIN de outra empresa;
  - ADMIN salva a programação do HOTEL MAXSUEL via `fn_save_playlist_items`; gestor e anunciante barrados;
  - gestor ainda edita a própria tela;
  - navegador (dbg.adm): cartão com 7 telas; HOTEL MAXSUEL com os 8 itens e a lista de mídias do dono;
  - testes do painel (21) e da página Telas (18).

### F-116 — Sistema responsivo no celular (sem palavras partidas, sem arrastar para o lado); pontos parceiros escondidos do gestor — DONE
- **Pontos parceiros:**
  - "Cadastrar ponto parceiro" e "Telas de pontos parceiros" aparecem no menu só para OWNER/ADMIN;
  - o item "Telas de pontos parceiros" abre `/dashboard/screens?secao=parceiros` (página nova com os cartões); a página antiga, com preço e fila de análise, segue pelo botão "Telas de parceiros";
  - para o gestor, a página Telas vai direto às telas dele, sem cartões nem busca das telas parceiras;
  - a rota `/dashboard/prospeccao/ponto-parceiro` passou a exigir OWNER/ADMIN.
- **Causa raiz das palavras "em pé"** ("ACADE MIA", "OFF LIN E", "A C T I V E"): regras globais em `src/index.css`.
  - `.flex > *, .grid > * { overflow-wrap: anywhere; word-break: break-word; min-width: 0 }` e `td, th { overflow-wrap: anywhere }` deixavam o navegador partir qualquer palavra em qualquer letra e encolher itens até ~8 px.
  - Corrigido: `overflow-wrap: break-word; word-break: normal` (só quebra a palavra que não cabe sozinha na linha).
  - Itens de linhas `flex-wrap`, `whitespace-nowrap` e `shrink-0` não encolhem abaixo do texto.
  - Etiqueta padrão (Badge) com `whitespace-nowrap`.
  - No celular, linhas "título ··· botões" (`flex justify-between`) quebram linha em vez de espremer o título.
- **Tabelas no celular:** o componente `ui/table` agora empilha cada linha em bloco, com o nome da coluna (`data-label` copiado do cabeçalho). Vale para todas as tabelas do sistema; no computador nada muda (`empilharNoCelular={false}` desliga). A tabela manual do Centro de Controle de Pontos usa a mesma regra.
- **Telas refeitas para celular:**
  - cabeçalho do painel da tela (nome em linha própria);
  - Clientes em cartões (tudo à vista, situação em português, 4 botões em grade);
  - Central de Cobranças em cartões (cliente, código, valor, situação, vencimento, forma e todas as ações);
  - situação das propostas em português.
- **Prova:**
  - checagem automática (palavras partidas, conteúdo vazando, tabela mais larga que a tela) em ~110 páginas a 390 px: painel do gestor/dono, Workspace, financeiro, Representante (ADMIN de teste) e Portal do Anunciante (anunciante de teste) → sem problemas (restaram só códigos/e-mails longos quebrando no hífen, aceitável);
  - a 1366 px, tabelas normais e cartões escondidos.
- **Testes:** `menuPontosParceirosGestor` (3); suíte unitária completa: 1.272 passavam e 7 falhavam. As 7 foram corrigidas:
  - 4 do assistente, montados sem o provedor de dados após a F-113 (o site tem);
  - 1 da F-109, que verificava o endereço antigo do menu;
  - 2 da Central, com simulação sem "usuário logado" após a F-106.

### F-117 — Celular: abas sobrepostas, cartões esticados/cortados e faixas de ícone (Central e outras partes) — DONE
- **Relato do proprietário (print da Central):** "Caixa de Entrada" e "Solicitações" uma em cima da outra; a mensagem com o sininho amarelo esticada e desorganizada; "está assim em várias partes".
- **Causas:**
  1. A área de rolagem (Radix ScrollArea) envolve o conteúdo em `display: table; min-width: 100%`, que cresce até caber a palavra mais longa (nome de arquivo). Os cartões ficavam com 812 px numa tela de 326 e eram cortados. Usada em várias telas.
  2. As abas em grade tinham `whitespace-nowrap` e o texto invadia a aba vizinha.
  3. Nos blocos "ícone + conteúdo" `flex-col sm:flex-row` (96 no sistema), o ícone esticava em faixa no celular.
  4. Linhas com etiquetas/botões que não quebram passavam da borda.
- **Correções:**
  - CSS global: a ScrollArea vertical usa bloco na largura da tela (a horizontal proposital não muda);
  - abas em grade quebram o texto dentro da aba; abas em linha quebram em mais de uma linha no celular;
  - o ícone não estica (`align-self: flex-start`) nos blocos `flex-col sm:flex-row`;
  - linhas `flex` com etiqueta/botão `whitespace-nowrap` quebram quando não cabem;
  - Central: abas 2 por linha no celular e ícone ao lado da mensagem;
  - pontuais: botões de "Telas de parceiros", card "Saúde da Rede", cabeçalho do NOC, botão de atualizar em Contratos e códigos de fatura sem quebra.
- **Checagem automática reforçada** (conteúdo cortado por caixa com overflow escondido, texto maior que a própria caixa, ícone esticado, além de palavras partidas e rolagem lateral), rodada a 390 px em painel, Workspace, financeiro, Representante (ADMIN de teste) e Portal (anunciante de teste): sem pendências. Único item restante: o quadro de "carregando" de Analytics, que não é defeito.
- **Testes:** suíte unitária 1.280/1.280.

### F-118 — Celular: campos de data/mês invadindo o vizinho, formulários de 3 colunas e botões colados nas janelas — DONE
- **Relato do proprietário (Nova cobrança):** "Periodicidade" em cima de "Competência", "Vencimento" passando da borda, "Criar cobrança" colado em "Cancelar"; "acontece em várias partes".
- **Causas e correções (globais):**
  - Campos `date`/`month`/`time`: no Safari do iPhone têm largura mínima própria e ignoram a coluna. Agora `appearance: none; min-width: 0; max-width: 100%; display: block; min-height: 2.5rem`.
  - Grades fixas `grid-cols-3`/`grid-cols-4` com campos: no celular viram 1 e 2 colunas (quem ocupava várias colunas passa a ocupar a linha toda).
  - Rodapés de `Dialog`, `AlertDialog` e `Sheet`: no celular os botões empilhados ficam com 12 px de espaço (antes colados); no computador o mesmo espaço de antes.
  - A regra de linhas com etiquetas/botões (F-117) reduzia o espaço de blocos com `gap-*` e de colunas `flex-col-reverse`; agora não se aplica a eles.
- **Nova cobrança:** Competência/Periodicidade/Método 1 por linha no celular; "○" repetido removido das opções de pagamento.
- **Acentos corrompidos** ("Novo Cliente â€” Cadastro Completo", "ENDEREÃ‡O", "â€œEsqueci minha senhaâ€", "vazia â€” envie"): 24 trechos em IntelligentCommercialWizard, PlaylistsClientePage e corporateUsers.service convertidos de volta ao texto original.
- **Prova:** varredura automática que abre as janelas "Nova/Novo/Adicionar/Criar/Cadastrar" de ~25 páginas (painel, Workspace, financeiro, Representante) a 390 px e mede campos/botões sobrepostos, passando da borda ou colados → sem pendências. Nova cobrança: botões com 12 px. Suíte unitária 1.280/1.280.
- **Limite:** o navegador de teste é Chromium; o comportamento do campo de data no iPhone foi corrigido pela regra conhecida do Safari, mas só pode ser confirmado no aparelho.

### F-119 — Sala de pontos parceiros: cartões, cadastro único (7 etapas), edição completa, telas novas e tela grátis — DONE
- **Pedido do proprietário:** a tela de Pontos Parceiros como sala de criação e edição igual aos cartões do portal; "Novo Ponto Parceiro" = o MESMO cadastro completo do representante; edição de tudo (capa, fotos dos locais, especificações, endereço, estrutura e público); adicionar telas a um ponto existente; editar cada tela (foto do local, local, valor); valor R$ 0,00 = tela grátis; tela nova vai para a pasta do ponto nas Telas do OWNER/ADMIN.
- **Sala** (`corporate/PontosParceirosPage`, `/workspace/pontos-parceiros` e `/dashboard/pontos-parceiros`): cartões clicáveis (foto, categoria, nome, local, telas, "a partir de"/"Grátis"). A janela simples de criar/editar saiu; "Novo Ponto Parceiro" abre `/…/prospeccao/ponto-parceiro` (cadastro de 7 etapas), que volta para a sala.
- **Edição** (`PontoParceiroEdicaoPage`, `/…/pontos-parceiros/:id`, OWNER/ADMIN):
  - trocar a capa; fotos dos locais (adicionar, remover, legenda);
  - ativo/disponibilidade; Identificação, Responsável, Endereço (com mapa), Estrutura & Público, Comercial;
  - telas do ponto com "Adicionar tela" e edição de cada tela (`TelaParceiraDialog`: foto, local, posição, polegadas, valor, botão "Grátis", link para a grade da tela).
- **Migração 20261287:**
  - `pontos.dados_cadastro` (formulário completo) + `fn_gravar_dados_cadastro_ponto` (o cadastro grava ao terminar);
  - `fn_atualizar_ponto_parceiro` (OWNER/ADMIN; leva nome/endereço às telas);
  - `fn_salvar_tela_parceira` (OWNER/ADMIN; cria UMA tela nova — Tela N+1 — ou edita; foto nova entra na galeria);
  - `fn_recalcular_ponto`;
  - `fn_atualizar_valor_tela` aceita 0;
  - `anunciar_no_ponto`: só telas R$ 0 → origem GRATUITO (sem cobrança; ATIVO se a mídia está aprovada, senão no ar ao aprovar); reativar/mídia aprovada tratam GRATUITO.
- **Pontos antigos:** a edição preenche a partir de descrição/regras ("Razao social:", "Responsavel:", "Contato:"…).
- **Portal:** "Grátis"/"Tem tela grátis"; total "Grátis" e botão "Colocar no ar".
- **Menu do painel (OWNER/ADMIN):** "Cadastrar ponto parceiro" virou "Pontos parceiros" (a sala); a pasta do ponto em Telas tem "Editar ponto e telas".
- **Prova:**
  - simulação desfeita: tela nova grátis "Tela 3 · Vitrine da entrada"; ficha 3 telas / a partir de 0; edição de tela e de ponto; representante barrado; anúncio só na grátis = GRATUITO ATIVO sem cobrança; grátis + paga = cobrança 149,90;
  - `comparar-telas` idêntico;
  - navegador (ADMIN de teste, 390 px): 5 cartões com foto; edição da Farmácia carregou tudo; salvar sem mudança = mesma assinatura MD5 dos dados + formulário guardado; janelas de tela ok; "Novo Ponto Parceiro" abriu o cadastro de 7 etapas com "Voltar aos pontos";
  - checagem de celular nas páginas novas sem pendências;
  - testes `salaPontosParceiros` (5).

### F-120 — Editor de modelos de contrato no celular — DONE
- **Causa:** painel lateral fixo de 320 px ("Campos Disponíveis") ao lado do documento; no celular o documento ficava com poucos pixels e o texto virava uma coluna de letras. Barra de formatação e cabeçalho (Cancelar/Salvar, código) sem quebra.
- **Correção** (`ReadableContractEditor` + `ContratosAdminPage`):
  - no celular o documento ocupa a tela toda;
  - "Campos" abre a lista por cima (tocar insere onde estava o cursor, que fica guardado pelo `selectionchange`, e fecha);
  - "Formatar" abre Negrito/Itálico/Sublinhado;
  - abas "Editor"/"Prévia"; cabeçalho quebra em linhas.
  - No computador (≥768 px) igual a antes (painel fixo à direita).
- **Prova:** navegador 390 px: documento 358 px, painel escondido até "Campos", inserção de "Nome Fantasia" (27→28 campos) e fechamento; 1366 px: painel estático 320 px, documento 896 px, botões de formatação visíveis.
- **Testes:** suíte unitária 1.285 (1 teste da F-109 atualizado para o novo item de menu).

### F-121 — Tablet (Multilaser M10) igual ao celular — DONE
- **Causa:** as regras de responsividade (F-116 a F-118) só valiam até 767 px. O M10 tem 800 px em pé e 1280 px deitado: entre 768 e 1280 px o sistema usava a estrutura de computador num espaço que não comporta (tabelas espremidas, botões em 3 linhas, palavras partidas, cartões com valor de 6 casas decimais estourando).
- **Correção:**
  - `index.css`: empilhamento de tabelas, campos de data e formulários passam a valer até 1023 px; quebras de linha de "título ··· botões", abas e grupos de botões valem até 1280 px; tabela que não cabe na área dela (classe `sem-espaco`, posta pelo `ui/table` via `ResizeObserver`) empilha até 1280 px. Acima de 1280 px nada muda.
  - `ui/table`: mede a tabela; a medição é protegida (se o navegador não deixar observar, a página segue normal).
  - Cobranças e Clientes: cartões até 1023 px, tabela a partir de 1024 px; na tabela de cobranças os botões ficam numa linha (não cabendo, a tabela empilha).
  - Valores em reais com no máximo 2 casas (27 arquivos); cartões de indicadores mais compactos abaixo de 1280 px; grades de 4 colunas viram 2 no tablet.
  - Seletor `.flex-col.sm\:flex-row` da F-117 estava sem escape e nunca funcionou — corrigido.
- **Prova:** varredura automática (palavra partida, texto cortado, texto invadindo o vizinho, tabela larga, rolagem lateral) em 800×1280, 1280×800, 600×960 e 960×600: painel (≈45 rotas, sessão ADMIN de teste) e portal do anunciante (≈28 rotas) sem achados reais (2 avisos eram etiquetas desenhadas por cima da foto, de propósito). Computador 1440/1920 px: tabela de cobranças continua tabela, uma linha por cobrança.
- **Testes:** `tabletResponsivo.test.tsx` (6) + suíte unitária completa.
- **Limite honesto:** conferido por emulação de tamanho no navegador; o toque e o navegador do próprio M10 só se confirmam no aparelho.

### F-122 — Recebimento pronto para venda: boleto com cadastro real e conciliação em rodízio — DONE
- **Achados (validação global do recebimento):**
  1. **Boleto com pagador fixo de teste.** Os dois caminhos de emissão (`issue` no painel e emissão automática na página pública) registravam o boleto no Banco Inter com nome/CPF/endereço fixos de teste, e valor de R$ 10,00 se a cobrança viesse sem valor. O PIX não tinha o problema.
  2. **Conciliação com teto fixo.** A rodada de 15 em 15 min pegava "até 150" cobranças em aberto sem ordem: passando de 150 boletos (ou PIX) em aberto, as mesmas eram consultadas sempre e as demais nunca. Códigos que o banco não reconhece (404) eram reconsultados em toda rodada, para sempre (20 de 34 consultas eram isso).
  3. **Aviso de "pago" gravado sem confirmação.** O aviso (webhook) de boleto gravava `inter_status = PAGO` antes de o Inter confirmar — o dinheiro nunca era baixado sem confirmação (correto), mas a etiqueta ficava "paga" numa cobrança em atraso (9 casos, todos de avisos de teste).
  4. Página pública oferecia "Baixar Boleto em PDF" mesmo sem boleto emitido.
- **Correção:**
  - `_shared/pagadorBoleto.ts` (puro): monta o pagador com o cadastro real (`empresas`), valida CPF/CNPJ (dígitos verificadores), CEP, rua, cidade, UF e respeita os limites do banco. Faltando dado, não emite e devolve a lista do que completar (`CADASTRO_INCOMPLETO`, HTTP 422) — conferido **antes** de travar a cobrança. Cobrança sem valor não emite (`VALOR_INVALIDO`).
  - Migração `20261288`: tabela `inter_conciliacao_fila` (só servidor), `fn_inter_proximos_conciliar` (rodízio: nunca consultado → consultado há mais tempo; aviso de pagamento na frente no máximo 1 vez/hora; inválido volta 1 vez/dia) e `fn_inter_marcar_conciliado`. Motores de boleto e PIX usam a fila, com limite de 95 s por rodada.
  - Webhook de boleto: situação de pago só é gravada depois que o Inter confirma.
  - Página pública: `disponivel` verdadeiro só com boleto existente; sem boleto mostra "Boleto indisponível no momento" e orienta PIX/atendimento.
- **Mantido de propósito:** emissão que cai no meio (tempo esgotado) continua em `PROCESSING` sem reemissão automática — reemitir às cegas pode criar boleto duplicado no banco e pagamento órfão (§6 do motor).
- **Prova (produção):** fila devolve os mesmos 34 boletos e 18 PIX do motor antigo; após a 1ª rodada os 20 códigos inválidos saíram do ciclo (rodada seguinte: 14 consultados, 0 erro); usuário comum não acessa fila nem funções; emissão com cadastro sem CEP/UF → 422 "Complete: CEP, estado (UF)", cobrança sem trava e sem código; consulta pública → `disponivel:false, motivo:CADASTRO_INCOMPLETO`; resposta do Player idêntica (5 telas).
- **Testes:** `pagadorBoleto.test.ts` (11).
- **Limite honesto:** nenhum boleto real foi emitido no teste (geraria cobrança de verdade no banco). A emissão com cadastro completo usa o mesmo envio que já funcionava, trocando só o bloco do pagador; a primeira emissão real deve ser conferida pelo proprietário. Dos 193 clientes, 113 têm CEP e 92 têm endereço completo — os demais precisam completar o cadastro para ter boleto (PIX funciona para todos).
