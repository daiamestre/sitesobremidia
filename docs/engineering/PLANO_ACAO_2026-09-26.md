# Plano de ação — 26/09/2026

As frentes são executadas **uma de cada vez**. A próxima só começa quando a anterior estiver entregue:
**construída → testada → publicada (Supabase / Vercel / APK) → conferida em produção → commit**.

| # | Frente | Estado |
|---|---|---|
| 0 | F-79 — limpeza forense dos dados irregulares | **PASS** (commit `de8746b`) |
| 1 | Sports Engine a custo zero + Notícias de Esportes | **PASS** (F-80) |
| 2 | Transferir "VIDEOS EM PE PARA MIDIA INDOR VARIADOS" para a Biblioteca de Mídias | **PASS** (F-81) |
| 3 | Seletores de Mídia, Widget e Link (e Playlist) responsivos e com rolagem em PC, tablet e celular | **PASS** (F-82) |
| 4 | Capa em todos os widgets + imagem de fundo em todos | **PASS** (F-83) |
| 5 | Dashboard do Owner/ADM na área Gestor de Mídias + dashboards que ficam carregando | pendente |

## 1. Sports Engine + Notícias de Esportes (custo zero)

**Fontes, conforme a auditoria do Gate B:**
- **openfootball** (CC0): Brasileirão 2026, Premier e La Liga 2026/27.
- **Wikipédia/Wikimedia** (CC BY-SA 4.0, com crédito): valida as 4 competições. É a única fonte da Champions, que fica PARTIAL: publica só quando 2 revisões concordam.
- **Agência Brasil/EBC** (CC BY 4.0, com crédito): notícias de esportes. Só as imagens hospedadas pela EBC, com crédito.
- As fontes oficiais (CBF, UEFA, LALIGA, Premier League) proíbem uso comercial ou coleta automática e **não** são usadas.

**Regras:**
- Publicar só o que for confirmado: as duas fontes concordam, ou há duas leituras independentes, em commit ou revisão diferente.
- Sem placar ao vivo.
- Fuso: guardar em UTC e mostrar em America/Sao_Paulo.
- Mudança suspeita → SUSPICIOUS_CHANGE e não publica.
- Fonte fora do ar → mantém o último dado confirmado.
- Saúde por fonte: HEALTHY / DEGRADED / FAILED.

**Gates:**

| Gate | Entrega |
|---|---|
| 3 | Contrato canônico e regras de validação, documentados |
| 4 | Migração com dados globais (reaproveitando as tabelas `content_sports_*` / `content_news_*`); Edge Function com adapters, normalização, validação, reconciliação e snapshots; runs e saúde das fontes |
| 5 | `pg_cron` + `pg_net`, que já estão ativos (normal, dia de jogo e pós-rodada) |
| 6 | Widgets "Esportes" (Resultados, Próximos jogos, Jogos de hoje, Últimos resultados) e "Notícias de Esportes", resolvidos no servidor. Entram na Biblioteca/Playlist/Tela pela cadeia existente |
| 7 | Coleta real e prova no banco |
| 8 | Player: novo tipo de widget, APK, emulador; auditoria completa e commit |

## 2. Biblioteca — vídeos em pé

- 7 segmentos, 53 arquivos (51 .mp4 e 2 .jpg), 374,5 MB; o maior tem 174 MB.
- Uma pasta da Biblioteca por segmento, com o nome da pasta de origem.
- Cada arquivo vai para o R2 pelo fluxo oficial de upload, como linha de `media` com `biblioteca = true`, com thumbnail, duração e proporção 9:16, e é vinculado à pasta.
- Prova: contagem por pasta = contagem no disco; reprodução de amostra no Player.

## 3. Seletores responsivos

- Os diálogos "Selecionar Mídia / Widget / Link Externo / Playlist" ficam em `src/pages/dashboard/ScreenDetails.tsx` (~1609–1767).
- Problemas: grade fixa de 3 colunas e área de rolagem sem altura mínima, que corta a lista sem permitir rolar.
- Solução: um único seletor responsivo reaproveitado pelos quatro, com 1 a 4 colunas conforme a largura, altura limitada à viewport, rolagem por toque e mouse, e miniaturas proporcionais (9:16 / 16:9).
- Teste em 375, 768 e 1366 px.

## 4. Capas e fundo dos widgets

- Capa na Galeria e em Meus Widgets para todos os tipos (RSS, Institucional, Ofertas, Publicidade, Social, YouTube, Instagram): a imagem de fundo, se houver; senão, o próprio widget ao vivo (mesmo padrão do Relógio/Clima).
- Imagem de fundo disponível também em YouTube e Instagram. Conferir o consumo no Player.

## 5. Dashboards

- A área Gestor de Mídias (`/dashboard`) não tem item "Dashboard" no menu: o Owner/ADM cai na Central de Comunicação.
- Criar o dashboard do Owner/ADM, reaproveitando `dashboard_resumo_owner` (migração 20261237) e o padrão Central do Dia, e colocá-lo no menu.
- Reproduzir o "fica carregando" ao atualizar a página em todos os dashboards (Owner, ADM, Gestor, Representante, Anunciante), achar a causa raiz e corrigir.
