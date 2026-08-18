# DECISÃO DE CONVERGÊNCIA DAS HISTÓRIAS GIT — SOBRE MÍDIA PLATFORM

**Data:** 2026-08-18 · **Fase 4, Passo 1** · **Autorização:** sequência completa aprovada

---

## 1. Contexto

Duas histórias paralelas divergiram desde `4e4b887` (histórias espelhadas com hashes diferentes):

| Ref | HEAD | Commits | Estado |
|---|---|---|---|
| Local `feat/central-corporativa-acessos` | `16afb59` | 172 | **SUPERSET legítimo** (baseline + docs) |
| Remoto `feat/central-corporativa-acessos` | `e8eb64e` | 176 | espelho de `1e7b504` (sem baseline) |
| `main` local | `885ffa8` | — | ancestral do baseline (13/08) |
| `origin/main` (produção) | `ff6d848` | — | 07/08, sem features; NÃO ancestral do local |

## 2. Os 9 arquivos exclusivos do remoto — destino decidido

| Arquivo | Tipo | Decisão | Justificativa |
|---|---|---|---|
| `.temp_playlist_items.js` | lixo temporário | **NÃO restaurar** | `.gitignore:50` (`.temp*`) |
| `.temp_query.js` | lixo temporário | **NÃO restaurar** | `.gitignore:50` |
| `dev-dist/sw.js` | artefato de build | **NÃO restaurar** | `.gitignore:48` (`dev-dist`) |
| `dev-dist/workbox-ca84f546.js` | artefato de build | **NÃO restaurar** | `.gitignore:48` |
| `player/manager/UpdateManager.kt` | Android refatorado | **NÃO restaurar** | substituído por `OTAUpdateManager` (3 referências ativas) |
| `cache/util/WorkScheduler.kt` | Android refatorado | **NÃO restaurar** | 0 referências no baseline |
| `cache/worker/HeartbeatWorker.kt` | Android refatorado | **NÃO restaurar** | substituído por `PersistentHeartbeatService` (0 refs ativas) |
| `core/util/SecurityHelper.kt` | Android refatorado | **NÃO restaurar** | 0 referências no baseline |
| `sync/service/RealtimeManager.kt` | Android refatorado | **NÃO restaurar** | 0 referências no baseline |

**Nenhum arquivo exclusivo do remoto contém trabalho funcional que o baseline não tenha
evoluído.** As referências no código local apontam apenas para `OTAUpdateManager` e
`PersistentHeartbeatService` — a exclusão dos `.kt` foi refatoração intencional (não acidental).

## 3. Arquivos que o `origin/main` tem e o baseline também tem

| Arquivo | No origin/main | No baseline | Decisão |
|---|---|---|---|
| `scripts/sprint_gate_empirical_proof.mjs` | ✅ | ✅ | sem perda |

## 4. Estratégia aprovada

1. **Fonte da verdade:** baseline local `16afb59` (46 arquivos a mais, 0 trabalho perdido).
2. **Merge:** `main` local (ancestral `885ffa8`) → **fast-forward** para `16afb59`.
3. **Produção (`origin/main`):** a árvore de `origin/main` é ancestral/subconjunto do
   baseline (só difere em lixo e Android refatorado) → merge commit incorporando o conteúdo
   do baseline, preservando a árvore integral.
4. **Proibido:** `push --force`, `rebase` destrutivo, `reset --hard`, `cherry-pick` em massa.

## 5. Evidências

- `git diff --name-status origin/main main` → apenas 1 arquivo D (`sprint_gate...`, que o
  baseline contém) e o restante A/M são trabalho **mais novo** já presente no baseline.
- `git grep` no baseline: `UpdateManager`→só `OTAUpdateManager`; `HeartbeatWorker`→só
  comentário em `UserApplication.kt`; `WorkScheduler`/`RealtimeManager`/`SecurityHelper`→0 refs.
- `git check-ignore`: `.temp*`, `dev-dist/`, `playwright-report/`, `test-results/`,
  `supabase/.temp/` → todos cobertos pelo `.gitignore`.

**Resultado: convergência é fast-forward limpo, sem nenhuma perda de trabalho.**
