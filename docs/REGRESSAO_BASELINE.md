# REGRESSÃO — BASELINE DE SEGURANÇA

> **Documento de baseline criado por auditoria de regressão.**
> Este arquivo documenta o estado exato do projeto no momento do congelamento do baseline.
> Nenhuma alteração de código, banco, deploy ou remoto foi feita para produzir este documento além do **commit de baseline `0671f90`** (autorizado).

---

## 1. Identificação do snapshot

| Campo | Valor |
|---|---|
| Data/hora do snapshot | 2026-08-17 ~23:40 BRT (criação do commit: 23:06:43 BRT) |
| Repositório remoto | `https://github.com/daiamestre/sitesobremidia.git` |
| Branch local | `feat/central-corporativa-acessos` |
| **Commit de BASELINE** | **`0671f9092a2394d00449a385a85b8d634fe5a124`** |
| Parent do baseline | `1e7b504` (2026-08-14 16:35:11 -0300) |
| Hash curto | `0671f90` |
| Tags existentes | `v1.0.0-foundation`, `v1.0.0-governance`, `v1.0.0-security-baseline` |

## 2. Estado do remoto (verificado por `git ls-remote`)

| Ref | Hash | Observação |
|---|---|---|
| `main` | `ff6d848d5e804f5dad958a12d2261867cc323c54` | **8 dias atrás (conteúdo de 07/08)**. SEM Central de Acessos, SEM Representantes. Force-pushed (história reescrita). |
| `feat/central-corporativa-acessos` | `e8eb64ed85595f3d145eeeb865ffe5e2a7861aa3` | Contém Central de Acessos (commit reescrito `9140448`). SEM módulo Representantes. |
| `test/antigravity-account-connectivity-clean` | `43c80fa119d0591b9ba2370306147371d2576fd6` | Branch de teste. |
| `refs/pull/1/head` | `e8eb64e` | PR #1 aponta para a feat (sem o módulo Representantes). |
| `refs/pull/1/merge` | `11f7ea2225dbf356b75183cabb10531d1bba6827` | Merge do PR #1. |

> **Divergência local × remoto:** o remoto tem a MESMA história reescrita (hashes diferentes, datas idênticas).
> Local: `0671f90 → 1e7b504 → 93f352c → 885ffa8 → ...`
> Remoto: `e8eb64e → 9140448 → 9bff5e1 → 84bb640 → ...`
> O baseline `0671f90` NÃO existe no remoto. **NÃO foi feito push** (conforme regra).

## 3. Estado do working tree no momento do baseline

Após o commit `0671f90`:

- Arquivos rastreados: 195 arquivos alterados no commit de baseline (+11.734 / −5.809 linhas).
- Working tree **limpo**, exceto artefatos transitórios não commitados de propósito:
  - `_lint2.json`, `_lint3.json`, `_lint_full.json` (saídas de lint, ~9 MB, regeneráveis).

## 4. O que o commit de baseline contém (lista de alterações)

### 4.1 Módulo Representantes (gestão comercial — UNTRACKED antes do baseline)
| Arquivo | Status |
|---|---|
| `src/modules/crm/pages/RepresentantesPage.tsx` | NOVO |
| `src/modules/crm/pages/DesempenhoRepresentantesPage.tsx` | NOVO |
| `src/modules/crm/pages/RepresentanteDetalhePage.tsx` | NOVO |
| `src/services/representantesGerencia.service.ts` | NOVO |
| `src/hooks/usePermissoesRepresentantes.ts` | NOVO |
| `src/modules/crm/components/Sidebar.tsx` | ALTERADO (grupo "Comercial" + item "Representantes") |
| `src/App.tsx` | ALTERADO (rotas `/workspace/representantes`, `/workspace/representantes/desempenho`, `/workspace/representantes/:id`) |

### 4.2 Migrations de hardening e segurança (UNTRACKED antes do baseline)
| Migration | Propósito |
|---|---|
| `20260825_central_acessos_hardening.sql` | Hardening da Central de Acessos |
| `20260826_representantes_gestao_desempenho.sql` | Gestão/desempenho de representantes (RPCs + permissões `representantes.*`) |
| `20260827_player_security_hardening.sql` | Hardening do player |
| `20260828_device_identity.sql` | Identidade de dispositivos |
| `20260829_app_release_integrity.sql` | Integridade de releases do app |
| `20260901_media_network_edge_auth.sql` | Edge auth de mídia/rede |
| `20260910_foundation_closure.sql` | Fechamento de fundação |
| `20260911_close_tenant_exposure.sql` | **Fechamento de exposição cross-tenant (NÃO aplicada no banco real)** |

### 4.3 Edge functions novas
- `supabase/functions/list-media-objects/`
- `supabase/functions/delete-media-object/`

### 4.4 Evidências de auditoria (scripts + resultados)
- `scripts/cross_tenant_results.json` — **expõe P0: leitura anon aberta em 7 tabelas + comandos/updates cross-tenant aceitos**
- `scripts/redteam_results.json`, `scripts/audit_*.mjs`, `scripts/probe_remote_*.mjs`, `scripts/db_*.cjs` etc.
- Testes: `src/tests/security/central-acessos.security.test.ts`, `src/tests/security/representantes-gerencia.security.test.ts`, `src/tests/unit/representantesGerencia.service.test.ts`

### 4.5 Alterações acumuladas no working tree (FASE 10.1-B e afins)
- `src/modules/corporate/pages/UsuariosAcessosPage.tsx` (Central de Acessos — refinamentos)
- `src/modules/crm/components/*` (Cliente360Modal, NovaPropostaModal, Header, financeiro, operacao, producao, signature, portal)
- `src/modules/crm/contexts/CrmSessionContext.tsx`, `src/modules/crm/pages/RepresentativeDashboard.tsx` (removeu mock, adicionou ranking)
- `src/modules/corporate/bootstrap/CorporateBootstrap.ts`, `src/services/corporateUsers.service.ts`, `src/hooks/useRbac.ts` (estes já estavam commitados; as alterações finais foram incluídas)
- Android: deleções de `UpdateManager.kt`, `WorkScheduler.kt`, `HeartbeatWorker.kt`, `SecurityHelper.kt`, `RealtimeManager.kt` com substitutos já presentes (refactor, não regressão)

### 4.6 Deleções (intencionais, verificadas)
- `.temp_playlist_items.js`, `.temp_query.js` (arquivos temporários)
- `dev-dist/sw.js`, `dev-dist/workbox-ca84f546.js` (artefatos de build)

## 5. Estado da produção (verificado por auditoria runtime em 17/08 ~22:50 BRT)

| Aspecto | Valor |
|---|---|
| URL | `https://sitesobremidia.vercel.app` |
| Deploy atual | `dpl_BWhhuXAgHQxmXB6JYqj75yVtL2gY` / `sitesobremidia-mn5sfyrz8` — criado **17/08/2026 15:07 BRT** por `daiamestre` (CLI, sem metadados git) |
| Representantes (gestão) | **PRESENTE e FUNCIONAL** (verificado com sessão OWNER real: lista, desempenho, ranking, detalhe) |
| Central de Acessos | **PRESENTE e FUNCIONAL** (21 usuários, permissões, modal Autonomia) |
| Rotas | 105 rotas idênticas ao working tree local (diff 0) |
| Deploy anterior | 14/08/2026 13:17 BRT (`sitesobremidia-oxg6lg3o4`, conteúdo não verificável — URL protegida) |

## 6. Cadeia de eventos da regressão (linha do tempo)

| Data | Evento | Efeito |
|---|---|---|
| 07/08 | Último commit de `main` (remoto `ff6d848`) | main sem Central e sem Representantes |
| 14/08 13:17 | Deploy produção (3d) | sem evidência de conteúdo |
| 14/08 16:28 | Commit `93f352c` — Central de Acessos | commitado; remoto reescrito como `9140448`/`e8eb64e` (force-push) |
| 14–17/08 | Trabalho contínuo SEM commits (FASE 10.1-B, Representantes) | módulo existe só no working tree |
| 17/08 15:07 | Deploy produção atual (CLI upload) | produção passa a conter Representantes + Central |
| 17/08 20:59 | Stashes órfãos (`8aeb1cc`, `e96d6f9`) — conteúdo = deleções staged | nada perdido |
| 17/08 22:21 | `cross_tenant_results.json` — exposição P0 confirmada | migration 20260911 não aplicada |
| 17/08 23:06 | **Commit de baseline `0671f90`** | módulo Representantes + migrations + evidências congelados no git |

## 7. Riscos registrados (não mitigados nesta fase)

1. **Produção não corresponde a nenhum ref git** — o próximo deploy via GitHub/CI pode recuar o site para `ff6d848` (perde Central + Representantes) ou `e8eb64e` (perde Representantes).
2. `main` remota desatualizada (07/08) — qualquer merge/PR baseado nela é regressão potencial.
3. Migration `20260911` (exposição cross-tenant) **não aplicada** no banco real — P0 de segurança.
4. History remoto reescrito (force-push) — divergência de hashes local × remoto.
5. Migration `20260826` aplicada parcialmente no banco (grants divergentes do arquivo — evidência por probes).

## 8. Verificação de integridade do baseline

- `git fsck` executado: somente objetos unreachable = versões reescritas da mesma história (mesmas mensagens/datas), sem conteúdo adicional perdido.
- Reflog vazio; 2 stashes órfãos inspecionados (sem conteúdo relevante).
- `npm run build` (17/08 20:57 e re-executado na auditoria): OK.
- `tsc --noEmit`: 0 erros.
- `vitest run`: 400/400 testes passando (2ª execução; 1ª teve 3 flaky).
- Lint: erros pré-existentes no repo (226; 749 arquivos), **zero introduzidos pelo baseline** (módulo Representantes: 0 erros).
- Runtime em produção: menus, rotas, listas, ranking, desempenho, Central de Acessos e modal de Autonomia verificados com sessão OWNER real (Playwright, screenshots em `Temp/opencode/probe_runtime/`).

---

*Documento gerado em 2026-08-17. Próxima ação recomendada: revisão humana e autorização para alinhamento de branches/deploy.*