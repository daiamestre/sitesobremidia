# Arquitetura proposta — SOBRE MÍDIA Studio + AI Cinematográfica

Data: 30/10/2026. **Proposta, nada implementado.** Baseada em `MG00_AUDITORIA_ARQUITETURAL.md`.

## 1. Princípios

1. **Reaproveitar antes de criar.**
   - Envio: `get-upload-url`.
   - Moderação: `analisar-midia`.
   - Mídia e Biblioteca: `media`, `cliente_assets`, `biblioteca_*`.
   - Publicação: playlists → telas.
   - Trabalho pesado: `repository_dispatch` → Actions.
   - Fila: `pg_cron`.
   - IA de imagem: o Worker do dono.
   - Cota: o modelo do `tabloide_ia_registrar`.
2. **Nada na Vercel.** Nenhuma função nova em `api/`. Orquestração em Edge Functions (Deno); FFmpeg e Playwright no
   GitHub Actions.
3. **Preço, loja e marca nunca passam pelo gerador.** O número digitado é a única fonte. O texto é desenhado por código
   (Playwright/HTML) e conferido por OCR.
4. **Rótulo honesto** em cada resultado:
   - "Imagem gerada por IA";
   - "Vídeo montado a partir de imagens" (zoom, deslocamento, transições);
   - "Vídeo gerado por IA" (só com um provedor de vídeo real);
   - "Modelo editável no Canva".
5. **Provedor trocável.** Cada provedor entra por um adaptador com a mesma interface. Nenhuma chave no navegador.
6. **Gasto controlado:**
   - estimativa antes de cada etapa paga;
   - cota por pessoa e por empresa;
   - chave de idempotência por etapa (uma geração paga nunca se repete sozinha);
   - "tentar de novo" é um botão do cliente.
7. **Player intocado.** Saída = MP4 H.264 (o mesmo perfil do `compress-video`) ou PNG, em 1920×1080 ou 1080×1920.

## 2. Visão geral

```
CLIENTE / EQUIPE (React, /portal/studio e /dashboard/studio)
 │ ideia em texto + fotos do produto + preços + loja + formato (16:9 | 9:16) + duração + tipo de saída
 │ fotos → get-upload-url (já existe) → cliente_assets (moderação de sempre)
 ▼
studio_producoes (estado)  ◄── pg_cron (1 min) ── Edge Function `studio-orquestrador`
                                                    │
   AGENTES (LLM com JSON validado por esquema)      │   CÓDIGO DETERMINÍSTICO
   1 Diretor Criativo → roteiro, cenas, tempos      │   3 Produtor → escolhe provedor por capacidade/cota/orçamento
   2 Especialista de Cena → prompts imagem/vídeo,   │   4 Montador (Actions `studio-montar`):
     ângulos, câmera, luz (usa fichas aprovadas     │      Playwright desenha textos/preços exatos;
     da Biblioteca de Referências)                  │      FFmpeg: cenas, movimento, transições, áudio, MP4
   6 Bibliotecário → sugere pasta/tags              │   5 Qualidade: ffprobe (duração/formato), OCR do preço
                                                    │      = número digitado, visão (produto presente)
   ADAPTADORES (Edge Function, chaves no servidor)  │
   imagem: Workers AI FLUX (grátis) | Gemini image (pago, opcional)
   vídeo:  desligado até provedor+orçamento (Kling/Seedance/Gemini Omni)
   voz:    a decidir (Piper aberto no Actions | ElevenLabs pago)
   Canva:  OAuth + autofill + export (integração do dono)
 ▼
resultado: cliente → cliente_assets → playlists do cliente → telas autorizadas
           owner/ADM → media + biblioteca_itens (pasta do segmento) → catálogo de modelos
```

## 3. O que o cliente recebe (por tipo de pedido)

| Pedido | Entrega | Como | Situação |
|---|---|---|---|
| "Fotos do meu produto em vários ângulos" | 3 a 6 imagens de cena, 16:9 ou 9:16 | FLUX com a foto do cliente como referência (`flux-2-klein`, multi-referência) **ou** produto real recortado sobre um cenário gerado. Rótulo "Imagem gerada por IA" | Possível na cota grátis. Fidelidade ao rótulo do produto 🔍 a testar |
| Storyboard | Sequência de 4 a 8 quadros com tempo, câmera e texto de cada cena | Diretor Criativo + imagens por cena | Possível na cota grátis |
| Vídeo comercial curto | MP4 de 10 a 30 s | Montagem por FFmpeg das imagens (movimento de câmera, transições, preço desenhado). Rótulo "Vídeo montado a partir de imagens" | Possível a custo R$ 0 (Actions) |
| Vídeo por IA | MP4 com movimento real gerado | Adaptador de vídeo pago. Preço e texto ainda desenhados por cima | **Bloqueado:** provedor e orçamento |
| Modelo editável | Design no Canva com título, preço, logo e foto/vídeo trocáveis | Autofill de um modelo mestre do dono → `edit_url` → exportação → R2 | **Bloqueado:** integração Canva + plano Pro/Teams do dono |
| Modelo editável dentro da SOBRE MÍDIA | Arte por camadas (texto, preço, logo, foto) | Camada determinística (`ArteModelo.tsx`) com edição rápida | Possível. Estende o padrão do Cartaz Digital |

## 4. Biblioteca de Referências (Cinematic Reference Library)

**Por que fica separada da Biblioteca de Mídias:**
- uma pasta da Biblioteca pode ir **inteira** para uma playlist (`playlist_items.biblioteca_pasta_id`);
- o R2 atual é público por domínio;
- o acervo de referência é de terceiros (TikTok, Pinterest, Vimeo) e **não pode ir à tela**.

| Seção da pasta local | Onde fica no sistema |
|---|---|
| 01 Referências originais (imagens/vídeos) | `studio_referencias` (tipo `foto`/`video`) + arquivo **privado** |
| 02 Análises dos vídeos | `studio_referencias.analise` (JSON: enquadramento, lente aparente, luz, paleta, movimento, ritmo, cortes por segundo) |
| 03 Bíblia visual | `studio_referencias` tipo `movimento`/`iluminacao`/`estilo` (ficha em texto) + `docs/studio-ai/biblia/*.md` versionado |
| 04 Prompts aprovados | `studio_prompts` (texto, agente, segmento, versão, aprovado_por) |
| 05 Imagens geradas / 07 Vídeos gerados | **Não é tabela nova.** São saídas de `studio_etapas` (arquivos em `studio/<producao>/…`) |
| 06 Storyboards | **Não é tabela nova.** É o plano aprovado de uma `studio_producoes` |
| 08 Aprendizado aprovado | `docs/studio-ai/agentes/<agente>.vN.md` (do laboratório NotebookLM, revisado pelo dono) + correções registradas em `studio_etapas` |

**Campos obrigatórios de cada referência:**
- `origem`: próprio, licenciado, banco livre ou só estudo;
- `licenca_texto` e `url_origem`;
- `pode_ir_para_gerador` (bool): `false` para tudo que for "só estudo".

**Regra:** uma referência de terceiro inspira **só** a ficha em texto. Como imagem de entrada do gerador, só vão:
arquivos próprios, licenciados ou a foto do produto do próprio cliente.

## 5. Dados novos (propostos, para MG01/MG02b; nada criado)

| Tabela | Para quê | Isolamento (regras próprias, sem `is_central_privileged`) |
|---|---|---|
| `studio_producoes` | Pedido, dados estruturados (produtos com `asset_id` e preço exato), formato, duração, tipo, estado, custo estimado e real, resultado, rótulo | cliente: o próprio `cliente_id`/`user_id`; owner/ADMIN: a empresa |
| `studio_etapas` | Agente/adaptador, versão da diretriz, provedor, modelo, entrada/saída JSON, arquivos, custo, tentativas, erro, chave de idempotência | igual à produção |
| `studio_uso` | Cota diária por pessoa e empresa e por tipo (imagem, vídeo, voz). Molde do `tabloide_ia_uso` | só pelas funções `SECURITY DEFINER` |
| `studio_referencias` | Biblioteca de referências | só owner/ADMIN da empresa |
| `studio_prompts` | Prompts aprovados e versionados | só owner/ADMIN. Os agentes leem pelo servidor |

**Não criar:**
- tabela de arquivos paralela: o resultado final usa `cliente_assets` ou `media`;
- outra Biblioteca, outra playlist ou outro catálogo de telas;
- `artes`/`campanha_arte_versoes`: exigem campanha. Podem ser ligadas mais tarde, numa decisão própria.

**Arquivos privados (decisão pendente, ver RISCOS R-03):**
- um bucket R2 separado e **sem domínio público**, para referências e rascunhos;
- leitura por link SigV4 curto, com o mesmo código de `get-download-url` levado a uma função nova do Studio;
- `get-download-url` não muda.

## 6. Estados de uma produção

`recebido → planejando → aguardando_aprovacao_plano → gerando_imagens → montando → conferindo → pronto | reprovado | erro`

- O cliente vê os estados reais.
- As etapas pagas só começam depois de "aprovar plano".
- Erro de provedor: até 2 retentativas **só nas etapas gratuitas**. Etapa paga falha e espera o botão do cliente.
- Webhook de provedor de vídeo (quando existir): Edge Function que confere a assinatura e só muda o estado da etapa.
  `pg_cron` continua como reserva para tarefas que não chamam de volta.

## 7. Canva (quando autorizado)

1. O dono cria a integração **privada** no Canva Developers e guarda o client secret nos segredos do Supabase.
2. O OAuth do dono (PKCE) roda numa Edge Function. O refresh token fica criptografado no banco, nunca no navegador.
3. O dono marca modelos mestres (brand templates) com campos: `titulo`, `preco`, `logo`, `produto` (imagem ou vídeo).
4. Fluxo:
   1. autofill com os dados da produção;
   2. `edit_url` com `correlation_state`;
   3. volta conferindo o `correlation_jwt`;
   4. exportação MP4/PNG;
   5. download em até 24 h;
   6. R2;
   7. `cliente_assets`/`media`.
5. Primeira fase: **só a equipe do dono** edita no Canva (integração privada = time do dono). O cliente final usa a edição
   rápida da SOBRE MÍDIA. A edição pelo cliente no Canva depende da integração pública e da revisão (RISCOS R-08).
