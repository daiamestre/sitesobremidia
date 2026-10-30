# SOBRE MÍDIA STUDIO — AI Creative Factory: plano técnico (com evidências)

Data: 28/10/2026. Complementa `MG00_AUDITORIA.md`. Só leitura: nenhum banco, função, deploy ou commit alterado.
O objetivo foi corrigido pelo dono: **fábrica automática de anúncios com agentes de IA** (pedido em linguagem natural +
fotos → anúncio pronto na Biblioteca), e **não** um catálogo cadastrado à mão. O catálogo passa a ser consequência
da produção.

## 1. Evidências novas da auditoria (o que reaproveitar)

| Necessidade | O que já existe e funciona | Evidência |
|---|---|---|
| Guardar as fotos do cliente e o resultado | `cliente_assets` (cliente, empresa, tipo, url R2, largura/altura, duração, tags, **moderação**), envio pelo `get-upload-url` | `AssetLibraryPage.tsx:112-135`; colunas lidas no banco |
| Moderação antes de ir para a tela | `analisar-midia` + `api/analise-visao.js` (nudez e **leitura de texto por Tesseract**) + varredura a cada 10 min (`cron analisar-midias-pendentes`) | `cron.job` no banco |
| Publicação nas telas autorizadas | Playlists do cliente usam `cliente_assets` aprovados; telas do cliente em `/portal/pontos` | `PlaylistsClientePage.tsx:599` |
| Biblioteca por segmento (destino do Bibliotecário) | `biblioteca_pastas` + `biblioteca_itens` (com `tags`). Já existem as pastas "VÍDEOS EM PÉ" de Academia, Hamburgueria, Loja de Variedades, Mercado, Açaiteria, Açougue e Pizzaria | consulta no banco (25 pastas na empresa principal) |
| Fila de trabalho | `pg_cron` + `pg_net` já chamam Edge Functions periodicamente (11 tarefas no ar) | `cron.job` |
| Trabalho pesado (vídeo) | Edge Function → `repository_dispatch` → GitHub Actions com **FFmpeg + rclone para o R2**. Funciona em produção (`compress-video`, 3 execuções com sucesso em 18/10). Repositório **público**: os minutos do Actions são grátis | `process-media/index.ts:79-83`, `.github/workflows/compress-video.yml` |
| Desenho de arte com texto exato | O robô de conteúdo desenha HTML com Playwright no Actions e publica no R2 (rodou hoje às 12:59) | `conteudo-automatico.yml` |
| IA de imagem | Worker Cloudflare do dono (`flux-1-schnell`) com limite por pessoa e por empresa por dia (`tabloide_ia_registrar`) | `cloudflare/tabloide-ia/worker.js`, F-174 |
| Recorte do produto | Recorte no navegador para fundo liso (embalagens) | `src/lib/tabloide/recorte.ts` |
| "IA" atual do portal | **Simulada** (texto fixo). Não serve de base | `ai.service.ts` |

## 2. NotebookLM — o que existe de verdade

- A API oficial (NotebookLM **Enterprise**, `v1alpha`) **só gerencia notebooks**: criar, ler, listar, apagar e compartilhar. **Não há endpoint para fazer uma pergunta e receber a resposta.** Ela exige licença Enterprise no Google Cloud.
- **Conclusão:** o NotebookLM fica como **laboratório**. Lá você estuda e escreve as diretrizes. A versão aprovada vira um arquivo versionado no projeto, `docs/studio/agentes/<agente>.vN.md`, que a plataforma injeta no modelo de IA por API. Cada produção grava qual versão da diretriz usou.

## 3. Modelos de IA disponíveis (sem conta nova)

Na **conta Cloudflare do dono, que já existe**, a cota grátis é de 10.000 neurons por dia e o excedente custa US$ 0,011 por 1.000.

| Uso | Modelo | Custo estimado | Observação |
|---|---|---|---|
| Diretor Criativo, especialistas, Bibliotecário (texto estruturado) | `gpt-oss-120b` ou `llama-4-scout-17b` | ≈ 230 neurons por plano (US$ 0,0025) → **≈ 40 planos por dia grátis** | `glm-5.3` e `kimi-k2.6` (melhores, com ferramentas) exigem o plano Workers Paid |
| Visão (conferir produto na cena, sugerir segmento) | `llama-4-scout` (multimodal), `moondream3.1` (OCR, detecção) | centavos de dólar | — |
| Imagem de cena com a foto do produto como referência | `flux-2-klein-4b` / `flux-2-klein-9b` (multi-referência) | ≈ 125 neurons por imagem 1024² → **≈ 80 por dia grátis** | Upgrade do `flux-1-schnell` atual |
| Vídeo por IA | **nenhum na Cloudflare** | — | Gemini Omni Flash (≈ US$ 0,10/s em 720p; o Veo 3.1 preview foi desligado em 22/10/2026), Kling ou Seedance: todos pagos |
| Voz pt-BR | MeloTTS e Aura **não têm português** | — | Opções: Piper (aberto, roda no Actions, qualidade a testar), ElevenLabs Starter (US$ 6/mês, comercial), TTS do Gemini (a verificar) |
| Remoção de fundo | **nenhum na Cloudflare** | — | Recorte atual (fundo liso) ou modelo aberto no Actions (a testar) |

## 4. Arquitetura proposta

```
Cliente (/portal/studio)                         Servidor (nada na Vercel)
 pedido + fotos + preço/loja/formato/duração
   │  fotos → cliente_assets (envio que já existe)
   ▼
 studio_producoes (estado)  ◄── pg_cron (1 min) ── Edge Function `studio-producao` (orquestrador)
                                                     │ 1 Diretor Criativo (LLM, JSON validado)
                                                     │ 2 Especialista de Cena (LLM: prompts de imagem e de vídeo)
                                                     │ 3 Produtor (código determinístico: escolhe ferramenta pela capacidade, cota e orçamento)
                                                     │     ├─ imagem → Worker Cloudflare (FLUX-2 com a foto de referência)
                                                     │     └─ vídeo IA → adaptador (desligado até haver provedor e orçamento)
                                                     │ 4 Montador → repository_dispatch → GitHub Actions `studio-montar`
                                                     │     Playwright desenha textos e PREÇOS EXATOS; FFmpeg monta cenas,
                                                     │     movimento, transições, áudio e exporta; rclone envia ao R2
                                                     │ 5 Qualidade (código: ffprobe para duração/formato, OCR do preço
                                                     │     comparado ao número digitado; visão: produto presente)
                                                     │ 6 Bibliotecário (LLM sugere; regra valida)
                                                     ▼
            cliente → cliente_assets (moderação de sempre) → playlists → telas autorizadas
            dono/ADM (modelos por segmento) → media + biblioteca_itens na pasta do segmento → catálogo
```

**Regras de projeto:**
- **Os preços nunca passam pelo gerador.** O número digitado no formulário é a única fonte. O texto do preço é desenhado pelo Montador e conferido por OCR. O plano do Diretor só referencia o produto pelo `id`.
- **O Produtor e o Montador são código, não LLM.** A escolha de ferramenta e o gasto ficam determinísticos e auditáveis.
- **Nada de dados inventados.** Sem nome de loja informado, a chamada é genérica. O validador recusa um plano que cite loja, marca ou preço que não vieram do pedido.
- **Rótulos honestos no resultado:**
  - "Imagem gerada por IA";
  - "Vídeo montado a partir de imagens" (zoom, deslocamento, transições);
  - "Vídeo gerado por IA" (só quando um provedor de vídeo real for usado).
- **Gasto:**
  - cota por pessoa e por empresa por dia;
  - estimativa antes de cada etapa paga;
  - uma geração paga **nunca** se repete sozinha (chave de idempotência por etapa);
  - "tentar de novo" é um botão do cliente, que respeita a cota.

**Dados novos (uma migração; nada parecido existe hoje):**
- `studio_producoes`:
  - pedido original e dados estruturados (produtos com `asset_id` e preço exato);
  - tipo, formato, duração, estado, cliente e empresa;
  - custo estimado e real, `resultado_asset_id`.
- `studio_etapas`: agente, versão da diretriz, modelo, entrada e saída (JSON), neurons/custo, tentativas, erro e horários.
- `studio_uso`: cota diária no mesmo molde do `tabloide_ia_registrar`.
- Trava por conta (F-195): cada cliente vê só as suas produções; dono e ADM veem tudo.

**Arquivos intermediários:** no R2, em `studio/<producao>/...`, referenciados em `studio_etapas`. Sem tabela de arquivos nova.

**Player:** nenhuma mudança. Ele continua recebendo mídia comum (MP4/PNG) pelas playlists. Em cada gate, confiro o contrato com `contrato-player.mjs`.

## 5. Micro-gates

| Gate | Entrega verificável | Teste de aceite | Custo | Bloqueio |
|---|---|---|---|---|
| **MG01** Studio + pedido | Tela `/portal/studio` (visual da referência): texto, fotos (envio que já existe), tipo imagem/vídeo/TV, preço, loja, formato, duração e "Criar com IA". Grava `studio_producoes` e mostra os estados reais | O pedido de 2 produtos é gravado e aparece como "Recebido"; outro cliente não o vê | R$ 0 | — |
| **MG02** Diretor Criativo | Orquestrador + diretriz v1 + plano JSON validado | O exemplo de 15 s gera 4 cenas que somam 15 s; os preços R$ 19,90 e R$ 26,46 ficam intactos; sem nome de loja, nada é inventado | ≈ US$ 0,003 por plano (cota grátis) | — |
| **MG03** Imagens | Cenas por FLUX-2 com a foto do produto como referência, ou produto real recortado sobre um cenário gerado | Uma imagem por cena salva no R2 e listada na produção | ≈ 125 neurons por imagem (cota grátis) | Atualizar o Worker do dono (a chave existe no cofre) |
| **MG04** Montagem | Workflow `studio-montar`: preços desenhados, movimento, transições, MP4 16:9/9:16 e PNG | MP4 de 15,0 s ±0,2 em 1920×1080, com os 2 preços legíveis; rótulo "vídeo montado a partir de imagens" | R$ 0 (Actions grátis) | — |
| **MG05** Qualidade + Bibliotecário | Conferência por ffprobe, OCR do preço e visão; gravação em `cliente_assets` (cliente) ou na pasta do segmento (dono) | Preço trocado de propósito → produção **reprovada**; aprovada → aparece em Minhas Mídias e entra numa playlist do próprio cliente | Centavos | — |
| **MG06** Voz, vídeo IA e segmentos | Narração; adaptador de vídeo real ligado; diretrizes por segmento; geração em lote de modelos por segmento (catálogo automático) | Por provedor | Pago | **Escolha do provedor de voz e de vídeo, e orçamento** |

## 6. O que fica fora agora

- Canva: só com a integração criada pelo dono.
- Player Android, finanças e login.
- Commit e publicação: **só com a autorização do dono**.

## 7. Arquivos criados antes desta correção (não publicados, sem commit)

| Arquivo | O que é | Proposta |
|---|---|---|
| `src/components/studio/ArteModelo.tsx` | Desenho de arte com texto e preço por camadas (layouts 16:9 e 9:16) | **Reaproveitar** como camada determinística de textos e preços do Montador (MG04) |
| `src/lib/studio/catalogo.ts` | Segmentos, filtros e busca | Reaproveitar na galeria do Studio (MG05/MG06) |
| `src/lib/studio/modelos.ts` | 24 modelos escritos à mão | **Descartar** (contraria a nova regra) |
| `public/studio/fotos/*.webp` (24, 1,9 MB) | Fotos geradas pela IA da Cloudflare | Descartar, ou guardar só para testes |

## 8. Cinematic Reference Library (pedido do dono, 30/10/2026)

A biblioteca de referências é a **memória criativa dos agentes**: arquivos originais, a análise de cada um e os prompts
gerados a partir dele, reutilizáveis em novas campanhas.

### Por que ela NÃO pode ficar na Biblioteca de Mídias atual
- `playlist_items.biblioteca_pasta_id` permite colocar uma pasta inteira da Biblioteca numa playlist. Uma referência guardada ali poderia **ir parar numa tela**.
- Referências de terceiros (cenas de filmes, comerciais) servem para estudo interno e **não podem ser exibidas** nem publicadas.
- Hoje o envio grava no R2 com endereço público (`get-upload-url` devolve `publicUrl` pelo `R2_PUBLIC_DOMAIN`). Referências exigem endereço **privado**, servido por link assinado e temporário. Esse link já existe no projeto: a assinatura SigV4 de `get-download-url`, hoje usada só em contratos.

Por isso, é um espaço próprio e **impossível de publicar**. Nada nele entra em playlist, `media` ou `cliente_assets`.

### Como as 6 seções se encaixam sem duplicar

| Seção | Tipo | Onde fica | Duplica algo? |
|---|---|---|---|
| Referências de fotografia | Imagens | `studio_referencias` (tipo `foto`) + arquivo privado no R2 | Não: nada parecido existe |
| Referências de vídeos | Vídeos | `studio_referencias` (tipo `video`); quadros-chave extraídos por FFmpeg no Actions, como a moderação já faz | Não |
| Movimentos de câmera | Estilos | `studio_referencias` (tipo `movimento`): ficha em texto (dolly-in, órbita, grua, travelling…) + clipe de exemplo opcional | Não |
| Iluminação e color grading | Estilos | `studio_referencias` (tipo `iluminacao`): ficha + paleta + imagens de exemplo | Não |
| Storyboards aprovados | Projetos | **Não é tabela nova.** É o plano aprovado de uma `studio_producoes`, marcado "usar como referência" | Reaproveita a produção |
| Fichas técnicas dos agentes | Conhecimento | **Não é tabela nova.** São as saídas gravadas em `studio_etapas` + as diretrizes versionadas `docs/studio/agentes/*.vN.md` (vindas do NotebookLM) | Reaproveita etapas e diretrizes |

`studio_referencias` (proposta) guarda:
- tipo, título e segmentos;
- tags e caminho privado no R2;
- **origem e licença**: próprio, licenciado ou só estudo;
- análise (JSON: enquadramento, lente aparente, luz, paleta, movimento, ritmo);
- fragmentos de prompt de imagem e de vídeo;
- quem criou, empresa e uso (quantas produções citaram a referência).

### Fluxo
1. O dono ou o ADM enviam a referência (só eles cuidam da biblioteca da marca).
2. O **Analista de Referências** gera a ficha, sem custo dentro da cota grátis:
   - quadros-chave por FFmpeg;
   - visão `llama-4-scout`;
   - JSON validado.
3. O dono revisa e aprova a ficha. Só ficha aprovada é usada pelos agentes.
4. Ao planejar, o Diretor Criativo busca referências pelo segmento e pelas tags do pedido. A busca por semelhança fica para depois: o `pgvector` está **disponível mas não instalado** no banco, e os embeddings da Cloudflare (`bge-m3`) estão na cota.
5. Cada produção registra **quais referências usou** (rastreabilidade).

### Regras de direito e segurança
- **Uma referência de terceiro nunca é enviada como imagem de entrada a um gerador.** Ela só inspira a **ficha em texto** (estilo, luz, movimento). Como imagem de entrada, só vão arquivos próprios, licenciados ou as fotos que o cliente enviou do próprio produto.
- Arquivos privados, links assinados de curta duração, trava por empresa no banco. Clientes não veem a biblioteca da marca.
- As fotos de produto que o cliente envia para uma produção ficam **só na produção dele**. Nunca entram na biblioteca da marca sem consentimento.

### Onde entra nos gates
- **MG02 (Diretor Criativo):** já usa as seções de texto ("Movimentos de câmera" e "Iluminação"), com uma primeira leva de fichas escritas a partir das diretrizes aprovadas.
- **Novo MG02b (Biblioteca de Referências):**
  - envio privado, análise automática, aprovação e busca por segmento e tags;
  - teste: enviar 1 foto e 1 vídeo e receber fichas aprovadas;
  - teste: o Diretor cita as fichas no plano;
  - teste: nenhuma referência aparece no seletor de mídias da playlist;
  - teste: o link expira.
- **MG05:** botão "usar como referência" no storyboard aprovado.

### Bloqueio a decidir
O R2 de hoje usa um domínio público. É preciso confirmar se esse domínio expõe o bucket inteiro. Se expuser, proponho um **bucket separado e privado** só para as referências. Criar o bucket é uma mudança de infraestrutura na conta Cloudflare do dono: faço só com autorização.

## Fontes

- NotebookLM Enterprise API: https://docs.cloud.google.com/gemini/enterprise/notebooklm-enterprise/docs/api-notebooks
- Gemini, vídeo: https://ai.google.dev/gemini-api/docs/video · preços: https://ai.google.dev/gemini-api/docs/pricing · function calling: https://ai.google.dev/gemini-api/docs/function-calling
- Workers AI, modelos: https://developers.cloudflare.com/workers-ai/models/ · preços: https://developers.cloudflare.com/workers-ai/platform/pricing/
