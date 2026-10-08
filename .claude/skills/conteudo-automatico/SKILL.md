---
name: conteudo-automatico
description: Robô que abastece as pastas automáticas da Biblioteca do SOBRE MÍDIA (Loterias, Sorteios, notícias com foto, campeonatos, datas, charadas, memes, vídeos do Pexels/Pixabay). Usar para criar pasta automática nova, mudar arte, bancos de conteúdo, frequência ou fontes.
---

# Conteúdo automático das pastas — SOBRE MÍDIA

## Como funciona
- **Workflow:** `.github/workflows/conteudo-automatico.yml` roda a cada 3 h e sob demanda, e executa `scripts/conteudo/robo.mjs`.
- **Produtores:** cada um em `scripts/conteudo/produtores/*.mjs` devolve `{ <conteudo>: [itens] }`. O item é `{ chave, nome, descricao, html(w,h) }` (arte) ou `{ tipo:'video', orientacoes:['h'|'v'], video:{id,link,duracaoMs,thumb} }`.
- **Desenho e envio:** o robô desenha em 1920x1080 (`h`) e 1080x1920 (`v`) com Playwright, envia ao R2 em `conteudo/<conteudo>/...` e publica pela Edge Function `conteudo-automatico` (segredo `CONTENT_FACTORY_SECRET`).
- **Regra no banco:** `conteudo_auto_publicar`. Item novo é criado, item mudado é atualizado na mesma mídia, e item que sumiu é apagado com o arquivo. Itens colocados à mão (sem a tag `auto:`) nunca são tocados.
- **Sem retrabalho:** a identidade da arte é o hash do HTML. Arte que não mudou não é redesenhada nem baixada pelas telas. Se mudar o desenho, suba `VERSAO` em `robo.mjs`.

## Pastas e produtores
| `biblioteca_pastas.conteudo_automatico` | Produtor | Frequência |
|---|---|---|
| loterias, sorteios | `loterias.mjs` (API da CAIXA + espelho) | a cada sorteio |
| noticias, cinema, turismo, esportes, futebol | `produtores/noticias.mjs` + `scripts/conteudo/rss.mjs` (foto da notícia com crédito) | 3 h |
| campeonato-<slug>, jogos-rodada (sem odds) | `campeonatos.mjs` (dados de `conteudo_esportes_dados()`) | rodada |
| datas | `datas.mjs` (calendário; Páscoa por Meeus) | diária |
| charadas, humor, memes, curiosidades, nostalgia | `produtores/textos.mjs` + `scripts/conteudo/bancos*.mjs` (conteúdo próprio) | 3 dias |
| vídeos em turismo, curiosidades, humor, cinema, nostalgia | `videos.mjs` (Pexels + Pixabay, até 30 s e 30 MB) | semanal |

## Criar uma pasta automática nova
1. Escreva o produtor ou amplie um existente. Use a base visual de `arte-base.mjs` (`pagina`, `GRADIENTES`, `esc`, `cortar`).
2. Registre em `robo.mjs` com `rodar('nome', ...)`.
3. Crie a migração marcando a pasta: `UPDATE biblioteca_pastas SET conteudo_automatico='<slug>' WHERE ... empresa '7d62aaec-e24d-4273-b257-867183cf658c'`.
4. Teste em `src/tests/unit/conteudoPastas.test.ts`.
5. Faça commit, envie e rode: `gh workflow run conteudo-automatico.yml -R daiamestre/sitesobremidia --ref main -f somente=<slug>`.
6. Leia o resultado com `gh run view <id> --log | grep "Gerar e publicar"`: procure `novos`, `iguais`, `falhas`.

## Decisões do proprietário (não perguntar de novo)
- Foto da própria notícia, sem alterar, com o crédito na tela.
- Memes e humor só com conteúdo próprio.
- Apostas: jogos da rodada, **sem odds**.
- Vídeos hospedados no R2 (nunca link direto para a fonte).
- **Vídeos de esporte acabaram (08/10/2026):** a pasta "Vídeos Esporte" foi apagada e o robô não busca vídeo de esporte. As pastas Esportes/Futebol (notícias) e os campeonatos continuam. Pasta que o dono manda acabar entra em `APOSENTADAS` (robo.mjs + Edge Function + `conteudo_auto_aposentar`).
