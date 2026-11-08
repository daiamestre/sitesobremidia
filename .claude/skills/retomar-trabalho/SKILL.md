---
name: retomar-trabalho
description: Retomar o trabalho no SOBRE MÍDIA de onde parou (troca de janela, IDE ou IA) e fechar a sessão deixando o estado gravado. Usar quando o dono pedir "continue", "onde paramos", "o que falta", "retome a pendência P-NN" ou ao terminar uma entrega.
---

# Retomar e registrar o trabalho — SOBRE MÍDIA

## Ao começar
1. Rode `node scripts/ops/onde-paramos.mjs`. Ele mostra o ramo, o que está sem commit, as últimas entregas e as pendências abertas.
2. Leia `docs/ESTADO_DO_SISTEMA.md` e `docs/DECISOES_DO_DONO.md`. Não pergunte de novo o que já está decidido ali.
3. Pendência pedida pelo número: `node scripts/ops/onde-paramos.mjs P-NN` mostra o texto completo com os passos.
   - 🟧 = pode fazer já.
   - 🟥 = depende do dono: explique o que falta dele e siga com outra pendência.
4. Se houver arquivos sem commit de outra sessão, confira o que são antes de mexer. Nunca commite `src/lib/biblioteca.ts` nem `supabase/.temp/cli-latest`.

## Ao terminar (ritual obrigatório)
1. Escreva o F-NN novo em `docs/engineering/FINDINGS_LEDGER.md` com pedido, causa, feito, prova e limite.
2. Atualize `docs/ESTADO_DO_SISTEMA.md`:
   - acrescente a linha na tabela de entregas (seção 3);
   - marque a pendência resolvida como "✅ resolvida em DD/MM (F-NN)" e crie as novas (seção 4);
   - troque a data da última atualização.
3. Regra nova do dono → `docs/DECISOES_DO_DONO.md`. Padrão novo de arte → `docs/studio/PADRAO_DE_ENCARTES_E_PALCOS.md` (e `dna.ts`, se for estilo).
4. Rode os testes (`npx vitest run src/tests/unit/memoriaDoSistema.test.ts` também), faça o commit em português e publique com `node scripts/ops/publicar-main.mjs`.
