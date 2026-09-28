// SOBRE MÍDIA — analisar-midia (F-110 / F-111)
// Robô de análise PRÓPRIO das mídias dos anunciantes (sem IA externa):
//   POST { asset_id }            → analisa uma mídia PENDENTE (chamado logo após o envio)
//   POST { action: 'varrer' }    → analisa as PENDENTES esquecidas (cron a cada 10 min)
// Mede a mídia nas funções da Vercel (api/analise-visao: nudez por quadro + textos na imagem;
// api/analise-audio: fala transcrita) e decide com supabase/functions/_shared/politicaConteudo.ts:
//   APROVADA / RECUSADA (com motivo formal) / DUVIDA → EM_ANALISE_MANUAL e aviso ao OWNER/ADMIN.
// Nunca aprova sem análise: qualquer falha vai para a equipe.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { decidir, type SinaisAudio, type SinaisVisao } from '../_shared/politicaConteudo.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const ANALISADOR = (Deno.env.get('ANALISADOR_URL') || 'https://sitesobremidia.vercel.app').replace(/\/$/, '');
const DURACAO_MAXIMA_ANUNCIANTE = 20;
const VERSAO = 'analisador-proprio-1';

type Asset = {
  id: string; empresa_operadora_id: string; cliente_id: string; nome: string; tipo: string;
  object_url: string | null; moderacao_status: string; moderacao_detalhes: Record<string, unknown> | null;
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

async function medir<T>(rota: string, corpo: unknown, segredo: string): Promise<T | { ok: false; erro: string }> {
  try {
    const res = await fetch(`${ANALISADOR}/api/${rota}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-analise-segredo': segredo },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(125_000),
    });
    if (!res.ok) return { ok: false, erro: `${rota} HTTP ${res.status}` };
    return await res.json() as T;
  } catch (e) {
    return { ok: false, erro: `${rota}: ${String((e as Error)?.message ?? e).slice(0, 120)}` };
  }
}

async function analisar(srv: any, a: Asset) {
  if (a.moderacao_status !== 'PENDENTE') return { asset: a.id, resultado: a.moderacao_status, ja_analisada: true };
  const agora = new Date().toISOString();

  // Reserva a mídia (evita o envio e a varredura analisarem a mesma ao mesmo tempo; reserva vence em 5 min)
  const inicio = (a.moderacao_detalhes as any)?.analisando_desde;
  if (inicio && Date.now() - Date.parse(inicio) < 5 * 60_000) return { asset: a.id, resultado: 'EM_ANDAMENTO' };
  let reserva = srv.from('cliente_assets').update({ moderacao_detalhes: { analisando_desde: agora } })
    .eq('id', a.id).eq('moderacao_status', 'PENDENTE');
  reserva = inicio ? reserva.eq('moderacao_detalhes->>analisando_desde', inicio) : reserva.is('moderacao_detalhes', null);
  const { data: reservada } = await reserva.select('id');
  if (!reservada?.length) return { asset: a.id, resultado: 'EM_ANDAMENTO' };

  const segredo = Deno.env.get('ANALISE_MIDIA_SEGREDO') || '';
  const tipo = a.tipo === 'video' ? 'video' : 'imagem';
  let visao: SinaisVisao | null = null; let audio: SinaisAudio | null = null;
  if (!segredo || !a.object_url) {
    visao = { ok: false, erro: !segredo ? 'analisador sem segredo configurado' : 'mídia sem endereço', duracao: null, quadros: [], textos: [] };
  } else {
    const [v, s] = await Promise.all([
      medir<SinaisVisao>('analise-visao', { url: a.object_url, tipo }, segredo),
      tipo === 'video' ? medir<SinaisAudio>('analise-audio', { url: a.object_url }, segredo) : Promise.resolve(null),
    ]);
    visao = v as SinaisVisao; audio = s as SinaisAudio | null;
  }

  const r = decidir({ tipo, visao, audio }, { duracaoMaxima: DURACAO_MAXIMA_ANUNCIANTE });
  const detalhes = {
    versao: VERSAO, analisada_em: new Date().toISOString(), decisao: r.decisao, achados: r.achados,
    duracao: visao?.duracao ?? null, quadros: visao?.quadros ?? [], textos_imagem: visao?.textos ?? [],
    fala: audio?.texto ?? null, erros: [visao?.ok === false ? visao.erro : null, audio && audio.ok === false ? audio.erro : null].filter(Boolean),
  };

  const status = r.decisao === 'DUVIDA' ? 'EM_ANALISE_MANUAL' : r.decisao;
  await srv.from('cliente_assets').update({
    moderacao_status: status,
    moderacao_motivo: r.decisao === 'APROVADA' ? null : r.motivo,
    moderacao_por: 'ROBO', moderacao_em: new Date().toISOString(), moderacao_detalhes: detalhes,
  }).eq('id', a.id).eq('moderacao_status', 'PENDENTE');

  if (status === 'EM_ANALISE_MANUAL') {
    await avisarEquipe(srv, a, 'Mídia aguardando análise', `"${a.nome}": ${r.motivo ?? 'o analisador pediu revisão.'}`);
  }
  return { asset: a.id, resultado: status, motivo: r.motivo };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const srv = createClient(Deno.env.get('SUPABASE_URL') || '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');
  const body = await req.json().catch(() => ({}));
  const campos = 'id, empresa_operadora_id, cliente_id, nome, tipo, object_url, moderacao_status, moderacao_detalhes';

  if (body?.action === 'varrer') {
    const { data } = await srv.from('cliente_assets').select(campos).eq('moderacao_status', 'PENDENTE')
      .lt('created_at', new Date(Date.now() - 60_000).toISOString()).order('created_at').limit(4);
    const resultados = await Promise.all(((data ?? []) as Asset[]).map((a) => analisar(srv, a)));
    return json(200, { success: true, analisadas: resultados.length, resultados });
  }

  const id = String(body?.asset_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: 'asset_id inválido' });
  const { data: a } = await srv.from('cliente_assets').select(campos).eq('id', id).maybeSingle();
  if (!a) return json(404, { error: 'Mídia não encontrada' });
  return json(200, { success: true, ...(await analisar(srv, a as Asset)) });
});
