---
name: conferir-painel
description: Abrir o painel do SOBRE MÍDIA no navegador do Claude com a conta de TESTE para conferir telas, prévias de widgets e fluxos, sem digitar senha. Usar para validar visualmente qualquer mudança no site.
---

# Conferir o painel no navegador — SOBRE MÍDIA

1. Servidor local: a configuração `vite-dev` fica em `.claude/launch.json` (porta 5199). Abra com a ferramenta do navegador `preview_start` (name `vite-dev`).
2. Sessão da conta de teste. Rode em segundo plano; ela é entregue uma única vez:
   `node scripts/ops/sessao-teste.mjs`
   - Padrão: `e2e-owner@sobremidia.com.br`.
   - **Nunca** usar contas pessoais (`daiamestre@`, `daiamestre9@gmail.com`, `jairaniran2@gmail.com`) nem digitar senha.
3. No navegador, em JavaScript:
   ```js
   const j = await (await fetch('http://127.0.0.1:8767/')).json(); localStorage.setItem(j.key, JSON.stringify(j.session)); location.href = '/dashboard/widgets';
   ```
4. Tamanho da tela: `resize_window` 1440x900 para o painel e 1920x1080 ou 1080x1920 para artes. Prefira `get_page_text`/`javascript_tool` a capturas de tela, que gastam mais.
5. Ao terminar:
   - apagar a sessão com `Object.keys(localStorage).filter(k => k.startsWith('sb-')).forEach(k => localStorage.removeItem(k))`;
   - voltar o tamanho da tela com `resize_window preset desktop`;
   - parar o servidor.

Regra das prévias: a prévia de um widget tem de ser a tela do Player, só que menor. Use só `cqmin`, nunca `clamp` em px (`src/tests/unit/widgetProporcao.test.ts` confere isso).
