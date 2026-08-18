const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const URL = 'https://bhwsybgsyvvhqtkdqozb.supabase.co';
const MGMT_TOKEN = fs.readFileSync(path.join(os.tmpdir(), 'sb_token2.tmp'), 'utf8').trim();
const KEYS = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), 'sb_keys.json'), 'utf8'));
const ANON = KEYS.find((k) => k.name === 'anon').api_key;
const SR = KEYS.find((k) => k.name === 'service_role').api_key;

const TENANT_A = '7d62aaec-e24d-4273-b257-867183cf658c';
const TENANT_B = '99999999-9999-9999-9999-999999999999';
const PERFIL_ADMIN = '039a07d6-e7ae-485e-8961-81ead9640f5d';
const PERFIL_REP = 'f8e7d6c5-b4a3-4000-8000-000000000001';
const PASSWORD = 'R3dT3am!@2026#';
const RUN = Date.now();

const results = [];
function report(id, name, expected, actual, ok) {
  results.push({ id, name, expected, actual, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${id} | ${name}`);
  console.log(`      esperado: ${expected}`);
  console.log(`      obtido  : ${actual}`);
}
const is2xx = (s) => s >= 200 && s < 300;

async function mgmt(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + MGMT_TOKEN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const data = await r.json().catch(() => null);
  return { status: r.status, data };
}

async function rest(table, token, method, opts = {}) {
  let url = `${URL}/rest/v1/${table}`;
  const headers = { apikey: ANON, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  if (opts.prefer) headers['Prefer'] = opts.prefer;
  if (opts.params) url += '?' + new URLSearchParams(opts.params).toString();
  const r = await fetch(url, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const text = await r.text();
  let body = null;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: r.status, body };
}
const rpc = (token, fn, args) => rest(`rpc/${fn}`, token, 'POST', { body: args });

async function signIn(email) {
  const r = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const data = await r.json();
  if (!r.ok || !data.access_token) throw new Error(`Login falhou ${email}: ${r.status} ${JSON.stringify(data)}`);
  return data.access_token;
}

async function createAuthUser(email) {
  const r = await fetch(`${URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: { apikey: SR, Authorization: 'Bearer ' + SR, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD, email_confirm: true }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Criação auth falhou ${email}: ${r.status} ${JSON.stringify(data)}`);
  return data.id;
}

async function deleteAuthUser(id) {
  await fetch(`${URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: { apikey: SR, Authorization: 'Bearer ' + SR },
  });
}

async function cleanupAll(ids) {
  if (ids && ids.length) {
    await mgmt(`DELETE FROM public.notificacoes_central WHERE usuario_id IN (${ids.map((i) => `'${i}'`).join(',')})`);
    await mgmt(`DELETE FROM public.auditoria_logs WHERE usuario_id IN (${ids.map((i) => `'${i}'`).join(',')})`);
    await mgmt(`DELETE FROM public.representantes WHERE usuario_id IN (${ids.map((i) => `'${i}'`).join(',')})`);
    await mgmt(`DELETE FROM public.permissoes_usuarios WHERE usuario_id IN (${ids.map((i) => `'${i}'`).join(',')})`);
    await mgmt(`DELETE FROM public.solicitacoes_acesso WHERE email_usuario LIKE 'rt-%@sobremidia.com.br'`);
    await mgmt(`DELETE FROM public.usuarios WHERE id IN (${ids.map((i) => `'${i}'`).join(',')})`);
    for (const id of ids) await deleteAuthUser(id);
  }
  const leftover = await mgmt(`SELECT id, email FROM auth.users WHERE email LIKE 'rt-%@sobremidia.com.br'`);
  if (Array.isArray(leftover.data) && leftover.data.length) {
    const ids = leftover.data.map((x) => x.id);
    await mgmt(`DELETE FROM public.notificacoes_central WHERE usuario_id IN (${ids.map((i) => `'${i}'`).join(',')})`);
    await mgmt(`DELETE FROM public.auditoria_logs WHERE usuario_id IN (${ids.map((i) => `'${i}'`).join(',')})`);
    await mgmt(`DELETE FROM public.representantes WHERE usuario_id IN (${ids.map((i) => `'${i}'`).join(',')})`);
    await mgmt(`DELETE FROM public.permissoes_usuarios WHERE usuario_id IN (${ids.map((i) => `'${i}'`).join(',')})`);
    await mgmt(`DELETE FROM public.solicitacoes_acesso WHERE email_usuario LIKE 'rt-%@sobremidia.com.br'`);
    await mgmt(`DELETE FROM public.usuarios WHERE id IN (${ids.map((i) => `'${i}'`).join(',')})`);
    for (const x of leftover.data) await deleteAuthUser(x.id);
    console.log(`Cleanup de execuções anteriores: ${leftover.data.length} usuário(s) rt-* removido(s)`);
  }
}

(async () => {
  const u = {
    ownerA: { email: `rt-ownera-${RUN}@sobremidia.com.br` },
    adminA: { email: `rt-admima-${RUN}@sobremidia.com.br` },
    repA: { email: `rt-repa-${RUN}@sobremidia.com.br` },
    ownerB: { email: `rt-ownerb-${RUN}@sobremidia.com.br` },
    adminB: { email: `rt-admimb-${RUN}@sobremidia.com.br` },
    novo: { email: `rt-novo-${RUN}@sobremidia.com.br` },
    selfreg: { email: `rt-selfreg-${RUN}@sobremidia.com.br` },
  };
  let solA = null;
  let solLegitima = null;

  try {
    console.log('== CLEANUP PRÉVIO ==');
    await cleanupAll(null);

    console.log('== SETUP ==');
    for (const k of Object.keys(u)) u[k].authId = await createAuthUser(u[k].email);
    await mgmt(`INSERT INTO public.usuarios (id, email, nome, empresa_operadora_id, perfil_id, is_owner, ativo, status)
      VALUES ('${u.ownerA.authId}', '${u.ownerA.email}', 'Owner A', '${TENANT_A}', '${PERFIL_ADMIN}', true, true, 'ACTIVE'),
             ('${u.adminA.authId}', '${u.adminA.email}', 'Admin A', '${TENANT_A}', '${PERFIL_ADMIN}', false, true, 'ACTIVE'),
             ('${u.repA.authId}', '${u.repA.email}', 'Rep A', '${TENANT_A}', '${PERFIL_REP}', false, true, 'ACTIVE'),
             ('${u.ownerB.authId}', '${u.ownerB.email}', 'Owner B', '${TENANT_B}', '${PERFIL_ADMIN}', true, true, 'ACTIVE'),
             ('${u.adminB.authId}', '${u.adminB.email}', 'Admin B', '${TENANT_B}', '${PERFIL_ADMIN}', false, true, 'ACTIVE')`);
    await mgmt(`INSERT INTO public.representantes (id, usuario_id, nome, email, empresa_operadora_id, cargo)
      VALUES (gen_random_uuid(), '${u.repA.authId}', 'Rep A', '${u.repA.email}', '${TENANT_A}', 'Representante')`);
    const hashTokenHelper = (t) => crypto.createHash('sha256').update(t).digest('hex');
    solA = await mgmt(`INSERT INTO public.solicitacoes_acesso
      (empresa_operadora_id, auth_user_id, tipo_acesso, nome_usuario, email_usuario, status,
       approval_token_hash, approval_token_expires_at)
      VALUES ('${TENANT_A}', '${u.repA.authId}', 'REPRESENTANTE', 'Solicitacao Tenant A',
              'rt-solA-${RUN}@sobremidia.com.br', 'PENDING',
              '${hashTokenHelper('token-legitimo-a')}', NOW() + INTERVAL '48 hours')
      RETURNING id`);
    solA = Array.isArray(solA.data) ? solA.data[0]?.id : null;
    const tokens = {};
    for (const k of Object.keys(u)) tokens[k] = await signIn(u[k].email);
    console.log('SETUP OK\n');

    console.log('== RED TEAM: ataques (devem FALHAR) ==');

    // ATK-1 F1
    {
      const r = await rest(`usuarios?id=eq.${u.adminA.authId}`, tokens.adminA, 'PATCH', { body: { is_owner: true }, prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-1', 'ADMIN auto-promove para OWNER', 'rejeitado', `${r.status}${rows.length ? ' (!!) is_owner=' + rows[0].is_owner : ''}`, !is2xx(r.status) || rows.length === 0);
    }

    // ATK-2 F1
    {
      const r = await rest(`usuarios?id=eq.${u.repA.authId}`, tokens.adminA, 'PATCH', { body: { is_owner: true }, prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-2', 'ADMIN promove terceiro a OWNER', 'rejeitado', `${r.status}${rows.length ? ' (!!) is_owner=' + rows[0].is_owner : ''}`, !is2xx(r.status) || rows.length === 0);
    }

    // ATK-3 F2
    {
      await rest(`usuarios?id=eq.${u.repA.authId}`, tokens.ownerA, 'PATCH', { body: { ativo: false, status: 'INACTIVE' } });
      const r = await rest(`usuarios?id=eq.${u.repA.authId}`, tokens.repA, 'PATCH', { body: { ativo: true, status: 'ACTIVE' }, prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-3', 'Desativado reativa a própria conta', 'rejeitado', `${r.status}${rows.length ? ' (!!) ativo=' + rows[0].ativo : ''}`, !is2xx(r.status) || rows.length === 0);
    }

    // ATK-4 F3
    {
      const r = await rest('usuarios', tokens.repA, 'POST', { body: { id: u.repA.authId, email: u.repA.email, nome: 'Forjado', empresa_operadora_id: TENANT_B, perfil_id: PERFIL_ADMIN, is_owner: true, ativo: true, status: 'ACTIVE' }, prefer: 'return=representation' });
      report('ATK-4', 'INSERT forjado (perfil ADMIN/tenant B/owner)', 'rejeitado (403)', `${r.status} ${is2xx(r.status) ? '(!!) inserido' : JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    // ATK-5 F4
    {
      const r = await rest('usuarios', tokens.adminA, 'GET', { params: { select: 'email', empresa_operadora_id: `eq.${TENANT_B}` } });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-5', 'Admin A lê usuários do tenant B', '0 linhas', `${r.status} ${rows.length} linhas`, is2xx(r.status) && rows.length === 0);
    }

    // ATK-6 F5
    {
      const r = await rest('representantes', tokens.adminA, 'GET', { params: { select: 'cpf_cnpj', empresa_operadora_id: `eq.${TENANT_B}` } });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-6', 'Admin A lê representantes do tenant B', '0 linhas', `${r.status} ${rows.length} linhas`, is2xx(r.status) && rows.length === 0);
    }

    // ATK-7 F6
    {
      const r = await rest('empresa_operadora', tokens.adminA, 'GET', { params: { select: 'nome', id: `eq.${TENANT_B}` } });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-7', 'Admin A lê empresa_operadora do tenant B', '0 linhas', `${r.status} ${rows.length} linhas`, is2xx(r.status) && rows.length === 0);
    }

    // ATK-8 F7
    {
      const r = await rest('auditoria_logs', tokens.adminA, 'GET', { params: { select: 'acao', empresa_operadora_id: `eq.${TENANT_B}` } });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-8', 'Admin A lê auditoria do tenant B', '0 linhas', `${r.status} ${rows.length} linhas`, is2xx(r.status) && rows.length === 0);
    }

    // ATK-9 F2
    {
      const r = await rest(`usuarios?id=eq.${u.repA.authId}`, tokens.repA, 'PATCH', { body: { perfil_id: PERFIL_ADMIN }, prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-9', 'RepA muda o próprio perfil p/ ADMIN', 'rejeitado', `${r.status}${rows.length ? ' (!!) perfil alterado' : ''}`, !is2xx(r.status) || rows.length === 0);
    }

    // ATK-10 F10
    {
      const r = await rest(`usuarios?id=eq.${u.repA.authId}`, tokens.repA, 'PATCH', { body: { empresa_operadora_id: TENANT_B }, prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-10', 'RepA troca o próprio tenant', 'rejeitado', `${r.status}${rows.length ? ' (!!) tenant trocado' : ''}`, !is2xx(r.status) || rows.length === 0);
    }

    // ATK-11 F7
    {
      const r = await rest('auditoria_logs', tokens.adminA, 'POST', { body: { usuario_id: u.adminA.authId, empresa_operadora_id: TENANT_B, entidade_tipo: 'USUARIO', entidade_id: u.adminA.authId, acao: 'FORGED' }, prefer: 'return=representation' });
      report('ATK-11', 'INSERT forjado de auditoria (tenant B)', 'rejeitado (403)', `${r.status} ${is2xx(r.status) ? '(!!) inserido' : JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    // ATK-12 F8
    {
      const r = await rest('permissoes_usuarios', tokens.repA, 'GET', { params: { select: 'permissao', 'usuario_id': `neq.${u.repA.authId}` } });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-12', 'RepA lê permissões de outros usuários', '0 linhas', `${r.status} ${rows.length} linhas`, is2xx(r.status) && rows.length === 0);
    }

    // ATK-13 F8
    {
      const r = await rest(`usuarios?id=eq.${u.adminA.authId}`, tokens.repA, 'PATCH', { body: { perfil_id: PERFIL_REP }, prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-13', 'RepA altera perfil do AdminA', 'rejeitado', `${r.status}${rows.length ? ' (!!) perfil alterado' : ''}`, !is2xx(r.status) || rows.length === 0);
    }

    // ATK-14 F1
    {
      const r = await rest(`usuarios?id=eq.${u.ownerA.authId}`, tokens.adminA, 'PATCH', { body: { is_owner: false }, prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-14', 'ADMIN destitui o OWNER', 'rejeitado', `${r.status}${rows.length ? ' (!!) is_owner=' + rows[0].is_owner : ''}`, !is2xx(r.status) || rows.length === 0);
    }

    // ATK-15 F4
    {
      const r = await rest(`usuarios?id=eq.${u.adminA.authId}`, tokens.adminB, 'PATCH', { body: { nome: 'Hackeado B' }, prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-15', 'Admin B altera usuário do tenant A', '0 linhas', `${r.status} ${rows.length} linhas${rows.length ? ' (!!)' : ''}`, is2xx(r.status) && rows.length === 0);
    }

    // ATK-16
    {
      const r = await rpc(tokens.ownerA, 'atualizar_usuario_corporativo', { p_alvo_id: u.ownerB.authId, p_nome: 'X', p_telefone: null, p_perfil_id: null });
      report('ATK-16', 'OwnerA edita OwnerB via RPC (cross-tenant)', 'rejeitado', `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    // ATK-17
    {
      const r = await rpc(tokens.repA, 'criar_usuario_corporativo', { p_uid: u.novo.authId, p_email: u.novo.email, p_nome: 'Novo', p_telefone: null, p_perfil_id: PERFIL_REP });
      report('ATK-17', 'RepA cria usuário via RPC', 'rejeitado', `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    // ATK-18
    {
      const r = await rpc(tokens.adminA, 'atualizar_usuario_corporativo', { p_alvo_id: u.repA.authId, p_nome: 'Novo Nome', p_telefone: null, p_perfil_id: null });
      report('ATK-18', 'AdminA edita via RPC sem users.edit', 'rejeitado', `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    // ATK-19 (AdminA com users.create, sem users.create_admin)
    {
      await mgmt(`INSERT INTO public.permissoes_usuarios (usuario_id, permissao, empresa_operadora_id, concedida_por)
        VALUES ('${u.adminA.authId}', 'users.create', '${TENANT_A}', '${u.ownerA.authId}')`);
      const r = await rpc(tokens.adminA, 'criar_usuario_corporativo', { p_uid: u.novo.authId, p_email: u.novo.email, p_nome: 'Novo', p_telefone: null, p_perfil_id: PERFIL_ADMIN });
      report('ATK-19', 'AdminA cria ADMIN sem users.create_admin', 'rejeitado', `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    // ATK-20 (AdminA com users.deactivate ausente — RepA reativado primeiro)
    {
      await rest(`usuarios?id=eq.${u.repA.authId}`, tokens.ownerA, 'PATCH', { body: { ativo: true, status: 'ACTIVE' } });
      const r = await rest(`usuarios?id=eq.${u.repA.authId}`, tokens.adminA, 'PATCH', { body: { ativo: false, status: 'INACTIVE' }, prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-20', 'AdminA desativa sem users.deactivate', 'rejeitado', `${r.status}${rows.length ? ' (!!) desativado' : ''}`, !is2xx(r.status) || rows.length === 0);
    }

    // ATK-21 (criação sem perfil — inexistente)
    {
      const r = await rpc(tokens.ownerA, 'criar_usuario_corporativo', { p_uid: u.novo.authId, p_email: u.novo.email, p_nome: 'Novo', p_telefone: null, p_perfil_id: null });
      report('ATK-21', 'Criação via RPC sem perfil', 'rejeitado', `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    // ATK-22 F5 (DELETE cross-tenant em representantes)
    {
      const r = await rest(`representantes?select=id&usuario_id=eq.${u.repA.authId}`, tokens.adminB, 'DELETE', { prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-22', 'AdminB deleta representante do tenant A', '0 linhas', `${r.status} ${rows.length} linha(s)${rows.length ? ' (!!)' : ''}`, is2xx(r.status) && rows.length === 0);
    }

    // ATK-23 F5 (INSERT cross-tenant em representantes)
    {
      const r = await rest('representantes', tokens.adminB, 'POST', { body: { usuario_id: u.repA.authId, nome: 'Rep Fake', email: u.repA.email, empresa_operadora_id: TENANT_A, cargo: 'Representante' }, prefer: 'return=representation' });
      report('ATK-23', 'AdminB insere representante no tenant A', 'rejeitado (403)', `${r.status} ${is2xx(r.status) ? '(!!) inserido' : JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    // ATK-24 F4 (DELETE cross-tenant em usuarios)
    {
      const r = await rest(`usuarios?select=id&id=eq.${u.repA.authId}`, tokens.adminB, 'DELETE', { prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-24', 'AdminB deleta usuário do tenant A', '0 linhas', `${r.status} ${rows.length} linha(s)${rows.length ? ' (!!)' : ''}`, is2xx(r.status) && rows.length === 0);
    }

    // ATK-25 F3 (INSERT usuarios cross-tenant via REST com id próprio — usuário sem registro)
    {
      const r = await rest('usuarios', tokens.selfreg, 'POST', { body: { id: u.selfreg.authId, email: u.selfreg.email, nome: 'Selfreg Fake', empresa_operadora_id: TENANT_A, perfil_id: PERFIL_ADMIN, is_owner: false, ativo: true, status: 'ACTIVE' }, prefer: 'return=representation' });
      report('ATK-25', 'Usuário sem registro insere a própria linha com tenant A/ADMIN', 'rejeitado', `${r.status} ${is2xx(r.status) ? '(!!) inserido' : JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    // ATK-26 F12 (UPDATE cross-tenant em solicitacoes_acesso)
    {
      const r = await rest(`solicitacoes_acesso?select=id&id=eq.${solA}`, tokens.adminB, 'PATCH', { body: { status: 'APPROVED' }, prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-26', 'AdminB decide solicitação do tenant A', '0 linhas', `${r.status} ${rows.length} linha(s)${rows.length ? ' (!!)' : ''}`, is2xx(r.status) && rows.length === 0);
    }

    // ATK-27 F12 (DELETE em solicitacoes_acesso sem policy)
    {
      const r = await rest(`solicitacoes_acesso?select=id&id=eq.${solA}`, tokens.adminA, 'DELETE', { prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('ATK-27', 'DELETE de solicitação via REST', '0 linhas', `${r.status} ${rows.length} linha(s)${rows.length ? ' (!!)' : ''}`, is2xx(r.status) && rows.length === 0);
    }

    // ATK-28 F12 (INSERT solicitação forjada APPROVED — anon)
    {
      const r = await rest('solicitacoes_acesso', ANON, 'POST', { body: { tipo_acesso: 'REPRESENTANTE', nome_usuario: 'Fake', email_usuario: 'fake-atk28@sobremidia.com.br', status: 'APPROVED', approval_token_hash: 'a'.repeat(64), approval_token_expires_at: new Date(Date.now() + 3600000).toISOString(), approved_at: new Date().toISOString() }, prefer: 'return=representation' });
      report('ATK-28', 'Anon insere solicitação forjada APPROVED', 'rejeitado', `${r.status} ${is2xx(r.status) ? '(!!) inserido' : JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    // ATK-29 F12 (INSERT solicitação com approved_by preenchido — autenticado)
    {
      const r = await rest('solicitacoes_acesso', tokens.repA, 'POST', { body: { tipo_acesso: 'REPRESENTANTE', nome_usuario: 'Fake', email_usuario: 'fake-atk29@sobremidia.com.br', status: 'PENDING', approval_token_hash: 'b'.repeat(64), approval_token_expires_at: new Date(Date.now() + 3600000).toISOString(), approved_by: u.ownerA.authId }, prefer: 'return=representation' });
      report('ATK-29', 'INSERT solicitação com approved_by forjado', 'rejeitado', `${r.status} ${is2xx(r.status) ? '(!!) inserido' : JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    // ATK-30 F8 (self-grant via gerenciar_autonomia)
    {
      const r = await rpc(tokens.adminA, 'gerenciar_autonomia', { p_alvo_id: u.adminA.authId, p_permissoes: ['users.deactivate'], p_conceder: true });
      report('ATK-30', 'AdminA auto-concede permissão (self-grant)', 'rejeitado', `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    console.log('\n== POSITIVOS: fluxos legítimos (devem PASSAR) ==');

    // POS-1
    {
      const r = await rest(`usuarios?id=eq.${u.repA.authId}`, tokens.ownerA, 'PATCH', { body: { ativo: false, status: 'INACTIVE' }, prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('POS-1', 'OwnerA desativa RepA', 'sucesso (1 linha)', `${r.status} ${rows.length} linha(s) ativo=${rows[0]?.ativo}`, is2xx(r.status) && rows.length === 1 && rows[0].ativo === false);
    }

    // POS-2
    {
      const r = await rest(`usuarios?id=eq.${u.repA.authId}`, tokens.ownerA, 'PATCH', { body: { ativo: true, status: 'ACTIVE' }, prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('POS-2', 'OwnerA reativa RepA', 'sucesso', `${r.status} ${rows.length} linha(s)`, is2xx(r.status) && rows.length === 1 && rows[0].ativo === true);
    }

    // POS-3
    {
      const r = await rpc(tokens.ownerA, 'atualizar_usuario_corporativo', { p_alvo_id: u.repA.authId, p_nome: 'Rep A Editado', p_telefone: '11999990000', p_perfil_id: null });
      const rows = r.status === 204 ? await mgmt(`SELECT nome, telefone FROM public.usuarios WHERE id = '${u.repA.authId}'`) : null;
      report('POS-3', 'OwnerA edita RepA via RPC', 'sucesso', `${r.status} ${rows ? JSON.stringify(rows.data) : JSON.stringify(r.body).slice(0, 120)}`, r.status === 204 && rows?.data?.[0]?.nome === 'Rep A Editado');
    }

    // POS-4
    {
      const r = await rpc(tokens.ownerA, 'criar_usuario_corporativo', { p_uid: u.novo.authId, p_email: u.novo.email, p_nome: 'Novo Membro', p_telefone: null, p_perfil_id: PERFIL_REP });
      report('POS-4', 'OwnerA cria REPRESENTANTE via RPC', 'sucesso', `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`, is2xx(r.status));
    }

    // POS-5 F12 (fluxo legítimo: anon insere solicitação PENDING + RPC valida token)
    {
      const rawToken = 'ab'.repeat(32);
      const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const reqId = crypto.randomUUID();
      const r = await rest('solicitacoes_acesso', ANON, 'POST', { body: { id: reqId, tipo_acesso: 'REPRESENTANTE', nome_usuario: 'Solicitante Legitimo', email_usuario: `rt-sol-${RUN}@sobremidia.com.br`, telefone: '', dados_cadastro: {}, auth_user_id: null, status: 'PENDING', approval_token_hash: hash, approval_token_expires_at: new Date(Date.now() + 48 * 3600000).toISOString() }, prefer: 'return=minimal' });
      solLegitima = r.status === 201 ? { id: reqId, hash } : null;
      const rr = solLegitima ? await rpc(ANON, 'get_solicitacao_aprovacao', { p_request_id: solLegitima.id, p_token_hash: hash }) : null;
      const rrRow = Array.isArray(rr?.body) ? rr.body[0] : rr?.body;
      report('POS-5', 'Fluxo legítimo: anon insere solicitação e RPC valida token', 'insert + RPC ok', `insert=${r.status} rpc=${rr?.status} status=${rrRow?.status}`, r.status === 201 && !!solLegitima && rr?.status === 200 && rrRow?.status === 'PENDING');
    }

    // POS-6 F13 (OWNER decide solicitação PENDING do próprio tenant via REST)
    {
      const r = await rest(`solicitacoes_acesso?select=id,status&id=eq.${solA}`, tokens.ownerA, 'PATCH', { body: { status: 'REJECTED', motivo_rejeicao: 'Teste legitimo' }, prefer: 'return=representation' });
      const rows = Array.isArray(r.body) ? r.body : [];
      report('POS-6', 'OwnerA rejeita solicitação do próprio tenant', '1 linha', `${r.status} ${rows.length} linha(s) status=${rows[0]?.status}`, is2xx(r.status) && rows.length === 1 && rows[0].status === 'REJECTED');
    }

    console.log('\n== VERIFICAÇÕES PÓS-FATO ==');

    // V-1 auditoria server-side
    {
      const x = await mgmt(`SELECT acao, entidade_id FROM public.auditoria_logs
        WHERE entidade_id = '${u.repA.authId}' AND usuario_id = '${u.ownerA.authId}' ORDER BY data_hora DESC LIMIT 10`);
      const rows = Array.isArray(x.data) ? x.data : [];
      const ok = rows.some((r) => ['USER_ACTIVATED', 'USER_DEACTIVATED', 'USER_UPDATED'].includes(r.acao));
      report('V-1', 'Auditoria server-side gerada p/ ações do OWNER', 'ações registradas', `${rows.length} registro(s): ${rows.map((r) => r.acao).join(', ')}`, ok);
    }

    // V-2 sem registros forjados
    {
      const x = await mgmt(`SELECT COUNT(*)::int AS n FROM public.auditoria_logs WHERE empresa_operadora_id = '${TENANT_B}' AND acao = 'FORGED'`);
      report('V-2', 'Sem registros forjados no tenant B', '0', `${Array.isArray(x.data) ? x.data[0]?.n : x.status}`, Array.isArray(x.data) && x.data[0]?.n === 0);
    }

    // V-3 integridade do estado
    {
      const x = await mgmt(`SELECT u.ativo, u.is_owner, p.nome AS perfil, u.empresa_operadora_id FROM public.usuarios u
        LEFT JOIN public.perfis p ON p.id = u.perfil_id WHERE u.id = '${u.repA.authId}'`);
      const row = Array.isArray(x.data) ? x.data[0] : null;
      const ok = row && row.ativo === true && row.is_owner === false && row.perfil === 'REPRESENTANTE' && row.empresa_operadora_id === TENANT_A;
      report('V-3', 'Integridade do estado de RepA após ataques', 'ativo, rep, tenant A', `${row ? `${row.ativo}/${row.is_owner}/${row.perfil}/${row.empresa_operadora_id}` : `erro ${x.status}`}`, ok);
    }

    // V-4 usuário criado
    {
      const x = await mgmt(`SELECT u.email, u.empresa_operadora_id, p.nome AS perfil FROM public.usuarios u
        LEFT JOIN public.perfis p ON p.id = u.perfil_id WHERE u.id = '${u.novo.authId}'`);
      const y = await mgmt(`SELECT COUNT(*)::int AS n FROM public.representantes WHERE usuario_id = '${u.novo.authId}'`);
      const row = Array.isArray(x.data) ? x.data[0] : null;
      const nReps = Array.isArray(y.data) ? y.data[0]?.n : -1;
      const ok = row && row.perfil === 'REPRESENTANTE' && row.empresa_operadora_id === TENANT_A && nReps === 1;
      report('V-4', 'Novo usuário criado corretamente (perfil+representante)', 'REPRESENTANTE + 1 rep', `${row?.perfil} / reps=${nReps}`, ok);
    }

    // V-5 F12 (RPC rejeita token inválido)
    {
      const r = solLegitima ? await rpc(ANON, 'get_solicitacao_aprovacao', { p_request_id: solLegitima.id, p_token_hash: '0'.repeat(64) }) : { status: -1, body: {} };
      report('V-5', 'RPC rejeita token inválido', 'rejeitado', `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    // V-6 F12 (RPC rejeita token já consumido)
    {
      if (solLegitima) await mgmt(`UPDATE public.solicitacoes_acesso SET approval_used_at = NOW() WHERE id = '${solLegitima.id}'`);
      const r = solLegitima ? await rpc(ANON, 'get_solicitacao_aprovacao', { p_request_id: solLegitima.id, p_token_hash: solLegitima.hash }) : { status: -1, body: {} };
      report('V-6', 'RPC rejeita token já consumido', 'rejeitado', `${r.status} ${JSON.stringify(r.body).slice(0, 120)}`, !is2xx(r.status));
    }

    // V-7 F13 (auditoria server-side da decisão de solicitação)
    {
      const x = await mgmt(`SELECT acao, status_anterior, status_novo FROM public.auditoria_logs
        WHERE entidade_tipo = 'SOLICITACAO' AND entidade_id = '${solA}' ORDER BY data_hora DESC LIMIT 1`);
      const rows = Array.isArray(x.data) ? x.data : [];
      const ok = rows.length === 1 && rows[0].acao === 'STATUS_CHANGE' && rows[0].status_novo === 'REJECTED';
      report('V-7', 'Auditoria server-side da decisão de solicitação', 'STATUS_CHANGE registrado', `${rows.length} registro(s): ${rows.map((r) => r.acao).join(', ')}`, ok);
    }

    // V-8 F11 (edge handle-approval exige token)
    {
      const r = await fetch(`${URL}/functions/v1/handle-approval`, {
        method: 'POST',
        headers: { apikey: ANON, Authorization: 'Bearer ' + ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: solLegitima?.id || solA, action: 'approve', format: 'json' }),
      });
      const body = await r.json().catch(() => null);
      report('V-8', 'Edge handle-approval rejeita decisão sem token', '400/403', `${r.status} ${body ? JSON.stringify(body).slice(0, 120) : ''}`, (r.status === 400 || r.status === 403) && body?.ok === false);
    }

    console.log('\n== RESUMO ==');
    const failed = results.filter((r) => !r.ok);
    console.log(`Total: ${results.length} | PASS: ${results.length - failed.length} | FAIL: ${failed.length}`);
    for (const f of failed) console.log(`  FAIL ${f.id} ${f.name}`);
    fs.writeFileSync(path.join(__dirname, 'redteam_results.json'), JSON.stringify({ run: RUN, results }, null, 2));
    console.log('Resultados em scripts/redteam_results.json');
  } finally {
    console.log('\n== CLEANUP ==');
    await cleanupAll(Object.values(u).map((x) => x.authId).filter(Boolean));
    console.log('CLEANUP OK');
  }
  process.exit(results.some((r) => !r.ok) ? 1 : 0);
})().catch((e) => {
  console.error('ERRO GLOBAL:', e.message);
  process.exit(2);
});