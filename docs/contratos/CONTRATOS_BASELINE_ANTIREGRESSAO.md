# BASELINE TÉCNICO OFICIAL DE ANTIRREGRESSÃO — MÓDULO DE CONTRATOS
**SOBRE MÍDIA — CANONICAL GOVERNANCE & ARCHITECTURAL BASELINE**
*Data de Homologação:* 2026-09-05 | *Versão do Baseline:* 1.0.0 | *Gate de Origem:* MICRO-GATE AR-01

---

## 1. OBJETIVO E REGRA SUPREMA

Este documento estabelece o **Baseline Técnico Oficial e Permanente de Antirregressão** de todo o módulo de CONTRATOS do SOBRE MÍDIA. Toda evolução futura no sistema de templates, contratos aplicados, onboarding, assinaturas, renderização de documentos ou armazenamento em nuvem deve respeitar integralmente as estruturas, fluxos e garantias aqui homologados.

> **REGRA CENTRAL:**
> Nenhuma funcionalidade futura poderá quebrar:
> 1. Criação de modelos via RPC server-side;
> 2. Versionamento atômico e incremental;
> 3. Resolução canônica de templates por tipo de cadastro;
> 4. Contratos aplicados e isolamento de instâncias;
> 5. Snapshots imutáveis de dados e HTML (`contrato_versoes`);
> 6. Blindagem de RLS e isolamento multi-tenant (`empresa_operadora_id`);
> 7. Armazenamento e download de PDFs no Cloudflare R2;
> 8. Integração atômica com os formulários de cadastro/onboarding.

---

## 2. ARQUITETURA DO BANCO DE DADOS (POSTGRESQL)

O módulo de contratos é suportado por 5 tabelas centrais, 11 funções/RPCs e policies RLS dedicadas no schema `public`.

### 2.1 Mapeamento das Tabelas

#### A. `public.contrato_templates` (Modelos / Templates)
* **Finalidade:** Armazena os modelos canônicos e personalizados de contratos.
* **Chave Primária (PK):** `id` (`uuid`, default: `gen_random_uuid()`)
* **Chaves Estrangeiras (FK):**
  * `empresa_operadora_id` $\rightarrow$ `empresas_operadoras(id)` (ON DELETE CASCADE)
* **Campos Relevantes:**
  * `tipo_contrato` (`text`, NOT NULL, CHECK: `'ANUNCIANTE'`, `'PARCEIRO'`, `'GESTOR'`)
  * `codigo_template` (`text`, NOT NULL)
  * `nome` (`text`, NOT NULL)
  * `descricao` (`text`)
  * `versao` (`integer`, NOT NULL, default: `1`)
  * `conteudo_html` (`text`, NOT NULL)
  * `ativo` (`boolean`, NOT NULL, default: `true`)
  * `is_default` (`boolean`, NOT NULL, default: `false`)
  * `pdf_anexo_key` (`text`)
  * `created_at` / `updated_at` (`timestamptz`)
* **Índices & Unicidade:**
  * `idx_contrato_templates_tipo_codigo_versao` (UNIQUE: `empresa_operadora_id`, `tipo_contrato`, `codigo_template`, `versao`)
  * `idx_contrato_templates_default_global` (UNIQUE partial: `tipo_contrato` WHERE `empresa_operadora_id IS NULL AND is_default = true`)
  * `idx_contrato_templates_default_tenant` (UNIQUE partial: `empresa_operadora_id`, `tipo_contrato` WHERE `is_default = true`)
* **Triggers de Proteção:**
  * `trg_proteger_contrato_template_aplicado` (BEFORE UPDATE OR DELETE $\rightarrow$ executa `fn_trg_proteger_contrato_template_aplicado()`)
* **RLS Policies:**
  * `p_read_contrato_templates` (SELECT para `authenticated` WHERE `empresa_operadora_id IS NULL OR empresa_operadora_id = get_user_empresa_operadora_id(auth.uid()) OR is_owner()`)
  * **Zero Direct INSERT/UPDATE Policies:** Escritas bloqueadas diretamente para `authenticated`, canalizadas exclusivamente via RPCs `SECURITY DEFINER`.

#### B. `public.contratos` (Contratos Aplicados / Instâncias)
* **Finalidade:** Instâncias reais de contratos vinculadas a clientes, pontos parceiros ou gestores.
* **PK:** `id` (`uuid`, default: `gen_random_uuid()`)
* **FKs:**
  * `empresa_operadora_id` $\rightarrow$ `empresas_operadoras(id)`
  * `template_id` $\rightarrow$ `contrato_templates(id)`
  * `cliente_id` $\rightarrow$ `clientes(id)`
  * `empresa_id` $\rightarrow$ `empresas(id)`
  * `ponto_id` $\rightarrow$ `pontos(id)`
  * `gestor_usuario_id` $\rightarrow$ `usuarios(id)`
  * `proposta_id` $\rightarrow$ `propostas(id)`
  * `usuario_responsavel_id` $\rightarrow$ `usuarios(id)`
* **Campos Relevantes:**
  * `numero_contrato` (`text`, NOT NULL, UNIQUE)
  * `tipo_contrato` (`text`, NOT NULL)
  * `template_versao` (`integer`, NOT NULL, default: `1`)
  * `versao_atual` (`integer`, NOT NULL, default: `1`)
  * `status` (`text`, NOT NULL, default: `'RASCUNHO'`, CHECK: `'RASCUNHO'`, `'PENDENTE_ASSINATURA'`, `'VIGENTE'`, `'CANCELADO'`, `'RENOVADO'`, `'SUSPENSO'`, `'EXPIRADO'`)
  * `valor_total` / `valor_mensal` (`numeric(12,2)`)
  * `data_inicio` / `data_fim` (`date`)
  * `total_telas_contratadas` (`integer`)
  * `documento_r2_key` (`text`)
  * `assinatura_data` (`timestamptz`), `assinatura_ip` (`text`), `assinatura_hash` (`text`)
* **RLS Policies:**
  * `contratos_tenant_select` / `contratos_tenant_insert` / `contratos_tenant_update` (filtradas pelo tenant do usuário via `get_user_empresa_operadora_id(auth.uid())` ou `is_owner()`).

#### C. `public.contrato_versoes` (Snapshots Históricos Imutáveis)
* **Finalidade:** Armazena a fotografia imutável de cada versão gerada do contrato.
* **PK:** `id` (`uuid`, default: `gen_random_uuid()`)
* **FKs:**
  * `contrato_id` $\rightarrow$ `contratos(id)` (ON DELETE CASCADE)
* **Campos Relevantes:**
  * `versao` (`integer`, NOT NULL)
  * `html_renderizado` (`text`, NOT NULL)
  * `document_hash` (`text`, NOT NULL - SHA-256)
  * `snapshot_dados` (`jsonb`, NOT NULL - contém `dados_template`, `placeholders`, `valores_comerciais`)
  * `pdf_object_key` (`text` - caminho Cloudflare R2)
  * `motivo_alteracao` (`text`)
  * `created_at` (`timestamptz`, default: `now()`)
* **Unicidade:** `UNIQUE(contrato_id, versao)`

#### D. `public.contrato_auditoria` (Trilha de Auditoria Forense)
* **Finalidade:** Registro de todas as mutações e eventos de ciclo de vida (criação, edição, assinatura, cancelamento).
* **PK:** `id` (`uuid`)
* **Campos:** `contrato_id`, `usuario_id`, `acao`, `dados_anteriores`, `dados_novos`, `ip_origem`, `user_agent`, `created_at`.

#### E. `public.itens_contrato` (Composição Comercial dos Pontos)
* **Finalidade:** Lista de telas/pontos físicos inclusos no contrato comercial.
* **PK:** `id` (`uuid`)
* **FKs:** `contrato_id` $\rightarrow$ `contratos(id)`, `ponto_id` $\rightarrow$ `pontos(id)`.

---

### 2.2 Inventário de Funções e RPCs do Módulo

| Função / RPC | Tipo | Security | Finalidade |
| :--- | :---: | :---: | :--- |
| `fn_criar_modelo_contrato_template` | FUNCTION | `DEFINER` | Cria novos templates com validação RBAC (`OWNER`/`ADMIN`/`contracts.manage`), isolamento multi-tenant e advisory lock. |
| `fn_criar_nova_versao_contrato_template` | FUNCTION | `DEFINER` | Cria nova versão incremental de template de forma atômica, preservando templates em uso. |
| `fn_definir_contrato_template_padrao` | FUNCTION | `DEFINER` | Alterna o template padrão (`is_default = true`) de forma atômica por tenant/tipo. |
| `fn_trg_proteger_contrato_template_aplicado` | FUNCTION | `DEFINER` | Trigger function que lança exceção `55000` se houver tentativa de mutação/remoção em template já vinculado a contrato. |
| `fn_obter_template_padrao` | FUNCTION | `DEFINER` | Obtém o template default para um determinado tipo de contrato e tenant. |
| `fn_gerar_numero_contrato_atomo` | FUNCTION | `DEFINER` | Gera numeração sequencial atômica (`CTR-YYYY-XXXX`). |
| `fn_assinar_contrato` | FUNCTION | `DEFINER` | Registra assinatura digital (drawn/typed), hash SHA-256, metadados e avança status para `VIGENTE`. |
| `fn_cadastrar_cliente_com_contrato` | FUNCTION | `DEFINER` | Cadastro atômico de anunciante + criação de contrato inicial em transação única. |
| `fn_cadastrar_ponto_parceiro_com_contrato` | FUNCTION | `DEFINER` | Cadastro atômico de ponto parceiro + criação de contrato de parceria em transação única. |
| `criar_contrato_onboarding` | FUNCTION | `DEFINER` | Criação automática de contrato durante provisioning de gestor/parceiro. |
| `can_read_contrato` | FUNCTION | `DEFINER` | Helper de checagem de permissão de leitura de contratos por perfil/entidade. |

---

## 3. FLUXO REAL HOMOLOGADO DE CRIAÇÃO DE TEMPLATES (PRODUÇÃO)

O fluxo de criação de templates na área administrativa foi homologado com sucesso no Gate 5.5.2 e segue estritamente a cadeia:

```text
[UI] /workspace/admin/contratos (ContratosAdminPage.tsx)
   ↓ Clique em "Salvar Modelo de Contrato"
[HANDLER] handleSalvarNovoModelo()
   ↓ Validação de placeholders legíveis
[SERVICE] ContratoModelosAdminService.criarModelo()
   ↓ Invocação segura via Supabase RPC
[POSTGREST] POST https://bhwsybgsyvvhqtkdqozb.supabase.co/rest/v1/rpc/fn_criar_modelo_contrato_template
   ↓ Execução no PostgreSQL com SECURITY DEFINER
[POSTGRESQL] Valida auth.uid(), autorização (is_owner/ADMIN), escopo de tenant, insere em contrato_templates
   ↓ Retorno JSON
[RESPOSTA] { success: true, template_id: "<UUID>", id: "<UUID>", versao: 1, ... }
   ↓ Atualização de Estado
[UI] Toast "Modelo Criado!" + Inclusão na lista + Fechamento do Modal
```

> **PROTEÇÃO CRÍTICA (Incidente 5.5.1):**
> O frontend **JAMAIS** deve tentar realizar `supabase.from('contrato_templates').insert(...)`.
> O teste unitário `CT-054-RPC-01` em [microgate054-criar-modelo-rpc.test.ts](file:///c:/Users/Jairan%20Santos/Downloads/SITECODIGOSOBREMIDIA/sobremidiadesigner-main/src/tests/unit/microgate054-criar-modelo-rpc.test.ts) possui asserção explícita de que `supabase.from()` **nunca** é chamado.

---

## 4. FLUXO DE VERSIONAMENTO E IMUTABILIDADE

### 4.1 Criação de Nova Versão (`fn_criar_nova_versao_contrato_template`)
1. Adquire `pg_advisory_xact_lock(hashtext(p_template_id::text))` para proteção concorrente N+1.
2. Consulta o template atual e o número de contratos vinculados na tabela `contratos`:
   * **Se contagem = 0:** O template é considerado rascunho. O PostgreSQL atualiza o registro existente no local (`UPDATE`), mantendo a versão atual.
   * **Se contagem > 0:** O template está em uso histórico. O PostgreSQL insere uma **nova linha** com `versao = versao_atual + 1`, gerando um novo `id` (UUID), copiando dados base e definindo `is_default = true`. O template antigo permanece intacto com seu `id` e `versao` anteriores.

### 4.2 Blindagem por Trigger (`trg_proteger_contrato_template_aplicado`)
Se qualquer processo tentar executar `UPDATE` de conteúdo ou `DELETE` direto em um template que já possua contratos em `contratos(template_id)`, a trigger rejeita a operação com código de erro PostgreSQL `55000`:
```text
ERROR 55000: Template de contrato <ID> está vinculado a contratos aplicados e não pode ser modificado diretamente. Crie uma nova versão.
```

### 4.3 Snapshot em `contrato_versoes`
Ao gerar ou aplicar um contrato, o sistema grava em `public.contrato_versoes`:
* `html_renderizado`: HTML final completo com todos os dados preenchidos;
* `document_hash`: Assinatura criptográfica SHA-256 do documento;
* `snapshot_dados`: JSON com todos os valores de variáveis, campos de negócio e precificação daquele instante;
* `pdf_object_key`: Chave do documento gerado no R2.

---

## 5. RESOLUÇÃO DE CONTRATOS E PONTOS DE ENTRADA

### 5.1 Resolução Central (`contractResolver.service.ts`)
* `ANUNCIANTE` $\rightarrow$ Tipo: `ANUNCIANTE` | PDF Base: `contrato-anunciante.pdf`
* `PONTO_PARCEIRO` / `PARCEIRO` $\rightarrow$ Tipo: `PARCEIRO` | PDF Base: `contrato-parceria.pdf`
* `GESTOR_MIDIAS` / `GESTOR` $\rightarrow$ Tipo: `GESTOR` | PDF Base: `contrato-gestor.pdf`

### 5.2 Mapeamento dos Cadastros

| Entidade | Ponto de Entrada (UI) | Service Responsável | RPC / Operação no Banco | Retorno ao Frontend |
| :--- | :--- | :--- | :--- | :--- |
| **Anunciante** | `NovoClienteWizardPage.tsx` | `cliente.service.ts` (`create`) | `fn_cadastrar_cliente_com_contrato` | `{ success: true, clienteId, contratoId }` |
| **Ponto Parceiro** | `PontoParceiroWizardPage.tsx` | `prospeccao.service.ts` (`criarPontoParceiro`) | `fn_cadastrar_ponto_parceiro_com_contrato` | `{ id, codigo_publico, contrato_id }` |
| **Gestor de Mídias**| `GestorMidiiasProspeccaoPage.tsx` | `prospeccao.service.ts` (`provisionarGestor`) | `criar_contrato_onboarding` | `{ email, senha_inicial, contrato_id }` |

---

## 6. GERAÇÃO DE DOCUMENTOS, PDF E CLOUDFLARE R2

* **Geração Vetorial:** Mecanismos baseados em `jsPDF` e `html2canvas` integrados em `contratoDocumento.service.ts` e `contratoPdfDownload.service.ts`.
* **Padrão Canônico de Chave R2 (Object Key):**
  `tenants/{tenant_id}/contratos/{contrato_id}/v{versao}/contrato_{numero_contrato}.pdf`
* **Download Seguro:** O frontend **nunca** armazena credenciais R2. O download utiliza a Edge Function `get-download-url`, que autentica o usuário via JWT e gera uma presigned URL temporária.

---

## 7. MATRIZ DE BASELINE ANTIRREGRESSÃO

| Área | Estrutura | Caminho / Artefato | Estado | Evidência | Proteção |
| :--- | :--- | :--- | :---: | :--- | :---: |
| **Template** | `contrato_templates` | `ContratoModelosAdminService.criarModelo` | `HOMOLOGADO` | Invocação RPC testada na Vercel e DB | `CRÍTICA` |
| **RPC** | `fn_criar_modelo...` | PostgreSQL `public` | `HOMOLOGADO` | Retorna UUID, lock atômico, multi-tenant | `CRÍTICA` |
| **Versionamento**| `fn_criar_nova_versao...`| PostgreSQL `public` | `HOMOLOGADO` | Advisory lock, incremento atômico | `CRÍTICA` |
| **Imutabilidade**| `trg_proteger_...` | PostgreSQL trigger | `HOMOLOGADO` | Bloqueia mutação retroativa (código 55000) | `CRÍTICA` |
| **Contratos** | `contratos` | Instâncias de contratos aplicados | `FUNCIONAL` | Vinculação com clientes, pontos e gestores | `CRÍTICA` |
| **Snapshots** | `contrato_versoes` | Snapshot JSONB + HTML + SHA256 | `FUNCIONAL` | Tabela com integridade referencial ativa | `CRÍTICA` |
| **RLS** | Policies PostgreSQL | `p_read_contrato_templates`, etc. | `HOMOLOGADO` | Direct insert bloqueado, leitura filtrada | `CRÍTICA` |
| **R2 / Edge** | Cloudflare R2 | Edge Function `get-download-url` | `FUNCIONAL` | Presigned URL sem expor credenciais | `CRÍTICA` |
| **Resolver** | `contractResolver.service`| Tipos de Cadastro $\rightarrow$ Contrato | `HOMOLOGADO` | Resolução determinística | `CRÍTICA` |
| **Cadastro Anunciante**| `NovoClienteWizardPage`| `fn_cadastrar_cliente_com_contrato` | `FUNCIONAL` | Criação atômica cliente + contrato | `CRÍTICA` |
| **Cadastro Parceiro**| `PontoParceiroWizardPage`| `fn_cadastrar_ponto_parceiro_com_contrato`| `FUNCIONAL` | Criação atômica ponto + contrato | `CRÍTICA` |
| **Provisionamento Gestor**| `GestorMidiias...` | `provisionarGestor` | `FUNCIONAL` | Provisionamento de acesso + contrato | `CRÍTICA` |
| **Editor** | `ReadableContractEditor` | Editor 2 colunas com 55 tokens | `HOMOLOGADO` | Termos em português, drag-and-drop | `ALTA` |
| **Produção Vercel**| Deploy Vercel | Chunk `ContratosAdminPage-CF92KrTv.js` | `HOMOLOGADO` | Commit `2a9e310` ativo em `origin/main` | `CRÍTICA` |

---

## 8. REGISTRO FORENSE DE ACHADOS E LACUNAS (SEM ALTERAÇÃO NESTE GATE)

1. **[ACHADO-01 — Fallback no Client-side em `criarNovaVersao`]:**
   * *Descrição:* No arquivo `contratoModelosAdmin.service.ts`, após a chamada da RPC `fn_criar_nova_versao_contrato_template`, há um bloco de fallback com `.from('contrato_templates').update(...)` e `.insert(...)`.
   * *Classificação:* `RISCO`
   * *Impacto:* Em produção a RPC sempre executa; caso a RPC falhe, o fallback direto é rejeitado pelo RLS (42501). Esse bloco é redundante em produção, existindo apenas para testes unitários com mock local.
2. **[ACHADO-02 — Toggle Ativo sem RPC dedicada]:**
   * *Descrição:* A função `toggleAtivo` em `contratoModelosAdmin.service.ts` realiza `.from('contrato_templates').update(...)`.
   * *Classificação:* `ACHADO`
   * *Impacto:* Como `contrato_templates` não possui policy de UPDATE para usuários autenticados comuns, a ativação/desativação de modelos só funciona para `service_role` ou precisa de uma RPC `fn_toggle_contrato_template_ativo`.
3. **[ACHADO-03 — Integração de Mídia e Tabelas de Preço em Propostas]:**
   * *Descrição:* A vinculação de múltiplos pontos de exibição e cálculo automático de tabela de preços é feita em `propostas` e repassada via snapshot, mas a tabela `itens_contrato` nem sempre é populada em cadastros rápidos sem proposta formal.
   * *Classificação:* `PARCIAL`
   * *Impacto:* Contratos rápidos de anunciante geram valor global sem detalhamento individual de cada tela em `itens_contrato`.

---

## 9. INVENTÁRIO DE TESTES AUTOMATIZADOS

| Arquivo de Teste | Quantidade | Foco |
| :--- | :---: | :--- |
| `src/tests/unit/microgate054-criar-modelo-rpc.test.ts` | 4 | Invocação segura via RPC, parâmetros normalizados, bloqueio de placeholders desconhecidos, garantia antirregressão contra direct insert. |
| `src/tests/unit/microgate55-integracao-template-contrato.test.ts` | 3 | Integração template $\rightarrow$ contrato $\rightarrow$ documento $\rightarrow$ snapshot. |
| `src/tests/unit/microgate0542-editor-fullscreen.test.ts` | 10 | Layout fullscreen, 2 colunas, catálogo de 55 tokens legíveis. |
| `src/tests/unit/contratos-gestao-oficial.test.ts` | 10 | Sanitização de HTML, templates canônicos, badges em português. |
| `src/tests/unit/ReadableContractEditorVisual.test.ts` | 9 | Conversão bidirecional Visual $\leftrightarrow$ Canônico. |
| `src/tests/crm/gate51-contratosAdmin.test.ts` | 8 | Operações administrativas de contratos, definição de padrão e versionamento. |
| `src/tests/crm/gate4-cadastroContratoAtomico.test.ts` | 12 | Atomicidade no cadastro de anunciante e parceiro com contrato. |
| `src/tests/crm/gate41-gestorContratoAtomico.test.ts` | 6 | Provisionamento e vinculação de contrato para gestor de mídias. |
| **Total de Testes do Módulo de Contratos** | **62+** | **100% PASS** |

---
*Persistido e homologado em 2026-09-05 — Baseline Antirregressão SOBRE MÍDIA (MICRO-GATE AR-01).*
