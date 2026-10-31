# MG-STUDIO-01 — Auditoria e mapa da arquitetura (SOBRE MÍDIA CREATIVE CORE)

Data: 31/10/2026. Pedido do dono: "PROJETO MASTER — Ecossistema SOBRE MÍDIA STUDIO".

Esta etapa é **só leitura**. Nenhum código, banco, Worker ou provedor foi alterado. Este documento é a única peça nova.

---

## 1. Resumo para o dono

1. **O "Creative Core" já existe em boa parte, mas está desligado.** Em 30/10/2026 foi construído um "Studio de IA Cinematográfica" com:
   - **Agentes:** Especialista em Produtos, Diretor Criativo, Roteirista, Diretor de Fotografia e Especialista em Prompts;
   - **Bíblia visual versionada**;
   - **Contrato de dados:** preço e loja **nunca** passam por IA;
   - **Cadastro de provedores** com bloqueio de gasto;
   - **Montagem de MP4** por Playwright + FFmpeg no GitHub Actions;
   - **Conferência do preço** por pixels e OCR.

   Ele está no Git (commit `21f3713`), mas:
   - a migração `20261349_studio_ia_producoes.sql` **nunca foi aplicada**;
   - a função `studio-orquestrador` **não está no ar** (404);
   - a tela `StudioPaginas.tsx` **não tem rota**.

2. **O caminho mais curto é LIGAR e EVOLUIR o que existe, não criar outro.** O Creative Core passa a ser:
   - o `studio-orquestrador`;
   - os agentes de `_shared/studio`;
   - a bíblia evoluída para um DNA visual versionado.

3. **Há três caminhos de IA paralelos hoje.** Eles precisam virar **um único gateway** (regra 2 do pedido):
   - `studio-ai`: OpenAI pago e Agente de Referências na Cloudflare;
   - `agente-ia`: Groq, Gemini e OpenRouter grátis;
   - `_shared/studio/provedores.ts`: cadastro com bloqueios.

4. **Há dois sistemas de cota.** Um está no ar: `studio_ai_carteiras`, `studio_ai_movimentos` e `studio_ai_config` (créditos de R$ 4,99 e teto de US$ 50/mês). O outro está só no papel: `studio_uso`, na migração não aplicada. Pela regra 3, o `studio_uso` **não** deve nascer; o Core usa o livro de créditos que já existe.

5. **Vídeo:**
   - **Modo A** (animação determinística, estilo Canva): já está pronto no editor de imagens (F-225) e no editor de vídeo (F-227), com MP4 1080p, som e projeto editável.
   - **Modo B** (vídeo por IA): **não tem provedor**. Depende de decisão e orçamento do dono.

6. **Personagens com continuidade:** não existe nada. Com os modelos grátis atuais (FLUX schnell), **não há** recurso de imagem de referência para manter o mesmo personagem. A continuidade real exige um provedor que aceite referência (OpenAI GPT Image *edits*, que é pago) ou um provedor de vídeo. Não vou prometer consistência sem prova.

---

## 2. O que existe (com evidência)

### 2.1 Telas (React, no ar em sitesobremidia.vercel.app)

| Área | Rota / arquivo | Situação |
|---|---|---|
| Catálogo de modelos em pastas, 87 modelos × 16:9 e 9:16, miniaturas prontas | `/studio` · `pages/studioai/CatalogoPage.tsx` · `lib/studio/pastas.ts`, `catalogo.ts`, `miniaturas*.ts` | ✅ no ar (F-221, F-224, F-226) |
| Editor de imagem em camadas (estilo Canva): textos, formas, selo, lista, foto, cores, fontes, efeitos, animações, 16:9 e 9:16 | `/studio/editar/:id` · `pages/studioai/EditorPage.tsx` · `components/studio/editor/*` · `lib/studio/documento.ts`, `desenhar.ts`, `animacao.ts` | ✅ no ar (F-221, F-224, F-225) |
| Vídeo da arte animada (MP4 no navegador) | `lib/studio/video.ts` | ✅ no ar (F-225) |
| Editor de VÍDEO (linha do tempo, cortes, filtros, transições, música, textos, MP4 com som) | `/studio/video` · `pages/studioai/VideoEditorPage.tsx` · `lib/studio/video/*` · `components/studio/video/*` | ✅ pronto, publicação na fila do teto da Vercel (F-227) |
| Criar com IA (ChatGPT pago R$ 4,99 por criação + Agente SOBRE MÍDIA grátis) | `/studio/ia` · `pages/studioai/IAPage.tsx` | ✅ no ar (F-220, F-222) |
| Meus Projetos | `/studio/projetos` | ✅ no ar |
| Configurações (instruções do agente, versionadas) | `/studio/configuracoes` | ✅ no ar |
| Studio por agentes (pedido → plano → cenas → montagem) | `pages/studio/StudioPaginas.tsx` · `components/studio/{StudioCentral,BriefingWizard,ProducaoView,EditorCena,PreviaCena,ArteModelo}.tsx` · `lib/studio/api.ts` | ⚠️ código pronto, **sem rota** e sem banco |
| Trabalhar com IA (agente de operação grátis) | `/dashboard/ia` | ✅ no ar (F-223) |
| Galeria em pastas por segmento (Imagens e Vídeos) | `components/media/GaleriaEmPastas.tsx` | ✅ no ar (F-225) |

### 2.2 Servidor (Supabase Edge Functions)

| Função | O que faz | Situação |
|---|---|---|
| `studio-ai` | Gera e edita imagens pelo **OpenAI GPT Image** (pago, créditos, teto mensal, idempotência) + **Agente Analista de Referências** (visão Llama 4 Scout + lucid-origin na Cloudflare) com reservas grátis Groq/Gemini/OpenRouter | ✅ no ar (200) |
| `studio-orquestrador` | Coordena os 5 agentes (lease de 4 min, retomável), gera cenários no FLUX, dispara a montagem, recebe a conferência | ❌ **não publicada** (404) |
| `agente-ia` | Agente "Trabalhar com IA" (Groq → Gemini → OpenRouter, ferramentas, ações só com Confirmar) | ✅ no ar |
| `produto-imagem` | Imagem de produto do Cartaz Digital (recorte) | ✅ no ar |
| `process-media` + workflow `compress-video.yml` | Compressão de vídeo (FFmpeg, H.264) com MD5 para o Player | ✅ no ar |
| `analisar-midia` | Análise de conteúdo própria (imagem, vídeo e áudio), sem IA externa | ✅ no ar |
| `_shared/studio/agentes.ts` (225 linhas) | Os 5 agentes com saída JSON validada; os agentes **nunca recebem o valor do preço** | ⚠️ pronto, sem uso no ar |
| `_shared/studio/biblia.ts` | Bíblia visual v1 (princípios, estilos por segmento), versionada | ⚠️ pronto, sem uso no ar |
| `_shared/studio/contrato.ts` (381 linhas) | Contrato pedido/plano/cena, formatos 16:9, 9:16 e 1:1, validação "nada de preço/loja/marca inventados" | ⚠️ pronto |
| `_shared/studio/layout.ts` | Desenho DETERMINÍSTICO da cena em HTML (preço e loja por código) | ⚠️ pronto |
| `_shared/studio/provedores.ts` | Cadastro de provedores: tipo, custo, segredos exigidos e **bloqueio explícito** (vídeo IA, voz, música, Canva e lucid-origin pago estão bloqueados) | ⚠️ pronto |
| `_shared/studio/openai.ts` | Adaptador GPT Image (preços conferidos em 30/10) | ✅ em uso pelo `studio-ai` |
| `_shared/studio/agente-referencia.ts` | Agente de Referências (F-220) | ✅ em uso |
| `_shared/agente/ferramentas.ts` | Provedores grátis de texto (Groq, Gemini, OpenRouter) | ✅ em uso pelo `agente-ia` |

### 2.3 Cloudflare e GitHub Actions

| Peça | Situação |
|---|---|
| Worker `sobremidia-tabloide-ia`, ação `studio-modelo` | ✅ no ar. Lista fechada de modelos: Llama 4 Scout, FLUX schnell e lucid-origin. Cota grátis de 10.000 neurons/dia (≈ 30 fotos FLUX/dia). A cota não renovou à 00:00 UTC em 31/10 (F-221). |
| `studio-montar.yml` | ⚠️ pronto (Playwright desenha os quadros e o FFmpeg monta o MP4 e o PNG), mas nunca disparado, porque o orquestrador não está no ar |
| `studio-fotos.yml` | ✅ roda a cada 3 h: fotos das pastas (FLUX) e, agora, as miniaturas prontas (F-226) |
| `compress-video.yml` | ✅ no ar |

### 2.4 Banco (Supabase)

| Tabela / função | Situação |
|---|---|
| `studio_projetos`, `studio_projeto_salvar` | ✅ projetos de imagem **e de vídeo** (F-227) |
| `studio_modelos` | ✅ modelos novos do owner/ADM |
| `studio_agentes` | ✅ instruções **versionadas** dos agentes, editáveis por owner/ADM (F-220) |
| `studio_ai_conversas`, `_jobs`, `_imagens` | ✅ histórico de criações por IA |
| `studio_ai_carteiras`, `_compras`, `_movimentos`, `_config` | ✅ **sistema de cota e custo** (créditos de R$ 4,99, teto de US$ 50/mês, modelos habilitados) |
| `studio_ai_escopo()`, `studio_ai_pode_ver()` | ✅ escopo multiempresa (empresa, cliente e usuário tirados da sessão) |
| `galeria_pastas`, `galeria_midias` | ✅ galeria em pastas por segmento, só o próprio usuário (F-225) |
| `media`, `cliente_assets`, `biblioteca_*` | ✅ biblioteca de mídia, playlists e Player |
| `agente_ia_acoes`, `agente_ia_registros` | ✅ ações com confirmação e auditoria (F-223) |
| `studio_producoes`, `studio_etapas`, `studio_uso` | ❌ **só na migração `20261349`, não aplicada** |
| pg_cron `studio-ai-varrer` | ✅ no ar. O cron do orquestrador não existe. |

### 2.5 Agentes de desenvolvimento (`.agents`)

`.agents/` é a **governança do trabalho de programação** (orquestrador Antigravity com gates G0–G11, regras de git e evidência, skills de Player, banco e auditoria forense). Ela **não** é inteligência do produto.

Não existe nenhum `sobre-midia-orchestrator` de produto. As skills `orchestrator-core` e `sobremidia-domain` servem só para guiar quem programa.

Conclusão: o Creative Core do produto mora no **servidor** (`studio-orquestrador` + `_shared/studio`), não em `.agents`. Não há duplicação a temer ali.

---

## 3. Lacunas frente ao pedido

| Pedido (seção) | Existe | Falta |
|---|---|---|
| §6 Creative Core e agentes especializados | 5 agentes (produto, diretor, roteirista, fotografia, prompts) + validação | Ligar no ar; somar os papéis Briefing, Segmento, Personagens, QA visual, Marca e Publicação como **personas** no mesmo orquestrador (não serviços novos); modo sem API (planejamento, templates e editor determinístico já cobrem boa parte) |
| §4 / §12 DNA visual persistente | `biblia.ts` v1 (Git) + `studio_agentes` (instruções versionadas no banco) | Manual de direção de arte completo, por segmento; memória separada por global/empresa/cliente/campanha; aprendizado só com aprovação |
| §5 Segmentos extensíveis | `catalogo.ts` (13 segmentos FIXOS no código) + estilos da bíblia | Taxonomia no **banco** (segmento → categorias → estilos, paletas, ambientes, prompts-base, regras, provedores indicados), editável sem mexer no código |
| §13 / §14 Gateway de provedores | 3 caminhos separados (ver §1.3) | Um único cadastro e seleção (capacidade → provedor habilitado → cota → custo → autorização), com registro de tarefas assíncronas |
| §8 Imagens (modos A a F) | A (texto → imagem: FLUX grátis e GPT pago), B/E (referência: Agente F-220 e GPT *edits*), D (composição determinística: editor de camadas, Cartaz Digital), F (variações) | C (fotografia comercial preservando o produto real: recorte + cenário, previsto em R-12) num fluxo único; histórico de versões por criação |
| §3.3 Elementos 3D e PNG transparente | Selo, faixas e textos com degradê/contorno no editor | Biblioteca de elementos (títulos metálicos/cromados/dourados, molduras, etiquetas) com **transparência real** (GPT Image `background: transparent` é pago; o FLUX não tem alfa → recorte) |
| §3.4 / §11 Redes sociais e formatos | 16:9 e 9:16 (editor); 1:1 no contrato | 4:5, 1:1 no editor, A4/A3, personalizado; adaptação entre formatos já existe para 16:9 ↔ 9:16 (`sincronizar.ts`) |
| §9.1 Motion Modo A (15 s/20 s, presets) | Animações por elemento, "Animar tudo", editor de vídeo completo, MP4 com som | Presets nomeados do pedido (preço pulsante, encerramento com logo, parallax 3D, partículas/brilhos) e roteiros 15 s/20 s automáticos |
| §9.2 Vídeo por IA | Cadastro com bloqueio | Provedor, orçamento e chave (decisão do dono) |
| §10 Personagens e apresentadores | — | Ficha permanente + imagens aprovadas + continuidade (depende de provedor com referência) |
| §15 Qualidade | Validação do plano + conferência do preço (SSIM/OCR) na montagem + análise de conteúdo | QA de "o resultado corresponde ao pedido" (visão Llama/Qwen grátis compara pedido × imagem, com nota e evidência, sem certeza absoluta) |
| §16 Biblioteca e distribuição | `media`/`cliente_assets` + galeria em pastas + publicar em tela/playlist | Filtros por tipo (logos, elementos, personagens, campanhas) usando a mesma galeria |
| §17 Página inicial com as 20 áreas | Início do Studio com categorias e carrosséis | Áreas dinâmicas a partir da taxonomia (não lista fixa) |

---

## 4. Referências visuais (§3)

Abri e analisei as referências em 31/10/2026. As **cópias não foram salvas no repositório**: os direitos de uso não estão confirmados e as URLs são temporárias. O registro das URLs fica na conversa e em `REFERENCE_LIBRARY` no MG-STUDIO-02.

| # | Categoria | Abriu? | O que se vê | O que aprender | Cuidados |
|---|---|---|---|---|---|
| 3.1 | Studio de Criação | ✅ 1024×1024 | Tela "Multimodal Creative Generation Workspace": menu lateral, "Create New" (texto→imagem, imagem→imagem, roteiro→vídeo, locução, kit de marca), prompt + propriedades (modelo, estilo, resolução, qualidade, seed), fila de geração, linha do tempo e comentários | Um único espaço com **prompt + propriedades + histórico + fila**; estilos em "chips"; paleta da marca; fila mostrando o andamento real | Tela conceitual (tem marcas fictícias de modelo). Não copiar o layout; usar a hierarquia |
| 3.2 | Artes Comerciais | ✅ 1024×1280 | Pôster "Super Promoções" com data no topo, título serifado grande, cena de produtos em pedestal com elementos tropicais, selo "-50%" e etiqueta "+ de 100 produtos" | Hierarquia **data → título → cena → selo**; produtos reais em pedestal; cor de fundo única e forte; selo de desconto em vermelho com contraste | Mostra embalagens e marcas de terceiros: usar só a composição |
| 3.3 | Logos e Elementos 3D | ✅ 900×900 | Título 3D "SALDÃO DE ESTOQUE" dourado com luzes de letreiro, aro vermelho metálico e placa cromada | Materiais (dourado, cromo, metal escovado), letreiro com lâmpadas, chanfro e sombra interna | ⚠️ **O quadriculado é desenhado na imagem** (transparência falsa), exatamente o que o pedido proíbe. Nossa biblioteca exige alfa real |
| 3.4 | Redes Sociais | ✅ 794×520 | Divulgação de um **produto pago de terceiros** ("Branded Instagram Carousel Template — 25 layouts", logotipo do Canva): carrossel editorial, tons terrosos, tipografia manuscrita + serifada | Carrossel com continuidade entre quadros; mistura de foto de produto + depoimento + "novidade" | É um produto comercial de terceiros: **não** reproduzir os layouts |
| 3.5 | Criação de Personagens | ❌ **erro 400** no servidor da imagem | — | — | **Pendente: o dono precisa reenviar o link ou a imagem** |
| 3.6 | Fotografia de Produtos | ✅ 1290×860 | Estúdio de fotografia: perfume sobre pedestal branco, câmera no tripé, sombrinhas difusoras, prateleiras com cosméticos, notebook com edição | Luz difusa de estúdio, pedestal limpo, produto herói nítido, cenário contextual desfocado | Ilustração conceitual; serve de referência de luz e cena |
| 3.7 | Animação e Vídeos | ✅ 1147×860 | Editor de vídeo (projeto "Zoox Promo Video"): mídias, prévia com veículo em luz neon azul, linha do tempo com vídeo, áudio e camadas, painel de comentários | Linha do tempo com faixas (vídeo, áudio, camadas), prévia central, efeitos à esquerda: o mesmo modelo do nosso editor F-227 | Mostra um veículo de **marca real** (Zoox): não usar como imagem de entrada |

---

## 5. Riscos técnicos

Os riscos R-01 a R-15 de `docs/studio-ai/RISCOS_E_DEPENDENCIAS.md` continuam valendo.

Os principais são:
- **R-03 — bucket R2 público único:** referências privadas exigem um bucket privado;
- **R-09 — marcas de terceiros**;
- **R-10 — preço errado**;
- **R-11 — custo de vídeo por IA**;
- **R-13 — cota grátis da Cloudflare**.

Novos riscos:

| # | Risco | Tratamento |
|---|---|---|
| N-01 | Três caminhos de IA divergindo (modelos trocados num e não no outro, como no F-222/F-223) | Gateway único (MG-STUDIO-04) |
| N-02 | Duas cotas (`studio_ai_*` × `studio_uso`) | Não aplicar `studio_uso`; registrar neurons e chamadas grátis em `studio_ai_movimentos` (tipo próprio) ou numa visão sobre o livro existente |
| N-03 | A migração `20261349` foi escrita antes do F-224–F-227 e pode chocar com a galeria/pastas novas | Revisar pela skill `migracao-segura` antes de aplicar |
| N-04 | Cota grátis da Cloudflare zerada no dia: orquestrador e fotos competem pela mesma cota (≈ 30 imagens/dia) | Prioridade e reserva diária por tipo no gateway; o dono pode avaliar o Workers Paid (US$ 5/mês) |
| N-05 | Continuidade de personagem sem provedor com referência | Declarar a limitação; com provedor grátis, oferecer só o "modo ficha + editor" |
| N-06 | Teto de 12 publicações/dia da Vercel | Juntar entregas: cada micro-gate = 1 publicação |
| N-07 | O Player não muda; vídeos MP4 H.264 + AAC e imagens já são aceitos (F-225, F-227) | Rodar `contrato-player.mjs` em todo gate |

---

## 6. Plano de integração (menor caminho)

Cada gate só começa com o "ok" do dono. Cada gate termina com um teste real e uma publicação.

| Gate | O que fazer (reaproveitando) | Novo | Prova de encerramento |
|---|---|---|---|
| **MG-STUDIO-02 DNA visual** | Evoluir `biblia.ts` (v1 → v2) e usar `studio_agentes` (já versionado, editável) para cada persona | Documentos `docs/studio/creative-core/*` (DNA visual, manual de direção de arte, taxonomia, regras de imagem/vídeo/personagem/qualidade, biblioteca de referências); tabela `studio_segmentos` (taxonomia extensível, semeada com os 13 de `catalogo.ts` + os 10 do pedido) | O orquestrador lê a regra do banco (não do prompt): teste unitário + consulta real |
| **MG-STUDIO-03 Creative Core** | Revisar e aplicar a migração `20261349` (sem `studio_uso`); publicar o `studio-orquestrador`; criar a rota de `StudioPaginas.tsx` dentro de `/studio` | Personas Briefing, Segmento, QA e Marca como funções do mesmo `agentes.ts` | Pedido "depilação a laser" → briefing de clínica estética, sem roupa/cosmético, sem alegação clínica (Teste C, só planejamento) |
| **MG-STUDIO-04 Gateway** | Juntar `provedores.ts` + reservas F-222 + `agente/ferramentas.ts` + `openai.ts` | `_shared/ia/gateway.ts` (contrato comum: capacidade, cota, custo, autorização, tarefa assíncrona) | Trocar o provedor de visão sem mudar o fluxo; provedor pago bloqueado sem autorização (Teste G) |
| **MG-STUDIO-05 Imagens** | Modos A, B, D, E e F já existentes passam pelo Core | Modo C (produto real recortado + cenário gerado), histórico de versões | Teste A (supermercado com preço exato) e Teste B (academia) |
| **MG-STUDIO-06 Segmentos e modelos** | Catálogo e pastas atuais leem a taxonomia do banco | Tela de administração da taxonomia (owner/ADM) | Novo segmento cadastrado aparece sem mexer no código |
| **MG-STUDIO-07 Motion** | Editor de vídeo F-227 + animações F-225 | Presets do pedido (preço pulsante, encerramento com logo, parallax, partículas/brilho), roteiros 15 s/20 s gerados pelo Core e abertos no editor | Teste D (restaurante 15 s) e Teste F (imagem → 15 s sem IA de vídeo) |
| **MG-STUDIO-08 Vídeo IA + personagens** | Cadastro com bloqueio | Fichas de personagem (tabela + referências), adaptador do provedor escolhido | Teste E, **só depois** da decisão de provedor e orçamento |
| **MG-STUDIO-09 Biblioteca** | Galeria em pastas F-225 + publicar em tela/playlist | Filtros por tipo (logos, elementos, personagens, campanhas) | Criação aprovada reutilizada e publicada numa playlist |
| **MG-STUDIO-10 Homologação** | — | Relatório com os testes A–G | Evidências de cada gate |

### Arquivos que serão modificados (quando cada gate for autorizado)

- `supabase/functions/_shared/studio/{biblia,agentes,provedores,pipeline,contrato}.ts`
- `supabase/functions/studio-orquestrador/index.ts`
- `supabase/functions/studio-ai/index.ts`, `supabase/functions/agente-ia/index.ts` (só para usar o gateway único)
- `supabase/migrations/20261349_studio_ia_producoes.sql` (revisão antes de aplicar)
- `src/App.tsx` (rota do Studio por agentes dentro de `/studio`), `src/pages/studio/StudioPaginas.tsx`, `src/components/studio/*`
- `src/lib/studio/catalogo.ts` (passa a ler a taxonomia), `src/pages/studioai/CatalogoPage.tsx`
- `cloudflare/tabloide-ia/worker.js` (só se o gateway precisar de rota/modelo novo; exige publicar o Worker)

### Arquivos novos necessários

- `docs/studio/creative-core/` (DNA visual, manual de direção de arte, taxonomia, regras, biblioteca de referências)
- `supabase/migrations/2026xxxx_studio_segmentos.sql`, `…_studio_personagens.sql` (MG-08)
- `supabase/functions/_shared/ia/gateway.ts`
- Testes unitários de cada gate

---

## 7. Decisões que dependem do dono

1. **Aprovar este plano** e o primeiro gate de implementação (recomendo o **MG-STUDIO-02 + MG-STUDIO-03** juntos: custo R$ 0, ligam o que já existe).
2. **Aplicar a migração `20261349`** (revisada, sem `studio_uso`) e **publicar o `studio-orquestrador`**: muda o banco e o servidor (mudança arquitetural, §23.5 do pedido).
3. **Provedor de vídeo por IA e orçamento** (Kling, Seedance, Gemini ou outro): sem isso, o Modo B e os personagens animados ficam bloqueados. Nada será simulado.
4. **Bucket R2 privado** para referências e rascunhos (R-03).
5. **Reenviar a referência 3.5 (Personagens)**: o link devolve erro 400.
6. Origem dos 52 vídeos "VIDEOS EM PE" da Biblioteca (R-02), antes de usá-los como modelo.
7. Opcional: Cloudflare Workers Paid (US$ 5/mês) para não disputar a cota grátis de imagens.
