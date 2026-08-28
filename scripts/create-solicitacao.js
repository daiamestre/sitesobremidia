const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://bhwsybgsyvvhqtkdqozb.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJod3N5YmdzeXZ2aHF0a2Rxb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjk5NjgsImV4cCI6MjA4Mzk0NTk2OH0.ejbdSX6xeSC4Cg8unLFSUbN5BOW7dJw2CRcFJACcWfI';

const supabase = createClient(SUPABASE_URL, ANON_KEY);

const crypto = require('crypto');

async function createSolicitacao() {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const msgUint8 = new TextEncoder().encode(rawToken);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const tokenHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const requestId = crypto.randomUUID();

  const { data, error } = await supabase
    .from('solicitacoes_acesso')
    .insert({
      id: requestId,
      tipo_acesso: 'GESTOR_TELAS',
      nome_usuario: 'Bootstrap Owner',
      email_usuario: 'bootstrap-owner@sobremidia.com.br',
      telefone: '',
      dados_cadastro: { empresa: 'Sobre Mídia' },
      auth_user_id: 'b890c81e-dc3f-4c9f-9fa8-dc53c96cd255',
      status: 'PENDING',
      approval_token_hash: tokenHash,
      approval_token_expires_at: expiresAt,
    })
    .select();

  console.log('Error:', error);
  console.log('Data:', data);
  console.log('Raw token:', rawToken);
}

createSolicitacao();