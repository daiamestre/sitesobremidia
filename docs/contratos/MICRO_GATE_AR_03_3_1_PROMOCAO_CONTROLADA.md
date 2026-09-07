# MICRO-GATE AR-03.3.1 — PROMOÇÃO CONTROLADA DA EXCLUSÃO ATÔMICA DE CONTRATOS

**DATA DA PROMOÇÃO:** 2026-09-07  
**NATUREZA:** PROMOÇÃO CONTROLADA / MUTATION AUTORIZADA E ESTRITAMENTE LIMITADA  
**STATUS:** **PASS — AR-03.3.1 PROMOÇÃO CONCLUÍDA COM SUCESSO**

---

## 1. ESTADO INICIAL E RESOLUÇÃO DOS BLOCKERS HOMOLOGADOS

No Micro-Gate AR-03.3 (Preflight Forense de Promoção), foram identificados e homologados dois bloqueadores operacionais para a promoção a produção:
1. **Blocker 1 (Git/Vercel):** Implementação AR-03.2 ainda não consolidada em commit/push no Git para o repositório remoto `origin/main`.
   * **Resolução:** Commit atômico `f07f58e91a0233176b6ab4b522c55fcc20327f4b` criado e enviado para `origin/main`. Build da Vercel disparado automaticamente e ativo em `https://sitesobremidia.vercel.app`.
2. **Blocker 2 (Edge Function):** Edge Function `delete-media-object` ainda não publicada no Supabase target (`https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/delete-media-object` retornando 404).
   * **Resolução:** Edge Function publicada via Supabase CLI com sucesso. Endpoint responde `200 OK` para OPTIONS e `401 Unauthorized` para requisições sem JWT, comprovando autenticação e ativação no gateway de produção.

---

## 2. BASELINE E AUDITORIA DO WORKTREE

* **Commit Baseline Canônico:** `deeb97c57619192dd7133b3faec357bf72ac6f8b`
* **Testes Pré-Commit:**
  * `npm run build`: **PASS** (código 0, 21.73s)
  * `npx vitest run src/tests/unit/microgate-ar03-2-exclusao-contratos.test.ts`: **PASS** (9/9 testes)
* **Arquivos Incluídos no Commit Atômico (25 arquivos):**
  1. `src/modules/crm/services/contrato.service.ts`
  2. `src/modules/crm/pages/ContratosListPage.tsx`
  3. `src/modules/crm/components/ConfirmDeleteContractModal.tsx`
  4. `src/modules/crm/components/Cliente360Modal.tsx`
  5. `src/modules/crm/hooks/useClienteModalidade.ts`
  6. `src/modules/crm/pages/portal/ExpansaoPage.tsx`
  7. `src/modules/crm/pages/portal/FinanceiroClientePage.tsx`
  8. `src/modules/crm/pages/prospeccao/GestorMidiiasProspeccaoPage.tsx`
  9. `src/modules/crm/pages/prospeccao/PontoParceiroWizardPage.tsx`
  10. `src/modules/crm/services/analytics.service.ts`
  11. `src/modules/crm/services/composicaoComercial.service.ts`
  12. `src/modules/crm/services/contratoDocumento.service.ts`
  13. `src/modules/crm/services/customerPortal.service.ts`
  14. `src/modules/crm/services/customerPortalData.service.ts`
  15. `src/modules/crm/services/digitalSignature.service.ts`
  16. `src/modules/crm/services/financeiro.service.ts`
  17. `src/services/bi.service.ts`
  18. `src/services/pontosRede.service.ts`
  19. `src/services/prospeccao.service.ts`
  20. `src/services/representative.service.ts`
  21. `src/tests/unit/microgate-ar03-2-exclusao-contratos.test.ts`
  22. `supabase/migrations/20260907170000_fn_excluir_contrato_atomo.sql`
  23. `docs/contratos/MICRO_GATE_AR_03_2_PREFLIGHT.md`
  24. `docs/contratos/MICRO_GATE_AR_03_2_1_AUDITORIA_POS_IMPLEMENTACAO.md`
  25. `docs/contratos/MICRO_GATE_AR_03_3_PREFLIGHT_PROMOCAO.md`

---

## 3. PROMOÇÃO GIT & GITHUB

* **Commit Criado:** `f07f58e91a0233176b6ab4b522c55fcc20327f4b`
* **Mensagem:** `feat(contratos): promover exclusão atômica com soft delete`
* **Parent:** `deeb97c57619192dd7133b3faec357bf72ac6f8b`
* **Push:** Executado com sucesso para `https://github.com/daiamestre/sitesobremidia.git` (`origin/main`).
* **Validação Remote:** `git ls-remote origin main` confirmou `f07f58e91a0233176b6ab4b522c55fcc20327f4b`.

---

## 4. DEPLOYMENT VERCEL (FRONTEND DE PRODUÇÃO)

* **Disparo Automático:** O push do commit `f07f58e` para `main` acionou o build e deploy na Vercel.
* **Domínio de Produção:** `https://sitesobremidia.vercel.app`
* **Validação Forense no Bundle Publicado:**
  * Asset principal: `/assets/index-CVFClQS2.js` (Novo bundle publicado)
  * Chunk de contratos: `ContratosListPage-DG1532wo.js`
  * String `Excluir Contrato` comprovadamente presente no chunk de contratos.
  * String `fn_excluir_contrato_atomo` comprovadamente presente no chunk `contrato.service-CmX3pKNB.js`.
  * Status HTTP: `200 OK`.

---

## 5. SUPABASE TARGET (POSTGRESQL DB & EDGE FUNCTIONS)

* **PostgreSQL Database:**
  * RPC `public.fn_excluir_contrato_atomo`: **OPERACIONAL E ATIVA** (`OID: 95820`, `SECURITY DEFINER`).
  * Colunas de controle `contratos.deleted_at`, `contratos.deleted_by`, `contratos.delete_reason`: **ATIVAS**.
  * Tabela `public.auditoria_logs`: **INTEGRA**.
* **Edge Function `delete-media-object`:**
  * Publicada no projeto Supabase `bhwsybgsyvvhqtkdqozb`.
  * Endpoint ativo: `https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/delete-media-object`.
  * Validação OPTIONS: `200 OK`.
  * Validação POST sem JWT: `401 Unauthorized` (Validação de segurança JWT ativa no gateway).
  * Secrets R2 configurados no servidor Supabase (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`).

---

## 6. MATRIZ FINAL DE PROMOÇÃO

| Item | Esperado | Resultado | Evidência | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Worktree** | Escopo AR-03.2 | 25 arquivos consolidados | `git diff --cached --stat` | **PASS** |
| **Diff** | Homologado | Idêntico ao AR-03.2.1 | `git log -1 --stat` | **PASS** |
| **Build** | PASS | Código 0 (21.73s) | Log `npm run build` | **PASS** |
| **Testes** | PASS | 9/9 Vitest PASS | `microgate-ar03-2-exclusao-contratos.test.ts` | **PASS** |
| **Commit** | Criado | `f07f58e91a0233176b6ab4b522c55fcc20327f4b` | `git rev-parse HEAD` | **PASS** |
| **Push** | origin/main | Concluído com sucesso | `git ls-remote origin main` | **PASS** |
| **Migration** | Já aplicada | Ativa no PostgreSQL | Catálogo `pg_proc` | **PASS** |
| **RPC** | Preservada | `fn_excluir_contrato_atomo` OID 95820 | Consulta no PostgreSQL | **PASS** |
| **Edge Function** | Publicada | Publicada no projeto `bhwsybgsyvvhqtkdqozb` | HTTP 200 OPTIONS / 401 JWT | **PASS** |
| **R2 secrets** | Server-side | Isolados e configurados no servidor | Supabase secrets list | **PASS** |
| **Vercel** | Novo deployment | Ativo e respondendo | `x-vercel-id: gru1::...` | **PASS** |
| **Commit Vercel** | Igual ao homologado | `f07f58e` publicado | Chunks `ContratosListPage-DG1532wo.js` | **PASS** |
| **Domínio** | Novo deployment ativo | `https://sitesobremidia.vercel.app` | HTTP 200 / Bundle novo | **PASS** |

---

## 7. CLASSIFICAÇÃO FINAL

`PASS — AR-03.3.1 PROMOÇÃO CONCLUÍDA`
