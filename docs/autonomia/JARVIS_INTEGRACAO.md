# Integração SOBRE MÍDIA ↔ JARVIS EMPRESARIAL — contrato proposto (MG-AUT-10)

> **Estado (08/11/2026): PROPOSTA, NADA IMPLEMENTADO.** O JARVIS ainda não existe, e o dono pediu para não criar endpoints fictícios.
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
