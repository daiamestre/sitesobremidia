# scripts/ops — operação do SOBRE MÍDIA

Todos os scripts leem as chaves de `~/.sobremidia-secrets/tokens.env`, que fica **fora** do repositório, e nunca imprimem os valores. Rode a partir da raiz do projeto.

| Tarefa | Comando |
|---|---|
| Consultar/alterar o banco de produção | `node scripts/ops/sql.mjs "select ..."` ou `node scripts/ops/sql.mjs @arquivo.sql` |
| Provar que uma migração não muda as telas | `node scripts/ops/comparar-telas.mjs antes`, aplicar a migração, depois `node scripts/ops/comparar-telas.mjs depois` |
| Publicar o site em produção (Vercel) | `node scripts/ops/deploy-vercel.mjs` (commit atual já enviado ao GitHub) |
| Enviar para o site COM TRAVA de limite da Vercel | `node scripts/ops/publicar-main.mjs` (`--ver` só mostra o uso; `--forcar` ignora o teto diário, só para urgência) |
| Liberar espaço na Vercel (apagar publicações antigas) | `node scripts/ops/limpar-deploys-vercel.mjs` (só simula) → `--executar` (precisa de chave válida da Vercel) |
| Chamar uma Edge Function de produção (chave pública) | `node scripts/ops/chamar-funcao.mjs <funcao> '<json>'` |
| Conferir se o código novo está no ar | `node scripts/ops/conferir-site.mjs "texto novo"` |
| Sessão de teste no painel (sem senha) | `node scripts/ops/sessao-teste.mjs` (em segundo plano) |
| Publicar o Player como TESTE (não vai aos aparelhos) | `node scripts/ops/publicar-player.mjs "notas"` (depois do `assembleRelease`) |
| Promover a versão de teste aprovada pelo dono a estável (OTA) | `node scripts/ops/publicar-player.mjs --promover <codigo>` |
| Conferir o contrato do Player comercial (5.7.10) com o servidor | `node scripts/ops/contrato-player.mjs` (antes e depois de toda migração) |
| Publicar uma Edge Function | `npx supabase functions deploy <nome> --project-ref bhwsybgsyvvhqtkdqozb --no-verify-jwt`<br>`fetch-rss` fica sem `--no-verify-jwt` |
| Rodar o robô de conteúdo agora | `gh workflow run conteudo-automatico.yml -R daiamestre/sitesobremidia --ref main [-f somente=noticias,datas]` |

Chaves esperadas no arquivo de segredos:
- `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_REF`
- `VERCEL_TOKEN`, `VERCEL_PROJECT_ID` e `VERCEL_TEAM_ID`
- `CONTENT_FACTORY_SECRET`
- `PEXELS_API_KEY` e `PIXABAY_API_KEY`

O passo a passo completo de cada rotina está nas skills em `.claude/skills/`.
