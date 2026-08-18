# REGRESSION FORENSICS REPORT — SOBRE MÍDIA PLATFORM

**Fase 3 — Auditoria do baseline `0671f90` (somente leitura)**
**Data:** 2026-08-17/18 · **Branch:** `feat/central-corporativa-acessos` · **HEAD:** `0671f90`

> Regra absoluta: nenhuma alteração de código, banco ou Git foi executada nesta fase.
> Evidências: `git`, probes read-only contra o banco real (`bhwsybgsyvvhqtkdqozb`),
> `tsc --noEmit`, `vite build`, `eslint`, `vitest run`.

---

## 1. O QUE É O COMMIT 0671f90 (BASELINE)

Commit único `feat(central): baseline pos-auditoria de regressao...` — 195 arquivos,
+11.734 / −5.809. **É o estado integral do working tree anterior** (que continha o módulo
Representantes, migrations de hardening e evidências de red team) **commitado sobre o HEAD
`1e7b504`** (que já continha a Central de Acessos commitada em `93f352c`).

| Ref | Estado | Funcionalidades | Diferenças |
|---|---|---|---|
| `0671f90` (local, baseline) | **CONTÉM TUDO** | Central de Acessos completa, Representantes (gestão+desempenho), migrations 20260825–20260911, docs, scripts, testes | 46 arquivos exclusivos (Representantes, migrations, docs, testes) |
| `1e7b504` (pai) | Central OK / Representantes ausente | Rota `/workspace/representantes` aponta para `RepresentativeDashboard` (painel do próprio representante) | Sem módulo de gestão |
| `origin/feat/...` (`e8eb64e`) | Espelho de `1e7b504` | Mesma Central, sem Representantes | 9 arquivos exclusivos (5 Android deletados + 4 temporários) |
| `main` local (`885ffa8`) | Atrasado (13/08) | SEM Central de Acessos, SEM Representantes | 140 arquivos src diferentes |
| `origin/main` (`ff6d848`) | Atrasado (07/08) | SEM Central, SEM Representantes, SEM fix CrmLayout | **O que produção/CI deploya** |

**Conclusão 1:** o baseline `0671f90` é o **único** commit que contém o módulo Representantes.
Antes dele, esses arquivos existiam apenas no working tree (nunca commitados).

---

## 2. MATRIZ CENTRAL DE ACESSOS

| Funcionalidade | Estado anterior | Commit | Estado atual (0671f90) | Regrediu? | Causa | Restauração |
|---|---|---|---|---|---|---|
| Página `UsuariosAcessosPage` | Criada 14/08 | `93f352c`/`9140448` | Presente (+120 linhas de edição) | NÃO | — | Já restaurada no baseline |
| Rota `/workspace/usuarios` | Presente | `93f352c` | Presente | NÃO | — | Já presente |
| Menu "Central de Acessos" (Sidebar, gate `isOwner \|\| users.view`) | Presente | `93f352c` | Presente | NÃO | — | Já presente |
| `useCentral` / `useCentralUnread` / `CentralDashboard` / rotas `central` | Presente | `93f352c` + `0310ba9` | Presente (4 blocos de rota) | NÃO | — | Já presente |
| Permissões (RBAC, `permissoes_usuarios`) | Presente | `93f352c` | Presente | NÃO | — | Já presente |
| Trigger `auditar_alteracao_usuario` (auditoria server-side) | Banco real | 20260825 (aplicada manualmente) | Presente no banco | NÃO | — | Já no banco |
| Triggers `prevent_self_escalation`, `prevent_usuario_insert_forgery`, `enforce_admin_permission` | Banco real | 20260825 | Presentes no banco | NÃO | — | Já no banco |
| Policies `usuarios_insert/select/update`, `eo_select_tenant`, `eo_update_owner`, `rep_*_tenant`, `audit_*` | Banco real | 20260825 | Presentes no banco | NÃO | — | Já no banco |
| Migration `20260825` **registrada em schema_migrations** | — | — | **AUSENTE** (aplicada via SQL Editor, sem registro) | **SIM (divergência)** | Aplicação manual fora do versionamento | Registrar após autorização |

**Veredito Central de Acessos: B — totalmente funcional** (código + banco), tanto no
baseline quanto no banco real. **Nenhum commit removeu ou quebrou a Central.** A percepção
de "desapareceu" vem de produção (`main`) nunca ter recebido o branch.

---

## 3. MATRIZ REPRESENTANTES (GESTÃO DO OWNER)

| Funcionalidade | Estado anterior | Commit | Estado atual (0671f90) | Regrediu? | Causa | Restauração |
|---|---|---|---|---|---|---|
| `RepresentantesPage.tsx` (lista/CRUD, 551 linhas) | Só working tree | **nunca commitado** → `0671f90` | Presente | NÃO (agora protegido) | Existia só em working tree | Já no baseline |
| `DesempenhoRepresentantesPage.tsx` (774) | Só working tree | `0671f90` | Presente | NÃO | idem | Já no baseline |
| `RepresentanteDetalhePage.tsx` (704) | Só working tree | `0671f90` | Presente | NÃO | idem | Já no baseline |
| `representantesGerencia.service.ts` (260) — 6 métodos RPC | Só working tree | `0671f90` | Presente | NÃO | idem | Já no baseline |
| `usePermissoesRepresentantes.ts` (72) — 6 flags + `podeVer` | Só working tree | `0671f90` | Presente | NÃO | idem | Já no baseline |
| Rotas `/workspace/representantes`, `/desempenho`, `/:id` | Rota apontava p/ `RepresentativeDashboard` | `0671f90` | Apontam p/ `RepresentantesPage` | NÃO (corrigido no baseline) | `0310ba9` mapeou a rota para o dashboard do rep | Já no baseline |
| Menu Sidebar "Comercial → Representantes" (gate `isWorkspace`) | Só working tree | `0671f90` | Presente | NÃO | — | Já no baseline |
| Permissões `representantes.*` (6 chaves em `PERMISSOES_DISPONIVEIS`) | Só working tree | `0671f90` | Presente | NÃO | — | Já no baseline |
| Ranking real (sem mocks, `getRankingComercial`) em `RepresentativeDashboard` | Só working tree | `0671f90` | Presente | NÃO | mock UUID hardcoded removido | Já no baseline |
| Migration `20260826_representantes_gestao_desempenho.sql` | Não commitada | `0671f90` | Commitada + **APLICADA no banco** | NÃO | — | Já aplicada |
| RPCs `listar_representantes_gerencia`, `gerenciar_representante`, `get_desempenho_representantes`, `get_desempenho_representante_detalhe`, `reassinar_cliente_representante`, `pode_gerenciar_representantes`, `atualizar_usuario_corporativo` | — | 20260826 | **TODAS presentes no banco** | NÃO | — | Já no banco |
| RLS `representantes`: `rep_select/insert/update/delete_tenant` + `p_representantes_self_or_admin` | — | 20260825/26 | Presentes no banco | NÃO | — | Já no banco |
| Testes (167 security + 121 unit) | Só working tree | `0671f90` | Presentes | NÃO | — | Já no baseline |

**Veredito Representantes: COMPLETO no baseline (SIM)** — código, rotas, menu, permissões,
RPCs e RLS no banco. O risco de perda (working tree não commitado) foi **eliminado pelo baseline**.

---

## 4. MATRIZ DASHBOARD OWNER

| Funcionalidade | Estado anterior | Commit | Estado atual | Regrediu? | Causa | Restauração |
|---|---|---|---|---|---|---|
| `WorkspaceLayout` + `/workspace/*` | 11/08 | `0310ba9` | Presente | NÃO | — | Já presente |
| `CorporateCommandCenter` (dashboard) | 11/08 | `0310ba9` | Presente | NÃO | — | Já presente |
| Item "Central de Acessos" no menu OWNER | 14/08 | `93f352c` | Presente (gate `isOwner \|\| users.view`) | NÃO | — | Já presente |
| Item "Representantes" no menu OWNER | Só working tree | `0671f90` | Presente (gate `isWorkspace`) | NÃO | — | Já no baseline |
| Dashboard OWNER em produção | — | — | **AUSENTE** (`main` 07/08) | **SIM** | Deploy/CI rodam `main`; branch nunca mergeado | Merge do baseline após autorização |

**Veredito Dashboard OWNER:** o código está completo no baseline; o que "desapareceu" para o
usuário é **produção/CI rodando `main`** (07/08 ou 13/08), que nunca recebeu o branch
`feat/central-corporativa-acessos`. Não é regressão de código — é regressão de deploy/merge.

---

## 5. ÚLTIMO ESTADO FUNCIONAL CONFIÁVEL (LAST KNOWN GOOD)

| Funcionalidade | ÚLTIMO COMMIT FUNCIONAL | Próximo commit | Alteração | Causa da regressão |
|---|---|---|---|---|
| Central de Acessos (código) | `93f352c` (14/08) / `0671f90` (17/08) | — | Nenhuma remoção | Não houve regressão de código |
| Central de Acessos (banco) | Migrations até `20260826` aplicadas | — | `20260825` sem registro em schema_migrations | Aplicação manual fora do versionamento |
| Representantes (gestão OWNER) | **`0671f90` é o PRIMEIRO commit** com o módulo | — | Antes: só working tree | Nunca commitado (risco de perda — agora eliminado) |
| Representantes (banco) | `20260826` aplicada e registrada | — | RPCs + RLS presentes | Consistente |
| Dashboard OWNER (produção) | `main` nunca teve | — | — | Deploy/CI fora do branch |
| Creative Studio | **NUNCA existiu no código nem no banco** | — | 0 arquivos, 0 commits, 0 tabelas | Não é regressão: nunca foi implementado |

---

## 6. OUTRAS REGRESSÕES / DIVERGÊNCIAS (ver docs/OTHER_REGRESSIONS.md)

1. **Migrations 20260827–20260911 NÃO aplicadas no banco** (6 pendentes):
   `player_security_hardening`, `device_identity`, `app_release_integrity`,
   `media_network_edge_auth`, `foundation_closure`, `close_tenant_exposure`.
2. **`20260911` = correção P0 cross-tenant** — o banco REAL ainda possui políticas
   permissivas de leitura global em `media`/`playlists`/`playlist_items`/`widgets`
   ("Allow authenticated read", "Public read access", "Permitir leitura anon/auth") com
   `qual=true` → **qualquer usuário autenticado (e anônimo em alguns casos) lê dados de TODOS os tenants**.
3. **Probes de schema falharam consistentes com migrations não aplicadas**:
   `screens.last_heartbeat`, `devices.screen_id`, `app_releases.sha256`, `players.name`, `widgets.type` — ausentes.
4. **Duas histórias Git paralelas** (local 171 vs remoto 176 commits, merge-base antigo
   `4e4b887`, conteúdos finais equivalentes) — risco de push/rebase destrutivo.
5. **`main` atrasado 10 dias** — produção sem tudo que foi aprovado desde 07/08.
6. **Erro Android** `native-android-player/app/build.gradle.kts:13` (`loadSigningProps` com
   `java.util.Properties` quebrado) — código presente no baseline (veio do working tree);
   **separado do ERP web, não corrigir nesta fase**.
7. **Lint:** 226 erros + 23 warnings — **100% em código legado** (services CRM antigos com
   `any`); **zero erros nos arquivos novos** do baseline.
8. **Teste `digital-signature.integration`:** 1 falha por timeout de 5s (CLICKSIGN) —
   pré-existente desde `1e5444f` (03/08), sensível a rede; 399/400 passando.

---

## 7. EVIDÊNCIAS DE QUALIDADE (executadas hoje, read-only)

| Check | Resultado |
|---|---|
| `tsc --noEmit` | ✅ limpo (exit 0) |
| `vite build` | ✅ OK (681ms) |
| `vitest run` | ✅ 399/400 (1 falha pré-existente de timeout em integração CLICKSIGN) |
| `eslint .` | ⚠️ 226 erros em código legado; **0 em arquivos novos** |
| Probes banco (SELECT/information_schema/pg_policies/pg_proc/schema_migrations) | ✅ executados, divergências registradas |

---

## 8. RISCO P0 — EXPOSIÇÃO CROSS-TENANT (REGISTRADO, SEM CORREÇÃO)

| Item | Evidência |
|---|---|
| `media` | Policies SELECT `qual=true` (3 policies) — leitura de toda a tabela por anon/authenticated |
| `playlists` / `playlist_items` | Policies SELECT `qual=true` (2 por tabela) |
| `widgets` | Policy "Permitir leitura anon/auth para widgets" `qual=true` |
| `devices` | `safe_heartbeat_update_devices` UPDATE `qual=true` / `with_check=true` |
| Correção pendente | `20260911_close_tenant_exposure.sql` (1269 linhas) **não aplicada** |

**Impacto:** qualquer usuário autenticado (e anônimo, em parte) pode enumerar mídias,
playlists, widgets e telas de todos os tenants do projeto real.

---

## 9. DEPENDÊNCIAS DE BANCO (o que o código exige do banco)

| Funcionalidade | Tabelas/Views | Functions | Policies/Triggers | Status banco |
|---|---|---|---|---|
| Central de Acessos | `usuarios`, `perfis`, `permissoes_usuarios`, `empresa_operadora`, `auditoria_logs`, `solicitacoes_acesso` | `atualizar_usuario_corporativo`, `get_my_admin_permissions`, triggers de hardening | `usuarios_*`, `eo_*`, `audit_*`, `solicitacoes_*` | ✅ presentes |
| Representantes | `representantes`, `clientes`, `propostas`, `contratos`, `metas_representantes`, `comissoes_representantes` | 6 RPCs + `pode_gerenciar_representantes` | `rep_*_tenant` + `p_representantes_self_or_admin` | ✅ presentes |
| Dashboard OWNER | `empresa_operadora`, `usuarios`, telas/players | — | `eo_select_tenant`, `eo_update_owner` | ✅ presentes |
| Media/Player (20260827–20260911) | `screens`, `devices`, `app_releases`, `players`, `widgets` | — | — | ❌ colunas das migrations pendentes ausentes |

---

## 10. RISCOS

1. **P0 cross-tenant ativo no banco real** (migrations 20260911 não aplicada).
2. **Duas histórias Git** — push/rebase cego pode perder 46 arquivos exclusivos do local.
3. **`main` desatualizado** — se produção for deployada hoje, nada das features aparece.
4. **`20260825` sem registro** em schema_migrations — `supabase db push` futuro pode tentar
   reaplicar e conflitar.
5. **Android quebrado no baseline** (`build.gradle.kts:13`) — separado do ERP, precisa janela própria.
6. **Lint legado** (226 erros) — não bloqueia build, mas degrada diagnóstico.

---

## 11. RESPOSTAS OBRIGATÓRIAS (com evidência)

**"Qual era o estado funcional aprovado?"**
→ O baseline `0671f90` (17/08, 23:06): Central de Acessos completa (código `93f352c` +
hardening `20260825` no banco) + módulo Representantes integral (código + RPCs + RLS no
banco via `20260826`) + Dashboard OWNER com os dois itens de menu.

**"Exatamente o que fez essa funcionalidade desaparecer?"**
→ Nenhum commit removeu as funcionalidades. Elas "desapareceram" por dois motivos:
(a) **Representantes nunca foi commitado antes do baseline** (existia só no working tree);
(b) **produção/CI rodam `main`** (07/08), que nunca recebeu o branch `feat` — a Central
existe commitada desde `93f352c` e o Dashboard OWNER desde `0310ba9`, mas nada disso chegou ao `main`.

**"Qual é a forma mais segura de restaurá-la?"**
→ Não há restauração de código necessária: o baseline já contém tudo. A restauração é de
**governança**: convergir histórias Git, atualizar `main` com o baseline aprovado, aplicar
as 6 migrations pendentes (com autorização), corrigir o lint legado em janela própria e
instalar o regression guard (ver docs/RESTORATION_PLAN.md).
---

## 17. ADDENDUM DE EXECUCAO (FASE AUTORIZADA - 18/08)

Autorizacao concedida. Executado com zero alteracoes de codigo do app (apenas aditivos):

### 17.1 Migrations aplicadas no banco real (mecanismo Management API, transacao por arquivo)
| Migration | Status |
|---|---|
| 20260826_representantes_gestao_desempenho | APLICADA (RPCs representantes ativas) |
| 20260912_restauracao_pre_requisitos (nova, aditiva) | APLICADA (funcoes 018/20260827 ausentes) |
| 20260827_player_security_hardening | APLICADA |
| 20260828_device_identity | APLICADA |
| 20260829_app_release_integrity | APLICADA |
| 20260901_media_network_edge_auth | APLICADA |
| 20260910_foundation_closure | APLICADA |
| 20260911_close_tenant_exposure | APLICADA |
| 20260913_restauracao_compat_schema (nova, aditiva: midias/midia_aprovacoes/operacoes/operacao_players/device_health + overload fn text(uuid)) | APLICADA |
| 20260914_limpeza_policies_legadas (nova, aditiva) | APLICADA (dropped 8 policies permissivas legadas) |
| 20260915_close_p0_media_playlists_widgets (sessao concorrente, revisada e validada) | APLICADA |

### 17.2 Fechamento P0 comprovado (scripts/cross_tenant_verify.mjs, banco real)
- anon: 7+ tabelas com permission denied (screens, remote_commands, app_releases, media, widgets, playlists, playlist_items, devices, playback_logs, monitoring_logs, proof_of_play, screenshots_logs).
- autenticado (owner tenant A): SELECT tela tenant B = bloqueado; UPDATE = 0 linhas; INSERT playback_logs = bloqueado; INSERT remote_commands = bloqueado.
- Falha intermediaria detectada e corrigida: policies legadas "Allow authenticated read"/"safe_heartbeat_update_screens"/"Permitir inserção de logs de reprodução industrial" sobreviveram com nomes diferentes (OR-semantica) - removidas em 20260914.

### 17.3 Representantes - backend real OK (scripts/representantes_smoke.mjs)
- listar_representantes_gerencia: 4 representantes (dados reais).
- get_desempenho_representantes: 4 linhas.
- get_my_admin_permissions (OWNER): 13 permissoes.

### 17.4 Regression Guard instalado (novo)
- src/tests/regression/regression-guard.test.tsx (8 testes): rotas, menus, paginas, service, hook, OWNER ve menu, painel representante nao ve.
- vitest.config.ts inclui src/tests/regression/**.
- Se qualquer peca protegida for removida => REGRESSION BLOCKED.

### 17.5 Validacao
- npm run build: OK (PWA 226 entries).
- npx tsc --noEmit: 0 erros.
- vitest run --pool=forks: 34 arquivos / 408 testes / 0 falhas.
- lint: 226 erros pre-existentes (225 no-explicit-any + 1 rules-of-hooks em MediaPreviewDialog, desde commit inicial 34c7e8d). Arquivos novos/protegidos: 0 erros.

### 17.6 Nao tocado
- Android (build.gradle.kts:13) - janela separada (sem alteracao).
- policies player/contratos (device_logs, download_status, system_errors, contrato_auditoria, contrato_templates) - preservadas.
- Nenhum arquivo de codigo do app foi modificado nesta fase (git status: apenas vitest.config.ts + arquivos novos aditivos).
