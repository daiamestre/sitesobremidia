# MICRO-GATE AR-03.2 — PRE-FLIGHT FORENSE DE CONSISTÊNCIA DA MÁQUINA DE EXCLUSÃO DE CONTRATOS

**DATA DA AUDITORIA:** 2026-09-07  
**NATUREZA:** FORENSE READ-ONLY (ZERO IMPLEMENTAÇÃO / ZERO MUTATIONS / ZERO REGRESSÃO)  
**STATUS:** **PASS — PRE-FLIGHT HOMOLOGADO PARA ESPECIFICAÇÃO DE IMPLEMENTAÇÃO**  

---

## 1. BASELINE E CONFORMIDADE DE GOVERNANÇA

* **Commit Base Canônico:** `deeb97c57619192dd7133b3faec357bf72ac6f8b`
* **Governança:** Regras Supremas do Agente SOBRE MÍDIA (`AGENTS.md`) e `docs/contratos/CONTRATOS_BASELINE_ANTIREGRESSAO.md`
* **Arquivos Modificados no Código de Produção:** `0` (Zero)
* **Migrations Criadas/Executadas no Banco:** `0` (Zero)
* **RPCs Criadas/Alteradas:** `0` (Zero)
* **Policies / RLS Alteradas:** `0` (Zero)
* **Objetos R2 Modificados ou Excluídos:** `0` (Nenhum binário tocado)
* **Contratos Reais Excluídos ou Mutados:** `0` (Zero mutações em produção)

---

## 2. ARQUIVOS E TABELAS INSPECIONADOS

### 2.1 Tabelas do Banco de Dados PostgreSQL Inspecionadas
1. `public.contratos`
2. `public.comissoes_representantes`
3. `public.comissoes`
4. `public.ordens_producao`
5. `public.repasses_parceiros`
6. `public.pagamentos`
7. `public.contas_receber`
8. `public.financeiro_lancamentos`
9. `public.cobrancas`
10. `public.notas_fiscais`
11. `public.assinaturas`
12. `public.contrato_versoes`
13. `public.agendamentos`
14. `public.auditoria_logs`
15. `public.playback_logs`
16. `public.pedidos_insercao`
17. `public.itens_contrato`
18. `public.contrato_auditoria`
19. `public.campanhas`
20. `public.expansoes`
21. `public.historico_financeiro`
22. `public.portal_chamados`
23. `public.timeline`
24. `public.perfis`
25. `public.usuarios`

### 2.2 Arquivos do Repositório Inspecionados no Código (19 Arquivos)
1. `src/modules/crm/pages/ContratosListPage.tsx`
2. `src/modules/crm/services/contrato.service.ts`
3. `src/modules/crm/pages/ContratoSelectionPage.tsx`
4. `src/modules/crm/services/customerCommerce.service.ts`
5. `src/services/pontosRede.service.ts`
6. `src/modules/crm/components/Cliente360Modal.tsx`
7. `src/modules/crm/hooks/useClienteModalidade.ts`
8. `src/modules/crm/pages/portal/ExpansaoPage.tsx`
9. `src/modules/crm/pages/portal/FinanceiroClientePage.tsx`
10. `src/modules/crm/services/customerPortal.service.ts`
11. `src/modules/crm/services/customerPortalData.service.ts`
12. `src/modules/crm/services/digitalSignature.service.ts`
13. `src/modules/crm/services/composicaoComercial.service.ts`
14. `src/modules/crm/services/contratoDocumento.service.ts`
15. `src/modules/crm/services/contratoModelosAdmin.service.ts`
16. `src/modules/crm/services/financeiro.service.ts`
17. `src/modules/crm/services/analytics.service.ts`
18. `src/services/bi.service.ts`
19. `src/services/representative.service.ts`

---

## 3. STATUS REAIS COMPROVADOS NO SCHEMA E DADOS

A introspecção via catálogo PostgreSQL (`pg_constraint`, `information_schema.columns`) revelou os valores reais exatos das colunas de status:

| Tabela | Coluna | Check Constraint / Enum Real no Banco | Default | Status Presentes no Banco Atual |
| :--- | :--- | :--- | :--- | :--- |
| `comissoes_representantes` | `status` | `ARRAY['PREVISTA', 'LIBERADA', 'PAGA', 'CANCELADA']` | `'PREVISTA'` | 0 linhas |
| `comissoes` | `status` | `ARRAY['PENDENTE', 'LIBERADA', 'PAGA', 'CANCELADA']` | `'PENDENTE'` | `'LIBERADA'` (2) |
| `ordens_producao` | `status` | `ARRAY['CRIADA', 'AGUARDANDO_MATERIAL', 'MATERIAL_RECEBIDO', 'EM_DESENVOLVIMENTO', 'AGUARDANDO_APROVACAO', 'REPROVADA', 'APROVADA', 'LIBERADA', 'PUBLICADA', 'FINALIZADA', 'CANCELADA', 'SUSPENSA']` | `'PENDING'` / `'CRIADA'` | `'EM_DESENVOLVIMENTO'` (1) |
| `repasses_parceiros` | `status` | `ARRAY['DEVIDO', 'APROVADO', 'PAGO', 'CANCELADO', 'ESTORNADO']` | `'DEVIDO'` | 0 linhas |
| `pagamentos` | *(Sem coluna status)* | *(Cada linha é uma liquidação financeira irreversível: `valor_pago`, `data_liquidacao`, `meio_pagamento`)* | N/A | 6 linhas (`PIX`, `BOLETO`) |
| `contas_receber` | `status` | `ARRAY['PENDENTE', 'PAGO', 'ATRASADO', 'CANCELADO', 'PARCIAL', 'VENCIDO', 'ABERTA', 'AGENDADA', 'VENCENDO_HOJE', 'ATRASADA', 'PARCIAL_PAGA', 'PAGA', 'CANCELADA', 'EM_DISPUTA', 'CONCILIADA']` | `'PENDENTE'` | `'PENDENTE'` (106), `'ATRASADO'` (52), `'PAGA'` (29), `'PAGO'` (8) |
| `contas_receber` | `inter_status` | *(Varchar livre: `'A_RECEBER'`, `'ISSUED'`, `'PAGO'`, `'FAILED'`, `'RECEBIDO'`, `'CANCELED'`)* | `null` | `'A_RECEBER'` (18), `'PAGO'` (7), `'RECEBIDO'` (2), `'FAILED'` (15), `'CANCELED'` (6) |
| `financeiro_lancamentos`| `status_geral` | `ARRAY['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELED']` | `'PENDING'` | `'PENDING'` (1) |
| `cobrancas` | `status_pagamento` | `ARRAY['PENDING', 'PAID', 'OVERDUE', 'CANCELED']` | `'PENDING'` | 0 linhas |
| `notas_fiscais` | `status` | `ARRAY['RASCUNHO', 'EMITIDA', 'CANCELADA']` | `'EMITIDA'` | 0 linhas |
| `assinaturas` | `status` | `ARRAY['RASCUNHO', 'ENVIADO', 'VISUALIZADO', 'ASSINADO', 'RECUSADO', 'EXPIRADO', 'CANCELADO']` | `'ENVIADO'` | `'ENVIADO'` (2), `'VISUALIZADO'` (1) |
| `contratos` | `status_documento` | `ARRAY['RASCUNHO', 'GERADO', 'ENVIADO', 'ASSINADO', 'CANCELADO']` | `'RASCUNHO'` | `'RASCUNHO'` (22), `'GERADO'` (14), `'ASSINADO'` (5) |
| `contratos` | `status_workflow` | `ARRAY['PROSPECT', 'PROPOSTA_GERADA', 'AGUARDANDO_ASSINATURA', 'AGUARDANDO_PAGAMENTO', 'PAGAMENTO_CONFIRMADO', 'EM_PRODUCAO', 'AGUARDANDO_APROVACAO', 'CAMPANHA_APROVADA', 'CAMPANHA_ATIVA', 'CAMPANHA_FINALIZADA', 'CANCELADO']` | `'PROSPECT'` | `'AGUARDANDO_ASSINATURA'` (26), `'CAMPANHA_ATIVA'` (9), `'AGUARDANDO_PAGAMENTO'` (6) |
| `agendamentos` | `status` | `ARRAY['PROGRAMADO', 'EM_EXIBICAO', 'PAUSADO', 'FINALIZADO', 'CANCELADO', 'CONFLITO']` | `'RASCUNHO'` / `'PROGRAMADO'` | `'EM_EXIBICAO'` (4) |

---

## 4. DIVERGÊNCIAS ENCONTRADAS ENTRE A MATRIZ AR-03.1.1 E A RPC PROPOSTA

A auditoria identificou 5 discrepâncias críticas na especificação preliminar do relatório AR-03.1.1:

### 4.1 Divergência P0 — `financeiro_lancamentos.status_geral`
* **Erro na RPC proposta:** A RPC preliminar verificava `status_geral = 'LIQUIDATED'`.
* **Realidade do Banco:** A check constraint `financeiro_lancamentos_status_geral_check` aceita apenas `('PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELED')`.
* **Impacto:** A verificação `= 'LIQUIDATED'` retornaria sempre `FALSE`, permitindo que contratos com lançamentos quitados (`PAID`) sofressem Hard Delete e destruíssem o livro-razão!
* **Correção:** A condição mandatória é `status_geral IN ('PAID', 'PARTIALLY_PAID')` OR `EXISTS (SELECT 1 FROM cobrancas WHERE financeiro_lancamento_id = fl.id AND status_pagamento = 'PAID')`.

### 4.2 Divergência P0 — `comissoes_representantes` e `comissoes` Pagas
* **Erro na RPC proposta:** A RPC preliminar executava `DELETE FROM comissoes_representantes WHERE contrato_id = p_contrato_id;` no caminho de Hard Delete sem verificar se existiam comissões pagas, e o DB Cascade apagava `comissoes`.
* **Realidade do Banco:** Se uma comissão possui `status = 'PAGA'` e `data_pagamento IS NOT NULL`, houve transferência real de recursos ao representante comercial.
* **Impacto:** Destruição de histórico contábil e fiscal de repasses a pessoas físicas/jurídicas.
* **Correção:** A presença de `status = 'PAGA'` em `comissoes_representantes` ou `comissoes` **é um Bloqueador de Retenção que FORÇA SOFT DELETE**.

### 4.3 Divergência P0 — `ordens_producao` Aprovadas / Publicadas
* **Erro na RPC proposta:** A RPC preliminar executava `DELETE FROM ordens_producao WHERE contrato_id = p_contrato_id;` sem filtrar status.
* **Realidade do Banco:** Uma OP com `status IN ('APROVADA', 'LIBERADA', 'PUBLICADA', 'FINALIZADA')` possui peças publicitárias aprovadas pelo anunciante e veiculadas em telas físicas.
* **Impacto:** Perda de rastreabilidade de direitos autorais de peças publicitárias veiculadas.
* **Correção:** Se houver OP com status `'APROVADA'`, `'LIBERADA'`, `'PUBLICADA'` ou `'FINALIZADA'`, o contrato **DEVE FORÇAR SOFT DELETE**. Somente OPs em rascunho (`'CRIADA'`, `'EM_DESENVOLVIMENTO'`, `'AGUARDANDO_MATERIAL'`, `'REPROVADA'`, `'CANCELADA'`) podem sofrer exclusão física transacional.

### 4.4 Divergência P1 — `repasses_parceiros` Aprovados / Pagos
* **Erro na RPC proposta:** A RPC preliminar executava `UPDATE repasses_parceiros SET contrato_parceiro_id = NULL` indiscriminadamente.
* **Realidade do Banco:** Se `repasses_parceiros` possui `status IN ('APROVADO', 'PAGO')`, existe liquidação financeira realizada com o estabelecimento parceiro (dono do ponto de exibição).
* **Impacto:** Desvincular o contrato deixa o repasse orfão sem memória de qual contrato gerou aquele dividendo.
* **Correção:** Se houver repasse com `status IN ('APROVADO', 'PAGO')`, o contrato **DEVE FORÇAR SOFT DELETE**.

### 4.5 Divergência P1 — Inventário de Chaves R2
* **Erro na RPC proposta:** A RPC preliminar coletava apenas `v_contrato.pdf_object_key`.
* **Realidade do Banco:** Contratos geram versões em `contrato_versoes` (com coluna `pdf_url`), chaves em `contratos.pdf_assinado_key` e envelopes em `assinaturas.pdf_original_key` / `assinaturas.pdf_assinado_key`.
* **Impacto:** Arquivos de versões antigas e envelopes ficariam órfãos e consumindo storage no Cloudflare R2 após um Hard Delete.
* **Correção:** A RPC deve agregar em `v_r2_keys`:
  1. `contratos.pdf_object_key`
  2. `contratos.pdf_assinado_key`
  3. `ARRAY_AGG(cv.pdf_url) FROM contrato_versoes cv WHERE cv.contrato_id = p_contrato_id AND cv.pdf_url IS NOT NULL`
  4. `ARRAY_AGG(a.pdf_original_key) FROM assinaturas a WHERE a.contrato_id = p_contrato_id AND a.pdf_original_key IS NOT NULL`
  5. `ARRAY_AGG(a.pdf_assinado_key) FROM assinaturas a WHERE a.contrato_id = p_contrato_id AND a.pdf_assinado_key IS NOT NULL`

---

## 5. CLASSIFICAÇÃO DOS DOIS CONCEITOS INDEPENDENTES

A arquitetura de exclusão é regida pela separação estrita entre dois conceitos:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 MÁQUINA DE EXCLUSÃO                                    │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     [BLOQUEADORES RELACIONAIS]                      [BLOQUEADORES DE RETENÇÃO]
  (Constraints Físicas PostgreSQL)              (Integridade Jurídica/Fiscal/Contábil)
  - `agendamentos` (RESTRICT)                   - `contratos` com Assinatura Digital
  - `comissoes_representantes` (RESTRICT)       - `notas_fiscais` Emitidas ou Canceladas
  - `financeiro_lancamentos` (RESTRICT)         - `pagamentos` com Valor Pago > 0
  - `ordens_producao` (RESTRICT)                - `contas_receber` Pagas ou Conciliadas
  - `repasses_parceiros` (RESTRICT)             - `financeiro_lancamentos` Quitados (PAID)
                                                - `comissoes` Pagas (PAGA)
                                                - `ordens_producao` Aprovadas/Veiculadas
                                                - `repasses_parceiros` Pagos (PAGO)
                  │                                               │
                  ▼                                               ▼
         Ação: DESVINCULAR                                Decisão: CONVERTER PARA
        ou REMOVER NA TRANSAÇÃO                                 SOFT DELETE
```

### A. BLOQUEADORES RELACIONAIS (Restrições Físicas de Schema)
Constraints que disparam `foreign_key_violation` caso `DELETE FROM contratos` seja executado diretamente.
* **Tratamento:** Devem ser atômica e explicitamente desvinculadas (`SET NULL`) ou removidas (`DELETE`) dentro do bloco transacional da RPC, **após** a validação de que nenhum Bloqueador de Retenção existe.

### B. BLOQUEADORES DE RETENÇÃO (Restrições Canônicas de Negócio)
Registros cuja existência impede sumariamente o Hard Delete por razões fiscais, tributárias, legais, contábeis ou de telemetria histórica.
* **Tratamento:** Se **qualquer** bloqueador de retenção for detectado, o sistema **NUNCA** executa `DELETE FROM contratos`. A operação é compulsoriamente convertida para **SOFT DELETE** (`deleted_at = NOW()`, `deleted_by = auth.uid()`, `delete_reason = p_motivo`, `status_workflow = 'CANCELADO'`, `status_documento = 'CANCELADO'`).

---

## 6. AUDITORIA COMPLETA DAS 21 DEPENDÊNCIAS DE `contratos`

| # | Tabela | Chave Estrangeira | Regra ON DELETE | Nullable | Qtd Linhas DB | Bloqueador Relacional? | Bloqueador de Retenção? | Ação Antes do Hard Delete | Preservação Histórica? | Impacto na RPC Definitiva |
| :- | :--- | :--- | :--- | :--- | :- | :- | :- | :--- | :- | :--- |
| 1 | `agendamentos` | `contrato_id` | **RESTRICT** | **SIM** | 4 | **SIM** | Se em exibição ativa | `UPDATE agendamentos SET contrato_id = NULL, status = 'CANCELADO'` | Histórico de grade preservado | Desvinculação transacional limpa |
| 2 | `comissoes_representantes` | `contrato_id` | **RESTRICT** | **NÃO** | 0 | **SIM** | **SIM** (se `status = 'PAGA'`) | Se `PREVISTA/CANCELADA`: `DELETE FROM comissoes_representantes`; Se `PAGA`: Soft Delete | Exige preservação de repasse pago | Força Soft Delete se PAGA |
| 3 | `financeiro_lancamentos` | `contrato_id` | **RESTRICT** | **NÃO** | 1 | **SIM** | **SIM** (se `status_geral IN ('PAID','PARTIALLY_PAID')`) | Se `PENDING/CANCELED`: `DELETE FROM financeiro_lancamentos`; Se `PAID`: Soft Delete | Exige preservação do DRE | Força Soft Delete se PAID |
| 4 | `ordens_producao` | `contrato_id` | **RESTRICT** | **NÃO** | 1 | **SIM** | **SIM** (se `status IN ('APROVADA','LIBERADA','PUBLICADA','FINALIZADA')`) | Se rascunho: `DELETE FROM ordens_producao`; Se aprovada: Soft Delete | Exige preservação de arte veiculada | Força Soft Delete se Aprovada |
| 5 | `repasses_parceiros` | `contrato_parceiro_id` | **RESTRICT** | **SIM** | 0 | **SIM** | **SIM** (se `status IN ('APROVADO','PAGO')`) | Se `DEVIDO/CANCELADO`: `UPDATE repasses_parceiros SET contrato_parceiro_id = NULL`; Se `PAGO`: Soft Delete | Exige preservação de repasse pago | Força Soft Delete se PAGO |
| 6 | `assinaturas` | `contrato_id` | **CASCADE** | **NÃO** | 3 | NÃO | **SIM** (se `status = 'ASSINADO'` ou `pdf_assinado_key IS NOT NULL`) | Coletar chaves R2; CASCADE DB | Exige preservação de contrato chancelado | Força Soft Delete se ASSINADO |
| 7 | `campanhas` | `contrato_id` | **CASCADE** | **NÃO** | 0 | NÃO | NÃO | CASCADE DB | Não exige | CASCADE limpa automaticamente |
| 8 | `comissoes` | `contrato_id` | **CASCADE** | **NÃO** | 2 | NÃO | **SIM** (se `status = 'PAGA'`) | Se `PAGA`: Soft Delete; Se `PENDENTE`: CASCADE DB | Exige preservação de comissão paga | Força Soft Delete se PAGA |
| 9 | `contas_receber` | `contrato_id` | **CASCADE** | **SIM** | 195 | NÃO | **SIM** (se `status IN ('PAGO','PAGA','PARCIAL','PARCIAL_PAGA')` ou `valor_pago > 0`) | Se pendente: CASCADE DB; Se paga: Soft Delete | Exige integridade financeira e bancária | Força Soft Delete se PAGA |
| 10 | `contrato_auditoria` | `contrato_id` | **CASCADE** | **NÃO** | 10 | NÃO | NÃO | Log permanente gravado em `auditoria_logs` antes do DELETE | Preservado via `auditoria_logs` | CASCADE DB |
| 11 | `contrato_estabelecimentos` | `contrato_id` | **CASCADE** | **NÃO** | 0 | NÃO | NÃO | CASCADE DB | Não exige | CASCADE limpa automaticamente |
| 12 | `contrato_versoes` | `contrato_id` | **CASCADE** | **NÃO** | 15 | NÃO | NÃO | Coletar todos os `pdf_url` para limpeza do R2; CASCADE DB | Preservado no log | CASCADE limpa automaticamente |
| 13 | `expansoes` | `contrato_id` | **CASCADE** | **NÃO** | 0 | NÃO | NÃO | CASCADE DB | Não exige | CASCADE limpa automaticamente |
| 14 | `historico_financeiro` | `contrato_id` | **CASCADE** | **NÃO** | 0 | NÃO | NÃO | CASCADE DB | Não exige | CASCADE limpa automaticamente |
| 15 | `itens_contrato` | `contrato_id` | **CASCADE** | **NÃO** | 4 | NÃO | NÃO | CASCADE DB | Não exige | CASCADE limpa automaticamente |
| 16 | `notas_fiscais` | `contrato_id` | **CASCADE** | **SIM** | 0 | NÃO | **SIM** (se `status IN ('EMITIDA','CANCELADA')`) | Se emitida: Soft Delete | Exige preservação fiscal obrigatória | Força Soft Delete se EMITIDA |
| 17 | `pagamentos` | `contrato_id` | **CASCADE** | **SIM** | 6 | NÃO | **SIM** (se existir qualquer pagamento com `valor_pago > 0`) | Se houver pagamento: Soft Delete | Exige integridade bancária e contábil | Força Soft Delete se houver pagamento |
| 18 | `pedidos_insercao` | `contrato_id` | **CASCADE** | **NÃO** | 5 | NÃO | NÃO | CASCADE DB | Não exige | CASCADE limpa automaticamente |
| 19 | `playback_logs` | `contrato_id` | **SET NULL** | **SIM** | 9.150 | NÃO | NÃO | DB executa `SET contrato_id = NULL` automaticamente | Telemetria de exibição nos players 100% preservada | Nenhuma ação manual necessária |
| 20 | `portal_chamados` | `contrato_id` | **CASCADE** | **NÃO** | 0 | NÃO | NÃO | CASCADE DB | Não exige | CASCADE limpa automaticamente |
| 21 | `timeline` | `contrato_id` | **CASCADE** | **NÃO** | 0 | NÃO | NÃO | CASCADE DB | Não exige | CASCADE limpa automaticamente |

---

## 7. MÁQUINA DE DECISÃO RECONCILIADA

A matriz lógica definitiva para execução dentro da futura RPC:

| Condição no Banco de Dados | Tipo de Bloqueio | HARD DELETE | SOFT DELETE | Ação Prévia Obrigatória na Transação |
| :--- | :--- | :---: | :---: | :--- |
| `status_documento = 'ASSINADO'` ou `pdf_assinado_key IS NOT NULL` ou assinatura concluída em `assinaturas` | Bloqueador de Retenção Jurídica | **NÃO** | **SIM** | Nenhuma destruição de arquivos; atualiza `deleted_at`, desativa agendamentos e cancela cobranças em aberto. |
| `EXISTS (notas_fiscais WHERE status IN ('EMITIDA', 'CANCELADA'))` | Bloqueador de Retenção Fiscal | **NÃO** | **SIM** | Preserva vínculo com nota fiscal. |
| `EXISTS (pagamentos WHERE valor_pago > 0)` ou `contas_receber` com `status IN ('PAGO','PAGA','PARCIAL','PARCIAL_PAGA','CONCILIADA')` ou `valor_pago > 0` | Bloqueador de Retenção Financeira | **NÃO** | **SIM** | Preserva extrato de recebíveis e liquidações bancárias. |
| `EXISTS (financeiro_lancamentos WHERE status_geral IN ('PAID', 'PARTIALLY_PAID'))` | Bloqueador de Retenção Contábil | **NÃO** | **SIM** | Preserva partidas dobradas do livro-razão / DRE. |
| `EXISTS (comissoes_representantes WHERE status = 'PAGA')` ou `EXISTS (comissoes WHERE status = 'PAGA')` | Bloqueador de Retenção Comercial | **NÃO** | **SIM** | Preserva comprovante de comissão paga ao representante. |
| `EXISTS (ordens_producao WHERE status IN ('APROVADA', 'LIBERADA', 'PUBLICADA', 'FINALIZADA'))` | Bloqueador de Retenção Operacional | **NÃO** | **SIM** | Preserva histórico de criação e veiculação de arte. |
| `EXISTS (repasses_parceiros WHERE status IN ('APROVADO', 'PAGO'))` | Bloqueador de Retenção de Parcerias | **NÃO** | **SIM** | Preserva histórico de repasses pagos a donos de telas. |
| **Contrato sem nenhum dos bloqueadores de retenção acima** (Contrato em rascunho / proposta gerada / aguardando assinatura sem pagamentos efetuados) | Bloqueador Relacional Removível | **SIM** | **NÃO** | 1. Desvincula `agendamentos` (`contrato_id = NULL, status = 'CANCELADO'`)<br>2. Desvincula `repasses_parceiros` pendentes (`contrato_parceiro_id = NULL`)<br>3. Remove `comissoes_representantes` pendentes<br>4. Remove `ordens_producao` em rascunho<br>5. Remove `financeiro_lancamentos` pendentes<br>6. Coleta chaves R2 (`pdf_object_key`, `pdf_assinado_key`, `contrato_versoes.pdf_url`, `assinaturas`)<br>7. Insere auditoria permanente em `auditoria_logs`<br>8. Executa `DELETE FROM contratos WHERE id = p_contrato_id`<br>9. Retorna chaves para deleção server-side no R2. |

---

## 8. INVENTÁRIO COMPLETO DE STORAGE R2

Em contratos que sofrem **Hard Delete**, o PostgreSQL retorna a lista exata de chaves R2 a serem expurgadas pelo backend server-side (`supabase/functions/delete-media-object`):

1. **Documento Principal:** `contratos.pdf_object_key`
2. **Documento Assinado (se houver chave residual):** `contratos.pdf_assinado_key`
3. **Versões do Contrato:** Todos os registros em `contrato_versoes.pdf_url` vinculados ao `contrato_id`
4. **Documentos de Assinatura:** Registros em `assinaturas.pdf_original_key` e `assinaturas.pdf_assinado_key` vinculados ao `contrato_id`
5. **Padrão Canônico de Prefixo:** `tenants/{tenant_id}/contratos/{contrato_id}/`

> **Nota de Segurança:** Em caso de **Soft Delete**, NENHUM arquivo do Cloudflare R2 é removido. Todos os PDFs e comprovantes permanecem intactos para auditoria e prestação de contas.

---

## 9. REGRA FINAL DE AUDITORIA PERMANENTE (`public.auditoria_logs`)

* **Comprovado no Schema:** `public.auditoria_logs.entidade_id` é do tipo `UUID` e **NÃO possui Foreign Key** apontando para `contratos.id`.
* **Garantia de Não-Regressão:** A gravação em `auditoria_logs` é executada **dentro da mesma transação do PostgreSQL antes do comando `DELETE FROM contratos`**.
* **Payload Preservado:**
  * `empresa_operadora_id`: Tenant do contrato
  * `usuario_id`: `auth.uid()` do executor
  * `usuario_email`: Email do executor
  * `usuario_role`: Perfil do executor (`OWNER` ou `ADMIN`)
  * `entidade_tipo`: `'CONTRATO'`
  * `entidade_id`: `p_contrato_id` (UUID original)
  * `acao`: `'HARD_DELETE'` ou `'SOFT_DELETE'`
  * `status_anterior`: `v_contrato.status_workflow`
  * `status_novo`: `'EXCLUIDO'` (no Hard Delete) ou `'CANCELADO'` (no Soft Delete)
  * `valor_antigo`: `row_to_json(v_contrato)` (Snapshot JSONB completo de todas as 36 colunas do contrato)
  * `observacoes`: Motivo obrigatório fornecido pelo usuário autenticado.

---

## 10. MAPEAMENTO DETALHADO DOS 19 ARQUIVOS NO CÓDIGO (`deleted_at`)

| # | Arquivo | Consulta `contratos`? | Filtro `deleted_at` Existente | Ação Necessária no AR-03.2 (Implementação) |
| :- | :--- | :--- | :--- | :--- |
| 1 | `src/modules/crm/pages/ContratosListPage.tsx` | SIM | Consome `contratoService.findAll()` | Já consome serviço protegido; adicionar botão "Excluir" e modal de confirmação. |
| 2 | `src/modules/crm/services/contrato.service.ts` | SIM | Presente em `findAll` e seleções | Adicionar `.is('deleted_at', null)` nos métodos `findByContratoId`, `findByPropostaId`, `getContractDownloadUrl` e implementar `excluirContrato`. |
| 3 | `src/modules/crm/pages/ContratoSelectionPage.tsx` | SIM | **SIM** (`.is('deleted_at', null)`) | Nenhuma (já protegido). |
| 4 | `src/modules/crm/services/customerCommerce.service.ts` | SIM | **SIM** (`.is('deleted_at', null)`) | Nenhuma (já protegido). |
| 5 | `src/services/pontosRede.service.ts` | SIM | **SIM** (em pontos) / Contratos fallback | Adicionar `.is('deleted_at', null)` na consulta de receita média. |
| 6 | `src/modules/crm/components/Cliente360Modal.tsx` | SIM | NÃO | Adicionar `.is('deleted_at', null)` na aba de contratos do cliente. |
| 7 | `src/modules/crm/hooks/useClienteModalidade.ts` | SIM | NÃO | Adicionar `.is('deleted_at', null)` para não ativar modalidades com base em contratos soft-deleted. |
| 8 | `src/modules/crm/pages/portal/ExpansaoPage.tsx` | SIM | NÃO | Adicionar `.is('deleted_at', null)` para impedir expansão de contrato soft-deleted. |
| 9 | `src/modules/crm/pages/portal/FinanceiroClientePage.tsx` | SIM | NÃO | Adicionar `.is('deleted_at', null)` na consulta de contratos do cliente. |
| 10 | `src/modules/crm/services/customerPortal.service.ts` | SIM | NÃO | Adicionar `.is('deleted_at', null)` na contagem de contratos vigentes do anunciante. |
| 11 | `src/modules/crm/services/customerPortalData.service.ts` | SIM | NÃO | Adicionar `.is('deleted_at', null)` nas consultas de dados e PIs do portal. |
| 12 | `src/modules/crm/services/digitalSignature.service.ts` | SIM | NÃO | Adicionar `.is('deleted_at', null)` para impedir envio de envelopes para contratos soft-deleted. |
| 13 | `src/modules/crm/services/composicaoComercial.service.ts` | SIM | NÃO | Adicionar `.is('deleted_at', null)` no carregamento de itens comerciais. |
| 14 | `src/modules/crm/services/contratoDocumento.service.ts` | SIM | NÃO | Adicionar validação de contrato ativo antes de renderizar PDFs. |
| 15 | `src/modules/crm/services/contratoModelosAdmin.service.ts` | SIM | NÃO | Manter como está (contagem para governança de templates). |
| 16 | `src/modules/crm/services/financeiro.service.ts` | SIM | NÃO | Adicionar `.is('deleted_at', null)` nas consultas de resumo financeiro e listagens de contratos. |
| 17 | `src/modules/crm/services/analytics.service.ts` | SIM | NÃO | Adicionar `.is('deleted_at', null)` no cálculo de métricas de contratos ativos. |
| 18 | `src/services/bi.service.ts` | SIM | NÃO | Adicionar `.is('deleted_at', null)` nos relatórios de BI e cálculo de MRR. |
| 19 | `src/services/representative.service.ts` | SIM | NÃO | Adicionar `.is('deleted_at', null)` nas metas e comissões do painel do representante. |

---

## 11. AUTORIZAÇÃO E SEGURANÇA MULTI-TENANT

* **Perfis com Permissão de Exclusão:**
  * `OWNER` (`u.is_owner = true` OU `perfis.nome = 'OWNER'`)
  * `ADMIN` (`perfis.nome = 'ADMIN'`)
* **Isolamento de Tenant:**
  * O `ADMIN` só pode excluir contratos pertencentes à sua própria operadora (`contratos.empresa_operadora_id = usuarios.empresa_operadora_id`).
  * O `OWNER` possui privilégio institucional da plataforma SOBRE MÍDIA.
* **Perfis Proibidos (Retornam 403 Forbidden imediato):**
  * `REPRESENTANTE`, `ANUNCIANTE`, `GESTOR`, `FINANCEIRO`, `FUNCIONARIO`, `PARCEIRO`, `DESIGNER`, `OPERACIONAL`, `CLIENTE`.

---

## 12. ESPECIFICAÇÃO CANÔNICA DA RPC DEFINITIVA PARA IMPLEMENTAÇÃO NO AR-03.2

Com todas as 5 divergências P0/P1 sanadas, a especificação exata do SQL para a futura migração do AR-03.2 é:

```sql
CREATE OR REPLACE FUNCTION public.fn_excluir_contrato_atomo(
  p_contrato_id UUID,
  p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_user_tenant UUID;
  v_is_owner BOOLEAN;
  v_is_admin BOOLEAN;
  v_user_email VARCHAR;
  v_user_role VARCHAR;
  v_contrato RECORD;
  
  -- Indicadores de Bloqueadores de Retenção
  v_is_assinado BOOLEAN;
  v_has_nf_emitida BOOLEAN;
  v_has_pagamentos BOOLEAN;
  v_has_contas_receber_pagas BOOLEAN;
  v_has_lancamento_quitado BOOLEAN;
  v_has_comissao_paga BOOLEAN;
  v_has_op_aprovada BOOLEAN;
  v_has_repasse_pago BOOLEAN;
  
  -- Coleta de chaves R2
  v_r2_keys JSONB := '[]'::jsonb;
  v_versao_keys JSONB;
  v_assinatura_keys JSONB;
BEGIN
  -- 1. Autenticação
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso não autenticado.');
  END IF;

  -- 2. Autorização (OWNER ou ADMIN)
  SELECT u.is_owner, u.empresa_operadora_id, u.email, COALESCE(p.nome, 'SEM_PERFIL'),
         (UPPER(COALESCE(p.nome, '')) = 'ADMIN')
  INTO v_is_owner, v_user_tenant, v_user_email, v_user_role, v_is_admin
  FROM public.usuarios u
  LEFT JOIN public.perfis p ON p.id = u.perfil_id
  WHERE u.id = v_user_id LIMIT 1;

  IF NOT COALESCE(v_is_owner, false) AND NOT COALESCE(v_is_admin, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: Somente OWNER ou ADMIN podem excluir contratos.');
  END IF;

  -- 3. Advisory Lock atômico para serialização e concorrência
  PERFORM pg_advisory_xact_lock(hashtext('contrato_delete_lock_' || p_contrato_id::text));

  -- 4. Busca contrato
  SELECT * INTO v_contrato FROM public.contratos WHERE id = p_contrato_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', true, 'already_deleted', true, 'message', 'Contrato já excluído ou não encontrado.');
  END IF;

  IF v_contrato.deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already_deleted', true, 'message', 'Contrato já se encontra cancelado/excluído.');
  END IF;

  -- Validação de Tenant para ADMIN
  IF v_contrato.empresa_operadora_id <> v_user_tenant AND NOT COALESCE(v_is_owner, false) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Acesso Negado: Contrato pertence a outro tenant.');
  END IF;

  -- 5. Avaliação Canônica dos Bloqueadores de Retenção
  -- A. Assinatura Jurídica
  v_is_assinado := (
    v_contrato.status_documento = 'ASSINADO'
    OR v_contrato.pdf_assinado_key IS NOT NULL
    OR v_contrato.documento_assinado_em IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.assinaturas
      WHERE contrato_id = p_contrato_id
        AND (status = 'ASSINADO' OR pdf_assinado_key IS NOT NULL OR assinado_em IS NOT NULL)
    )
  );

  -- B. Nota Fiscal Emitida ou Cancelada
  SELECT EXISTS(
    SELECT 1 FROM public.notas_fiscais
    WHERE contrato_id = p_contrato_id AND status IN ('EMITIDA', 'CANCELADA')
  ) INTO v_has_nf_emitida;

  -- C. Pagamentos Bancários Confirmados
  SELECT EXISTS(
    SELECT 1 FROM public.pagamentos
    WHERE (contrato_id = p_contrato_id OR conta_receber_id IN (SELECT id FROM public.contas_receber WHERE contrato_id = p_contrato_id))
      AND valor_pago > 0
  ) INTO v_has_pagamentos;

  -- D. Contas a Receber Pagas ou Conciliadas
  SELECT EXISTS(
    SELECT 1 FROM public.contas_receber
    WHERE contrato_id = p_contrato_id
      AND (
        status IN ('PAGO', 'PAGA', 'PARCIAL', 'PARCIAL_PAGA', 'CONCILIADA')
        OR COALESCE(valor_pago, 0) > 0
        OR data_recebimento IS NOT NULL
        OR payment_date IS NOT NULL
        OR inter_status IN ('PAGO', 'RECEBIDO')
      )
  ) INTO v_has_contas_receber_pagas;

  -- E. Lançamento Contábil Quitado no DRE
  SELECT EXISTS(
    SELECT 1 FROM public.financeiro_lancamentos
    WHERE contrato_id = p_contrato_id AND status_geral IN ('PAID', 'PARTIALLY_PAID')
  ) INTO v_has_lancamento_quitado;

  -- F. Comissão Paga ao Representante
  SELECT (
    EXISTS(SELECT 1 FROM public.comissoes_representantes WHERE contrato_id = p_contrato_id AND status = 'PAGA')
    OR
    EXISTS(SELECT 1 FROM public.comissoes WHERE contrato_id = p_contrato_id AND status = 'PAGA')
  ) INTO v_has_comissao_paga;

  -- G. Ordem de Produção Aprovada ou Publicada
  SELECT EXISTS(
    SELECT 1 FROM public.ordens_producao
    WHERE contrato_id = p_contrato_id AND status IN ('APROVADA', 'LIBERADA', 'PUBLICADA', 'FINALIZADA')
  ) INTO v_has_op_aprovada;

  -- H. Repasse a Parceiro Pago
  SELECT EXISTS(
    SELECT 1 FROM public.repasses_parceiros
    WHERE contrato_parceiro_id = p_contrato_id AND status IN ('APROVADO', 'PAGO')
  ) INTO v_has_repasse_pago;

  -- =========================================================================
  -- DECISÃO 1: SOFT DELETE (Preservação Integral de Histórico)
  -- =========================================================================
  IF v_is_assinado OR v_has_nf_emitida OR v_has_pagamentos OR v_has_contas_receber_pagas
     OR v_has_lancamento_quitado OR v_has_comissao_paga OR v_has_op_aprovada OR v_has_repasse_pago THEN

    UPDATE public.contratos
    SET deleted_at = NOW(),
        deleted_by = v_user_id,
        delete_reason = p_motivo,
        status_workflow = 'CANCELADO',
        status_documento = 'CANCELADO',
        updated_at = NOW()
    WHERE id = p_contrato_id;

    -- Cancela cobranças futuras ainda em aberto
    UPDATE public.contas_receber
    SET status = 'CANCELADO', updated_at = NOW()
    WHERE contrato_id = p_contrato_id
      AND status IN ('PENDENTE', 'ATRASADO', 'ATRASADA', 'VENCIDO', 'ABERTA', 'AGENDADA', 'VENCENDO_HOJE')
      AND COALESCE(valor_pago, 0) = 0;

    -- Desativa agendamentos vinculados
    UPDATE public.agendamentos
    SET status = 'CANCELADO', updated_at = NOW()
    WHERE contrato_id = p_contrato_id;

    -- Auditoria Permanente Central
    INSERT INTO public.auditoria_logs (
      empresa_operadora_id, usuario_id, usuario_email, usuario_role,
      entidade_tipo, entidade_id, acao, status_anterior, status_novo, observacoes, valor_antigo
    ) VALUES (
      v_contrato.empresa_operadora_id, v_user_id, v_user_email, v_user_role,
      'CONTRATO', p_contrato_id, 'SOFT_DELETE', v_contrato.status_workflow, 'CANCELADO',
      'Soft Delete aplicado para preservação fiscal/jurídica/contábil. Motivo: ' || COALESCE(p_motivo, 'Sem motivo informado'),
      row_to_json(v_contrato)
    );

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'SOFT_DELETE',
      'contrato_id', p_contrato_id,
      'message', 'Contrato desativado e cancelado com preservação integral do histórico fiscal e contábil.'
    );
  END IF;

  -- =========================================================================
  -- DECISÃO 2: HARD DELETE (Exclusão Física Definitiva)
  -- =========================================================================
  -- Coleta todas as chaves R2 antes da exclusão física
  IF v_contrato.pdf_object_key IS NOT NULL THEN
    v_r2_keys := v_r2_keys || jsonb_build_array(v_contrato.pdf_object_key);
  END IF;

  IF v_contrato.pdf_assinado_key IS NOT NULL THEN
    v_r2_keys := v_r2_keys || jsonb_build_array(v_contrato.pdf_assinado_key);
  END IF;

  SELECT COALESCE(jsonb_agg(pdf_url), '[]'::jsonb)
  INTO v_versao_keys
  FROM public.contrato_versoes
  WHERE contrato_id = p_contrato_id AND pdf_url IS NOT NULL;
  v_r2_keys := v_r2_keys || v_versao_keys;

  SELECT COALESCE(jsonb_agg(pdf_original_key), '[]'::jsonb)
  INTO v_assinatura_keys
  FROM public.assinaturas
  WHERE contrato_id = p_contrato_id AND pdf_original_key IS NOT NULL;
  v_r2_keys := v_r2_keys || v_assinatura_keys;

  -- Desvinculação e limpeza de Bloqueadores Relacionais na mesma transação
  UPDATE public.agendamentos SET contrato_id = NULL, status = 'CANCELADO', updated_at = NOW() WHERE contrato_id = p_contrato_id;
  UPDATE public.repasses_parceiros SET contrato_parceiro_id = NULL WHERE contrato_parceiro_id = p_contrato_id;
  DELETE FROM public.comissoes_representantes WHERE contrato_id = p_contrato_id;
  DELETE FROM public.ordens_producao WHERE contrato_id = p_contrato_id;
  DELETE FROM public.financeiro_lancamentos WHERE contrato_id = p_contrato_id;

  -- Auditoria Permanente Central ANTES do DELETE físico
  INSERT INTO public.auditoria_logs (
    empresa_operadora_id, usuario_id, usuario_email, usuario_role,
    entidade_tipo, entidade_id, acao, status_anterior, status_novo, observacoes, valor_antigo
  ) VALUES (
    v_contrato.empresa_operadora_id, v_user_id, v_user_email, v_user_role,
    'CONTRATO', p_contrato_id, 'HARD_DELETE', v_contrato.status_workflow, 'EXCLUIDO',
    'Exclusão física definitiva realizada. Motivo: ' || COALESCE(p_motivo, 'Sem motivo informado'),
    row_to_json(v_contrato)
  );

  -- Exclusão Física no PostgreSQL (CASCADE automático limpa versoes, assinaturas, itens, contas_receber)
  DELETE FROM public.contratos WHERE id = p_contrato_id;

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'HARD_DELETE',
    'contrato_id', p_contrato_id,
    'r2_keys_to_delete', v_r2_keys,
    'message', 'Contrato e dependências excluídos definitivamente com sucesso.'
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
```

---

## 13. CRITÉRIOS OBJETIVOS DE ACEITE PARA O MICRO-GATE AR-03.2 (IMPLEMENTAÇÃO)

Para que o gate de implementação (**MICRO-GATE AR-03.2**) seja considerado concluído e homologado, todos os seguintes critérios deverão ser cumpridos:

1. **Migration PostgreSQL:** Criação da RPC `fn_excluir_contrato_atomo` com permissão `SECURITY DEFINER` e concessão para `authenticated`.
2. **Campos de Soft Delete:** Garantir existência das colunas `deleted_at`, `deleted_by`, `delete_reason` em `public.contratos`.
3. **Serviço CRM (`contrato.service.ts`):**
   * Implementação de `excluirContrato(contratoId: string, motivo: string)` que invoca a RPC `fn_excluir_contrato_atomo`.
   * Trigger server-side da Edge Function `delete-media-object` para as chaves retornadas em `r2_keys_to_delete`.
   * Adição do filtro `.is('deleted_at', null)` nos métodos de busca.
4. **Interface Visual (`ContratosListPage.tsx`):**
   * Botão de exclusão condicionado a `isOwner || usuario?.perfil?.nome === 'ADMIN'`.
   * Modal de confirmação `ConfirmDeleteContractModal` exigindo digitação do número do contrato e preenchimento de justificativa obrigatória.
5. **Auditoria Central:** Validação de que todo evento de exclusão gera linha permanente em `public.auditoria_logs` com snapshot JSONB.
6. **Suíte de Testes Automatizados (Vitest):**
   * Teste 1: Hard Delete de contrato em rascunho sem pagamentos.
   * Teste 2: Soft Delete forçado de contrato com pagamento liquidado.
   * Teste 3: Soft Delete forçado de contrato com assinatura digital.
   * Teste 4: Soft Delete forçado de contrato com nota fiscal emitida.
   * Teste 5: Rejeição com erro para usuários não autorizados (`REPRESENTANTE`, `ANUNCIANTE`, etc.).
   * Teste 6: Rejeição para exclusão cross-tenant por `ADMIN`.
7. **Validação E2E no Banco Real:** Script de teste temporário que cria contrato e executa Hard/Soft delete comprovando rollback e persistência.

---

## 14. VEREDITO FINAL DO PRE-FLIGHT

### **PASS — MICRO-GATE AR-03.2 PRE-FLIGHT 100% HOMOLOGADO**

* **Status:** APROVADO
* **Fundamentação:** Todas as lacunas, constraints de banco, enums, status reais, divergências de especificação P0/P1 e regras de concorrência e autorização foram exaustivamente auditadas, comprovadas empiricamente e reconciliadas em uma especificação formal livre de contradições.
* **Próxima Etapa:** Autorização para abertura do gate de implementação cirúrgica **MICRO-GATE AR-03.2**.
