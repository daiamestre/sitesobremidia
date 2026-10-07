/**
 * F-156 — Painel completo (modelo de referência, imagens 2 e 4). Regras puras do painel; os números vêm do banco
 * (fn_dashboard_completo, só leitura) e aqui viram porcentagens, variações, rosca e posição de cada tela no mapa.
 */
import { normalizarNome, type Municipios } from '@/lib/redePresenca';

export type EstadoSync = 'atualizado' | 'baixando' | 'pendente' | 'sem_info';
export const ESTADOS_SYNC: EstadoSync[] = ['atualizado', 'baixando', 'pendente', 'sem_info'];
export const ROTULO_SYNC: Record<EstadoSync, string> = { atualizado: 'Atualizado', baixando: 'Baixando', pendente: 'Pendente', sem_info: 'Sem informação' };
export const COR_SYNC: Record<EstadoSync, string> = { atualizado: '#22c55e', baixando: '#3b82f6', pendente: '#f59e0b', sem_info: '#94a3b8' };

export interface TelaSync { id: string; nome: string; cidade: string | null; uf: string | null; sync: EstadoSync; online: boolean; pendentes: number; midias: number; ultimo_sync: string | null }
export interface DiaDePresenca { dia: string; ligadas: number; exibiram: number }
export interface PainelCompleto {
  gerado_em: string | null;
  telas: { total: number; online: number; hoje: number; offline: number };
  sincronizacao: Record<EstadoSync, number> & { reportando: number };
  telas_sync: TelaSync[];
  desatualizados: Array<Pick<TelaSync, 'id' | 'nome' | 'pendentes' | 'midias' | 'ultimo_sync'> & { sync: EstadoSync }>;
  disco: { aparelhos: number; aparelhos_usado_mb: number; aparelhos_total_mb: number; nuvem_bytes: number; nuvem_arquivos: number };
  exibicoes: { atual: number; anterior: number; por_dia: Array<{ dia: string; n: number }> };
  presenca: { dias: DiaDePresenca[]; soma_atual: number; soma_anterior: number };
}

const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Resposta do banco -> painel sempre completo (campos ausentes viram zero/lista vazia; nada quebra a tela). */
export function normalizarPainel(raw: unknown): PainelCompleto {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const sync = (v: unknown): EstadoSync => (ESTADOS_SYNC.includes(v as EstadoSync) ? (v as EstadoSync) : 'sem_info');
  return {
    gerado_em: typeof r.gerado_em === 'string' ? r.gerado_em : null,
    telas: { total: n(r.telas?.total), online: n(r.telas?.online), hoje: n(r.telas?.hoje), offline: n(r.telas?.offline) },
    sincronizacao: { atualizado: n(r.sincronizacao?.atualizado), baixando: n(r.sincronizacao?.baixando), pendente: n(r.sincronizacao?.pendente), sem_info: n(r.sincronizacao?.sem_info), reportando: n(r.sincronizacao?.reportando) },
    telas_sync: (Array.isArray(r.telas_sync) ? r.telas_sync : []).map((t: Record<string, unknown>) => ({
      id: String(t.id), nome: String(t.nome ?? 'Tela sem nome'), cidade: (t.cidade as string) || null, uf: (t.uf as string) || null, sync: sync(t.sync),
      online: t.online === true, pendentes: n(t.pendentes), midias: n(t.midias), ultimo_sync: (t.ultimo_sync as string) || null,
    })),
    desatualizados: (Array.isArray(r.desatualizados) ? r.desatualizados : []).map((t: Record<string, unknown>) => ({
      id: String(t.id), nome: String(t.nome ?? 'Tela sem nome'), sync: sync(t.sync), pendentes: n(t.pendentes), midias: n(t.midias), ultimo_sync: (t.ultimo_sync as string) || null,
    })),
    disco: { aparelhos: n(r.disco?.aparelhos), aparelhos_usado_mb: n(r.disco?.aparelhos_usado_mb), aparelhos_total_mb: n(r.disco?.aparelhos_total_mb), nuvem_bytes: n(r.disco?.nuvem_bytes), nuvem_arquivos: n(r.disco?.nuvem_arquivos) },
    exibicoes: {
      atual: n(r.exibicoes?.atual), anterior: n(r.exibicoes?.anterior),
      por_dia: (Array.isArray(r.exibicoes?.por_dia) ? r.exibicoes.por_dia : []).map((d: Record<string, unknown>) => ({ dia: String(d.dia), n: n(d.n) })),
    },
    presenca: {
      dias: (Array.isArray(r.presenca?.dias) ? r.presenca.dias : []).map((d: Record<string, unknown>) => ({ dia: String(d.dia), ligadas: n(d.ligadas), exibiram: Math.min(n(d.exibiram), n(d.ligadas)) })),
      soma_atual: n(r.presenca?.soma_atual), soma_anterior: n(r.presenca?.soma_anterior),
    },
  };
}

/** Porcentagem inteira (0 quando não há total). */
export const porcentagem = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

/** Variação contra o período anterior; sem período anterior (zero) não existe porcentagem. */
export function variacaoPercentual(atual: number, anterior: number): number | null {
  if (!(anterior > 0)) return null;
  return Math.round(((atual - anterior) / anterior) * 100);
}

export function textoDaVariacao(v: number | null): string {
  if (v === null) return 'sem período anterior';
  if (v > 0) return `▲ +${v}%`;
  if (v < 0) return `▼ −${Math.abs(v)}%`;
  return '= 0%';
}

export const tendencia = (v: number | null): 'sobe' | 'desce' | 'igual' | 'sem_base' => (v === null ? 'sem_base' : v > 0 ? 'sobe' : v < 0 ? 'desce' : 'igual');

/** 1234567 -> "1,2 MB". */
export function formatarTamanho(bytes: number): string {
  if (!(bytes > 0)) return '0 B';
  const un = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(un.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const v = bytes / 1024 ** i;
  return `${(i === 0 ? String(Math.round(v)) : v.toFixed(v >= 100 ? 0 : 1)).replace('.', ',')} ${un[i]}`;
}
export const formatarMb = (mb: number) => formatarTamanho(mb * 1024 * 1024);

/** Rosca: um arco por item (começa no topo). Itens com valor 0 não desenham arco. */
export interface ArcoDaRosca { chave: string; valor: number; pct: number; dasharray: string; dashoffset: number }
export function arcosDaRosca(itens: Array<{ chave: string; valor: number }>, raio = 40): ArcoDaRosca[] {
  const total = itens.reduce((s, i) => s + Math.max(0, i.valor), 0);
  const circ = 2 * Math.PI * raio;
  let acumulado = 0;
  return itens.map((i) => {
    const valor = Math.max(0, i.valor);
    const parte = total > 0 ? valor / total : 0;
    const comp = parte * circ;
    const arco = { chave: i.chave, valor, pct: porcentagem(valor, total), dasharray: `${comp.toFixed(3)} ${(circ - comp).toFixed(3)}`, dashoffset: -acumulado };
    acumulado += comp;
    return arco;
  });
}

/** Média diária, pico e variação contra os 7 dias anteriores. */
export function resumoDePresenca(p: PainelCompleto['presenca']) {
  const dias = p.dias;
  const soma = dias.reduce((s, d) => s + d.ligadas, 0);
  const pico = dias.reduce((m, d) => (d.ligadas > m.ligadas ? d : m), { dia: '', ligadas: 0, exibiram: 0 } as DiaDePresenca);
  return {
    media: dias.length ? Math.round((soma / dias.length) * 10) / 10 : 0,
    pico: pico.ligadas,
    picoDia: pico.ligadas > 0 ? pico.dia : null,
    semanaAnterior: variacaoPercentual(p.soma_atual, p.soma_anterior),
  };
}

/** "2026-10-07" -> "qua" (sem deslocar o dia pelo fuso). */
export function diaDaSemana(isoDate: string): string {
  const [a, m, d] = isoDate.split('-').map(Number);
  return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(Date.UTC(a, (m || 1) - 1, d || 1)).getUTCDay()];
}

// ---------------------------------------------------------------------------------------------- mapa da sincronização
export interface TelaNoMapa extends TelaSync { lat: number | null; lon: number | null }

/** Posição de cada tela: a cidade (se reconhecida no estado) ou, sem cidade, só o estado (lat/lon nulos). */
export function localizarTelas(telas: TelaSync[], municipios: Municipios): { noMapa: TelaNoMapa[]; semLocal: TelaSync[] } {
  const porUf = new Map<string, Map<string, [string, number, number]>>();
  for (const uf of Object.keys(municipios)) porUf.set(uf, new Map(municipios[uf].map((m) => [normalizarNome(m[0]), m])));
  const noMapa: TelaNoMapa[] = [];
  const semLocal: TelaSync[] = [];
  for (const t of telas) {
    const uf = t.uf && porUf.has(t.uf.toUpperCase()) ? t.uf.toUpperCase() : null;
    if (!uf) { semLocal.push(t); continue; }
    const m = t.cidade ? porUf.get(uf)!.get(normalizarNome(t.cidade)) : undefined;
    noMapa.push({ ...t, uf, lat: m ? m[1] : null, lon: m ? m[2] : null });
  }
  return { noMapa, semLocal };
}

/** Telas na mesma posição não se escondem: ficam em espiral em volta do ponto (deslocamento em pixels da tela). */
export function afastarPontos(qtd: number, passo = 9): Array<[number, number]> {
  return Array.from({ length: qtd }, (_, i) => {
    if (i === 0) return [0, 0] as [number, number];
    const anel = Math.ceil((-1 + Math.sqrt(1 + 4 * i / 3)) / 2) || 1; // 6, 12, 18... por anel
    const noAnel = i - 3 * anel * (anel - 1) - 1;
    const ang = (2 * Math.PI * noAnel) / (6 * anel);
    return [Math.cos(ang) * passo * anel, Math.sin(ang) * passo * anel] as [number, number];
  });
}

// ---------------------------------------------------------------------------------------------- "Editar painel"
export type CartaoDoPainel = 'telas' | 'disco' | 'exibicoes' | 'mapa' | 'sincronizacao' | 'ligadas' | 'status' | 'desatualizado';
export const CARTOES_DO_PAINEL: Array<{ id: CartaoDoPainel; rotulo: string }> = [
  { id: 'telas', rotulo: 'Telas online' }, { id: 'disco', rotulo: 'Espaço de disco' }, { id: 'exibicoes', rotulo: 'Exibições em 30 dias' },
  { id: 'mapa', rotulo: 'Mapa da sincronização' }, { id: 'sincronizacao', rotulo: 'Sincronização de mídia' }, { id: 'ligadas', rotulo: 'Telas ligadas nos últimos 7 dias' },
  { id: 'status', rotulo: 'Status das telas' }, { id: 'desatualizado', rotulo: 'Conteúdo desatualizado' },
];
export const CHAVE_CARTOES_OCULTOS = 'sobremidia.painel.ocultos.v1';

interface Armazenamento { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Cartões que a pessoa escondeu (guardado só neste navegador). Qualquer falha = nenhum escondido. */
export function lerCartoesOcultos(a: Armazenamento | null): CartaoDoPainel[] {
  try {
    const bruto = a?.getItem(CHAVE_CARTOES_OCULTOS);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? CARTOES_DO_PAINEL.map((c) => c.id).filter((id) => lista.includes(id)) : [];
  } catch { return []; }
}
export function salvarCartoesOcultos(a: Armazenamento | null, ocultos: CartaoDoPainel[]): void {
  try { a?.setItem(CHAVE_CARTOES_OCULTOS, JSON.stringify(ocultos)); } catch { /* sem armazenamento: vale só nesta visita */ }
}
export const alternarCartao = (ocultos: CartaoDoPainel[], id: CartaoDoPainel): CartaoDoPainel[] => (ocultos.includes(id) ? ocultos.filter((x) => x !== id) : [...ocultos, id]);
