# SOBRE MÍDIA Sports Engine — contrato e regras de validação (Gate 3)

## Por que estas fontes

A CBF, a UEFA, a LALIGA e a Premier League proíbem, nos seus termos de uso, uso comercial ou coleta automática. O esporte usa estas fontes, **sem custo de API**:

| Fonte | Licença | Uso | Crédito exibido |
|---|---|---|---|
| openfootball/football.json (GitHub) | CC0 1.0 (domínio público) | calendário, datas, horários, placares | "openfootball" |
| Wikipédia (API MediaWiki) | CC BY-SA 4.0 (texto) | validação de placar e da existência do jogo; única fonte da Champions | "Wikipédia (CC BY-SA)" |
| Agência Brasil / EBC (RSS) | CC BY 4.0 | notícias de esportes | "Agência Brasil" |

**O que só entra como fato estruturado:** placar, data, horário, times e rodada. Não se copiam textos longos, fotos, escudos nem logos.

## Cobertura

| Competição | slug | Temporada | Cobertura | Validação |
|---|---|---|---|---|
| Brasileirão Série A | `brasileirao` | 2026 | FULL | openfootball `2026/br.1.json` + pt.wikipedia (tabela de confrontos) |
| Premier League | `premier-league` | 2026/27 | FULL | openfootball `2026-27/en.1.json` + en.wikipedia `2026–27 Premier League` |
| La Liga | `la-liga` | 2026/27 | FULL | openfootball `2026-27/es.1.json` + en.wikipedia `Template:2026–27 La Liga table` |
| Champions League | `champions-league` | 2026/27 | **PARTIAL** | só en.wikipedia `2026–27 UEFA Champions League league phase`; o openfootball não tem a temporada |

## Modelo canônico `SportsMatch`, em `content_sports_fixtures`

| Campo do contrato | Coluna |
|---|---|
| id / identidade lógica | `id` / `match_key` = `slug|temporada|mandante|visitante` (os códigos da Wikipédia) |
| competition / competition_code / season / round | `competition_id` / `competition_code` / `temporada` / `rodada` |
| home_team / away_team | `home_team_name` / `away_team_name` (rótulo curto da Wikipédia); nomes na fonte em `home_team_source` / `away_team_source` |
| home_score / away_score | `home_score` / `away_score`, só com status FINISHED |
| scheduled_at | `kickoff_utc` (UTC), `scheduled_date` (data local da competição), `time_known`, `source_timezone` |
| status | `status`: `SCHEDULED`, `FINISHED`, `POSTPONED`, `CANCELLED` ou `UNKNOWN`. **Nunca `LIVE`** |
| source / source_url / source_version / source_updated_at | fonte primária: commit do openfootball ou revisão da Wikipédia |
| validation_source / validation_url / validation_version | a segunda fonte ou a segunda leitura que confirmou |
| collected_at / validated_at / published_at / parser_version | rastreabilidade |
| confidence | `DUAL_SOURCE`, `DUAL_SOURCE+DOUBLE_READ` ou `DOUBLE_READ` (Champions) |
| validation_state / published / reject_reason / evidence | resultado da reconciliação |

**Regra no próprio banco:** um jogo publicado só pode ter status `SCHEDULED`, `FINISHED`, `POSTPONED` ou `CANCELLED`, e FINISHED exige placar.

## Regras de publicação

"Leitura independente" é outro commit do openfootball ou outra revisão da Wikipédia, com pelo menos 30 minutos de diferença. Duas leituras da mesma versão nunca contam como confirmação.

| Situação | Regra | Estado |
|---|---|---|
| Resultado (FULL) | placar do openfootball = placar da Wikipédia para o mesmo confronto | `VALIDATED` + `DUAL_SOURCE` → publica |
| Resultado com as fontes discordando | — | `CONFLICT` → não publica e registra evento |
| Resultado em uma só fonte | — | `PENDING_VALIDATION` → não publica |
| Próximo jogo (FULL) | mesma data e horário em 2 commits diferentes do openfootball **e** o confronto existe, ainda não disputado, na Wikipédia | `VALIDATED` + `DUAL_SOURCE+DOUBLE_READ` → publica |
| Próximo jogo com horário mudando | a mudança é registrada (`MATCH_SCHEDULE_CHANGED`) | `PENDING_VALIDATION` até o novo horário se repetir em outro commit |
| Jogo passado sem placar | — | `UNKNOWN` → não publica |
| Champions (PARTIAL) | mesmos data, horário, times e placar em 2 revisões diferentes da página (≥ 30 min) | `VALIDATED` + `DOUBLE_READ` → publica; senão não publica |
| Placar publicado que muda | evento `SUSPICIOUS_CHANGE`; o jogo sai do ar | só volta quando as duas fontes concordarem de novo |
| Goleada (diferença ≥ 7) | além das duas fontes, o openfootball precisa repetir o placar em 2 commits | até lá, `SUSPICIOUS` |
| Placar acima de 15 gols para um time | — | `REJECTED` |
| Jogo em andamento (até 3 h depois do início, sem placar) | não há placar ao vivo | não aparece nem como próximo nem como resultado |

A identidade do jogo é o confronto (mandante × visitante) dentro da temporada. As fontes e as leituras são evidências sobre o mesmo jogo: nunca geram jogos duplicados.

**Times:** cada time do openfootball precisa corresponder a exatamente um código da Wikipédia, formando uma correspondência completa e um para um. Se isso falhar, a competição fica `DEGRADED` e nada novo é validado nela.

## Fuso horário

- O openfootball publica o horário local da competição, sem declarar o fuso. O fuso fica registrado por competição: `America/Sao_Paulo`, `Europe/London` e `Europe/Madrid`.
- A Champions na Wikipédia está em CET/CEST, registrado como `Europe/Paris`.
- Tudo é gravado em UTC (`kickoff_utc`) e exibido em `America/Sao_Paulo`.
- Jogo sem horário definido: mostra a data e "horário a definir".

## Agenda, cache e resiliência

- `pg_cron` a cada 15 minutos → `pg_net` → Edge Function `sports-engine-sync`, autenticada por segredo guardado no Vault.
- **Cache:** se o commit do openfootball e a revisão da Wikipédia não mudaram desde a última execução, a competição é pulada sem regravar nada.
- **Modo:** `MATCHDAY` quando há jogo terminado nas últimas 8 h ou começando nas próximas 2 h (verifica a cada 15 min); `NORMAL` nos demais casos (no máximo 1 vez por hora).
- Cada competição e cada fonte é processada isoladamente: uma falha não derruba as outras.
- Fonte fora do ar: os dados publicados são mantidos. `content_sports_source_health` registra HEALTHY/DEGRADED/FAILED, último sucesso, última falha e motivo.
- **Observabilidade:**
  - `content_sports_runs`: por execução, os registros recebidos, aceitos, rejeitados, alterados e publicados;
  - `content_sports_snapshots`: cópia normalizada de cada versão lida, com hash, guardando só as últimas 10 por fonte e competição;
  - `content_sports_events`: as mudanças.

## Entrega ao Player (sem busca no aparelho)

- **Widget `sports`**, com config `{ competicoes: [slug…], modo: 'resultados' | 'proximos' | 'hoje' | 'ultimos', limite }`.
- O servidor resolve em `fn_widget_config_resolvido`, que acrescenta `esportes: { jogos, geradoEm, fuso: 'America/Sao_Paulo', creditos }`, só com jogos publicados.
- Sem jogos válidos, `fn_widget_pode_exibir` retorna falso e o widget não entra na reprodução ("PLAYING = MEDIA ONLY").
- Quando os dados publicados mudam, as playlists com widgets de esporte são "tocadas": Realtime → Player sincroniza em segundo plano.
- **Notícias de esportes:** widget `rss` com `origem: 'agencia-brasil'` e `categoria: 'esportes'`. O servidor entrega `noticias` prontas, do banco. Players antigos continuam lendo o feed oficial da Agência Brasil pelo `feedUrl`.
