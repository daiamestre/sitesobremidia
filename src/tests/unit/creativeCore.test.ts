// MG-STUDIO-02/03 — SOBRE MÍDIA CREATIVE CORE: DNA persistido, segmentos, briefing, direção, roteamento, prompts e
// qualidade; agentes existentes recebendo o contexto do Core. Testes A–G do pedido do dono (nível de planejamento).
import { describe, it, expect } from 'vitest';
import { planejarComCore, contextoParaAgente, estiloDoPedido, type Executar } from '../../../supabase/functions/_shared/studio/core/core';
import { VERSAO_DNA, REGRAS, ROTEIROS, AUTORIDADE, PROIBIDO } from '../../../supabase/functions/_shared/studio/core/dna';
import { SEGMENTOS_DE_FABRICA, reconhecerSegmento, taxonomia } from '../../../supabase/functions/_shared/studio/core/segmentos';
import { diretorCriativo, roteirista } from '../../../supabase/functions/_shared/studio/agentes';
import type { PedidoStudio } from '../../../supabase/functions/_shared/studio/contrato';

const SEM_IA = { disponiveis: new Set(['interno', 'cf-flux-schnell']) };

describe('MG-STUDIO-02 — DNA visual e taxonomia', () => {
  it('DNA versionado com autoridade, proibições, regras de TODAS as modalidades e roteiros de 15/20 s', () => {
    expect(VERSAO_DNA).toBe('dna.v2');
    expect(AUTORIDADE[0]).toMatch(/segurança/);
    expect(PROIBIDO.join(' ')).toMatch(/Inventar preço/);
    for (const m of ['imagem', 'fotografia_produto', 'arte_comercial', 'elemento_3d', 'redes_sociais', 'personagem', 'motion', 'video_ia'] as const) expect(REGRAS[m].length).toBeGreaterThan(1);
    expect(ROTEIROS[15].at(-1)!.ate).toBe(15);
    expect(ROTEIROS[20].at(-1)!.ate).toBe(20);
  });
  it('10 segmentos do pedido, cada um com todos os campos; extensível sem mexer no núcleo', () => {
    expect(SEGMENTOS_DE_FABRICA.map((s) => s.id)).toEqual(['esportes', 'fitness', 'saude', 'educacao', 'alimentacao', 'beleza', 'varejo', 'automotivo', 'tecnologia', 'servicos']);
    for (const s of SEGMENTOS_DE_FABRICA) {
      expect(s.categorias.length).toBeGreaterThan(0);
      expect(s.paletas[0].every((c) => /^#[0-9A-F]{6}$/i.test(c))).toBe(true);
      expect(s.ambientes.length && s.estilos.length && s.regrasSeguranca.length && s.provedores.imagem.length).toBeTruthy();
    }
    const novo = { ...SEGMENTOS_DE_FABRICA[0], id: 'pet', nome: 'Pet', palavras: ['pet shop', 'banho e tosa', 'racao'], categorias: [] };
    expect(taxonomia([novo]).length).toBe(11);
    expect(reconhecerSegmento('promoção de banho e tosa no pet shop', taxonomia([novo])).segmento.id).toBe('pet');
  });
});

describe('MG-STUDIO-03 — Creative Core (testes A–G do pedido, planejamento)', () => {
  it('A — supermercado com foto e preço reais → COMPOSIÇÃO determinística, preço fora de qualquer prompt', async () => {
    const r = await planejarComCore({ texto: 'Oferta de supermercado do arroz 5kg para esta semana', produtos: [{ id: 'p1', nome: 'Arroz Tipo 1 5kg', preco_centavos: 2490, tem_foto: true }], estabelecimento: 'Mercado Bom Preço' }, SEM_IA);
    expect(r.segmento.id).toBe('varejo');
    expect(r.roteamento.modo).toBe('composicao');
    expect(r.direcao.deterministico).toContain('preço');
    expect(Object.values(r.prompts).join(' ')).not.toMatch(/24[.,]90|2490|R\$/);
    expect(r.qualidade.aprovado).toBe(true);
  });
  it('B — academia: matrícula → segmento fitness, ambiente de academia, imagem por IA grátis', async () => {
    const r = await planejarComCore({ texto: 'Anúncio de matrícula para a academia, plano anual' }, SEM_IA);
    expect(r.segmento.id).toBe('fitness');
    expect(r.briefing.objetivo).toBe('matrículas/inscrições');
    expect(r.direcao.ambiente).toMatch(/academia/);
    expect(r.roteamento).toMatchObject({ modo: 'imagem_ia', provedor: 'cf-flux-schnell', disponivel: true });
    expect(r.prompts['cf-flux-schnell']).toMatch(/gym/);
  });
  it('C — depilação a laser → SAÚDE / estética clínica, sem roupa/cosmético e sem alegação clínica', async () => {
    const r = await planejarComCore({ texto: 'Campanha de depilação a laser da clínica' }, SEM_IA);
    expect(r.segmento).toMatchObject({ id: 'saude', categoria: 'Estética clínica' });
    expect(r.direcao.ambiente).toMatch(/clínica/);
    expect(`${r.direcao.conceito} ${Object.values(r.prompts).join(' ')}`).not.toMatch(/clothing|fashion|lipstick|makeup|perfume|roupa|batom/i);
    expect(r.qualidade.aprovado).toBe(true);
    expect(r.qualidade.evidencias.join(' ')).toMatch(/sem promessa de cura/);
  });
  it('D — restaurante animado → MOTION (sem IA de vídeo), roteiro de 15 s exato com animações', async () => {
    const r = await planejarComCore({ texto: 'Vídeo animado de 15 segundos do restaurante com o prato do dia' }, SEM_IA);
    expect(r.segmento.id).toBe('alimentacao');
    expect(r.roteamento.modo).toBe('motion');
    expect(r.roteiro!.at(-1)!.ate).toBe(15);
    expect(r.roteiro!.map((c) => c.animacao)).toEqual(['zoom', 'panoramica', 'subir', 'pulsar']);
  });
  it('E — mascote falando em 2 cenas → VÍDEO IA bloqueado (sem provedor), alternativa motion, pede referência', async () => {
    const r = await planejarComCore({ texto: 'Vídeo com um mascote falando e apresentando as ofertas em duas cenas', tipo: 'video' }, SEM_IA);
    expect(r.roteamento).toMatchObject({ modo: 'video_ia', disponivel: false, alternativa: 'motion' });
    expect(r.briefing.faltando.join(' ')).toMatch(/referência do personagem/);
  });
  it('F — imagem comercial → vídeo de 20 s: motion com roteiro de 5 partes', async () => {
    const r = await planejarComCore({ texto: 'Transformar a arte em vídeo de 20 segundos', produtos: [{ id: 'p1', nome: 'Perfume', tem_foto: true }] }, SEM_IA);
    expect(r.roteamento.modo).toBe('motion');
    expect(r.roteiro).toHaveLength(5);
    expect(r.roteiro!.at(-1)!.ate).toBe(20);
  });
  it('G — provedor de IA fora do ar: nada se perde, tudo continua no modo local e a falha fica registrada', async () => {
    const quebrado: Executar = async () => { throw new Error('503 provedor indisponível'); };
    const r = await planejarComCore({ texto: 'Anúncio de matrícula para a academia' }, { ...SEM_IA, ia: { exec: quebrado, modelo: 'x', provedor: 'cf-llama4-scout' } });
    expect(r.direcao.fonte).toBe('local');
    expect(r.etapas.map((e) => e.agente)).toContain('diretor:ia-indisponivel');
    expect(r.qualidade.aprovado).toBe(true);
  });
  it('a IA só refina: resposta que fere as regras (preço ou outro segmento) é recusada', async () => {
    const atrevida: Executar = async () => ({ response: JSON.stringify({ conceito: 'Depilação por R$ 99,90 com roupa da moda', estilo: 'clean', ambiente_en: 'fashion clothing store' }) });
    const r = await planejarComCore({ texto: 'Campanha de depilação a laser da clínica' }, { ...SEM_IA, ia: { exec: atrevida, modelo: 'x', provedor: 'teste' } });
    expect(r.direcao.fonte).toBe('local');
    expect(r.etapas.map((e) => e.agente)).toContain('diretor:ia-recusada-pelas-regras');
    const boa: Executar = async () => ({ response: JSON.stringify({ conceito: 'Pele lisa com cuidado profissional', estilo: 'humanizado', ambiente_en: 'bright aesthetic clinic treatment room' }) });
    const r2 = await planejarComCore({ texto: 'Campanha de depilação a laser da clínica' }, { ...SEM_IA, ia: { exec: boa, modelo: 'x', provedor: 'teste' } });
    expect(r2.direcao).toMatchObject({ fonte: 'ia', estilo: 'humanizado' });
  });
  it('briefing aponta o que falta e o que não bate (oferta sem preço; preço só no texto livre)', async () => {
    const r = await planejarComCore({ texto: 'Oferta do picanha por R$ 59,90 no açougue' }, SEM_IA);
    expect(r.briefing.faltando.join(' ')).toMatch(/preço/);
    expect(r.briefing.inconsistencias.join(' ')).toMatch(/texto livre/);
  });
});

describe('agentes existentes recebem o contexto do Core', () => {
  const pedido: PedidoStudio = {
    briefing: { titulo: 'Depilação a laser', objetivo: 'Informar um serviço', categoria: 'Beleza e estética', tom: 'Sério e confiável', ideia: 'Clínica de depilação a laser com agendamento' },
    produtos: [], formato: '16:9', duracao_s: 15, cenas: 3, tipo: 'video_montado',
  };
  it('o sistema de cada agente leva DNA + segmento + regras da modalidade', () => {
    const ctx = contextoParaAgente('diretor', pedido);
    expect(ctx).toContain('SOBRE MÍDIA CREATIVE CORE');
    expect(ctx).toContain(VERSAO_DNA);
    expect(ctx).toMatch(/Segmento \(dna\.v2\): Saúde \/ Estética clínica/);
    expect(estiloDoPedido(pedido).ambientes_do_segmento[0]).toMatch(/clínica/);
  });
  it('diretorCriativo e roteirista mandam esse contexto ao modelo (executor espião)', async () => {
    const sistemas: string[] = [];
    const espiao: Executar = async (_m, e) => {
      sistemas.push(String((e.messages as { content: string }[])[0].content));
      return { response: JSON.stringify({ conceito: 'Cuidado profissional', estilo_visual: 'clean', linguagem: 'acolhedora', paleta: ['#0B2545', '#13A89E'], duracao_recomendada_s: 15, cenas_recomendadas: 3, roteiro: 'x', cenas: [1, 2, 3].map((n) => ({ numero: n, duracao_s: 5, produto_id: null, objetivo: 'o', titulo: 'Agende já', subtitulo: 'Clínica' })) }) };
    };
    const d = await diretorCriativo(espiao, pedido, {});
    await roteirista(espiao, pedido, d.saida);
    expect(sistemas).toHaveLength(2);
    for (const s of sistemas) { expect(s).toContain('dna.v2'); expect(s).toContain('Saúde'); }
    expect(d.versao).toBe('biblia.v1+dna.v2');
  });
});

describe('pipeline: Core primeiro e plano local quando a IA cai', () => {
  const pedido: PedidoStudio = {
    briefing: { titulo: 'Ofertas do açougue', objetivo: 'Divulgar ofertas', categoria: 'Açougue', tom: 'Impactante', ideia: 'Picanha e costela para o fim de semana', estabelecimento: 'Casa de Carnes Boi Bom' },
    produtos: [{ id: 'p1', nome: 'Picanha', preco_centavos: 6990, fotos: [] }, { id: 'p2', nome: 'Costela', preco_centavos: 3290, fotos: [] }],
    formato: '16:9', duracao_s: 15, cenas: 4, tipo: 'video_montado',
  };
  it('grava a etapa "core" antes dos agentes e, sem nenhuma IA, monta um plano válido sozinho (sem preço inventado)', async () => {
    const { planejarProducao } = await import('../../../supabase/functions/_shared/studio/pipeline');
    const { FalhaDoAgente } = await import('../../../supabase/functions/_shared/studio/agentes');
    const gravadas: string[] = [];
    const semIA: Executar = async () => { throw new FalhaDoAgente('diretor', 'cota diária da IA esgotada', 1, 0); };
    const r = await planejarProducao(semIA, pedido, { feitas: {}, imagem: async () => null, gravar: async (chave) => { gravadas.push(chave); } }, { core: SEM_IA });
    expect(gravadas[0]).toBe('core');
    expect(gravadas).toContain('core-local');
    expect(r.erros).toEqual([]);
    expect(r.core.segmento.id).toBe('varejo');
    expect(r.plano.cenas).toHaveLength(4);
    expect(r.plano.cenas.reduce((a, c) => a + c.duracao_s, 0)).toBe(15);
    expect(JSON.stringify(r.plano)).not.toMatch(/69[.,]90|32[.,]90|R\$/);
    expect(r.plano.cenas.map((c) => c.titulo).join(' ')).toMatch(/Picanha|Costela|Ofertas|Boi Bom/);
  });
});

describe('Core → editor de vídeo (decisão 4: conectar sem reconstruir)', () => {
  it('o plano vira projeto editável: uma cena = um clipe, tempos do plano, PREÇO REAL por cima, imagem gerada com zoom lento', async () => {
    const { planejarProducao } = await import('../../../supabase/functions/_shared/studio/pipeline');
    const { FalhaDoAgente } = await import('../../../supabase/functions/_shared/studio/agentes');
    const { projetoDaProducao } = await import('@/lib/studio/video/doCore');
    const { duracaoTotal } = await import('@/lib/studio/video/linha');
    const { CAPAS } = await import('@/lib/studio/pastas');
    const pedido: PedidoStudio = {
      briefing: { titulo: 'Ofertas do açougue', objetivo: 'Divulgar ofertas', categoria: 'Açougue', tom: 'Impactante', ideia: 'Picanha no fim de semana' },
      produtos: [{ id: 'p1', nome: 'Picanha', preco_centavos: 6990, fotos: [] }], formato: '16:9', duracao_s: 15, cenas: 3, tipo: 'video_montado',
    };
    const semIA: Executar = async () => { throw new FalhaDoAgente('diretor', 'cota diária da IA esgotada', 1, 0); };
    const { plano } = await planejarProducao(semIA, pedido, { feitas: {}, imagem: async () => null, gravar: async () => undefined }, { core: SEM_IA });
    const cenas = { '2': { versoes: [{ versao: 1, url: 'https://exemplo/cena2.jpg', path: 'x' } as never], escolhida: 1 } };
    const proj = projetoDaProducao({ formato: '16:9', plano, produtos: pedido.produtos, cenas }, CAPAS.find((m) => m.segmento === 'supermercados') ?? null);
    expect(proj.tipo).toBe('video');
    expect(proj.clipes.map((c) => c.tipo)).toEqual(['arte', 'imagem', 'arte']);
    expect(proj.clipes[1]).toMatchObject({ src: 'https://exemplo/cena2.jpg', zoomPara: 1.1 });
    const precos = proj.sobreposicoes.filter((s) => s.nome === 'Preço');
    expect(precos.length).toBeGreaterThan(0);
    for (const s of precos) expect((s as { texto: string }).texto.replace(/\s/g, ' ')).toBe('R$ 69,90');
    expect(duracaoTotal(proj)).toBeGreaterThan(13);
    expect(duracaoTotal(proj)).toBeLessThanOrEqual(15);
  });
});
