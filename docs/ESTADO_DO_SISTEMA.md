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
| F-263..F-270 | 08/11/2026 | **Missão SOBRE MÍDIA Autônoma (execução)** — relatório final em `docs/autonomia/RELATORIO_FINAL_AUTONOMIA.md`:
- pareamento fechado e funcionando (aplicado);
- assinatura antiga removida;
- dados da pesquisa copiados para o R2 privado;
- registro de agentes e provedores em fonte única;
- **Central de Comando** que cria produções, monta encarte oficial e transforma arte em vídeo;
- memória de estilo com consentimento (ensaiada, não aplicada);
- 7/7 ataques rejeitados;
- contrato do JARVIS.

As funções agente-ia e studio-orquestrador e o site com essas mudanças **ainda não foram publicados** (P-26) |
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
- **P-22 ✅ no código (F-266):** a Central de Comando cria, lista e acompanha produções reais do Studio. Foi provada com a função local, ligada ao banco real. Para entrar no ar: P-26.
- **P-23 ✅ no código (F-267):** `montar_encarte` monta o encarte ou palco oficial com os preços escritos pela pessoa, e `animar_arte` transforma uma arte em vídeo (MP4 1920×1080 provado). Para entrar no ar: P-26. Não há renderização do encarte no servidor; a composição é no navegador.
- **P-24 🟥 PARCIAL (F-268): memória de estilo com consentimento.**
  - Código e Central prontos; ensaio 14/14.
  - Falta APLICAR a migração `supabase/migrations/20261362_preferencias_do_cliente.sql`: a trava da ferramenta exige a autorização do dono.
  - Depois, `node scripts/ops/sql.mjs @scripts/ops/teste-preferencias.sql | node scripts/ops/resultado-sql.mjs` tem de dar 14 OK.
  - Tela própria no Studio para o anunciante: pendente.
- **P-25 🟨 PARCIAL:**
  - provedores unificados (F-265) e ataques 7/7 (F-269) feitos;
  - injeção por imagem ou anexo não testada;
  - JARVIS: contrato completo, integração aguardando o JARVIS existir (F-270).
- **P-26 🟥 PUBLICAR o que foi feito em F-265..F-270** (a missão não autorizou publicar). Na ordem:
  1. `npx supabase functions deploy agente-ia --project-ref bhwsybgsyvvhqtkdqozb --no-verify-jwt`;
  2. `npx supabase functions deploy studio-orquestrador --project-ref bhwsybgsyvvhqtkdqozb --no-verify-jwt` (leva a correção do `validarPlano`; sem ela, campanha com nome em maiúscula cai em erro);
  3. `node scripts/ops/publicar-main.mjs` (site: Central de Comando, link do encarte, arte → vídeo);
  4. conferir com `node scripts/ops/testar-injecao.mjs` apontando para a função no ar (`CENTRAL_URL`).
  Antes disso, os commits locais precisam ser enviados ao GitHub.
- **P-27 🟥 Cópia das IMAGENS da pesquisa (F-264):** 13.996 imagens (8,49 GB) passariam da cota grátis do R2 (≈ US$ 0,06/mês). Com o orçamento liberado: `node scripts/ops/backup-pesquisa-marcas.mjs enviar` e depois `… verificar`.

## 5. Ritual de fim de sessão (obrigatório para qualquer IA)

1. Registrar a entrega em `docs/engineering/FINDINGS_LEDGER.md` (novo F-NN: pedido, causa, feito, prova, limite).
2. Atualizar **este arquivo**:
   - acrescentar a linha na tabela da seção 3;
   - riscar, criar ou ajustar pendências na seção 4, mantendo a numeração (pendência resolvida vira "✅ resolvida em DD/MM (F-NN)").
3. Regra nova do dono → `docs/DECISOES_DO_DONO.md`. Padrão novo de arte → `docs/studio/PADRAO_DE_ENCARTES_E_PALCOS.md` e, se for de estilo, `dna.ts`.
4. Testes, commit em português e publicação com `node scripts/ops/publicar-main.mjs`.

*Última atualização: 08/11/2026, depois da F-270.*
