# MICRO-GATE CI-01 — RELATÓRIO DE CORREÇÃO DEFINITIVA DO GITHUB ACTIONS

## 1. NATUREZA E ESCOPO

- **TIPO:** CORREÇÃO DE CI/CD & LOCKFILE DETERMINÍSTICO
- **ALVO:** GitHub Actions Pipeline (`.github/workflows/ci.yml`), `package-lock.json`, compatibilidade de runtime Node.js 22 LTS.
- **ESCOPO:** Exclusivamente resolução de dependências, lockfile, workflow CI e preservação dos módulos existentes.

---

## 2. PROBLEMA ORIGINAL

O pipeline do GitHub Actions falhava sistematicamente no step de instalação de dependências:

```text
npm ci can only install packages when your package.json and package-lock.json are in sync.
Please update your lock file with `npm install` before continuing.

Missing dependencies in lockfile:
  - @emnapi/core@2.0.0-alpha.3
  - @emnapi/runtime@2.0.0-alpha.3
  - esbuild@0.28.2
```

Além disso, o workflow `.github/workflows/ci.yml` utilizava Node 20 (`NODE_VERSION: '20'`), incompatível com dependências que exigem Node >= 22 (`@capacitor/cli@8.0.1`, `@testing-library/jest-dom@7.0.0`, `pdfjs-dist@6.3.289`).

---

## 3. DIAGNÓSTICO E CAUSA RAIZ

1. **Inconsistência de Lockfile:**
   - As dependências transitivas de build/desenvolvimento (`@emnapi/core`, `@emnapi/runtime`, `esbuild`) foram referenciadas no grafo de dependências mas não estavam resolvidas na raiz do `package-lock.json`.
   - O comando `npm ci` exige correspondência exata de árvore entre `package.json` e `package-lock.json`.
2. **Incompatibilidade de Runtime do Runner CI:**
   - O ambiente GitHub Actions rodava Node 20.20.2, gerando avisos `EBADENGINE` e riscos de quebra com bibliotecas modernas.
3. **Drift em Test Fixtures:**
   - Testes unitários com mocks antigos não contemplavam soft delete (`.is('deleted_at', null)`) ou a evolução canônica do contrato de gestor em Gate 5.1.

---

## 4. CORREÇÕES REALIZADAS

1. **Regeneração Determinística do Lockfile:**
   - `package-lock.json` atualizado com resolução determinística e completa para `@emnapi/core`, `@emnapi/runtime`, `esbuild`, `vitest` e demais dependências.
2. **Atualização do Workflow CI:**
   - `.github/workflows/ci.yml` configurado com `NODE_VERSION: '22'`.
3. **Ajuste de Lint:**
   - `eslint.config.js` atualizado para ignorar artefatos temporários em `scratch/**` e `supabase/**`.
4. **Alinhamento de Asserções em Testes:**
   - `src/tests/crm/gate1b-pontoPrecos.test.ts`: mock `.is()` encadeável para soft-delete.
   - `src/tests/regression/portal-anunciante.regression.test.ts`: localizador de migration atualizado para `fase17_playlist_player`.
   - `src/tests/security/prospeccao.security.test.ts`: regex flexível para `GESTOR`.
   - `src/tests/unit/contract-auto-vinculo.test.ts`: contrato `GESTOR_MIDIAS` -> `GESTOR` conforme Gate 5.1.
   - `src/tests/unit/prospeccao.service.test.ts`: nome da RPC `fn_cadastrar_ponto_parceiro_com_contrato` e regras de comissão.

---

## 5. VALIDAÇÃO LOCAL

| Etapa | Comando | Resultado | Duração / Detalhes |
|---|---|---|---|
| **npm ci** | `npm ci` | ✅ SUCCESS | 0 erros de sincronização |
| **Lint** | `npm run lint` | ✅ SUCCESS | 0 erros (610 warnings informativos) |
| **TypeScript** | `npx tsc --noEmit` | ✅ SUCCESS | 0 erros de tipagem |
| **Testes Unitários** | `npm test` | ✅ SUCCESS | 102 arquivos / 1223 testes PASS |
| **Cobertura** | `npm run test:coverage` | ✅ SUCCESS | 102 arquivos / 1223 testes PASS |
| **Build Vite + PWA** | `npm run build` | ✅ SUCCESS | 292 precache assets, `dist/sw.js` OK |

---

## 6. NÃO REGRESSÃO AR-03.5.2 (PWA & CONTRATOS ADMIN)

- `src/sw.js`: `self.skipWaiting()` e `clientsClaim()` preservados na inicialização.
- `src/hooks/useServiceWorker.ts`: registro canônico em `/sw.js` preservado.
- `src/App.tsx`: `lazyWithRetry` e `attemptSwUpdate` com recuperação de chunks preservados.
- `src/modules/crm/pages/admin/ContratosAdminPage.tsx`: botão de exclusão de modelos (`Trash2`) intacto e funcional.

---

## 7. EXECUÇÃO NO GITHUB ACTIONS REAL

- **Commit:** `594dae53320b4dffbb5cfe834e1f73ce3c5a27c4` (`origin/main`)
- **Workflow:** `🚀 SOBRE MÍDIA ERP — CI/CD Enterprise Pipeline`
- **Run ID:** `34172771768` (URL: `https://github.com/daiamestre/sitesobremidia/actions/runs/34172771768`)
- **Status Geral:** **SUCCESS (Verde)**

| Job | ID | Status | Duração |
|---|---|---|---|
| **🔍 Lint & TypeScript** | `101896141756` | ✅ SUCCESS | 34s |
| **🛡️ npm Security Audit** | `101896237965` | ✅ SUCCESS | 22s |
| **🧪 Unit + Integration + Security Tests** | `101896237993` | ✅ SUCCESS | 2m07s |
| **🏗️ Production Build + PWA** | `101896566543` | ✅ SUCCESS | 52s |
| **📊 Coverage Report** | `101896566564` | ✅ SUCCESS | 2m18s |
| **🎭 E2E Tests (Playwright)** | `101896708103` | ✅ SUCCESS | 45s |
| **✅ Quality Gate (bloqueio de merge)** | `101896931085` | ✅ SUCCESS | 2s |

---

## 8. CLASSIFICAÇÃO

**MICRO-GATE CI-01 = PASS**
