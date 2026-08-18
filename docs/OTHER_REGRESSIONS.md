# OUTRAS REGRESSÕES E DIVERGÊNCIAS — SOBRE MÍDIA PLATFORM

**Fase 3 — auditoria (somente leitura) · baseline `0671f90` · 2026-08-18**

Auditoria global além dos sintomas Cent
ral de Acessos / Representantes. Nada foi corrigido.

---

## 1. BANCO × GIT — MIGRATIONS (P0 / ALTA)

| Migration | No Git (0671f90) | No banco (schema_migrations) | Situação |
|---|---|---|---|
| `20260825_central_acessos_hardening` | ✅ | ❌ **não registrada** (aplicada manualmente) | **DIVERGÊNCIA** — `db push` futuro pode conflitar |
| `20260826_representantes_gestao_desempenho` | ✅ | ✅ registrada (RPCs + RLS presentes) | ✅ consistente |
| `20260827_player_security_hardening` | ✅ | ❌ NÃO aplicada | ⚠️ pendente |
| `20260828_device_identity` | ✅ | ❌ NÃO aplicada | ⚠️ pendente |
| `20260829_app_release_integrity` | ✅ | ❌ NÃO aplicada | ⚠️ pendente |
| `20260901_media_network_edge_auth` | ✅ | ❌ NÃO aplicada | ⚠️ pendente |
| `20260910_foundation_closure` | ✅ | ❌ NÃO aplicada | ⚠️ pendente |
| `20260911_close_tenant_exposure` | ✅ | ❌ NÃO aplicada | **P0 — exposição cross-tenant ativa** |

**Evidência:** probe `SELECT version FROM supabase_migrations.schema_migrations` →
mais recente registrada é `20260826`.

**Probes de schema confirmando:** `screens.last_heartbeat` ❌, `devices.screen_id` ❌,
`app_releases.sha256` ❌, `players.name` ❌, `widgets.type` ❌ — todas colunas que as
migrations pendentes criariam.

---

## 2. EXPOSIÇÃO CROSS-TENANT ATIVA NO BANCO REAL (P0)

Policies atualmente ativas com `qual = true` (leitura global):

| Tabela | Policy | cmd | qual |
|---|---|---|---|
| `media` | `Allow authenticated read` | SELECT | true |
| `media` | `Permitir leitura anon/auth para media` | SELECT | true |
| `media` | `Public read access` | SELECT | true |
| `playlists` | `Allow authenticated read` / `Public read access` | SELECT | true |
| `playlist_items` | `Allow authenticated read` / `Public read access` | SELECT | true |
| `widgets` | `Permitir leitura anon/auth para widgets` | SELECT | true |
| `devices` | `safe_heartbeat_update_devices` | UPDATE | true (with_check true) |

A migration `20260911` (1269 linhas, P0) foi escrita exatamente para fechar isso
(producoes/agendamentos/portal/mobile/DW + `p_read_* USING(TRUE)` legadas) — **não aplicada**.

---

## 3. HISTÓRIAS GIT PARALELAS (ALTA)

| Ref | Commits | HEAD | Conteúdo |
|---|---|---|---|
| Local `feat/central-corporativa-acessos` | 171 | `0671f90` (17/08) | **superset: tudo + Representantes + migrations + docs** |
| Remoto `origin/feat/central-corporativa-acessos` | 176 | `e8eb64e` (14/08) | espelho de `1e7b504`; 9 arquivos exclusivos (5 Android deletados + 4 temporários) |
| `main` local | — | `885ffa8` (13/08) | sem Central/Representantes |
| `origin/main` | — | `ff6d848` (07/08) | mais atrasado; CI/deploy rodam aqui |

- Merge-base: `4e4b887` (antigo) — histórias reescritas com hashes diferentes.
- 46 arquivos só no local (Representantes, migrations, docs, testes, scripts).
- 9 arquivos só no remoto (deletes Android + temporários).

**Risco:** `push --force`, rebase ou merge cego pode destruir o lado com 46 arquivos.

---

## 4. ANDROID (separado do ERP — registrado, não corrigido)

- `native-android-player/app/build.gradle.kts:13` — `java.util.Properties().apply { ... load(it) }`
  → `Unresolved reference: util` / `load`. Código veio do working tree (não existia no HEAD).
- 5 arquivos deletados no baseline (UpdateManager.kt, WorkScheduler.kt, HeartbeatWorker.kt,
  SecurityHelper.kt, RealtimeManager.kt) + 20+ modificados — estado Android em transição.
- **Ação:** janela própria de diagnóstico; NÃO misturar com ERP web.

---

## 5. LINT — DÍVIDA PRÉ-EXISTENTE (BAIXA/MÉDIA)

- 226 erros + 23 warnings, quase todos `@typescript-eslint/no-explicit-any`.
- **0 erros** nos arquivos novos do baseline (Representantes/Central/testes).
- Concentrados em `src/modules/crm/services/*` (legado) e edge functions.
- Não bloqueia build nem testes; degrada diagnóstico e gate de qualidade.

---

## 6. TESTE COM TIMEOUT (BAIXA — NÃO É REGRESSÃO)

- `src/tests/integration/digital-signature.integration.test.ts` — 1 falha por timeout de 5s
  em "criar envelope CLICKSIGN". Pré-existente desde `1e5444f` (03/08). Sensível a rede/API externa.
- **399/400 testes passando**; `tsc` limpo; `build` OK.

---

## 7. CREATIVE STUDIO — AUSENTE DESDE SEMPRE (NÃO É REGRESSÃO)

- **0 arquivos, 0 commits, 0 tabelas, 0 referências** no código e no banco.
- "Arquitetura congelada" existe apenas como **instrução de fase** do agente — nunca foi
  implementada no repositório.
- **Ação:** se for funcionalidade aprovada, precisa ser construída em fase própria
  (aditiva); não há o que restaurar.

---

## 8. FUNCIONALIDADES PROTEGIDAS VERIFICADAS (presentes no baseline)

- `/representantes/*` (login, dashboard, clientes, propostas, contratos, campanhas, pontos,
  agenda, financeiro, BI, central, configurações, perfil, assinaturas, portal, mobile, IA) ✅
- `/workspace/*` (corporate, representantes, representantes/desempenho, representantes/:id,
  usuarios, central, clientes, propostas, contratos, campanhas, screens, agenda, financeiro,
  BI, configurações, perfil) ✅
- `/portal/*` (contrato) ✅ · `/` (Index) ✅ · `/auth` ✅ · `/install` ✅