# SOBRE MÍDIA AI STUDIO (OpenAI GPT Image): auditoria e plano

Data: 30/10/2026. **Etapa só de leitura**: nenhum código, banco, segredo de produção, deploy ou commit foi alterado.
O texto do pedido chegou cortado na seção 14 ("Crédit…"). Considerei as seções 1 a 14 até esse ponto.

## 0. Chave da OpenAI

- **Onde está:** a chave já estava no cofre local `~/.sobremidia-secrets/tokens.env`, com o nome `OPENAI_API_KEY`. Ela é idêntica à enviada; a comparação foi feita sem exibir o valor.
- **Exposição:** a chave não está em nenhum arquivo do projeto, no Git, no navegador nem nas variáveis `VITE_`.
- **Teste sem custo** (`GET /v1/models`): status 200.
- **Modelos de imagem liberados para a organização:**
  - `gpt-image-1`, `gpt-image-1-mini` e `gpt-image-1.5`;
  - `gpt-image-2` (snapshot `2026-04-21`);
  - `gpt-image-2.5-flare` e `gpt-image-2.5-sunburst` (snapshot `2026-09-08`);
  - `chatgpt-image-latest`.
- **Também liberados:** vídeo `sora-2` e `sora-2-pro`; texto `gpt-5`, `gpt-5-mini`, `gpt-5-nano`, `gpt-5.1`, `gpt-5.2` e outros.
- **Supabase:** a chave **ainda não está** nos segredos das Edge Functions. Gravar lá é configuração de produção e precisa de autorização (§9).
- ⚠️ **A chave foi colada na conversa.** Por isso ela também está no histórico local desta sessão (`~/.claude/projects/...jsonl`). Recomendação:
  1. criar uma chave nova na OpenAI e revogar esta;
  2. colocar a chave nova direto no `tokens.env` pelo Bloco de Notas, sem colar na conversa;
  3. definir um limite de gasto mensal na organização (Billing → Limits).

## 1. Documentação oficial da OpenAI (lida em 30/10/2026)

Fontes: `developers.openai.com/api/docs/guides/image-generation`, `/api/docs/pricing`, `/api/docs/models/gpt-image-2` e `/gpt-image-2.5-sunburst`.

### APIs

| API | Uso |
|---|---|
| **Image API** | `POST /v1/images/generations` (gera) e `POST /v1/images/edits` (edita com imagens de referência e máscara opcional) |
| **Responses API** | Ferramenta `image_generation`, conversa com várias rodadas (`previous_response_id`) e File IDs. Os modelos de imagem `gpt-image-2*` aparecem como **não suportados** direto na Responses: entram como `model` da ferramenta, chamada por um modelo principal |

### Parâmetros

| Parâmetro | Valores |
|---|---|
| `size` | `1024x1024`, `1536x1024`, `1024x1536`. Nos modelos 2.5, tamanho livre: múltiplos de 16, proporção entre 1:3 e 3:1, lado de até 3840 px, entre 655.360 e 8.294.400 pixels. Acima de 2560×1440 é experimental |
| `quality` | `low`, `medium`, `high` e `auto`. Nos modelos 2.5 também `xhigh` e `max` |
| `background` | `transparent`, `opaque` ou `auto`. O transparente exige `output_format` `png` ou `webp`. **A documentação não confirma o suporte modelo a modelo: precisa ser testado (§8)** |
| outros | `output_format` (`png`, `jpeg`, `webp`), `output_compression`, `n`, `moderation` (`auto` ou `low`), `partial_images` (0 a 3) |

- **Máscara:** mesmo formato e tamanho da imagem, até 50 MB, com canal alfa. A máscara é uma orientação ao modelo, não um recorte exato.
- **Bloqueio de conteúdo:** erro `moderation_blocked` com `moderation_details`. A tela precisa mostrar o motivo.
- **Limite de uso (camada Build):** 20 imagens por minuto nos modelos 2 e 2.5.

### Preços oficiais

| Modelo | Por 1 milhão de tokens | Por imagem 1024×1024 (baixa / média / alta) |
|---|---|---|
| `gpt-image-2` | Imagem: entrada US$ 8, saída US$ 30 | US$ 0,006 / 0,053 / 0,211 |
| `gpt-image-1.5` | — | US$ 0,009 / 0,034 / 0,133 |
| `gpt-image-1` | — | US$ 0,011 / 0,042 / 0,167 |
| `gpt-image-1-mini` | — | US$ 0,005 / 0,011 / 0,036 |
| `gpt-image-2.5-flare` e `-sunburst` | Mesmas tarifas por token do `gpt-image-2` | **A documentação não dá valor por imagem** ("tarifas iguais não significam custo igual"). Medir no teste |
| `gpt-5-mini` (texto, para o assistente de prompt) | Entrada US$ 0,25, saída US$ 2 | — |
| `gpt-5-nano` (texto) | Entrada US$ 0,05, saída US$ 0,40 | — |

O custo real de cada chamada vem no `usage` da resposta (tokens) e será gravado.

## 2. O que já existe e funciona (reaproveitar; não duplicar)

| Necessidade do pedido | Já existe | Evidência |
|---|---|---|
| Biblioteca fixa de logos promocionais 3D | ✅ **`tabloide_selos`** com `tipo` (`LOGO_CABECALHO`, `LOGO_MARCA`, `TEMA`), `categoria`, `versao`, `estado` (`APROVADO`/`REVISAO`/`REPROVADO` = arquivado), `transparente`, `origem`, `licenca`, `miniatura_url`, `ordem`, `cliente_id`, `dono_id`. Hoje há 2 logos de cabeçalho | `src/lib/tabloide/selos.ts`, banco |
| Validação de transparência de verdade (não o "quadriculado") | ✅ `validarAlfa()`: os 4 cantos 100% transparentes, área vazia ≥ 5% e área opaca ≥ 10% | `selos.ts:59-90` |
| Salvar na biblioteca com miniatura, validação de tipo, tamanho e dimensões | ✅ `enviarParaBiblioteca()` (PNG/JPG/WebP, até 12 MB, de 16 a 8000 px) | `selos.ts:152` |
| Inserir no tabloide como camada normal (mover, redimensionar, girar, duplicar, excluir) | ✅ `ElementoLivre` (`cx`, `cy`, `w`, `rot`) dentro de `config.elementos` do cartaz, criado por `novoElemento(selo)`. Apagar a camada não apaga a logo | `selos.ts:37,206-223`, `TabloideEditor.tsx:291-320` |
| Logo no cabeçalho do cartaz | ✅ `resolverCabecalho`/`logoCabecalhoId` | `cartaz.ts:276` |
| Recorte de fundo | 🟡 `recorte.ts`: só fundo liso, e **apaga brilhos e sombras suaves** de logos 3D | `src/lib/tabloide/recorte.ts` |
| Foto de produto real | ✅ `produto-imagem`: **Open Food Facts** (embalagem real, CC-BY-SA), Pexels, Pixabay, Wikimedia e Openverse, mais o catálogo local `tabloide_catalogo` (191 itens com `fonte` e `credito`) e conferência por visão | `supabase/functions/produto-imagem/index.ts` |
| Imagem ilustrativa por IA quando não há foto | ✅ IA da Cloudflare: genérica, sem marca, rotulada, com cota diária `tabloide_ia_registrar` | F-174 |
| Envio ao R2 e regra de caminho | ✅ `uploadToR2` (navegador) + `fn_r2_validate_object_scope`. Envio pelo servidor (SigV4) já escrito para o Studio (`_shared/studio/r2.ts`, ainda não publicado) | — |
| Camada de provedores trocáveis | 🟡 `_shared/studio/provedores.ts` (Studio de IA Cinematográfica, **não publicado**): é só acrescentar o adaptador OpenAI | — |
| Créditos ou carteira | ❌ **Não existe** nenhuma tabela de crédito, carteira, saldo ou ledger. Só cotas diárias grátis (`tabloide_ia_uso`; `studio_uso` não publicado) | busca no banco |
| Registro de uso de IA | 🟡 `ai_auditoria` e `ai_predicoes` existem com **0 linhas** e só a IA *simulada* do portal as usa. **Não reaproveitar** | banco, `ai.service.ts` |
| Conversa ou histórico de criação | ❌ Não existe | — |
| Clientes | ✅ `clientes` (218: 96 na empresa principal, 119 na de teste). "Cliente" no pedido = anunciante (`clientes.id`) dentro da empresa (`empresa_operadora`) | banco |
| Perfis e permissão | ✅ `perfis` + `usuarios.is_owner` + `user_roles(app_role admin)`. **Não existe permissão por recurso** ("pode usar o AI Studio") | `useRbac.ts`, banco |

**Conclusão de reaproveitamento:**
- **Biblioteca de logos:** `tabloide_selos`.
- **Inserção no editor:** `ElementoLivre`/`novoElemento`. **Não** é preciso criar um editor, uma camada ou outra estrutura de mídia.
- **Busca de produto:** `produto-imagem` + catálogo.
- **Envio:** R2 com o padrão `tenants/{empresa}/…`.
- **Provedores:** a camada do Studio.
- **O que realmente falta:**
  - conversa e histórico;
  - carteira e ledger de créditos;
  - permissão por recurso;
  - o adaptador OpenAI;
  - a tela do AI Studio.

## 3. Relação com o "Studio de IA Cinematográfica" (feito antes, ainda não publicado)

Proponho **um só módulo Studio** com duas áreas, para não ter duas marcas, dois menus e duas camadas de provedores:

| Área | O que faz | Público |
|---|---|---|
| **AI Studio · Criar imagem** (este pedido) | Conversa com GPT Image, logos 3D, imagens, biblioteca e inserção no tabloide | Administradores autorizados |
| **AI Studio · Produção de vídeo** (já pronto) | Agentes, cenas e montagem MP4 | Anunciante e owner/ADM |

**O que as duas áreas compartilham:**
- `provedores.ts`, com o adaptador OpenAI novo;
- envio ao R2;
- **a mesma carteira de créditos por cliente.** As etapas pagas do Studio de vídeo (imagem paga, vídeo por IA e o `sora-2` que agora sabemos estar liberado) passam a debitar dessa carteira.

## 4. Arquitetura proposta

```
Navegador (React) /dashboard/studio/imagens       Supabase                                         OpenAI
 cliente selecionado + saldo                       Edge Function studio-imagens (JWT obrigatório)
 conversa: texto + referências (upload R2)  ──►    1 sessão + perfil + permissão "ai_studio.gerar"
 [Melhorar prompt] (mostra o texto, não troca)     2 cliente pertence à empresa do operador
                                                   3 studio_creditos_reservar (transação, idempotente)
 status real por consulta ◄──────────────────      4 job PROCESSANDO → EdgeRuntime.waitUntil:
                                                       /v1/images/generations ou /v1/images/edits ──► gpt-image-* (modelo do backend)
                                                   5 imagem → R2 tenants/{empresa}/ai-studio/{conversa}/{job}-vN.png
                                                       hash, tamanho, MIME, dimensões, canal alfa (decodificado no servidor)
                                                   6 confirmar débito + custo real (usage) │ falha → estorno
                                                   cron 5 min: job parado há mais de 10 min → FALHA + estorno (recuperação)
 [Salvar na biblioteca] → tabloide_selos (tipo LOGO_CABECALHO / IMAGEM_IA, categoria, origem "Gerada por IA (modelo)")
 [Inserir no tabloide]  → /dashboard/tabloide?inserir=<selo_id> → novoElemento() (fluxo oficial do editor)
 [Baixar] · [Nova versão] · [Usar como referência]
```

### Por que a Image API, e não a Responses API

- Os modelos `gpt-image-2*` são suportados direto na Image API.
- A Image API aceita `background: transparent`.
- Ela deixa explícito o que vai a cada chamada: cada nova versão envia **a imagem anterior + as referências escolhidas + a instrução**, que é o que o pedido exige ("enviar as referências a cada operação"). Não há memória visual escondida.
- A Responses API (`previous_response_id`) fica como opção futura, atrás da mesma interface.

### Tempo

- A geração leva de alguns a dezenas de segundos.
- O job é criado e reservado na hora. A chamada roda em segundo plano (`EdgeRuntime.waitUntil`), e a tela consulta o **status gravado no banco**.
- Um varredor recupera os jobs interrompidos.

### Assistente de prompt

- Usa `gpt-5-mini`, que custa centavos.
- Sugere uma versão organizada e **mostra as duas** ao administrador.
- Textos entre aspas e números do pedido ("SUPER OFERTA", "R$ 9,99") são conferidos por código. Se algum mudar, a sugestão é descartada.
- Nada é trocado sem o administrador ver.

## 5. Dados (propostos; nada criado)

| Tabela | Conteúdo | Observação |
|---|---|---|
| `studio_ia_autorizados` | `usuario_id`, `recurso` (`ai_studio.gerar`, `ai_studio.creditos`, `ai_studio.config`), `concedido_por`, `criado_em` | Permissão específica. O owner concede. Permite liberar outros perfis no futuro sem mexer no RBAC |
| `studio_conversas` | `id`, `empresa`, `cliente_id`, `operador_id`, `titulo`, `categoria`, `criado_em` | Uma conversa é sempre de um cliente |
| `studio_jobs` | `id`, `conversa_id`, `tipo` (gerar/editar/melhorar_prompt), `status` (`AGUARDANDO`, `RESERVANDO`, `PROCESSANDO`, `CONCLUIDO`, `FALHA`, `CANCELADO`, `ESTORNO_PENDENTE`, `ESTORNADO`), `prompt_original`, `prompt_enviado`, `parametros` (jsonb), `modelo`, `referencias` (ids), `origem_imagem_id`, `idempotencia` (único), `custo_usd`, `tokens`, `creditos`, `erro`, horários | É a mensagem da conversa e a operação ao mesmo tempo (evita a tabela de mensagens duplicada) |
| `studio_imagens` | `id`, `empresa`, `cliente_id`, `job_id`, `versao_de` (imagem anterior), `path`, `url`, `mime`, `largura`, `altura`, `bytes`, `sha256`, `alfa` (`verificado`/`ausente`/`nao_verificado` + relatório), `modelo`, `escolhida` | Versões encadeadas por `versao_de` |
| `studio_carteiras` | `empresa`, `cliente_id` (único), `saldo`, `reservado`, `check (saldo >= 0 and reservado >= 0)` | Saldo sempre igual à soma do ledger; nunca alterado direto |
| `studio_creditos_mov` | `id`, `carteira`, `tipo` (`CREDITO_MANUAL`, `DEBITO_MANUAL`, `RESERVA`, `CONSUMO`, `ESTORNO`, `AJUSTE`), `quantidade`, `job_id`, `operador_id`, `motivo` (obrigatório nos manuais), `idempotencia` (único), `criado_em` | **Imutável:** sem UPDATE/DELETE (gatilho bloqueia). Correção = novo movimento |
| `studio_modelos_config` | `modelo`, `habilitado`, `padrao`, `qualidades`, `tamanhos`, `creditos_por_operacao` (tabela de conversão por qualidade e tamanho), `preco_tokens` (para o custo real), `limite_por_pedido`, `max_bytes` | Os nomes dos modelos ficam **só aqui e no backend** |
| `tabloide_selos` (existente) | + `geracao_id uuid null` (liga à `studio_imagens`) e o tipo novo `IMAGEM_IA` | **Coluna aditiva.** Nada que existe muda |

Regras de banco:
- RLS: só leitura para quem tem a permissão (owner/ADMIN e autorizados), sempre da própria empresa.
- Escrita só por funções `SECURITY DEFINER` e pela Edge Function (service).
- Créditos com `SELECT … FOR UPDATE` na carteira, chave de idempotência por job e movimento, e reserva → consumo ou estorno na mesma transação.

## 6. Créditos

Os três conceitos ficam separados:
1. **Saldo de créditos** do cliente (`studio_carteiras`).
2. **Custo real** da OpenAI (`studio_jobs.custo_usd`, calculado pelo `usage` da resposta).
3. **Créditos debitados** (`studio_creditos_mov` do tipo `CONSUMO`).

A conversão é configurável (`creditos_por_operacao`) e **não** equivale a dólar.

| Situação | O que acontece com os créditos |
|---|---|
| Sucesso | `CONSUMO` igual à reserva |
| Falha da API ou bloqueio de conteúdo | `ESTORNO` |
| Repetição com a mesma chave | Devolve o mesmo job, sem nova cobrança |
| Job interrompido | O varredor estorna |

**Tela de créditos** (permissão `ai_studio.creditos`):
- saldo, reservado e histórico;
- quem fez cada movimento;
- consumo e custo real por período;
- falhas e estornos;
- crédito e débito manual com motivo obrigatório.

## 7. Logos 3D, produtos e editor

- **Logos 3D:**
  - categorias iniciais: as 15 do pedido, guardadas em `tabloide_selos.categoria`, com cadastro livre de novas;
  - guia de direção de arte versionado: extrusão, contorno metálico, iluminação de estúdio, ouro, vermelho e amarelo, faixas e medalhões;
  - pedido com `background: transparent` e `output_format: png`;
  - **alfa decodificado no servidor** e conferido de novo pela `validarAlfa` ao salvar na biblioteca. Sem alfa verdadeiro, a imagem é marcada "fundo não transparente" e oferece "gerar de novo com fundo transparente".
  - O recorte de fundo liso existente **não** é usado automaticamente em logos 3D, porque apagaria brilho e sombra. Só como ação manual, com revisão.
- **Texto da logo:** a escrita exata ("PROMOÇÃO", acentos) é conferida por leitura (`gpt-5-mini` com visão, ou OCR). Se o texto lido for diferente do pedido, aparece um aviso antes de salvar.
- **Produtos:** a ordem pedida já é a do `produto-imagem`: catálogo local → Open Food Facts → bancos livres → upload.
  - Acrescentar a busca por **EAN/GTIN** (Open Food Facts por código de barras).
  - Comparar volume, embalagem e variante, e mostrar as opções quando houver ambiguidade.
  - Gravar fonte, licença e crédito; CC-BY-SA exige atribuição.
  - A IA **não** gera foto "oficial". A imagem ilustrativa é genérica, **sem marca** e rotulada "ilustrativa".
- **Editor:** "Inserir no tabloide" salva (ou reaproveita) a imagem em `tabloide_selos` e abre `/dashboard/tabloide?inserir=<id>`. O editor só precisa ler esse parâmetro e chamar o `novoElemento` que já existe, uma mudança pequena no `TabloideEditor`. Logo de cabeçalho: escolher como cabeçalho (`logoCabecalhoId`).

## 8. Validações necessárias antes de implementar

1. **Uma chamada real de teste** (cerca de US$ 0,01 a 0,25, com a sua autorização) em `gpt-image-2` e em `gpt-image-2.5-flare`, `low` e `medium`, com `background: transparent`, para:
   - confirmar o canal alfa verdadeiro;
   - medir o custo real por imagem dos modelos 2.5;
   - medir a qualidade do texto em português (acentos).
2. A **camada de uso** da organização na OpenAI (limite de imagens por minuto e limite de gasto).
3. Se a Edge Function cabe no tempo de "alta" e "xhigh". Se não couber: a Responses API em `background`.
4. Os termos do Open Food Facts para uso comercial das fotos (CC-BY-SA: atribuição e compartilhamento).

## 9. Micro-gates

| Gate | Entrega | Depende de |
|---|---|---|
| AI-0 | Teste real de transparência, custo e texto (§8.1) | **Sua autorização** (custo de centavos) |
| AI-1 | Migração (permissão, conversas, jobs, imagens, carteira, ledger, configuração) + testes de RLS e créditos em transação desfeita (reserva, consumo, estorno, idempotência, concorrência, saldo nunca negativo) | — (testável sem publicar) |
| AI-2 | Edge Function `studio-imagens` + adaptador OpenAI em `provedores.ts` + varredor | Gravar `OPENAI_API_KEY` no Supabase (**autorização**) |
| AI-3 | Tela do AI Studio (identidade #22004A/#5D1BFF/#8A2EFF/#B04DFF/#FFD400/#25D366): cliente e saldo, conversa, referências, versões, histórico "Minhas criações" | AI-1 |
| AI-4 | Biblioteca (`tabloide_selos`), logos 3D por categoria, alfa, "Inserir no tabloide" | AI-3 |
| AI-5 | Tela de créditos e configuração de modelos | AI-1 |
| AI-6 | Produtos por EAN e confirmação de variante | AI-4 |
| AI-7 | Homologação de ponta a ponta + `contrato-player.mjs` | Publicação autorizada |

## 10. Decisões suas

1. **Rotacionar a chave da OpenAI** (ela apareceu na conversa) e definir um **limite de gasto** na organização.
2. Autorizar o **teste AI-0** (centavos de dólar).
3. **Tabela de conversão de créditos:** quanto vale 1 crédito? Sugestão inicial a calibrar após o AI-0:

   | Operação | Créditos |
   |---|---|
   | `low` | 1 |
   | `medium` | 5 |
   | `high` | 20 |

4. **Modelo padrão:** sugiro `gpt-image-2` `medium` (US$ 0,053), com `gpt-image-2.5-sunburst` para edição precisa, depois de medir o custo no AI-0.
5. **Unificar** este AI Studio com o Studio de vídeo já feito (um módulo, duas áreas e uma carteira), como no §3?
6. Quem recebe a permissão `ai_studio.gerar` na primeira versão: só o owner, ou owner + ADMIN?
