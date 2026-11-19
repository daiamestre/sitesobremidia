// F-300 (P-33) — LOCUTOR do SOBRE MÍDIA: transforma as frases do roteiro em VOZ (ElevenLabs) e guarda cada uma no R2.
//   POST { acao: 'falar', voz, frases: [{ chave, texto }] } → JWT obrigatório (acesso ao Studio pela regra studio_ai_escopo)
//        devolve [{ chave, url, nova }] — frase que já foi gerada antes (mesma voz e mesmo texto) volta do R2 SEM gastar crédito.
//   POST { acao: 'saldo' } → créditos restantes da ElevenLabs (owner/ADM).
// A chave ELEVENLABS_API_KEY só existe aqui (segredo da função). Travas: teto diário por pessoa (não vale para owner/ADM)
// e reserva mínima de créditos na conta da ElevenLabs.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { configR2, enviarAoR2 } from '../_shared/studio/r2.ts';

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const json = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const env = (k: string) => Deno.env.get(k) ?? '';

/** As 5 vozes aprovadas pelo dono (11/11/2026). O id da ElevenLabs fica só no servidor. */
const VOZES: Record<string, { id: string; ajuste: Record<string, number>; conversao?: { origem: string } }> = {
  dono: { id: '0gmYXJRkDXQDSMTk3TQo', ajuste: { stability: 0.45, similarity_boost: 0.9 } },
  aline: { id: '4RyYr3owp1gnOgHKTs6D', ajuste: { stability: 0.45, similarity_boost: 0.85 } },
  carlos: { id: 'xJ8U5HgW3Zps75qgYrFw', ajuste: { stability: 0.45, similarity_boost: 0.85 } },
  leonardo: { id: 'UaeEQHfiDI8l58WWXiwS', ajuste: { stability: 0.45, similarity_boost: 0.85 } },
  diego: { id: 'rpNe0HOx7heUulPiOEaG', ajuste: { stability: 0.45, similarity_boost: 0.85 } },
  // F-344 (pedido do dono, 19/11/2026): a voz do dono (timbre modificado por IA, clone fiel) com a PEGADA do locutor de
  // impacto. Por texto o clone sai "morto"; por CONVERSÃO sai com energia (aprovado pelo dono: "A3 NOVA"). Então cada
  // frase é gerada GRITADA numa voz expressiva (origem) e convertida para o timbre do dono.
  eletro: { id: '0H07ueWLEXSuNIPyW7Y0', ajuste: { stability: 0.4, similarity_boost: 1, style: 0, use_speaker_boost: true }, conversao: { origem: 'hstwZvlWjngNBRLZp8sT' } },
};
/** F-344: a frase com as marcações de expressão do locutor de impacto (grito no começo, empolgação no resto) */
function comExpressao(texto: string): string {
  const partes = texto.match(/[^.!?]+[.!?]*/g) ?? [texto];
  return partes.map((p, i) => `${i === 0 || /!$/.test(p.trim()) && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{4,}/.test(p) ? '[shouting]' : '[excited]'} ${p.trim()}`).join(' ');
}
/** F-344: gera com energia na voz de origem e converte para o timbre da voz (fala → fala) */
async function falarPorConversao(voz: { id: string; ajuste: Record<string, number>; conversao?: { origem: string } }, texto: string): Promise<Uint8Array | string> {
  const k = env('ELEVENLABS_API_KEY');
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz.conversao!.origem}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'xi-api-key': k, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: comExpressao(texto), model_id: 'eleven_v3', language_code: 'pt', voice_settings: { stability: 0, similarity_boost: 0.8, use_speaker_boost: true } }),
  });
  if (!r.ok) return (await r.text()).slice(0, 200);
  const fd = new FormData();
  fd.append('model_id', 'eleven_multilingual_sts_v2'); fd.append('remove_background_noise', 'false');
  fd.append('voice_settings', JSON.stringify(voz.ajuste));
  fd.append('audio', new Blob([await r.arrayBuffer()], { type: 'audio/mpeg' }), 'origem.mp3');
  const c = await fetch(`https://api.elevenlabs.io/v1/speech-to-speech/${voz.id}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': k }, body: fd });
  if (!c.ok) return (await c.text()).slice(0, 200);
  return new Uint8Array(await c.arrayBuffer());
}
const MODELO = 'eleven_v4_turbo';
/**
 * F-320 (pedido do dono: o locutor dos vídeos de impacto igual ao do concorrente — varejo gritado, rápido, ênfase no fim):
 * no estilo IMPACTO a voz fica mais solta e expressiva e um pouco mais rápida. O estilo entra no endereço do arquivo, então a
 * mesma frase no jeito simples continua sendo a guardada de antes (nada é gerado de novo à toa).
 */
const AJUSTE_IMPACTO = { stability: 0.3, style: 0.6, use_speaker_boost: true, speed: 1.08 };
/** pasta fixa das locuções no R2 (tenants/{empresa}/studio/{PASTA}/{hash}.mp3) */
const PASTA = 'a0c0c000-0000-4000-8000-00000000f300';
const TETO_DIA_LETRAS = 6000;     // por pessoa (≈ 6 vídeos de 16 produtos); owner/ADM sem teto
const RESERVA_CREDITOS = 2000;    // nunca deixa a conta da ElevenLabs zerar

interface Escopo { empresa: string; cliente: string | null; admin: boolean; pode: boolean }

async function sha256(t: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))).map((x) => x.toString(16).padStart(2, '0')).join('');
}
const limpar = (t: string) => t.replace(/\s+/g, ' ').trim().slice(0, 600);

async function creditosRestantes(): Promise<number | null> {
  const r = await fetch('https://api.elevenlabs.io/v1/user/subscription', { headers: { 'xi-api-key': env('ELEVENLABS_API_KEY') } });
  if (!r.ok) return null;
  const j = await r.json();
  return Number(j.character_limit ?? 0) - Number(j.character_count ?? 0);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'método não permitido' });
  if (!env('ELEVENLABS_API_KEY')) return json(503, { error: 'Locução não configurada no servidor.' });
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vazio */ }

  const usuario = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: req.headers.get('authorization') ?? '' } } });
  const { data: u } = await usuario.auth.getUser();
  if (!u?.user) return json(401, { error: 'Entre na sua conta.' });
  const { data: esc } = await usuario.rpc('studio_ai_escopo');
  const e = (esc as Escopo[] | null)?.[0];
  if (!e?.pode) return json(403, { error: 'Seu perfil não tem acesso ao Studio.' });
  const srv = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

  if (body.acao === 'saldo') {
    if (!e.admin) return json(403, { error: 'Só a administração vê o saldo.' });
    return json(200, { creditos: await creditosRestantes() });
  }
  if (body.acao !== 'falar') return json(400, { error: 'ação desconhecida' });

  const vozId = String(body.voz ?? '');
  const impacto = body.estilo === 'impacto';
  const voz = VOZES[vozId];
  if (!voz) return json(400, { error: 'Voz desconhecida.' });
  const frases = (Array.isArray(body.frases) ? body.frases : []).slice(0, 40)
    .map((f) => ({ chave: String((f as { chave?: unknown }).chave ?? '').slice(0, 200), texto: limpar(String((f as { texto?: unknown }).texto ?? '')) }))
    .filter((f) => f.chave && f.texto.length >= 2);
  if (!frases.length) return json(400, { error: 'Nada para falar.' });

  const r2 = configR2(env);
  if (!r2) return json(503, { error: 'Armazenamento não configurado.' });

  // 1) o que já existe no R2 volta na hora (mesma voz + mesmo texto + mesmo modelo = mesmo arquivo)
  const itens = await Promise.all(frases.map(async (f) => {
    const hash = await sha256(voz.conversao ? `${vozId}|conversao-v1|${f.texto}` : impacto ? `${vozId}|${MODELO}|impacto|${f.texto}` : `${vozId}|${MODELO}|${f.texto}`);
    const caminho = `tenants/${e.empresa}/studio/${PASTA}/${hash.slice(0, 40)}.mp3`;
    const url = `${r2.dominioPublico}/${caminho}`;
    const existe = (await fetch(url, { method: 'HEAD' }).catch(() => null))?.ok ?? false;
    return { ...f, caminho, url, existe };
  }));
  const novas = itens.filter((i) => !i.existe);
  const letras = novas.reduce((s, i) => s + i.texto.length, 0);
  // F-344: a conversão gasta mais (gerar + converter fala em fala): conta 3× nas travas
  const PESO = voz.conversao ? 3 : 1, custo = letras * PESO;

  // 2) travas antes de gastar
  if (novas.length) {
    if (!e.admin) {
      const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
      const { data: hoje } = await srv.from('studio_locucoes').select('caracteres').eq('usuario_id', u.user.id).gte('criado_em', desde);
      const usado = (hoje ?? []).reduce((s, x) => s + Number(x.caracteres), 0);
      if (usado + custo > TETO_DIA_LETRAS) return json(429, { error: `Limite diário de locução atingido (${TETO_DIA_LETRAS} letras em 24 h). Tente amanhã ou fale com a SOBRE MÍDIA.` });
    }
    const resta = await creditosRestantes();
    if (resta == null) return json(502, { error: 'Não foi possível falar com o serviço de voz agora. Tente de novo.' });
    if (resta - custo < RESERVA_CREDITOS) return json(429, { error: 'Os créditos de locução do mês acabaram. Fale com a SOBRE MÍDIA.' });
  }

  // 3) gera só as novas (uma de cada vez, na ordem), grava no R2 e registra
  for (const i of novas) {
    if (voz.conversao) {
      const res = await falarPorConversao(voz, i.texto);
      if (typeof res === 'string') return json(502, { error: `O serviço de voz recusou a frase “${i.texto.slice(0, 40)}…”. Tente de novo.`, detalhe: res });
      await enviarAoR2(r2, i.caminho, res as Uint8Array<ArrayBuffer>, 'audio/mpeg');
      await srv.from('studio_locucoes').insert({ empresa_operadora_id: e.empresa, usuario_id: u.user.id, voz: vozId, modelo: 'eleven_v3+sts', caracteres: i.texto.length * PESO, url: i.url });
      continue;
    }
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz.id}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': env('ELEVENLABS_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: i.texto, model_id: MODELO, language_code: 'pt', voice_settings: impacto ? { ...voz.ajuste, ...AJUSTE_IMPACTO } : voz.ajuste }),
    });
    if (!r.ok) return json(502, { error: `O serviço de voz recusou a frase “${i.texto.slice(0, 40)}…”. Tente de novo.`, detalhe: (await r.text()).slice(0, 200) });
    const mp3 = new Uint8Array(await r.arrayBuffer());
    await enviarAoR2(r2, i.caminho, mp3 as Uint8Array<ArrayBuffer>, 'audio/mpeg');
    await srv.from('studio_locucoes').insert({ empresa_operadora_id: e.empresa, usuario_id: u.user.id, voz: vozId, modelo: MODELO, caracteres: i.texto.length, url: i.url });
  }
  return json(200, { frases: itens.map((i) => ({ chave: i.chave, url: i.url, nova: !i.existe })), letras_novas: letras });
});
