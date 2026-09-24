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
