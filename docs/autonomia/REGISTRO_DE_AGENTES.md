# Registro de agentes do PRODUTO SOBRE MÍDIA (documento vivo)

> Agentes que rodam **dentro da plataforma, em produção**. Os agentes e skills de *desenvolvimento* (`.claude/skills/`, `.agents/`) não entram aqui.
>
> **Regra (dono, MG-AUT-04):** antes de criar um agente novo, procure aqui um que já faça o trabalho.
> - Todo agente tem dono do acesso: o banco decide pelo login de quem pediu.
> - Nenhum agente cria outro agente nem muda as próprias regras.
> - Melhoria proposta por agente só entra com revisão.
>
> Atualizado em 08/11/2026 (F-262). Evidências em `docs/autonomia/SOBRE_MIDIA_AUTONOMIA_RELATORIO_MESTRE.md`.

## 1. Motores (orquestradores)

| ID | Onde | Entra por | Acesso | Ferramentas permitidas | Proibido | Registro |
|---|---|---|---|---|---|---|
| `studio-orquestrador` | `supabase/functions/studio-orquestrador` | cron a cada 1 min (`tick`), navegador (`cutucar`), GitHub Actions (`x-studio-segredo`) | produção criada por `studio_criar_producao` (login da sessão; `studio_ai_escopo`) | agentes de planejamento, gerador de cenário grátis, disparo da montagem | imagem paga sem `STUDIO_PERMITIR_IMAGEM_PAGA=1`; mudar preço; publicar em tela | `studio_producoes`, `studio_etapas` |
| `agente-ia` ("Trabalhar com IA") | `supabase/functions/agente-ia` + `_shared/agente/ferramentas.ts` | `/dashboard/ia` (login obrigatório) | `agente_ia_escopo()`: OWNER, ADM e FINANCEIRO podem propor cobrança | `relatorio_telas`, `resumo_financeiro`, `listar_cobrancas`, `buscar_cliente`, `oportunidades`, `propor_cobranca` (só com Confirmar) | criar sem confirmação; marcar pago; mexer em contrato ou permissão | `agente_ia_registros`, `financeiro_auditoria` |

## 2. Agentes de criação (chamados pelo `studio-orquestrador`)

| ID | Função | Arquivo | Modelo | Saída | Qualidade |
|---|---|---|---|---|---|
| `core` | segmento, briefing, direção, roteamento, prompts e conferência | `_shared/studio/core/core.ts` | local + refino por texto grátis (Groq → Gemini → OpenRouter → Cloudflare) | plano do Core | `conferir()`: termos de outro segmento, preço fora do prompt, sem logos |
| `core-local` | plano sem IA quando as IAs caem | `core.ts` `planoLocal` | nenhum | plano completo | mesmo `conferir()` |
| `produtos` | lê a foto do produto | `_shared/studio/agentes.ts` `analisarProduto` | Llama 4 Scout (visão) | análise | não inventa marca |
| `diretor` | direção de arte | `diretorCriativo` | texto grátis | direção | estilos do segmento |
| `roteirista` | cenas e textos | `roteirista` | texto grátis | roteiro com a duração exata | `normalizarDuracoes` |
| `fotografia` | câmera, lente e luz | `diretorFotografia` | texto grátis | fotografia | — |
| `prompts` | prompt do gerador de imagem | `especialistaPrompts` | texto grátis | prompts | proíbe texto, logos e preço |
| `montagem` | MP4/PNG + conferência | `scripts/studio/montar.mjs` (Actions, FFmpeg + Playwright) | nenhum | vídeo/artes | codec H.264 High, resolução, duração, pixel, tamanho |
| `analista-referencias` | lê uma imagem de referência e escreve o prompt (Studio AI) | `_shared/studio/agente-referencia.ts`; instruções no banco (`studio_agentes`) | Llama 4 Scout (visão) | análise | `validarAnalise` |

## 3. Agentes pedidos no Projeto Mestre que ainda não existem

| Pedido | Decisão |
|---|---|
| Central de Comando | evoluir o `agente-ia` com as ferramentas do Studio (ADR-AUT-001); não criar um 3º motor |
| Encartes pelo agente | ferramenta nova no `studio-orquestrador` usando `ENCARTES_OFICIAIS` (MG-AUT-08) |
| Personagens | só depois de decidir provedor e regras de imagem de pessoas (o DNA proíbe rosto inventado sem pedido) |
| Segurança | continua sendo a camada do banco (regra de acesso + funções de escopo), não um agente de IA: um modelo não pode ser a trava |
| Memória por cliente | `studio_conhecimento` (escopos empresa/cliente/campanha) + tela de consentimento (MG-AUT-12) |

## 4. Como acrescentar um agente
1. Escreva a função em `_shared/studio/` (ou a ferramenta em `_shared/agente/ferramentas.ts`) com entrada e saída tipadas.
2. Registre a execução em `studio_etapas` (agente, modelo, versão, custo e idempotência) ou em `agente_ia_registros`.
3. Faça o teste em `src/tests/unit/` e atualize esta tabela.
4. Publique a função (`scripts/ops/README.md`).
