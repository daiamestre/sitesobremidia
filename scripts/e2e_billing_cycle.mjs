import fs from 'fs'; import os from 'os'; import path from 'path';
const token = fs.readFileSync(path.join(os.tmpdir(), 'sb_token2.tmp'), 'utf8').trim();
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const t = await res.text();
  return res.ok ? JSON.parse(t) : { erro: t.slice(0, 300) };
};

const TENANT = 'eeeeeeee-0000-0000-0000-00000000e001';

// 0. Secret do worker para autenticar o webhook
const sec = await q(`SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='BILLING_WORKER_SECRET' LIMIT 1`);
const WORKER_SECRET = sec[0].decrypted_secret;

// 1. Setup: tenant + empresa/cliente + contrato + cobrança vencida há 5 dias
await q(`DELETE FROM pagamentos WHERE conta_receber_id IN (SELECT id FROM contas_receber WHERE empresa_operadora_id='${TENANT}')`);
await q(`DELETE FROM financeiro_auditoria WHERE empresa_operadora_id='${TENANT}'`);
await q(`DELETE FROM jobs WHERE empresa_operadora_id='${TENANT}'`);
await q(`DELETE FROM contas_receber WHERE empresa_operadora_id='${TENANT}'`);
await q(`DELETE FROM contratos WHERE empresa_operadora_id='${TENANT}'`);
await q(`DELETE FROM empresas WHERE cliente_id IN (SELECT id FROM clientes WHERE empresa_operadora_id='${TENANT}')`);
await q(`DELETE FROM clientes WHERE empresa_operadora_id='${TENANT}'`);
await q(`DELETE FROM representantes WHERE empresa_operadora_id='${TENANT}'`);
await q(`DELETE FROM empresa_operadora WHERE id='${TENANT}'`);

console.log('setup tenant:', await q(`INSERT INTO empresa_operadora (id, nome, nome_fantasia, cnpj, email, status) VALUES ('${TENANT}','E2E TESTE','E2E Teste','00000000000000','e2e@teste.local','ACTIVE') ON CONFLICT (id) DO NOTHING RETURNING id`));
console.log('setup cliente:', await q(`INSERT INTO clientes (id, empresa_operadora_id, codigo_cliente, status) VALUES ('eeeeeeee-0000-0000-0000-00000000c001','${TENANT}',900001,'ACTIVE') RETURNING id`));
console.log('setup empresa:', await q(`INSERT INTO empresas (id, cliente_id, razao_social, nome_fantasia, cnpj, whatsapp, email) VALUES ('eeeeeeee-0000-0000-0000-00000000e002','eeeeeeee-0000-0000-0000-00000000c001','Cliente E2E LTDA','Cliente E2E','00011122233344','41988887777','financeiro@e2e-teste.com') RETURNING id`));
console.log('setup contato fin:', await q(`INSERT INTO contatos (empresa_id, nome, email, telefone, cargo, is_principal) VALUES ('eeeeeeee-0000-0000-0000-00000000e002','Maria Financeiro','maria@e2e-teste.com','41999990000','Gerente Financeiro',true) RETURNING id`));
console.log('setup contrato:', await q(`INSERT INTO contratos (id, empresa_operadora_id, empresa_id, cliente_id, representante_id, numero_contrato, valor_mensal, data_inicio, data_fim, forma_pagamento, tipo_contrato, status_workflow) VALUES ('eeeeeeee-0000-0000-0000-0000000000ea','${TENANT}','eeeeeeee-0000-0000-0000-00000000e002','eeeeeeee-0000-0000-0000-00000000c001',(SELECT id FROM representantes LIMIT 1),'E2E-CTR-001',1500, CURRENT_DATE - 40, CURRENT_DATE + 320,'PIX','ANUNCIANTE','CAMPANHA_ATIVA') RETURNING id`));
console.log('setup conta vencida D-5:', await q(`INSERT INTO contas_receber (id, empresa_operadora_id, contrato_id, cliente_id, valor, data_vencimento, status, recorrencia, metodo_cobranca, competencia_date, numero_documento) VALUES ('eeeeeeee-0000-0000-0000-0000000000a5','${TENANT}','eeeeeeee-0000-0000-0000-0000000000ea','eeeeeeee-0000-0000-0000-00000000c001',1500, CURRENT_DATE - 5,'PENDENTE','MENSAL','PIX', date_trunc('month',CURRENT_DATE),'E2E-CTR-001/MM') RETURNING id`));

// 2. RÉGUA → deve enfileirar C3, marcar INADIMPLENTE e bloquear cliente
console.log('\n[REGUA]', JSON.stringify(await q(`SELECT public.processar_regua_cobranca('${TENANT}'::uuid)`)));
console.log('estado conta:', JSON.stringify(await q(`SELECT status, situacao_cobranca FROM contas_receber WHERE id='eeeeeeee-0000-0000-0000-0000000000a5'`)));
console.log('cliente bloqueado:', JSON.stringify(await q(`SELECT bloqueio_financeiro, bloqueio_motivo IS NOT NULL AS tem_motivo FROM clientes WHERE id='eeeeeeee-0000-0000-0000-00000000c001'`)));
console.log('jobs:', JSON.stringify(await q(`SELECT tipo_job, status FROM jobs WHERE empresa_operadora_id='${TENANT}'`)));

// 3. WEBHOOK de pagamento → PAGA + cancela fila + reativação
const wh = await fetch('https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/payment-webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WORKER_SECRET}` },
  body: JSON.stringify({
    conta_receber_id: 'eeeeeeee-0000-0000-0000-0000000000a5',
    transacao_id_externo: 'E2E-TX-001',
    valor_pago: 1500,
    meio_pagamento: 'PIX',
  })
});
console.log('\n[WEBHOOK 1a chamada]', wh.status, await wh.text());

const wh2 = await fetch('https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/payment-webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WORKER_SECRET}` },
  body: JSON.stringify({
    conta_receber_id: 'eeeeeeee-0000-0000-0000-0000000000a5',
    transacao_id_externo: 'E2E-TX-001',
    valor_pago: 1500,
  })
});
console.log('[WEBHOOK duplicada/idempotente]', wh2.status, await wh2.text());

console.log('conta pos-pagamento:', JSON.stringify(await q(`SELECT status, valor_pago, saldo, situacao_cobranca FROM contas_receber WHERE id='eeeeeeee-0000-0000-0000-0000000000a5'`)));
console.log('cliente reativado:', JSON.stringify(await q(`SELECT bloqueio_financeiro FROM clientes WHERE id='eeeeeeee-0000-0000-0000-00000000c001'`)));
console.log('jobs pos-pagamento:', JSON.stringify(await q(`SELECT tipo_job, status FROM jobs WHERE empresa_operadora_id='${TENANT}' ORDER BY tipo_job`)));
console.log('auditoria:', JSON.stringify(await q(`SELECT evento FROM financeiro_auditoria WHERE empresa_operadora_id='${TENANT}' ORDER BY created_at`)));

// 4. RECORRÊNCIA no tenant teste (contrato vigente deve gerar competências)
console.log('\n[RECORRENCIA]', JSON.stringify(await q(`SELECT public.gerar_cobrancas_recorrentes('${TENANT}'::uuid, 1)`)));
console.log('contas recorrentes:', JSON.stringify(await q(`SELECT COUNT(*) n FROM contas_receber WHERE empresa_operadora_id='${TENANT}' AND recorrencia='MENSAL' AND gerada_automaticamente`)));

// 4b. Quitar também a recorrente → todas liquidadas → REATIVAÇÃO automática
const rec = await q(`SELECT id FROM contas_receber WHERE empresa_operadora_id='${TENANT}' AND recorrencia='MENSAL' AND status <> 'PAGA' LIMIT 1`);
if (rec[0]?.id) {
  const wh3 = await fetch('https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/payment-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WORKER_SECRET}` },
    body: JSON.stringify({ conta_receber_id: rec[0].id, transacao_id_externo: 'E2E-TX-002', valor_pago: 1500, meio_pagamento: 'PIX' })
  });
  console.log('[WEBHOOK recorrente]', wh3.status, await wh3.text());
}
console.log('todas pagas?:', JSON.stringify(await q(`SELECT bool_and(status='PAGA') todas_pagas FROM contas_receber WHERE empresa_operadora_id='${TENANT}'`)));
console.log('cliente reativado:', JSON.stringify(await q(`SELECT bloqueio_financeiro FROM clientes WHERE id='eeeeeeee-0000-0000-0000-00000000c001'`)));

// 4c. Worker processa fila (COLECTION_PAID) — destinatário de teste (.local) valida pipeline de envio/retry
const pw = await fetch('https://bhwsybgsyvvhqtkdqozb.supabase.co/functions/v1/billing-worker', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${WORKER_SECRET}` },
  body: JSON.stringify({ action: 'process_queue', empresa_operadora_id: TENANT, limit: 10 })
});
console.log('\n[WORKER process_queue]', pw.status, await pw.text());

// 5. Cleanup total do tenant de teste
await q(`DELETE FROM pagamentos WHERE conta_receber_id IN (SELECT id FROM contas_receber WHERE empresa_operadora_id='${TENANT}')`);
await q(`DELETE FROM jobs WHERE empresa_operadora_id='${TENANT}'`);
await q(`DELETE FROM financeiro_auditoria WHERE empresa_operadora_id='${TENANT}'`);
await q(`DELETE FROM contas_receber WHERE empresa_operadora_id='${TENANT}'`);
await q(`DELETE FROM contratos WHERE empresa_operadora_id='${TENANT}'`);
await q(`DELETE FROM contatos WHERE empresa_id='eeeeeeee-0000-0000-0000-00000000e002'`);
await q(`DELETE FROM empresas WHERE cliente_id IN (SELECT id FROM clientes WHERE empresa_operadora_id='${TENANT}')`);
await q(`DELETE FROM clientes WHERE empresa_operadora_id='${TENANT}'`);
await q(`DELETE FROM representantes WHERE empresa_operadora_id='${TENANT}'`);
const del = await q(`DELETE FROM empresa_operadora WHERE id='${TENANT}' RETURNING id`);
console.log('\n[cleanup] tenant removido:', JSON.stringify(del));
