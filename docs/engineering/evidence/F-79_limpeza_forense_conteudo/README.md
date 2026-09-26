# F-79 — Limpeza forense de conteúdo irregular (preflight)

Evidência forense. **Não é conteúdo de produção** e nada daqui é lido pelo sistema.

## Arquivos

| Arquivo | Conteúdo |
|---|---|
| `sports_fixtures_11.json` | Linhas completas de `content_sports_fixtures`, com a competição embutida em `_competition` |
| `news_items_30.json` | Linhas completas de `content_news_items` |
| `contexto_estrutural_nao_removido.json` | Competições (4), categorias (10) e fontes (0) criadas pelo mesmo processo. São estrutura e não entram na remoção |
| `manifest.json` | IDs, SHA-256 dos snapshots, origem, dependências e estado de publicação |

## Por que os 11 jogos são FABRICATED

- Todos têm `source = 'baseline'` e ids fixos (`bra_N`, `ucl_N`, `pl_N`, `lal_N`).
- Vêm de uma lista escrita no código do rascunho `supabase/functions/sports-engine-sync/index.ts` (`BASELINE_FIXTURES`), com datas calculadas a partir de "agora".

Cada jogo foi cruzado com o calendário real: openfootball CC0 (commit de 2026-09-22) e Wikipédia.

| Competição | Jogo gravado | Data gravada | Realidade |
|---|---|---|---|
| Brasileirão | Flamengo 2×1 Palmeiras | 24/09 | o confronto foi em 23/05, placar 0×3 |
| Brasileirão | São Paulo 3×1 Corinthians | 24/09 | o jogo só acontece em 04/11 |
| Brasileirão | Botafogo 1×0 Fluminense | 25/09 | foi em 08/08, placar 1×1 |
| Brasileirão | Atlético-MG × Cruzeiro | 27/09 | não está no calendário da temporada |
| Champions | Real Madrid 5×2 Dortmund | 23/09 | não há rodada da Champions em 23/09 (R1: 8–10/09; R2: outubro) |
| Champions | Barcelona 4×1 Bayern | 23/09 | idem |
| Champions | Liverpool × Leverkusen | 28/09 | idem |
| Premier League | Arsenal 2×2 Liverpool | 24/09 | o jogo só acontece em 06/02/2027 |
| Premier League | Newcastle × Arsenal | 29/09 | o jogo só acontece em 21/11 |
| La Liga | Real Madrid 0×4 Barcelona | 23/09 | os jogos só acontecem em 14/03 e 09/05/2027 |
| La Liga | Atlético de Madrid × Las Palmas | 28/09 | não está no calendário da temporada |

## Por que as 30 notícias saem

As notícias são reais: são artigos de G1 e GE, com URL verificável. O problema é a **fonte**:
- a Globo não autoriza esse reuso comercial;
- não fazem parte da estratégia aprovada para o Content Library, que usa a Agência Brasil/EBC, licença CC BY.

Das 30, 10 notícias "G1 Brasil" têm data de publicação entre 2018 e 2023, o que mostra que o feed foi lido errado.

Classificação: `UNAUTHORIZED_SOURCE_FOR_CURRENT_CONTENT_PIPELINE`.

## Estado de publicação, verificado no banco

- **Jogos:** CREATED. Não existe widget, playlist, tela nem Player que os leia.
- **Notícias:** CREATED, com `status = ACTIVE` no banco. Porém `display_count = 0` e `last_displayed_at` nulo em 30/30. Nunca foram DISTRIBUTED nem PLAYED.
- **Referências:** 0 FKs apontando para os alvos, 0 triggers, 0 views, fora do Realtime, 0 objetos no storage. Nenhuma referência aos IDs ou URLs em qualquer coluna text/jsonb do schema `public`.
- **Código:** nenhum código versionado ou publicado lê essas tabelas. As Edge Functions dos rascunhos não foram publicadas.

## Execução da remoção controlada (2026-09-26)

1. **Baseline:** HEAD `b9e683b`, branch `release/player-5.2.4`. Contagem das 189 tabelas públicas em `contagens_antes.json`, com 41 591 linhas.
2. **Revalidação dos 41 IDs:** os hashes do snapshot conferem, as 11 + 30 linhas estão idênticas ao snapshot e há 0 FKs, 0 triggers, 0 Realtime, 0 referências em colunas text/jsonb e 0 objetos no storage. Resultado: PRE-CHECK PASS, registrado em `pre_delete_confirmacao.json`.
3. **Transação:** o bloco atômico `f79_delete_executado.sql` rodou às 07:06:11 UTC.
   - Ele confere 11/30 imediatamente antes do DELETE e apaga só pela lista materializada (`id = ANY(array)`).
   - Em seguida exige `ROW_COUNT` 11/30, 0 alvos restantes e totais das tabelas iguais a antes − 11/30.
   - Qualquer falha dispara EXCEPTION e ROLLBACK automático. Não houve falha: COMMIT.
   - Uma tentativa anterior às 07:04:48 UTC não chegou ao banco: o script gerador quebrou e a API recusou a consulta vazia.
4. **Pós-commit**, com consulta independente:
   - `content_sports_fixtures` = 0, `content_news_items` = 0, notícias com URL da Globo = 0;
   - em `contagens_depois.json`, só `content_news_items` (30 → 0) e `content_sports_fixtures` (11 → 0) mudaram; as outras 187 tabelas ficaram idênticas.
5. **Deploy:** nenhum. A limpeza é de dados, feita direto no banco de produção com a transação acima. Não se criou migration artificial.

| Arquivo | SHA-256 |
|---|---|
| contagens_antes.json | `8f2838d26f9013923a02d15936a05b76e76d1cd4fec762786f6b28e2a4878432` |
| contagens_depois.json | `517d40b840a88e85f557892c14fdeeecafefb496cd679206c361a3ed347d017d` |
| pre_delete_confirmacao.json | `a8cc00be28026a04e417ffad43fcd368293c7058be8e4fbe096eabf353a58d8b` |
| f79_delete_executado.sql | `46787ef418149a755a70a7d16c124a2993dee6ca017c2de13eb94aa467e03ffd` |
| sports_fixtures_11.json | `b66b74a9c0178c7c5bd3593430179817bb9e14bc2183f82ac87f2c36832f2157` |
| news_items_30.json | `15cef931bb212611a68a82112387f6ccadaf45be2fb29fab735a784493aa0b84` |
| manifest.json | `1393fe2b1f6b9a769d47a4b078509fffa61e05187111de2e7242db601b919936` |
