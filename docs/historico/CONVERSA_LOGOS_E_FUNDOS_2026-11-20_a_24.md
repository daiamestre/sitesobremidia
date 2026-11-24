# Resumo da conversa de 20 a 24/11/2026 — logos de promoção, fundos de Black Friday e memória do sistema

> Para qualquer conversa nova saber O QUE fizemos e COMO fizemos, em ordem. O ponto exato para continuar está em
> `docs/PONTO_DE_RETOMADA.md`. Regras: `docs/DECISOES_DO_DONO.md`. Passo a passo das logos:
> `docs/studio/LOGOS_E_FUNDOS_DO_DONO.md` (seção 9). Procura de produtos: `docs/studio/PROCURA_DE_PRODUTOS.md`.
> Histórico técnico: FINDINGS_LEDGER, F-355, F-357 e F-358.

## Linha do tempo

| Quando | Pedido do dono | O que fizemos e como |
|---|---|---|
| 20/11 | Mandou a 1ª logo ("Oferta do Dia!") para a galeria de logos | Receita `scripts/studio/logos-de-promocao.mjs`. A 1ª tentativa recortou com IA e o dono reclamou 4 vezes. **Regra final: a logo entra IGUAL à original, byte a byte.** Nome do arquivo com hash (o aparelho guarda imagens 30 dias). |
| 22/11 | Mandou 65 logos: "receba todas e publique de uma vez" | Publicadas num envio só. |
| 22/11 | Logos com "YOUR LOGO", "SUA LOGO", "ALPHA BACKGROUND" ou xadrez: só esses dizeres saem; faixa vazia vira texto editável com o nome da empresa; logo do cliente opcional | `scripts/studio/espaco-da-logo.mjs` (modos aro, xadrez, colunas, liso) + `espacos-das-logos.json` (texto no formato e estilo da faixa) + `src/lib/studio/logoPersonalizada.ts`. A 1ª versão tirou o círculo inteiro e ficou "recortada"; refeita só nos dizeres e com trava de furos no teste. |
| 22/11 | "Sempre analise a logo original e compare até sanar todas as falhas" | Conferência lado a lado, ampliada, com mapa do que mudou, repetida até zero falhas (hoje `scripts/studio/conferir-logo.mjs`). |
| 22–23/11 | Pastas por segmento e por data, com capa que gira; logo genérica vai às pastas da COR; meta de 8 logos por pasta (depois 15); indicar a próxima pasta; quando todas baterem, lembrar dos FUNDOS | `src/lib/studio/pastasDeLogos.ts` (`PASTAS_DE_LOGOS`, `PASTAS_DA_COR`, `META_DE_LOGOS_POR_PASTA` = 15, `ORDEM_DA_META`, `progressoDaMeta`), `PastaDeLogos.tsx`, `scripts/studio/cores-das-logos.mjs`. |
| 23/11 | Mandou 2 fundos de Black Friday para a criação de vídeo; depois: "corrija os nomes BLACK FRIDAY das fitas sem mudar nada nas fitas" | `scripts/studio/fundo-do-dono-palco.mjs` (em pé inteiro; deitado = arte no centro com laterais desfocadas) e entradas em `FUNDOS_DO_PALCO`. Texto das plaquinhas refeito por `corrigir-texto-das-fitas.mjs`. Publicado (F-357). |
| 23/11 | Mandou mais logos, em grupos de 2 a 8, até 51 na fila | Cada uma guardada na fila (`../logos-de-promocao-originais/fila/` + `_fila-para-publicar.txt`), com pasta e contagem da meta na resposta. |
| 23/11 | "Corrija o Año"; Boas Festas em Natal; Fecha Mês em Fim de Ano | Modo `acento`: só o til saiu, com o fundo escovado continuado listra por listra. |
| 23/11 | Bronca: "toda faixa em branco é editável e todo 'your' é apagado e editável; não pergunte de novo" | Regra gravada como fixa. Faixa com palavras da frase ("DE OFERTAS") não muda. |
| 23/11 | Bronca: "as faixas das Mega Oferta têm de ficar EXATAMENTE iguais à original, sem falhas" | Faixa refeita AO LONGO da curva, entre os frisos MEDIDOS, com o topo seguindo as letras e a base até o friso (`aoLongo`). Erros no caminho: faixa lisa sem brilho, área reta (degrau), encostar no friso (escurece), achar friso sozinho (pegou o disco). |
| 23/11 | "O texto não pode passar das listras; nomes longos em 2 linhas compactas" | `alturaUtil` e `entreLinhas` em `logoPersonalizada.ts` (mede a altura real com acento e Ç; folga mínima entre as linhas), também nas faixas retas. |
| 23/11 | Bronca: "centralize os textos, estão em cima da luz branca" | Centro calculado pelo CORPO das letras (sem acento nem cedilha) + `baixar` 2 px. Medido nas 4 cores: no máximo 1 a 2 px do centro. |
| 23/11 | Novas logos com faixas em branco | Liquidação verde e preta (placa), Ano Novo estrela (fita branca em arco), Feliz Ano Novo (fita vermelha em arco). |
| 23/11 | Réveillon (relógio) e Ofertas Fim de Ano (balões) com xadrez | Xadrez opaco: modo `xadrez` com `forcar`. Xadrez MEIO TRANSPARENTE (vidro): `alfa`, `porAlfa`, `circulo` exato e `circuloTudo`, com o balão da frente protegido pela borda medida. "ALPHA BACKGROUND" do aro preto: modo `aro` com `beirada` (`faixaInteira` deixou listras e `liso` apagou o friso prateado). Logo do cliente no MAIOR retângulo que cabe inteiro no vidro. |
| 23/11 | Ofertas de Verão com "SUA LOGO AQUI" | Letras pretas tiradas (`letra.preto`); texto editável reto INCLINADO (`giro` -7°). Pasta nova ☀️ Verão. |
| 23/11 | "Publique as logos guardadas" | 43 logos publicadas num envio só; 111 no ar; 5 conferidas byte a byte no site. |
| 23–24/11 | "Grave tudo para outra conversa continuar de onde paramos — é uma ordem" | `docs/PONTO_DE_RETOMADA.md`, lido primeiro por toda conversa (CLAUDE.md, skill `retomar-trabalho`, `onde-paramos.mjs` mostra no topo, gancho SessionStart em `.claude/settings.json`). Manual das logos com o passo a passo (seção 9). Chaves do cofre explicadas (só nomes) na seção 5 da retomada. |
| 24/11 | "A sessão nova não aparece no celular" | Era o Controle Remoto (Remote Control) desligado na sessão nova; ligado. Sessões só aparecem no celular com ele ligado. |
| 24/11 | "Conversa nova gasta menos?" | Sim: cada mensagem relê a conversa inteira; conversa curta é mais barata. Abrir conversa nova a cada etapa grande; imagens pesam mais que texto. |
| 24/11 | Salvar como procuramos produtos (site oficial, depois parceiros) | `docs/studio/PROCURA_DE_PRODUTOS.md`. |

## Como o dono gosta de trabalhar (aprendido nesta conversa)
- Responder em pt-BR, direto, com tabela (logo | pasta | como ficou), imagem de antes e depois e a contagem da meta com a próxima pasta.
- NÃO perguntar o que já foi decidido; ele se irrita quando precisa repetir. Na dúvida sobre faixa: em branco ou "your…" = editável.
- Ele confere a olho e reclama de qualquer falha mínima (sombra de letra, degrau, emenda, texto fora do centro). Conferir sempre AMPLIADO antes de mostrar.
- Ele manda várias logos seguidas; publicar só quando ele disser "publique".
- Avisar o progresso em frases curtas durante trabalhos longos.

## Truques técnicos que resolveram problemas
- Arquivo travado pelo Windows ("UNKNOWN: unknown error, open ... lista.json" ou `.json`): rodar de novo.
- Editar arquivos com texto cheio de crases e aspas: usar a ferramenta de escrever ou editar arquivo, não heredoc no terminal (o heredoc quebra).
- `git push` com "cannot lock ref ... expected": o envio pode ter chegado mesmo assim; conferir com `git ls-remote origin refs/heads/main`.
- Teste no navegador da logo editável: importar `logoPersonalizada.ts` e `logosDePromocao.ts` na página do `vite-dev` (snippet no manual, 9.6). Depois de editar arquivos, a página recarrega sozinha: esperar e repetir.
