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
