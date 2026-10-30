# MG00 — Auditoria read-only: SOBRE MÍDIA STUDIO + AI CREATIVE

Data: 28/10/2026. Escopo: só leitura (código, banco ao vivo por SELECT, pesquisa pública). Nenhum código, banco ou deploy alterado.

## 1. Referência visual

- O link do ChatGPT não abre fora da conta do dono. Usei a imagem anexada na conversa, guardada em
  `docs/studio/referencia/catalogo-studio-1536x1024.png` (PNG 1536×1024). **Viewport de referência: 1536×1024.**
- Inventário da tela (é a especificação de MG01):

| Região | Elementos |
|---|---|
| Cabeçalho | Logo "SOBRE MÍDIA STUDIO" (S roxo), busca larga com lupa ("Busque por nome, categoria ou segmento…"), sino, avatar + "Olá, Cliente / Minha Conta" ▾ |
| Menu lateral | Início (ativo, pílula roxa), Meus Projetos, Minhas Mídias, Telas Autorizadas, Configurações; cartão "Sua marca em todos os lugares" + botão "Ver tutorial" |
| Banner | "SOBRE MÍDIA STUDIO" (sobretítulo), "Encontre sua **próxima arte**" (2ª linha em roxo), texto, botão amarelo "Explorar modelos →", 3 TVs com artes (16:9, 16:9, 9:16) sobre base luminosa, 4 itens à direita com ícone |
| Categorias | 12 blocos: Todos (ativo), Supermercados, Alimentação, Saúde, Beleza, Serviços, Moda, Educação, Imobiliária, Fitness, Pet, Tecnologia |
| Barra de filtros | "Filtros", Formato, Segmento, Tipo de edição, Ordenar por, "Mostrando X de Y modelos" |
| Painel Segmentos | lista com caixas de seleção e contagem por segmento |
| Grade | 4 colunas; cartão = miniatura, coração (favorito), selo de formato (16:9 / 9:16), título, segmento, botão "Personalizar arte" |

- As miniaturas e as artes das TVs da referência são imagens de demonstração. No sistema, elas serão miniaturas reais de modelos. Os números "24 de 142" e as contagens por segmento serão contados no banco, nunca copiados da imagem.

## 2. O que já existe no sistema (comprovado)

| Assunto | Situação real | Onde |
|---|---|---|
| Portal do anunciante | Layout próprio com menu lateral diferente do da referência | `src/modules/crm/layout/CustomerPortalLayout.tsx`, rotas `/portal/*` em `src/App.tsx` (protegido) |
| "Criar mídia" | Página **em construção** (F-107), só manda enviar mídia pronta | `src/modules/crm/pages/portal/CriarMidiaPage.tsx` |
| Minhas Mídias (cliente) | Envio ao R2 por `get-upload-url`, análise própria (nudez/texto/duração) e cota de mídia | `AssetLibraryPage.tsx`, `supabase/functions/analisar-midia`, `api/analise-visao.js`, `api/analise-audio.js` |
| Cartaz Digital | Editor real com canvas, "Meus cartazes", exportação PNG, publicação no portal. Temas vazios (aguardam as artes do dono) | `src/components/tabloide/*`, `src/lib/tabloide/*`, tabela `tabloides` (**0 registros**) |
| Imagem por IA | **Real**: Worker Cloudflare do dono com `@cf/black-forest-labs/flux-1-schnell`, limite 25/pessoa/dia e 120/empresa/dia (F-174) | `cloudflare/tabloide-ia/worker.js`, `supabase/functions/produto-imagem`, `tabloide_ia_registrar()` |
| "Biblioteca IA" do portal | **SIMULADA.** `ai.service.askExecutiveCopilot` não chama provedor nenhum: devolve texto fixo ("Gemini AI Engine", "MRR R$ 165.000/mês", "Av. Paulista #04 ROI 3.8x") | `src/modules/crm/services/ai.service.ts`, `anuncianteAi.service.ts`, `pages/portal/BibliotecaIA.tsx` |
| Catálogo de modelos de arte | **Não existe** (nenhuma tabela, nenhum arquivo de modelo) | — |
| Canva | **Não existe integração.** Só um link `canva.site` no rodapé do contrato | — |
| Projetos e versões | Tabelas `artes` e `campanha_arte_versoes` existem com **0 registros**, exigem `campanha_id` e nenhum código as usa | banco |
| Vídeo, voz e montagem por IA | Não existem. Nenhuma chave de provedor de vídeo ou voz | — |
| Renderização automática | Robô de conteúdo desenha HTML com Playwright no GitHub Actions, envia ao R2 e publica | `scripts/conteudo/robo.mjs`, `.github/workflows/conteudo-automatico.yml` |
| Publicação | mídia (`media`, 424) → playlists (20) → telas (19). O contrato do Player 5.7.10 não precisa mudar | `src/lib/adicionarNaPlaylist.ts`, `fn_save_playlist_items` |
| Vercel | Plano grátis, 4 arquivos em `api/`. **Proibido criar função nova** | `vercel.json` |

**Achado à parte (risco):** a "Biblioteca IA" e o Copiloto mostram números inventados a clientes como se fossem análise de IA. Não vou reaproveitar esse serviço como "IA real". O certo é corrigi-lo numa tarefa separada.

## 3. Pesquisa de ferramentas

Legenda: ✅ confirmado em página oficial · ⚠️ só fonte de terceiros (não confirmado) · ❓ não encontrado.

| Ferramenta | Função | API oficial | Grátis via API | Preço / limite | Uso comercial |
|---|---|---|---|---|---|
| **Nano Banana Pro** (`gemini-3-pro-image`, Google) | Imagem com referências visuais | ✅ Gemini API | ✅ **Não tem** camada grátis para imagem | ✅ US$ 0,134 (1K/2K) e US$ 0,24 (4K) por imagem; lote pela metade. Página atualizada em 27/10/2026 | Pago, conforme os termos do Google |
| Nano Banana 2 (`gemini-3.1-flash-image`) | Imagem | ✅ | ✅ Não | ✅ US$ 0,067 por imagem 1K | idem |
| **Seedance** (ByteDance) | Vídeo, de texto e de imagem | ✅ BytePlus ModelArk (a página de preços não abriu) | ❓ | ⚠️ cerca de US$ 10,70 por 1 milhão de tokens (Seedance 2.5, 720p) | ❓ |
| **Kling** (Kuaishou) | Vídeo, de texto e de imagem | ✅ existe o "KlingAI Open Platform" (a página não carregou o conteúdo) | ❓ | ⚠️ cerca de US$ 0,075–0,10 por segundo (Kling 3.0); pacotes pré-pagos à parte da assinatura | ❓ |
| **Magnific** (antigo Freepik, inclui Spaces) | Ampliação, imagem, vídeo (Kling) | ✅ API Magnific: imagem, edição/ampliação, vídeo Kling, ícones | ❓ | ❓ | ❓ O "Spaces" (quadro de nós) não aparece na API |
| **ElevenLabs** | Locução | ✅ | ⚠️ 10 mil créditos/mês, **sem uso comercial** e com atribuição | ✅ Starter US$ 6/mês (1º mês US$ 1) | ⚠️ só nos planos pagos |
| **DaVinci Resolve** | Montagem e cor | Script **interno** grátis; script **externo** e renderização sem tela só no Studio (pago) ⚠️ | — | Studio é licença paga | Exige computador com o programa. Não é serviço hospedado |
| **Blender** | 3D e montagem | Python (`bpy`), roda sem tela (`blender -b`) | Livre (GPL) | Precisa de máquina própria, pesado | Livre |
| **Cloudflare Workers AI** (já é do dono) | Imagem (FLUX), texto (Llama), voz (MeloTTS, Aura) | ✅ | ✅ **10.000 neurons por dia grátis**, depois US$ 0,011 por 1.000 | ✅ flux-1-schnell: 4,8 neurons por bloco de 512² + 9,6 por passo (centenas de imagens por dia na cota); MeloTTS: 18,63 neurons por minuto. **Nenhum modelo de vídeo** | Conforme a licença de cada modelo |
| **Canva Connect API** | Edição avançada | ✅ | ✅ Integração grátis. **Autofill e modelos de marca exigem Canva Enterprise** | Exportação JPG/PNG/MP4/PDF disponível. No Canva Free: sem PNG transparente e sem ampliar mais de 1,125× | Integração pública passa pela revisão do Canva |
| **Remotion** | Montagem de vídeo por código | ✅ Biblioteca | ✅ Grátis para pessoa física e empresa com **até 3 funcionários** | Licença de empresa acima disso | ✅ |
| **FFmpeg** | Montagem, áudio, textos, transições | Já usado no projeto | Livre | Roda no GitHub Actions | ✅ |
| **Wan 2.2** (Alibaba) | Vídeo de imagem, aberto | Pesos abertos | ⚠️ Apache 2.0 | Precisa de placa de vídeo (não temos) | ⚠️ permitido |
| **LTX-Video** | Vídeo aberto | Pesos abertos | ⚠️ licença própria (grátis abaixo de US$ 10 mi/ano) | Placa de vídeo | ⚠️ as fontes divergem |

- **AI Club / Black Editores / LURE Studio:** não achei material público sobre o método. Usei só as 4 etapas que você mesmo descreveu: cena → imagem → movimento → acabamento. Nada foi copiado.
- **Conclusão honesta:** nenhuma das fontes consultadas oferece API grátis e oficial de **vídeo por IA**. A **imagem** tem cota grátis real (Workers AI, já em uso). Voz em pt-BR grátis e com uso comercial não está confirmada: MeloTTS e Aura não listam português; o Piper (aberto) é hipótese a testar.

## 4. Decisões técnicas propostas

1. **Onde fica o Studio:** um layout próprio `StudioLayout` em `/studio`, com cabeçalho e menu iguais à referência, atrás das mesmas travas de login (`RequireApproval`). A referência tem menu e cabeçalho próprios, por isso ele não cabe dentro do `/portal`. No `App.tsx` (protegido), só entram as rotas novas.
   - "Minhas Mídias" leva a `/portal/assets` (sem duplicar).
   - "Telas Autorizadas" leva às playlists e pontos que já existem.
   - "Configurações" leva às configurações do portal.
2. **Dados novos (uma migração segura):**
   - `studio_modelos`: catálogo com segmento, formato 16:9/9:16, tipo de edição, miniatura e definição das camadas;
   - `studio_projetos` e `studio_projeto_versoes`: projetos do cliente;
   - `studio_favoritos`.
   - Trava por conta (regra F-195: cada conta vê só o seu; owner/ADM veem tudo).
   - **Não** reaproveitar `artes`, que exige campanha.
   - Segmentos e categorias fixos no código, os mesmos 12 da referência.
3. **Formato do modelo:** JSON de camadas (texto, imagem, forma, logo), desenhado no navegador pelo mesmo tipo de motor de canvas do Cartaz Digital. A exportação sai em PNG 1920×1080 ou 1080×1920. A "edição rápida" troca textos, cores, foto e logo.
4. **Conteúdo do catálogo (decisão do dono):** hoje não existe nenhum modelo. As opções são:
   - (a) você envia as artes base;
   - (b) eu crio modelos próprios e originais com fotos de licença livre (Pexels/Pixabay) e imagens do Workers AI;
   - (c) as duas coisas.
   - A contagem na tela será sempre a real.
5. **Canva (MG04):** integração Connect privada do dono. O fluxo é:
   1. criar o design a partir da nossa arte (importação de arquivo: confirmar na documentação na hora de implementar);
   2. abrir o `edit_url` com `correlation_state`;
   3. voltar ao sistema pelo "return navigation", com o JWT conferido;
   4. exportar PNG/JPG/MP4;
   5. salvar no R2 e na `media`.
   - O OAuth e a troca de chave ficam numa Edge Function do Supabase, nunca na Vercel.
   - **Bloqueio:** precisa que você crie a integração no Canva Developers. Não posso criar contas.
   - Sem Enterprise não há preenchimento automático de modelos do Canva.
   - Para clientes de fora da equipe, a integração precisa passar pela revisão do Canva.
6. **Orquestrador AI Creative:**
   - Uma Edge Function `studio-ia` com adaptadores por provedor, para trocar de serviço sem reescrever o produto.
   - Tabela `ia_tarefas` com estado, provedor, modelo, prompt, parâmetros, custo estimado e real, tentativas, erro e arquivos.
   - Montagem (FFmpeg) num workflow do GitHub Actions, que segue o padrão do robô de conteúdo e não usa a Vercel.
   - Controle de gasto:
     - cota por pessoa e por empresa (mesmo modelo do F-174);
     - aprovação do cliente antes de qualquer etapa paga;
     - **nenhuma repetição automática de geração paga** (chave de idempotência).
7. **Provedor por etapa para o 1º fluxo mínimo:**
   - Diretor criativo: Llama no Workers AI (cota grátis), trocável por um modelo pago melhor.
   - Imagem: FLUX no Workers AI (cota grátis, já em produção).
   - Vídeo: **bloqueado** até você escolher e pagar um provedor (Kling oficial ou via Magnific, ou Seedance). Enquanto isso, só uma "animação simples" de zoom e deslocamento feita com FFmpeg, **rotulada assim e nunca vendida como "vídeo por IA"**.
   - Voz: ElevenLabs pago (Starter) ou Piper aberto, depois de testar a qualidade em pt-BR.
   - Música: só a biblioteca licenciada.
8. **Publicação:**
   - o arquivo final vai ao R2 por `get-upload-url`, entra na `media` e passa pela mesma análise de conteúdo;
   - depois segue pelas playlists e telas autorizadas que já existem;
   - **sem mudar o Player** (o `contrato-player.mjs` é conferido em cada gate).

## 5. Segurança e direitos (a aplicar em cada gate)

- Arquivos privados com caminho por empresa; trava por conta no banco.
- Chaves de provedor só nos segredos do Supabase/GitHub, nunca no navegador.
- Validação de tipo e tamanho; análise de conteúdo já existente.
- Log de cada chamada paga.
- Imagem de pessoa real: o cliente confirma o consentimento antes de enviar.
- Nada de marca de terceiros nos modelos; música só licenciada.
- Retenção: rascunhos de IA não aprovados apagados após prazo a definir (sugestão: 30 dias).

## 6. Plano por micro-gates e bloqueios

| Gate | Pode começar já? | Depende de |
|---|---|---|
| MG01 catálogo fiel (1536×1024) + responsivo | Sim | Decidir 4 (a, b ou c) para ter miniaturas reais |
| MG02 categorias, filtros, busca, detalhes | Sim | MG01 + migração `studio_modelos` |
| MG03 edição rápida + projetos e versões | Sim | MG02 |
| MG04 Canva | **Não** | Integração Canva Developers criada pelo dono |
| MG05 briefing + diretor criativo | Sim (Workers AI) | Ampliar o Worker do dono (a chave Cloudflare existe no cofre) |
| MG06 imagem por IA | Sim (Workers AI) | MG05 |
| MG07 vídeo por IA | **Não** | Provedor pago escolhido + orçamento + chave |
| MG08 montagem, áudio, exportação | Parcial (FFmpeg) | Voz: decidir provedor |
| MG09 Biblioteca + publicação | Sim | MG03/MG08 |
| MG10 homologação | — | Todos |

## 7. Regras desta tarefa

- Commit e deploy **só com a sua autorização**. Esta regra do pedido vale acima da regra geral do `CLAUDE.md`.
- Nada de `git add -A`, `reset --hard` ou `clean -fd`.
- Auth, finanças e Player ficam fora do escopo.

## Fontes

- Google Gemini API, preços: https://ai.google.dev/gemini-api/docs/pricing
- Cloudflare Workers AI, preços: https://developers.cloudflare.com/workers-ai/platform/pricing/
- Canva: exportação https://www.canva.dev/docs/connect/api-reference/exports/create-design-export-job/ · return navigation https://www.canva.dev/docs/connect/return-navigation-guide/ · autofill https://canva.dev/docs/connect/autofill-guide
- Magnific API: https://docs.magnific.com/introduction
- Kling Open Platform: https://kling.ai/document-api/apiReference/commonInfo
- Seedance (terceiros): https://www.developersdigest.tech/models/video-generation/byteplus
- Kling (terceiros): https://www.atlascloud.ai/blog/guides/kling-ai-api-pricing
- ElevenLabs: https://elevenlabs.io/pricing/api · (terceiros) https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/
- DaVinci Resolve (terceiros): https://thepostflow.com/post-production/video-editing/resolve-studio-vs-free/ · https://resolvedevdoc.readthedocs.io/en/latest/API_intro.html
- Remotion, licença: https://github.com/remotion-dev/remotion/blob/main/LICENSE.md
- Wan 2.2: https://docs.comfy.org/tutorials/video/wan · LTX (terceiros): https://magichour.ai/blog/ltx-2-3-vs-wan-2-2
