// SOBRE MÍDIA — analisar-midia (F-110)
// Robô de análise das mídias dos anunciantes antes de irem para as telas dos pontos parceiros.
//   POST { asset_id }            → analisa uma mídia PENDENTE (chamado logo após o envio)
//   POST { action: 'varrer' }    → analisa as PENDENTES esquecidas (cron a cada 10 min)
// Com ANTHROPIC_API_KEY: Claude olha a imagem (ou os quadros do vídeo) e decide APROVADA / RECUSADA / DUVIDA.
// Sem a chave (ou em dúvida/erro): EM_ANALISE_MANUAL e aviso ao OWNER/ADMIN. Nunca aprova sem análise.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const DIRETRIZES = `Você é o moderador de conteúdo da SOBRE MÍDIA, rede de telas de publicidade em estabelecimentos comerciais
(farmácias, academias, padarias, mercados, clínicas), vistas por famílias e crianças. Analise a(s) imagem(ns) de um anúncio.
RECUSE se houver: nudez, conteúdo sexual ou pornográfico, sugestão sexual explícita; discriminação, racismo, injúria ou discurso
de ódio (inclusive em textos na imagem); violência gráfica ou sangue; apologia a drogas ilícitas; armas em contexto de violência.
APROVE anúncios comerciais comuns (produtos, serviços, preços, promoções, logotipos, pessoas vestidas, comida, ambientes).
Responda SOMENTE com JSON: {"decisao":"APROVADA"|"RECUSADA"|"DUVIDA","motivo":"frase curta e formal em português, sem palavras ofensivas"}.
Use DUVIDA apenas se não for possível decidir com segurança.`;

type Asset = {
  id: string; empresa_operadora_id: string; cliente_id: string; nome: string; tipo: string;
  object_url: string | null; quadros: string[] | null; moderacao_status: string;
};

async function avisarEquipe(srv: any, a: Asset, titulo: string, msg: string) {
  const { data: equipe } = await srv.from('usuarios').select('id, is_owner, perfil:perfis(nome)')
    .eq('empresa_operadora_id', a.empresa_operadora_id);
  const alvos = (equipe ?? []).filter((u: any) => u.is_owner || ['OWNER', 'ADMIN'].includes(String(u.perfil?.nome ?? '').toUpperCase()));
  if (!alvos.length) return;
  await srv.from('notificacoes_central').insert(alvos.map((u: any) => ({
    empresa_operadora_id: a.empresa_operadora_id, usuario_id: u.id, tipo_evento: 'MIDIA_EM_ANALISE', canal: 'IN_APP',
    titulo, mensagem: msg, status_envio: 'SENT', lida: false, prioridade: 'IMPORTANTE', severidade: 'INFO',
    status_notificacao: 'NAO_LIDA', rota_destino: '/dashboard/telas-parceiras', entidade_relacionada_tipo: 'CLIENTE_ASSET',
    entidade_relacionada_id: a.id, enviado_em: new Date().toISOString(),
  })));
}

async function manual(srv: any, a: Asset, motivo: string) {
  await srv.from('cliente_assets').update({ moderacao_status: 'EM_ANALISE_MANUAL', moderacao_motivo: motivo, moderacao_em: new Date().toISOString(), moderacao_por: 'ROBO' })
    .eq('id', a.id).eq('moderacao_status', 'PENDENTE');
  await avisarEquipe(srv, a, 'Mídia aguardando análise', `"${a.nome}" precisa de análise antes de ir para as telas dos pontos parceiros.`);
  return { asset: a.id, resultado: 'EM_ANALISE_MANUAL', motivo };
}

async function analisar(srv: any, a: Asset) {
  if (a.moderacao_status !== 'PENDENTE') return { asset: a.id, resultado: a.moderacao_status, ja_analisada: true };
  const chave = Deno.env.get('ANTHROPIC_API_KEY');
  if (!chave) return manual(srv, a, 'Aguardando análise da equipe.');

  const imagens = a.tipo === 'imagem' ? [a.object_url].filter(Boolean) as string[] : (a.quadros ?? []).filter(Boolean).slice(0, 4);
  if (!imagens.length) return manual(srv, a, 'Sem quadros para análise automática.');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': chave, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: Deno.env.get('ANTHROPIC_MODELO') || 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        system: DIRETRIZES,
        messages: [{
          role: 'user',
          content: [
            ...imagens.map((url) => ({ type: 'image', source: { type: 'url', url } })),
            { type: 'text', text: a.tipo === 'video' ? `Quadros de um vídeo de anúncio ("${a.nome}"). Decida.` : `Imagem de anúncio ("${a.nome}"). Decida.` },
          ],
        }],
      }),
    });
    if (!res.ok) return manual(srv, a, `Análise automática indisponível (HTTP ${res.status}).`);
    const corpo = await res.json();
    const texto = (corpo.content ?? []).map((c: any) => c.text ?? '').join('');
    const m = texto.match(/\{[\s\S]*\}/);
    const r = m ? JSON.parse(m[0]) : null;
    const decisao = String(r?.decisao ?? '').toUpperCase();
    const motivo = String(r?.motivo ?? '').slice(0, 300) || null;
    if (decisao === 'APROVADA' || decisao === 'RECUSADA') {
      await srv.from('cliente_assets').update({
        moderacao_status: decisao, moderacao_motivo: decisao === 'RECUSADA' ? (motivo ?? 'Conteúdo fora das diretrizes.') : null,
        moderacao_por: 'ROBO', moderacao_em: new Date().toISOString(),
      }).eq('id', a.id).eq('moderacao_status', 'PENDENTE');
      return { asset: a.id, resultado: decisao, motivo };
    }
    return manual(srv, a, motivo ? `Robô em dúvida: ${motivo}` : 'Robô em dúvida.');
  } catch (e) {
    return manual(srv, a, 'Falha na análise automática: ' + String((e as Error)?.message ?? e).slice(0, 120));
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const srv = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const body = await req.json().catch(() => ({}));
  const campos = 'id, empresa_operadora_id, cliente_id, nome, tipo, object_url, quadros, moderacao_status';

  if (body?.action === 'varrer') {
    const { data } = await srv.from('cliente_assets').select(campos).eq('moderacao_status', 'PENDENTE')
      .lt('created_at', new Date(Date.now() - 60_000).toISOString()).limit(20);
    const resultados = [];
    for (const a of (data ?? []) as Asset[]) resultados.push(await analisar(srv, a));
    return json(200, { success: true, analisadas: resultados.length, resultados });
  }

  const id = String(body?.asset_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: 'asset_id inválido' });
  const { data: a } = await srv.from('cliente_assets').select(campos).eq('id', id).maybeSingle();
  if (!a) return json(404, { error: 'Mídia não encontrada' });
  return json(200, { success: true, ...(await analisar(srv, a as Asset)) });
});
