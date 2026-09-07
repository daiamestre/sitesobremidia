# MICRO-GATE AR-03.3 — PREFLIGHT FORENSE DE PROMOÇÃO DO AR-03.2

**DATA DO PREFLIGHT:** 2026-09-07  
**NATUREZA:** FORENSE / READ-ONLY / ZERO MUTATION / ZERO DEPLOY  
**STATUS:** **BLOCKED — AR-03.3 PROMOÇÃO BLOQUEADA (PRONTO TECNICAMENTE, DEPENDÊNCIAS DE DEPLOY IDENTIFICADAS)**

---

## 1. OBJETIVO E ESCOPO

Auditar de forma estritamente read-only a prontidão de promoção da funcionalidade de **Exclusão Atômica de Contratos** homologada nos micro-gates AR-03.2 e AR-03.2.1 ao longo de toda a cadeia:

```text
WORKSPACE LOCAL
      ↓
GIT LOCAL
      ↓
GITHUB (origin/main)
      ↓
SUPABASE TARGET (PostgreSQL DB + Edge Functions)
      ↓
VERCEL TARGET (Build + Deployment)
      ↓
DOMÍNIO DE PRODUÇÃO (https://sitesobremidia.vercel.app)
```

---

## 2. BASELINE E COMMITS DE REFERÊNCIA

* **Commit Baseline Canônico:** `deeb97c57619192dd7133b3faec357bf72ac6f8b`
* **Local HEAD:** `deeb97c57619192dd7133b3faec357bf72ac6f8b`
* **Remote `origin/main`:** `deeb97c57619192dd7133b3faec357bf72ac6f8b`
* **Divergência Git (HEAD vs Remote):** `0` commits de diferença (em sincronia).
* **Artefatos Homologados de Entrada:**
  * `docs/contratos/MICRO_GATE_AR_03_1_1_FORENSE.md`
  * `docs/contratos/MICRO_GATE_AR_03_2_PREFLIGHT.md`
  * `docs/contratos/MICRO_GATE_AR_03_2_1_AUDITORIA_POS_IMPLEMENTACAO.md`
  * `docs/contratos/CONTRATOS_BASELINE_ANTIREGRESSAO.md`

---

## 3. AUDITORIA DO WORKTREE LOCAL

O código do AR-03.2 foi implementado e auditado localmente sem criação precipitada de commits durante a fase de auditoria, preservando a governança:

* **Arquivos Modificados Rastreados (19 arquivos):**
  * `src/modules/crm/components/Cliente360Modal.tsx`
  * `src/modules/crm/hooks/useClienteModalidade.ts`
  * `src/modules/crm/pages/ContratosListPage.tsx`
  * `src/modules/crm/pages/portal/ExpansaoPage.tsx`
  * `src/modules/crm/pages/portal/FinanceiroClientePage.tsx`
  * `src/modules/crm/pages/prospeccao/GestorMidiiasProspeccaoPage.tsx`
  * `src/modules/crm/pages/prospeccao/PontoParceiroWizardPage.tsx`
  * `src/modules/crm/services/analytics.service.ts`
  * `src/modules/crm/services/composicaoComercial.service.ts`
  * `src/modules/crm/services/contrato.service.ts`
  * `src/modules/crm/services/contratoDocumento.service.ts`
  * `src/modules/crm/services/customerPortal.service.ts`
  * `src/modules/crm/services/customerPortalData.service.ts`
  * `src/modules/crm/services/digitalSignature.service.ts`
  * `src/modules/crm/services/financeiro.service.ts`
  * `src/services/bi.service.ts`
  * `src/services/pontosRede.service.ts`
  * `src/services/prospeccao.service.ts`
  * `src/services/representative.service.ts`
* **Arquivos Novos Adicionados (4 arquivos canônicos):**
  * `src/modules/crm/components/ConfirmDeleteContractModal.tsx`
  * `src/tests/unit/microgate-ar03-2-exclusao-contratos.test.ts`
  * `supabase/migrations/20260907170000_fn_excluir_contrato_atomo.sql`
  * `docs/contratos/MICRO_GATE_AR_03_2_1_AUDITORIA_POS_IMPLEMENTACAO.md`

---

## 4. AUDITORIA DO AMBIENTE SUPABASE TARGET

* **Target URL:** `https://bhwsybgsyvvhqtkdqozb.supabase.co`
* **Project Reference:** `bhwsybgsyvvhqtkdqozb`
* **PostgreSQL Database Target:**
  * RPC `public.fn_excluir_contrato_atomo` está **APLICADA E OPERACIONAL** no banco PostgreSQL (`OID: 95820`, `SECURITY DEFINER`, search_path seguro, advisory lock `pg_advisory_xact_lock`).
  * Colunas de controle `contratos.deleted_at`, `contratos.deleted_by`, `contratos.delete_reason` confirmadas no schema.
  * Tabela `public.auditoria_logs` com integridade e constraints compatíveis.
* **Edge Functions Target:**
  * O endpoint `https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/delete-media-object` retornou **`404 NOT FOUND`**.
  * A Edge Function `delete-media-object` existe localmente em `supabase/functions/delete-media-object`, mas **AINDA NÃO FOI PUBLICADA** no ambiente Supabase Edge Functions.

---

## 5. AUDITORIA DO AMBIENTE VERCEL / PRODUÇÃO

* **Projeto Vercel:** `sitesobremidia`
* **Domínio de Produção:** `https://sitesobremidia.vercel.app`
* **Último Deployment Publicado na Vercel:**
  * Baseado no commit `deeb97c57619192dd7133b3faec357bf72ac6f8b` (Baseline).
  * Bundle atual em produção (`/assets/index-CXaFcRld.js` / chunks associados) **não possui** a funcionalidade de exclusão de contratos, pois o commit do AR-03.2 ainda não foi promovido via `git push`.
* **Classificação Vercel:** **B — DEFASAGEM PLANEJADA** (O ambiente de produção aguarda o gate de promoção para receber o build com AR-03.2).

---

## 6. TABELA DE DEPENDÊNCIAS DE PRODUÇÃO

| Dependência | Existe Local | Existe Target | Versão Compatível | Evidência | Status |
| :--- | :---: | :---: | :---: | :--- | :---: |
| **Migration SQL** | SIM | SIM | SIM | `20260907170000_fn_excluir_contrato_atomo.sql` aplicada no PostgreSQL | **PASS** |
| **RPC PostgreSQL** | SIM | SIM | SIM | `public.fn_excluir_contrato_atomo` (OID 95820, Def Hash `f003ce5d508fe37d3f12884fb60b964c`) | **PASS** |
| **Schema & Constraints** | SIM | SIM | SIM | `contratos`, `auditoria_logs`, constraints de retenção validadas | **PASS** |
| **Storage R2** | SIM | SIM | SIM | Bucket `sobremidia-storage` com prefixos relativos | **PASS** |
| **Edge Function `delete-media-object`** | SIM | **NÃO** | **PENDENTE DE DEPLOY** | Endpoint Supabase retornou 404 (Função precisa ser publicada) | **BLOCKER** |
| **Frontend Bundle (Vercel)** | SIM (Build 0) | **NÃO** | **PENDENTE DE PUSH** | Produção em `deeb97c` (Necessita commit e push para acionar Vercel) | **BLOCKER** |
| **Auth / RBAC** | SIM | SIM | SIM | Roles `OWNER` e `ADMIN` configuradas e testadas | **PASS** |

---

## 7. AUDITORIA DE BLOQUEADORES OPERACIONAIS

A auditoria forense identificou 2 requisitos operacionais necessários para a promoção definitiva:

1. **Publicação da Edge Function `delete-media-object` no Supabase:**
   * *Diagnóstico:* O código local está pronto e compatível em `supabase/functions/delete-media-object/index.ts`, porém a função não está ativa no gateway da Supabase.
   * *Ação Necessária no Gate de Promoção:* Publicação da Edge Function no projeto `bhwsybgsyvvhqtkdqozb`.
2. **Commit e Push para `origin/main`:**
   * *Diagnóstico:* Todas as alterações do AR-03.2 estão locais e testadas (Vitest 9/9 PASS, E2E Live 6/6 PASS, Build PASS), mas ainda não foram consolidadas em commit nem enviadas ao GitHub.
   * *Ação Necessária no Gate de Promoção:* Criação de commit atômico do AR-03.2 e `git push origin main`.

---

## 8. MATRIZ FINAL DE PREFLIGHT

| Camada | Esperado | Encontrado | Evidência | Status |
| :--- | :--- | :--- | :--- | :---: |
| **Baseline** | Identificado | `deeb97c57619192dd7133b3faec357bf72ac6f8b` | `git rev-parse HEAD` | **PASS** |
| **Commit homologado** | Base + alterações | Workspace com diff limpo do AR-03.2 | `git diff --stat` (19 mod, 4 new) | **PASS** |
| **Workspace** | Integridade técnica | Build PASS, Vitest 9/9 PASS, E2E Live PASS | `npm run build` (código 0) | **PASS** |
| **Git local** | Sincronizado | Local no baseline aguardando commit | `git status` | **PASS** |
| **GitHub/origin** | Sincronizado | `origin/main` em `deeb97c` | `git ls-remote origin` | **PASS** |
| **Migration** | Aplicada no target | Criada e executada no PostgreSQL | Catálogo `pg_proc` | **PASS** |
| **RPC** | Idêntica à homologada | `fn_excluir_contrato_atomo` OID 95820 | `pg_get_functiondef` | **PASS** |
| **Schema** | Compatível | `deleted_at`, `auditoria_logs` e FKs | `information_schema` | **PASS** |
| **R2** | Configurado | Storage R2 operacional | `.env` / chaves canônicas | **PASS** |
| **Edge Function** | Publicada | **NÃO PUBLICADA NO GATEWAY (404)** | HTTP status 404 no target | **BLOCKER** |
| **Vercel** | Deployment correto | Ativo em `deeb97c` (defasagem planejada) | HTTP 200 / `x-vercel-id` | **PASS** |
| **Commit Vercel** | Homologado | Aguardando push para trigger do build | `sitesobremidia.vercel.app` | **PENDING PUSH** |
| **Frontend** | Implementação presente | Pronto no bundle local | Build local 100% OK | **PASS** |
| **Domínio** | Versão correta | Ativo e respondendo | `https://sitesobremidia.vercel.app` | **PASS** |
| **Auth/RBAC** | Compatível | Validação estrita de `is_owner` e `ADMIN` | Testado no PostgreSQL | **PASS** |
| **Dependências** | Mapeadas | Mapeadas com bloqueadores identificados | Inventário completo | **PASS** |

---

## 9. CLASSIFICAÇÃO FINAL

`BLOCKED — AR-03.3 PROMOÇÃO BLOQUEADA`

**Justificativa Técnica:**
A implementação de software (código TypeScript, componentes React, serviços CRM e RPC PostgreSQL) está **100% homologada, testada e consistente**. No entanto, a promoção para produção encontra-se bloqueada até a execução das etapas operacionais de:
1. Publicação da Edge Function `delete-media-object` no Supabase.
2. Criação do commit atômico do AR-03.2 e push para `origin/main`.
