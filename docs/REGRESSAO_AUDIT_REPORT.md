# AUDIT REPORT — REGRESSÕES FUNCIONAIS

> Relatório objetivo do diagnóstico de regressões. **Fase de diagnóstico concluída. Nenhuma restauração executada.**
> Data: 2026-08-17. Baseline: `0671f90`.

---

## 1. O que existia antes?

### Central de Acessos (CORPORATIVA)
- Commitada em **`93f352c`** (14/08 16:28) — presente em HEAD, remoto `feat` (`9140448`/`e8eb64e`), working tree e produção atual.
- Rota `/workspace/usuarios`, menu "Central de Acessos" (condicional: `isOwner || users.view`), página `UsuariosAcessosPage`, RPCs `get_my_admin_permissions`, `listar_usuarios_central`, `get_central_acessos_dashboard`, `gerenciar_autonomia`, edge `create-corporate-user`, migrations 20260817–20260824.
- Validação histórica: E2E 13/13 + segurança 34/34 (reportado no commit).

### Central (COMUNICAÇÃO) — `/dashboard/central`
- Presente desde `93f352c` e **ainda presente hoje**: rota `/dashboard/central` (4 rotas), `CentralDashboard.tsx`, hook `useCentral.ts`/`useCentralUnread` consumido em 4 layouts/sidebars (Header, Sidebar CRM, Sidebar dashboard, Portal). **Sem regressão.**

### Representantes (gestão comercial)
- **NUNCA esteve em nenhum commit git antes de `0671f90`** (`git log --all -S` vazio para todos os arquivos do módulo).
- Existia no working tree desde pelo menos 17/08 ~15:07 (deploy da produção o contém) e foi deployado à produção em 17/08 15:07 BRT.
- Histórico de rotas da área: antes existia apenas `/workspace/representantes` → `RepresentativeDashboard` (dashboard do PRÓPRIO representante, commitado em `0310ba9`); a gestão (lista, ranking, desempenho, detalhe) é a implementação do working tree.
- `dashboard/representantes`: **nunca existiu em nenhum commit** (rota sempre foi `/workspace/representantes`).

## 2. O que existe agora?

| Camada | Estado atual |
|---|---|
| Produção (`sitesobremidia.vercel.app`, deploy 17/08 15:07 BRT) | Central de Acessos ✓ · Representantes (gestão/ranking/desempenho/detalhe) ✓ · Central `/dashboard/central` ✓ — **verificado por runtime com sessão OWNER real** |
| Working tree local | Igual à produção (105/105 rotas) + módulo Representantes |
| Git local (branch `feat`, commit `0671f90`) | Baseline criado — tudo commitado |
| Git remoto `feat` (`e8eb64e`) | Central ✓ · Representantes ✗ |
| Git remoto `main` (`ff6d848`) | Central ✗ · Representantes ✗ |

## 3. O que desapareceu?

**Nada desapareceu do código ou da produção atual.** O que existe é o contrário: o módulo Representantes **nunca foi commitado**, e `main`/deploys antigos nunca o tiveram. A percepção de "desaparição" tem três causas prováveis:

1. **Deploy anterior (≤14/08 13:17)**: produção sem o módulo Representantes (criado em 17/08) — quem acessou antes de 17/08 15:07 não via a gestão de representantes.
2. **Ver o sistema pelo GIT** (clone, branch, CI, PR): `main` e `feat` remotas não têm o módulo (e `main` não tem nem a Central).
3. **PWA/cache**: cliente Android/instalação PWA com bundle antigo.

## 4. Quando desapareceu?

Não houve um momento de "remoção" (nenhum commit deleta as funcionalidades — `git log --diff-filter=D` verificado). Cronologia:

- 07/08: `main` congelada sem as features (limite do que o git já teve).
- 14/08 13:17: último deploy antes do atual — sem Representantes (não existia) e sem evidência de Central.
- 17/08 15:07: deploy atual — **tudo presente**.
- 17/08 23:06: baseline `0671f90` — módulo finalmente protegido no git.

## 5. Qual commit/alteração causou?

**Nenhum commit causou remoção.** Causa raiz (ver seção 12):
- **Falha de processo**: FASE 10.1-B + módulo Representantes + migrations 20260825–20260911 desenvolvidos sem commits por dias (15–17/08).
- **Force-push do remoto**: `main` foi rewritada/recuada para 07/08; `feat` foi reescrita (`9140448`/`e8eb64e` com mesmos timestamps de `93f352c`/`1e7b504`).
- **Deploy fora do git** (CLI upload): produção virou um estado sem correspondência em nenhum ref — condição perfeita para "sumir" na próxima sincronização com git.

## 6. Qual código histórico contém a implementação correta?

| Funcionalidade | Código correto em |
|---|---|
| Central de Acessos | `93f352c` / remoto `9140448`+`e8eb64e` (commitado) — refinado no working tree |
| Central `/dashboard/central` + `useCentralUnread` | `93f352c` → presente até hoje, sem mudanças |
| Representantes (gestão) | **`0671f90`** (única fonte — era untracked; produção confirma fidelidade, runtime verificado) |
| Dashboard OWNER (`/workspace/corporate`, `CorporateCommandCenter`) | `0310ba9` → inalterado |

## 7. Existem outras regressões?

### SIM — 1 regressão crítica (segurança), 0 funcionais:

| # | Regressão | Severidade | Evidência |
|---|---|---|---|
| 1 | **Exposição cross-tenant no banco real** — anon LÊ `screens`, `remote_commands`, `app_releases`, `media`, `widgets`, `playlists`, `playlist_items`; AUTH consegue SELECT/INSERT/UPDATE em dados de OUTROS tenants (`remote_commands`, `screens`, `playback_logs`) | **P0** | `scripts/cross_tenant_results.json` (17/08 22:21) — 12 casos OPEN; migration `20260911` (1.269 linhas) **NÃO aplicada** |
| 2 | Migration `20260826` aplicada parcialmente (grants das RPCs `listar_representantes_gerencia`/`get_desempenho_representantes` ainda permitem `anon` executar — 401 em vez de 404) | Média | probes anon no projeto real |
| 3 | Lint do repo: 226 erros pré-existentes (749 arquivos) — **não introduzidos pelo baseline** | Baixa | `eslint .` (módulo Representantes: 0 erros) |
| 4 | 3 testes flaky (SignatureProviderAdapter) na 1ª execução; 400/400 na 2ª | Baixa | `vitest run` |

### Não-regressões confirmadas (auditoria dedicada):
- Rotas do frontend: produção == working tree (105/105). Nenhuma rota removida entre `93f352c` e hoje.
- Sidebar: evolução por ADIÇÃO apenas (885ffa8 → 93f352c → 0671f90). Nada removido/renomeado.
- `useCentralUnread`/`/dashboard/central`: presentes e ativos.
- Android: deleções de 5 arquivos têm substitutos ativos; zero referências pendentes.
- `dist/` local: build íntegro com todos os chunks.

## 8. O que pode ser restaurado com segurança?

| Item | Ação | Risco |
|---|---|---|
| Módulo Representantes | **JÁ RESTAURADO no git** (`0671f90`) | Zero — é o próprio código da produção |
| Central de Acessos | Já commitada; nada a fazer | Zero |
| Migrations 20260825–20260911 | Já commitadas; aplicar no banco é decisão de FASE 3 (autorização separada) | Médio (produção) |
| `main` remota | Alinhar com o baseline (push/merge) | Médio (force-push adicional) |
| PR #1 | Atualizar para apontar ao baseline | Baixo |

## 9. O que depende do banco?

- **RPCs do módulo Representantes** (`listar_representantes_gerencia`, `get_desempenho_representantes`, `gerenciar_representante`, `get_desempenho_representante_detalhe`, `reassinar_cliente_representante`): existentes no banco real (gestão e desempenho confirmados por runtime; demais com grants autenticados — 404 anon esperado).
- **Central de Acessos**: RPCs presentes (dashboard e lista funcionaram na sessão OWNER).
- **`gerenciar_autonomia`, `criar_usuario_corporativo`, `has_admin_permission`, `atualizar_usuario_corporativo`, `get_solicitacao_aprovacao`**: 404 via anon — **não confirmáveis sem service role** (nenhum grant público); a Central funciona, então pelo menos `gerenciar_autonomia` deve existir com grant autenticado (modal Autonomia abre; SAVE não testado para não mutar).
- **Exposição cross-tenant**: fechar exige aplicar `20260911` (FASE 3).

## 10. O que depende apenas do frontend?

- Menus, rotas, páginas, hooks e services do módulo Representantes e da Central de Acessos — tudo no commit `0671f90`.
- `useCentralUnread` (já commitado em `93f352c`).
- **Conclusão: frontend está completo e congelado; nada mais a restaurar em código.**

## 11. Plano exato de restauração (FASE 3 — REQUER AUTORIZAÇÃO)

1. **Alinhar branches** (decidir ordem):
   - a) Push de `feat/central-corporativa-acessos` (`0671f90`) → atualizar `e8eb64e`; e/ou
   - b) Atualizar `main` para `0671f90` (fast-forward controlado; hoje `main` é 8 dias mais velha).
2. **Atualizar PR #1** para o baseline.
3. **Definir política de deploy**: produção sempre a partir de git (nunca CLI upload), com build verificado.
4. **Aplicar migrations pendentes no banco real** (20260825→20260911) — **separado, com janela de manutenção**; fechar exposição P0 (20260911) é a prioridade.
5. **Criar testes de regressão** (item 17 do briefing) e integrar ao CI.
6. **Verificação pós-restauração**: build + tsc + vitest + E2E (contra ambiente de teste) + runtime em produção.

## 12. CAUSA RAIZ (resposta direta)

A desaparição **não foi causada por um commit**: foi causada por **processo e estado do repositório**:

1. **Trabalho sem commits** (FASE 10.1-B, 15–17/08): as funcionalidades viviam só no working tree.
2. **Force-push/história reescrita no remoto** (git não preserva; produz hashes divergentes e perda de rastreabilidade).
3. **`main` recuada para 07/08** — qualquer build/dispatch baseado em `main` ou no deploy do GitHub NÃO teria Central nem Representantes.
4. **Deploys por CLI (upload)** — produção passou a conter código que nenhum ref git possui; se o GitHub integration estiver configurado ou alguém rodar `git pull && vercel build`, o site REGREDE de fato.
5. **Regras de proteção inexistentes** — sem testes de existência, sem docs de features protegidas, sem baseline.

> **Síntese:** a regressão é uma **bomba-relógio de rastreabilidade**, não uma remoção de código. O baseline `0671f90` desarma a bomba. A aplicação das migrations e o alinhamento das branches são os próximos passos obrigatórios.

---

*Documento gerado em 2026-08-17 pela auditoria master. Aguardando revisão e autorização para FASE 3.*