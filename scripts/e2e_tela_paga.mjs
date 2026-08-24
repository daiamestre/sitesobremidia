import fs from 'fs'; import os from 'os'; import path from 'path';
const token = fs.readFileSync(path.join(os.tmpdir(), 'sb_token2.tmp'), 'utf8').trim();
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const t = await res.text();
  return res.ok ? JSON.parse(t) : { erro: JSON.parse(t).message };
};
const T = 'eeeeeeee-0000-0000-0000-00000000e001';
// setup
await q(`INSERT INTO empresa_operadora (id, nome, nome_fantasia, cnpj, email, status) VALUES ('${T}','E2E','E2E','00000000000000','e@e.local','ACTIVE') ON CONFLICT (id) DO NOTHING`);
console.log('1) gerar cobranca:', JSON.stringify(await q(`SELECT public.criar_cobranca_tela('${T}'::uuid, NULL)`)));
const cob = await q(`SELECT id FROM contas_receber WHERE empresa_operadora_id='${T}' ORDER BY created_at DESC LIMIT 1`);
const cobId = cob[0].id;

console.log('2) tentar criar tela SEM pagar (deve FALHAR):', JSON.stringify(await q(`SELECT public.criar_tela_gestor('${T}'::uuid,'${cobId}','Tela Teste',NULL,'vertical',NULL,NULL)`)));

// pagamento real via conciliação
console.log('3a) insert pagamento:', JSON.stringify(await q(`INSERT INTO pagamentos (empresa_operadora_id, conta_receber_id, meio_pagamento, valor_pago, transacao_id_externo) VALUES ('${T}','${cobId}','PIX',22.99,'E2E-TELA-TX1') RETURNING id`)));
console.log('3) status conta pos-webhook:', JSON.stringify(await q(`SELECT status FROM contas_receber WHERE id='${cobId}'`)));

console.log('4) criar tela PAGA:', JSON.stringify(await q(`SELECT public.criar_tela_gestor('${T}'::uuid,'${cobId}','Hotel Maxsuel - Recepcao','Av Central','vertical','https://capa.test/1.jpg',NULL)`)));
console.log('5) DUPLICATA mesma cobranca (deve FALHAR):', JSON.stringify(await q(`SELECT public.criar_tela_gestor('${T}'::uuid,'${cobId}','Outra Tela')`)));
console.log('6) telas criadas:', JSON.stringify(await q(`SELECT name, capa_url, cobranca_id IS NOT NULL AS tem_cob, criada_por_gestor FROM screens WHERE empresa_operadora_id='${T}'`)));
console.log('7) auditoria:', JSON.stringify(await q(`SELECT evento FROM financeiro_auditoria WHERE empresa_operadora_id='${T}' ORDER BY created_at`)));

// cleanup
await q(`DELETE FROM screens WHERE empresa_operadora_id='${T}'`);
await q(`DELETE FROM pagamentos WHERE empresa_operadora_id='${T}'`);
await q(`DELETE FROM financeiro_auditoria WHERE empresa_operadora_id='${T}'`);
await q(`DELETE FROM contas_receber WHERE empresa_operadora_id='${T}'`);
await q(`DELETE FROM empresa_operadora WHERE id='${T}'`);
console.log('cleanup ok');
