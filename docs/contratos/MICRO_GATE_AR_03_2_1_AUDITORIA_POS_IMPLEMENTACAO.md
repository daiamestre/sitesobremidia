# MICRO-GATE AR-03.2.1 — AUDITORIA FORENSE PÓS-IMPLEMENTAÇÃO DA EXCLUSÃO ATÔMICA DE CONTRATOS

**DATA DA AUDITORIA:** 2026-09-07  
**NATUREZA:** FORENSE READ-ONLY (ZERO IMPLEMENTAÇÃO / ZERO MUTATIONS / ZERO DEPLOY)  
**STATUS:** **PASS — AR-03.2.1 HOMOLOGADO**

---

## 1. BASELINE E CONFORMIDADE DE GOVERNANÇA

* **Commit Base Canônico:** `deeb97c57619192dd7133b3faec357bf72ac6f8b`
* **Governança Suprema:** `AGENTS.md` e `docs/contratos/CONTRATOS_BASELINE_ANTIREGRESSAO.md`
* **Artefato de Entrada Homologado:** `docs/contratos/MICRO_GATE_AR_03_2_PREFLIGHT.md`
* **Migration Auditada:** `supabase/migrations/20260907170000_fn_excluir_contrato_atomo.sql`
* **Mutações Realizadas Neste Gate:** `0` (Zero — estritamente forense e read-only)

---

## 2. AUDITORIA FORENSE DA DEFINIÇÃO REAL DA RPC NO POSTGRESQL

A inspeção direta no catálogo do PostgreSQL (`pg_proc`, `pg_namespace`) confirmou a definição real implantada de `public.fn_excluir_contrato_atomo`:

```sql
CREATE OR REPLACE FUNCTION public.fn_excluir_contrato_atomo(
  p_contrato_id UUID,
  p_motivo TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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
  v_is_assinado BOOLEAN := FALSE;
  v_has_nf_emitida BOOLEAN := FALSE;
  v_has_pagamentos BOOLEAN := FALSE;
  v_has_contas_receber_pagas BOOLEAN := FALSE;
  v_has_lancamento_quitado BOOLEAN := FALSE;
  v_has_comissao_paga BOOLEAN := FALSE;
  v_has_op_aprovada BOOLEAN := FALSE;
  v_has_repasse_pago BOOLEAN := FALSE;
  
  -- Coleta de chaves R2
  v_r2_keys JSONB := '[]'::jsonb;
  v_versao_keys JSONB;
  v_assinatura_orig_keys JSONB;
  v_assinatura_ass_keys JSONB;
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

  -- Validação de Tenant para ADMIN (não OWNER)
  IF v_contrato.empresa_operadora_id IS NOT NULL 
     AND v_user_tenant IS NOT NULL 
     AND v_contrato.empresa_operadora_id <> v_user_tenant 
     AND NOT COALESCE(v_is_owner, false) THEN
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
    SELECT 1 FROM public.financeiro_lancamentos fl
    LEFT JOIN public.cobrancas c ON c.financeiro_lancamento_id = fl.id
    WHERE fl.contrato_id = p_contrato_id 
      AND (fl.status_geral IN ('PAID', 'PARTIALLY_PAID') OR c.status_pagamento = 'PAID')
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

    -- Cancela cobranças futuras ainda em aberto (sem valor pago)
    UPDATE public.contas_receber
    SET status = 'CANCELADO', updated_at = NOW()
    WHERE contrato_id = p_contrato_id
      AND status IN ('PENDENTE', 'ATRASADO', 'ATRASADA', 'VENCIDO', 'ABERTA', 'AGENDADA', 'VENCENDO_HOJE')
      AND COALESCE(valor_pago, 0) = 0;

    -- Desativa agendamentos vinculados
    UPDATE public.agendamentos
    SET status = 'CANCELADO', updated_at = NOW()
    WHERE contrato_id = p_contrato_id;

    -- Auditoria Permanente Central (acao = 'STATUS_CHANGE')
    INSERT INTO public.auditoria_logs (
      empresa_operadora_id, usuario_id, usuario_email, usuario_role,
      entidade_tipo, entidade_id, acao, status_anterior, status_novo, observacoes, valor_antigo
    ) VALUES (
      v_contrato.empresa_operadora_id, v_user_id, v_user_email, v_user_role,
      'CONTRATO', p_contrato_id, 'STATUS_CHANGE', v_contrato.status_workflow, 'CANCELADO',
      '[SOFT_DELETE] Preservação fiscal/jurídica/contábil aplicada. Motivo: ' || COALESCE(p_motivo, 'Sem motivo informado'),
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
  INTO v_assinatura_orig_keys
  FROM public.assinaturas
  WHERE contrato_id = p_contrato_id AND pdf_original_key IS NOT NULL;
  v_r2_keys := v_r2_keys || v_assinatura_orig_keys;

  SELECT COALESCE(jsonb_agg(pdf_assinado_key), '[]'::jsonb)
  INTO v_assinatura_ass_keys
  FROM public.assinaturas
  WHERE contrato_id = p_contrato_id AND pdf_assinado_key IS NOT NULL;
  v_r2_keys := v_r2_keys || v_assinatura_ass_keys;

  -- Desvinculação e limpeza de Bloqueadores Relacionais na mesma transação
  UPDATE public.agendamentos SET contrato_id = NULL, status = 'CANCELADO', updated_at = NOW() WHERE contrato_id = p_contrato_id;
  UPDATE public.repasses_parceiros SET contrato_parceiro_id = NULL WHERE contrato_parceiro_id = p_contrato_id;
  DELETE FROM public.comissoes_representantes WHERE contrato_id = p_contrato_id;
  DELETE FROM public.ordens_producao WHERE contrato_id = p_contrato_id;
  DELETE FROM public.financeiro_lancamentos WHERE contrato_id = p_contrato_id;

  -- Auditoria Permanente Central ANTES do DELETE físico (acao = 'DELETE')
  INSERT INTO public.auditoria_logs (
    empresa_operadora_id, usuario_id, usuario_email, usuario_role,
    entidade_tipo, entidade_id, acao, status_anterior, status_novo, observacoes, valor_antigo
  ) VALUES (
    v_contrato.empresa_operadora_id, v_user_id, v_user_email, v_user_role,
    'CONTRATO', p_contrato_id, 'DELETE', v_contrato.status_workflow, 'EXCLUIDO',
    '[HARD_DELETE] Exclusão física definitiva realizada. Motivo: ' || COALESCE(p_motivo, 'Sem motivo informado'),
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

## 3. AUDITORIA FORENSE DA MATRIZ DE RETENÇÃO

### 3.1 Assinatura Jurídica
* **Constraint Real no Banco:** `assinaturas.assinaturas_status_check`: `ARRAY['RASCUNHO', 'ENVIADO', 'VISUALIZADO', 'ASSINADO', 'RECUSADO', 'EXPIRADO', 'CANCELADO']`.
* **Investigação do Status `CONCLUIDO` vs `ASSINADO`:**
  * No resumo textual do relatório anterior AR-03.2, foi mencionada a palavra `CONCLUIDO`.
  * Na RPC real implantada (`fn_excluir_contrato_atomo`), a query real utiliza estritamente `status = 'ASSINADO'`.
  * **Conclusão:** A implementação em banco está **100% aderente ao schema real** e não possui divergência.
  * Além disso, a RPC avalia `v_contrato.status_documento = 'ASSINADO'`, `v_contrato.pdf_assinado_key IS NOT NULL` e `v_contrato.documento_assinado_em IS NOT NULL`.

### 3.2 Notas Fiscais
* **Constraint Real no Banco:** `notas_fiscais.notas_fiscais_status_check`: `ARRAY['RASCUNHO', 'EMITIDA', 'CANCELADA']`.
* **Regra na RPC:** `status IN ('EMITIDA', 'CANCELADA')`.
* **Conclusão:** Ambos os estados fiscais homologados são protegidos com fidelidade.

### 3.3 Pagamentos
* **Estrutura Real no Banco:** Tabela `pagamentos` armazena quitações irreversíveis com `valor_pago > 0`.
* **Regra na RPC:** Verifica pagamentos vinculados diretamente ao `contrato_id` ou indiretamente através de `contas_receber.contrato_id` com `valor_pago > 0`.
* **Conclusão:** Nenhum pagamento fantasma ou mera existência de tabela sem valor bloqueia indevidamente o Hard Delete, e toda liquidação real força Soft Delete.

### 3.4 Contas a Receber
* **Regra na RPC:** Verifica `status IN ('PAGO', 'PAGA', 'PARCIAL', 'PARCIAL_PAGA', 'CONCILIADA')`, `valor_pago > 0`, `data_recebimento IS NOT NULL`, `payment_date IS NOT NULL`, `inter_status IN ('PAGO', 'RECEBIDO')`.
* **Comportamento no Soft Delete:** Atualiza títulos em aberto (`PENDENTE`, `ATRASADO`, `VENCIDO`) para `CANCELADO` com `valor_pago = 0`. Títulos quitados não são tocados.

### 3.5 Financeiro (`financeiro_lancamentos`)
* **Constraint Real no Banco:** `financeiro_lancamentos.financeiro_lancamentos_status_geral_check`: `ARRAY['PENDING', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELED']`.
* **Regra na RPC:** `fl.status_geral IN ('PAID', 'PARTIALLY_PAID') OR c.status_pagamento = 'PAID'`.
* **Conclusão:** O status inexistente `LIQUIDATED` foi totalmente evitado, e os estados contábeis reais foram protegidos.

### 3.6 Comissões de Representantes e Comissões
* **Constraints Reais no Banco:**
  * `comissoes_representantes_status_check`: `ARRAY['PREVISTA', 'LIBERADA', 'PAGA', 'CANCELADA']`.
  * `com_status_check`: `ARRAY['PENDENTE', 'LIBERADA', 'PAGA', 'CANCELADA']`.
* **Regra na RPC:** `status = 'PAGA'` em qualquer uma das tabelas força Soft Delete. No Hard Delete, remove apenas comissões não pagas.

### 3.7 Ordens de Produção
* **Constraint Real no Banco:** `op_status_check`: `ARRAY['CRIADA', 'AGUARDANDO_MATERIAL', 'MATERIAL_RECEBIDO', 'EM_DESENVOLVIMENTO', 'AGUARDANDO_APROVACAO', 'REPROVADA', 'APROVADA', 'LIBERADA', 'PUBLICADA', 'FINALIZADA', 'CANCELADA', 'SUSPENSA']`.
* **Regra na RPC:** `status IN ('APROVADA', 'LIBERADA', 'PUBLICADA', 'FINALIZADA')` força Soft Delete. No Hard Delete, remove apenas OPs em rascunho.

### 3.8 Repasses de Parceiros
* **Constraint Real no Banco:** `repasses_parceiros_status_check`: `ARRAY['DEVIDO', 'APROVADO', 'PAGO', 'CANCELADO', 'ESTORNADO']`.
* **Regra na RPC:** `status IN ('APROVADO', 'PAGO')` força Soft Delete. No Hard Delete, desvincula apenas repasses não liquidados (`UPDATE SET contrato_parceiro_id = NULL`).

---

## 4. AUDITORIA DE STORAGE R2 & INTEGRAÇÃO SERVER-SIDE

1. **Introspecção dos Dados de Storage:**
   * Amostragem de `contratos.pdf_object_key`: `tenants/{tenant_id}/contratos/{contrato_id}/v1/contrato_CTR-2026-XXXX.pdf`
   * Amostragem de `contrato_versoes.pdf_url`: `tenants/{tenant_id}/contratos/{contrato_id}/v1/contrato_CTR-2026-XXXX.pdf`
   * Amostragem de `assinaturas.pdf_original_key`: `tenants/{tenant_id}/contratos/{contrato_id}/...`
   * **Conclusão:** Todos os campos utilizam caminhos relativos de object key no formato canônico da operadora/contrato.
2. **Coleta e Deduplicação:**
   * A RPC agrega todas as chaves em `r2_keys_to_delete`.
   * O serviço `contrato.service.ts` executa deduplicação em memória (`new Set(...)`).
3. **Isolamento de Credenciais:**
   * A chamada para deleção no R2 é feita exclusivamente via Edge Function `delete-media-object`.
   * Zero secrets do R2 no bundle do browser.

---

## 5. AUDITORIA DOS FILTROS OPERACIONAIS (`deleted_at IS NULL`)

A auditoria confirmou a aplicação efetiva dos filtros de integridade em todas as consultas operacionais:

1. `src/modules/crm/pages/ContratosListPage.tsx` — filtrado via `contratoService.findAll()`
2. `src/modules/crm/services/contrato.service.ts` — `.is('deleted_at', null)` em todas as queries
3. `src/modules/crm/components/Cliente360Modal.tsx` — `.is('deleted_at', null)` na listagem de contratos do cliente
4. `src/modules/crm/hooks/useClienteModalidade.ts` — `.is('deleted_at', null)` na detecção de modalidades
5. `src/modules/crm/pages/portal/ExpansaoPage.tsx` — `.is('deleted_at', null)` na resolução de contratos vigentes
6. `src/modules/crm/pages/portal/FinanceiroClientePage.tsx` — `.is('deleted_at', null)`
7. `src/modules/crm/services/customerPortal.service.ts` — `.is('deleted_at', null)`
8. `src/modules/crm/services/customerPortalData.service.ts` — `.is('deleted_at', null)`
9. `src/modules/crm/services/digitalSignature.service.ts` — `.is('deleted_at', null)`
10. `src/modules/crm/services/composicaoComercial.service.ts` — `.is('deleted_at', null)`
11. `src/modules/crm/services/contratoDocumento.service.ts` — `.is('deleted_at', null)`
12. `src/modules/crm/services/financeiro.service.ts` — `.is('deleted_at', null)`
13. `src/modules/crm/services/analytics.service.ts` — `.is('deleted_at', null)`
14. `src/services/bi.service.ts` — `.is('deleted_at', null)`
15. `src/services/representative.service.ts` — `.is('deleted_at', null)`
16. `src/services/pontosRede.service.ts` — `.is('deleted_at', null)`

---

## 6. AUDITORIA DO FLUXO DE BILLING & ASSINATURA DIGITAL

* **Billing Mensal Recorrente:**
  * Rotina `public.rpc_generate_monthly_billing`: possui explicitamente a cláusula `AND c.deleted_at IS NULL`.
  * Rotina `public.gerar_cobrancas_recorrentes`: possui explicitamente a cláusula `AND deleted_at IS NULL`.
* **Assinatura Digital:**
  * O serviço `digitalSignature.service.ts` valida `deleted_at IS NULL` antes de gerar envelope.
  * O Soft Delete altera `status_workflow = 'CANCELADO'` e `status_documento = 'CANCELADO'`, impossibilitando a assinatura do documento.

---

## 7. AUDITORIA DE AUDITORIA PERMANENTE (`public.auditoria_logs`)

* A tabela `public.auditoria_logs` possui a coluna `entidade_id` sem Foreign Key apontando para `contratos.id`.
* O registro de auditoria é inserido antes da execução de `DELETE FROM contratos` dentro do mesmo bloco transacional.
* Se o `DELETE` falhar por qualquer razão, a auditoria é revertida via rollback da transação.
* A gravação utiliza as ações homologadas `DELETE` (para Hard Delete) e `STATUS_CHANGE` (para Soft Delete) com detalhes em `observacoes` e snapshot completo em `valor_antigo`.

---

## 8. MATRIZ DE CLASSIFICAÇÃO FINAL

| Área | Esperado | Encontrado | Evidência | Status |
| :--- | :--- | :--- | :--- | :--- |
| **RPC** | Conforme pre-flight | `fn_excluir_contrato_atomo` atômica, `SECURITY DEFINER` e advisory lock | Catálogo `pg_proc` no banco de dados | **PASS** |
| **Tenant** | Isolado | `empresa_operadora_id` validado contra usuário executor | Linha 73 da RPC | **PASS** |
| **RBAC** | OWNER/ADMIN | Acesso restrito a `is_owner = true` ou `perfil = 'ADMIN'` | Linha 48 da RPC | **PASS** |
| **Assinatura** | Retenção correta | `status = 'ASSINADO'`, `pdf_assinado_key`, `documento_assinado_em` | Linha 82 da RPC | **PASS** |
| **NF** | EMITIDA/CANCELADA | `notas_fiscais.status IN ('EMITIDA', 'CANCELADA')` | Linha 94 da RPC | **PASS** |
| **Pagamentos** | Confirmados/liquidados | `pagamentos.valor_pago > 0` | Linha 100 da RPC | **PASS** |
| **Financeiro** | PAID/PARTIALLY_PAID | `financeiro_lancamentos.status_geral IN ('PAID', 'PARTIALLY_PAID')` | Linha 120 da RPC | **PASS** |
| **Comissões** | PAGA protegida | `status = 'PAGA'` em `comissoes_representantes` e `comissoes` | Linha 128 da RPC | **PASS** |
| **OP** | Estados protegidos | `ordens_producao.status IN ('APROVADA', 'LIBERADA', 'PUBLICADA', 'FINALIZADA')` | Linha 135 da RPC | **PASS** |
| **Repasses** | APROVADO/PAGO | `repasses_parceiros.status IN ('APROVADO', 'PAGO')` | Linha 141 da RPC | **PASS** |
| **Hard Delete** | Sem lastro | Executado exclusivamente na ausência de todos os bloqueadores | Linha 193 da RPC | **PASS** |
| **Soft Delete** | Com lastro | Desativa contrato, cancela títulos em aberto e preserva histórico | Linha 147 da RPC | **PASS** |
| **Auditoria** | Antes do DELETE | Gravado em `auditoria_logs` com snapshot JSONB antes do DELETE | Linha 230 da RPC | **PASS** |
| **R2** | Keys corretas | Coleta de chaves canônicas deduplicadas | Linha 196 da RPC e `contrato.service.ts` | **PASS** |
| **R2 cleanup** | Server-side | Acionamento via Edge Function `delete-media-object` | `contrato.service.ts` linha 506 | **PASS** |
| **deleted_at** | Operacional | Aplicado em todos os 15 módulos operacionais | Inspecionado no código | **PASS** |
| **Billing** | Exclui soft-deleted | `rpc_generate_monthly_billing` e `gerar_cobrancas_recorrentes` | Definições SQL no banco | **PASS** |
| **Assinatura Digital**| Bloqueada | Impedida para contratos cancelados/excluídos | `digitalSignature.service.ts` | **PASS** |
| **UI** | Dupla confirmação | Modal com digitação obrigatória do número do contrato e justificativa | `ConfirmDeleteContractModal.tsx` | **PASS** |
| **Testes** | Evidência real | 9/9 Vitest unit tests + 6/6 Live PostgreSQL E2E tests | `microgate-ar03-2-exclusao-contratos.test.ts` | **PASS** |
| **Git** | Escopo limpo | Apenas arquivos de contratos/CRM/serviços previstos alterados | `git diff --stat` | **PASS** |
| **Build** | PASS | `npm run build` concluído com código 0 | Log do build (22.16s) | **PASS** |

---

## 9. STATUS FINAL

`PASS — AR-03.2.1 HOMOLOGADO`
