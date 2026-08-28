const SUPABASE_URL = 'https://bhwsybgsyvvhqtkdqozb.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJod3N5YmdzeXZ2aHF0a2Rxb3piIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjk5NjgsImV4cCI6MjA4Mzk0NTk2OH0.ejbdSX6xeSC4Cg8unLFSUbN5BOW7dJw2CRcFJACcWfI';

async function getProfiles() {
  const res = await fetch(SUPABASE_URL + '/rest/v1/perfis?select=id,nome,descricao,ativo&ativo=eq.true&order=nome.asc', {
    headers: {
      'apikey': ANON_KEY,
      'Authorization': 'Bearer ' + ANON_KEY
    }
  });
  const data = await res.json();
  console.log('Perfis disponíveis:');
  data.forEach(p => console.log('  ' + p.id + ' - ' + p.nome + ' - ' + (p.descricao || '')));
}
getProfiles();