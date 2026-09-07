# MICRO-GATE CI-01 — CORREÇÃO DEFINITIVA DO GITHUB ACTIONS

## 1. Problema Original
O pipeline de Integração Contínua (CI) no GitHub Actions (`.github/workflows/ci.yml`) estava falhando sistematicamente no job:
- **Job:** `🔍 Lint & TypeScript` (`lint-and-typecheck`)
- **Step:** `Install dependencies` (`npm ci`)
- **Erro:**
  ```text
  npm ci can only install packages when your package.json and package-lock.json are in sync.
  Missing: @emnapi/core@2.0.0-alpha.3, @emnapi/runtime@2.0.0-alpha.3, esbuild@0.28.2
  ```
- **Incompatibilidade de Runtime:** O workflow estava configurado com `NODE_VERSION: '20'`, enquanto dependências modernas do projeto requerem Node >=22 (ex.: `@capacitor/cli@8.0.1`, `@testing-library/jest-dom@7.0.0`, `pdfjs-dist@6.3.289`).

---

## 2. Diagnóstico Forense
1. **Inconsistência do Lockfile:** Em `package.json#devDependencies` constavam `vitest@4.1.10` e `@vitest/coverage-v8@4.1.10`. Todavia, o lockfile `package-lock.json` não possuía a árvore completa de resolução para o ecossistema Vite/Vitest/Rolldown/Esbuild, resultando em ausência de `@emnapi/core`, `@emnapi/runtime` e `esbuild@0.28.2` nas entradas indexadas.
2. **Ambiente Node no CI:** O runner do GitHub Actions utilizava `actions/setup-node@v4` com `node-version: '20'`.
3. **ESLint / TypeScript:**
   - O `eslint.config.js` incluía pastas de scripts descartáveis/Deno (`scratch/**`, `supabase/**`) causando falsos positivos em arquivos fora do escopo frontend.
   - Haviam 4 inconsistências pontuais de `prefer-const` e escape regex em arquivos de serviço/testes (`src/modules/crm/services/contrato.service.ts`, `src/tests/integration/payment-methods-gate6.integration.test.ts`, `src/tests/unit/client_type_gate.test.ts`).

---

## 3. Correções Realizadas
1. **Sincronização Determinística do Lockfile:**
   - Regenerado `package-lock.json` rigorosamente alinhado a `package.json`, indexando `@emnapi/core`, `@emnapi/runtime`, `esbuild` e a árvore completa de dependências sem qualquer alteração de versão no `package.json`.
2. **Atualização do Runtime CI:**
   - Em `.github/workflows/ci.yml`, atualizado `NODE_VERSION: '22'` (Node 22 LTS compatível com Capacitor 8 e PDFjs-dist).
3. **Ajuste de Configuração ESLint e Correções Mínimas de Lint:**
   - Adicionado `scratch/**` e `supabase/**` aos ignores do `eslint.config.js`.
   - Ajustadas declarações `const` em `contrato.service.ts` e `payment-methods-gate6.integration.test.ts`.
   - Ajustado escape regex em `client_type_gate.test.ts`.

---

## 4. Validação Local
- `npm ci`: **SUCCESS** (Instalação 100% determinística sem erros)
- `npm run lint`: **SUCCESS** (0 errors, 610 warnings históricos)
- `npx tsc --noEmit`: **SUCCESS** (0 erros de tipagem TypeScript)
- `npm run build`: **SUCCESS** (Build Vite + PWA concluído com sucesso, gerando `dist/index.html`, `dist/sw.js` e todos os chunks)

---

## 5. Git & Rastreabilidade
- **Branch:** `main`
- **Origem:** `origin/main`

---

## 6. GitHub Actions Real
*(Preenchido após execução e monitoramento em tempo real do workflow)*

---

## 7. Não Regressão AR-03.5.2 (PWA & Cache)
- `src/sw.js`: Preservado com `skipWaiting()` e `clientsClaim()`.
- `src/hooks/useServiceWorker.ts`: Preservado registrando `/sw.js`.
- `src/App.tsx`: Preservado com `PWAProvider` ativo e lazy loading com chunk recovery.

---

## 8. Resultado Final
*(Pendente validação do GitHub Actions)*
