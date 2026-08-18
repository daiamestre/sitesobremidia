# RELATÓRIO FINAL — CENTRAL DE ACESSOS CORPORATIVOS (IAM/RBAC)

**Projeto:** SOBRE MÍDIA ERP — Central Corporativa de Acessos
**Escopo:** Auditoria de segurança, hardening RLS/triggers, red team em banco real, adequação de frontend, testes e evidências — 2º ciclo (CERTIFICAÇÃO).
**Ambiente auditado:** Supabase real `bhwsybgsyvvhqtkdqozb`
**Data:** 2026-08-17
**Base:** commit `9140448` (Central de Acessos) + `e8eb64e` (billing/tests)

---

## 1. RESUMO EXECUTIVO

A Central de Acessos foi construída sobre um modelo sólido (OWNER com autonomia total,
ADMIN com permissões granulares delegadas, RLS tenant-scoped), porém a auditoria encontrou
**13 falhas de segurança (F1–F13)** que permitiam escalada de privilégio, vazamento
cross-tenant, forja de auditoria e aprovação de cadastros sem autorização forte. Todas
foram corrigidas via a migration `20260825_central_acessos_hardening.sql` (11 seções,
aplicada ao banco real) e validadas por **Red Team com 44/44 testes aprovados** contra o
banco real.

**Ciclo de certificação (2º):** re-auditoria do banco real como fonte de verdade (policies,
triggers e RPCs conferidos via `pg_policies`/`pg_trigger`), auditoria completa do fluxo de
**Solicitações de Acesso** (`solicitacoes_acesso` + edge `handle-approval`), correção de
**3 novos gaps (F11–F13)** sem quebrar o auto-cadastro, edge function redeployada, e
validação final: **44/44 red team**, **378/378 testes**, **build + typecheck limpos**.

**Resultado:** OWNER possui autonomia total sobre o próprio tenant; nenhum outro papel —
incluindo ADMIN — consegue promover/destituir OWNER, reativar a própria conta desativada,
ler dados de outros tenants, forjar auditoria ou atribuir perfil ADMIN sem delegação.
Solicitações de acesso são decisíveis apenas por OWNER/ADMIN do próprio tenant (painel) ou
via token de uso único validado no servidor (edge/RPC).

---

## 2. GAPS ENCONTRADOS (F1–F10) E CORREÇÕES

| # | Falha | Gravidade | Correção aplicada |
|---|-------|-----------|-------------------|
| F1 | ADMIN podia auto-promover (e promover terceiros) a OWNER via `UPDATE usuarios` | **Crítica** | Trigger `prevent_self_escalation`: transição `is_owner=false→true` só via bootstrap (nenhum OWNER no tenant) ou pelo próprio OWNER. Proteção do OWNER contra terceiros mantida. |
| F2 | Usuário desativado podia reativar a própria conta (`ativo`/`status`) | **Crítica** | Mesmo trigger: self-update não altera `ativo`, `status`, `perfil_id` nem `empresa_operadora_id`. |
| F3 | `INSERT` forjado em `usuarios` (id=auth.uid() com perfil/tenant arbitrários, sem trigger) | **Crítica** | Policy `usuarios_insert_policy` restrita a OWNER/ADMIN do mesmo tenant + trigger `prevent_usuario_insert_forgery` (valida tenant, is_owner, perfil OWNER/ADMIN). Criação real passa por edge/RPC SECURITY DEFINER. |
| F4 | RLS legado `p_usuarios_self_or_admin` (SELECT) e `p_write_usuarios_admin_owner` (FOR ALL) permitiam acesso cross-tenant em `usuarios` | **Crítica** | Policies dropadas; novas policies tenant-scoped (self ou OWNER/ADMIN do próprio tenant). |
| F5 | `p_representantes_self_or_admin` (FOR ALL) cross-tenant | **Alta** | Dropada; `rep_select/insert/update/delete_tenant` com tenant obrigatório. |
| F6 | `p_admin_all` (FOR ALL) e `empresa_operadora_select_policy` permitiam a qualquer owner/usuário ler **todas** as empresas | **Crítica** | Dropadas; `eo_select_tenant` (somente o próprio tenant) e `eo_update_owner` (somente OWNER do tenant). INSERT/DELETE bloqueados. |
| F7 | `auditoria_logs`: SELECT sem tenant (vazamento) e INSERT sem validação de tenant (forja) | **Alta** | `audit_insert_policy` exige `usuario_id = auth.uid()` + tenant do chamador; `audit_select_policy` tenant-scoped (próprio ou ADMIN/GERENTE/OWNER do tenant). |
| F8 | Perfil ADMIN atribuível via UPDATE sem `users.create_admin`; perfil OWNER atribuível via `perfil_id` | **Alta** | Trigger `enforce_admin_permission`: edição de terceiros exige `users.edit`; status exige `users.activate/deactivate`; perfil ADMIN exige `users.create_admin`; perfil OWNER nunca atribuível. |
| F9 | Auditoria era gravada pelo cliente (forjável) | **Alta** | Trigger `auditar_alteracao_usuario` (AFTER UPDATE) grava trilha server-side (`USER_ROLE_CHANGED`, `USER_ACTIVATED`, `USER_DEACTIVATED`, `STATUS_CHANGE`, `USER_UPDATED`) com autor/tenant reais. Cliente não grava mais em `auditoria_logs`. |
| F10 | Self-update podia trocar `empresa_operadora_id` (migração de tenant) | **Alta** | Bloqueado no `prevent_self_escalation` (USING + WITH CHECK das policies também exigem tenant do chamador). |

**Gap adicional encontrado durante o red team:** `empresa_operadora_select_policy` (legada,
pré-existente às migrations da Central) permitia a qualquer usuário registrado ler
`empresa_operadora` de **todos** os tenants. Removida na seção 7 da migration.

### Gaps do 2º ciclo (F11–F13) — fluxo de Solicitações de Acesso

| # | Falha | Gravidade | Correção aplicada (seção 11) |
|---|-------|-----------|------------------------------|
| F11 | Edge `handle-approval` decidia com service role **sem exigir token** (`if (rawToken)` opcional) — qualquer chamador com a URL poderia aprovar/rejeitar | **Crítica** | Token **obrigatório** (400/403), validação server-side de uso único/expiração/hash, guard anti-race (`status='PENDING'` + `approval_used_at IS NULL`), modo JSON para chamadas programáticas. Redeployada no projeto real. |
| F12 | RLS de `solicitacoes_acesso`: `p_admin_solicitacoes` (ALL) sem tenant check (ADMIN de qualquer tenant lia/alterava/excluía tudo) e `p_insert_solicitacao` `WITH CHECK (true)` (INSERT forjado, inclusive anon com status APPROVED) | **Alta** | Policies substituídas: SELECT própria ou OWNER/ADMIN do **próprio tenant**; INSERT estrito (anon/authenticated) exigindo `status='PENDING'` + token + expiração e proibindo campos de decisão (approval_used_at/approved_*/rejected_* nulos); UPDATE somente OWNER/ADMIN do mesmo tenant em PENDING; **DELETE sem policy** (REST bloqueado). Órfãs (tenant NULL) visíveis apenas via RPC com token. |
| F13 | Trigger de auditoria `handle_solicitacao_update` nunca foi anexado a `solicitacoes_acesso` (estava em `solicitacoes` antiga) e `approved_by` vinha do payload do cliente | **Alta** | Trigger `trg_solicitacao_status` anexado (audita `STATUS_CHANGE` em `auditoria_logs`, autor via `auth.uid()` com fallback para `approved_by`/`rejected_by`); novo trigger `solicitacao_decisao_autor` força `approved_by`/`rejected_by := auth.uid()` no servidor. Removido trigger quebrado `trg_solicitacoes_acesso_updated_at` (referenciava `NEW.version`, coluna inexistente → erro 42703 em qualquer UPDATE). |
| F13b | RPC `get_solicitacao_aprovacao` (leitura por token, sem login) — valida hash + uso único + expiração no servidor | — | Criado (SECURITY DEFINER, `GRANT` a anon/authenticated); corrigido erro 42702 (coluna ambígua) e 42804 (varchar→text) durante validação. |
| F13c | Auto-cadastro anon quebrado pelo RETURNING do INSERT (anon não tem policy SELECT) | — | `createRequest` agora gera `id` no cliente e insere sem `.select()` (RETURNING); notificação cosmética `email_admin_enviado` só quando há sessão. |

---

## 3. MIGRATION APLICADA

**Arquivo:** `supabase/migrations/20260825_central_acessos_hardening.sql` (idempotente)

Seções:
1. Drop de policies legadas cross-tenant (F4/F5/F6)
2. Policies tenant-scoped em `usuarios` (INSERT/UPDATE — F3/F10)
3. Trigger `prevent_usuario_insert_forgery` (F3)
4. Trigger `prevent_self_escalation` (F1/F2/F10)
5. Trigger `enforce_admin_permission` (F8)
6. Policies tenant-scoped em `representantes` (F5)
7. Policies tenant-scoped em `empresa_operadora` (F6)
8. Policies tenant-scoped em `auditoria_logs` (F7)
9. Trigger `auditar_alteracao_usuario` (F9)
10. RPC `atualizar_usuario_corporativo` (edição segura: OWNER ou ADMIN+users.edit; perfil ADMIN exige users.create_admin; conta OWNER imutável; alvo ≠ chamador; mesmo tenant)
11. Hardening de `solicitacoes_acesso` (F11/F12/F13): RLS tenant-scoped + INSERT estrito + UPDATE OWNER/ADMIN do tenant + DELETE bloqueado; triggers `solicitacao_decisao_autor` e `trg_solicitacao_status`; RPC `get_solicitacao_aprovacao`; drop do trigger quebrado `trg_solicitacoes_acesso_updated_at`

**Nota de design:** os triggers validam somente sessões de usuário (`auth.uid()` não nulo).
Contextos administrativos (SQL editor, service role, migrations) não possuem JWT e são
considerados confiáveis — preserva manutenção via SQL sem abrir brecha para clientes.

**Aplicação:** via Management API (projeto real) usando `scripts/apply_central_hardening.cjs`
(divisor por seções). Todas as 11 seções → HTTP 201 (reaplicações idempotentes OK).

---

## 4. RED TEAM — RESULTADO 44/44 PASS (BANCO REAL)

Script: `scripts/redteam_central.cjs` (resultados em `scripts/redteam_results.json`).
Ambiente: 2 tenants reais (A/B), OWNER/ADMIN/REPRESENTANTE por tenant, sessões autenticadas
via anon key, ataques via REST/RPC com tokens de usuário, edge functions testadas via HTTP
real, cleanup automático (usuários e solicitações `rt-*`).

### Ataques bloqueados (30)
| ID | Tentativa | Resultado |
|----|-----------|-----------|
| ATK-1 | ADMIN auto-promove para OWNER | 403 (42501) |
| ATK-2 | ADMIN promove terceiro a OWNER | 403 |
| ATK-3 | Desativado reativa a própria conta | 403 |
| ATK-4 | INSERT forjado (perfil ADMIN/tenant B/is_owner) | 403 (42501) |
| ATK-5 | Admin A lê usuários do tenant B | 0 linhas |
| ATK-6 | Admin A lê representantes do tenant B | 0 linhas |
| ATK-7 | Admin A lê empresa_operadora do tenant B | 0 linhas |
| ATK-8 | Admin A lê auditoria do tenant B | 0 linhas |
| ATK-9 | RepA muda o próprio perfil para ADMIN | 403 |
| ATK-10 | RepA troca o próprio tenant | 403 |
| ATK-11 | INSERT forjado de auditoria (tenant B) | 403 (RLS) |
| ATK-12 | RepA lê permissões de terceiros | 0 linhas |
| ATK-13 | RepA altera perfil de outro usuário | bloqueado (0 linhas) |
| ATK-14 | ADMIN destitui o OWNER | 400 (42501) |
| ATK-15 | Admin B altera usuário do tenant A | 0 linhas |
| ATK-16 | OwnerA edita OwnerB via RPC (cross-tenant) | 403 (42501) |
| ATK-17 | RepA cria usuário via RPC | 403 |
| ATK-18 | AdminA edita via RPC sem users.edit | 403 |
| ATK-19 | AdminA cria ADMIN sem users.create_admin | 403 |
| ATK-20 | AdminA desativa sem users.deactivate | 403 |
| ATK-21 | Criação via RPC sem perfil | 400 (22023) |
| ATK-22 | AdminB deleta representante do tenant A | 0 linhas |
| ATK-23 | AdminB insere representante no tenant A | bloqueado |
| ATK-24 | AdminB deleta usuário do tenant A | 0 linhas |
| ATK-25 | Usuário sem registro insere a própria linha com tenant A/ADMIN | 403 (42501, trigger) |
| ATK-26 | AdminB decide solicitação do tenant A | 0 linhas (RLS) |
| ATK-27 | DELETE de solicitação via REST | 0 linhas (sem policy) |
| ATK-28 | Anon insere solicitação forjada APPROVED | 401 (42501, WITH CHECK) |
| ATK-29 | INSERT solicitação com approved_by forjado | 403 (42501, WITH CHECK) |
| ATK-30 | AdminA auto-concede permissão (self-grant) | 403 (42501) |

### Fluxos legítimos (6) — confirmam autonomia do OWNER e fluxo de solicitações
| ID | Fluxo | Resultado |
|----|-------|-----------|
| POS-1 | OwnerA desativa RepA | sucesso |
| POS-2 | OwnerA reativa RepA | sucesso |
| POS-3 | OwnerA edita RepA via RPC `atualizar_usuario_corporativo` | sucesso (nome/telefone persistidos) |
| POS-4 | OwnerA cria REPRESENTANTE via RPC | sucesso |
| POS-5 | Fluxo legítimo: anon insere solicitação PENDING (auto-cadastro) + RPC `get_solicitacao_aprovacao` valida token | 201 + 200 PENDING |
| POS-6 | OwnerA rejeita solicitação PENDING do próprio tenant via REST | sucesso (1 linha) |

### Verificações pós-fato (8)
| ID | Verificação | Resultado |
|----|-------------|-----------|
| V-1 | Auditoria server-side gerada (USER_ACTIVATED/DEACTIVATED/UPDATED com autor correto) | 5 registros |
| V-2 | Nenhum registro forjado no tenant B | 0 |
| V-3 | Integridade do estado do alvo após ataques | íntegro |
| V-4 | Novo usuário criado com perfil + representante correto | OK |
| V-5 | RPC rejeita token inválido | 401 (42501) |
| V-6 | RPC rejeita token já consumido | rejeitado |
| V-7 | Auditoria server-side da decisão de solicitação (STATUS_CHANGE) | registrada |
| V-8 | Edge `handle-approval` rejeita decisão sem token | 403 (deployada com correção) |

---

## 5. AJUSTES DE FRONTEND

1. **`src/services/corporateUsers.service.ts`**
   - Removida a gravação client-side em `auditoria_logs` no `atualizarStatusUsuario`
     (F9 — agora exclusiva do trigger server-side).
   - Adicionado `atualizarUsuario()` chamando a RPC `atualizar_usuario_corporativo`
     (F1/F8/F10 — validação autoritativa no banco).
2. **`src/modules/corporate/pages/UsuariosAcessosPage.tsx`**
   - Nova ação **"Editar"** por usuário (visível com `users.edit` ou OWNER): dialog com
     nome, telefone e perfil (lista restrita por `perfisPermitidos` — sem OWNER, ADMIN
     condicionado a `users.create_admin`). Ações de OWNER permanecem ocultas (protegido).
3. **`src/services/accessRequest.service.ts`** (2º ciclo — F12/F13)
   - `hashToken` exportado (reuso na página de aprovação).
   - `createRequest` gera `id` no cliente e insere **sem RETURNING** (anon não possui
     policy SELECT — o INSERT legítimo de auto-cadastro voltou a funcionar).
   - Marcador cosmético `email_admin_enviado` só é gravado quando há sessão.
4. **`src/pages/admin/AdminSolicitacaoAprovacao.tsx`** (2º ciclo — F11/F12/F13)
   - Com token (link de e-mail): leitura via RPC `get_solicitacao_aprovacao` (validação
     server-side de hash/uso único/expiração, **sem exigir login**) e decisão via edge
     `handle-approval` (JSON mode); erros de token mapeados para a UI.
   - Sem token (painel): comportamento anterior, restrito por RLS ao próprio tenant.
5. **`supabase/functions/handle-approval/index.ts`** (2º ciclo — F11)
   - Token **obrigatório**; validação server-side (uso único, expiração, hash SHA-256);
     guard anti-race no UPDATE (`status='PENDING'` + `approval_used_at IS NULL`);
     modo JSON (`format=json`) para chamadas programáticas; CORS mantido.
     **Redeployada** no projeto real via `supabase functions deploy` (CLI com PAT).

---

## 6. TESTES

- **`src/tests/security/central-acessos.security.test.ts`** (8 testes): contratos de
  segurança do service — criação via edge function (sem INSERT direto em `usuarios`),
  cliente não grava em `auditoria_logs`, edição via RPC (nunca UPDATE direto com perfil),
  leituras via RPC tenant-scoped. **8/8 PASS.**
- **Suíte completa:** `npm run test` → **378/378 PASS** (inclui os 2 testes
  `SignatureProviderAdapter` que eram flaky sob paralelismo).
- **Build:** `npm run build` → OK (vite, PWA injectManifest, 220 entries).
- **Lint:** nenhum erro novo nos arquivos alterados (224 erros pré-existentes de
  `no-explicit-any` no restante do codebase; `accessRequest.service.ts` mantém 5 `any`
  pré-existentes, sem alteração).
- **Typecheck:** `npx tsc --noEmit` — limpo.

---

## 7. CERTIFICAÇÃO — RESULTADO FINAL

| Critério | Status |
|----------|--------|
| Auditoria do banco real (policies/triggers/RPCs) | ✅ Concluída (fonte de verdade) |
| Auditoria do fluxo de Solicitações de Acesso | ✅ Concluída (frontend + edge + RLS) |
| Gaps F1–F13 corrigidos e aplicados ao banco real | ✅ 11 seções, idempotentes (HTTP 201) |
| Red Team expandido no banco real | ✅ **44/44** (30 ataques bloqueados, 6 fluxos legítimos, 8 verificações) |
| Edge `handle-approval` corrigida e redeployada | ✅ 403 sem token (V-8) |
| Autonomia do OWNER dentro do próprio tenant | ✅ POS-1..POS-6 |
| Isolamento multi-tenant (sem vazamento) | ✅ ATK-5..ATK-8, ATK-15, ATK-22..ATK-26 |
| Escalada de privilégio | ✅ ATK-1..ATK-4, ATK-9, ATK-13, ATK-14, ATK-30 |
| Forja (INSERT/auditoria/solicitações) | ✅ ATK-4, ATK-11, ATK-25, ATK-28, ATK-29 |
| Sem quebra do ERP (build/tsc/lint/suíte) | ✅ build OK, tsc OK, lint sem novos, **378/378 testes** |
| Limpeza de dados de teste | ✅ usuários e solicitações `rt-*` removidos (cleanup automático) |

## 7.1 ESTADO FINAL DA AUTONOMIA DO OWNER

| Capacidade | OWNER | ADMIN (sem delegação) | ADMIN (com permissões) | REPRESENTANTE |
|------------|-------|------------------------|------------------------|---------------|
| Ver Central de Acessos | ✅ | ❌ (requer `users.view`) | ✅ | ❌ |
| Criar usuários | ✅ | ❌ (requer `users.create`) | ✅ (ADMIN exige `users.create_admin`) | ❌ |
| Editar dados/perfil | ✅ | ❌ (requer `users.edit`) | ✅ (ADMIN exige `users.create_admin`) | ❌ |
| Ativar/Desativar | ✅ | ❌ (requer `users.activate/deactivate`) | ✅ | ❌ |
| Gerenciar autonomia | ✅ | ❌ | ✅ (`users.manage_permissions`, só o que possui) | ❌ |
| Promover/destituir OWNER | ✅ | ❌ (sempre) | ❌ | ❌ |
| Self-update de ativo/status/perfil/tenant | ❌ (bloqueado por design) | ❌ | ❌ | ❌ |
| Ler dados de outros tenants | ❌ | ❌ | ❌ | ❌ |

---

## 8. RECOMENDAÇÕES REMANESCENTES

1. **E2E automatizado do fluxo de edição e de solicitações:** estender
   `src/tests/e2e/central_acessos.spec.ts` com o botão "Editar" e com o fluxo completo
   signup → e-mail → aprovação por token (edge).
2. **Gap funcional conhecido (não é falha de segurança):** conta OWNER não possui UI de
   edição própria (RPC bloqueia `p_alvo_id = v_caller` — por design, edição via "Meu Perfil"
   futura). Reativar flags exige cuidado com `prevent_self_escalation` (bootstrap).
3. **Revisão periódica de policies:** incluir `pg_policies` no pipeline de CI para impedir
   regressão de policies legadas (como a `empresa_operadora_select_policy` e a
   `p_admin_solicitacoes`).
4. **Deploy de edge functions em pipeline:** `handle-approval` foi redeployada manualmente;
   adicionar `supabase functions deploy` no CI para manter o código do repositório sempre
   alinhado ao ambiente real.
5. **Limpeza de dados de teste:** usuários `rt-*` e solicitações `rt-sol-*` são removidos
   automaticamente pelo cleanup do red team; usuários `e2e-*` continuam no banco real
   conforme padrão da suíte E2E existente.

---

## 9. ARQUIVOS DA ENTREGA

| Arquivo | Papel |
|---------|-------|
| `supabase/migrations/20260825_central_acessos_hardening.sql` | Migration de hardening (11 seções, idempotente) — aplicada ao banco real |
| `scripts/apply_central_hardening.cjs` | Aplicador da migration por seções via Management API |
| `scripts/redteam_central.cjs` | Suíte de red team (setup/30 ataques/6 positivos/8 verificações/cleanup) |
| `scripts/redteam_results.json` | Evidência da execução (44/44 PASS) |
| `scripts/db_audit_solicitacao.cjs`, `scripts/db_audit_full.cjs` | Re-auditoria do banco real (policies/triggers/colunas) |
| `supabase/functions/handle-approval/index.ts` | Edge de aprovação corrigida (token obrigatório, JSON mode) — **redeployada** |
| `src/tests/security/central-acessos.security.test.ts` | Testes de segurança dos contratos do service |
| `src/services/corporateUsers.service.ts` | Service atualizado (sem auditoria client-side; RPC de edição) |
| `src/modules/corporate/pages/UsuariosAcessosPage.tsx` | Ação "Editar" com validação de perfis permitidos |
| `src/services/accessRequest.service.ts` | Auto-cadastro anon corrigido (id no cliente, sem RETURNING) |
| `src/pages/admin/AdminSolicitacaoAprovacao.tsx` | Página de aprovação via token (RPC + edge) sem exigir login |