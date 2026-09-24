# SOBRE MÍDIA — ENGINEERING BASELINE (Micro-Gate 0)

> Documento canônico produzido pela auditoria read-only de 2026-09-23.
> Evidência classificada como STATIC_CODE, salvo quando indicado. Nenhum teste, build ou consulta ao banco de produção foi executado neste gate.
> Arquivos irmãos: [FUNCTIONAL_MAP.md](FUNCTIONAL_MAP.md) (matrizes) · [FINDINGS_LEDGER.md](FINDINGS_LEDGER.md) (achados).
> Este diretório **não substitui** os 58 documentos temáticos de `docs/`. Ele os indexa e registra a realidade verificada contra o código.

---

## 1. Identity

| Campo | Valor | Evidência |
|---|---|---|
| project_name | SOBRE MÍDIA (digital signage / retail media + ERP comercial) | `AGENTS.md`, `.agents/project_profile.md`, `vite.config.ts` (manifest "SOBRE MÍDIA Designer") |
| repository_root | `C:/Users/Jairan Santos/Downloads/SITECODIGOSOBREMIDIA/sobremidiadesigner-main` | `pwd` |
| remote | `https://github.com/daiamestre/sitesobremidia.git` | `git remote -v` |
| git_branch / HEAD | `main` / `225316af71e7fb455104f2ec80189220c4e12070` (2026-09-19) | `git rev-parse HEAD` |
| package_name | `vite_react_shadcn_ts` (herança do template Lovable, que o README ainda descreve) | `package.json` |
| frontend | React 18.3.1, TS 5.8.3, Vite 5.4.19 (SWC), Tailwind 3.4.17, Radix/shadcn, TanStack Query 5, react-router 6, PWA (`vite-plugin-pwa`, `src/sw.js`) | `package.json` |
| backend | Supabase (Postgres + RLS + RPC plpgsql), 27 Edge Functions em Deno | `supabase/` |
| supabase project | `bhwsybgsyvvhqtkdqozb` | `supabase/config.toml`, `supabase/.temp/project-ref`, `deploy-functions.yml` |
| storage | Supabase Storage (buckets `contratos`, `screenshots`, …) + Cloudflare R2 (mídia), com URLs de upload/download emitidas por edge function | `supabase/functions/get-upload-url`, `src/lib/r2Client.ts` |
| mobile | Player nativo Kotlin (`native-android-player/`, applicationId `com.antigravity.player`, minSdk 23, targetSdk 34, v5.2.3 / code 523) + shell Capacitor 8 (`com.sobremidia.player`, aponta para a URL Vercel) | `app/build.gradle.kts`, `capacitor.config.json` |
| deployment | Vercel (projeto `sitesobremidia`, Node 24.x); edge functions via Supabase CLI | `.vercel/project.json`, `.github/workflows/` |
| agent system | `.agents/` (framework JS determinístico "Antigravity"), `AGENTS.md`, `.opencode/skills/` | §9 |
| tests | Vitest 4.1 (128 arquivos), Playwright 1.62 (19 specs), JUnit no Android (10 arquivos) | §10 |

**Veredito de identidade: CONFIRMED.** Cinco coisas batem com o contexto informado pelo proprietário: o remote, o nome de produto em código, o projeto Supabase, o player Android e a governança.
**Conflito registrado:** `README.md` e `package.json#name` ainda são do template Lovable e não descrevem o projeto.

## 2. Git baseline

- HEAD: `225316a`. Ao todo são 523 commits no histórico; o último é `feat(player): operational recovery v5.2.3 …`.
- Worktree antes da auditoria: **29 modificados** (28 do player Android e `supabase/.temp/cli-latest`), **433 não rastreados**, 0 staged, 0 deletados.
- Stash: `stash@{0}: parallel-mission-wip-Central-backup`.
- Branches locais: `main`, `feat/central-corporativa-acessos`, `test-rebase-branch`, `test/antigravity-account-connectivity`, `test/antigravity-account-connectivity-clean`.
- A auditoria **não** alterou nenhum arquivo preexistente. Só criou os 3 arquivos deste diretório.

## 3. System map (realidade verificada)

```text
SOBRE MÍDIA
├── Web Platform (src/, Vercel SPA + PWA)
│   ├── Auth / Identity ........ AuthContext.tsx, core/identity/*, core/guards/*, RouteGuards.tsx
│   ├── /workspace ............. OWNER/ADMIN/FINANCEIRO/SUPERVISOR (modules/corporate)
│   ├── /representantes/* ...... CRM completo: prospecção, clientes, propostas, contratos, PI,
│   │                            produção, agendamento, financeiro, BI, "IA" (modules/crm)
│   ├── /portal/* .............. Anunciante (+ features de host: pontos, minha-rede, receita)
│   ├── /dashboard/* ........... Gestor: mídias, playlists, telas, widgets, agenda
│   ├── /financeiro/* .......... cobranças (CrmLayout)
│   ├── /cobranca/:codigo ...... página pública de cobrança (+ api/cobranca-og.js p/ crawlers)
│   └── /player/* .............. Web player (PlayerEngine.tsx), usado também via Capacitor
├── Backend (Supabase bhwsybgsyvvhqtkdqozb)
│   ├── PostgreSQL ............. 202 migrations ativas + migrations_archive/
│   ├── RLS .................... 293 ENABLE RLS, 635 CREATE POLICY, 353 DROP POLICY (texto das migrations)
│   ├── RPC .................... 216 ocorrências de SECURITY DEFINER
│   ├── Edge Functions (27) .... billing Inter (boleto v3 + PIX v2), webhook genérico, contratos/assinatura,
│   │                            PDFs, e-mail, R2 upload/download/delete/list, provisionamento de usuários
│   └── Storage ................ Supabase Storage + Cloudflare R2
├── Distribution
│   ├── Player Android nativo .. canal principal verificado
│   ├── Web player / Capacitor . verificado (rota /player)
│   ├── WhatsApp ............... só campos de contato e links wa.me (NÃO há canal de distribuição)
│   └── Social / WebApp ofertas  encartes públicos (vw_encartes_publicos); sem publicação social automatizada
├── Android Player (5 módulos Gradle): app · core-player · media-engine · sync-network · cache-manager
├── Infrastructure: Vercel · Supabase · R2 · GitHub Actions (ci, deploy-functions, compress-video, keep-alive)
└── Engineering System: AGENTS.md · .agents/ (core/*.mjs, skills, rules, memory, evidence) · .opencode/skills
```

**Pipeline Retail Media declarado vs. real.** O fluxo `ERP → Product Master → Price Sync → Offer Engine → Campaign → Creative → Distribution` **não existe como pipeline**. O que existe são tabelas CRUD independentes (`produtos`, `produto_precos`, `ofertas`, `encartes`, `campanhas`) consumidas pelo portal do anunciante. Não há nenhuma integração com ERP externo (a busca por ERP/price sync/product master não encontrou nada em `src/` nem nas edge functions). Estado: **PLANNED_ONLY / PARTIAL** (ver F-12).

## 4. Architecture — como as camadas se falam

1. **Web → Supabase.** Acesso direto por `supabase.from()` e `.rpc()` a partir de services em `src/services/` e `src/modules/crm/services/`, e também de componentes e páginas. A autorização efetiva depende do RLS e de RPCs `SECURITY DEFINER`.
2. **Web → Edge Functions.** `supabase.functions.invoke` chama 17 funções. Estas **não são chamadas pelo front**: `contract-signature-flow`, `generate-contract-pdf`, `billing-worker`, `check-offline-screens`, `communication-core`, `fetch-rss`, `maintenance`, `payment-webhook`, `public-billing-og`, `upload-audit-log`. Algumas são chamadas externamente (webhook, cron) e outras podem estar órfãs (ver F-07).
3. **Android → Supabase.** Tudo via `supabase-kt` (`sync-network/…/RemoteDataSource.kt`, `app/…/util/DeviceFleetManager.kt`):
   - RPCs: `get_player_playlist_for_screen`, `get_authorized_screens_for_player`, `fn_device_bind`, `fn_device_attest`, `player_unpair_screen`, `admin_unpair_screen`, `fn_player_report_telemetry`, `fn_device_register_extended`, `fn_device_heartbeat_v2`, `fn_device_telemetry_batch`.
   - Tabelas: `screens`, `devices`, `device_health`, `device_logs`, `download_status`, `remote_commands`, `playback_logs`, `app_releases`.
   - Storage: bucket `screenshots`.

## 5. Domain (entidades reconstruídas do código)

- **Cliente/Anunciante.** Vive em `clientes`, mais `contatos`, `unidades` e `cliente_pontos`. O cadastro atômico é feito por `fn_cadastrar_cliente_atomo` e `fn_cadastrar_cliente_com_contrato` (7 e 6 redefinições nas migrations). O login no portal é por `usuarios` e `perfis`: `portalAccess.ts` libera `/portal` para `ANUNCIANTE` e `CLIENTE` (legado).
- **Ponto Parceiro.** Está em `pontos`, com `modelo_comercial` (PERMUTA / COMISSIONADO_5) e `percentual_comissao`. O cadastro é feito por `fn_cadastrar_ponto_parceiro_com_contrato`, e os repasses ficam em `repasses_parceiros`, apurados na confirmação financeira (`20261217_gate5323…`).
  **Regra de isolamento: CONFIRMADA** (esta linha corrige o Micro-Gate 0 v1, que a tinha classificado como CONTRADICTED). `PontoParceiroWizardPage.tsx:335` diz explicitamente "Ponto Parceiro não possui login, portal ou cobrança (Regra de Isolamento)". O repasse é um **pagamento ao** parceiro, derivado das `contas_receber` do anunciante, e não uma cobrança dele. Continua aberto (Q-03) quem de fato usa `/portal/receita` (`ReceitaHostPage`) e `listar_repasses_parceiro`, já que `/portal` só aceita os perfis ANUNCIANTE/CLIENTE.
- **Tela/Dispositivo.** `screens` é a tela lógica; `devices` guarda o hardware com binding exclusivo. Coexistem com `telas`, `players`, `operacao_players` e `equipamentos` (ver F-10).
- **Contrato.** Ver §7.
- **Financeiro.** Ver §8.
- **Mídia/Playlist.** `media` e `playlists`/`playlist_items` (lado do gestor) convivem com `playlists_cliente`/`cliente_playlist_itens` (lado do anunciante). A publicação no ponto é feita por `publicar_playlist_no_ponto` e `publicar_playlist_cliente`. As tabelas `medias`, `midias` e `biblioteca_midias` coexistem (ver F-10).
- **Gestor de Mídias.** Tem a rota `/dashboard`, `modules/gestor/` (`criar_tela_gestor`, `telaPago.service.ts`) e o NOC (`noc.service.ts`, `noc_alerts`).

## 6. Data

- **Fonte do schema.** Há duas: `supabase/migrations/` (202 arquivos) e `src/integrations/supabase/types.ts` (gerado, com 180 tabelas). **`types.ts` está desatualizado**: o último commit é de 2026-08-29, e 34 tabelas criadas em migrations não aparecem nele (ex.: `repasses_parceiros`, `inter_webhook_events`, `inter_pix_webhook_events`, `boletos`, `parcelas`, `webhook_pagamentos`). Ver F-09.
- **`remote_schema.sql` tem 0 bytes.** Não há dump do banco real no repositório, então o estado vivo do RLS é **UNKNOWN**.
- **Nomes das migrations.** Os prefixos não são datas reais: `20261230_*` está "no futuro" em relação a hoje (2026-09-23) e `20261039_*` não é uma data válida. Três esquemas de numeração convivem (`001_`, `0195_`, `2026MMDD[HHMMSS]_`). A ordem lexical é a única ordem que vale.
- **RLS.** Nas migrations ativas, 11 tabelas são criadas sem `ENABLE ROW LEVEL SECURITY` explícito: `assinaturas_digitais`, `feature_flags`, `feature_flags_empresa`, `historico_financeiro`, `pedidos_insercao_versoes`, `perfis`, `planos`, `roles_permissoes`, `sequencias_numeracao`, `storage_migration_map`, `visita_checkins`. Pode haver habilitação por bloco `DO`/loop ou direto no banco: **PARTIALLY_CONFIRMED** (F-08).

## 7. Contratos

Fluxo real:

```text
contrato_templates (14 migrations; fn_obter_template_padrao, fn_criar_modelo_contrato_template; TPL-ANUNCIANTE-OFICIAL)
→ contratos (status_documento, status_workflow, pdf_object_key)
→ PDF gerado (contratoDocumento.service.ts, 3222 linhas, client-side) → uploadToR2
   key: tenants/{empresa_operadora_id}/contratos/{id}/v{versao}/contrato_{numero}.pdf  (:2621)
   assinado: tenants/{…}/contratos/{id}/assinado_{numero}_v{versao}.pdf              (:3057)
→ download: autoridade = assinaturas.status='ASSINADO' AND assinaturas.pdf_assinado_key;
   fallback SOMENTE contratos.pdf_object_key; nunca contratos.pdf_assinado_key (:2275-2320)
→ assinatura:  (A) RPC fn_assinar_contrato + fn_registrar_visualizacao_assinatura  ← usado pelo front
               (B) edge function contract-signature-flow (create/view/sign/download, SHA-256 do PDF) ← sem consumidor no front
→ assinaturas / assinatura_eventos / assinatura_auditoria / contrato_auditoria
→ contrato_versoes (6 migrations, 1 consumidor em src)
```

- Há **dois caminhos de assinatura** (A e B), e o B tem problemas de autorização (F-02). O B lê e grava o PDF no **bucket Supabase `contratos`**, enquanto o caminho vigente usa **R2**. São storages divergentes, o que reforça que o B é legado.
- Tipos de assinatura `DRAWN` e `TYPED` existem (43 e 25 ocorrências). Um teste unitário (`microgate-p03-3…test.ts:147`) garante que o signatário é o CONTRATANTE, nunca "Sobre Midia ADM" (evidência de nível JVM/unit com mock).
- Periodicidades MENSAL, BIMESTRAL, TRIMESTRAL, SEMESTRAL e ANUAL estão presentes em `src/modules/crm`.
- `assinaturas_digitais` não tem nenhum consumidor em `src/` nem em `functions/` (candidata a LEGACY/ORPHANED).

## 8. Financeiro

```text
contratos → contas_receber (gerar_cobrancas_recorrentes, fn_criar_cobranca_jit_expansao)
→ gateway Banco Inter: boleto /cobranca/v3 (inter-billing-engine) | PIX /pix/v2/cob (inter-pix-engine)
→ confirmação:
   PIX: webhook inter-pix-engine → INSERT pagamentos (dedup por inter_pix_webhook_events)
   Boleto: webhook inter-billing-engine → só atualiza contas_receber.inter_status (NÃO insere pagamento)
   Genérico: payment-webhook (HMAC x-signature ou Bearer BILLING_WORKER_SECRET) → INSERT pagamentos
→ trigger trg_concilia_pagamento (20261230): soma pagamentos → status PAGA / PARCIAL_PAGA
→ trg_fn_regras_financeiras_operacionais: transição p/ PAGA libera operação
→ get_player_playlist_for_screen devolve SCREEN_SUSPENDED se houver cobrança de expansão pendente/vencida
   ou contrato SUSPENSO_FINANCEIRO
```

- **"PAGA só após confirmação real".** O status é derivado exclusivamente de `pagamentos`, o que é coerente. Mas o webhook PIX insere pagamento **sem autenticação no código** e usa `cobranca.valor` quando o payload não informa o valor. Esse é o achado **F-01 (CRITICAL)**.
- No boleto, o webhook grava `inter_status` e não há um caminho verificado de `inter_status=RECEBIDO` até `pagamentos`. **UNCONFIRMED** se a baixa de boleto acontece de forma automática (F-06).
- Existem vários stores de eventos: `inter_webhook_events`, `inter_pix_webhook_events`, `webhook_pagamentos`, `pix_cobrancas` e `boletos`, além de `cobrancas` convivendo com `contas_receber` (F-10).

## 9. Android Player

Fluxo verificado no código:

```text
BOOT_COMPLETED/QUICKBOOT/REBOOT → receiver/BootReceiver → ui/SplashActivity
 → sessão (TokenStorage/Android Keystore; SessionManager) → LoginActivity | ScreenSelectionActivity | MainActivity
 → MainActivity (HOME + LAUNCHER intent-filters; Lock Task se Device Owner via DeviceControl/AdminReceiver)
 → data/PlayerRepositoryImpl (app) → Room PlayerDatabase v11 (cache-manager) + RemoteDataSource (sync-network)
 → RPC get_player_playlist_for_screen → util/CacheManager (download .tmp → fsync → renameTo, fallback copyTo)
 → util/QueueManager (quarentena em memória) → media-engine/ExoPlayerRenderer (+ PlaybackWatchdog)
 → core-player: FSM + PlayerRuntimeState → SurfaceProjectionEngine → RuntimeSurfaceConsumer → SurfaceTarget
 → workers/serviços: HealthMonitor, MediaDownload, LogSync, AuditUpload, Maintenance, PersistentHeartbeatService,
   SelfHealingService, ThermalGuard, DeviceFleetManager (heartbeat v2 / telemetry batch), OTAUpdateManager
```

- **Paridade de status RPC ↔ Kotlin: CONFIRMED (estática).** A versão vigente da RPC (`20261216_gate5322…`, `(p_identifier text, p_device_id text)`, `SECURITY DEFINER`) devolve estes 10 status: `DEVICE_ACCESS_DENIED`, `SCREEN_NOT_FOUND`, `SCREEN_SUSPENDED`, `SCREEN_ACCESS_DENIED`, `DEVICE_REVOKED`, `DEVICE_ALREADY_BOUND`, `NO_PLAYLIST_ASSIGNED`, `PLAYLIST_NOT_FOUND`, `PLAYLIST_EMPTY` e `SUCCESS`. Todos são tratados em Kotlin, que ainda trata `DEVICE_BINDING_MISMATCH` como extra. As 15 redefinições nas migrations usam uma única assinatura `(text, text)`, então **não há overloads ativos** pelo texto das migrations. No banco vivo isso é UNKNOWN.
- **RPCs de frota ausentes das migrations ativas.** `fn_device_register_extended`, `fn_device_heartbeat_v2` e `fn_device_telemetry_batch` só existem em `supabase/migrations_archive/20260825_device_fleet.sql` e também não estão em `types.ts` (F-03).
- **Cache.** A escrita é `.tmp` → `fd.sync()` → `renameTo`, com fallback `copyTo(overwrite)` que **não é atômico** e sem fsync do diretório. A integridade da mídia é verificada **só por tamanho** (`MediaIntegrityChecker`); o SHA-256 só é usado no OTA e na identidade do device. Isso está no nível STATIC_CODE; os testes JVM existentes (`CacheAtomicityAndCleanupTest`) não provam o comportamento em filesystem Android real.
- **Adoção de playlist no Room NÃO é transacional (F-18, HIGH).** `PlayerDao.insertPlaylistWithItems` é um método default de interface Kotlin, anotado ao mesmo tempo com `@Transaction` e `@Insert`, cujo corpo faz `deleteAllPlaylists()` → `deleteAllMediaItems()` → `insertPlaylist` → `insertItems`. O código gerado pelo KSP (`cache-manager/build/generated/ksp/debug/java/.../PlayerDao_Impl.java:526-528`, gerado em 2026-09-23 13:46) só delega para `DefaultImpls`, **sem `withTransaction`**, e o arquivo não contém nenhum `withTransaction`. Com isso, um crash ou queda de energia entre o delete e o insert deixa o Room sem playlist. O teste JVM `BackgroundSyncAtomicAdoptionTest` usa um `MockRoomDatabase` que *simula* a transação e não exercita o DAO real.
- **Outros comportamentos verificados:**
  - `CleanupManager` só remove `.tmp` com mais de 300 000 ms (5 min).
  - `QueueManager` põe um item em quarentena após 3 falhas; a quarentena fica em memória e é limpa quando todos os itens estão em quarentena.
  - `verificarScreenNoBackend` (`MainActivity.kt:953`) devolve `true` diante de exceção de rede. É o fallback offline conservador que o handoff descreve.
- **Room.** Versão 11, com `addMigrations(7→11)` + `fallbackToDestructiveMigration()` + `exportSchema=false`. Um upgrade vindo de uma versão menor que 7, ou com gap de migração, **apaga o cache offline e a playlist local** (F-05).
- **dirty_shutdown.** A limitação histórica continua. A flag é marcada `true` em `PlayerRepositoryImpl.checkAndReportPowerLoss()` e **nunca é resetada** em lugar nenhum, embora o comentário diga "MainActivity will clean it on graceful onStop". O efeito é que todo boot depois do primeiro reporta `REBOOT_BY_POWER_LOSS`. Classificação: limitação semântica de telemetria + comentário enganoso. **Não corrigido**, conforme a instrução.
- **UI operacional.** A tela de playback segue um modelo de projeção (`SurfaceProjectionEngine` / `SurfaceTarget`); o texto de `MainActivity.kt:2326` diz "100% silencioso ao retornar ao Kiosk", e o teste JVM `PlayingSurfaceMediaOnlyTest` verifica que nenhum snackbar é emitido. A string "Tela reativada! Sincronizando" **não existe mais** no código-fonte. Os Toasts ficam só em Login e ScreenSelection, fora do playback. O `_syncProgress` ("Sincronizando: X de Y") existe no repositório, e sua projeção durante PLAYING é controlada pela camada de surface. Status: **IMPLEMENTED_NOT_FULLY_PROVEN** (sem evidência RUNTIME/HARDWARE neste gate).
- **Código duplicado no player.** Há dois `PlayerRepositoryImpl` (o de `sync-network` não tem nenhum consumidor, é **ORPHANED**), três camadas de cache (`util/CacheManager`, `cache/LocalCacheManager` usado só por widgets, e a interface `core CacheManager`), dois `MaintenanceWorker` (`cache-manager/worker` e `app/worker`) e quatro emissores de heartbeat (`HeartbeatWorker`, `HeartbeatManager` → `device_health`, `PersistentHeartbeatService`, `DeviceFleetManager`). Ver F-11.
- **Artefato de build.** `app/build/outputs/apk/debug/app-debug.apk` (523 / 5.2.3-MicroGate) foi gerado em 2026-09-23 09:39, **depois** do HEAD (2026-09-19) e com 28 arquivos do player modificados e não commitados. **Esse APK ≠ HEAD.**
- Os documentos de player que já existiam continuam válidos como histórico: `docs/ANDROID_PLAYER_PROFILE.md`, `docs/PLAYER_CONTRACT.md`, `docs/PLAYER_GOLDEN_BASELINE.md`, `docs/DEVICE_FLEET_CONTRACT.md`, `.agents/memory/player_architecture_baseline.md`, `native-android-player/PLAYER_PHYSICAL_QA_*.md`.

## 10. Security

- **Perfil.** A regra canônica `usuario?.perfil?.nome || (usuario?.is_owner ? 'OWNER' : null)` é respeitada em `AuthContext.tsx:156` e `:346`. **Violações:** `ContratosListPage.tsx:321` usa `usuario?.role?.name` como alternativa para ADMIN, e `core/identity/IdentityService.ts:83-85` usa `role?.name` (F-04).
- **Credenciais no browser.** `r2Client.ts` não usa mais credenciais R2 no bundle, e nenhum código em `src/` lê `VITE_R2_SECRET_KEY`. Mesmo assim, `.env.example` ainda documenta `VITE_R2_SECRET_KEY`/`VITE_R2_ACCESS_KEY` com prefixo `VITE_`, e `.env` local define um valor para ela. Hoje isso **não é inlined**, mas uma futura referência a essa variável exporia a chave (F-13).
- **Arquivos sensíveis.** `.env`, `*.jks`, `keystore.properties` e `supabase.properties` estão ignorados pelo git. **`CREDENCIAIS_FINAIS.md`, `CREDENCIAIS_RELATORIO.md` e `_restore_creds.ps1` não estão ignorados** (estão na lista de não rastreados), então correm risco de commit acidental. O conteúdo deles não foi lido nesta auditoria (F-14).
- **Device auth.** A identidade do device é `ANDROID_ID` + build fingerprint com SHA-256 (`DeviceControl.kt:222`); `fn_device_bind`/`fn_device_attest` fazem o binding exclusivo, e a RPC da playlist valida device × tela.
- **Edge functions com service role.** `contract-signature-flow`, `inter-pix-engine` e `inter-billing-engine` (webhook) usam `SUPABASE_SERVICE_ROLE_KEY` e ignoram o RLS. Por isso a autorização precisa ficar no código da função (F-01, F-02). `config.toml` declara apenas `inter-billing-engine` com `verify_jwt=false`, e os flags reais de deploy das demais funções são UNKNOWN.

## 11. Infrastructure

- **Vercel.** SPA com rewrite total, `/cobranca/*` com OG para crawlers (`api/cobranca-og.js`) e Node 24.x no projeto, enquanto o CI usa Node 22.
- **CI (`ci.yml`).** Roda lint → `tsc --noEmit` → `npm test` → coverage → build. **Não roda Gradle, testes Android nem Playwright.**
- **Deploy de funções.** `deploy-functions.yml` só faz deploy de `inter-billing-engine`. As outras 26 funções são implantadas manualmente, sem rastreabilidade no repositório.
- **R2 + compressão.** `compress-video.yml` (FFmpeg H.265) é disparado por `repository_dispatch`, e `keep-alive.yml` roda um ping diário no Supabase.
- **OTA.** A tabela `app_releases` guarda `version_code` monotônico e SHA-256 obrigatório (`OTAUpdateManager.kt`).

## 12. Tests — o que provam e o que não provam

| Suíte | Qtde | Executada neste gate? | Prova | Não prova |
|---|---|---|---|---|
| Vitest unit | 91 | não | lógica de services/validators com Supabase mockado (`src/tests/setup.ts`) | RLS, RPC real, schema real |
| Vitest "integration" | 8 | não | fluxos entre módulos **com mocks**: nenhum arquivo cria cliente Supabase real | integração real com o banco |
| Vitest security | 12 | não | regras de guard/rbac no front | isolamento via RLS no banco |
| Vitest crm / regression | 11 / 6 | não | contratos de UI/rotas protegidas (`PROTECTED_FEATURES.md`) | comportamento em runtime |
| Playwright e2e | 19 | não | fluxos navegador contra `localhost:8080` + Supabase real (credenciais `.env.e2e.local`) | fora do CI; depende de dados vivos |
| JUnit Android | 10 suítes / 97 testes | **sim, externamente**: XMLs em `*/build/test-results/testDebugUnitTest/`, 2026-09-23 16:08–16:09 UTC, host DESKTOP-2JC7PAT, 0 falhas, 0 erros; worktree com 28 arquivos do player não commitados | lógica na **JVM** com mocks (o Room é simulado em `BackgroundSyncAtomicAdoptionTest`) | DAO Room real, filesystem Android, Device Owner, hardware |
| Cobertura | — | — | limiar 10/10/5/10 só em `src/modules/crm/services/**` | o resto do código |

Não existe teste de banco (pgTAP ou similar) versionado. Os scripts `.mjs`/`.cjs` da raiz e de `scripts/` que tocam o banco real são ad hoc e não são testes reprodutíveis.

## 13. AI Engineering System (`.agents/`)

- **Estrutura.** `core/` tem 26 módulos `.mjs` (orchestrator 60 KB, skill_runtime 44 KB, contracts, router, registry, governance, completion/lifecycle, android_player_pipeline). Há ainda 9 skills, 5 rules, `memory/`, `evidence/` e `scripts/`.
- **O que ele é de fato.** É um framework JavaScript **determinístico**. Os "agentes" são handlers registrados que rodam dentro de `SingleExecutorAdapter`; **não há chamada a LLM** em `core/`. Quatro módulos executam processos (`child_process`), para rodar Gradle e o lifecycle de produção.
- **Integração.** Não aparece em `package.json` nem no CI. `.agents/hooks.json` usa o formato do Antigravity (`matcher: run_command`) e **não é um hook ativo do Claude Code**. O `pre_tool_guard.mjs` só atua na IDE Antigravity.
- **Memória.** `memory/executions/` tem **5654 JSONs**. `master_ledger.md` declara "zero pendências" (não é rastreado no git), enquanto `MASTER_ISSUE_LEDGER.md` na raiz tem inconsistências internas: o dashboard diz "P0: 1", mas a seção IN PROGRESS lista 2 itens P0, e o cabeçalho "IN PROGRESS" aparece duplicado (linhas 18 e 44). `architecture_decisions.jsonl` tem ADR-001/002, ambos de 2026-09-11.
- **Fontes de governança concorrentes.** `AGENTS.md` (declarado canônico), `.agents/rules/*`, `.agents/project_profile.md`, `.opencode/skills/sobremidia-governanca/SKILL.md` e `docs/PROTECTED_FEATURES.md`. O conteúdo delas é convergente, mas estão duplicadas.

## 14. Source of truth por domínio

| Domínio | SOURCE OF TRUTH (verificado) | Observação |
|---|---|---|
| Identidade/perfil | `usuarios` + `perfis` (via `AuthContext`) | `roles`/`user_roles`/`roles_permissoes`/`role_permissions`/`permissions`/`permissoes_usuarios` coexistem (F-10) |
| Cliente/Anunciante | `clientes` | — |
| Ponto parceiro | `pontos` (+ `repasses_parceiros`) | `locais`, `pi_locais`, `telas` sobrepõem |
| Tela física | `screens` + `devices` | `telas`, `players`, `operacao_players`, `equipamentos` sobrepõem |
| Contrato | `contratos` + objeto R2 (`tenants/…`); PDF assinado com autoridade em `assinaturas.pdf_assinado_key` | 2 fluxos de assinatura (o legado usa o bucket Supabase `contratos`) |
| Recebível | `contas_receber`; status derivado de `pagamentos` por trigger | `cobrancas`, `pix_cobrancas`, `boletos` sobrepõem |
| Mídia | `media` + R2 | `medias`, `midias`, `biblioteca_midias` sobrepõem |
| Playlist do player | `playlists`/`playlist_items` ∪ `playlists_cliente`/`cliente_playlist_itens` (unidas na RPC) | duas árvores de playlist |
| Produto/Preço | `produtos`/`produto_precos` (locais) | **sem ERP como System of Record** |
| Schema do banco | `supabase/migrations/` (ordem lexical) | `types.ts` desatualizado, `remote_schema.sql` vazio |
| Governança do agente | `AGENTS.md` | duplicado em 4 lugares |
