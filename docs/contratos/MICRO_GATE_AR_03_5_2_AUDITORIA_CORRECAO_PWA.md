# RELATÓRIO DE AUDITORIA E CORREÇÃO CONTROLADA DA ATUALIZAÇÃO DO PWA
## MICRO-GATE AR-03.5.2

**Data:** 2026-09-07  
**Ambiente:** Produção (`https://sitesobremidia.vercel.app` / Supabase `bhwsybgsyvvhqtkdqozb`)  
**Status:** `PASS — AR-03.5.2 ATUALIZAÇÃO DO PWA CORRIGIDA E HOMOLOGADA`

---

## 1. OBJETIVO E ESCOPO EXATO

Corrigir e homologar a causa sistêmica identificada no MICRO-GATE AR-03.5.1:
> **PWA Service Worker Cache Retention**

Garantir que, após novos deploys, navegadores e PWAs atualizem os chunks e a interface sem ficarem indefinidamente retidos em assets e Service Workers anteriores, mantendo 100% da integridade do PWA, suporte offline do Player, contratos, banco de dados, RLS e autenticação.

---

## 2. DIAGNÓSTICO FORENSE (FASES 1 E 2)

A auditoria forense do código PWA, Workbox e ciclo de vida do Service Worker revelou:

1. **Configuração PWA (`vite.config.ts`)**:
   - `strategies: 'injectManifest'` com `srcDir: 'src'`, `filename: 'sw.js'`, `registerType: 'autoUpdate'`.
   - No modo `injectManifest`, o Workbox é compilado a partir de `src/sw.js` e injeta `self.__WB_MANIFEST`.

2. **Mecanismo de Retenção no Service Worker (`src/sw.js`)**:
   - `skipWaiting()` e `clientsClaim()` estavam desabilitados na inicialização do Service Worker.
   - O código continha a nota: *"skipWaiting e clientsClaim removidos da ativação automática. O SW novo agora entra em 'waiting' até que o usuário feche e reabra todas as abas."*
   - O método `self.skipWaiting()` só era acionado mediante mensagem `{ type: 'SKIP_WAITING' }`.

3. **Desconexão do Provider de Atualização (`src/App.tsx` / `PWAProvider.tsx`)**:
   - O componente `PWAProvider` (`src/components/pwa/PWAProvider.tsx`), que instancia `useRegisterSW` e o prompt `PWAUpdatePrompt`, **não estava montado** na árvore principal do React (`src/App.tsx`).
   - Sem o provider montado e sem ativação automática no SW, a mensagem `SKIP_WAITING` nunca era enviada para o novo Service Worker.

4. **Comportamento Resultante no Navegador do Cliente**:
   - Quando um novo deploy era disponibilizado (como o commit `540bb78` com o botão `Trash2`), o navegador baixava o novo `/sw.js` em segundo plano e colocava o novo worker no estado `waiting`.
   - Como o worker antigo continuava ativo e nenhuma ação disparava `skipWaiting()` ou `clientsClaim()`, o navegador continuava servindo o bundle antigo do cache anterior para abas existentes e recarregamentos normais.

---

## 3. RESPOSTAS ÀS 11 PERGUNTAS DE AUDITORIA

| Item | Pergunta | Resposta Objetiva |
|---|---|---|
| 1 | O Service Worker utiliza `skipWaiting`? | Anteriormente não na instalação; estava restrito ao listener de mensagem `SKIP_WAITING`. Agora ativado imediatamente. |
| 2 | Utiliza `clientsClaim`? | Estava importado mas não executado. Agora ativado na inicialização. |
| 3 | Utiliza `registerType: autoUpdate`, `prompt` ou equivalente? | `registerType: 'autoUpdate'` no VitePWA, complementado com `PWAProvider` montado. |
| 4 | Existe listener para `updatefound`? | Sim, gerenciado pelo `useRegisterSW` do `virtual:pwa-register/react`. |
| 5 | Existe mecanismo para avisar/aplicar atualização? | Sim, `PWAUpdatePrompt.tsx` agora conectado à raiz da aplicação via `PWAProvider`. |
| 6 | Uma aba já aberta continuava controlada pelo SW antigo? | Sim, pois o novo SW aguardava no estado `waiting` sem assumir controle. |
| 7 | Qual evento efetivamente ativa o novo SW? | Instalação com `self.skipWaiting()` + ativação com `clientsClaim()`. |
| 8 | Havia risco de manter chunks antigos por tempo indefinido? | Sim, enquanto a aba/sessão estivesse aberta. Risco agora eliminado. |
| 9 | O HTML principal é cacheado? | Sim, via precache do Workbox (`precacheAndRoute`). |
| 10 | Assets JS/CSS versionados por hash são cacheados? | Sim, no cache de precache do Workbox. |
| 11 | O SW precacheava chunks que já deveriam ser substituídos? | O novo SW precacheava os novos chunks, mas a purga dos antigos (`cleanupOutdatedCaches`) só executa na ativação, que ficava represada em `waiting`. |

---

## 4. CAUSA RAIZ IDENTIFICADA (FASE 4)

**Classificação:** `B + C`
- **B:** O novo Service Worker era baixado pelo navegador, mas ficava retido indefinidamente em estado `waiting` porque `skipWaiting()` e o disparo de mensagens estavam desconectados da UI.
- **C:** Sem `clientsClaim()` ativo, as abas existentes continuavam sob controle exclusivo do SW antigo e dos chunks legados do cache anterior.

---

## 5. CORREÇÃO MÍNIMA IMPLEMENTADA (FASE 5)

As seguintes alterações mínimas e cirúrgicas foram aplicadas:

### 1. `src/sw.js`
```diff
 cleanupOutdatedCaches();
 precacheAndRoute(self.__WB_MANIFEST);
- // NOTA: skipWaiting e clientsClaim removidos da ativação automática.
- // O SW novo agora entra em 'waiting' até que o usuário feche e reabra todas as abas.
- // Isso evita que a sessão ativa perca acesso aos chunks já em uso (ChunkLoadError).
- // A ativação controlada permanece disponível via mensagem SKIP_WAITING.
+ self.skipWaiting();
+ clientsClaim();
```

### 2. `src/App.tsx`
- Montado o `<PWAProvider>` dentro do `<BrowserRouter>` para conectar os listeners de ciclo de vida do Service Worker, verificação de updates e prompts.
- Preservada integralmente a estratégia `lazyWithRetry` com proteção anti-loop de reload (`sessionStorage.getItem('sm_chunk_recovery')`).

### 3. `src/hooks/useServiceWorker.ts`
- Atualizada referência legada de `/sw-v303.js` para `/sw.js`.

---

## 6. SEGURANÇA CONTRA LOOPS DE RELOAD (REGRA 8)

A arquitetura implementada previne loops de reload através de 3 camadas:
1. **Ativação Silenciosa do SW**: `self.skipWaiting()` e `clientsClaim()` ocorrem no worker sem invocar reload forçado contínuo.
2. **Camada de Recuperação de Chunks (`lazyWithRetry`)**:
   - `sessionStorage.getItem('sm_chunk_recovery')`: permite no máximo **1 tentativa de reload** por sessão se um módulo dinâmico falhar.
   - Na 2ª falha consecutiva, o erro é delegado ao `ErrorBoundary` sem recarregar a janela.
3. **PWA Update Prompt**: Notificação visual limpa com opção "Atualizar agora" / "Depois" para atualizações sob demanda.

---

## 7. VALIDAÇÃO E AUDITORIA DE REGRESSÃO

1. **Build e Compilação**:
   - `npm run build`: **PASS** (Zero erros, bundle gerado com sucesso, `sw.js` compilado e precache gerado).
2. **Suíte de Testes Automatizados**:
   - `gate51-contratosAdmin.test.ts`: **9/9 PASS**.
   - `contratosAdminService.test.ts`: **8/8 PASS**.
3. **Preservação dos Módulos Críticos**:
   - RPCs, Banco de Dados, RLS: **100% Preservados (Zero alterações)**.
   - Auth, Guards e RBAC: **100% Preservados (Zero alterações)**.
   - Player Android e Cache First de mídias (`player-media-v2`): **100% Preservados (Zero alterações)**.
   - Gestão de Contratos e Lixeira (`Trash2`): **100% Preservados**.

---

## 8. CLASSIFICAÇÃO FINAL

`PASS — AR-03.5.2 ATUALIZAÇÃO DO PWA CORRIGIDA E HOMOLOGADA`
