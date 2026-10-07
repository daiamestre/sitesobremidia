---
name: deploy-producao
description: Publicar mudanças do SOBRE MÍDIA em produção — commit seguro, Vercel (site), Supabase (migrações e Edge Functions) e conferência no ar. Usar sempre que o usuário pedir para "fazer deploy", "publicar", "subir" ou ao terminar uma correção.
---

# Deploy de produção — SOBRE MÍDIA

Regra fixa do proprietário: sempre corrigir, **commitar e publicar** (Vercel + Supabase). Tudo explicado em português.

## 1. Antes do commit
- `git status --short`: commitar **só** os arquivos da tarefa, com `git add <arquivo>` um por um. Nunca `git add -A` nem `git add .`.
- Nunca commitar: `supabase/.temp/cli-latest`, `scratch/`, `.agents/memory/executions/` nem alterações de outras sessões (ex.: `src/lib/biblioteca.ts`, se não foi você quem mexeu).
- Testes afetados: `npx vitest run <arquivos>`. Antes de publicar algo grande, rode a suíte inteira `npx vitest run src/tests/unit` (cerca de 7 min, em segundo plano).
- Tipos: `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "error TS" | grep -v src/tests/`. Já existem cerca de 100 erros antigos no CRM; confira só os arquivos que você mudou.

## 2. Commit e envio
- Mensagem em português, terminando com a linha `Co-Authored-By` indicada pelo sistema.
- Enviar com a trava de limite da Vercel: `node scripts/ops/publicar-main.mjs` (envia o ramo atual e o main; recusa se já houve 12 publicações em 24 h — junte correções; `--forcar` só em urgência). Documentação, testes, Android e banco NÃO publicam o site (a Vercel pula sozinha: `scripts/vercel-ignore-build.mjs`).

## 3. Supabase
- Migração: arquivo novo em `supabase/migrations/AAAAMMDD..._nome.sql`, com comentário no topo (motivo, o que é aditivo, ROLLBACK).
- Se a migração mexe em algo que o Player recebe, prove com `node scripts/ops/comparar-telas.mjs antes`, aplique, e rode `... depois`.
- Aplicar: `node scripts/ops/sql.mjs @supabase/migrations/<arquivo>.sql`. O histórico do CLI não é usado: todas as migrações são aplicadas assim.
- Edge Function: `npx supabase functions deploy <nome> --project-ref bhwsybgsyvvhqtkdqozb --no-verify-jwt`. A `fetch-rss` fica **sem** `--no-verify-jwt`. Carregue antes o token com `set -a; . ~/.sobremidia-secrets/tokens.env; set +a`.

## 4. Vercel (site)
- Push sozinho só gera preview. Produção: `node scripts/ops/deploy-vercel.mjs`, que espera ficar READY.
- Conferir no ar: `node scripts/ops/conferir-site.mjs "texto que só existe na versão nova"`.

## 5. Registrar
- Acrescente uma entrada `### F-NN — título — DONE` em `docs/engineering/FINDINGS_LEDGER.md` com causa, mudança, prova e publicação, e faça commit.
- "Build passou" não é "sistema funcionando": diga o que foi conferido de verdade.
