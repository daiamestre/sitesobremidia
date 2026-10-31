// SOBRE MÍDIA Studio — sequência dos agentes de planejamento, RETOMÁVEL: cada agente concluído fica gravado
// (studio_etapas) e não roda de novo se a função cair no meio. O orquestrador e o ensaio local usam este mesmo código.
import {
  analisarProduto, diretorCriativo, diretorFotografia, especialistaPrompts, montarPlano, roteirista,
  type AnaliseProduto, type Direcao, type Executar, type Fotografia, type Prompts, type RegistroAgente, type Roteiro,
} from './agentes.ts';
import type { PedidoStudio, PlanoCriativo } from './contrato.ts';
import { FalhaDoAgente } from './agentes.ts';
import { pedidoCoreDoPedido, planejarComCore, planoLocal, type OpcoesCore, type ResultadoCore } from './core/core.ts';
import { VERSAO_DNA } from './core/dna.ts';

export interface Memoria {
  /** saídas já gravadas por chave de etapa (ex.: "produtos:p1", "diretor") */
  feitas: Record<string, unknown>;
  gravar: (chave: string, r: RegistroAgente<unknown>) => Promise<void>;
  /** baixa a foto do produto e devolve data URL (null se não houver ou falhar) */
  imagem: (url: string) => Promise<string | null>;
}

async function etapa<T>(m: Memoria, chave: string, rodar: () => Promise<RegistroAgente<T>>): Promise<T> {
  if (chave in m.feitas) return m.feitas[chave] as T;
  const r = await rodar();
  await m.gravar(chave, r as RegistroAgente<unknown>);
  m.feitas[chave] = r.saida;
  return r.saida;
}

/** Opções do planejamento: modelo de VISÃO à parte (Cloudflare) e o contexto do Creative Core (segmentos do banco, provedores, IA de texto). */
export interface OpcoesPlanejamento { visao?: Executar; core?: OpcoesCore }

/**
 * MG-STUDIO-03: 1º o SOBRE MÍDIA CREATIVE CORE (briefing, segmento, direção, roteamento, prompts, qualidade) — gravado como
 * etapa "core"; depois os agentes existentes (já com o contexto do Core). Se as IAs de texto não responderem (cota/fora do
 * ar), o Core monta o plano sozinho ("core-local"): o pedido nunca se perde e nada é cobrado.
 */
export async function planejarProducao(exec: Executar, pedido: PedidoStudio, m: Memoria, o: OpcoesPlanejamento = {}): Promise<{ plano: PlanoCriativo; erros: string[]; core: ResultadoCore }> {
  const core = await etapa<ResultadoCore>(m, 'core', async () => {
    const saida = await planejarComCore(pedidoCoreDoPedido(pedido), o.core);
    const ia = saida.etapas.find((e) => e.modo === 'ia');
    return { agente: 'core', modelo: ia?.provedor ?? 'creative-core-local', versao: VERSAO_DNA, entrada: pedidoCoreDoPedido(pedido), saida, neurons: 0, tentativas: 1 };
  });
  if (!core.qualidade.aprovado) return { plano: null as unknown as PlanoCriativo, erros: core.qualidade.problemas.map((x) => `Creative Core: ${x}`), core };
  const analises: Record<string, AnaliseProduto> = {};
  for (const pr of pedido.produtos) {
    const foto = pr.fotos[0];
    if (!foto) continue;
    const chave = `produtos:${pr.id}`;
    if (chave in m.feitas) { analises[pr.id] = m.feitas[chave] as AnaliseProduto; continue; }
    const dataUrl = await m.imagem(foto.recorte_url || foto.url);
    if (!dataUrl) continue;
    // a análise da foto ajuda, mas não é obrigatória: sem visão disponível, segue sem ela
    try { analises[pr.id] = await etapa(m, chave, () => analisarProduto(o.visao ?? exec, pr.nome, dataUrl)); } catch (e) { if (!(e instanceof FalhaDoAgente)) throw e; }
  }
  try {
    const direcao = await etapa<Direcao>(m, 'diretor', () => diretorCriativo(exec, pedido, analises));
    const rot = await etapa<Roteiro>(m, 'roteirista', () => roteirista(exec, pedido, direcao));
    const foto = await etapa<Fotografia>(m, 'fotografia', () => diretorFotografia(exec, pedido, direcao, rot));
    const prompts = await etapa<Prompts>(m, 'prompts', () => especialistaPrompts(exec, pedido, direcao, rot, foto, analises));
    return { ...montarPlano(pedido, direcao, rot, foto, prompts, analises), core };
  } catch (e) {
    if (!(e instanceof FalhaDoAgente)) throw e;
    // modo local do Core: as mesmas validações do plano valem (montarPlano)
    const local = await etapa<ReturnType<typeof planoLocal>>(m, 'core-local', async () => ({ agente: 'core-local', modelo: 'creative-core-local', versao: VERSAO_DNA, entrada: { motivo: e.message }, saida: planoLocal(pedido, core), neurons: 0, tentativas: 1 }));
    return { ...montarPlano(pedido, local.direcao, local.roteiro, local.fotografia, local.prompts, analises), core };
  }
}
