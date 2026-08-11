# MASTER ISSUE LEDGER - SOBRE MÍDIA ERP

> [!CAUTION]
> **REGRA DE BLOQUEIO ATIVA:** O Antigravity não tem autorização lógica para encerrar a missão ou certificar uma etapa enquanto houver problemas com status `OPEN`, `IN PROGRESS` ou `AWAITING TEST`.

## DASHBOARD DE PENDÊNCIAS
- **P0 (Crítico/Bloqueante):** 1
- **P1 (Grave):** 0
- **P2 (Moderado):** 0

---

## 🔴 OPEN
*(Nenhuma pendência aberta aguardando análise primária no momento)*

---

## 🟠 IN PROGRESS

### BUG-001 | Autenticação Bloqueada na Fase 10.1-B (E2E Golden Flow)
- **ID:** BUG-001
- **CATEGORIA:** E2E INFRASTRUCTURE
- **ETAPA:** Fase 10.1-B (Prova Operacional do Golden Flow)
- **PROBLEMA:** O teste E2E real via Playwright exige um usuário com perfil `OWNER` autêntico para realizar o fluxo `OWNER LOGIN -> /workspace`. 
- **SEVERIDADE:** P0 (🟡 ENVIRONMENT BLOCKER)
- **ARQUIVO:** `scripts/provision_e2e_infra.js` (Novo)
- **CAUSA RAIZ:** Ausência de credencial de teste dedicada no ambiente de CI/Local.
- **CORREÇÃO IMPLEMENTADA (Opção B):** Script server-side seguro criado (`scripts/e2e/bootstrap-e2e.js`) para provisionar um Tenant E2E isolado e um E2E Owner, dependendo de variáveis de ambiente secretas (sem expor em logs/git).
- **STATUS:** BLOCKED / EXTERNAL ENVIRONMENT DEPENDENCY

### BUG-002 | Falso Positivo de E2E por Mocks de Autenticação (Descoberta Tardia)
- **ID:** BUG-002
- **CATEGORIA:** E2E INTEGRITY
- **ETAPA:** Fase 10.1-B
- **PROBLEMA:** O teste E2E continha interceptadores `page.route` que mascaravam a validação real de JWT, bypassando as regras RLS e o AuthContext.
- **SEVERIDADE:** P0 (🔴 REGRESSÃO / FALSO POSITIVO)
- **ARQUIVO:** `src/tests/e2e/golden_flow_operational_proof.spec.ts`
- **CAUSA RAIZ:** Código de teste implementado originalmente com mocks no lugar de navegação orgânica.
- **CORREÇÃO IMPLEMENTADA:** Mocks removidos; variáveis `TEST_USER_EMAIL` e `TEST_USER_PASSWORD` injetadas no script do Playwright para forçar Autenticação Real no Banco.
- **STATUS:** AWAITING TEST (Aguardando resolução do BUG-001 para execução real)

---

## 🟠 IN PROGRESS
*(Nenhuma pendência em andamento no momento)*

---

## 🟡 FIXED / AWAITING TEST
*(Nenhuma correção aguardando teste no momento)*

---

## 🟢 CERTIFIED (RESOLVIDO + TESTADO + REAUDITADO)
*(Registro histórico de resoluções)*
- **FIX-001:** Mapeamento unificado de `usuarios.cliente_id` -> `clientes.id` (Fase 10.1-B).
- **FIX-002:** Refatoração de `MeusPontosPage.tsx` para consultar `pi_locais` em vez de `agendamento_rede` falsa (Fase 10.1-B).
- **FIX-003:** Navegação de redirecionamento corrigida em Playwright (`**/workspace*` adicionado) (Fase 10.1-B).
