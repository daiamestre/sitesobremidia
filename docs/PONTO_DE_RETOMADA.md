# PONTO DE RETOMADA — onde a última conversa parou (SOBRE MÍDIA)

> **ORDEM DO DONO (23/11/2026):** toda conversa nova, quando o dono disser "continue de onde parei", "onde paramos",
> "continue", "publique as logos guardadas" ou parecido, LÊ ESTE ARQUIVO PRIMEIRO e continua daqui, como se já soubesse
> o que estava sendo feito. Não pergunte o que já está escrito aqui, em `docs/DECISOES_DO_DONO.md` ou nos manuais citados.
> **E toda conversa, ao terminar uma etapa, ATUALIZA ESTE ARQUIVO** (seções 1 a 4) antes do commit. Ele vira o ponto
> exato para a próxima conversa. O comando `node scripts/ops/onde-paramos.mjs` mostra este arquivo no topo, e o projeto
> roda esse comando sozinho quando uma conversa nova do Claude Code começa (`.claude/settings.json`, gancho SessionStart).

Atualizado em: **23/11/2026** · Assunto em andamento: **Logos de promoção do dono (P-36, F-355..F-358)**

## 1. O que estávamos fazendo
O dono manda logos de promoção (imagens no chat). Cada logo é guardada na fila, tratada pela receita (pasta, cores,
faixa editável, logo do cliente opcional) e commitada. **Publicar no site só quando o dono pedir** ("publique",
"adicione as logos"), tudo de uma vez. Manual completo e regras: `docs/studio/LOGOS_E_FUNDOS_DO_DONO.md`.

## 2. Situação exata
- **23/11/2026: as 43 logos da fila foram PUBLICADAS** (commit 92c9b98 enviado ao main; a Vercel publica do main). No ar: 111 logos de promoção.
- A fila agora está vazia de pendências: logos novas que o dono mandar entram nela (`../logos-de-promocao-originais/_fila-para-publicar.txt` + `fila/<id>.png`), passam pela receita, são commitadas e esperam o próximo "publique".
- Meta: 15 logos por pasta, **10 de 22 pastas completas**, próxima **Dia das Mães (0)**. Pasta ☀️ Verão criada em 23/11.

## 3. Próximo passo (faça assim, sem perguntar)
**Se o dono pedir para publicar as logos guardadas (as que entrarem depois de 23/11):**
1. `npx vitest run src/tests/unit/logosDePromocao355.test.ts src/tests/unit/studio src/tests/unit/regra` (tudo tem de passar).
2. `git status` — nunca commitar `src/lib/biblioteca.ts`, `supabase/.temp/cli-latest` nem `deno.lock` (são de outra sessão).
3. `node scripts/ops/publicar-main.mjs --forcar` (envia o ramo atual e o main; a Vercel publica do main).
4. Conferir no ar: baixar 2 ou 3 logos novas de `https://sitesobremidia.vercel.app/studio/logos/promocao/<arquivo>` e comparar
   os bytes com o arquivo local; abrir a página Logos no navegador com a conta de teste (skill `conferir-painel`).
5. Atualizar este arquivo (seção 2: "publicadas em DD/MM"), `docs/ESTADO_DO_SISTEMA.md` (P-36) e o manual das logos.

**Se o dono mandar mais logos:** seguir o PASSO A PASSO da seção 9 do manual (análise, fila, apagar dizeres, faixa editável, logo do cliente, teste, resposta) e a seção 1 (`docs/studio/LOGOS_E_FUNDOS_DO_DONO.md`): conferir fundo
transparente e repetição → guardar na fila → receita → faixa em branco ou "your…" vira editável (texto centralizado, dentro
das listras, no estilo da faixa) → conferir lado a lado (`scripts/studio/conferir-logo.mjs`) → testes → commit → responder
com a pasta, o que ficou editável e a contagem da meta (próxima pasta).

**Quando todas as pastas baterem 15:** lembrar o dono de mandar os FUNDOS.

## 4. Regras que não se pergunta de novo (resumo; o completo está no manual e nas decisões)
- Logo entra IGUAL à original, byte a byte. Só saem dizeres de modelo ("YOUR LOGO", "YOUR TEXT HERE", "SUA LOGO AQUI",
  "ALPHA BACKGROUND", xadrez). Nunca recortar o desenho.
- Faixa em branco = SEMPRE editável. Faixa com "your…" = dizer apagado e editável. Faixa que completa a frase NÃO muda.
- Texto da faixa: centralizado no meio da faixa, nunca passa das listras, nome comprido em 2 linhas compactas.
- A faixa limpa fica igual à original (mesma cor, brilho e frisos). Comparar sempre com a original, ampliado, antes de responder.
- Logo do cliente é opcional: sem ela o espaço fica branco/limpo; com ela aparece inteira dentro do espaço.
- Responder sempre em pt-BR. Conta de teste: `e2e-owner@sobremidia.com.br`. Nunca senhas. Nunca gastar ElevenLabs.

## 5. Acesso a tudo: chaves, contas e como desenrolar (sempre vale)
- **Chaves (API, tokens) estão no cofre do PC: `~/.sobremidia-secrets/tokens.env`** (fora do repositório). Os scripts de
  `scripts/ops/` já leem dali sozinhos. NUNCA imprimir, copiar para o chat, nem commitar os valores; usar só pelos scripts.
  Chaves cadastradas (só os nomes): SUPABASE_ACCESS_TOKEN, SUPABASE_PROJECT_REF, VERCEL_TOKEN, VERCEL_PROJECT_ID,
  VERCEL_TEAM_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, OPENAI_API_KEY, GROQ_API_KEY, OPENROUTER_API_KEY,
  GEMINI_API_KEY, ELEVENLABS_API_KEY (PROIBIDO gastar sem ordem do dono), PEXELS_API_KEY, PIXABAY_API_KEY, COSMOS_TOKEN,
  MODAL_TOKEN_ID/SECRET/PROFILE, CONTENT_FACTORY_SECRET, ANALISE_MIDIA_SEGREDO, TABLOIDE_IA_SEGREDO/URL, STUDIO_SEGREDO.
- **Como usar cada coisa (comandos prontos):** `scripts/ops/README.md` — banco (`node scripts/ops/sql.mjs`), publicar o site
  (`publicar-main.mjs`), conferir o site, sessão de teste no navegador (`sessao-teste.mjs`, conta e2e-owner, sem senha),
  Player/APK (`publicar-player.mjs`), funções do Supabase. Provedores de IA e qual chave usa: `docs/autonomia/PROVEDORES_DE_IA.md`.
- **Receitas (skills) em `.claude/skills/`:** deploy-producao, release-player, migracao-segura, conteudo-automatico,
  conferir-painel, encartes-e-palcos, retomar-trabalho. Onde mexer em cada pedido: `docs/MAPA_DO_PROJETO.md`.
- **Autorização do dono:** fazer tudo sem pedir licença (corrigir, testar, commitar, publicar). Exceções: senhas, criar
  contas, gastar dinheiro/créditos pagos (ElevenLabs) e o Player comercial 5.7.10 (APK novo só como teste).
- **Se travar:** ler o erro, procurar no `docs/engineering/FINDINGS_LEDGER.md` (grep pelo assunto) como foi resolvido antes,
  e seguir. Se a trava do Claude Code negar uma ação, explicar ao dono e seguir por caminho seguro.
