---
name: migracao-segura
description: Alterar banco, RPC, RLS ou o que o Player recebe no SOBRE MÍDIA sem quebrar telas nem perfis — partir da definição VIVA, provar que as telas atuais não mudam e simular a novidade numa transação desfeita. Usar antes de qualquer migração em estrutura protegida.
---

# Migração segura — SOBRE MÍDIA

Estruturas protegidas (AGENTS.md): `get_player_playlist_for_screen`, `fn_save_playlist_items`, RLS, RBAC, pareamento e device token. Só se mexe nelas com causa comprovada e prova antes e depois.

1. **Partir do que está no ar, não do arquivo:**
   `node scripts/ops/sql.mjs "select pg_get_functiondef('public.<funcao>(<args>)'::regprocedure)"`.
   Guarde a definição anterior em `docs/engineering/evidence/F-NN_*/` (é o rollback).
2. **Gerar a migração trocando só o trecho necessário** (ex.: por script que faz `replace` na definição viva). O restante fica idêntico.
3. **Mudança aditiva:** coluna nova com valor padrão, `CHECK` que continua aceitando as linhas atuais, e novidade só para Player novo (padrão W11/W12 com `fn_*_suportado_no_aparelho`).
4. **Prova com as telas reais:**
   `node scripts/ops/comparar-telas.mjs antes`, aplicar com `node scripts/ops/sql.mjs @arquivo.sql`, depois `... depois`. Tem de sair "resposta de todas as telas idêntica".
5. **Simular a novidade sem gravar nada:** um bloco `DO $$ ... RAISE EXCEPTION 'RESULTADO %', ... $$` insere o caso de teste, chama a RPC e mostra o resultado; a transação é desfeita. Teste Player novo e antigo.
6. **Funções que o Player chama** gravam `last_ping_at`: nunca chamar fora de transação desfeita.
7. **Regex dentro de SQL gerado por script:** o `\d` costuma perder a barra. Prefira `[0-9]` e confira o texto aplicado.

Cabeçalho obrigatório da migração: motivo (F-NN), o que é aditivo, impacto no Player e bloco **ROLLBACK**.
