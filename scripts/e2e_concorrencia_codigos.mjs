import fs from 'fs'; import os from 'os'; import path from 'path';
const token = fs.readFileSync(path.join(os.tmpdir(), 'sb_token2.tmp'), 'utf8').trim();
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const t = await res.text();
  return res.ok ? JSON.parse(t) : { erro: t.slice(0, 300) };
};
const T = 'eeeeeeee-0000-0000-0000-00000000e001';
// setup mínimo reutilizável
await q(`INSERT INTO empresa_operadora (id, nome, nome_fantasia, cnpj, email, status) VALUES ('${T}','E2E','E2E','00000000000000','e@e.local','ACTIVE') ON CONFLICT (id) DO NOTHING`);
await q(`DELETE FROM contas_receber WHERE empresa_operadora_id='${T}'`);
await q(`DELETE FROM contratos WHERE empresa_operadora_id='${T}'`);
await q(`DELETE FROM clientes WHERE empresa_operadora_id='${T}'`);
await q(`INSERT INTO clientes (id, empresa_operadora_id, codigo_cliente, status) VALUES ('eeeeeeee-0000-0000-0000-00000000c001','${T}',900002,'ACTIVE') ON CONFLICT DO NOTHING`);
await q(`DELETE FROM contas_receber WHERE empresa_operadora_id='${T}'`);
await q(`DELETE FROM contratos WHERE empresa_operadora_id='${T}'`);
await q(`INSERT INTO empresas (id, cliente_id, razao_social, nome_fantasia, cnpj, whatsapp, email) VALUES ('eeeeeeee-0000-0000-0000-00000000e002','eeeeeeee-0000-0000-0000-00000000c001','E2E LTDA','E2E','00011122233344','41988887777','f@e.local') ON CONFLICT DO NOTHING`);
console.log('setup contrato:', await q(`INSERT INTO contratos (id, empresa_operadora_id, empresa_id, cliente_id, representante_id, numero_contrato, valor_mensal, data_inicio, data_fim, forma_pagamento, tipo_contrato, status_workflow) SELECT 'eeeeeeee-0000-0000-0000-0000000000eb','${T}','eeeeeeee-0000-0000-0000-00000000e002','eeeeeeee-0000-0000-0000-00000000c001',(SELECT id FROM representantes LIMIT 1),'E2E-CONC',10,CURRENT_DATE-1,CURRENT_DATE+30,'PIX','ANUNCIANTE','CAMPANHA_ATIVA' RETURNING id`));

// 20 inserts PARALELOS (race real)
const ids = Array.from({ length: 20 }, (_, i) => `eeeeeeee-0000-0000-0000-${String(100000 + i).padStart(12, '0')}`);
const resultados = await Promise.allSettled(ids.map((id) =>
  q(`INSERT INTO contas_receber (id, empresa_operadora_id, cliente_id, contrato_id, valor, data_vencimento, status) VALUES ('${id}','${T}','eeeeeeee-0000-0000-0000-00000000c001','eeeeeeee-0000-0000-0000-0000000000eb',10,CURRENT_DATE,'PENDENTE') RETURNING codigo_operacional`)
));
const ok = resultados.filter(r => r.status === 'fulfilled' && JSON.stringify(r.value).includes('COB-'));
console.log(JSON.stringify({
  insercoes_ok: ok.length,
  falhas: resultados.length - ok.length,
  codigos_unicos: [...new Set(ok.map(r => JSON.parse(JSON.stringify(r.value))[0].codigo_operacional))].length,
}, null, 1));

await q(`DELETE FROM contas_receber WHERE empresa_operadora_id='${T}'`);
await q(`DELETE FROM contratos WHERE empresa_operadora_id='${T}'`);
await q(`DELETE FROM empresas WHERE id='eeeeeeee-0000-0000-0000-00000000e002'`);
await q(`DELETE FROM clientes WHERE empresa_operadora_id='${T}'`);
await q(`DELETE FROM empresa_operadora WHERE id='${T}'`);
console.log('cleanup ok');
