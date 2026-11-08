# Provedores de IA da SOBRE MÍDIA (documento vivo)

> **Política FREE-FIRST (dono):**
> - grátis primeiro;
> - nada pago sem consentimento;
> - nunca cair em silêncio de um modelo grátis para um pago;
> - nunca repetir chamada paga sem limite.
>
> Chaves só como segredos do servidor (Supabase) ou no cofre `~/.sobremidia-secrets/tokens.env`, nunca no site.
>
> Atualizado em 08/11/2026 (F-262).

## Situação real (consulta `{"acao":"provedores"}` ao `studio-orquestrador`, 08/11/2026)

| ID | Tipo | Modelo | Custo | Disponível | Usado por |
|---|---|---|---|---|---|
| `cf-llama4-scout` | texto e visão | `@cf/meta/llama-4-scout-17b-16e-instruct` | grátis na cota (10.000 neurons/dia) | ✅ | Studio (agentes, visão), analista de referências |
| `groq-texto` | texto | `openai/gpt-oss-120b` | grátis no limite da conta | ✅ | Studio (Core), `agente-ia` (1º) |
| `gemini-texto` | texto | `gemini-flash-lite-latest` | grátis no limite | ✅ | Studio, `agente-ia` (2º) |
| `openrouter-texto` | texto | modelo `:free` | grátis no limite diário | ✅ | Studio, `agente-ia` (3º) |
| `cf-flux-schnell` | imagem | `@cf/black-forest-labs/flux-1-schnell` | ≈ 96 neurons por cenário | ✅ | cenários do Studio |
| `cf-lucid-origin` | imagem paga | `@cf/leonardo/lucid-origin` | ≈ US$ 0,087 por imagem | ❌ desligado (`STUDIO_PERMITIR_IMAGEM_PAGA` + Workers Paid) | Studio AI "Cloudflare" |
| OpenAI `gpt-image` | imagem paga | via `studio-ai` | crédito do cliente (R$ 4,99) | ❌ sem saldo (P-07) | "Criar com IA" |
| `gh-actions-ffmpeg` | montagem | FFmpeg + Playwright | R$ 0 (repositório público) | ✅ desde 08/11/2026 | montagem de vídeo |
| `llama-3.2-3b` (Worker) | texto | `@cf/meta/llama-3.2-3b-instruct` | grátis na cota | ✅ | tradução do nome do produto (`cloudflare/tabloide-ia/worker.js`) |
| vídeo por IA, voz, música, Canva | — | — | pago ou a definir | ❌ sem provedor ou decisão | — |

Os provedores do Projeto Mestre (Qwen, Alibaba Wan, Higgsfield, Runway) ainda **não foram avaliados com documentação oficial**. Nada foi integrado: preço, API e licença comercial precisam ser conferidos na fonte antes (MG-AUT-05).

## Onde está o código (hoje em dois lugares)
- `supabase/functions/_shared/studio/provedores.ts`: lista completa, situação, executores Cloudflare e compatível com OpenAI, `textoGratis`, `MODELOS_PERMITIDOS`.
- `supabase/functions/_shared/agente/ferramentas.ts` (`PROVEDORES`): a ordem Groq → Gemini → OpenRouter do `agente-ia`.

**MG-AUT-05:** juntar os dois num módulo único (`_shared/ia/`), com custo estimado, cota por empresa e a regra "pago só com confirmação" testada.
