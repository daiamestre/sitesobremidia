# Estado do sistema SOBRE MÍDIA — onde paramos e o que falta

> **Qualquer IA, IDE ou janela nova de conversa começa por aqui.** Este arquivo diz o que o sistema já faz, onde cada coisa foi trabalhada por último e o que ainda falta para vender o sistema com segurança.
>
> Para um resumo rápido e atualizado, rode `node scripts/ops/onde-paramos.mjs`.
>
> Para retomar, o dono pode pedir: *"leia docs/ESTADO_DO_SISTEMA.md e continue a pendência P-03"* (ou outro número).

## 1. Ordem de leitura (5 minutos)

| # | Arquivo | Para quê |
|---|---|---|
| 1 | `docs/ESTADO_DO_SISTEMA.md` (este) | onde paramos, pendências numeradas e como retomar cada uma |
| 2 | `docs/DECISOES_DO_DONO.md` | regras já decididas pelo dono (não perguntar de novo) |
| 3 | `AGENTS.md` | governança: preservar o que funciona, ciclo de correção, Player e banco protegidos |
| 4 | `docs/MAPA_DO_PROJETO.md` | pedido → arquivo onde mexer |
| 5 | `docs/studio/PADRAO_DE_ENCARTES_E_PALCOS.md` | estilo e receitas de encartes, palcos e mídias |
| 6 | `scripts/ops/README.md` | comandos prontos: banco, publicar, conferir, sessão de teste, Player |
| 7 | `docs/engineering/FINDINGS_LEDGER.md` | histórico de cada correção F-NN (buscar com grep, não ler inteiro) |
| 8 | `docs/autonomia/RELATORIO_FINAL_AUTONOMIA.md` (situação final da missão) e `docs/autonomia/SOBRE_MIDIA_AUTONOMIA_RELATORIO_MESTRE.md` | Projeto Mestre "SOBRE MÍDIA Autônoma": auditoria com evidências, agentes (`REGISTRO_DE_AGENTES.md`), provedores (`PROVEDORES_DE_IA.md`), JARVIS (`JARVIS_INTEGRACAO.md`), decisões de arquitetura (`decisoes_de_arquitetura.jsonl`) e a sequência MG-AUT |

Quem usa Claude Code tem as receitas prontas em `.claude/skills/` (deploy-producao, release-player, migracao-segura, conteudo-automatico, conferir-painel, encartes-e-palcos, retomar-trabalho).

## 2. O que o sistema é (visão de uma página)

- **Painel web** (React + Vite, publicado na Vercel em `https://sitesobremidia.vercel.app`): telas, playlists, mídias, biblioteca com conteúdo automático, widgets, agenda, CRM (clientes, propostas, contratos, pedido de inserção), financeiro (PIX/Banco Inter, comissões), representantes, prospecção, BI e central de comunicação.
- **Portais por função:** dono e ADM (`/dashboard` e `/workspace`), anunciante (`/portal`), representante (`/representantes`), gestor (`/dashboard`). Cada conta vê só o que é seu.
- **Banco e servidor:** Supabase (PostgreSQL com regras de acesso, funções RPC, Edge Functions). Arquivos no Cloudflare R2. Robôs no GitHub Actions.
- **Player Android** (`native-android-player/`, Kotlin + ExoPlayer): toca as playlists nas TVs. Versão comercial 5.7.10; versões novas saem como teste. Tem launcher e ROM próprias para TV Box.
- **Sobre Mídia Studio** (`/studio`): catálogo de modelos por segmento, editor ao toque (imagem e vídeo MP4), Criador de Logos 3D, pastas de Encartes (mercado e farmácia), Palco de Ofertas (mercado e farmácia), pasta Logos, galeria pessoal, publicação direto na tela ou na playlist.
- **Cartaz Digital** (código `tabloide`): o cliente digita produto + preço e o sistema monta o cartaz com a foto real. Tem portal público de ofertas em `/ofertas/<loja>`.
- **Catálogo de produtos** (`tabloide_catalogo`): fotos oficiais das marcas, sem fundo e com código de barras. Em 08/11/2026 eram cerca de 3.264 imagens oficiais e 85 marcas no banco.
- **Agentes de IA do produto:**
  - "Trabalhar com IA" (`/dashboard/ia`, função `agente-ia`: Groq → Gemini → OpenRouter grátis; ação só depois de "Confirmar");
  - "Vídeo por agentes" (`/studio/agentes`, função `studio-orquestrador` + montagem no GitHub Actions);
  - Agente SOBRE MÍDIA do Studio (Cloudflare);
  - Creative Core com o DNA de estilo (`supabase/functions/_shared/studio/core/dna.ts`).

## 3. Últimas entregas (mais recente primeiro)

| F | Data | O que foi feito |
|---|---|---|
| F-275..F-280 | 09/11/2026 | **Fotos sem cota, removedor de fundo, aprendizado dos agentes, segmentos, produto sem bloqueio e aviso que leva aos produtos (F-279/F-280); 878 bebidas gravadas com conferência dupla** — (F-275) 2ª fonte da foto oficial: lojas que vendem o produto (`marca-varejo.mjs`, 10 lojas, mais vendidos, remédio com receita fora), recorte no PC sem gastar cota (`marca-recortar-local.mjs`), selos de propaganda tirados; o site tira o fundo no navegador quando a Cloudflare não recorta; (F-276) Removedor de Fundo SOBRE MÍDIA (BiRefNet MIT no navegador, `removedorDeFundo.ts`), conferência dupla com IA (`marca-conferir-ia.mjs`), Livro de soluções na memória dos agentes (`_shared/studio/core/solucoes.ts`, semeado), filtro de não-produto (`nao-e-produto.mjs`), auditoria dos 6.631 links (0 quebrados); (F-277) encartes e palcos de 9 segmentos (`gerar-segmentos.mjs`, `segmentosDeOferta.ts`), fotos de hortifrúti (`hortifruti-fotos.mjs`), ciclo contínuo da busca (`catalogo-ciclo.mjs`); (F-278) "SUA LOGO AQUI" e redes sociais como elementos editáveis (camadas `vaga` e `redes`), ícones tirados do fundo do Mega Oferta. |
| F-263..F-270 | 08/11/2026 | **Missão SOBRE MÍDIA Autônoma (execução)** — relatório final em `docs/autonomia/RELATORIO_FINAL_AUTONOMIA.md`:
- pareamento fechado e funcionando (aplicado);
- assinatura antiga removida;
- dados da pesquisa copiados para o R2 privado;
- registro de agentes e provedores em fonte única;
- **Central de Comando** que cria produções, monta encarte oficial e transforma arte em vídeo;
- memória de estilo com consentimento (ensaiada, não aplicada);
- 7/7 ataques rejeitados;
- contrato do JARVIS.

Publicado no ar em 08/11/2026 (P-26); falta só aplicar a memória de estilo (P-24) |
| F-262 | 08/11/2026 | **Projeto Mestre "SOBRE MÍDIA Autônoma" — auditoria (MG-AUT-01) e memória (MG-AUT-02)**: relatório mestre com evidências, registro de agentes, provedores, contrato do JARVIS, decisões de arquitetura, teste de isolamento (0 vazamentos em 8 perfis) e 2 riscos P0 achados (P-19, P-20) |
| F-261 | 08/11/2026 | **Studio de vídeo por agentes no ar**: migrações aplicadas (Player 5.7.10 íntegro), memória criativa semeada, orquestrador publicado com tarefa de 1 minuto, rota `/studio/agentes` ("Vídeo por agentes"), segmento **Farmácia** próprio no Creative Core, prévia das cenas corrigida e segredo da montagem gravado: vídeo MP4 montado e aprovado de ponta a ponta (P-06 resolvida) |
| F-260 | 08/11/2026 | **Memória do sistema no repositório**: este arquivo, as decisões do dono, o padrão de encartes e palcos, o comando `onde-paramos`, as skills `retomar-trabalho` e `encartes-e-palcos`, os atalhos para outras IAs e IDEs e o DNA dos agentes do Studio |
| F-259 | 08/11/2026 | Encarte e Palco de Ofertas de **farmácia** (pastas `encartes-de-farmacia` e `palco-de-ofertas-farmacia`), logo "Ofertas de Farmácia", aviso legal dos remédios, cesta de 16 itens isentos de prescrição, fotos oficiais de Novalgina, Naldecon e Centrum |
| F-258 | 02/11/2026 | O robô de marcas pega a imagem principal da página; auditoria de imagem contra o produto |
| F-257 | 02/11/2026 | Campo único guiado para adicionar produto (nome, marca, sabor, medida, promoção, preço) |
| F-256 | 02/11/2026 | O cliente descreve o produto e o sistema traz o exato; o que falta aparece em vermelho pulsando |
| F-255 | 02/11/2026 | Catálogo com imagem oficial da marca (fonte `MARCA`) |
| F-252/253 | 01/11/2026 | Foto escolhida vira a oficial, sem fundo, inspecionada antes de entregar |
| F-249/250/251 | 01/11/2026 | Edição completa no palco e no encarte; trocar produto no editor; arte original do palco |
| F-244..F-248 | 01/11/2026 | Grade inteligente (16 a 20), estilos de balão, 7 tamanhos, balões centralizados, pasta Logos |
| F-240..F-243 | 01/11/2026 | Encartes oficiais Mega Oferta e Semana do Frango; palco com balão amarelo e 8 s por produto |
| F-229..F-237 | 31/10/2026 | Publicar na tela pela playlist dela, capas que giram, pasta de encartes, vídeo com linha do tempo, Palco de Ofertas, Logos 3D |
| F-218..F-228 | 30–31/10/2026 | Studio AI, Agente SOBRE MÍDIA na Cloudflare, "Trabalhar com IA", Creative Core |

O histórico completo de F-01 a F-259 está em `docs/engineering/FINDINGS_LEDGER.md`.

## 4. Pendências numeradas (o que falta para ficar 100% comercializável)

> **P-33 (12/11/2026):** ✅ NO AR — Studio: escolha do modelo antes da edição e pasta por segmento (F-298/F-299), locutor ElevenLabs com 5 vozes (F-300/F-301), sistema fluido no tablet (F-302), capas em vídeo leve e Biblioteca de Loop só owner/ADM (F-303/F-305), vídeo criado vai a Meus Projetos/publicar/baixar (F-304), passo a passo de criação + "Editar direto" (F-306/F-307). Falta (🟨): no celular, o painel "vídeo pronto" aparece na lateral estreita.

> **P-32 (10/11/2026):** ✅ NO AR: F-288 a F-293 (F-293: editor de encartes com a barra de movimento e a edição de vídeo embaixo da arte, igual ao palco). Hortifrúti: 113 com foto conferida (novos 10/11: banana maçã, banana ouro, lima da pérsia, maçã argentina, pera portuguesa, maracujá doce, jaca, abóbora paulista). Sem foto boa (viram pedido para os agentes, nunca foto errada): uva niágara, caju, maxixe, banana da terra, limão cravo, alho roxo, pimenta de cheiro, pimenta dedo-de-moça, pimenta biquinho, ervilha torta — os bancos de imagens não têm essas variedades brasileiras e as lojas só têm fotos com sombra/baixa resolução. Ferramentas: `hortifruti-fotos.mjs buscar/gravar --so=`, `hortifruti-candidatos.mjs`, `hortifruti-folha.mjs`, `hortifruti-simular.mjs`, `hortifruti-intrusos.mjs` (sempre conferência humana antes de gravar). **F-295 (10/11):** o sistema procura sozinho a foto do produto descrito (Worker /procurar em 16 lojas + agentes no GitHub a cada 2 h, sem PC e sem Claude); embalado sem foto aprovada vira pedido, sem imagem de IA. Conferir a rotina "Pedidos de foto (agentes na nuvem)" no GitHub Actions depois do 1º disparo. **F-296 (10/11):** encartes e palcos donos de si (nada do mercado na edição dos outros; flash/luz/brilho na cor do encarte, girada pelo tom); modelos de antes intactos; desenhos novos como modelo 2 na GALERIA DE MODELOS de cada segmento (farmácia + 9). **F-297 (10/11):** palco de ofertas como MESA DE EDIÇÃO de vídeo (uma visualização só, lateral na altura da arte, linha do tempo de largura inteira embaixo, tudo à vista no computador, tablet e celular). O editor de encartes (/studio/editor) ainda tem a linha do tempo embaixo da arte, no formato antigo: aplicar a mesma mesa só se o dono pedir. **F-298 (11/11):** a pasta abre na ESCOLHA DE MODELO (palco e encartes; `?modelo=`), a edição não tem galeria nem cartão de dica e a lateral ficou legível no celular. **F-299 (11/11):** uma pasta por segmento (Encartes + Palco de Ofertas dentro), capas em loop e "Editar este modelo" direto na edição. **F-303 (12/11):** capas em VÍDEO leve (43 MP4, média 248 KB) + pasta Biblioteca de Loop; modelo mudou → `gravar-capas.mjs --so=<id>`. **F-302 (11/11):** sistema fluido no tablet M10 (regente das animações + modo leve automático; `?leve=1` força). **F-300/F-301 (11/11):** LOCUTOR (ElevenLabs Starter, 5 vozes, função studio-locucao, teto diário) e exportação quadro a quadro (Full HD/60 qps/4K). Pendente: análise do QR Ofertas e do concorrente de vídeo (etapa 3 do pedido de 11/11).

> **P-31 (09/11/2026, PRÓXIMO PROJETO):** SOBRE MÍDIA em **computadores e telões de LED** (indoor/outdoor, qualquer processador de vídeo, várias telas sincronizadas). Fase 1 começou: página `/led` no ar (F-281). Plano em `docs/PROJETO_TELOES_LED.md` (Fase 1: Player para PC com Modo LED; Fase 2: sincronismo e videowall; Fase 3: controladoras assíncronas).
>
> **P-30 (09/11/2026):** ✅ (a) limpeza aplicada com autorização do dono; ✅ P-24 aplicada; ✅ fila de pedidos de foto (F-284). Restam: (a') títulos de artigo no catálogo (~344 linhas com ? : !), já ignorados pela busca;  `node scripts/ops/sql.mjs @scripts/ops/limpeza-catalogo-276.sql` — tira ~140 itens que não são produto (roupas, sacolas, chaveiros, "Your browser is disabled"); a trava automática do Claude recusou apagar em massa no banco. (b) DISCO DO PC CHEIO (C: 223 GB, ~0,4 GB livres em 09/11): liberar espaço fora do projeto; a busca contínua só volta com folga (≥ 10 GB). (c) Iniciar o ciclo: `node scripts/ops/catalogo-ciclo.mjs` (roda sem parar). (d) Bebidas: 1.460 produtos em conferência dupla; gravar com `node scripts/ops/marca-varejo-lote.mjs ../marcas --fase=filtrar` e `--fase=gravar` (só grava o que a IA aprovou).

Situação: 🟥 depende do dono · 🟧 dá para fazer já · 🟨 melhoria planejada.

### Catálogo de produtos
- **P-01 🟧 Marcas lidas e ainda não preparadas:** Start Química, Copobras, Strawplast, Foxlux, Dom Cândido e menores (`../marcas-v2/lista/comparacao.json`, campo `novas`). Retomar pela seção "COMO RETOMAR" de `docs/MISSAO_CATALOGO_DE_PRODUTOS.md`:
  1. `marca-preparar-lote`;
  2. conferir em tamanho grande;
  3. montar a `fila.json`;
  4. `marca-gravar-fila`;
  5. `consolidar-marcas`.
- **P-02 🟧 Cerca de 1.311 marcas sem site lido** (lista em `../marcas/lista/consolidado.json`, fora do repositório). A ordem é Pernambuco primeiro, depois saúde e farmácia. Use `scripts/ops/marca-descobrir-sites.mjs` e depois `marca-lote.mjs`.
- **P-03 🟧 Farmácia sem foto oficial:** Sensodyne (só achamos o site estrangeiro), Dorflex, Eno, Sonrisal e Cataflam (os sites só têm arte de página). Procure a página brasileira com a embalagem; nunca use a embalagem de fora.
- **P-04 🟥 Recortes F-253 prontos esperando gravação** (`../recortes-F-253`): a gravação foi barrada pela trava da ferramenta de IA e cabe ao dono.
- **P-05 🟥 Domínio próprio para o R2** (`r2.dev` não serve para produção). Decisões sobre Google Drive como entrada, contato com a GS1 Brasil e advogado ficam com o dono.

### Studio
- **P-06 ✅ resolvida em 08/11/2026 (F-261): Studio de vídeo por agentes completo no ar.** Feito:
  - aplicadas as migrações `20261349`, `20261350` e `20261357`;
  - memória semeada com `node scripts/studio/semear-conhecimento.mjs`;
  - orquestrador publicado e rota `/studio/agentes` ligada;
  - `STUDIO_SEGREDO` gravado no cofre, no servidor e no GitHub, com autorização do dono.

  Prova: pedido → plano → cenários → montagem no GitHub Actions (1 min 51 s) → MP4 1920×1080, 15 s, H.264 High, controle de qualidade aprovado. Se mudar o DNA ou os segmentos: rodar a semente de novo e republicar o `studio-orquestrador`.
- **P-07 🟥 "Editar com ChatGPT"** só funciona com saldo na conta OpenAI. A cota grátis de imagem da Cloudflare dá cerca de 2 imagens por dia; acima disso é preciso o plano pago (Workers Paid).
- **P-08 🟨 Encartes A4** (12 modelos) usam o editor do Cartaz Digital, que não gira nem arrasta produto a produto. Falta levar para o editor do Studio (`components/studio/editor`) para cumprir a regra de edição completa.
- **P-09 🟨 Mais fundos oficiais:** o dono enviará mais artes de encarte e de palco; cada uma é ADICIONADA seguindo `docs/studio/PADRAO_DE_ENCARTES_E_PALCOS.md`. Próximos segmentos naturais: açougue, hortifruti, padaria e pet.
- **P-10 🟨 Cartaz Digital:** as seções de Temas estão vazias esperando as artes do dono. Também faltam as logos 3D de cabeçalho que ele enviaria.

### Player Android
- **P-11 🟥 Versão de teste 5.8.22** (launcher, TV em pé, desvincular aparelho) espera teste em aparelho e aprovação para `--promover`. O 5.7.10 segue como comercial.
- **P-12 🟥 ROM Sobre Mídia v1.14** (TV Box RK3228A) gerada e ainda não testada em aparelho.
- **P-13 🟥 Zonas da tela** (Player 5.7.0 com divisão de tela) prontas, mas não publicadas; esperam teste em aparelho.
- **P-14 🟧 Fluidez no totem:** a playlist de teste de fluidez (1080p × 720p) ainda não foi medida no aparelho real. Apague a playlist temporária depois.

### Segurança e conta (decisões do dono)
- **P-15 🟥 Repositório público:** tornar privado é decisão do dono (o robô de conteúdo usa GitHub Actions).
- **P-16 🟥 Perfil GESTOR** é tratado como equipe em 28 regras de acesso. Se o "Gestor de Mídias" for cliente pagante, precisa virar perfil externo.
- **P-17 🟥 Vercel:** reduzir a retenção de publicações no painel da Vercel. Gerar chave nova do Supabase direto no cofre.

### Ideias aprovadas e ainda não feitas
- **P-18 🟨** Vídeo-tabela de preços para TV; busca de lojas por CEP e segmento no portal de ofertas; foto pela câmera para produto sem cadastro.

### SOBRE MÍDIA Autônoma (Projeto Mestre, F-262 — detalhes em `docs/autonomia/SOBRE_MIDIA_AUTONOMIA_RELATORIO_MESTRE.md`)
- **P-19 ✅ resolvida em 08/11/2026 (F-263): códigos de pareamento fechados.**
  - A tabela não tem acesso direto; o vínculo exige a regra de "alterar tela" e registra recusa e vínculo em `security_logs`.
  - O pareamento por código, que nunca completava, passou a funcionar (provado no navegador).
  - Prova repetível: `node scripts/ops/sql.mjs @scripts/ops/teste-pareamento.sql | node scripts/ops/resultado-sql.mjs` (22 OK).
- **P-20 🟨 PARCIAL (F-264): cópia da pesquisa de marcas.**
  - Os 723 arquivos de dados (2.483 marcas, lotes dos 398 sites, comparações) estão ÍNTEGROS no R2 privado `sobremidia-assets/backups/pesquisa-marcas/`.
  - 🟥 Faltam as 13.996 imagens (8,49 GB): passariam da cota grátis do R2 (já usa 5,40 GB de 10 GB), cerca de US$ 0,06/mês; depende do orçamento do dono.
  - Com o orçamento liberado: `node scripts/ops/backup-pesquisa-marcas.mjs enviar` e depois `… verificar`.
- **P-21 ✅ resolvida em 08/11/2026 (F-263):** a função antiga de assinatura (chave mestra sem login, nunca publicada) foi removida do repositório; o fluxo é `fn_assinar_contrato`.
- **P-22 ✅ no código (F-266):** a Central de Comando cria, lista e acompanha produções reais do Studio. No ar desde 08/11/2026 (P-26).
- **P-23 ✅ no código (F-267):** `montar_encarte` monta o encarte ou palco oficial com os preços escritos pela pessoa, e `animar_arte` transforma uma arte em vídeo (MP4 1920×1080 provado). No ar desde 08/11/2026. Não há renderização do encarte no servidor; a composição é no navegador.
- **P-24 🟥 PARCIAL (F-268): memória de estilo com consentimento.**
  - Código e Central prontos; ensaio 14/14.
  - Falta APLICAR a migração `supabase/migrations/20261362_preferencias_do_cliente.sql`: a trava da ferramenta exige a autorização do dono.
  - Depois, `node scripts/ops/sql.mjs @scripts/ops/teste-preferencias.sql | node scripts/ops/resultado-sql.mjs` tem de dar 14 OK.
  - ✅ Tela "Meu estilo" / "Estilo do cliente" pronta (F-271) em /studio/configuracoes: guarda só com consentimento, desliga e apaga. Enquanto a migração não estiver aplicada, mostra "A memória de estilo está sendo liberada" em vez de erro (provado no navegador).
  - A aplicação da migração foi barrada DE NOVO pela trava automática do Claude Code ("Production Deploy") em 08/11/2026, mesmo com a autorização total do dono. Para liberar: o dono roda o comando acima no próprio terminal ou libera a regra de permissão do Bash para `node scripts/ops/sql.mjs` nas configurações do Claude Code.
- **P-25 🟨 PARCIAL:**
  - provedores unificados (F-265) e ataques 7/7 (F-269) feitos;
  - injeção por imagem ou anexo não testada;
  - JARVIS: contrato completo, integração aguardando o JARVIS existir (F-270).
- **P-26 ✅ publicada em 08/11/2026, a pedido do dono:**
  - commits enviados (release e main);
  - `agente-ia` e `studio-orquestrador` publicadas;
  - site no ar com a Central de Comando, o encarte pelo link e a arte em vídeo.

  Prova no ar:
  - `CENTRAL_URL=…/functions/v1/agente-ia node scripts/ops/testar-injecao.mjs` deu 7/7 rejeitados;
  - campanhas "Segunda-feira" e "Terça-feira", que antes caíam em erro, foram planejadas;
  - `conferir-site.mjs` encontrou "Central de Comando" no ar.
- **P-27 ✅ resolvida em 08/11/2026 (pedido do dono):** as 12.194 fotos da cópia de segurança da pesquisa foram APAGADAS do R2 (7,82 GB); ficam só os 725 arquivos de dados. As fotos originais estão no PC (../marcas e ../marcas-v2). O R2 voltou a cerca de 5,4 GB, dentro dos 10 GB grátis.
- **P-28 ✅ FOTO DO PRODUTO POR LINK no ar (F-272/F-273):**
  - o passa-foto foi publicado (Worker `sobremidia-tabloide-ia`, rota `/foto`, 127 sites permitidos);
  - `catalogo-por-link.mjs converter --aplicar`: 3.180 das 3.268 cópias de marca do catálogo agora vêm por link (as 88 restantes ficam com a cópia; desfazer: `voltar`). As cópias do R2 (`catalogo/marcas`, 2,82 GB) NÃO foram apagadas: projetos antigos ainda apontam para elas;
  - marca nova entra SEMPRE por link: `marca-oficial.mjs gravar` (padrão link; `--copia` envia ao R2) e `marca-gravar-grupo.mjs` (site com várias marcas). Marca nova fora da lista: `catalogo-por-link.mjs hosts` + `publicar-worker-ia.mjs`.
- **P-29 🟨 MISSÃO CATÁLOGO — varredura rápida (F-273/F-274), em andamento:**
  - **leitor rápido de lojas oficiais:** `marca-loja.mjs` (Shopify, VTEX, WooCommerce: nome exato, peso, EAN);
  - **foto com fundo:** `marca-recortar-link.mjs` (passa-foto s=1 + inspeção `qualidadeRecorte.ts`);
  - **lote:** `marca-varredura.mjs` (loja, senão site) + `marca-preparar-varredura.mjs`; gravação por link: `marca-gravar-grupo.mjs`;
  - **robots.txt:** passou a respeitar curingas (antes `/*.atom` virava "proíbe tudo" e 49 sites foram pulados);
  - **resultado em 09/11/2026:** o catálogo de fotos oficiais chegou a 6.758 produtos de 221 marcas (6.661 por link; 1.011 com código de barras), depois de tirar 638 linhas de kits e combos. Lojas: suplementos (Max Titanium, Atlhetica, Vitafor, Nutrify, 3VS, Soldiers, Iridium, Probiótica, Bold, Integralmédica, Growth), Lavitan, Melitta, Pilão. Sites: Hinode, Lola, Cacau Show, Hypera (Buscopan, Benegrip, Engov, Epocler, Doril, Gelol, Coristina, Descon, Cepacol…), Arcor, Purina, Monange, Flora, Piracanjuba, Frescatto, Coca-Cola, Centrum, Hipoglós, Benalet e outras;
  - kits, combos, roupas e acessórios são recusados pelo nome; páginas institucionais também; a conferência é feita por amostra nas folhas;
  - **⛔ cota da Cloudflare Images acabou em 08/11/2026** (5.000 transformações diferentes por mês, no plano grátis). As transformações já feitas continuam servindo; as novas voltam à foto original. Ficam PENDENTES de recorte, para quando a cota renovar (01/12/2026) ou o dono ativar o plano pago, as fotos com fundo de Melitta (114), Jequiti, Dailus (400), Chalesco (556), Muriel (267), Ourolux (320), Embelleze, Superbom, Contém 1g, Vizzela, Mustela, Café Orfeu, Desinchá, Águas Prata, Pamplona, Frescatto, Rayovac, Ninho e outras. Para retomar: `node scripts/ops/marca-recortar-link.mjs ../marcas/<pasta>` em cada pasta com `com-fundo.json`, depois conferência e `marca-gravar-grupo.mjs`;
  - **sites que bloqueiam robôs** (não contornar): Buscopan.com.br, Aspirina, Bepantol, Redoxon, Dramin, Tylenol, Listerine, Band-Aid, Cimed, Nestlé, Barilla, Grupo Petrópolis.