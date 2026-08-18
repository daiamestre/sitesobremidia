# BASELINE FUNCIONAL — SOBRE MÍDIA PLATFORM (PROTEGIDA)

**Versão do documento:** 2.0 · **Data:** 2026-08-18
**Baseline Git:** commit `0671f90` · branch `feat/central-corporativa-acessos`
**Projeto Vercel:** `sitesobremidia` · **Repositório:** `daiamestre/sitesobremidia`
**Regra arquitetural:** FASE NOVA NÃO É UMA NOVA VERSÃO DO SISTEMA. É UMA EVOLUÇÃO DO SISTEMA EXISTENTE.

> Este documento congela o estado **verificado** (evidências em
> `docs/REGRESSION_FORENSICS_REPORT.md`). Qualquer alteração futura que remover, renomear
> ou quebrar qualquer item abaixo é **REGRESSION** e deve **BLOQUEAR** a fase em andamento
> (`REGRESSION BLOCKED`) até autorização explícita.

---

## 1. CENTRAL DE ACESSOS (OWNER) — PROTEGIDA ✅

| Item | Estado no baseline `0671f90` | Evidência |
|---|---|---|
| Página `UsuariosAcessosPage` (com edição de usuário) | Commitada | `src/modules/corporate/pages/UsuariosAcessosPage.tsx` (desde `93f352c`; +120 no baseline) |
| Rota `/workspace/usuarios` | Commitada | `src/App.tsx` |
| Menu "Central de Acessos" (gate `isOwner \|\| users.view`) | Commitada | `src/modules/crm/components/Sidebar.tsx` |
| Rotas `central` (CentralDashboard) — 4 blocos | Commitada | `src/App.tsx`, `src/pages/Central/CentralDashboard.tsx` |
| Hooks `useCentral` / `useCentralUnread` | Commitada | `src/hooks/useCentral.ts` + `central.service` + `central.realtime` |
| RBAC/permissões (`permissoes_usuarios`, `get_my_admin_permissions`) | Commitada | `src/hooks/useRbac.ts`, `src/services/corporateUsers.service.ts` |
| Triggers banco: `prevent_self_escalation`, `prevent_usuario_insert_forgery`, `enforce_admin_permission`, `auditar_alteracao_usuario` | Ativos no banco | probe `pg_proc` (2026-08-18) |
| Policies banco: `usuarios_*`, `eo_*`, `audit_*`, `rep_*_tenant`, `solicitacoes_*` | Ativas no banco | probe `pg_policies` (2026-08-18) |
| Migration `20260825` | No Git; **aplicada no banco sem registro** em schema_migrations | pendência registrada — ação no RESTORATION_PLAN |

**Estado: B — totalmente funcional (código + banco).**

---

## 2. REPRESENTANTES — GESTÃO COMERCIAL DO OWNER — PROTEGIDA ✅

| Item | Estado no baseline `0671f90` | Evidência |
|---|---|---|
| `RepresentantesPage.tsx` (lista/CRUD, busca, ativar/desativar, "Novo Representante") | Commitada | `src/modules/crm/pages/RepresentantesPage.tsx` (551 linhas) |
| `DesempenhoRepresentantesPage.tsx` (KPIs, ranking ordenável, gráfico, drill-down) | Commitada | `src/modules/crm/pages/DesempenhoRepresentantesPage.tsx` (774) |
| `RepresentanteDetalhePage.tsx` (perfil + tabs) | Commitada | `src/modules/crm/pages/RepresentanteDetalhePage.tsx` (704) |
| `representantesGerencia.service.ts` (6 métodos RPC) | Commitada | `src/services/representantesGerencia.service.ts` (260) |
| `usePermissoesRepresentantes.ts` (6 flags + `carregado`) | Commitada | `src/hooks/usePermissoesRepresentantes.ts` (72) |
| Rotas `/workspace/representantes`, `/desempenho`, `/:id` → gestão | Commitada | `src/App.tsx` |
| Menu "Comercial → Representantes" (gate `isWorkspace`) | Commitada | `src/modules/crm/components/Sidebar.tsx` |
| Permissões `representantes.view/edit/activate/deactivate/edit_clients/view_performance` | Commitada | `src/services/corporateUsers.service.ts` |
| Reatribuição de clientes (dialog em ClienteDetalhePage) | Commitada | `src/modules/crm/pages/ClienteDetalhePage.tsx` |
| Ranking real em `RepresentativeDashboard` (sem mocks) | Commitada | `src/modules/crm/pages/RepresentativeDashboard.tsx` |
| Migration `20260826` (RPCs, RLS, índices, auditoria) | Commitada **e aplicada no banco** | probe `pg_proc` — 7 RPCs ativas |
| RLS `representantes` tenant-scoped | Ativa no banco | `rep_select/insert/update/delete_tenant` + `p_representantes_self_or_admin` |
| Testes (167 security + 121 unit) | Commitados | `src/tests/security/representantes-gerencia.security.test.ts`, `src/tests/unit/representantesGerencia.service.test.ts` |

**Estado: COMPLETO. É o PRIMEIRO commit com o módulo — `0671f90` é o ponto de proteção.**

---

## 3. DASHBOARD OWNER / WORKSPACE — PROTEGIDO ✅

| Item | Estado | Evidência |
|---|---|---|
| `WorkspaceLayout` + `/workspace/*` | Commitado | desde `0310ba9` |
| `CorporateCommandCenter` | Commitado | `src/modules/corporate/pages/CorporateCommandCenter.tsx` |
| Menu OWNER: Central de Acessos + Comercial→Representantes | Commitado | Sidebar |
| Painel `/representantes/*` (login, dashboard, CRM, financeiro, BI, central) | Commitado | `src/App.tsx` (desde `0310ba9` + `885ffa8`) |
| `CrmLayout` default export (fix Error #306) | Commitado | `885ffa8`/`9bff5e1` |
| Guards: `RequireAuth`, `RequireApproval` (valida sessão real Supabase) | Commitado | `src/components/auth/RouteGuards.tsx` |

---

## 4. FUNCIONALIDADES PROTEGIDAS — LISTA CONSOLIDADA

### Rotas (devem existir sempre)
`/` · `/auth` · `/install` · `/representantes/login` · `/representantes/*` (dashboard, clientes,
propostas, contratos, campanhas, pontos, agenda, relatorios, pi, producao, operacao,
financeiro/*, analytics/*, bi/*, central, configuracoes, perfil, assinaturas, portal-cliente,
mobile, ia) · `/workspace/*` (corporate, representantes, representantes/desempenho,
representantes/:id, usuarios, central, clientes, propostas, contratos, campanhas, screens,
agenda, financeiro/*, bi, configuracoes, perfil) · `/portal/contrato`

### Menus (Sidebar)
`Dashboard` · `Clientes` · `Propostas` · `Contratos` · `Campanhas` · `Pontos de Exibição` ·
`Agenda` · `Financeiro` · `BI & Relatórios` · `Mensagens` (badge central) · `Configurações` ·
`Meu Perfil` · `Comercial → Representantes` (workspace) · `Central de Acessos` (workspace,
gate OWNER/users.view)

### Arquivos protegidos (não podem ser removidos/renomeados sem autorização)
`src/modules/crm/pages/RepresentantesPage.tsx`, `DesempenhoRepresentantesPage.tsx`,
`RepresentanteDetalhePage.tsx`, `src/services/representantesGerencia.service.ts`,
`src/hooks/usePermissoesRepresentantes.ts`, `src/modules/corporate/pages/UsuariosAcessosPage.tsx`,
`src/hooks/useCentral.ts`, `src/services/corporateUsers.service.ts`, `src/hooks/useRbac.ts`,
`src/modules/crm/components/Sidebar.tsx`, `src/App.tsx`, `src/components/auth/RouteGuards.tsx`

### Migrations protegidas (não podem ser apagadas/renomeadas)
`20260825_central_acessos_hardening` · `20260826_representantes_gestao_desempenho` ·
`20260827_player_security_hardening` · `20260828_device_identity` ·
`20260829_app_release_integrity` · `20260901_media_network_edge_auth` ·
`20260910_foundation_closure` · `20260911_close_tenant_exposure`

### Banco (objetos que o código exige)
Tabelas: `usuarios`, `perfis`, `permissoes_usuarios`, `empresa_operadora`, `auditoria_logs`,
`solicitacoes_acesso`, `representantes`, `clientes`, `propostas`, `contratos`,
`metas_representantes`, `comissoes_representantes`
RPCs: `atualizar_usuario_corporativo`, `get_my_admin_permissions`,
`listar_representantes_gerencia`, `gerenciar_representante`, `get_desempenho_representantes`,
`get_desempenho_representante_detalhe`, `reassinar_cliente_representante`,
`pode_gerenciar_representantes`
Triggers: `prevent_self_escalation`, `prevent_usuario_insert_forgery`,
`enforce_admin_permission`, `auditar_alteracao_usuario`

---

## 5. GARANTIAS VERIFICADAS EM 2026-08-18 (evidências)

| Check | Resultado |
|---|---|
| `tsc --noEmit` | ✅ limpo |
| `vite build` | ✅ OK |
| `vitest run` | ✅ 399/400 (1 timeout CLICKSIGN pré-existente) |
| `eslint .` | ⚠️ 226 erros em legado; **0 nos arquivos protegidos** |
| Probe banco (functions/policies/schema_migrations) | ✅ executado — divergências em OTHER_REGRESSIONS.md |

---

## 6. PENDÊNCIAS QUE DEVEM SER TRATADAS (registradas, não corrigidas)

1. Migrations `20260827`–`20260911` **não aplicadas** no banco (P0 `20260911` = cross-tenant).
2. `20260825` aplicada sem registro em schema_migrations.
3. Produção/CI rodam `main` (07/08) — sem nenhuma feature da baseline.
4. Duas histórias Git paralelas — convergir sem perda.
5. Erro Android `build.gradle.kts:13` — janela separada.
6. Lint legado (226) — limpeza futura.

**Toda correção depende de autorização explícita (Fase 4 — RESTAURAÇÃO CONTROLADA).**