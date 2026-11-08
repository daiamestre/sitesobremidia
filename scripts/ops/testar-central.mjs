// Prova da CENTRAL DE COMANDO (MG-AUT-07, F-266) contra o banco real com a CONTA DE TESTE:
//   1) node scripts/ops/funcao-local.mjs agente-ia      (função local, nada publicado)
//   2) node scripts/ops/sessao-teste.mjs                 (sessão da conta de teste, entregue uma vez)
//   3) node scripts/ops/testar-central.mjs "pedido em português" ["pedido 2" …]   (mantém o histórico da conversa)
// Imprime a resposta, as ferramentas usadas e as produções (estado REAL) devolvidas. A sessão nunca é impressa.
const URL_FUNCAO = process.env.CENTRAL_URL ?? 'http://127.0.0.1:8000/';
const pedidos = process.argv.slice(2);
if (!pedidos.length) { console.log('uso: node scripts/ops/testar-central.mjs "pedido" ["pedido 2" …]'); process.exit(1); }
const s = await (await fetch('http://127.0.0.1:8767/')).json();
const token = s.session?.access_token;
if (!token) { console.error('sem sessão de teste (rode scripts/ops/sessao-teste.mjs)'); process.exit(1); }
console.log(`conta: ${s.session.user.email}`);
const historico = [];
for (const pergunta of pedidos) {
  const r = await fetch(URL_FUNCAO, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ acao: 'perguntar', pergunta, historico }) });
  const j = await r.json();
  console.log(`\n>>> ${pergunta}\n[${r.status}] via ${j.provedor ?? '-'} · ferramentas: ${(j.ferramentas ?? []).join(', ') || 'nenhuma'}`);
  console.log(j.resposta ?? j.error);
  for (const p of j.producoes ?? []) console.log(`  PRODUÇÃO ${p.id} · ${p.estado} · ${p.situacao}${p.o_que_fazer ? ` · sua vez: ${p.o_que_fazer}` : ''} · ${p.abrir_no_studio}`);
  historico.push({ role: 'user', content: pergunta }, { role: 'assistant', content: String(j.resposta ?? '') });
}
