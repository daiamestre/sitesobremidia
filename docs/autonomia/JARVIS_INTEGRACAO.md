# Integração SOBRE MÍDIA ↔ JARVIS EMPRESARIAL — contrato proposto (MG-AUT-10)

> **Estado (08/11/2026): CONTRATO TÉCNICO COMPLETO (seção 6), INTEGRAÇÃO AGUARDANDO O JARVIS EXISTIR.** O JARVIS ainda não existe, e o dono pediu para não criar endpoints fictícios.
>
> Este documento fixa as regras para a implementação real, quando o JARVIS existir.

## 1. Princípios
1. **A SOBRE MÍDIA funciona sem o JARVIS.** Nenhuma tela, robô ou agente depende dele. Não há dependência circular: o JARVIS chama a SOBRE MÍDIA e recebe eventos dela, e a SOBRE MÍDIA nunca espera resposta do JARVIS para trabalhar.
2. **O JARVIS nunca vê o banco.** Ele não recebe a chave mestra (service role), não recebe chave de administração e não faz SQL.
3. **Toda chamada é de alguém.** Cada token de serviço pertence a uma empresa operadora e a um usuário responsável, e tem escopos. O banco aplica as mesmas regras de acesso (RLS) de um login humano.
4. **Ação com efeito segue os níveis de aprovação** (relatório mestre, seção 6). Publicar, cobrar ou gastar crédito pago exige confirmação humana na SOBRE MÍDIA.

## 2. Peças a implementar (quando o JARVIS existir)

| Peça | Como (reaproveitando o que existe) |
|---|---|
| Token de serviço | tabela `integracao_tokens` (hash SHA-256, empresa, usuário responsável, escopos, validade, revogação); o token aparece uma única vez ao ser criado; criação só por OWNER |
| Porta de entrada | UMA função `sobremidia-api` versionada (`/v1/...`), que troca o token por uma sessão do usuário responsável e chama as funções do banco que já existem (`studio_criar_producao`, consultas do `agente-ia`) |
| Eventos (SOBRE MÍDIA → JARVIS) | webhook assinado (HMAC-SHA256 no cabeçalho, carimbo de tempo, repetição com limite), disparado pelos mesmos pontos que gravam `studio_etapas` e as notificações |
| Auditoria | tabela `integracao_registros` (token, escopo, operação, resultado, custo); sem segredo e sem dado pessoal desnecessário |
| Limites | por token: chamadas por minuto, produções por dia (as mesmas cotas do Studio) |
| MCP | opcional, só se o JARVIS falar MCP; seria uma camada fina sobre a mesma `sobremidia-api`, nunca um caminho paralelo |

## 3. Operações da versão 1 (contrato)

| Operação | Escopo | Base existente | Nível |
|---|---|---|---|
| `GET /v1/estado` (resumo de telas, cobranças e produções) | `leitura:operacao` | ferramentas `relatorio_telas`, `resumo_financeiro` | 1 |
| `GET /v1/campanhas`, `GET /v1/tarefas` | `leitura:campanhas` | `campanhas`, `studio_producoes` (RLS) | 1 |
| `POST /v1/criacoes` (arte, encarte ou vídeo) | `criacao:solicitar` | `studio_criar_producao` | 1 (rascunho) |
| `GET /v1/criacoes/{id}` | `criacao:ler` | `studio_producoes` + `studio_etapas` | 1 |
| `POST /v1/criacoes/{id}/aprovar` | não liberado ao JARVIS na v1 | — | 2 (só humano na SOBRE MÍDIA) |
| `GET /v1/arquivos/{id}` | `arquivos:ler` | `get-download-url` (link temporário) | 1 |
| eventos `criacao.pronta`, `criacao.falhou`, `tela.fora_do_ar` | assinatura do webhook | `studio_etapas`, `check-offline-screens` | — |

## 4. O que pode ir para o "segundo cérebro"

| Pode (com escopo) | Não pode |
|---|---|
| decisões de arquitetura, estado do projeto e documentação (`docs/`) | dados pessoais de clientes e anunciantes |
| histórico de campanhas e relatórios da própria empresa | contratos, cobranças individuais e documentos (só totais) |
| métricas e tarefas | chaves, tokens e segredos |

## 5. Testes de aceite (TESTE 10)
1. Token sem o escopo → 403.
2. Token de uma empresa pedindo produção de outra → 0 linhas.
3. Token revogado → 401.
4. Webhook com assinatura errada → recusado.
5. Pedido criado pelo JARVIS aparece em `/studio/agentes` aguardando aprovação humana.

## 6. Detalhes técnicos da v1 (completados em 08/11/2026, F-270 — ainda SEM implementação, aguardando o JARVIS existir)

| Requisito | Decisão |
|---|---|
| Versão | caminho `/v1/...`; mudança que quebra vira `/v2` e as duas convivem por 90 dias |
| Token de serviço | 32 bytes aleatórios mostrados uma única vez; no banco só o SHA-256 (`integracao_tokens.hash`), o prefixo (8 caracteres, para reconhecer), a empresa, o usuário responsável, os escopos, `expira_em` (máximo 90 dias) e `revogado_em` |
| Rotação | criar o token novo, trocar no JARVIS e revogar o antigo; os dois valem juntos por no máximo 24 h |
| Escopos mínimos | `leitura:operacao`, `leitura:campanhas`, `criacao:solicitar`, `criacao:ler`, `arquivos:ler`; nada de financeiro, contratos, permissões, publicação nem Player |
| Isolamento | o token vira a sessão do **usuário responsável**; toda leitura passa pela RLS e pelas funções do banco (`studio_criar_producao`, `studio_ai_escopo`, `agente_ia_escopo`) |
| Idempotência | cabeçalho `Idempotency-Key` obrigatório em `POST`; a mesma chave em 24 h devolve a mesma resposta (para criação, reaproveita `studio_producoes.chave_idempotencia`) |
| Limites | 60 requisições/min e 20 criações/dia por token, além das cotas do Studio (`studio_minha_cota`); excedeu → 429 com `Retry-After` |
| Origem | todo registro grava `origem = 'jarvis'`, o prefixo do token e o IP; nunca o token |
| Webhooks | `POST` para a URL cadastrada com `X-SobreMidia-Assinatura: t=<epoch>,v1=<HMAC-SHA256(segredo, t + "." + corpo)>`; o JARVIS recusa se `t` tiver mais de 5 min; até 5 tentativas com espera crescente; segredo do webhook diferente do token |
| Auditoria | `integracao_registros` (token, escopo, operação, status, custo, ms); retenção de 1 ano |
| Indisponibilidade | a SOBRE MÍDIA nunca espera o JARVIS: evento que não entregou fica na fila e é reenviado; o painel e o Player não dependem dele |
| Onde fica | uma única Edge Function `sobremidia-api` (Supabase), sem função nova na Vercel (plano grátis) |

**Estado dos testes de aceite (TESTE 10):** NÃO executados — dependem do JARVIS e da `sobremidia-api`. A camada que eles exercitarão já tem prova:
- isolamento por empresa e cliente: `scripts/ops/teste-isolamento.sql`, 0 vazamentos;
- criação real com o login de quem pede: F-266, produção 96f99a50;
- recusa de instruções maliciosas: `scripts/ops/testar-injecao.mjs`, 7/7.
