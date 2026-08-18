# PLANO DE RESTAURAÇÃO — SOBRE MÍDIA PLATFORM

**Fase 3 → Fase 4 (aguardando autorização explícita) · baseline `0671f90` · 2026-08-18**

> Princípio: **restaurar o estado funcional existente** (o baseline já contém tudo).
> Não reconstruir do zero. Preservar todo trabalho posterior que não seja regressão.
> Nada será executado sem autorização explícita.

---

## 1. MATRIZ DE RECUPERAÇÃO

| Funcionalidade | Estado atual | Último estado bom | Causa | Ação |
|---|---|---|---|---|
| Central de Acessos (código) | ✅ completa no baseline | `93f352c`/`0671f90` | Nunca foi removida | **Nenhuma** — apenas proteger |
| Central de Acessos (banco) | ✅ functions/policies/triggers ativos | 20260825+20260826 | Aplicada manualmente sem registro | Registrar `20260825` em schema_migrations (autorizado) |
| Representantes (código) | ✅ completo no baseline | **`0671f90` (1º commit)** | Só existia no working tree | **Nenhuma** — baseline já protege |
| Representantes (banco) | ✅ RPCs + RLS ativos | 20260826 | Consistente | **Nenhuma** |
| Dashboard OWNER (menu) | ✅ completo no baseline | `0310ba9`+`93f352c`+`0671f90` | Nunca foi removida | **Nenhuma** |
| Dashboard OWNER (produção) | ❌ produção/CI rodam `main` 07/08 | — | Deploy fora do branch | Merge do baseline no `main` após aprovação |
| Migrations 20260827–20260911 | ❌ não aplicadas no banco | — | Aplicação nunca feita | Aplicação controlada (P0 primeiro) |
| Exposição cross-tenant (P0) | ❌ policies `qual=true` ativas | 20260911 corrige | Migration não aplicada | Aplicar `20260911` isoladamente (P0) |
| Histórias Git paralelas | ⚠️ 171 vs 176 commits | — | Histórico reescrito | Convergir com análise de diff (sem force) |
| Android `build.gradle.kts:13` | ❌ build quebrado | — | Código veio do working tree | Janela separada (não misturar com ERP) |
| Lint legado (226) | ⚠️ dívida | — | Pré-existente | Limpeza em fases posteriores |
| Teste CLICKSIGN timeout | ⚠️ 1 falha pré-existente | — | Rede/API externa | Revisar timeout/network mock |

---

## 2. ORDEM PROPOSTA (cada passo = autorização)

### Passo 0 — Nenhum (já feito)
Baseline `0671f90` commitado; working tree limpo. ✅

### Passo 1 — Convergir histórias Git (seguro, sem force)
- Fonte da verdade: **local `0671f90`** (superset: 46 arquivos a mais).
- Preservar os 9 arquivos exclusivos do remoto que ainda façam sentido
  (Android deletados: confirmar que a exclusão foi intencional; temporários: ignorar).
- Estratégia: manter `0671f90` como base; trazer do remoto apenas o que faltar.
- **Proibido:** `push --force`, `rebase` destrutivo, `reset --hard`.

### Passo 2 — Registrar `20260825` no schema_migrations (banco)
- Como foi aplicada manualmente, `db push` futuro a reaplicaria.
- Registro manual da versão (após revisão) para alinhar banco × Git.

### Passo 3 — Aplicar P0 `20260911_close_tenant_exposure` (isolada)
- Fechar policies `qual=true` de media/playlists/playlist_items/widgets/producoes/etc.
- Revalidar com probe read-only após aplicação (44/44 red team como referência).

### Passo 4 — Aplicar as demais migrations pendentes (20260827, 28, 29, 20260901, 20260910)
- Em ordem; cada uma validada por probe de colunas antes/depois.

### Passo 5 — Merge do baseline no `main` (após validação completa)
- PR/review manual; CI passa a rodar sobre o estado correto.
- Produção passa a conter Central + Representantes + Dashboard OWNER.

### Passo 6 — Instalar proteção permanente contra regressão
1. `scripts/regression-guard.mjs` — verifica:
   - Arquivos protegidos existem (Representantes, Central, hooks, services, migrations);
   - Rotas em `App.tsx` (representantes/desempenho/:id, usuarios, central);
   - Menus no `Sidebar.tsx` (Central de Acessos, Comercial → Representantes);
   - `tsc --noEmit` + `vitest run` (suites protegidas);
   - Migrations `20260825`–`20260911` presentes e registradas.
2. Hook de CI: `ci.yml` roda o guard em qualquer push.
3. Docs: `docs/BASELINE_FUNCIONAL.md` = lista de funcionalidades protegidas (atualizada).
4. Regra aditiva: **nenhuma fase pode remover rota/menu/página/hook/service/migration
   sem autorização explícita**; qualquer remoção sem autorização → `REGRESSION BLOCKED`.

### Passo 7 — Janela Android (separada)
- Corrigir `build.gradle.kts:13` (`loadSigningProps`) e validar build Gradle em isolamento.

---

## 3. CRITÉRIO DE SAÍDA (zero regressões críticas)

- [ ] `tsc --noEmit` limpo
- [ ] `vite build` OK
- [ ] `vitest run` ≥ 399/400 (falha CLICKSIGN justificada/remediada)
- [ ] Menu OWNER: Central de Acessos + Representantes visíveis
- [ ] Rotas `/workspace/representantes*` apontando para gestão
- [ ] RPCs/RLS de Representantes e Central ativos no banco
- [ ] Migrations 20260825–20260911 registradas/aplicadas
- [ ] Nenhuma policy `qual=true` restante em media/playlists/widgets/producoes
- [ ] Histórias Git convergidas sem perda de arquivos
- [ ] Regression guard instalado e passando

---

## 4. RISCOS E MITIGAÇÕES

| Risco | Mitigação |
|---|---|
| Perda de trabalho no merge de histórias | diff arquivo-a-arquivo antes de qualquer merge; backup da ref `0671f90` |
| `20260825` reaplicada com conflito | registrar versão manualmente (Passo 2) antes de qualquer `db push` |
| Aplicar migrations quebra produção | janelas isoladas, validação por probe após cada migration, rollback documentado |
| Regression guard falso-positivo | lista de protegidos versionada em `docs/BASELINE_FUNCIONAL.md` |
| Agente futuro ignorar a regra | hook CI obrigatório (não só instrução) + `REGRESSION BLOCKED` no fluxo |