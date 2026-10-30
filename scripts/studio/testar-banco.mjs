/**
 * SOBRE MÍDIA Studio — teste REAL da migração no banco de produção, SEM GRAVAR NADA:
 * aplica supabase/migrations/20261349_studio_ia_producoes.sql e roda os casos de permissão/estado/cota/entrega
 * dentro da MESMA transação, que termina em RAISE EXCEPTION (tudo é desfeito, inclusive as tabelas criadas).
 *
 *   node scripts/studio/testar-banco.mjs
 *
 * Contas: só as de TESTE da empresa de teste 22345678-… (anunciantes de clientes diferentes, FINANCEIRO, GESTOR, ADMIN,
 * owner de teste) e um ADMIN de outra empresa só como "olhador" (nenhum dado dele é lido ou alterado).
 */
import fs from 'node:fs';
import { sql } from '../ops/sql.mjs';

const U = {
  a1: '2069fadf-7d3e-4a2f-a967-71fdf6add928', // anunciante, cliente dedef2eb
  a2: '76661883-0f43-4dee-aeae-8b5902fa2d4a', // anunciante, cliente 5a378f96
  fin: '98e1d271-9fde-4682-8c7a-f975d01672f1', // FINANCEIRO
  ges: '90aab58b-6737-4828-947e-108f25fd9e77', // GESTOR
  adm: '6305d633-2420-48cc-9c6b-ab4cc2709b34', // ADMIN da empresa de teste
  own: '12345678-1234-1234-1234-123456789012', // owner de teste
  outra: '4164f657-8896-4e32-9bd4-2c253a1245fe', // ADMIN de OUTRA empresa
};

const migracao = fs.readFileSync('supabase/migrations/20261349_studio_ia_producoes.sql', 'utf8');
if (/\b(commit|begin\s*;)/i.test(migracao.replace(/--.*$/gm, ''))) throw new Error('a migração não pode ter BEGIN/COMMIT (o teste precisa desfazer tudo)');

const pedido = (titulo, preco = 699) => JSON.stringify({
  tipo: 'video_montado', formato: '16:9', duracao_s: 15, cenas: 4,
  briefing: { titulo, objetivo: 'Divulgar ofertas', categoria: 'Bebidas e adega', tom: 'Impactante', ideia: 'Teste de permissões do Studio.' },
  produtos: [{ id: 'p1', nome: 'Produto teste', preco_centavos: 849, preco_promo_centavos: preco, fotos: [] }],
}).replace(/'/g, "''");

const bloco = `
DO $teste$
DECLARE
  r text := '';
  id1 uuid; id1b uuid; n int; v text; asset uuid;
BEGIN
  -- como "entrar" com um usuário: claims do JWT + papel authenticated (desfeito no fim do sub-bloco)
  -- 1) anunciante A1 cria; o mesmo pedido de novo (clique duplo) devolve a mesma produção
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', '${U.a1}', 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', '${U.a1}', true);
    EXECUTE 'set local role authenticated';
    id1 := public.studio_criar_producao('${pedido('A1 campanha')}'::jsonb, 'chave-teste-a1-0000000001');
    id1b := public.studio_criar_producao('${pedido('A1 campanha')}'::jsonb, 'chave-teste-a1-0000000001');
    r := r || format(E'\\n[1] A1 cria: %s | repetido devolve a mesma: %s', id1 is not null, id1 = id1b);
    SELECT count(*) INTO n FROM public.studio_producoes WHERE id = id1; r := r || format(E'\\n[2] A1 vê a própria: %s', n = 1);
    SELECT (produtos->0->>'preco_promo_centavos') INTO v FROM public.studio_producoes WHERE id = id1; r := r || format(E'\\n[3] preço gravado exato (699): %s', v = '699');
    BEGIN INSERT INTO public.studio_producoes (empresa_operadora_id, user_id, titulo, tipo, formato, duracao_s, cenas_qtd, briefing, produtos, chave_idempotencia)
          VALUES ('22345678-1234-1234-1234-123456789012', '${U.a1}', 'x', 'imagens', '16:9', 10, 2, '{}', '[]', 'x');
          r := r || E'\\n[4] A1 INSERT direto: PERMITIDO (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[4] A1 INSERT direto bloqueado: true'; END;
    BEGIN UPDATE public.studio_producoes SET estado = 'pronto' WHERE id = id1; GET DIAGNOSTICS n = ROW_COUNT;
          r := r || format(E'\\n[5] A1 UPDATE direto do estado bloqueado: %s', n = 0);
    EXCEPTION WHEN others THEN r := r || E'\\n[5] A1 UPDATE direto do estado bloqueado: true'; END;
    BEGIN PERFORM public.studio_aprovar_plano(id1); r := r || E'\\n[6] aprovar plano sem plano: PERMITIDO (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[6] aprovar plano fora de hora recusado: true'; END;
    BEGIN PERFORM public.studio_criar_producao('${pedido('A1 preço quebrado').replace('"preco_promo_centavos":699', '"preco_promo_centavos":6.99')}'::jsonb, 'chave-teste-a1-0000000002');
          r := r || E'\\n[7] preço com centavos quebrados: ACEITO (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[7] preço fora de centavos inteiros recusado: true'; END;
    BEGIN PERFORM public.studio_criar_producao('${pedido('A1 promo maior', 999)}'::jsonb, 'chave-teste-a1-0000000003');
          r := r || E'\\n[8] promoção maior que o preço: ACEITA (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[8] promoção maior que o preço recusada: true'; END;
    BEGIN PERFORM public.studio_criar_producao(replace('${pedido('A1 vídeo IA')}', 'video_montado', 'video_ia')::jsonb, 'chave-teste-a1-0000000004');
          r := r || E'\\n[9] vídeo por IA sem provedor: ACEITO (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[9] vídeo por IA bloqueado (sem provedor): true'; END;
    BEGIN PERFORM public.studio_consumir_cota('22345678-1234-1234-1234-123456789012', '${U.a1}', 'imagem', 1, 0);
          r := r || E'\\n[10] usuário chamando função do orquestrador: PERMITIDO (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[10] função interna (cota) bloqueada ao usuário: true'; END;
    -- limite de 3 produções em andamento
    PERFORM public.studio_criar_producao('${pedido('A1 b')}'::jsonb, 'chave-teste-a1-0000000005');
    PERFORM public.studio_criar_producao('${pedido('A1 c')}'::jsonb, 'chave-teste-a1-0000000006');
    BEGIN PERFORM public.studio_criar_producao('${pedido('A1 d')}'::jsonb, 'chave-teste-a1-0000000007');
          r := r || E'\\n[11] 4ª produção em andamento: ACEITA (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[11] limite de 3 produções em andamento: true'; END;
    SELECT count(*) INTO n FROM public.studio_uso WHERE user_id = '${U.a1}'; r := r || format(E'\\n[12] A1 vê o próprio consumo: %s', n >= 1);
    EXECUTE 'reset role';
  END;

  -- 2) outros perfis
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', '${U.a2}', 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', '${U.a2}', true);
    EXECUTE 'set local role authenticated';
    SELECT count(*) INTO n FROM public.studio_producoes; r := r || format(E'\\n[13] A2 (outro cliente) vê produções de A1: %s', n);
    SELECT count(*) INTO n FROM public.studio_etapas; r := r || format(E'\\n[14] A2 vê etapas de A1: %s', n);
    BEGIN PERFORM public.studio_cancelar(id1); r := r || E'\\n[15] A2 cancela produção de A1: PERMITIDO (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[15] A2 alterar produção de A1 recusado: true'; END;
    EXECUTE 'reset role';
  END;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', '${U.fin}', 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', '${U.fin}', true);
    EXECUTE 'set local role authenticated';
    SELECT count(*) INTO n FROM public.studio_producoes; r := r || format(E'\\n[16] FINANCEIRO vê produções: %s', n);
    BEGIN PERFORM public.studio_criar_producao('${pedido('fin')}'::jsonb, 'chave-teste-fin-000000001'); r := r || E'\\n[17] FINANCEIRO cria: PERMITIDO (FALHA)';
    EXCEPTION WHEN others THEN r := r || E'\\n[17] FINANCEIRO sem acesso ao Studio: true'; END;
    EXECUTE 'reset role';
  END;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', '${U.ges}', 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', '${U.ges}', true);
    EXECUTE 'set local role authenticated';
    SELECT count(*) INTO n FROM public.studio_producoes; r := r || format(E'\\n[18] GESTOR vê produções: %s', n);
    EXECUTE 'reset role';
  END;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', '${U.adm}', 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', '${U.adm}', true);
    EXECUTE 'set local role authenticated';
    SELECT count(*) INTO n FROM public.studio_producoes WHERE id = id1; r := r || format(E'\\n[19] ADMIN da empresa vê a produção do cliente: %s', n = 1);
    EXECUTE 'reset role';
  END;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', '${U.own}', 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', '${U.own}', true);
    EXECUTE 'set local role authenticated';
    SELECT count(*) INTO n FROM public.studio_producoes WHERE id = id1; r := r || format(E'\\n[20] OWNER vê a produção do cliente: %s', n = 1);
    EXECUTE 'reset role';
  END;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', '${U.outra}', 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', '${U.outra}', true);
    EXECUTE 'set local role authenticated';
    SELECT count(*) INTO n FROM public.studio_producoes; r := r || format(E'\\n[21] ADMIN de OUTRA empresa vê produções desta: %s', n);
    EXECUTE 'reset role';
  END;

  -- 3) orquestrador (service): transições e corrida
  r := r || format(E'\\n[22] recebido→planejando: %s', public.studio_mudar_estado(id1, 'recebido', 'planejando'));
  r := r || format(E'\\n[23] repetir a mesma mudança (corrida) não faz nada: %s', NOT public.studio_mudar_estado(id1, 'recebido', 'planejando'));
  BEGIN PERFORM public.studio_mudar_estado(id1, 'planejando', 'pronto'); r := r || E'\\n[24] pular etapa planejando→pronto: PERMITIDO (FALHA)';
  EXCEPTION WHEN others THEN r := r || E'\\n[24] transição inválida recusada: true'; END;
  SELECT count(*) INTO n FROM public.studio_reservar(5); r := r || format(E'\\n[25] reserva de trabalho pendente (lease): %s produções', n);
  SELECT count(*) INTO n FROM public.studio_reservar(5); r := r || format(E'\\n[26] reservar de novo não pega as mesmas: %s', n = 0);

  -- 4) entrega: simula conferência aprovada e o anunciante envia para Minhas Mídias
  UPDATE public.studio_producoes SET estado = 'pronto', resultado = '{"video_url":"https://exemplo.invalid/v.mp4","video_path":"tenants/x/studio/v.mp4","largura":1920,"altura":1080,"tamanho":123456,"quadros":["https://exemplo.invalid/q1.jpg"]}' WHERE id = id1;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', '${U.a1}', 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', '${U.a1}', true);
    EXECUTE 'set local role authenticated';
    asset := (public.studio_entregar(id1, null)->>'id')::uuid;
    SELECT moderacao_status || '/' || (cliente_id = 'dedef2eb-d672-4d5c-9fcf-5689923f3fa7') INTO v FROM public.cliente_assets WHERE id = asset;
    r := r || format(E'\\n[27] entrega vira cliente_assets do próprio cliente, em análise: %s', v);
    SELECT estado INTO v FROM public.studio_producoes WHERE id = id1; r := r || format(E'\\n[28] produção marcada entregue: %s', v = 'entregue');
    EXECUTE 'reset role';
  END;
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', '${U.a2}', 'role', 'authenticated')::text, true);
    PERFORM set_config('request.jwt.claim.sub', '${U.a2}', true);
    EXECUTE 'set local role authenticated';
    SELECT count(*) INTO n FROM public.cliente_assets WHERE id = asset; r := r || format(E'\\n[29] A2 vê a mídia entregue a A1: %s', n);
    EXECUTE 'reset role';
  END;
  RAISE EXCEPTION 'RESULTADO %', r;
END $teste$;`;

try {
  await sql(migracao + '\n' + bloco);
  console.error('ERRO: o bloco não terminou em exceção — confira se algo foi gravado!');
  process.exit(1);
} catch (e) {
  const m = /RESULTADO([\s\S]*?)(\\n?"|$)/.exec(e.message);
  if (!m) { console.error('falha antes dos testes:', e.message.slice(0, 1500)); process.exit(1); }
  const linhas = m[1].replace(/\\n/g, '\n').trim();
  console.log(linhas);
  const falhas = linhas.split('\n').filter((l) => /FALHA|: false|vê produções de A1: [1-9]|vê etapas de A1: [1-9]|FINANCEIRO vê produções: [1-9]|GESTOR vê produções: [1-9]|OUTRA empresa vê produções desta: [1-9]|entregue a A1: [1-9]/.test(l));
  console.log(falhas.length ? `\n✘ ${falhas.length} caso(s) falharam` : '\n✔ todos os casos passaram (e nada foi gravado: a transação foi desfeita)');
  process.exit(falhas.length ? 1 : 0);
}
