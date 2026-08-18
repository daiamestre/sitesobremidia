# Módulo Representantes — Gestão Comercial & Desempenho

> Status: **IMPLEMENTADO (código + testes) — pendente validação/execução da migration no banco**
> Projeto: `bhwsybgsyvvhqtkdqozb` · Central de Acessos: certificada 44/44 RED TEAM — **não foi reconstruída**.

## 1. Visão geral

Módulo de gestão comercial de representantes do ERP, integrado à Central de Acessos já certificada:

- **Lista/CRUD de representantes** (editar dados comerciais, ativar/desativar) — auditado.
- **Desempenho real** (nunca mock): carteira, propostas, conversão, contratos, receita mensal, ticket médio, metas, evolução mensal, ranking ordenável e drill-down individual.
- **Reatribuição de clientes** entre representantes — auditada.
- **Criação de representantes** reutiliza o fluxo oficial da Central de Acessos (NOVO ACESSO → `create-corporate-user`); o botão "Novo Representante" navega para `/workspace/usuarios`.

## 2. Regras de autorização (backend sempre manda)

| Quem | Acesso |
|---|---|
| **OWNER** | Tudo dentro do próprio tenant (implicitamente) |
| **ADMIN / GERENTE / GESTOR / SUPERVISOR** | Somente com permissão delegada via Central de Acessos (`permissoes_usuarios`) |
| **REPRESENTANTE / FINANCEIRO / DESIGNER / OPERACIONAL / CLIENTE** | Nunca gerenciam representantes |
| **Representante autenticado (área `/representantes/*`)** | Apenas os próprios dados (RLS self) |

**ADMIN ≠ OWNER**: perfil ADMIN sem delegação não acessa o módulo. Tenant sempre derivado de `auth.uid()` (nunca de payload). Cross-tenant bloqueado por RLS e RPCs.

Chaves novas (6): `representantes.view`, `representantes.edit`, `representantes.activate`, `representantes.deactivate`, `representantes.edit_clients`, `representantes.view_performance`.

## 3. Entregáveis

### Banco — `supabase/migrations/20260826_representantes_gestao_desempenho.sql`
- `get_my_admin_permissions()` **estendida** (retorna `representantes.*` p/ OWNER) — evolução, não reescrita.
- Helper `pode_gerenciar_representantes(p_permissao)` (SECURITY DEFINER, tenant via `get_user_tenant_id`).
- RLS em `representantes` substituída por versão tenant-scoped: `is_owner` OU perfil ∈ {ADMIN, GERENTE, GESTOR, SUPERVISOR} do **mesmo tenant** (a política antiga permitia ADMIN cross-tenant).
- Índices compostos: `idx_clientes_rep_created`, `idx_propostas_rep_created`, `idx_contratos_rep_created`.
- RPCs: `listar_representantes_gerencia`, `gerenciar_representante` (EDITAR/ATIVAR/DESATIVAR), `get_desempenho_representantes`, `get_desempenho_representante_detalhe`, `reassinar_cliente_representante`.
- Auditoria: toda mutação grava em `auditoria_logs` (`REPRESENTANTE_UPDATED`, `REPRESENTANTE_ACTIVATED`, `REPRESENTANTE_DEACTIVATED`, `CLIENTE_REPRESENTANTE_CHANGED`) + notificação ao representante.
- `auditoria_logs_acao_check` estendida com os novos eventos.
- REVOKE/GRANT apenas nas funções novas.

### Frontend
- `src/services/representantesGerencia.service.ts` — cliente das RPCs (tipos + 6 métodos).
- `src/hooks/usePermissoesRepresentantes.ts` — gate no frontend via `getMyPermissions()` + `isOwner`.
- `src/modules/crm/pages/RepresentantesPage.tsx` — lista com busca/filtro, editar, ativar/desativar, estado de permissão negada.
- `src/modules/crm/pages/DesempenhoRepresentantesPage.tsx` — dashboard (filtros período/representante/ordenação, KPIs, ranking real, gráfico receita, drill-down).
- `src/modules/crm/pages/RepresentanteDetalhePage.tsx` — perfil + tabs (Visão Geral, Desempenho, Clientes, Propostas, Contratos).
- `src/modules/crm/pages/ClienteDetalhePage.tsx` — dialog **Reatribuir Representante** (gated por `isOwner`/`representantes.edit_clients`).
- `src/modules/crm/components/Sidebar.tsx` — grupo **Comercial** → item **Representantes** (workspace).
- `src/services/corporateUsers.service.ts` — 6 chaves novas em `PERMISSOES_DISPONIVEIS`.
- `src/App.tsx` — rotas: `/workspace/representantes`, `/workspace/representantes/desempenho`, `/workspace/representantes/:id`; `/workspace/representantes` NÃO aponta mais para o dashboard do representante.
- `src/modules/crm/pages/RepresentativeDashboard.tsx` — mocks removidos: fallback UUID hardcoded e ranking com linhas falsas ("Representante B Alpha"); ranking agora via `getRankingComercial`.

### Testes
- `src/tests/security/representantes-gerencia.security.test.ts` — 12 cenários (OWNER, ADMIN sem/s com delegação, independência de permissões, perfis bloqueados, cross-tenant, reassign, RLS self, auditoria).
- `src/tests/unit/representantesGerencia.service.test.ts` — 10 testes do serviço (args das RPCs, null-safety, erros).

**Suite completa: 400 testes passando · `tsc --noEmit` limpo · eslint limpo · build de produção OK.**

## 4. Deploy (executar em ordem)

> ⚠️ Requer confirmação do usuário — nunca aplicar a migration sem revisar.

1. Aplicar `supabase/migrations/20260826_representantes_gestao_desempenho.sql` no projeto `bhwsybgsyvvhqtkdqozb` (CLI `supabase db push` ou painel → SQL Editor). **Requer acesso com role de serviço** — `.env` local não possui (só publishable).
2. Opcional: conceder na Central de Acessos as permissões `representantes.*` aos perfis ADMIN/GERENTE que forem operar o módulo (padrão `gerenciar_autonomia` existente).
3. Publicar o frontend (build já validado).

## 5. Gaps / pendências conhecidas

- Migration **não validada nem aplicada** contra o banco (sem service role; Docker daemon indisponível no ambiente de desenvolvimento). Bugs já corrigidos na revisão: expressão `ticket_medio` malformada (agora CASE), `COALESCE` em `pode_gerenciar_representantes`, lista de perfis da RLS limpa.
- Recomendado antes do deploy: revisar o SQL no SQL Editor do Supabase e rodar um smoke test (OWNER lê; ADMIN sem permissão 42501; ADMIN com delegação opera; rep vê só o próprio).
- Comissões/ranking global já existentes na Central não foram alterados; o ranking do módulo usa receita mensal de contratos ativos.
- `ContratoSelectionPage`, `PedidoInsercaoPage` etc. reutilizam rotas existentes — nenhuma rota do CRM de representantes foi removida.

## 6. Mapa de arquivos

| Arquivo | Papel |
|---|---|
| `supabase/migrations/20260826_representantes_gestao_desempenho.sql` | Backend (RLS, RPCs, índices, auditoria) |
| `src/services/representantesGerencia.service.ts` | Cliente frontend das RPCs |
| `src/hooks/usePermissoesRepresentantes.ts` | Permissões derivadas da Central |
| `src/modules/crm/pages/RepresentantesPage.tsx` | Gestão (lista/CRUD) |
| `src/modules/crm/pages/DesempenhoRepresentantesPage.tsx` | Dashboard de desempenho |
| `src/modules/crm/pages/RepresentanteDetalhePage.tsx` | Perfil + drill-down |
| `src/modules/crm/pages/ClienteDetalhePage.tsx` | Reatribuição de representante |
| `src/modules/crm/components/Sidebar.tsx` | Menu "Comercial → Representantes" |
| `src/services/corporateUsers.service.ts` | `PERMISSOES_DISPONIVEIS` + `getMyPermissions` |
| `src/tests/security/representantes-gerencia.security.test.ts` | Testes de segurança do módulo |
| `src/tests/unit/representantesGerencia.service.test.ts` | Testes unitários do serviço |