# HANDOFF RECONCILIATION — Antigravity → Claude (Micro-Gate 0 v2, 2026-09-23)

> Este documento funde dois insumos recebidos do proprietário: (1) o **HANDOFF OFICIAL** e (2) um **relatório "Micro-Gate 0 — Takeover" já redigido**, que chegou colado na conversa.
> Os dois foram tratados como *afirmações a verificar*, como manda o handoff §1 ("registre HANDOFF CLAIM / ACTUAL REALITY / EVIDENCE / DISCREPANCY / IMPACT").
> Modo: STRICT READ-ONLY. Nenhum código, banco, `.agents`, config ou commit foi alterado. As únicas escritas foram em `docs/engineering/`.
> Complementa: [ENGINEERING_BASELINE.md](ENGINEERING_BASELINE.md) · [FUNCTIONAL_MAP.md](FUNCTIONAL_MAP.md) · [FINDINGS_LEDGER.md](FINDINGS_LEDGER.md)

## 1. Registro de discrepâncias

Legenda de veredito: ✅ confirmado · ⚠️ parcial · ❌ contradito · ❓ não verificável no repositório.

| # | Fonte | Afirmação | Realidade verificada | Evidência | Veredito | Impacto |
|---|---|---|---|---|---|---|
| D-01 | Relatório | Supabase `project_id: jxglzblsflzdyvvdalha` | O projeto é **`bhwsybgsyvvhqtkdqozb`**; o id afirmado não aparece em nenhum arquivo | `supabase/config.toml:1`, `.temp/project-ref`, `deploy-functions.yml` | ❌ | Operações contra o projeto errado |
| D-02 | Relatório | Capacitor App ID `com.antigravity.player` | É `com.sobremidia.player`; `com.antigravity.player` é o **nativo** | `capacitor.config.json` | ❌ | Confusão entre os dois apps |
| D-03 | Relatório | TypeScript 5.8.2 | ^5.8.3 | `package.json` | ❌ (menor) | — |
| D-04 | Relatório | Edge functions `inter-criar-cobranca`, `inter-gerar-qrcode-pix`, `inter-webhook`, `inter-consultar-cobranca`, `r2-upload-url`, `r2-get-signed-url`, `process-video`, `gerar-contrato-pdf`, `assinar-contrato`, `render-contract-pdf` | **Nenhuma das 10 existe.** As reais são `inter-billing-engine`, `inter-pix-engine`, `payment-webhook`, `get-upload-url`, `get-download-url`, `process-media`, `generate-contract-pdf`, `contract-signature-flow` e outras 19 | `ls supabase/functions` | ❌ | Mapa de backend inválido |
| D-05 | Relatório | "RLS habilitado em 100% das tabelas de domínio" | 11 tabelas criadas sem `ENABLE RLS` nas migrations; o estado vivo é UNKNOWN (`remote_schema.sql` tem 0 bytes) | F-08 | ❌ / ❓ | Segurança |
| D-06 | Relatório | Filtro de tenant por `tenant_id` | A chave de tenant predominante é **`empresa_operadora_id`** (1531 ocorrências contra 135 de `tenant_id` nas migrations) | grep nas migrations | ⚠️ | — |
| D-07 | Relatório | Bucket R2 `sobremidia-tenants` | O nome vem de env (`R2_BUCKET_NAME` / `VITE_R2_BUCKET_NAME`); o literal não aparece em lugar nenhum | `src/lib/r2Client.ts` | ❓ | — |
| D-08 | Relatório + Handoff | Webhook financeiro "criptografado", "idempotente", "PAGA só após confirmação real" | A idempotência existe. **O webhook PIX não tem autenticação** e insere o pagamento sem confirmar no Inter; o webhook de boleto é *fail-open* quando `INTER_WEBHOOK_TOKEN` não está definido | F-01, F-06 | ❌ | **CRITICAL** |
| D-09 | Relatório + Handoff | Pipeline ERP Sync → Product Master → Price → Offer → Creative → Distribution | Não existe; o que há são tabelas CRUD locais. O handoff (§15) o trata como *visão*, o relatório como *implementado* | F-12 | ❌ (relatório) / ✅ (visão) | Expectativa errada |
| D-10 | Relatório | Fonte de verdade de Produtos/Preços = "ERP externo" | `produtos`/`produto_precos` são locais, sem integração | F-12 | ❌ | — |
| D-11 | Relatório | Fonte de verdade das telas = `public.telas / public.devices` | A RPC do player usa **`screens`** + `devices`; `telas` é uma tabela duplicada | RPC `get_player_playlist_for_screen` | ❌ | — |
| D-12 | Relatório + Handoff §21 | Cache: `.tmp → fsync → tamanho → **SHA-256** → rename` | `.tmp → fsync → checagem de 0 bytes → renameTo (fallback copyTo+delete)`. **Não há SHA-256 no cache de mídia**: o SHA-256 só existe no OTA e na identidade do device. O `cache-manager` usa **MD5** em `FileStorageManager`/`MaintenanceWorker` | `util/CacheManager.kt:53-95`, `HashUtils.kt` | ❌ | Mídia corrompida com tamanho > 0 é aceita |
| D-13 | Relatório + Handoff §23 | Adoção de playlist atômica via `@Transaction` (P0.4.8R-F02 "CLOSED") | O `PlayerDao_Impl` gerado **não abre transação** | F-18 | ❌ | Room vazio após crash no meio da troca |
| D-14 | Relatório | JVM: `:app:testReleaseUnitTest`, 10 PASS, com os nomes `BootRecoveryIntegrationTest`, `PlayerOfflineCacheTest` e outros 8 | **Nenhum dos 10 nomes existe.** Os XMLs reais (`testDebugUnitTest`, 16:08–16:09 UTC de hoje, host DESKTOP-2JC7PAT) mostram **10 suítes / 97 testes / 0 falhas** com outros nomes: `BackgroundSyncAtomicAdoptionTest`, `CacheAtomicityAndCleanupTest`, `CanonicalSurfaceConsumerUnificationTest`, `KioskIsolationTest`, `PlayingSurfaceMediaOnlyTest`, `PresentationResolverTest`, `ProjectionConsumerIntegrationTest`, `PlayerRuntimeStateTest`, `ReadOnlyAxisAdaptersTest` e `SurfaceProjectionEngineTest` | `*/build/test-results/testDebugUnitTest/*.xml` | ⚠️ (o PASS é real, a lista está errada) | A evidência JVM existe, mas não foi gerada por este agente |
| D-15 | Relatório | Vitest: "mais de 141 suítes em `src/tests/unit/`" | São 91 em `unit/` e 128 no total | `find src/tests` | ❌ | — |
| D-16 | Relatório | Status PROVADO para Auth, Portais, Contratos e Financeiro | Nenhuma execução runtime ou banco neste gate. Há violação de `role?.name` (F-04) e o financeiro tem um achado CRITICAL | F-01, F-04 | ❌ | Falso PASS (viola AGENTS.md §10 e handoff §5) |
| D-17 | Relatório | "Guardas React com RBAC estrito sem fallback indevido" | `ContratosListPage.tsx:321` e `IdentityService.ts:83-85` usam `role?.name` | F-04 | ❌ | — |
| D-18 | Relatório | `master_ledger.md`, `architecture_decisions.jsonl` e `player_architecture_baseline.md` na raiz de `.agents/` | Ficam em **`.agents/memory/`** | `ls` | ❌ (caminho) | — |
| D-19 | Relatório | `master_ledger.md` registra o histórico de gates e findings | Declara "zero pendências" e não tem nenhum ID de gate/finding. **Não está rastreado no git** | F-19 | ❌ | Memória não versionada |
| D-20 | Relatório + Handoff §49 | Findings P0.3-001, P0.4.6R-01/02, P0.4.8R-F01/F02 e C3.2-F01, com status CLOSED/LIMITATION | Nenhum desses IDs existe no repositório nem nos 5654 JSONs de execução | F-19 | ❓ | Status históricos inverificáveis |
| D-21 | Relatório | "Worktree 462 = 29 M + 433 ??" | ✅ Correto (463 depois deste gate por causa de `docs/engineering/`). Composição dos não rastreados: `android/` 246, `.agents/` 52, `docs/` 31, `native-android-player/` 27, `src/` 6, raiz etc. | `git status --porcelain` | ✅ | — |
| D-22 | Handoff §32 | APK `app/build/outputs/apk/release/app-release.apk`, 5 637 946 bytes, SHA-256 `42E63D27…31E3` | **Não existe no disco.** Existem `app/release/app-release.apk` (11 376 264 bytes, 2026-02-25, sha256 `6d0cef69…f114`, obsoleto) e `app-debug.apk` (15 331 495 bytes, 2026-09-23 09:39, sha256 `a0d4a7b5…e3db`, ≠ HEAD) | `sha256sum` | ❓ / ❌ | O APK de referência do C3.4 não está disponível |
| D-23 | Handoff §22 | Limpeza de `.tmp` com cerca de 5 min | `ACTIVE_DOWNLOAD_MAX_TIMEOUT_MS = 300_000L` | `CleanupManager.kt:14,57` | ✅ | — |
| D-24 | Handoff §25 | Quarentena após múltiplas falhas | Após **3** falhas; fica em memória e é limpa quando tudo está em quarentena | `QueueManager.kt:96-104` | ✅ | Não persiste entre reboots |
| D-25 | Handoff §20 | `loadLocalCache → verificarScreenNoBackend → fallback offline conservador` | Existe; em exceção de rede devolve `true` | `MainActivity.kt:899,953-984`; `PlayerRepositoryImpl.kt:637` | ✅ (STATIC) | — |
| D-26 | Handoff §28 | Paridade de status RPC ↔ Kotlin | 10/10 status tratados; sem overloads nas migrations | baseline §9 | ✅ (STATIC) | — |
| D-27 | Handoff §29 / Relatório | `dirty_shutdown` sem reset, limitação de telemetria | Confirmado, e o comentário no código diz o contrário ("MainActivity will clean it") | F-15 | ✅ | — |
| D-28 | Handoff §12 | `fn_criar_modelo_contrato_template`, `fn_obter_template_padrao`, `fn_assinar_contrato`, `TPL-ANUNCIANTE-OFICIAL`, DRAWN/TYPED, signatário = CONTRATANTE | Tudo presente | baseline §7 | ✅ (STATIC + unit/mock) | — |
| D-29 | Handoff §13 | R2 `tenants/{tenant}/contratos/{contrato}/v{versao}/contrato_{numero}.pdf`; prioridade `pdf_assinado_key` → `pdf_object_key` | Confirmado. A autoridade é `assinaturas.pdf_assinado_key` e **não** `contratos.pdf_assinado_key` | `contratoDocumento.service.ts:2275-2320, 2621, 3057` | ✅ | — |
| D-30 | Handoff §10 | Ponto Parceiro sem login, portal ou cobrança | Confirmado no wizard (`:335`). Recebe **repasse** (pagamento a ele) | baseline §5 | ✅ (corrige a v1 deste gate) | — |
| D-31 | Handoff §9 | Periodicidades MENSAL…ANUAL | Presentes | grep `src/modules/crm` | ✅ | — |
| D-32 | Relatório | Kiosk `singleInstance` | A MainActivity (manifest:79) é `singleInstance`; Login e Splash são `singleTop` | `AndroidManifest.xml` | ✅ | — |
| D-33 | Relatório | "Android 7.1 a 14" | minSdk 23 (Android 6.0), targetSdk 34 | `app/build.gradle.kts` | ⚠️ | — |

**Conclusão sobre o relatório colado:** ele **não pode ser ratificado como Micro-Gate 0**. Ele contém identificadores inexistentes (D-01, D-04, D-14) e declara PASS sem evidência (D-16), o que viola AGENTS.md §10 e o próprio handoff (§5, §43). As afirmações dele que batem com o código estão marcadas ✅ acima.

## 2. `.agents` — é utilizável pelo Claude?

| Componente | Independente do Antigravity? | Observação |
|---|---|---|
| `AGENTS.md`, `.agents/rules/*.md`, `skills/*/SKILL.md`, `references/*.md` | **Sim.** São instruções em texto | O Claude as lê e aplica como procedimento (é o que este gate fez) |
| `skills/database-supabase-guard/scripts/guard_db.mjs`, `forensic-auditor/scripts/audit_diff.mjs`, `project-discovery/scripts/scan_project.mjs` | Sim (Node puro) | Executáveis via Bash. **Não foram executados neste gate** porque o modo é read-only e scripts de `.agents` gravam logs |
| `scripts/pre_tool_guard.mjs` | Parcialmente | Lê JSON no stdin e responde `{decision}`, o que é compatível em espírito com os hooks do Claude Code. Porém `hooks.json` usa `matcher: run_command` (Antigravity), e **não há `.claude/settings.json`**, então o guard **não está ativo** nesta sessão. Ele também grava em `.agents/scratch/pre_tool_invocations.log` |
| `core/*.mjs` (orchestrator, runtime, skill_runtime, registry com 7 agentes: orchestrator, architect, builder, database, forensic, qa, android_engineer) | Sim (Node puro, sem LLM) | É um runtime determinístico "Level B single executor". Cada execução **grava** em `.agents/memory/executions/` (`runtime.mjs:426`) e no audit log. Por isso não foi executado |
| `governed_tool_bridge.mjs` | Sim | Escreve arquivos (`writeFileSync`); é uma ponte de ferramenta genérica |
| `android_player_pipeline.mjs`, `production_lifecycle.mjs` | Dependem de Gradle/JDK/ADB locais | Chamam `child_process`, e não dependem do Antigravity |

**Recomendação (não executada):** manter `.agents` como sistema único. Para ativar o `pre_tool_guard` no Claude Code seria preciso uma entrada de hook em `.claude/settings.json` com matcher `Bash`, mais um adaptador de formato da resposta. Isso é uma mudança de configuração e precisa de um Micro-Gate próprio, com sua aprovação.

## 3. Respostas às 30 perguntas do handoff (§53)

| # | Pergunta | Resposta | Confiança |
|---|---|---|---|
| 1 | O que é | Plataforma de digital signage/retail media com ERP comercial (CRM, contratos, cobrança) e player Android próprio | CONFIRMED |
| 2 | Como funciona | O CRM gera cliente → contrato → recebível; o gestor/anunciante monta playlists; a RPC entrega a playlist por tela/device; o player faz cache e reproduz | CONFIRMED (STATIC) |
| 3 | Módulos | 4 portais + `/financeiro` + cobrança pública + web player; 27 edge functions; player com 5 módulos | CONFIRMED |
| 4 | Entidades | Baseline §5 (180+ tabelas, com duplicações F-10) | CONFIRMED |
| 5 | Fonte de verdade | Baseline §14 | PARTIALLY_CONFIRMED |
| 6 | Front → back | `supabase-js` direto (PostgREST/RPC) + 17 edge functions via `invoke` | CONFIRMED |
| 7 | Back → banco | RLS + 216 `SECURITY DEFINER`; edge functions com service role ignoram o RLS | CONFIRMED |
| 8 | RLS por tenant | Pela coluna `empresa_operadora_id` e helpers (`get_current_user_tenant_ids`, `can_access_client_data`); o estado vivo é desconhecido | PARTIALLY_CONFIRMED |
| 9 | Contratos | Baseline §7 / D-28, D-29 | CONFIRMED (STATIC) |
| 10 | Cobrança | Baseline §8; F-01 e F-06 | CONFIRMED com achados |
| 11 | Mídia | `get-upload-url` → R2 → `media` → playlist; compressão opcional via GH Actions | CONFIRMED (STATIC) |
| 12 | Campanha → tela | Não há motor de campanha automático: mídia → playlist (gestor ou cliente) → `publicar_playlist_no_ponto` → RPC → player | CONFIRMED |
| 13 | Início do player | BootReceiver → Splash → TokenStorage (Keystore) → Login / ScreenSelection / Main | CONFIRMED (STATIC) |
| 14 | Recuperação da playlist | `get_player_playlist_for_screen(p_identifier, p_device_id)` com status gate | CONFIRMED (STATIC) |
| 15 | Cache | D-12 (sem SHA-256) | CONFIRMED (STATIC) |
| 16 | Offline | D-25 | CONFIRMED (STATIC); runtime UNKNOWN |
| 17 | Background sync | Download → validação por tamanho → `insertPlaylistWithItems` (não transacional, F-18) | CONFIRMED (STATIC) |
| 18 | Playback | QueueManager → ExoPlayerRenderer + PlaybackWatchdog → projeção de surface | CONFIRMED (STATIC) + JVM |
| 19 | Kiosk | HOME/LAUNCHER, `singleInstance`, Lock Task se Device Owner, `AdminReceiver` | CONFIRMED (STATIC) + JVM (`KioskIsolationTest`) |
| 20 | Device binding | `ANDROID_ID`+fingerprint SHA-256 → `fn_device_bind`/`fn_device_attest`; revogação via `admin_unpair_screen` | CONFIRMED (STATIC) |
| 21 | Contrato Player ↔ Supabase | 10 status em paridade; RPCs de frota ausentes das migrations (F-03) | CONFIRMED com achado |
| 22 | Agentes | Handlers JS determinísticos, 7 papéis; nenhum LLM | CONFIRMED |
| 23 | Skills | 9 `SKILL.md` + 3 scripts Node | CONFIRMED |
| 24 | Orchestrator | `core/orchestrator.mjs` (TaskNormalizer → ExecutionPlanner → TaskOrchestrator); não está ligado ao CI nem ao Claude Code | CONFIRMED (STATIC) |
| 25 | Memória | `.agents/memory/` (ledger não rastreado, 2 ADRs, 5654 execuções) + `MASTER_ISSUE_LEDGER.md` + `docs/` | CONFIRMED |
| 26 | Findings conhecidos | F-01…F-19 (este gate); os históricos P0.x/C3.x não estão no repositório | CONFIRMED / UNKNOWN |
| 27 | Fechados | Nenhum verificável no repositório | UNKNOWN |
| 28 | Abertos | F-01…F-19 | CONFIRMED |
| 29 | Dependem de hardware | Durabilidade do rename e do Room após power loss, MediaCodec real, Device Owner/Lock Task real, HDMI, cold boot OEM, semântica do `dirty_shutdown` | CONFIRMED (classificação) |
| 30 | Não provado | Tudo acima de STATIC/JVM: estado vivo do banco e do RLS, flags de deploy das funções, execução runtime e hardware do player, fluxos E2E | CONFIRMED |
