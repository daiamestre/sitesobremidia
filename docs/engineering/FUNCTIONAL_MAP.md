# FUNCTIONAL MAP — Micro-Gate 0 (2026-09-23)

> Matrizes derivadas de STATIC_CODE, salvo quando indicado. Estados usados: VERIFIED_IMPLEMENTED · IMPLEMENTED_NOT_FULLY_PROVEN · PARTIAL · LEGACY · DUPLICATED · ORPHANED · BROKEN · PLANNED_ONLY · NOT_FOUND.
> **Nenhum item recebeu VERIFIED_IMPLEMENTED neste gate**, porque não houve execução em runtime, no banco ou em hardware. O teto aqui é IMPLEMENTED_NOT_FULLY_PROVEN.

## P. Matriz de funcionalidades

| Funcionalidade | Onde está | Implementação | Dependências | Evidência | Estado |
|---|---|---|---|---|---|
| Login + roteamento por perfil | `contexts/AuthContext.tsx`, `lib/portalAccess.ts`, `components/auth/RouteGuards.tsx` | Supabase Auth + `usuarios.perfil` | `usuarios`, `perfis` | AuthContext:156/346 | IMPLEMENTED_NOT_FULLY_PROVEN (fallback `role?.name` em 2 pontos, F-04) |
| Workspace OWNER/ADMIN | `modules/corporate/` | layout + CommandCenter | `corporate_*` | App.tsx rota `/workspace` | IMPLEMENTED_NOT_FULLY_PROVEN |
| CRM Representante | `modules/crm/pages/*` (rotas `/representantes/*`) | services por domínio | ~60 tabelas | App.tsx:153-216 | IMPLEMENTED_NOT_FULLY_PROVEN |
| Prospecção / ponto parceiro | `NovaProspeccaoPage`, `PontoParceiroWizardPage` | `fn_cadastrar_ponto_parceiro_com_contrato`, `criar_ponto_parceiro_prospeccao` | `pontos`, `contratos` | migrations 20261217 | IMPLEMENTED_NOT_FULLY_PROVEN |
| Cadastro de anunciante | `NovoClienteWizardPage` | `fn_cadastrar_cliente_atomo` (7 redefinições) | `clientes`, `contatos`, `unidades` | migrations | IMPLEMENTED_NOT_FULLY_PROVEN |
| Propostas + PDF | `PropostasListPage`, edge `generate-proposal-pdf` | edge function | `propostas`, `itens_proposta` | invoke ×3 | IMPLEMENTED_NOT_FULLY_PROVEN |
| Contrato + template | `contratoDocumento.service.ts` (3222 l.) | PDF client-side + bucket `contratos` | `contrato_templates`, `contratos` | testes microgate55/56 (mock) | IMPLEMENTED_NOT_FULLY_PROVEN |
| Assinatura via RPC | `AssinaturaContratoDialog`, `digitalSignature.service.ts` | `fn_assinar_contrato` | `assinaturas*` | microgate31 test (mock) | IMPLEMENTED_NOT_FULLY_PROVEN |
| Assinatura via edge | `functions/contract-signature-flow` | service role, sem auth | `assinaturas` | sem consumidor em src | ORPHANED + DUPLICATED (F-02) |
| `contrato_versoes` | 1 consumidor em src | — | — | grep | PARTIAL |
| Pedido de Inserção (PI) | `PedidoInsercaoPage` | `fn_gerar_numero_pi` | `pedidos_insercao*`, `pi_*` | App.tsx | IMPLEMENTED_NOT_FULLY_PROVEN |
| Produção / agendamento | `ProductionListPage`, `Schedule*` | services crm | `producoes`, `agendamentos` | App.tsx | IMPLEMENTED_NOT_FULLY_PROVEN |
| Cobrança recorrente | RPC `gerar_cobrancas_recorrentes`, `processar_regua_cobranca` | plpgsql + `billing-worker` | `contas_receber`, `regras_cobranca` | 20260824 migration | IMPLEMENTED_NOT_FULLY_PROVEN |
| Boleto Inter v3 | `inter-billing-engine` | OAuth + `/cobranca/v3` | `contas_receber.inter_*` | index.ts:8 | IMPLEMENTED_NOT_FULLY_PROVEN; baixa automática UNCONFIRMED (F-06) |
| PIX Inter v2 | `inter-pix-engine` | `/pix/v2/cob` + webhook | `pagamentos` | index.ts:6-13 | BROKEN (segurança, F-01) |
| Webhook genérico | `payment-webhook` | HMAC ou Bearer, idempotente | `pagamentos` | index.ts:55-92 | IMPLEMENTED_NOT_FULLY_PROVEN |
| Conciliação → PAGA | trigger `trg_concilia_pagamento` | soma de pagamentos | `pagamentos` → `contas_receber` | 20261230:7-71 | IMPLEMENTED_NOT_FULLY_PROVEN |
| Suspensão de tela por inadimplência | `get_player_playlist_for_screen` | `SCREEN_SUSPENDED` | `contratos`, `contas_receber` | rpc linhas 40-74 | IMPLEMENTED_NOT_FULLY_PROVEN |
| Repasse ao ponto parceiro | `fn_apurar_repasse_parceiro`, `listar_repasses_parceiro` | trigger financeiro | `repasses_parceiros` | 20261217 | IMPLEMENTED_NOT_FULLY_PROVEN (ausente em types.ts) |
| Portal do Anunciante | `/portal/*` (22 rotas) | `CustomerPortalLayout` | `customerPortalData.service` | App.tsx | IMPLEMENTED_NOT_FULLY_PROVEN |
| Produtos / ofertas / encartes | `customerCommerce.service.ts` | CRUD local | `produtos`, `ofertas`, `encartes` | 1 service | PARTIAL |
| Product Master / Price Sync / ERP | — | — | — | busca vazia | NOT_FOUND / PLANNED_ONLY (F-12) |
| Offer/Campaign/Creative Engine automatizados | — | — | — | — | PLANNED_ONLY |
| Upload de mídia R2 | `MediaUploadDialog`, `get-upload-url` | URL pré-assinada | R2, `media` | invoke ×7 | IMPLEMENTED_NOT_FULLY_PROVEN |
| Compressão de vídeo | `compress-video.yml` | FFmpeg H.265 via GH Actions | R2 | workflow | IMPLEMENTED_NOT_FULLY_PROVEN |
| Playlists (gestor) | `/dashboard/playlists` | `usePlaylists` | `playlists`, `playlist_items` | — | IMPLEMENTED_NOT_FULLY_PROVEN |
| Playlists (cliente) | `PlaylistsClientePage` | `publicar_playlist_cliente` | `playlists_cliente` | — | IMPLEMENTED_NOT_FULLY_PROVEN / DUPLICATED |
| Widgets (clock/RSS/clima) | `components/player/*Widget`, `fetch-rss`, `NativeWidgetEngine.kt` | web + nativo | `widgets` | — | IMPLEMENTED_NOT_FULLY_PROVEN |
| Pareamento de device | `DevicePairingScreen`, `fn_request_pairing_code`, `fn_device_bind` | código + binding exclusivo | `device_pairing_codes`, `devices` | RPC | IMPLEMENTED_NOT_FULLY_PROVEN |
| Player nativo: playback offline | `MainActivity`, `CacheManager`, Room | cache + fila | Room v11 | 97 testes JVM PASS (execução externa, 2026-09-23) | IMPLEMENTED_NOT_FULLY_PROVEN (sem RUNTIME/HARDWARE) |
| Player: adoção atômica de playlist | `PlayerDao.insertPlaylistWithItems` | delete+insert em default method | Room KSP | `PlayerDao_Impl.java:526-528` sem transação | BROKEN no nível de código gerado (F-18) |
| Player: kiosk / Lock Task | `DeviceControl.kt`, `AdminReceiver` | Device Owner | DPM | `KioskIsolationTest` (JVM) | IMPLEMENTED_NOT_FULLY_PROVEN |
| Player: OTA | `OTAUpdateManager.kt` | SHA-256 + version_code monotônico | `app_releases` | código | IMPLEMENTED_NOT_FULLY_PROVEN |
| Player: telemetria de frota | `DeviceFleetManager.kt` | RPCs v2 | RPCs só no archive | F-03 | PARTIAL / possivelmente BROKEN |
| Player: comandos remotos | `RemoteCommandListener.tsx`, `remote_commands` | polling/realtime | — | — | IMPLEMENTED_NOT_FULLY_PROVEN |
| Proof of Play | `playback_logs`, `proof_of_play` | insert do player | — | RemoteDataSource:690 | PARTIAL (2 tabelas) |
| NOC / offline alerts | `noc.service.ts`, `check-offline-screens` | edge + views | `noc_alerts`, `vw_offline_screens` | — | IMPLEMENTED_NOT_FULLY_PROVEN |
| BI / DW | `bi/*`, `dw_*` views | views SQL | `dw_*` | — | IMPLEMENTED_NOT_FULLY_PROVEN |
| "IA" (dashboard/predições) | `AIDashboard`, `ai_predicoes` | sem LLM | tabelas `ai_*` | busca por provedores vazia | PARTIAL (heurística/nominal) |
| WhatsApp / Social como canal | — | só campos e links wa.me | — | — | NOT_FOUND |
| Central de comunicação | `pages/Central`, `communication-core` | realtime + templates | `conversas`, `comunicacao_*` | — | IMPLEMENTED_NOT_FULLY_PROVEN |

## Q. Matriz de dados / source of truth

| Entidade | Tabela canônica | Criador | Consumidores | RLS (migrations) | Storage | Duplicação | Source of Truth |
|---|---|---|---|---|---|---|---|
| Usuário/perfil | `usuarios` + `perfis` | `provisionar_usuario_corporativo`, edge `provision-user` | AuthContext, RLS helpers | `perfis` sem ENABLE (F-08) | — | `profiles`, `roles`, `user_roles`… | `usuarios.perfil_id` |
| Anunciante | `clientes` | `fn_cadastrar_cliente_atomo` | CRM, portal, cobrança | sim | — | — | `clientes` |
| Ponto parceiro | `pontos` | `fn_cadastrar_ponto_parceiro_com_contrato` | prospecção, RPC do player, repasse | sim | — | `locais`, `pi_locais`, `telas` | `pontos` |
| Tela | `screens` | `criar_tela_gestor`, CRM | player (RPC), dashboard | sim | `screenshots` | `telas`, `players`, `operacao_players`, `equipamentos` | `screens` |
| Device | `devices` | `fn_device_bind` | RPC do player, NOC | sim | — | `mobile_dispositivos` (outro domínio) | `devices` |
| Contrato | `contratos` | CRM/onboarding RPCs | portal, cobrança, RPC do player | sim | Supabase `contratos` | `contrato_versoes` parcial | `contratos` |
| Assinatura | `assinaturas` | `fn_assinar_contrato` | portal, auditoria | sim | `contratos` | `assinaturas_digitais` (sem uso) | `assinaturas` |
| Recebível | `contas_receber` | `gerar_cobrancas_recorrentes`, JIT expansão | portal, NOC, RPC do player | sim | — | `cobrancas`, `pix_cobrancas`, `boletos`, `parcelas` | `contas_receber` |
| Pagamento | `pagamentos` | webhooks PIX/genérico, manual | trigger de conciliação | sim | — | `recebimentos_conciliacao`, `webhook_pagamentos` | `pagamentos` |
| Mídia | `media` | upload (R2) | playlists, player | sim | R2 | `medias`, `midias`, `biblioteca_midias` | `media` + objeto R2 |
| Playlist | `playlists` / `playlists_cliente` | dashboard / portal | RPC do player (une as duas) | sim | — | duas árvores | as duas, unidas na RPC |
| Produto/preço | `produtos` / `produto_precos` | portal | encartes/ofertas | sim | — | `ponto_precos` | local (sem ERP) |
| Release OTA | `app_releases` | manual/script | OTAUpdateManager | sim | R2/Storage | — | `app_releases` |

## R. Mapa de integrações

| De | Para | Mecanismo | Autenticação | Evidência |
|---|---|---|---|---|
| Web | Supabase DB | PostgREST/RPC | JWT do usuário + RLS | `integrations/supabase/client.ts` |
| Web | Edge Functions (17) | `functions.invoke` | JWT do usuário | grep invoke |
| Web | R2 | URL pré-assinada via `get-upload-url`/`get-download-url` | JWT → edge | `r2Client.ts` |
| Android | Supabase DB | supabase-kt (PostgREST/RPC/Storage/Realtime) | sessão do usuário do player (TokenStorage) + binding de hardware | `RemoteDataSource.kt` |
| Android | R2/CDN | download HTTP de mídia/APK | URL pública/assinada | `CacheManager.kt`, `OTAUpdateManager.kt` |
| Banco Inter | `inter-billing-engine` | webhook boleto | `INTER_WEBHOOK_TOKEN` **se configurado** (fail-open) | index.ts:234-240 |
| Banco Inter | `inter-pix-engine` | webhook PIX | **nenhuma no código** | F-01 |
| Terceiro/worker | `payment-webhook` | POST | HMAC `x-signature` ou Bearer secret | index.ts:55-67 |
| Edge | Banco Inter API | OAuth2 client credentials (+ cert) | token em cache em `inter_oauth_tokens` | inter-pix-engine:51-91 |
| GitHub Actions | R2 | rclone | secrets | `compress-video.yml` |
| GitHub Actions | Supabase | ping / deploy | service key / access token | `keep-alive.yml`, `deploy-functions.yml` |
| Crawlers | Vercel `api/cobranca-og.js` | rewrite por user-agent | pública | `vercel.json` |

## S. Duplicação / legado

| Item | Tipo | Evidência | Recomendação (não executada) |
|---|---|---|---|
| Tabelas de mídia/tela/playlist/cobrança/RBAC | DUPLICATED | F-10 | Micro-Gate de ADR de fonte canônica por domínio |
| `contract-signature-flow` vs `fn_assinar_contrato` | DUPLICATED + ORPHANED | F-02 | confirmar deploy; desativar o caminho sem consumidor |
| `sync-network/PlayerRepositoryImpl.kt` | ORPHANED | 0 referências | remover em Micro-Gate de player |
| 3 caches, 2 MaintenanceWorkers, 4 heartbeats no player | DUPLICATED | F-11 | mapear chamadores em runtime antes de mexer |
| `supabase/migrations_archive/` ainda consumido pelo Android | LEGACY vivo | F-03 | promover para migrations ativas (aditivo) |
| ~250 scripts `.mjs/.cjs/.sql/.ps1` na raiz e em `scripts/` | LEGACY / ad hoc | `ls` | inventariar; nada de apagar sem autorização |
| 18 relatórios `.md` na raiz + 58 em `docs/` | documentação sobreposta | `ls` | usar `docs/engineering/` como índice |
| README/package name do Lovable | LEGACY | README.md | atualizar num gate de documentação |
| `.agents/hooks.json` (formato Antigravity) | não ativo no Claude Code | conteúdo | decidir se deve ser portado |
| Governança em 5 lugares | DUPLICATED | §13 do baseline | manter `AGENTS.md` como canônico |

## Fluxos críticos (rastreados)

**Cadastro**

```text
Wizard (NovoClienteWizardPage) → fn_cadastrar_cliente_atomo / fn_cadastrar_cliente_com_contrato
→ clientes → contatos/unidades → cliente_pontos (seleção via listar_pontos_para_anunciar)
→ contratos (fn_gerar_numero_contrato_atomo) → assinatura (fn_assinar_contrato)
```

**Financeiro**

```text
contrato → gerar_cobrancas_recorrentes / fn_criar_cobranca_jit_expansao → contas_receber
→ inter-billing-engine (boleto) | inter-pix-engine issue (PIX) → Banco Inter
→ webhook → pagamentos (PIX, genérico) | inter_status (boleto)
→ trg_concilia_pagamento → PAGA → regras operacionais → repasse parceiro
```

**Mídia**

```text
Upload → get-upload-url → R2 → media → (compress-video opcional) → playlist(s)
→ publicar_playlist_no_ponto / publicar_playlist_cliente → get_player_playlist_for_screen → player
(Produto → Preço → Oferta → Campanha → Criativo: NÃO encadeado automaticamente)
```

**Player**

```text
Boot → Splash → TokenStorage → ScreenSelection (get_authorized_screens_for_player) → fn_device_bind
→ MainActivity → get_player_playlist_for_screen (status gate) → Room → CacheManager (.tmp→rename)
→ QueueManager (quarentena) → ExoPlayer → SurfaceProjection → telemetria (device_health, playback_logs, fleet RPCs)
```

**Contrato**

```text
contrato_templates (TPL-ANUNCIANTE-OFICIAL / fn_obter_template_padrao) → contratos (pdf_object_key)
→ R2 tenants/{empresa}/contratos/{id}/v{n}/contrato_{numero}.pdf
→ assinaturas (fn_assinar_contrato; DRAWN|TYPED; signatário = CONTRATANTE) → assinado_{numero}_v{n}.pdf
→ download: assinaturas.pdf_assinado_key (se ASSINADO) → fallback contratos.pdf_object_key → contrato_auditoria
```
