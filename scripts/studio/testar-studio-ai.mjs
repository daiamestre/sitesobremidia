/**
 * SOBRE MÍDIA Studio AI — teste REAL da migração 20261351 no banco, SEM GRAVAR NADA (tudo numa transação que termina
 * em RAISE EXCEPTION). Contas de TESTE da empresa de teste 22345678-…; um ADMIN de outra empresa só como "olhador".
 *   node scripts/studio/testar-studio-ai.mjs [--aplicada]   (--aplicada: a migração já está no banco, testa só os casos)
 */
import fs from 'node:fs';
import { sql } from '../ops/sql.mjs';

const U = {
  a1: '2069fadf-7d3e-4a2f-a967-71fdf6add928', c1: 'dedef2eb-d672-4d5c-9fcf-5689923f3fa7',
  a2: '76661883-0f43-4dee-aeae-8b5902fa2d4a',
  fin: '98e1d271-9fde-4682-8c7a-f975d01672f1',
  adm: '6305d633-2420-48cc-9c6b-ab4cc2709b34',
  outra: '4164f657-8896-4e32-9bd4-2c253a1245fe',
  emp: '22345678-1234-1234-1234-123456789012',
};
const aplicada = process.argv.includes('--aplicada');
const migracao = aplicada ? '' : fs.readFileSync('supabase/migrations/20261351_studio_ai.sql', 'utf8');
if (/\b(commit|begin\s*;)/i.test(migracao.replace(/--.*$/gm, ''))) throw new Error('a migração não pode ter BEGIN/COMMIT');

const como = (uid) => `PERFORM set_config('request.jwt.claims', json_build_object('sub', '${uid}', 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', '${uid}', true); EXECUTE 'set local role authenticated';`;

const bloco = `
DO $t$
DECLARE r text := ''; j jsonb; n int; v text; compra uuid; cart uuid; conv uuid; job1 uuid; job2 uuid; job3 uuid; proj uuid; c record;
BEGIN
  BEGIN ${como(U.a1)}
    j := public.studio_ai_meu_saldo(); r := r || format(E'\\n[1] A1 saldo inicial 0 e pode usar: %s', (j->>'saldo')::int = 0 and (j->>'pode')::boolean);
    j := public.studio_ai_comprar_creditos(3); compra := (j->>'compra_id')::uuid;
    r := r || format(E'\\n[2] compra de 3 créditos = R$ 14,97 (centavos %s)', j->>'valor_centavos');
    j := public.studio_ai_confirmar_compra(compra); r := r || format(E'\\n[3] antes do PIX pago não credita: %s', (j->>'creditado')::boolean = false);
    EXECUTE 'reset role';
  END;
  SELECT valor::text || '/' || status || '/' || metodo_cobranca || '/' || recorrencia INTO v FROM public.contas_receber WHERE id = (SELECT conta_receber_id FROM public.studio_ai_compras WHERE id = compra);
  r := r || format(E'\\n[4] cobrança PIX avulsa gerada: %s', v);
  UPDATE public.contas_receber SET status = 'PAGA' WHERE id = (SELECT conta_receber_id FROM public.studio_ai_compras WHERE id = compra);
  BEGIN ${como(U.a1)}
    j := public.studio_ai_confirmar_compra(compra); r := r || format(E'\\n[5] PIX pago: creditou 3: %s', (j->>'quantidade')::int = 3);
    j := public.studio_ai_confirmar_compra(compra); r := r || format(E'\\n[6] confirmar de novo não credita 2 vezes: %s', (j->>'ja_estava')::boolean);
    j := public.studio_ai_meu_saldo(); r := r || format(E'\\n[7] saldo 3: %s', (j->>'saldo')::int = 3);
    BEGIN UPDATE public.studio_ai_movimentos SET quantidade = 99; GET DIAGNOSTICS n = ROW_COUNT; r := r || format(E'\\n[8] A1 alterar extrato: bloqueado %s', n = 0);
    EXCEPTION WHEN others THEN r := r || E'\\n[8] A1 alterar extrato: bloqueado true'; END;
    BEGIN UPDATE public.studio_ai_carteiras SET saldo = 999; GET DIAGNOSTICS n = ROW_COUNT; r := r || format(E'\\n[9] A1 mudar saldo direto: bloqueado %s', n = 0);
    EXCEPTION WHEN others THEN r := r || E'\\n[9] A1 mudar saldo direto: bloqueado true'; END;
    BEGIN PERFORM public.studio_ai_creditar_manual('${U.c1}', 50, 'quero mais'); r := r || E'\\n[10] anunciante se dá cortesia: PERMITIDO (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[10] anunciante não se dá créditos: true'; END;
    BEGIN PERFORM public.studio_ai_reservar(gen_random_uuid()); r := r || E'\\n[11] anunciante chama reserva do servidor: PERMITIDO (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[11] funções de reserva/consumo bloqueadas ao usuário: true'; END;
    proj := public.studio_projeto_salvar(null, 'ofertas-da-semana', 'Meu projeto', '16:9', '{"textos":{}}'::jsonb, null);
    SELECT count(*) INTO n FROM public.studio_projetos WHERE id = proj; r := r || format(E'\\n[12] A1 salva e vê o projeto: %s', n = 1);
    EXECUTE 'reset role';
  END;
  -- extrato imutável até para o dono do banco
  BEGIN DELETE FROM public.studio_ai_movimentos; r := r || E'\\n[13] apagar extrato: PERMITIDO (FALHA)';
  EXCEPTION WHEN others THEN r := r || E'\\n[13] extrato imutável (nem o banco apaga): true'; END;

  BEGIN ${como(U.a2)}
    SELECT count(*) INTO n FROM public.studio_ai_carteiras; r := r || format(E'\\n[14] A2 vê carteiras de outro cliente: %s', n);
    SELECT count(*) INTO n FROM public.studio_projetos; r := r || format(E'\\n[15] A2 vê projetos de outro cliente: %s', n);
    BEGIN PERFORM public.studio_ai_confirmar_compra(compra); r := r || E'\\n[16] A2 confirma compra de A1: PERMITIDO (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[16] A2 não mexe na compra de A1: true'; END;
    PERFORM public.studio_projeto_apagar(proj);
    EXECUTE 'reset role';
  END;
  SELECT count(*) INTO n FROM public.studio_projetos WHERE id = proj; r := r || format(E'\\n[17] A2 não apaga projeto de A1: %s', n = 1);
  BEGIN ${como(U.fin)}
    j := public.studio_ai_meu_saldo(); r := r || format(E'\\n[18] FINANCEIRO usa o Studio pagando (regra F-219: todos menos owner/ADM pagam): %s', (j->>'pode')::boolean and (j->>'paga')::boolean);
    SELECT count(*) INTO n FROM public.studio_ai_carteiras; r := r || format(E'\\n[19] FINANCEIRO vê carteiras: %s', n);
    EXECUTE 'reset role';
  END;
  BEGIN ${como(U.outra)}
    SELECT count(*) INTO n FROM public.studio_ai_carteiras WHERE empresa_operadora_id = '${U.emp}'; r := r || format(E'\\n[20] ADMIN de OUTRA empresa vê carteiras desta: %s', n);
    EXECUTE 'reset role';
  END;
  BEGIN ${como(U.adm)}
    SELECT count(*) INTO n FROM public.studio_ai_carteiras WHERE cliente_id = '${U.c1}'; r := r || format(E'\\n[21] ADMIN da empresa vê a carteira do cliente: %s', n = 1);
    BEGIN PERFORM public.studio_ai_creditar_manual('${U.c1}', 2, 'x'); r := r || E'\\n[22] cortesia sem motivo: ACEITA (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[22] cortesia exige motivo: true'; END;
    PERFORM public.studio_ai_creditar_manual('${U.c1}', 2, 'Cortesia de teste do Studio');
    EXECUTE 'reset role';
  END;
  SELECT id, saldo INTO c FROM public.studio_ai_carteiras WHERE cliente_id = '${U.c1}'; cart := c.id;
  r := r || format(E'\\n[23] cortesia com motivo somou: saldo %s (esperado 5)', c.saldo);

  -- servidor: reserva → consumo / estorno (idempotentes)
  INSERT INTO public.studio_ai_conversas (empresa_operadora_id, cliente_id, operador_id) VALUES ('${U.emp}', '${U.c1}', '${U.a1}') RETURNING id INTO conv;
  INSERT INTO public.studio_ai_jobs (conversa_id, empresa_operadora_id, cliente_id, operador_id, tipo, prompt_original, prompt_enviado, modelo, cobrar, carteira_id, creditos, idempotencia)
    VALUES (conv, '${U.emp}', '${U.c1}', '${U.a1}', 'gerar', 'x', 'x', 'gpt-image-2', true, cart, 1, 'teste-1') RETURNING id INTO job1;
  INSERT INTO public.studio_ai_jobs (conversa_id, empresa_operadora_id, cliente_id, operador_id, tipo, prompt_original, prompt_enviado, modelo, cobrar, carteira_id, creditos, idempotencia)
    VALUES (conv, '${U.emp}', '${U.c1}', '${U.a1}', 'gerar', 'y', 'y', 'gpt-image-2', true, cart, 1, 'teste-2') RETURNING id INTO job2;
  INSERT INTO public.studio_ai_jobs (conversa_id, empresa_operadora_id, cliente_id, operador_id, tipo, prompt_original, prompt_enviado, modelo, cobrar, carteira_id, creditos, idempotencia)
    VALUES (conv, '${U.emp}', '${U.c1}', '${U.a1}', 'gerar', 'z', 'z', 'gpt-image-2', true, cart, 50, 'teste-3') RETURNING id INTO job3;
  PERFORM public.studio_ai_reservar(job1); PERFORM public.studio_ai_reservar(job1);
  SELECT saldo || '/' || reservado INTO v FROM public.studio_ai_carteiras WHERE id = cart; r := r || format(E'\\n[24] reserva repetida conta 1 vez (saldo/reservado 4/1): %s', v);
  PERFORM public.studio_ai_consumir(job1); PERFORM public.studio_ai_consumir(job1);
  SELECT saldo || '/' || reservado INTO v FROM public.studio_ai_carteiras WHERE id = cart; r := r || format(E'\\n[25] consumo (sucesso) 1 vez (4/0): %s', v);
  PERFORM public.studio_ai_reservar(job2); PERFORM public.studio_ai_estornar(job2, 'falha da API'); PERFORM public.studio_ai_estornar(job2, 'de novo');
  SELECT saldo || '/' || reservado INTO v FROM public.studio_ai_carteiras WHERE id = cart; r := r || format(E'\\n[26] falha estorna 1 vez (4/0): %s', v);
  PERFORM public.studio_ai_consumir(job2);
  SELECT saldo || '/' || reservado INTO v FROM public.studio_ai_carteiras WHERE id = cart; r := r || format(E'\\n[27] consumir depois do estorno não cobra (4/0): %s', v);
  BEGIN PERFORM public.studio_ai_reservar(job3); r := r || E'\\n[28] reserva maior que o saldo: ACEITA (FALHA)';
  EXCEPTION WHEN others THEN r := r || E'\\n[28] saldo nunca fica negativo: true'; END;
  SELECT count(*) INTO n FROM public.studio_ai_movimentos WHERE carteira_id = cart; r := r || format(E'\\n[29] extrato completo (compra, cortesia, reservas, consumo, estorno): %s movimentos', n);
  BEGIN ${como(U.a1)}
    SELECT count(*) INTO n FROM public.studio_ai_jobs WHERE conversa_id = conv; r := r || format(E'\\n[30] A1 vê as próprias gerações: %s', n = 3);
    EXECUTE 'reset role';
  END;
  RAISE EXCEPTION 'RESULTADO %', r;
END $t$;`;

try {
  await sql(migracao + '\n' + bloco);
  console.error('ERRO: o bloco não terminou em exceção.');
  process.exit(1);
} catch (e) {
  const m = /RESULTADO([\s\S]*?)(\\n?"|$)/.exec(e.message);
  if (!m) { console.error('falha antes dos testes:', e.message.slice(0, 2000)); process.exit(1); }
  const linhas = m[1].replace(/\\n/g, '\n').trim();
  console.log(linhas);
  const falhas = linhas.split('\n').filter((l) => /FALHA|: false|: f$|outro cliente: [1-9]|FINANCEIRO vê carteiras: [1-9]|OUTRA empresa vê carteiras desta: [1-9]/.test(l));
  console.log(falhas.length ? `\n✘ ${falhas.length} caso(s) falharam` : '\n✔ todos os casos passaram (nada foi gravado: a transação foi desfeita)');
  process.exit(falhas.length ? 1 : 0);
}
