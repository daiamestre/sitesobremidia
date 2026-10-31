// SOBRE MÍDIA CREATIVE CORE → EDITOR DE VÍDEO (MG-STUDIO-03, decisão 4 do dono): o plano de uma produção (cenas, tempos,
// títulos do roteiro e PREÇOS REAIS) vira um projeto editável do editor de vídeo (F-227), sem reconstruir o editor.
// Imagem de cena já gerada → clipe de foto com zoom lento; sem imagem → arte do modelo do segmento com o título da cena.
// Preço entra como texto por cima (composição determinística, do dado do pedido) — nunca escrito por IA.
import { formatarPreco, type PedidoStudio, type PlanoCriativo, type VersaoImagem } from '../../../../supabase/functions/_shared/studio/contrato.ts';
import { animarTudo } from '../animacao';
import { TAMANHO_DOC, modeloParaDocumento, texto, type FormatoDoc } from '../documento';
import type { ModeloDeArte } from '../modelos';
import { idNovo, inicios, novoClipe, projetoVazio, type Clipe, type ProjetoDeVideo, type Sobreposicao, type TipoDeTransicao } from './linha';

/** guardado na aba do navegador entre a tela da produção e o editor de vídeo */
export const CHAVE_PROJETO_DO_CORE = 'studio-core-para-video';

export interface ProducaoParaVideo {
  formato: PedidoStudio['formato'];
  plano: PlanoCriativo;
  produtos: PedidoStudio['produtos'];
  cenas?: Record<string, { versoes: VersaoImagem[]; escolhida?: number }>;
  ordem?: number[] | null;
}

const TRANSICAO_DA_CENA = (i: number, n: number): TipoDeTransicao => (i === n - 1 ? 'corte' : i === 0 ? 'zoom' : 'dissolver');

export function projetoDaProducao(p: ProducaoParaVideo, modelo: ModeloDeArte | null): ProjetoDeVideo {
  const formato: FormatoDoc = p.formato === '9:16' ? '9:16' : '16:9';
  const { w: W, h: H } = TAMANHO_DOC[formato];
  const projeto = projetoVazio(formato);
  const porNumero = new Map(p.plano.cenas.map((c) => [c.numero, c]));
  const ordem = (p.ordem?.length ? p.ordem : p.plano.cenas.map((c) => c.numero)).filter((n) => porNumero.has(n));
  const clipes: Clipe[] = [];
  // textos por cima: o tempo certo de cada cena só se sabe depois das transições (inicios)
  const pendentes: { i: number; d: number; s: (t: number) => Sobreposicao }[] = [];
  ordem.forEach((n, i) => {
    const cena = porNumero.get(n)!;
    const imgs = p.cenas?.[String(n)]?.versoes ?? [];
    const img = imgs.find((v) => v.versao === p.cenas?.[String(n)]?.escolhida) ?? imgs[imgs.length - 1];
    const transicao = { tipo: TRANSICAO_DA_CENA(i, ordem.length), duracao: 0.5 };
    if (img?.url) {
      clipes.push(novoClipe('imagem', img.url, `Cena ${n}`, { duracao: cena.duracao_s, zoomDe: 1, zoomPara: 1.1, transicao }));
      // título da cena por cima (texto do roteiro: sem preço/marca inventados)
      if (cena.titulo) pendentes.push({ i, d: cena.duracao_s, s: (t) => ({ ...texto('Título', cena.titulo, Math.round(W * 0.06), Math.round(H * 0.1), Math.round(W * 0.6), { fonte: 'anton', tamanho: formato === '16:9' ? 120 : 130, maiusculas: true, sombra: { cor: 'rgba(0,0,0,.6)', desfoque: 18, dx: 0, dy: 6 } }), de: t, ate: t + cena.duracao_s, animacao: { tipo: 'subir', atraso: 0.2, duracao: 0.6 } } as Sobreposicao) });
    } else {
      const base = modelo ?? null;
      const doc = base
        ? animarTudo(modeloParaDocumento({ ...base, textos: { ...base.textos, titulo: cena.titulo ? cena.titulo.split(/\s+/).reduce<string[]>((l, w) => { if (!l.length || (l[l.length - 1] + ' ' + w).length > 14) l.push(w); else l[l.length - 1] += ` ${w}`; return l; }, []).slice(0, 3) : base.textos.titulo, subtitulo: cena.subtitulo || undefined } }, formato))
        : { versao: 2 as const, formato, fundo: p.plano.paleta[0] ?? '#000000', camadas: [] };
      clipes.push(novoClipe('arte', '', `Cena ${n}`, { documento: { ...doc, video: { duracao: cena.duracao_s } }, duracao: cena.duracao_s, zoomPara: 1, transicao }));
    }
    // PREÇO REAL do produto da cena (dado do pedido, desenhado por código)
    const prod = cena.produto_id ? p.produtos.find((x) => x.id === cena.produto_id) : null;
    const centavos = prod ? prod.preco_promo_centavos ?? prod.preco_centavos : null;
    if (prod && centavos) {
      pendentes.push({ i, d: cena.duracao_s, s: (t) => ({ ...texto('Preço', `R$ ${formatarPreco(centavos).completo}`, Math.round(W * 0.06), Math.round(H * 0.72), Math.round(W * 0.34), { fonte: 'anton', tamanho: formato === '16:9' ? 110 : 120, cor: '#111111', alinhamento: 'center', fundo: { cor: '#ffd21f', raio: 28, margem: 28 } }), id: idNovo('s'), de: t + 0.3, ate: t + cena.duracao_s, animacao: { tipo: 'zoom', atraso: 0, duracao: 0.5 } } as Sobreposicao) });
    }
  });
  const ini = inicios(clipes);
  return { ...projeto, fundo: p.plano.paleta[0] ?? '#000000', clipes, sobreposicoes: pendentes.map((x) => ({ ...x.s(ini[x.i]), id: idNovo('s') })) };
}
