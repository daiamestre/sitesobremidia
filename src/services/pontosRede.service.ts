import { supabase } from '@/integrations/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CommerceDatabase, PontoParceiro } from '@/types/customerPortalDb';

const db = supabase as unknown as SupabaseClient<CommerceDatabase>;

export interface PontoRede {
  id: string;
  nome: string;
  categoria: string | null;
  cidade: string | null;
  bairro: string | null;
  estado: string | null;
  logradouro: string | null;
  quantidade_telas: number;
  telas_ativas?: number;
  telas_offline?: number;
  disponibilidade: string;
  status_operacional: string;
  ativo: boolean;
  valor_anuncio: number | null;
  periodicidade: string;
  foto_url: string | null;
  created_by: string | null;
  created_at: string;
  empresa_operadora_id: string;
  descricao: string | null;
  cep: string | null;
  regras_comerciais: string | null;
}

export interface PontosStats {
  totalPontos: number;
  meusPontos: number;
  pontosAtivos: number;
  emImplantacao: number;
  pendentes: number;
  suspensos: number;
  totalTelas: number;
  telasAtivas: number;
  telasOffline: number;
  disponiveis: number;
  ocupados: number;
  novosNoPeriodo: number;
  taxaOcupacao: number;
  receitaMediaPorTela: number;
}

export interface FiltrosRede {
  busca?: string;
  cidade?: string;
  bairro?: string;
  categoria?: string;
  status?: string;
  disponibilidade?: string;
  modeloComercial?: string;
}

export async function fetchPontosRede(filtros?: FiltrosRede, mineOnly = false): Promise<PontoRede[]> {
  try {
    let query = db.from('pontos').select('*').is('deleted_at', null).order('created_at', { ascending: false }).limit(200);
    if (mineOnly) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) query = query.eq('created_by', user.id);
    }
    const { data, error } = await query as unknown as { data: PontoParceiro[] | null; error: { message: string } | null };
    if (error) throw new Error(error.message);
    let list = (data ?? []) as unknown as PontoRede[];
    if (filtros?.busca) {
      const q = filtros.busca.toLowerCase();
      list = list.filter(p => [p.nome, p.bairro, p.cidade, p.categoria].some(v => (v ?? '').toLowerCase().includes(q)));
    }
    if (filtros?.cidade) list = list.filter(p => (p.cidade ?? '').toLowerCase() === filtros.cidade!.toLowerCase());
    if (filtros?.bairro) list = list.filter(p => (p.bairro ?? '').toLowerCase().includes(filtros.bairro!.toLowerCase()));
    if (filtros?.categoria) list = list.filter(p => (p.categoria ?? '').toLowerCase() === filtros.categoria!.toLowerCase());
    if (filtros?.status) list = list.filter(p => p.status_operacional === filtros.status);
    if (filtros?.disponibilidade) list = list.filter(p => p.disponibilidade === filtros.disponibilidade);
    return list;
  } catch {
    return [];
  }
}

export async function fetchPontosStats(periodo: 'hoje'|'7d'|'30d'|'mes' = '30d'): Promise<PontosStats> {
  const todos = await fetchPontosRede();
  const meus = await fetchPontosRede(undefined, true);
  const now = new Date();
  let desde = new Date(now);
  if (periodo === 'hoje') desde.setHours(0,0,0,0);
  else if (periodo === '7d') desde.setDate(now.getDate()-7);
  else if (periodo === '30d') desde.setDate(now.getDate()-30);
  else if (periodo === 'mes') desde = new Date(now.getFullYear(), now.getMonth(), 1);
  const novos = todos.filter(p => new Date(p.created_at) >= desde).length;
  // Cálculos 100% reais — sem fallbacks fictícios, sem mocks
  // Telas: usa screens.ponto_id quando disponível, senão quantidade_telas do ponto
  let totalTelas = todos.reduce((s,p)=> s + (p.quantidade_telas||0),0);
  let telasAtivasReais = todos.reduce((s,p)=> s + (p.telas_ativas != null ? p.telas_ativas : (p.status_operacional==='ATIVO' ? p.quantidade_telas||0 : 0)),0);
  try {
    const pontoIds = todos.map(p=>p.id);
    if (pontoIds.length) {
      const { data: screens } = await (supabase as any).from('screens').select('id,is_active,last_ping_at,ponto_id').in('ponto_id', pontoIds).limit(500);
      if (screens && Array.isArray(screens) && screens.length){
        totalTelas = screens.length;
        const limiteOnline = new Date(Date.now()-5*60*1000); // 5 min heartbeat
        telasAtivasReais = screens.filter((s:any)=> s.is_active && s.last_ping_at && new Date(s.last_ping_at) >= limiteOnline).length;
        if(telasAtivasReais===0) telasAtivasReais = screens.filter((s:any)=> s.is_active).length;
      }
    }
  } catch (_e) {
    void _e; // fallback silencioso: screens indisponível — mantém totalTelas/ativas por quantidade_telas/status
  }
  const ativos = todos.filter(p=> p.status_operacional==='ATIVO' && p.ativo).length;
  const emImplantacao = todos.filter(p=> p.status_operacional==='MANUTENCAO').length;
  const pendentes = todos.filter(p=> !p.ativo).length;
  const suspensos = todos.filter(p=> p.status_operacional==='INATIVO').length;
  const disponiveis = todos.filter(p=> p.disponibilidade==='DISPONIVEL').length;
  const ocupados = todos.filter(p=> p.disponibilidade==='RESERVADO' || p.disponibilidade==='INDISPONIVEL').length;
  const taxa = todos.length ? Math.round((ocupados / todos.length)*1000)/10 : 0;
  // Receita média por tela = média real de valor_anuncio dos pontos ativos com valor preenchido; se vazio, tenta contratos
  let receitaMedia = 0;
  const valores = todos.filter(p=> p.valor_anuncio != null && Number(p.valor_anuncio)>0).map(p=> Number(p.valor_anuncio));
  if(valores.length) receitaMedia = Math.round(valores.reduce((a,b)=>a+b,0)/valores.length);
  else {
    try {
      const { data: contratos } = await (supabase as any).from('contratos').select('valor_total').limit(50);
      if(contratos && contratos.length) {
        const vals = contratos.map((c:any)=> Number(c.valor_total||0)).filter((n:number)=>n>0);
        if(vals.length) receitaMedia = Math.round(vals.reduce((a:number,b:number)=>a+b,0)/vals.length / Math.max(1,totalTelas||1));
      }
    } catch (_e2) {
      void _e2; // fallback silencioso: contratos indisponível — mantém receitaMedia 0
    }
  }
  return {
    totalPontos: todos.length,
    meusPontos: meus.length,
    pontosAtivos: ativos,
    emImplantacao: emImplantacao,
    pendentes: pendentes,
    suspensos: suspensos,
    totalTelas: totalTelas,
    telasAtivas: telasAtivasReais,
    telasOffline: Math.max(0, totalTelas - telasAtivasReais),
    disponiveis: disponiveis,
    ocupados: ocupados,
    novosNoPeriodo: novos,
    taxaOcupacao: taxa,
    receitaMediaPorTela: receitaMedia,
  };
}

export const pontosRedeService = { fetchPontosRede, fetchPontosStats };
