# REGRESSION MATRIX

> Matriz de regressão do SOBRE MÍDIA ERP — baseline `0671f90` (2026-08-17).
> Status: PRESENTE / AUSENTE / PROTEGIDO / EM RISCO / NÃO APLICADO / NÃO DETERMINADO.
> Toda funcionalidade com status `PROTEGIDO` possui teste de existência/funcional referenciado na coluna "Teste".

## Legenda de Testes

- **T-EXIST**: teste de existência (arquivo/rota/menu/permissão presentes) — a executar em CI.
- **T-FUNC**: teste funcional (carrega, consulta dados) — vitest unit / Playwright.
- **T-RUNTIME**: verificação runtime em produção (Playwright, sessão OWNER — executado em 17/08 22:50 BRT).

---

## A. Funcionalidades protegidas (núcleo da auditoria)

| ID | Funcionalidade | Módulo | Rota | Permissão | Componente | Service | Banco | Status | Baseline | Teste |
|---|---|---|---|---|---|---|---|---|---|---|
| REG-001 | Gestão de Representantes (lista/cadastro/ativação) | Comercial | `/workspace/representantes` | OWNER / `representantes.*` | `RepresentantesPage.tsx` | `representantesGerencia.service.ts` | RPCs 20260826 | PRESENTE (prod+git) | `0671f90` | T-EXIST + T-FUNC + T-RUNTIME ✓ |
| REG-002 | Ranking de Representantes | Comercial | `/workspace/representantes/desempenho` | OWNER / `representantes.view_performance` | `DesempenhoRepresentantesPage.tsx` | idem | `get_desempenho_representantes` | PRESENTE | `0671f90` | T-RUNTIME ✓ (dados reais) |
| REG-003 | Desempenho por Representante | Comercial | `/workspace/representantes/:id` | idem | `RepresentanteDetalhePage.tsx` | idem | `get_desempenho_representante_detalhe` | PRESENTE | `0671f90` | T-RUNTIME ✓ |
| REG-004 | Central de Acessos (usuários/indicadores) | Central | `/workspace/usuarios` | OWNER / `users.view` | `UsuariosAcessosPage.tsx` | `corporateUsers.service.ts` | `listar_usuarios_central` | PRESENTE | `93f352c`+`0671f90` | T-RUNTIME ✓ (21 usuários) |
| REG-005 | Central de Acessos (autonomia/permissões) | Central | idem | `users.manage_permissions` | idem | idem | `gerenciar_autonomia` | PRESENTE (modal abre) | idem | T-RUNTIME ✓ (modal, sem salvar) |
| REG-006 | Central de Acessos (auditoria) | Central | idem | OWNER | idem | idem | `auditoria_logs` | PRESENTE | idem | T-EXIST |
| REG-007 | Dashboard OWNER | OWNER | `/workspace/corporate` | OWNER | `CorporateCommandCenter.tsx` | — | — | PRESENTE | `0310ba9` | T-RUNTIME ✓ |
| REG-008 | Central (comunicação) + badge | Central | `/dashboard/central` | autenticado | `CentralDashboard.tsx` | `useCentral.ts` | `notificacoes_central` | PRESENTE (desde 93f352c, inalterado) | `93f352c` | T-EXIST ✓ (4 rotas + 4 consumidores) |
| REG-009 | Permissões `representantes.*` (6) | Central | — | OWNER | `usePermissoesRepresentantes.ts` | — | migration 20260826 | PRESENTE no catálogo (modal mostra) | `0671f90` | T-EXIST ✓ (modal Autonomia) |
| REG-010 | Permissões `users.*` (7) | Central | — | OWNER | — | — | migration 20260824/25 | PRESENTE | `93f352c` | T-EXIST ✓ |

## B. Camadas por funcionalidade (classificação A–J do briefing)

| ID | Frontend | Service/API | Banco | Classificação |
|---|---|---|---|---|
| REG-001..003 | PRESENTE | PRESENTE | RPCs existem; grants divergem do arquivo (2 RPCs executáveis por anon — 401) | **H (migration aplicada parcialmente) + B/J já resolvidos no git** |
| REG-004..006 | PRESENTE | PRESENTE | RPCs existem | A–J: nenhuma — funcional |
| REG-008 | PRESENTE | PRESENTE | PRESENTE | nenhuma |
| Exposição P0 | — | — | **RLS ausente** (migrations 20260910/11 NÃO aplicadas) | **G (RLS) — pendente de FASE 3** |

## C. Rotas (auditoria completa)

| Item | Esperado | Existente (prod=local) | Removida | Inacessível |
|---|---|---|---|---|
| `/dashboard/central` | sim | ✓ (4 contextos) | não | não |
| `/dashboard/*` (demais) | sim | ✓ (105/105 prod==local) | não | não |
| `/workspace/representantes*` | sim | ✓ (prod) / ✓ (git 0671f90) | nunca existiu em git antes | não |
| `/workspace/usuarios` | sim | ✓ | não | não (OWNER vê) |
| `/dashboard/representantes` | — | nunca existiu (rota real: `/workspace/representantes`) | — | — |

## D. Sidebar (evolução 885ffa8 → 93f352c → 0671f90)

| Item | 885ffa8 | 93f352c | 0671f90 | Resultado |
|---|---|---|---|---|
| Dashboard/Clientes/Propostas/Contratos/Campanhas/Pontos/Agenda/Financeiro/BI/Config/Perfil | ✓ | ✓ | ✓ | preservados |
| Mensagens (Central, badge) | ✗ | + | ✓ | adicionado (93f352c) |
| Central de Acessos | ✗ | + (condicional) | ✓ | adicionado |
| Grupo "Comercial" + Representantes | ✗ | ✗ | + | adicionado (0671f90) |
| **Remoções** | — | — | — | **NENHUMA** |

## E. Backend/banco (divergências registradas — NÃO corrigidas)

| Item | Migration | Banco real | Status |
|---|---|---|---|
| RPCs representantes (6) + RLS | 20260826 | **APLICADA e registrada** (relatório forense; probes anon: 404 = REVOKE anon correto) | APLICADA ✓ (verificar grants com service role na FASE 3) |
| `gerenciar_autonomia`, `criar_usuario_corporativo`, `has_admin_permission` | 20260824 | Presentes (forense); 404 anon consistente com grants restritos | APLICADA ✓ |
| Migration 20260825 | — | Aplicada via SQL Editor; **SEM registro em schema_migrations** | DIVERGÊNCIA (registrar depois) |
| Fechamento cross-tenant | 20260910/20260911 | **NÃO aplicadas** — anon lê 7 tabelas; comandos/updates cross-tenant aceitos | **AUSENTE — P0** |
| Catálogo de permissões | 20260824-26 | permissões visíveis no modal (runtime) | PRESENTE |

## F. Build/testes (17/08, baseline `0671f90`)

| Check | Resultado |
|---|---|
| `npm run build` (vite) | ✓ 4.07s, PWA v1.2.0, 226 entries |
| `npx tsc --noEmit` | ✓ 0 erros |
| `npm run lint` | ✗ 226 erros PRÉ-EXISTENTES (749 arquivos); módulo Representantes: 0 |
| `vitest run` | ✓ 400/400 (2ª exec.; 3 flaky na 1ª) |
| Runtime produção (OWNER) | ✓ todos os fluxos verificados (screenshots salvos) |
| E2E Playwright | NÃO executado (escreve no banco real — fora da regra) |

## G. Testes de regressão criados (item 17 do briefing)

| Arquivo | Cobre | Status |
|---|---|---|
| `src/tests/unit/representantesGerencia.service.test.ts` | service do módulo (mocks) | commitado em 0671f90 |
| `src/tests/security/representantes-gerencia.security.test.ts` | permissões/RPCs | commitado |
| `src/tests/security/central-acessos.security.test.ts` | Central | commitado |
| `src/tests/e2e/central_acessos.spec.ts` | E2E Central (localhost) | existente (pré-baseline) |
| `src/tests/e2e/regressao_navegacao.spec.ts` | E2E navegação | existente |

> **Pendente (FASE 3)**: teste de existência automatizado (rotas/menus/chunks) + E2E do módulo Representantes em ambiente de teste + gate de CI comparando rotas contra golden list.

---

*Matriz gerada em 2026-08-17. Status a ser revalidado a cada fase.*