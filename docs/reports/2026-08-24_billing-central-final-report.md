# RELATÓRIO FINAL — CENTRAL DE COBRANÇAS (BILLING END-TO-END)

**Data:** 2026-08-24 · **Commits:** `f9eec8e` → `b97dd90` → `3fe1162` · **Branch:** `main`

---

## 1. Resumo executivo

A Central de Cobranças (`/financeiro/cobrancas`) evoluiu de uma tela de listagem para um **sistema de billing operacional de ciclo completo**, integrado ao ERP SOBRE MÍDIA sem duplicar arquitetura: geração manual e automática (recorrência por contrato), régua de cobrança configurável por tenant, máquina de inadimplência (3 contatos → inadimplência → bloqueio), bloqueio financeiro não-destrutivo com reativação automática auditada, webhook de pagamento idempotente, conciliação via trigger, fila de jobs com retry/backoff e envio real via Resend.

## 2. Estado encontrado antes da implementação

| Capacidade | Estado |
|---|---|
| Página Central + detalhe (v1) | PRONTO (commit f9eec8e, sessão anterior) |
| `BillingService` (régua) | **PARCIAL/QUEBRADO** — escrito contra schema imaginado (`jobs.event_name`, `contas_receber.saldo`, RPC `enfileirar_job` inexistente) |
| `regras_cobranca` | AUSENTE no banco (migration pendente nunca aplicada) |
| Comunicação core (`comunicacao_*`) | AUSENTE; edge function existia referenciando colunas inexistentes |
| Recorrência | AUSENTE |
| Inadimplência/bloqueio/reativação | AUSENTE |
| Webhook de pagamento | AUSENTE |
| Conciliação pagamentos→conta | MANUAL e com drift de colunas (`valor_recebido`) |
| Migrations 20261018/20/21 | NUNCA aplicadas e INCOMPATÍVEIS com o schema real |

## 3. Infraestrutura reutilizada (nenhuma duplicação)

- **Tabelas:** `contas_receber`, `pagamentos`, `contratos` (+`tipo_contrato`,`valor_mensal`,`forma_pagamento`), `itens_contrato`, `catalogo_servicos`, `clientes`, `empresas`, `contatos`, `jobs`, `financeiro_auditoria`
- **Serviços:** `financeiroService` (estendido), `BillingService` (consolidado: régua nova + PIX/boleto Zero-Mock preservados)
- **Workers:** `billing-worker` (corrigido e completado), `communication-core` (patch mínimo)
- **Infra:** pg_cron + pg_net + vault (dispatch), secrets API, RLS helper `get_user_empresa_operadora_id()`

## 4. Implementações realizadas

**Migration única idempotente:** `supabase/migrations/20260824_billing_central_operacional.sql`
**Edge Functions:** `billing-worker/index.ts` (reescrito), `payment-webhook/index.ts` (novo), patch em `communication-core/index.ts`
**Frontend:** `financeiro.service.ts` (+tipos v2, agenda, histórico, serviços, régua, desbloqueio), `BillingDashboard.tsx` (KPIs operacionais, Agenda Financeira, botão Processar Régua, filtros tipo/método, Nova Cobrança completa cliente→tipo→contrato→serviço→competência→periodicidade→método), `BillingDetailPage.tsx` (histórico completo, contato financeiro, desbloqueio manual auditado), `types.ts` regenerado do banco
**Scripts:** `apply_billing_migration.mjs`, `setup_billing_worker_infra.mjs` (secret+vault+trigger pg_net), `e2e_billing_cycle.mjs`
**Testes:** `billing-central-v2.test.ts` (novo), atualizações em `billing.service.test.ts` / `financial-flow.integration.test.ts` / `multitenant-isolation.security.test.ts`

## 5. Banco

- **Novas tabelas:** `regras_cobranca`, `comunicacao_eventos_catalogo`, `comunicacao_templates`, `comunicacao_preferencias` (RLS por tenant habilitado)
- **Colunas aditivas:** `contas_receber`: competencia_date, issue_date, payment_date, currency, notes, numero_documento, metodo_cobranca, recorrencia, gerada_automaticamente, situacao_cobranca, valor_pago, saldo; `clientes`: bloqueio_financeiro, bloqueio_motivo, bloqueado_em
- **Constraint expandida:** `cr_status_check` mantém legados + estados novos
- **Índices:** unique parcial `(contrato_id, competencia_date)` p/ idempotência de recorrência; unique parcial `pagamentos.transacao_id_externo`; índices tenant/vencimento/situação
- **Triggers:** conciliação de pagamentos (PAGA/parcial/cancela fila/COLECTION_PAID/reativação), auditoria de criação, seed de regras para novos tenants, dispatch pg_net de jobs COLECTION_*
- **RPCs:** `enfileirar_job`, `registrar_tentativa_job` (retry/backoff exponencial), `gerar_cobrancas_recorrentes`, `processar_regua_cobranca`, `desbloquear_cliente` — todos SECURITY DEFINER com escopo explícito de tenant
- **View:** `vw_cobranca_completa` (colunas reais)
- **Cron:** `billing-regua-diaria` (06:05 UTC) processando a régua de todos os tenants

## 6–14. Fluxos validados (E2E real em tenant isolado `e2e_billing_cycle.mjs`)

```
CONTRATO (valor_mensal, dia=venc.) ──cron/régua──▶ COBRANÇAS mensais idempotentes ✓ (24 reais geradas nos 4 tenants reais)
RÉGUA D+5 ──▶ 3º contato enfileirado ──▶ INADIMPLENTE ──▶ CLIENTE_BLOQUEADO (auditado) ✓
WEBHOOK pagamento (secret/HMAC) ──▶ PAGAMENTO inserido ──▶ trigger: PAGA + saldo=0,
  cancela fila de cobrança, enfileira confirmação, audita PAGAMENTO_CONFIRMADO ✓
Duplicata do webhook ──▶ 200 idempotente:true ✓
Todas quitadas ──▶ REATIVAÇÃO automática (bloqueio removido + auditoria) ✓
WORKER process_queue ──▶ reconciliação → template → contato financeiro → Resend ✓
```

- **Contato financeiro:** cargo financeiro/faturamento → contato principal → e-mail da empresa (fallback registrado em auditoria); nunca envia para usuários aleatórios.
- **PIX/Boleto:** métodos preservados com Zero Mock — `generateBoleto` lança erro sem gateway credenciado; PIX gera BR Code interno + registro; **recebimento online aguarda credenciais de gateway** (nenhuma presente no projeto).
- **WhatsApp:** canais semeados apenas com `email`; WhatsApp fica desabilitado até haver provider real.

## 15. Segurança

RBAC `(isAdmin || isOwner)` na UI + guard de rota; worker com auth dupla (BILLING_WORKER_SECRET ou JWT do mesmo tenant); webhook exige HMAC (`PAYMENT_WEBHOOK_SECRET`) ou worker secret; RLS por tenant nas tabelas novas via `get_user_empresa_operadora_id(auth.uid())`; RPCs DEFINER sempre filtram pelo tenant parametrizado; nenhum secret no frontend; auditoria completa em `financeiro_auditoria`.

## 16. Testes

| Categoria | Resultado |
|---|---|
| Build | ✅ vite build + PWA (local e árvore commitada) |
| Typecheck | ✅ 0 erros (`tsc --noEmit` na árvore commitada `b97dd90`) |
| Unit | ✅ 78 passam (incl. 7 novos v2 + 17 BillingService) |
| Integration | ✅ financial-flow 10/10 |
| E2E (Playwright produção) | ✅ rota direta sem 404, guard redireciona com deep-link |
| Billing (E2E ciclo real) | ✅ recorrência→régua→inadimplência→bloqueio→webhook→PAGA→reativação |
| RBAC/Menu/Rotas | ✅ central-cobrancas.routes 5/5 |
| Multi-tenant | ✅ multitenant-isolation 11/11 |
| Pré-existentes fora do escopo | ⚠️ 8 falhas em `central-acessos.security` + `crm-session-regression` — **idênticas ao HEAD antes desta tarefa** (fluxo Central de Acessos, não relacionado) |

## 17. Produção

```
URL:        https://sitesobremidia.vercel.app/financeiro/cobrancas
Deployment: b97dd90 (Vercel auto-deploy) + functions deployadas (no-verify-jwt, auth interna)
Status:     HTTP 200 · bundle contém rotas/páginas v2 · runtime Playwright sem NotFound
Build:      dist/ + chunks BillingDashboard/BillingDetailPage servidos (200)
Runtime:    redirect → /auth?redirect=%2Ffinanceiro%2Fcobrancas (guard OK, deep-link preservado)
```

## 18. Pendências (reais, documentadas)

1. **Resend:** domínio remetente `sobremidia.com.br` precisa ser verificado em resend.com/domains — pipeline de envio 100% pronto e testado até o provider (erro 403 registrado com retry).
2. **Gateway de pagamentos (PIX/boleto online):** nenhuma credencial presente no projeto; webhook pronto (HMAC + idempotência) — ativação imediata ao configurar `PAYMENT_WEBHOOK_SECRET` + provider.
3. **WhatsApp:** sem provider/credenciais — canal permanece desabilitado nas políticas.
4. Falhas pré-existentes da suíte Central de Acessos (fora do escopo, idênticas ao baseline).

## 19. Arquivos alterados

`supabase/migrations/20260824_billing_central_operacional.sql` · `supabase/functions/{billing-worker,payment-webhook,communication-core}/index.ts` · `src/integrations/supabase/types.ts` · `src/modules/crm/services/{billing.service,financeiro.service}.ts` · `src/modules/crm/pages/{BillingDashboard,BillingDetailPage}.tsx` · `src/tests/unit/{billing.service.test,billing-central-v2.test}.ts` · `src/tests/integration/financial-flow.integration.test.ts` · `src/tests/security/multitenant-isolation.security.test.ts` · `scripts/{apply_billing_migration,setup_billing_worker_infra,e2e_billing_cycle,reapply_migration}.mjs`

## 20. Resultado final

Todos os critérios da FASE 33 foram implementados e validados na medida tecnicamente possível com os recursos existentes; as três dependências externas (domínio Resend, gateway de pagamento, WhatsApp provider) estão preparadas, protegidas e explicitamente documentadas acima, sem simulação de funcionamento.
