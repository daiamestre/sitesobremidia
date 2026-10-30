/**
 * F-219 — teste REAL da migração 20261353 no banco, SEM GRAVAR NADA (transação desfeita no fim):
 * Studio para todos, carteira por usuário, cobrança PIX própria visível só ao dono, visibilidade das cobranças ANTIGAS
 * igual antes e depois, crédito automático do PIX pago e modelos novos só owner/ADM. Só contas de TESTE (empresa 22345678).
 *   node scripts/studio/testar-studio-ai-todos.mjs [--aplicada]
 */
import fs from 'node:fs';
import { sql } from '../ops/sql.mjs';

const U = {
  ges: '90aab58b-6737-4828-947e-108f25fd9e77', rep: '54b16229-8274-4a5b-8a1c-562ddf276070', par: '494b8c48-83fe-42f6-9024-ee036db4efec',
  fin: '98e1d271-9fde-4682-8c7a-f975d01672f1', a1: '2069fadf-7d3e-4a2f-a967-71fdf6add928', adm: '6305d633-2420-48cc-9c6b-ab4cc2709b34',
};
const aplicada = process.argv.includes('--aplicada');
const migracao = aplicada ? '' : fs.readFileSync('supabase/migrations/20261353_studio_ai_todos.sql', 'utf8');
const como = (uid) => `PERFORM set_config('request.jwt.claims', json_build_object('sub', '${uid}', 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', '${uid}', true); EXECUTE 'set local role authenticated';`;
const contar = (uid, rotulo) => `BEGIN ${como(uid)} SELECT count(*) INTO n FROM public.contas_receber; EXECUTE 'reset role'; END;
  INSERT INTO pg_temp.vis VALUES ('${rotulo}', n);`;

const antes = `CREATE TEMP TABLE vis (quem text, n int);
DO $a$ DECLARE n int; BEGIN ${contar(U.ges, 'ges_antes')} ${contar(U.rep, 'rep_antes')} ${contar(U.par, 'par_antes')} ${contar(U.a1, 'a1_antes')} END $a$;`;

const bloco = `
DO $t$
DECLARE r text := ''; j jsonb; n int; n2 int; cg uuid; cr uuid; cp uuid; v text;
BEGIN
  ${contar(U.ges, 'ges_depois')} ${contar(U.rep, 'rep_depois')} ${contar(U.par, 'par_depois')} ${contar(U.a1, 'a1_depois')}
  SELECT string_agg(a.quem || '=' || a.n || '/' || d.n, ' ') INTO v FROM pg_temp.vis a JOIN pg_temp.vis d ON d.quem = replace(a.quem, '_antes', '_depois') WHERE a.quem LIKE '%_antes';
  SELECT count(*) INTO n FROM pg_temp.vis a JOIN pg_temp.vis d ON d.quem = replace(a.quem, '_antes', '_depois') WHERE a.quem LIKE '%_antes' AND a.n <> d.n;
  r := r || format(E'\\n[1] cobranças antigas visíveis iguais antes/depois (%s): %s', v, n = 0);

  BEGIN ${como(U.ges)}
    j := public.studio_ai_meu_saldo(); r := r || format(E'\\n[2] GESTOR usa o Studio e paga: %s', (j->>'pode')::boolean and (j->>'paga')::boolean);
    j := public.studio_ai_comprar_creditos(1); cg := (j->>'cobranca_id')::uuid;
    SELECT count(*) INTO n FROM public.contas_receber WHERE id = cg; r := r || format(E'\\n[3] GESTOR vê a própria cobrança PIX (para pagar): %s', n = 1);
    BEGIN PERFORM public.studio_modelo_salvar('modelo-teste-gestor', '{"nome":"x","formato":"16:9"}'::jsonb); r := r || E'\\n[4] GESTOR cria modelo: PERMITIDO (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[4] GESTOR não cria modelos: true'; END;
    EXECUTE 'reset role';
  END;
  BEGIN ${como(U.rep)}
    j := public.studio_ai_comprar_creditos(2); cr := (j->>'cobranca_id')::uuid;
    SELECT count(*) INTO n FROM public.contas_receber WHERE id = cr; SELECT count(*) INTO n2 FROM public.contas_receber WHERE id = cg;
    r := r || format(E'\\n[5] REPRESENTANTE vê a sua (%s) e NÃO a do gestor (%s): %s', n, n2, n = 1 and n2 = 0);
    EXECUTE 'reset role';
  END;
  BEGIN ${como(U.par)}
    j := public.studio_ai_comprar_creditos(1); cp := (j->>'cobranca_id')::uuid;
    SELECT count(*) INTO n FROM public.contas_receber WHERE id = cp; SELECT count(*) INTO n2 FROM public.contas_receber WHERE id IN (cg, cr);
    r := r || format(E'\\n[6] PARCEIRO vê a sua (%s) e não as dos outros (%s): %s', n, n2, n = 1 and n2 = 0);
    EXECUTE 'reset role';
  END;
  BEGIN ${como(U.a1)}
    j := public.studio_ai_comprar_creditos(1);
    SELECT count(*) INTO n FROM public.contas_receber WHERE id = (j->>'cobranca_id')::uuid; SELECT count(*) INTO n2 FROM public.contas_receber WHERE id IN (cg, cr, cp);
    r := r || format(E'\\n[7] ANUNCIANTE continua comprando e vendo só a sua (%s / outras %s): %s', n, n2, n = 1 and n2 = 0);
    EXECUTE 'reset role';
  END;
  BEGIN ${como(U.adm)}
    BEGIN PERFORM public.studio_ai_comprar_creditos(1); r := r || E'\\n[8] ADMIN cobrado: PERMITIDO (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[8] ADMIN cria sem cobrança (não compra): true'; END;
    PERFORM public.studio_modelo_salvar('modelo-teste-adm', '{"nome":"Modelo teste","formato":"16:9"}'::jsonb);
    PERFORM public.studio_modelo_salvar('modelo-teste-arquivado', '{"nome":"Arquivado","formato":"9:16"}'::jsonb);
    PERFORM public.studio_modelo_arquivar('modelo-teste-arquivado');
    r := r || E'\\n[9] ADMIN cria e arquiva modelos: true';
    EXECUTE 'reset role';
  END;
  BEGIN ${como(U.ges)}
    SELECT count(*) INTO n FROM public.studio_modelos WHERE id = 'modelo-teste-adm'; SELECT count(*) INTO n2 FROM public.studio_modelos WHERE id = 'modelo-teste-arquivado';
    r := r || format(E'\\n[10] GESTOR vê o modelo novo (%s) e não o arquivado (%s): %s', n, n2, n = 1 and n2 = 0);
    EXECUTE 'reset role';
  END;
  -- PIX pago (o webhook do banco marca PAGA) → o servidor credita sozinho
  UPDATE public.contas_receber SET status = 'PAGA' WHERE id IN (cg, cr);
  n := public.studio_ai_creditar_pagas(); n2 := public.studio_ai_creditar_pagas();
  r := r || format(E'\\n[11] crédito automático do PIX pago (%s compras) e sem repetir (%s): %s', n, n2, n = 2 and n2 = 0);
  BEGIN ${como(U.ges)}
    j := public.studio_ai_meu_saldo(); r := r || format(E'\\n[12] GESTOR com 1 crédito liberado: %s', (j->>'saldo')::int = 1);
    SELECT count(*) INTO n FROM public.studio_ai_carteiras; r := r || format(E'\\n[13] GESTOR vê só a própria carteira: %s', n = 1);
    EXECUTE 'reset role';
  END;
  BEGIN ${como(U.rep)}
    j := public.studio_ai_meu_saldo(); r := r || format(E'\\n[14] REPRESENTANTE com 2 créditos: %s', (j->>'saldo')::int = 2);
    EXECUTE 'reset role';
  END;
  RAISE EXCEPTION 'RESULTADO %', r;
END $t$;`;

try {
  await sql(antes + '\n' + migracao + '\n' + bloco);
  console.error('ERRO: o bloco não terminou em exceção.');
  process.exit(1);
} catch (e) {
  const m = /RESULTADO([\s\S]*?)(\\n?"|$)/.exec(e.message);
  if (!m) { console.error('falha antes dos testes:', e.message.slice(0, 2000)); process.exit(1); }
  const linhas = m[1].replace(/\\n/g, '\n').trim();
  console.log(linhas);
  const falhas = linhas.split('\n').filter((l) => /FALHA|: false|: f$/.test(l));
  console.log(falhas.length ? `\n✘ ${falhas.length} caso(s) falharam` : '\n✔ todos os casos passaram (nada foi gravado: a transação foi desfeita)');
  process.exit(falhas.length ? 1 : 0);
}
