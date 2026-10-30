// SOBRE MÍDIA Studio — sequência dos agentes de planejamento, RETOMÁVEL: cada agente concluído fica gravado
// (studio_etapas) e não roda de novo se a função cair no meio. O orquestrador e o ensaio local usam este mesmo código.
import {
  analisarProduto, diretorCriativo, diretorFotografia, especialistaPrompts, montarPlano, roteirista,
  type AnaliseProduto, type Direcao, type Executar, type Fotografia, type Prompts, type RegistroAgente, type Roteiro,
} from './agentes.ts';
import type { PedidoStudio, PlanoCriativo } from './contrato.ts';

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

export async function planejarProducao(exec: Executar, pedido: PedidoStudio, m: Memoria): Promise<{ plano: PlanoCriativo; erros: string[] }> {
  const analises: Record<string, AnaliseProduto> = {};
  for (const pr of pedido.produtos) {
    const foto = pr.fotos[0];
    if (!foto) continue;
    const chave = `produtos:${pr.id}`;
    if (chave in m.feitas) { analises[pr.id] = m.feitas[chave] as AnaliseProduto; continue; }
    const dataUrl = await m.imagem(foto.recorte_url || foto.url);
    if (!dataUrl) continue;
    analises[pr.id] = await etapa(m, chave, () => analisarProduto(exec, pr.nome, dataUrl));
  }
  const direcao = await etapa<Direcao>(m, 'diretor', () => diretorCriativo(exec, pedido, analises));
  const rot = await etapa<Roteiro>(m, 'roteirista', () => roteirista(exec, pedido, direcao));
  const foto = await etapa<Fotografia>(m, 'fotografia', () => diretorFotografia(exec, pedido, direcao, rot));
  const prompts = await etapa<Prompts>(m, 'prompts', () => especialistaPrompts(exec, pedido, direcao, rot, foto, analises));
  return montarPlano(pedido, direcao, rot, foto, prompts, analises);
}
