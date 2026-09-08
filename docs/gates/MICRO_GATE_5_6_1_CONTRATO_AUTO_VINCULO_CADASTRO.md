# MICRO-GATE 5.6.1 — DIAGNÓSTICO FORENSE + CORREÇÃO DO VÍNCULO AUTOMÁTICO DE CONTRATOS NO CADASTRO

## 1. Baseline

| Parâmetro | Valor |
|---|---|
| **Data/Hora** | 2026-09-08T11:29:00-03:00 |
| **Branch** | `main` |
| **HEAD Inicial** | `e0c3ca28302ad40507f73d97c7c98aba2c0d9e9b` |
| **origin/main** | `e0c3ca28302ad40507f73d97c7c98aba2c0d9e9b` |
| **Sincronização** | Sincronizado (`HEAD == origin/main`) |
| **CI-01 / CI-01.1** | HOMOLOGADOS com 7 jobs verdes no GitHub Actions |

---

## 2. Diagnóstico Forense

Auditamos a cadeia de cadastro e vínculo de contratos:
`CADASTRO → escolha do tipo de cadastro → resolução do contrato/template aplicável → obtenção de template_id válido → criação/vínculo do contrato → conclusão do cadastro → persistência correta no banco`

### Respostas às 7 perguntas mandatórias:

1. **O cadastro atualmente escolhe o tipo?**
   - **Sim.** O `ClientTypeGate` (`NovoClientePage.tsx`) funciona como porta única obrigatória para `ANUNCIANTE`, `PONTO_PARCEIRO` e `GESTOR_MIDIAS`.

2. **Existe resolução automática de contrato?**
   - **Sim.** `resolveContractTypeFromCadastroType(tipo)` no `contractResolver.service.ts` mapeia:
     - `ANUNCIANTE` → `ANUNCIANTE`
     - `PONTO_PARCEIRO` / `PARCEIRO` → `PARCEIRO`
     - `GESTOR_MIDIAS` / `GESTOR` → `GESTOR`
   - E `ensureContractForCadastro` em `contrato.service.ts` resolve o template padrão via `fn_obter_template_padrao` ou `contrato_templates`.

3. **O resolver retorna um `template_id` REAL?**
   - Retorna o UUID v4 do template persistido na tabela `contrato_templates`.

4. **O contrato é criado antes da conclusão do cadastro?**
   - No fluxo de `PONTO PARCEIRO` e `GESTOR`, a criação é atômica no banco (`fn_cadastrar_ponto_parceiro_com_contrato` e `provisionar_usuario_corporativo`).
   - No fluxo de `ANUNCIANTE`, é criado via `fn_cadastrar_cliente_com_contrato` e atualizado/vinculado à proposta via `ensureContractForCadastro` no fechamento comercial.

5. **Existe algum caminho que permite: cadastro concluído → contrato inexistente?**
   - **Sim (antes da correção):** Se `params.cadastroType` recebesse um tipo desconhecido/inválido, `ensureContractForCadastro` retornava silenciosamente `{ success: true, contratoId: null }`, permitindo conclusão falsa.
   - **Sim (antes da correção):** Se um contrato existisse no banco com `template_id` nulo ou vazio, a validação não forçava a resolução de um template real com ID não-vazio.

6. **Existe algum caminho com inconsistência template vs PDF?**
   - PDFs oficiais estão disponíveis em `public/official-contracts/` (`contrato-anunciante.pdf`, `contrato-parceria.pdf`, `contrato-gestor.pdf`). Caso o banco não possua `contrato_templates` com `is_default = true`, o fallback precisa retornar erro explícito sem criar cadastro falso.

7. **Onde exatamente o vínculo era fragilizado?**
   - Em `src/modules/crm/services/contrato.service.ts`:
     - Falta de validação estrita de `templateId` não-vazio em `selectContractModel`.
     - Retorno permissivo de `success: true` para tipos de cadastro não suportados em `ensureContractForCadastro`.
     - Ausência de trava explícita para rejeitar templates sem UUID válido.

---

## 3. Causa Raiz

A causa raiz era a ausência de trava estrita de integridade em duas funções de serviço:
1. `ensureContractForCadastro` retornava `success: true` para tipos desconhecidos em vez de disparar erro explícito bloqueante.
2. `selectContractModel` não validava a presença obrigatória de `templateId` (string não-vazia), permitindo que chamadas defeituosas passassem sem template associado.

---

## 4. Correção Aplicada

Modificação cirúrgica em [`src/modules/crm/services/contrato.service.ts`](file:///c:/Users/Jairan%20Santos/Downloads/SITECODIGOSOBREMIDIA/sobremidiadesigner-main/src/modules/crm/services/contrato.service.ts):

1. **`selectContractModel`**:
   - Validação explícita no início da função:
     ```ts
     if (!payload.templateId || typeof payload.templateId !== 'string' || payload.templateId.trim() === '') {
       return { success: false, error: 'Template ID inválido ou ausente.' };
     }
     ```

2. **`ensureContractForCadastro`**:
   - Retorno explícito de erro para tipos não resolvidos:
     ```ts
     const tipo = resolveContractTypeFromCadastroType(params.cadastroType);
     if (!tipo) {
       return {
         success: false,
         contratoId: null,
         tipoContrato: null,
         error: `Tipo de cadastro inválido ou não suportado para vinculação de contrato (${String(params.cadastroType)}).`,
       };
     }
     ```
   - Verificação rigorosa de `existingContract.template_id` como string não-vazia.
   - Verificação estrita de `tpl.id` antes de invocar `selectContractModel`.

---

## 5. Contratos Oficiais

| Tipo de Contrato | Arquivo PDF | Tamanho | Public Path |
|---|---|---|---|
| **ANUNCIANTE** | `contrato-anunciante.pdf` | 390.290 bytes | `/official-contracts/contrato-anunciante.pdf` |
| **PARCEIRO** | `contrato-parceria.pdf` | 300.802 bytes | `/official-contracts/contrato-parceria.pdf` |
| **GESTOR** | `contrato-gestor.pdf` | 2.787 bytes | `/official-contracts/contrato-gestor.pdf` |

Todos os 3 PDFs oficiais existem e estão acessíveis no diretório público da aplicação.

---

## 6. Testes

### Suíte Específica: `src/tests/unit/microgate561-contrato-auto-vinculo.test.ts`
- **TESTE 1 — ANUNCIANTE**: PASS (template oficial encontrado, `template_id` válido, contrato vinculado)
- **TESTE 2 — PONTO PARCEIRO**: PASS (template parceiro encontrado, `template_id` válido, contrato vinculado)
- **TESTE 3 — GESTOR & ALIAS GESTOR_MIDIAS**: PASS (resolução de `GESTOR_MIDIAS` → `GESTOR`, contrato vinculado)
- **TESTE 4 — TEMPLATE INEXISTENTE**: PASS (retorna erro explícito, finalização bloqueada)
- **TESTE 5 — TEMPLATE ID INVÁLIDO**: PASS (rejeita templateId vazio e tipo desconhecido)
- **TESTE 6 — TENANT ISOLATION**: PASS (templates isolados por `empresa_operadora_id`)
- **TESTE 7 — REGRESSÃO & IDEMPOTÊNCIA**: PASS (contrato existente preservado com integridade)

**Resultado:** 7/7 testes PASS.

### Regressão Completa:
- `src/tests/unit/contract-auto-vinculo.test.ts`: 12/12 PASS
- `src/tests/unit/microgate56-onboarding-template-resolution.test.ts`: 12/12 PASS
- `src/tests/unit/contratos-fase2-anti-regressao.test.ts`: 13/13 PASS
- `src/tests/crm/gate1b-pontoPrecos.test.ts`: 24/24 PASS
- `src/tests/unit/prospeccao.service.test.ts`: 9/9 PASS
- `src/tests/security/prospeccao.security.test.ts`: 9/9 PASS
- **Total de Regressão:** 79/79 PASS (0 falhas)

---

## 7. Banco

- Validação das RPCs atômicas:
  - `fn_cadastrar_cliente_com_contrato` vincula `cliente_id` a `contratos` com `template_id` do tenant.
  - `fn_cadastrar_ponto_parceiro_com_contrato` vincula `ponto_id` a `contratos` com `template_id` do tenant.
  - `provisionar_usuario_corporativo` vincula `gestor_usuario_id` a `contratos` com `template_id` do tenant.

---

## 8. Escopo Negativo

Confirmado que **NENHUM** dos seguintes módulos/arquivos foi alterado ou impactado:
- Player Android / Native Player
- PWA / Service Worker
- RLS global
- Autenticação / Tokens
- Billing / PIX / Banco Inter / Financeiro
- CI/CD workflow (`.github/workflows/ci.yml`)
- `package.json` / `package-lock.json`

---

## 9. Status Final

```text
PASS LOCAL
```
