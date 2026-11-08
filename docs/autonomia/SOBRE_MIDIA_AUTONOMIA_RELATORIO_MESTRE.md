# SOBRE MÍDIA AUTÔNOMA — Relatório Mestre (MG-AUT-01 e MG-AUT-02)

> **Data:** 08/11/2026 · **Ramo:** `release/player-5.2.4` (anda junto com `main`) · **Registro:** F-262
>
> **Escopo desta execução:** Fase A (auditoria com evidências), Fase B (consolidação da memória) e Fase C (plano em Micro-Gates).
> Nada foi publicado no site nem alterado no banco nesta fase. As consultas ao banco foram só de leitura, e os testes de acesso rodaram em transações desfeitas.
>
> **Legenda de certeza:** ✅ confirmado com prova · 🟡 provisório (indício, sem prova completa) · 💭 hipótese · 📌 decisão aprovada pelo dono · ⏳ pendente.

---

## 1. Resumo executivo

**Estado geral.** A SOBRE MÍDIA já é uma plataforma real em produção:
- painel web, banco com regra de acesso em 100% das tabelas, 34 funções de servidor publicadas, Player Android comercial;
- Studio com encartes, palcos, editor de imagem e editor de vídeo;
- **dois agentes de IA funcionando de verdade**:
  - **"Trabalhar com IA"** (operação e financeiro);
  - **"Vídeo por agentes"** (criação, ponta a ponta desde a F-261).

**O que ainda não existe:**
- a **Central de Comando única**, onde se pede qualquer trabalho em linguagem natural;
- a ligação entre os agentes de operação e os de criação;
- a memória de preferências por cliente com tela e consentimento;
- a integração com o JARVIS.

O caminho recomendado é **evoluir o que já funciona**, sem criar um orquestrador paralelo. A "Trabalhar com IA" vira a Central de Comando, e o orquestrador do Studio continua sendo o motor de criação (decisão ADR-AUT-001, seção 5).

**Capacidades autônomas comprovadas hoje** (com aprovação humana nas etapas certas):
1. Vídeo de 15 s ou arte publicitária a partir de um pedido: plano → cenários por IA grátis → montagem MP4 1920×1080 H.264 → controle de qualidade aprovado (prova: F-261, execução 42492043537 no GitHub Actions).
2. Respostas sobre telas, cobranças e clientes com os dados reais do usuário logado, e proposta de cobrança só com o botão Confirmar (F-223).
3. Reconhecimento de segmento sem IA (11 segmentos; farmácia separada de supermercado e estética separada de moda), com bloqueio de termos de outro segmento (`creativeCore.test.ts`).

**Principais riscos encontrados:**

| # | Risco | Gravidade | Prova |
|---|---|---|---|
| R-1 | Qualquer usuário logado (ex.: anunciante) **lê e altera todos os códigos de pareamento de aparelho** (`device_pairing_codes`: regra `dpc_all_auth` com `true`) | **P0** | teste desfeito: anunciante viu 6 de 6 e alterou 6 de 6 |
| R-2 | A pesquisa de marcas (~398 sites, ~14 mil imagens, 2.483 marcas) existe **só neste computador**, fora do Git e sem cópia | **P0 (dados)** | `../marcas` (9.587 imagens) e `../marcas-v2` (4.409 imagens) |
| R-3 | `contract-signature-flow` usa a chave mestra do servidor sem conferir quem chama (assinar com qualquer `usuarioId`) | P1 (não está publicada) | código lido; ausente da lista de 34 funções no ar |
| R-4 | Dois cadastros de provedores de IA (`_shared/agente/ferramentas.ts` e `_shared/studio/provedores.ts`) | P2 | código |
| R-5 | `master_ledger.md` e `architecture_decisions.jsonl` estão fora do Git e pararam em 11/09/2026 | P2 | `.gitignore` linha 80 |

**Próximas prioridades:**
1. Corrigir R-1 (P0) pela receita `migracao-segura`, com ensaio do Player no emulador.
2. Copiar a pesquisa (R-2) para o R2 privado.
3. MG-AUT-07: a Central de Comando ganha as ferramentas do Studio.
4. MG-AUT-12: preferências por cliente com consentimento.
5. MG-AUT-10: contrato do JARVIS (só documento até o JARVIS existir).

---

## 2. Mapa do sistema (evidência: inventário do repositório e do banco em 08/11/2026)

| Camada | O que existe | Números |
|---|---|---|
| Frontend | React + TypeScript + Vite + Tailwind + React Query; `src/pages`, `src/modules/{crm,corporate,gestor}`, `src/components` | 78 páginas, 192 componentes |
| Testes | Vitest (`src/tests/unit`) e Playwright (robôs e conferência) | 226 arquivos e 2.264 testes verdes (08/11/2026) |
| Banco | Supabase/PostgreSQL | 330 migrações, 238 tabelas (todas com regra de acesso), 373 funções privilegiadas, todas com `search_path` fixo |
| Funções de servidor | `supabase/functions/*` (Deno) | 37 no repositório e 34 publicadas (não publicadas: `contract-signature-flow`, `generate-contract-pdf`, `public-billing-og`) |
| Vercel | site + 4 funções em `api/` (`_midia.js`, `analise-audio.js`, `analise-visao.js`, `cobranca-og.js`) | plano grátis; publicar só com `scripts/ops/publicar-main.mjs` |
| Cloudflare | Worker `cloudflare/tabloide-ia/worker.js` (Workers AI: Llama 3.2/4, FLUX schnell, Lucid Origin) e arquivos no R2 (`r2.dev`) | cota grátis de 10.000 neurons por dia |
| Robôs | GitHub Actions: `conteudo-automatico`, `compress-video`, `studio-montar`, `studio-fotos`, `deploy-functions`, `publish-player-apk`, `ci`, `keep-alive` | — |
| Player | `native-android-player/` (Kotlin, ExoPlayer, Room) | 5.7.10 comercial; teste 5.8.22 (P-11) |
| Pessoas | perfis: ANUNCIANTE 56, FINANCEIRO 25, CLIENTE 20, GESTOR 19, REPRESENTANTE 16, ADMIN 6, PARCEIRO 5, GERENTE 3, FUNCIONARIO 2, OWNER 1 | 4 empresas operadoras e 19 telas |

---

## 3. Funcionalidades existentes (estado real)

| Funcionalidade | Onde | Estado | Evidência | Pendência |
|---|---|---|---|---|
| Vídeo por agentes (plano → cenários → montagem → qualidade → mídias) | `/studio/agentes`; `src/components/studio/{StudioCentral,BriefingWizard,ProducaoView}.tsx`; `supabase/functions/studio-orquestrador`; `scripts/studio/montar.mjs` | **CONCLUÍDA E VALIDADA** | F-261: MP4 1920×1080, 15 s, H.264, qualidade aprovada | usar com cliente real; trilha e voz sem provedor |
| Creative Core (DNA, 11 segmentos, briefing, roteamento, QA, plano local sem IA) | `supabase/functions/_shared/studio/core/` | **CONCLUÍDA E VALIDADA** | `creativeCore.test.ts`; 15 conhecimentos no banco (`studio_conhecimento`) | memória por cliente sem tela |
| Trabalhar com IA (consultas + proposta de cobrança) | `/dashboard/ia`; `supabase/functions/agente-ia`; `_shared/agente/ferramentas.ts` | **CONCLUÍDA E VALIDADA** | 11 usos registrados em `agente_ia_registros` (último em 02/11) | não cria arte nem vídeo |
| Criar com IA (imagem OpenAI/Cloudflare, crédito R$ 4,99) | `/studio/ia`; `supabase/functions/studio-ai` | **BLOQUEADA** (saldo/cota) | `studio_ai_jobs`: 1 concluída e 3 falhas ("saldo da plataforma", "cota diária") | saldo OpenAI ou Workers Paid (P-07) |
| Editor de vídeo (linha do tempo, efeitos, som) | `/studio/video`; `src/lib/studio/video/motor.ts` | **IMPLEMENTADA** | grava no navegador (MediaRecorder): MP4 quando o navegador sabe, senão WebM | 💭 WebM pode não tocar em todo Player: conferir antes de enviar à tela |
| Editor de imagem e modelos (145 modelos por segmento) | `/studio`, `components/studio/editor` | **CONCLUÍDA** | F-224..F-251, `studioEdicaoCompleta249.test.ts` | — |
| Encartes oficiais e palcos (mercado e farmácia) | `src/lib/studio/{encartesOficiais,palco}.ts` | **CONCLUÍDA E VALIDADA** | F-240..F-259 | **NÃO CONECTADA aos agentes**: o agente não monta encarte oficial |
| Encartes A4 (12) | Cartaz Digital | **PARCIAL** | não giram nem arrastam produto a produto | P-08 |
| Catálogo de produtos com foto oficial | `tabloide_catalogo` | **PARCIAL** | 6.977 linhas, cerca de 3.264 imagens oficiais | P-01..P-03 |
| Logos 3D e pasta de Logos | `/studio/logos` | **CONCLUÍDA** | F-235, F-248 | — |
| Conteúdo automático das pastas | `scripts/conteudo/robo.mjs` | **CONCLUÍDA E VALIDADA** | robô a cada 3 h | — |
| Moderação própria de mídia | `analisar-midia`, `api/analise-*.js` | **CONCLUÍDA** | cron `analisar-midias-pendentes` | — |
| Financeiro (PIX/boleto Banco Inter) | `inter-*-engine`, `payment-webhook` | **CONCLUÍDA** | crons de conciliação | — |
| Assinatura de contrato | `fn_assinar_contrato` (banco) | **CONCLUÍDA**; a função antiga `contract-signature-flow` está **NÃO CONECTADA** | não publicada | R-3: apagar ou proteger |
| Central de Comando única | — | **NÃO INICIADA** | não existe tela nem função que receba qualquer pedido | MG-AUT-07 |
| Memória de preferências por cliente | `studio_conhecimento` (escopo `cliente`) + `studio_conhecimento_publicar` | **INICIADA** (banco pronto, sem tela) | tabela com 0 linhas fora do escopo global | MG-AUT-12 |
| Integração JARVIS | — | **NÃO INICIADA** | nenhum arquivo cita JARVIS | MG-AUT-10 |
| Trilha sonora e locução | — | **BLOQUEADA** | sem provedor nem licença | decisão do dono |
| Vídeo gerado por IA (Kling, Seedance, etc.) | — | **BLOQUEADA** | sem provedor, orçamento nem chave | decisão do dono |

---

## 4. Agentes

Catálogo vivo em `docs/autonomia/REGISTRO_DE_AGENTES.md`. Resumo:

| Agente (pedido do dono) | O que existe de verdade | Estado |
|---|---|---|
| Orquestrador central | `studio-orquestrador` (criação: fila, lease de 4 min, retomada, idempotência por etapa) e `agente-ia` (operação: ferramentas com o login do usuário) | dois motores separados; falta a porta única |
| Arquiteto criativo | `diretorCriativo` + Core `direcaoLocal` + refino por IA grátis | ✅ |
| Marketing e publicidade | parcial no `roteirista` (chamada e texto) | 🟡 sem calendário de campanhas |
| Segmentação | `core/segmentos.ts` `reconhecerSegmento` (11 segmentos, extensível pelo banco) | ✅ |
| Produtos e ofertas | `analisarProduto` (visão), `buscaProduto.ts`, catálogo; preço sempre do pedido | 🟡 não lê o ERP/estoque automaticamente |
| Fotografia de produtos | `diretorFotografia` + recorte sem fundo (F-252) | ✅ |
| Artes comerciais e encartes | encartes oficiais (editor) e `montar.mjs` (artes PNG) | 🟡 o agente não monta encarte oficial |
| Logos e 3D | Criador de Logos 3D (editor, sem agente) | 🟡 manual |
| Personagens | — | ⏳ não iniciado (DNA proíbe rosto inventado sem pedido) |
| Vídeo e animação | roteiro + câmera determinística + FFmpeg (`montar.mjs`) | ✅ (animação determinística é o padrão) |
| Qualidade | `conferir()` do Core + conferência do MP4 (codec, resolução, duração, pixel, tamanho) + preço por código | ✅ |
| Biblioteca e memória | `studio_conhecimento`, galeria em pastas (F-225) | 🟡 sem preferências por cliente |
| Operações | `agente-ia` (`relatorio_telas`, `oportunidades`), crons | 🟡 só leitura |
| Segurança | regras de acesso do banco, `studio_ai_escopo`/`agente_ia_escopo`, confirmação de ações | 🟡 não é agente separado; é a camada do banco (recomendado manter assim) |

Governança de desenvolvimento (fora do produto): `.agents/` (sistema "Antigravity", setembro de 2026; só 57 de 5.793 arquivos no Git) e `.claude/skills/` (7 receitas). **Não confundir** com os agentes do produto.

---

## 5. Creative Core e decisão de arquitetura

**Como funciona hoje (✅):**

PEDIDO (`studio_criar_producao`, login da sessão) → reconhecimento de segmento → briefing (o que falta e o que não bate) → direção de arte (local + refino grátis) → roteamento (composição / imagem IA / motion; pago bloqueado) → prompts próprios → conferência → **aprovação do plano** → cenários (FLUX grátis) → **aprovação das imagens** → edição → montagem (Actions/FFmpeg) → conferência do MP4 → entrega nas mídias.

Cada etapa fica em `studio_etapas` (agente, modelo, versão do DNA, neurons, custo, tentativas, chave de idempotência).

**Mapa dos estados pedidos para os estados reais:**

| Pedido | Real |
|---|---|
| RECEIVED | `recebido` |
| PLANNING | `planejando` |
| WAITING_APPROVAL | `aguardando_aprovacao_plano` e `aguardando_aprovacao_imagens` |
| RUNNING | `gerando_imagens`, `montando` |
| QUALITY_CHECK | `conferindo` |
| COMPLETED | `pronto`, `entregue` |
| FAILED | `falhou` |
| CANCELLED | `cancelado` |

Falta VALIDATING/QUEUED explícito: hoje a validação acontece na criação pela função do banco, e a fila é o próprio `recebido` com lease.

**ADR-AUT-001 (recomendação; detalhes em `docs/autonomia/decisoes_de_arquitetura.jsonl`):**
- A Central de Comando = evoluir a tela "Trabalhar com IA" (`agente-ia`) e dar a ela as ferramentas do Studio:
  - `criar_producao`, que chama `studio_criar_producao` **com o login do usuário**;
  - `listar_producoes` e `situacao_da_producao`.
- A criação continua no `studio-orquestrador`.
- **Não** criar um terceiro orquestrador. Isso respeita a regra do dono "sem arquitetura paralela" e reaproveita fila, cota, regras de acesso e confirmação que já funcionam.

---

## 6. Autonomia: o que o sistema faz sozinho

| Nível | Hoje |
|---|---|
| 1 — automático | planejar, gerar cenários grátis, gerar variações, reconhecer segmento, responder consultas, robô de conteúdo, moderação |
| 2 — confirmação | aprovar plano, aprovar imagens, montar, entregar nas mídias, propor cobrança (Confirmar), crédito pago do Studio AI (R$ 4,99) |
| 3 — autorização especial | imagem paga (`STUDIO_PERMITIR_IMAGEM_PAGA=1` + plano pago), promover Player (`--promover`), migrações; permissões, contratos e financeiro só pelas telas próprias, nunca pelo agente |

**Ainda não consegue:**
- receber "faça um encarte com estes produtos" por conversa;
- transformar UMA arte existente em vídeo pelo agente (pelo editor de vídeo, sim);
- lembrar o estilo aprovado de um cliente;
- publicar em playlist pelo agente (hoje "Enviar para as mídias" não publica na tela; o anunciante passa pela moderação).

---

## 7. Segurança (evidências de 08/11/2026)

| Item | Resultado |
|---|---|
| Regra de acesso (RLS) | ✅ 238 de 238 tabelas com RLS ligada |
| Funções privilegiadas | ✅ 373 com `search_path` fixo; 146 executáveis por anônimo: Player (token do aparelho), páginas públicas e checagens internas. Amostras lidas: `submit_campanha_to_review` e `vincular_pontos_playlist` conferem o login por dentro ✅ |
| **Isolamento (TESTE 7)** | ✅ um usuário de cada perfil (ANUNCIANTE, CLIENTE, FINANCEIRO, FUNCIONARIO, GERENTE, GESTOR, PARCEIRO, REPRESENTANTE) com login simulado viu **0** de 412 mídias de outra empresa, 0 de 16 mídias de outro cliente, 0 de 16 telas de outra empresa, 0 de 72–100 contratos alheios e 0 produções alheias. Roteiro: seção 13 |
| **Pareamento (R-1)** | ❌ anunciante lê e altera 6 de 6 `device_pairing_codes`. Estrutura protegida (Player): correção só pela `migracao-segura` + emulador `TVBox_API25` |
| Regras abertas restantes | `app_releases`, `perfis`, `plano_contas`, `dw_dim_tempo`, `comunicacao_eventos_catalogo` (leitura de catálogo); `contrato_templates` (os 3 modelos não têm empresa, então não há vazamento); `security_logs`/`system_errors` aceitam inserção (risco de lixo, baixo) |
| Segredos | ✅ o site só usa `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_R*`; nenhuma chave em `src/` ou `public/`. Chaves de IA só como segredos do servidor. Cofre fora do repositório |
| Funções sem checagem de login automática | todas são publicadas com `--no-verify-jwt`; cada uma confere por conta própria (login ou segredo). Exceções lidas: `get-download-url` (login + RLS ✅), `handle-approval` (token com hash e validade ✅), `contract-signature-flow` (❌ R-3, não publicada) |
| Prompt injection | 🟡 `agente-ia` só tem ferramentas de leitura com o login do usuário e uma ação com Confirmar; o Studio trata pedido e referência como dado; o preço nunca passa pelo modelo. Falta teste automático de injeção (MG-AUT-09) |
| Financeiro | ✅ o agente não marca pagamento; cobrança só por proposta + Confirmar e só para OWNER, ADM e FINANCEIRO (`agente_ia_escopo`) |
| Publicação | ✅ "Enviar para as mídias" do anunciante passa pela moderação; publicar em tela segue `publicar` (F-229) |
| Armazenamento | buckets públicos: `media`, `proof_of_play`, `screenshots`, `campanhas_midia`, `avatars`, `escudos-times`; `audit_logs` privado. 💭 avaliar se `screenshots`/`proof_of_play` precisam ser públicos |
| Auditoria | ✅ `studio_etapas` (agente, modelo, custo), `agente_ia_registros`, `financeiro_auditoria` |

---

## 8. JARVIS

- **Preparado:** nada específico no código (✅ busca por "jarvis": 0 arquivos). Base reaproveitável: as funções com login, as regras de acesso, `studio_criar_producao` e `agente-ia`.
- **Implementado nesta execução:** só o contrato proposto, em `docs/autonomia/JARVIS_INTEGRACAO.md` (sem endpoint, como o dono pediu: "não implementar endpoints fictícios").
- **Falta:** token de serviço com escopos (tabela com hash), função `sobremidia-api` versionada (`/v1`), webhooks assinados (HMAC), registro de auditoria, testes de escopo. MCP só quando o JARVIS existir.
- **Risco principal:** o JARVIS virar uma porta que ignora as regras. Por isso a regra é que toda chamada vira um usuário ou serviço com escopo, e o banco decide.

---

## 9. Pesquisas e histórico

| Pesquisa | Onde | Integridade (08/11/2026) |
|---|---|---|
| **"~400 sites / ~12 mil resultados"** = leitura dos sites oficiais das marcas | `C:\Users\Jairan Santos\Downloads\SITECODIGOSOBREMIDIA\marcas` (1ª leitura: 282 domínios em `lista/lote.jsonl`, **9.587 imagens**, 335 pastas) e `...\marcas-v2` (releitura: 116 domínios em `lista/lote.jsonl`, **4.409 imagens**) | ✅ existe: 398 domínios e 13.996 imagens. ⚠️ **fora do Git e sem cópia** (R-2). O "12 mil" é aproximado; o número medido está aqui |
| Lista consolidada de marcas | `...\marcas\lista\consolidado.json` (2.483 marcas: 153 feitas, 320 prontas para buscar, 1.393 a pesquisar, 519 foto própria, 98 não anunciar) | ✅ |
| Listas por grupo | `...\marcas\lista\{alimentos(456),bebidas(677),auditoria(83),a-conferir(59),fila*.json}` | ✅ |
| Comparação 1ª × 2ª leitura | `...\marcas-v2\lista\comparacao.json` (112), `catalogo-antes.json` (3.831) | ✅ |
| Recortes F-253 | `...\recortes-F-253` | ✅ esperando gravação (P-04) |
| Método e retomada | `docs/MISSAO_CATALOGO_DE_PRODUTOS.md`, `docs/catalogo/segmentos-de-produtos.md` | ✅ no Git |
| Auditorias anteriores do Studio | `docs/studio-ai/*` (MG00, arquitetura, matriz, riscos, roadmap), `docs/studio/MG_STUDIO_01_AUDITORIA_CREATIVE_CORE.md`, `docs/studio/creative-core/` | ✅ |
| Relatórios antigos (agosto) | `docs/reports/` | ✅ histórico |
| Histórico de correções | `docs/engineering/FINDINGS_LEDGER.md` (F-01..F-262) | ✅ fonte principal |
| Ledger e ADRs do Antigravity | `.agents/memory/master_ledger.md`, `.agents/memory/architecture_decisions.jsonl` | ⚠️ fora do Git (ignorado), parados em 11/09/2026 |

Não foi encontrado relatório com "12 mil resultados" escrito. O número acima foi **medido** nas pastas; se a pesquisa citada pelo dono for outra (de uma conversa antiga), ela existe só nessa conversa.

---

## 10. Pendências priorizadas

| P | Pendência | Impacto | Arquivos | Solução | Conclusão | Complexidade |
|---|---|---|---|---|---|---|
| **P0** | R-1 pareamento aberto | anunciante pode mexer no pareamento de aparelho de outra empresa durante a janela do código | `device_pairing_codes` (regras `dpc_*`), Player | regra por empresa/aparelho; anônimo só pelas funções `fn_request_pairing_code`/`fn_check_pairing_status` | anunciante vê 0; parear no emulador funciona; `contrato-player.mjs` íntegro | média (estrutura protegida) |
| **P0** | R-2 pesquisa sem cópia | perda de cerca de 14 mil imagens e 2.483 marcas se o PC falhar | `../marcas`, `../marcas-v2` | enviar para o R2 em pasta privada (ou Drive), com índice | contagem igual na cópia | baixa |
| P1 | R-3 função de assinatura insegura no repositório | se for publicada, permite assinatura falsa | função `contract-signature-flow` (✅ removida na F-263) | apagar (o fluxo atual é `fn_assinar_contrato`) ou exigir login | ausente ou protegida | baixa |
| P1 | MG-AUT-07 Central de Comando | o dono não consegue pedir arte ou vídeo por conversa | `agente-ia`, `_shared/agente/ferramentas.ts`, `TrabalharComIA.tsx` | ferramentas do Studio no agente (ADR-AUT-001) | pedido em texto vira produção real | média |
| P1 | MG-AUT-08 encarte pelo agente | "faça um encarte com estes produtos" não é atendido | `montar.mjs`, `encartesOficiais.ts` | ferramenta "encarte oficial" com composição determinística no Actions | encarte 16:9 com 10 produtos e preços conferidos | média-alta |
| P2 | MG-AUT-12 preferências por cliente | "use o mesmo estilo" não funciona | `studio_conhecimento`, `studio_conhecimento_publicar` | tela + consentimento + uso no Core | TESTE 6 passa | média |
| P2 | MG-AUT-05 provedores unificados | duas listas de provedores | `_shared/agente`, `_shared/studio/provedores.ts` | módulo único `_shared/ia/` | um registro, testes | baixa |
| P2 | MG-AUT-09 testes de injeção e de custo | sem prova automática | testes | casos de injeção no `agente-ia` e no briefing | testes verdes | baixa |
| P3 | MG-AUT-10 JARVIS | integração futura | `docs/autonomia/JARVIS_INTEGRACAO.md` | implementar quando o JARVIS existir | TESTE 10 | alta |
| P3 | trilha, voz, vídeo por IA | vídeo sem som | provedores | decisão e orçamento do dono | — | — |

As pendências antigas P-01..P-18 continuam em `docs/ESTADO_DO_SISTEMA.md`; as novas entram lá como P-19..P-25.

---

## 11. O que foi feito nesta execução (F-262)

- **Criados:**
  - `docs/autonomia/SOBRE_MIDIA_AUTONOMIA_RELATORIO_MESTRE.md` (este);
  - `docs/autonomia/REGISTRO_DE_AGENTES.md`;
  - `docs/autonomia/PROVEDORES_DE_IA.md`;
  - `docs/autonomia/JARVIS_INTEGRACAO.md`;
  - `docs/autonomia/decisoes_de_arquitetura.jsonl`;
  - `scripts/ops/teste-isolamento.sql`.
- **Alterados:** `docs/ESTADO_DO_SISTEMA.md` (pendências P-19..P-25 e leitura), `docs/MAPA_DO_PROJETO.md`, `docs/engineering/FINDINGS_LEDGER.md` (F-262), `src/tests/unit/memoriaDoSistema.test.ts`.
- **Banco:** nada alterado (só leitura; testes de acesso em transação desfeita).
- **Publicação:** nenhuma no site (só documentos e teste, que a Vercel ignora).
- **Testes:** `memoriaDoSistema.test.ts` também confere os documentos de autonomia.

---

## 12. Sequência de Micro-Gates para completar

| Ordem | Gate | Depende de | Estado |
|---|---|---|---|
| 1 | MG-AUT-01 Auditoria | — | ✅ este relatório |
| 2 | MG-AUT-02 Memória permanente | — | ✅ F-260 + este (`docs/autonomia/`) |
| 3 | MG-AUT-09a P0 de segurança (R-1, R-3) e cópia da pesquisa (R-2) | ensaio no emulador | ⏳ pode começar já |
| 4 | MG-AUT-03/04 Contrato do orquestrador e registro de agentes | — | 🟡 documentado; falta versão dos agentes no banco |
| 5 | MG-AUT-05 Provedores unificados | — | ⏳ |
| 6 | MG-AUT-07 Central de Comando (ADR-AUT-001) | 5 | ⏳ |
| 7 | MG-AUT-08 Encarte e "arte → vídeo" pelo agente | 6 | ⏳ |
| 8 | MG-AUT-12 Preferências por cliente | 6 | ⏳ |
| 9 | MG-AUT-09 Segurança completa (injeção, custo, limites) | 6–8 | ⏳ |
| 10 | MG-AUT-10 JARVIS | JARVIS existir | 📄 contrato proposto |
| 11 | MG-AUT-11 Homologação (testes 1–10) | todos | ⏳ |

**Situação dos 10 testes pedidos:**

| Teste | Situação |
|---|---|
| 1 Arte de farmácia | ✅ (vídeo institucional, F-261) |
| 2 Encarte de supermercado | 🟡 só pelo editor, não pelo agente |
| 3 Depilação a laser | ✅ teste C do Core (planejamento) |
| 4 Vídeo | ✅ pelo agente / 🟡 "esta arte" só pelo editor |
| 5 Correção | ✅ "Pedir ajuste" e instrução por cena |
| 6 Memória | ❌ |
| 7 Segurança | ✅ |
| 8 Custos | ✅ pago bloqueado + crédito com confirmação |
| 9 Falha | ✅ queda da IA → plano local (F-228) |
| 10 JARVIS | ❌ |

---

## 13. Como continuar em uma nova sessão

Cole na próxima IA ou IDE:

> Leia `AGENTS.md` (seção 0), `docs/ESTADO_DO_SISTEMA.md` e `docs/DECISOES_DO_DONO.md`, depois `docs/autonomia/SOBRE_MIDIA_AUTONOMIA_RELATORIO_MESTRE.md`. Rode `node scripts/ops/onde-paramos.mjs`. Continue pelo próximo Micro-Gate da seção 12 (comece pela pendência P-19, segurança do pareamento, seguindo a skill `migracao-segura` e ensaiando no emulador `TVBox_API25`). Decisões de arquitetura ficam em `docs/autonomia/decisoes_de_arquitetura.jsonl`. Ao terminar, faça o ritual da seção 5 do ESTADO.

Para repetir o teste de isolamento:

```bash
node scripts/ops/sql.mjs @scripts/ops/teste-isolamento.sql
```

Ele termina com `RESULTADO`, nada é gravado, e todo número antes da barra tem de ser 0.
