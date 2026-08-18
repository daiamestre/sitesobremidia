# PROTECTED FEATURES

> **Funcionalidades protegidas do SOBRE MÍDIA ERP.**
> Regra PERMANENTE: nenhuma fase futura pode remover, renomear, ocultar ou desativar qualquer item abaixo
> (menu, rota, componente, hook, service, permissão, migration ou integração) sem autorização explícita
> e sem passar por: baseline → alteração controlada → build + testes + regression audit.
> Qualquer remoção faz o BUILD/TESTE FALHAR (ver `REGRESSION_MATRIX.md` e testes de regressão).
> Baseline de referência: commit **`0671f90`** (2026-08-17).

---

## OWNER — Workspace Corporativo

| Funcionalidade | Rota | Referência |
|---|---|---|
| Dashboard do OWNER | `/workspace/corporate` | `CorporateCommandCenter.tsx` |
| **Representantes — gestão** (lista, cadastro, ativação/desativação, reatribuição de clientes) | `/workspace/representantes` | `RepresentantesPage.tsx` |
| **Representantes — ranking** | `/workspace/representantes/desempenho` | `DesempenhoRepresentantesPage.tsx` |
| **Representantes — desempenho por representante** | `/workspace/representantes/:id` | `RepresentanteDetalhePage.tsx` |
| Central de Acessos — Usuários | `/workspace/usuarios` | `UsuariosAcessosPage.tsx` |

## CENTRAL DE ACESSOS

| Funcionalidade | Rota / RPC | Referência |
|---|---|---|
| Usuários (listagem, indicadores) | `/workspace/usuarios` | `UsuariosAcessosPage.tsx` |
| Perfis (ADMIN, FINANCEIRO, GERENTE, REPRESENTANTE, OWNER) | banco | migration 20260817+ |
| Permissões granulares (`users.*`, `representantes.*`) | `get_my_admin_permissions` | migration 20260824/25/26 |
| RBAC (roles + permissões delegadas) | `useRbac.ts`, `usePermissoesRepresentantes.ts` | — |
| RLS + RPCs SECURITY DEFINER | banco | migrations 20260817–20260826 |
| Auditoria (`auditoria_logs`) | banco | migration 20260822+ |
| Delegação de autonomia | `gerenciar_autonomia` | migration 20260824 |
| Proteção da conta OWNER | banco (trigger) | migration 20260824 |

## CENTRAL (Comunicação) — painel legado

| Funcionalidade | Rota | Referência |
|---|---|---|
| Central de comunicação (mensagens/notificações) | `/dashboard/central` (4 contextos) | `CentralDashboard.tsx` |
| Badge de não lidas | — | `useCentralUnread` (`useCentral.ts`) |

## Módulos de negócio (rotas — nunca remover)

`/workspace/*` e `/representantes/*`: dashboard, clientes, propostas, contratos, campanhas, screens (pontos de exibição), agenda, financeiro, BI & relatórios, configurações, perfil, mensagens (central), Portal do cliente, NOC, player, produção, agendamento.

## Serviços e hooks protegidos

| Item | Referência |
|---|---|
| `representantesGerencia.service.ts` | RPCs de gestão/desempenho |
| `usePermissoesRepresentantes.ts` | permissões `representantes.*` |
| `corporateUsers.service.ts` | `getMyPermissions` → `get_my_admin_permissions` |
| `useCentral.ts` | `useCentralUnread` |

## Migrations protegidas (não remover, não renomear, não editar ordem)

`20260817` → `20260824` (Central de Acessos), `20260825` (hardening), `20260826` (representantes), `20260827` (player), `20260828` (device identity), `20260829` (app release), `20260901` (media edge), `20260910` (foundation closure), `20260911` (close tenant exposure — **P0, pendente de aplicação**).

## RPCs protegidas (banco)

`get_my_admin_permissions`, `listar_usuarios_central`, `get_central_acessos_dashboard`, `gerenciar_autonomia`, `get_user_tenant_id`, `listar_representantes_gerencia`, `gerenciar_representante`, `get_desempenho_representantes`, `get_desempenho_representante_detalhe`, `reassinar_cliente_representante`, `has_admin_permission`, `enforce_admin_permission`.

---

*Manter este documento atualizado a cada fase. Qualquer alteração de menu/rota/permisão/migration deve adicionar linha à matriz de regressão e atualizar os testes de existência.*