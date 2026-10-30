# MG00 — Auditoria arquitetural do Studio Criativo e da AI Cinematográfica

Data: 30/10/2026. **Somente leitura.** Nenhum código, banco, Edge Function, pacote, chave, deploy ou commit foi alterado.
Consultas ao banco: apenas `SELECT` via `scripts/ops/sql.mjs`.

## 0. Ponto de partida

| Item | Valor |
|---|---|
| Branch | `release/player-5.2.4`, no mesmo commit de `origin/main` (`0f022ac`, F-217) |
| Alterações que já existiam e foram preservadas | `M src/lib/biblioteca.ts`, `M supabase/.temp/cli-latest` (nunca entram em commit) e 424 arquivos não rastreados |
| Trabalho anterior desta frente (sem commit) | `docs/studio/MG00_AUDITORIA.md`, `docs/studio/PLANO_FABRICA_IA.md`, `src/lib/studio/*`, `src/components/studio/ArteModelo.tsx`, `public/studio/fotos/*` |

Estes 5 documentos **consolidam e corrigem** os de `docs/studio/`, que ficam como histórico. Uma correção importante: o
autofill do Canva **não** exige Enterprise (ver §7).

Legenda usada em todos os documentos:
- ✅ **EXISTENTE E FUNCIONAL**
- 🟡 **EXISTENTE MAS INCOMPLETO**
- ❌ **NÃO EXISTE**
- 🔍 **PRECISA SER VALIDADO**
- 🔒 **NÃO DEVE SER ALTERADO**

## 1. Referência comercial: https://adega-video-tv.lovable.app/

Página aberta e lida em 30/10/2026.

**O que é:** um produto que vende **links de modelos do Canva**: "+150 vídeos prontos", em 16:9 e 9:16, a R$ 49,90/mês ou
R$ 97 vitalício. O fluxo é: "Abre o vídeo no Canva → Troca o preço e sua logo → Exporta e coloca na TV".

**O que isso ensina:**
1. A "edição" vem de modelos **montados dentro do Canva** e compartilhados como link de modelo. **Não** vem da conversão de
   MP4 em projeto editável.
2. Linguagem visual:
   - fundo escuro com bokeh;
   - produto em destaque (garrafa com condensação, gelo, respingo);
   - título condensado em caixa alta, branco e amarelo;
   - selo de preço vermelho;
   - movimento constante.
3. Organização por categorias de produto (gin, whisky, cerveja, copão, tabacaria) e datas (Halloween). Versões 9:16
   servem para "TV em pé, Stories, Reels e Status".

**O que NÃO devemos copiar:** a página usa marcas de terceiros (Brahma, Itaipava, marcas de gin e whisky). A SOBRE MÍDIA não
pode gerar marcas, rótulos ou logos de terceiros. Produto de marca só entra quando **o cliente envia a foto do próprio
produto que vende**, e sem gerar o rótulo por IA.

## 2. Pasta local de referências (`Documentos\SOBRE-MIDIA-IA-CINEMATOGRAFICA`)

Lida, e não movida, renomeada nem alterada.

| Item | Quantidade |
|---|---|
| Arquivos / tamanho | 76 arquivos, 395 MB (imagens 20 MB, vídeos 375 MB) |
| Imagens em `IMAGENS/` | 19: capturas de tela, `products-story-*.webp` e `preview-*.webp` (nomes de arquivos de site gerado por Vite, provavelmente baixados da página de referência), 2 JPG grandes |
| Vídeos em `VIDEOS/` | 51 MP4 em 7 pastas por segmento (Academia, Hamburgueria, Loja de Variedades, Mercado, Açaiteria, Açougue, Pizzaria), mais 2 JPG |
| Origem pelo nome dos vídeos | 25 `ssstik.io`/`tiktok_*` (baixados do TikTok), 3 `PinDown.io` (Pinterest), 17 com nome de hash |
| `VIDEOS WEB DE BEBIDAS/*.html` | 4 páginas salvas do **Vimeo** ("VIDEO PAGINAS CERVEJAS from AdeguinIA", "_Itaipava 269ml"…). São páginas, não vídeos |

**Conclusão:** quase todo o acervo é de **terceiros**. A licença é "só estudo".
- Pode inspirar fichas em texto (luz, movimento, ritmo).
- Não pode ser publicado nem usado como imagem de entrada de um gerador.

🔍 **Achado que precisa de validação:** a Biblioteca de produção tem 7 pastas "VIDEOS EM PE …" com **exatamente as mesmas
quantidades** da pasta local:

| Pasta | Itens na Biblioteca | Arquivos na pasta local |
|---|---|---|
| Academia | 9 | 9 |
| Hamburgueria | 9 | 9 |
| Loja de Variedades | 9 | 9 |
| Mercado | 6 | 6 |
| Açaiteria | 1 | 1 |
| Açougue | 11 | 11 |
| Pizzaria | 7 | 7 |

Os nomes foram trocados para "Academia 03"… Hoje **nenhum** desses vídeos está em playlist (0 usos), mas eles estão
disponíveis para a equipe publicar. Se forem os mesmos downloads do TikTok, há risco de direito autoral ao exibi-los.
O dono precisa confirmar a origem.

## 3. Biblioteca e armazenamento

| Peça | Situação | Evidência |
|---|---|---|
| Arquivos no **Cloudflare R2**, num bucket único (`R2_BUCKET_NAME`) servido por domínio público (`R2_PUBLIC_DOMAIN`) | ✅ | `supabase/functions/get-upload-url/index.ts:149-216` (URL assinada PUT de 300 s e `publicUrl`) |
| Regra do caminho no envio: `{user_id}/…`, `tenants/{empresa}/…` ou caminho antigo sem outro dono em `media`. ADM tem acesso amplo, exceto `releases`, `audit_logs`, `screenshots` e `contrato_templates` | ✅ (ver risco R-04) | `fn_r2_validate_object_scope` no banco |
| Download privado (link assinado SigV4) | 🟡 só para contratos | `supabase/functions/get-download-url/index.ts` |
| Supabase Storage | ✅ secundário. Buckets **públicos**: `media`, `campanhas_midia`, `avatars`, `proof_of_play`, `screenshots`, `escudos-times`. Privado: `audit_logs` | `storage.buckets` |
| Tabela `media` (equipe, Biblioteca, Player) | ✅ 416 linhas, 398 com `thumbnail_url` | colunas: `file_url`, `file_path`, `mime_type`, `aspect_ratio`, `duration_ms`, `file_hash`, `biblioteca`, `processing_status` |
| Tabela `cliente_assets` (Minhas Mídias do anunciante) | ✅ 5 linhas, com moderação (`moderacao_status/motivo/detalhes`, `quadros`) | `src/modules/crm/pages/portal/AssetLibraryPage.tsx` |
| Biblioteca em pastas | ✅ `biblioteca_pastas` (com `conteudo_automatico`) e `biblioteca_itens` (`pasta_id`, `media_id`, `tags`) | `src/pages/dashboard/Biblioteca.tsx`, `src/components/biblioteca/*` |
| Relação mídia → playlist → tela | ✅ `playlist_items.media_id` **ou** `playlist_items.biblioteca_pasta_id` (pasta inteira na tela) | banco; `src/lib/adicionarNaPlaylist.ts` |
| Compressão de vídeo | ✅ `process-media` → `repository_dispatch novo_video` → `.github/workflows/compress-video.yml`: H.264 High 4.1, CRF 19, teto de 8 Mbps, até 1920 px, AAC, `faststart`, confere a duração (±0,5 s) | `compress-video.yml:95-115` |
| Moderação própria | ✅ `analisar-midia` + `api/analise-visao.js` (NSFWJS + OCR Tesseract), varredura a cada 10 min | `cron.job` |
| Campanha ↔ arte | 🟡 tabelas `artes` e `campanha_arte_versoes` existem, com **0 linhas**, exigem `campanha_id` e nenhum código as usa | banco |

**Reaproveitar sem duplicar:**
- o resultado final vai para `cliente_assets` (cliente) ou `media` + `biblioteca_itens` (dono/ADM);
- os arquivos intermediários e as referências precisam de espaço **privado** (ver ARQUITETURA §4).

## 4. Inteligência artificial

| Peça | Situação | Evidência |
|---|---|---|
| Worker Cloudflare do dono | ✅ `flux-1-schnell` (imagem), `llama-3.2-3b-instruct` (texto), `llava-1.5-7b` (visão). Exige o cabeçalho `x-segredo`. Repete até 4 vezes e devolve 429 quando a cota grátis acaba | `cloudflare/tabloide-ia/worker.js:15,38,63,93,104` |
| Chamada do Worker pelo servidor | ✅ `produto-imagem` usa os segredos `TABLOIDE_IA_URL`/`TABLOIDE_IA_SEGREDO`. Também Pexels, Pixabay, Openverse e Wikimedia | `supabase/functions/produto-imagem/index.ts:128-229` |
| Cota de uso | ✅ `tabloide_ia_registrar()` + tabela `tabloide_ia_uso(empresa_operadora_id, user_id, dia, total)`: 25 por pessoa e 120 por empresa por dia | banco; F-174 |
| Publicação do Worker | ✅ `scripts/ops/publicar-worker-ia.mjs` (a chave fica no cofre local) | — |
| "IA" do portal (Biblioteca IA / Copiloto) | ❌ **simulada**: devolve texto fixo ("Gemini AI Engine", "MRR R$ 165.000") | `src/modules/crm/services/ai.service.ts:3,13,24` |
| Gemini, OpenAI, ElevenLabs, Kling, Seedance, Canva | ❌ nenhuma chave ou chamada no código (busca em `src`, `supabase/functions`, `cloudflare`, `scripts`, `.github`, `api`) | `grep` |
| Fila, retentativas e webhooks de IA | ❌ não existem. Os padrões que podem ser reaproveitados: `pg_cron` 1.6.4 + `pg_net` 0.19.5 (instalados, 11 tarefas), `repository_dispatch` → Actions. `pgmq`, `vector`, `pg_trgm` e `unaccent` estão **disponíveis, mas não instalados** | `pg_available_extensions` |
| Gestão de chaves | ✅ segredos do Supabase (Edge), segredos do GitHub (Actions), `SEGREDO` do Worker. Cofre local `~/.sobremidia-secrets/tokens.env`, lido por `scripts/ops/segredos.mjs` sem imprimir valores | — |
| Vercel | 🔒 plano grátis. **Proibido criar função em `api/`** | `CLAUDE.md` |

**Gemini API:** a integração é possível por um adaptador numa Edge Function, com a chave nos segredos do Supabase. Não há
camada grátis para gerar imagem (`gemini-3-pro-image` US$ 0,134 por imagem 1K/2K). O Veo 3.1 preview foi desligado em
22/10/2026. As fontes e os preços estão em `docs/studio/MG00_AUDITORIA.md` §3 e `PLANO_FABRICA_IA.md` §3.

## 5. Autenticação e permissões

| Peça | Situação | Evidência |
|---|---|---|
| Perfis em uso | ✅ ANUNCIANTE 56, FINANCEIRO 25, CLIENTE 20, GESTOR 19, REPRESENTANTE 16, ADMIN 6, PARCEIRO 5, GERENTE 3, FUNCIONARIO 2, OWNER 1 | `perfis` × `usuarios` |
| "Gestor de Mídias" | 🟡 `portalAccess.ts` aceita `GESTOR_MIDIAS`/`GESTOR_TELAS`, mas esses perfis **não existem** na tabela `perfis`. Na prática, o gestor de mídias é o perfil **GESTOR** | `src/lib/portalAccess.ts:27` |
| Área por rota | ✅ `/portal/*` → ANUNCIANTES; `/dashboard/*` → GESTOR; owner e ADM entram em tudo | `areaDaRota`, `podeAbrirRota` |
| RBAC na tela | ✅ `useRbac` (OWNER/ADMIN ignoram as regras) | `src/hooks/useRbac.ts` |
| Isolamento no banco, `cliente_assets` | ✅ mesma empresa **e** (`is_central_privileged()` **ou** `cliente_id` do usuário) | `pg_policies` |
| `is_central_privileged()` | 🔍 vale para owner, **ADMIN, GESTOR, GERENTE, FINANCEIRO e SUPERVISOR**: todos veem os arquivos de todos os clientes da empresa | definição viva |
| Isolamento, `media` | ✅ dono do registro (`user_id`) ou admin da empresa (`fn_admin_da_empresa_do_usuario`). Biblioteca: `fn_media_biblioteca_visivel` | `pg_policies` |
| Isolamento, Biblioteca | ✅ leitura por empresa. Escrita só por owner/ADMIN (`fn_biblioteca_admin`). Para o anunciante, a Biblioteca não existe (`fn_biblioteca_tenant` devolve nulo) | definições vivas |
| Regra permanente | 🔒 F-195: cada conta vê só o seu; só o dono e o ADM veem tudo | memória do projeto |
| Login, perfis e rotas | 🔒 `AuthContext.tsx`, `RouteGuards.tsx`, `useRbac.ts`, `portalAccess.ts` são **protegidos** | `docs/MAPA_DO_PROJETO.md:11` |

**Como impedir acesso cruzado no Studio:** as tabelas novas terão as **próprias** regras. Não devem usar
`is_central_privileged()`, que é larga demais.
- Cliente: só as linhas com o próprio `cliente_id` (ou `user_id`).
- Owner/ADMIN: tudo da empresa.
- GESTOR: só se o dono decidir.
- Referências da marca: só owner/ADMIN.
- Arquivos: em caminho privado, servidos por link assinado e temporário.

## 6. Criação e edição

| Peça | Situação | Evidência |
|---|---|---|
| Cartaz Digital (antigo Tabloide) | ✅ editor real: produtos, temas, datas, logo, fontes, exportação PNG (html2canvas) e portal público `/ofertas/:slug` | `src/components/tabloide/*` (`TabloideEditor`, `TabloideCanvas` 441 linhas), `src/lib/tabloide/*` |
| Recorte de produto | 🟡 no navegador, só com fundo liso | `src/lib/tabloide/recorte.ts` |
| Fontes | ✅ `carregarFonte`/`cssDaFonte` (anton, bebas, montserrat, fira-condensed, poppins) | `src/lib/tabloide/fontes.ts` |
| Desenho determinístico de arte (texto/preço) | ✅ HTML → Playwright no Actions (robô de conteúdo) e HTML → html2canvas no navegador | `scripts/conteudo/robo.mjs`, `src/lib/tabloide/exportar.tsx` |
| Layouts de arte 16:9/9:16 por camadas | 🟡 protótipo sem commit: `ArteModelo.tsx` (só CSS seguro para html2canvas, `cqmin`) | `src/components/studio/ArteModelo.tsx` |
| Página "Criar mídia" do portal | 🟡 placeholder (F-107) | `src/modules/crm/pages/portal/CriarMidiaPage.tsx`, rota `/portal/criar-midia` (`src/App.tsx:345`) |
| Widgets, zonas e layouts de tela | ✅ catálogo de widgets com prévia igual à do Player. Zonas de tela documentadas | `src/lib/widgetCatalog.ts`, `docs/engineering/SCREEN_LAYOUT_ZONE_ENGINE_DISCOVERY.md` |
| Editor de vídeo | ❌ não existe | — |
| Canva | ❌ nenhuma integração (só um link `canva.site` no contrato) | `grep` |
| Rotas livres para o Studio | ✅ `/portal/studio` (anunciante + owner/ADM, pela regra de área) e `/dashboard/studio` (equipe). A troca do conteúdo de `/portal/criar-midia` pode ser a porta de entrada | `src/App.tsx` (**protegido**: só acrescentar rotas) |

## 7. Canva Connect API (documentação oficial lida em 30/10/2026)

| Pergunta | Resposta oficial | Fonte |
|---|---|---|
| OAuth e permissões | Escopos por recurso: `design:content:write` (criar/importar/autofill), `design:content:read` (exportar), `asset:write` (enviar arquivos) | páginas de cada endpoint |
| Integração privada x pública | **Privada:** só para o time do criador, **sem revisão**. **Pública:** passa pela revisão do Canva (credenciais de teste, vídeo, questionário, justificativa de escopos). Uma pública que usa API em *preview* **não passa** na revisão | busca em canva.dev ("Submitting integrations", "Creating integrations") |
| Autofill | Exige que o usuário conectado tenha **Canva Pro, Teams, Enterprise** (ou Education/Nonprofits). Campos: **texto, imagem (aceita imagem ou vídeo), gráfico, planilha**. "Usage limits will be introduced in the future" | `/autofills/create-design-autofill-job` |
| Modelos de marca (brand templates) | O plano precisa ter modelos de marca: "Canva Pro, Canva Teams, or Canva Enterprise". **Corrige a afirmação anterior de "só Enterprise"** | `/brand-templates` |
| Importar arquivo como design editável | Só ai, psd, Affinity, key, numbers, pages, xls/xlsx, ppt/pptx, doc/docx, odg/odp/ods/odt, **pdf**. **Sem MP4 ou vídeo.** 20 pedidos/min. Links de edição valem 30 dias | `/design-imports` |
| Enviar MP4 | Como **asset** (elemento de mídia), não como design editável. Vídeo M4V/MKV/MP4/MPEG/MOV/WebM, até 500 MB. Imagem até 50 MB | `/assets` |
| Exportar | MP4 480p a 4K (horizontal/vertical), PNG, JPG, GIF, PDF. Links de download valem **24 h**. Limites: 500 exportações/usuário/dia, 5.000/app/dia. No plano Free, PNG transparente e PNG com perda falham | `/exports/create-design-export-job` |
| Edição externa e volta | `edit_url` com `correlation_state`. O Canva volta ao nosso sistema com um `correlation_jwt` que precisa ser conferido no servidor | guia "return navigation" |

**Conclusão honesta:**
- Um **MP4 nunca vira projeto Canva editável em camadas.**
- O caminho oficial é:
  1. o dono cria os **modelos mestres no próprio Canva** (como a página de referência faz), com campos de dados para título, preço, logo e foto ou vídeo do produto;
  2. a SOBRE MÍDIA preenche pelo autofill;
  3. abre o `edit_url`;
  4. exporta MP4/PNG;
  5. guarda no R2.
- O vídeo gerado por IA pode entrar como **camada de fundo** (campo de imagem/vídeo) de um modelo editável.
- 🔍 **Validar:** o design gerado fica na conta Canva **conectada**. Com uma integração privada, só os membros do time Canva do dono editam. Para cada cliente editar no próprio Canva, é preciso integração pública (revisão), e os modelos de marca do dono não ficam visíveis para contas de fora do time.
- 🔍 **Validar:** se o autofill ainda é API *preview*. Se for, bloqueia a integração pública.

## 8. Renderização e Player

| Peça | Situação | Evidência |
|---|---|---|
| FFmpeg no servidor | ✅ só no GitHub Actions (repositório público, minutos grátis). Edge Functions (Deno) e Vercel **não** rodam FFmpeg | `compress-video.yml`, `conteudo-automatico.yml` |
| 16:9 e 9:16 | ✅ compressão em até 1920 px no lado maior. Player com TV em pé e totem 9:16 (F-212) | memória F-212; `compress-video.yml:96` |
| Publicação | ✅ mídia comum (MP4/PNG) → playlist → tela | `adicionarNaPlaylist.ts`, `fn_save_playlist_items` |
| Player Android | 🔒 **nenhuma mudança necessária** no escopo inicial. Ele recebe arquivos comuns. Conferir em cada gate com `node scripts/ops/contrato-player.mjs` (5.7.10 comercial) | `CLAUDE.md` |

## 9. Referências e aprendizado

| Peça | Situação |
|---|---|
| Biblioteca de referências privada (originais, análises, bíblias, prompts aprovados, licença) | ❌ não existe. Proposta em ARQUITETURA §4 |
| Versionamento de diretrizes | ❌. Proposta: `docs/studio-ai/agentes/<agente>.vN.md` no Git, e cada produção grava a versão usada |
| NotebookLM | 🔍 só laboratório. A API Enterprise (v1alpha) gerencia notebooks e **não** responde perguntas (`PLANO_FABRICA_IA.md` §2). Nada em produção depende dele |
| Busca por semelhança | ❌ `vector` disponível, mas não instalado. Embeddings `bge-m3` na cota grátis da Cloudflare |

## 10. Arquivos que NÃO devem ser alterados nesta frente

- Login, perfis e rotas: `src/contexts/AuthContext.tsx`, `src/components/auth/RouteGuards.tsx`, `src/hooks/useRbac.ts` e `src/lib/portalAccess.ts`. No `src/App.tsx`, só acrescentar rotas.
- Financeiro, contratos, assinatura e cobrança (`inter-*`, `payment-webhook`, `generate-contract-pdf`, `get-download-url`).
- `native-android-player/**`, a ROM e o canal OTA. O 5.7.10 é a versão comercial.
- `fn_r2_validate_object_scope`, `fn_biblioteca_*`, `is_central_privileged`, `cliente_assets` RLS: só leitura nesta frente. Riscos anotados em RISCOS.
- `compress-video.yml` e `conteudo-automatico.yml`: reaproveitar o padrão, sem mexer neles.
- `src/lib/biblioteca.ts` e `supabase/.temp/*`: modificações locais preexistentes, que não entram em commit.
