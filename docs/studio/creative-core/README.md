# SOBRE MÍDIA CREATIVE CORE

A inteligência central do SOBRE MÍDIA STUDIO, entregue nas etapas MG-STUDIO-02 e MG-STUDIO-03 (31/10/2026).

## Regra principal

**O Creative Core define o padrão. Os modelos de IA são ferramentas de produção.**

Toda criação passa pelo Core. Quando nenhuma API externa responde, o Core continua trabalhando no modo local: briefing, segmento, direção de arte, roteamento, roteiro, prompts e plano completo da produção.

## Onde está cada coisa

Para não duplicar, a fonte da verdade é uma só.

| Conhecimento | Fonte (Git, versionado) | Cópia viva no banco |
|---|---|---|
| DNA visual e identidade do Studio, hierarquia de autoridade, proibições, princípios | `supabase/functions/_shared/studio/core/dna.ts` (`VERSAO_DNA`) | `studio_conhecimento` tipo `dna` |
| Manual de direção de arte (análise, composição, iluminação, tipografia, hierarquia, acabamento) e portões de qualidade | `dna.ts` → `MANUAL`, `PORTOES_DE_QUALIDADE` | tipo `manual` |
| Regras por modalidade (imagem, fotografia de produto, arte comercial, elementos 3D, redes sociais, personagens, motion, vídeo IA), roteiros 15 s/20 s, formatos | `dna.ts` → `REGRAS`, `ROTEIROS`, `FORMATOS_IMAGEM` | tipo `regra` |
| Taxonomia: 10 segmentos com categorias, subcategorias, público, objetivos, estilos, paletas, ambientes, prompts-base, regras e provedores | `core/segmentos.ts` | tipo `segmento` (o banco pode acrescentar ou substituir sem mexer no código) |
| Personas dos agentes (Produtos, Diretor, Roteirista, Fotografia, Prompts) | `_shared/studio/biblia.ts` (`DIRETRIZ`) + `contextoParaAgente` | `studio_agentes` (já existia, versionada) |
| Bíblia v1 (estilos por categoria) | `_shared/studio/biblia.ts` | — (o DNA v2 a inclui) |

A semente do banco vem do Git (`node scripts/studio/semear-conhecimento.mjs`):
- só grava uma **versão nova** quando o conteúdo muda;
- a versão anterior fica guardada e inativa.

A memória é separada por escopo: **global < empresa < cliente < campanha**.
- O global muda só pelo Git (revisão da SOBRE MÍDIA).
- Os demais escopos mudam só por OWNER/ADMIN, com autor, data e motivo.

## Fluxo de uma criação

1. **Especialista de Segmento:** reconhece o segmento sem IA, pelas palavras do pedido e da categoria escolhida.
2. **Briefing:** objetivo, público, produto principal, identidade, tipo e duração. Registra o que **falta** e o que **não bate** (ex.: oferta sem preço; preço só no texto livre).
3. **Diretor Criativo:** direção local a partir do DNA e do segmento. Uma IA grátis (Groq → Google AI Studio → OpenRouter) pode **refinar**, mas só entra o que passa nas regras.
4. **Roteamento:** escolhe o modo e diz por quê.
   - composição determinística;
   - fotografia de produto;
   - imagem por IA;
   - motion;
   - vídeo IA.

   Também informa qual provedor usar e se ele está disponível. Bloqueado → alternativa.
5. **Engenheiro de Prompts:** um prompt **próprio por provedor** (FLUX, GPT Image, vídeo IA, editor interno), sempre sem texto, logos ou preço.
6. **Qualidade:** confere se os termos são do segmento certo (ex.: clínica ≠ roupa/cosmético), se não há preço nem percentual nos prompts, se há a proibição de logos, se o roteiro soma o tempo exato e se as regras de saúde foram aplicadas. Reprovou → o plano não segue.
7. **Agentes existentes** (Diretor, Roteirista, Fotografia, Prompts): recebem no sistema a diretriz deles + DNA + segmento + regras da modalidade. Se a IA cair, o Core monta o plano local (`core-local`).
8. **Editor de vídeo:** "Abrir no editor de vídeo" transforma o plano em projeto editável. Preço real por cima, nunca escrito por IA.

## Limites declarados (não prometidos)

- **Vídeo por IA:** sem provedor contratado, fica bloqueado. A alternativa é motion.
- **Continuidade de personagem:** os modelos grátis atuais não aceitam referência. Exige provedor com referência (MG-STUDIO-08).
- **Qualidade:** o Core confere o **plano** (texto). A conferência da imagem final (visão + OCR do preço) é do MG-05/montagem.
