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
