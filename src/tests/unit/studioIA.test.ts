/** Studio de IA (MG01–MG06) — contrato, preços exatos, validadores dos agentes, desenho da cena, provedores e retomada. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  COTA_DIARIA, TRANSICOES, chaveDoPedido, edicaoInicial, formatarPreco, podeMudar, precoEmCentavos, validarEdicao, validarPedido, validarPlano,
  type CenaPlano, type PedidoStudio, type PlanoCriativo,
} from '../../../supabase/functions/_shared/studio/contrato';
import { htmlDaCena } from '../../../supabase/functions/_shared/studio/layout';
import { normalizarDuracoes, type Executar } from '../../../supabase/functions/_shared/studio/agentes';
import { planejarProducao } from '../../../supabase/functions/_shared/studio/pipeline';
import { executorCloudflare, statusDosProvedores } from '../../../supabase/functions/_shared/studio/provedores';

const pedido = (extra: Partial<PedidoStudio> = {}): PedidoStudio => ({
  briefing: { titulo: 'Fim de semana gelado', objetivo: 'Divulgar ofertas', categoria: 'Bebidas e adega', tom: 'Impactante', ideia: 'Oferta de cerveja gelada para o fim de semana.', estabelecimento: 'Adega Exemplo' },
  produtos: [
    { id: 'p1', nome: 'Cerveja long neck', preco_centavos: 849, preco_promo_centavos: 699, fotos: [] },
    { id: 'p2', nome: 'Gelo 5 kg', preco_centavos: 1290, fotos: [] },
  ],
  formato: '16:9', duracao_s: 15, cenas: 3, tipo: 'video_montado', ...extra,
});
const cena = (n: number, extra: Partial<CenaPlano> = {}): CenaPlano => ({
  numero: n, duracao_s: 5, produto_id: n === 1 ? null : `p${n - 1}`, objetivo: 'x', titulo: 'Cerveja gelada', subtitulo: 'Aproveite hoje',
  enquadramento: 'close', iluminacao: 'rim light', lente: '85mm', camera: 'aproximar',
  prompt_cenario: 'dark premium bar counter with warm bokeh lights, empty space on the right, no text, no logos', ...extra,
});
const plano = (cenas: CenaPlano[]): PlanoCriativo => ({ conceito: 'c', estilo_visual: 'e', linguagem: 'l', paleta: ['#000000'], roteiro: 'r', cenas });

describe('preço: sempre exato e em centavos inteiros', () => {
  it('converte o que o cliente digita', () => {
    expect(precoEmCentavos('19,90')).toBe(1990);
    expect(precoEmCentavos('R$ 1.299,90')).toBe(129990);
    expect(precoEmCentavos('19.90')).toBe(1990);
    expect(precoEmCentavos('7')).toBe(700);
    expect(precoEmCentavos('abc')).toBeNull();
    expect(precoEmCentavos('1,999')).toBeNull();
    expect(precoEmCentavos('')).toBeNull();
  });
  it('formata em português sem arredondar errado', () => {
    expect(formatarPreco(129990)).toEqual({ inteiro: '1.299', centavos: '90', completo: '1.299,90' });
    expect(formatarPreco(5).completo).toBe('0,05');
    expect(formatarPreco(1000000).completo).toBe('10.000,00');
  });
});

describe('pedido', () => {
  it('aceita um pedido completo', () => expect(validarPedido(pedido())).toEqual([]));
  it('recusa promoção maior ou igual ao preço', () => {
    const p = pedido();
    p.produtos[0].preco_promo_centavos = 900;
    expect(validarPedido(p).join(' ')).toMatch(/promocional precisa ser menor/);
  });
  it('recusa cena com menos de 2 segundos e excesso de produtos', () => {
    expect(validarPedido(pedido({ duracao_s: 5, cenas: 4 })).join(' ')).toMatch(/pelo menos 2 segundos/);
    const muitos = pedido({ produtos: Array.from({ length: 7 }, (_, i) => ({ id: `p${i + 1}`, nome: `P${i}`, preco_centavos: 100, fotos: [] })) });
    expect(validarPedido(muitos).join(' ')).toMatch(/No máximo 6/);
  });
  it('a chave de idempotência é estável e muda com o conteúdo', async () => {
    const a = await chaveDoPedido('u1', pedido());
    expect(await chaveDoPedido('u1', pedido())).toBe(a);
    expect(await chaveDoPedido('u1', pedido({ duracao_s: 20 }))).not.toBe(a);
  });
});

describe('validador do plano dos agentes (nada inventado)', () => {
  it('aceita um plano correto', () => expect(validarPlano(plano([cena(1), cena(2), cena(3)]), pedido())).toEqual([]));
  it('recusa preço, R$ ou porcentagem no texto', () => {
    expect(validarPlano(plano([cena(1, { titulo: 'Só R$ 6,99' }), cena(2), cena(3)]), pedido()).join(' ')).toMatch(/preço/);
    expect(validarPlano(plano([cena(1), cena(2, { subtitulo: '30% off' }), cena(3)]), pedido()).join(' ')).toMatch(/porcentagem/);
  });
  it('recusa marca ou loja que não veio do pedido', () => {
    expect(validarPlano(plano([cena(1, { titulo: 'Cerveja Heineken gelada' }), cena(2), cena(3)]), pedido()).join(' ')).toMatch(/inventado/);
    // a loja informada pode aparecer
    expect(validarPlano(plano([cena(1, { titulo: 'Venha na Adega Exemplo' }), cena(2), cena(3)]), pedido())).toEqual([]);
  });
  it('recusa cenário que pede texto ou logo e produto inexistente', () => {
    expect(validarPlano(plano([cena(1, { prompt_cenario: 'neon sign with the word SALE above a bar counter' }), cena(2), cena(3)]), pedido()).join(' ')).toMatch(/texto ou logo/);
    expect(validarPlano(plano([cena(1), cena(2, { produto_id: 'p9' }), cena(3)]), pedido()).join(' ')).toMatch(/não existe/);
  });
  it('recusa duração e quantidade de cenas diferentes do pedido', () => {
    expect(validarPlano(plano([cena(1), cena(2)]), pedido()).join(' ')).toMatch(/2 cenas/);
    expect(validarPlano(plano([cena(1), cena(2), cena(3, { duracao_s: 9 })]), pedido()).join(' ')).toMatch(/somam/);
  });
  it('a aritmética das durações é do código: soma exata', () => {
    const r = normalizarDuracoes([{ duracao_s: 3 }, { duracao_s: 7 }, { duracao_s: 1 }, { duracao_s: 4 }], 15);
    expect(r.reduce((s, c) => s + c.duracao_s, 0)).toBe(15);
    expect(r.every((c) => c.duracao_s >= 2)).toBe(true);
  });
});

describe('edição interna', () => {
  it('preço não entra no título e limites são respeitados', () => {
    const e = edicaoInicial(cena(2), '16:9');
    expect(validarEdicao(e)).toEqual([]);
    expect(validarEdicao({ ...e, titulo: 'Leve por 9,90' }).join(' ')).toMatch(/Preço não vai no título/);
    expect(validarEdicao({ ...e, produto_altura: 200 }).length).toBeGreaterThan(0);
  });
  it('vertical começa com texto no topo e produto no centro', () => {
    const e = edicaoInicial(cena(2), '9:16');
    expect(e.texto_pos).toBe('topo');
    expect(e.produto_x).toBe(50);
  });
});

describe('desenho determinístico da cena', () => {
  const base = { formato: '16:9' as const, edicao: edicaoInicial(cena(2), '16:9'), fundoUrl: 'https://x.invalid/f.jpg', produtoUrl: 'https://x.invalid/p.png' };
  it('escreve o preço exato vindo do pedido', () => {
    const html = htmlDaCena({ ...base, precoCentavos: 699, precoDeCentavos: 849, unidade: 'cada' });
    expect(html).toContain('data-preco="6,99"');
    expect(html).toContain('de R$ 8,49');
    expect(html).toContain('width:1920px;height:1080px');
  });
  it('sem preço quando a edição esconde e escapa HTML do texto', () => {
    const html = htmlDaCena({ ...base, edicao: { ...base.edicao, mostrar_preco: false, titulo: '<script>x</script>' }, precoCentavos: 699 });
    expect(html).not.toContain('data-preco');
    expect(html).toContain('&lt;script&gt;x&lt;/script&gt;');
  });
  it('9:16 e 1:1 têm a resolução do Player', () => {
    expect(htmlDaCena({ ...base, formato: '9:16' })).toContain('width:1080px;height:1920px');
    expect(htmlDaCena({ ...base, formato: '1:1' })).toContain('width:1080px;height:1080px');
  });
});

describe('o banco e o código usam as MESMAS regras', () => {
  const sql = fs.readFileSync('supabase/migrations/20261349_studio_ia_producoes.sql', 'utf8');
  it('tabela de transições de estado idêntica', () => {
    const bloco = sql.slice(sql.indexOf('studio_transicao_valida(p_de text'), sql.indexOf('else array[]::text[]'));
    const doSql: Record<string, string[]> = {};
    for (const m of bloco.matchAll(/when '([a-z_]+)' then array\[([^\]]*)\]/g)) doSql[m[1]] = [...m[2].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]).sort();
    for (const [de, paras] of Object.entries(TRANSICOES)) {
      if (de === 'cancelado') continue;
      // o banco aceita também aguardando_aprovacao_plano → recebido (pedido de ajuste do plano)
      const esperado = de === 'aguardando_aprovacao_plano' ? [...paras, 'recebido'].sort() : [...paras].sort();
      expect(doSql[de], de).toEqual(esperado);
    }
    expect(podeMudar('planejando', 'pronto')).toBe(false);
  });
  it('limites de cota idênticos', () => {
    for (const [m, l] of Object.entries(COTA_DIARIA)) expect(sql).toContain(`('${m}', ${l.pessoa}, ${l.empresa})`);
  });
});

describe('provedores: nada simulado, bloqueios explícitos', () => {
  it('sem segredos tudo fica indisponível; vídeo por IA, voz, música e Canva bloqueados mesmo com segredos', () => {
    const vazio = statusDosProvedores(() => undefined);
    expect(vazio.every((p) => !p.disponivel)).toBe(true);
    const tudo = statusDosProvedores(() => 'x');
    const por = Object.fromEntries(tudo.map((p) => [p.id, p]));
    expect(por['cf-flux-schnell'].disponivel).toBe(true);
    expect(por['video-ia'].disponivel).toBe(false);
    expect(por.voz.disponivel).toBe(false);
    expect(por.canva.disponivel).toBe(false);
  });
  it('imagem paga só com autorização explícita (STUDIO_PERMITIR_IMAGEM_PAGA=1)', () => {
    const sem = statusDosProvedores((k) => (k === 'STUDIO_PERMITIR_IMAGEM_PAGA' ? '0' : 'x')).find((p) => p.id === 'cf-lucid-origin')!;
    const com = statusDosProvedores(() => '1').find((p) => p.id === 'cf-lucid-origin')!;
    expect(sem.disponivel).toBe(false);
    expect(com.disponivel).toBe(true);
  });
  it('o adaptador recusa modelo fora da lista', async () => {
    const exec = executorCloudflare({ via: 'rest', accountId: 'a', token: 't' });
    await expect(exec('@cf/qualquer/modelo', {})).rejects.toThrow(/não permitido/);
  });
});

describe('agentes: retomada sem repetir trabalho', () => {
  const respostas: Record<string, unknown> = {
    diretor: { conceito: 'Noite gelada', estilo_visual: 'bar escuro', linguagem: 'direta', paleta: ['#000000', '#FFC400'], duracao_recomendada_s: 15, cenas_recomendadas: 3 },
    roteirista: { roteiro: 'abre, mostra, fecha', cenas: [
      { numero: 1, duracao_s: 4, produto_id: null, objetivo: 'atenção', titulo: 'Sextou gelado', subtitulo: 'Aproveite' },
      { numero: 2, duracao_s: 6, produto_id: 'p1', objetivo: 'produto', titulo: 'Cerveja gelada', subtitulo: 'Long neck' },
      { numero: 3, duracao_s: 5, produto_id: 'p2', objetivo: 'fechamento', titulo: 'Gelo garantido', subtitulo: 'Passe aqui' }] },
    fotografia: { cenas: [1, 2, 3].map((n) => ({ numero: n, enquadramento: 'close', iluminacao: 'rim', lente: '85mm', camera: 'aproximar' })) },
    prompts: { cenas: [1, 2, 3].map((n) => ({ numero: n, prompt_cenario: 'dark bar counter, warm bokeh lights, empty space on the right, no text', negativo: 'people' })) },
  };
  const falso = (contador: { n: number }): Executar => async (_m, entrada) => {
    contador.n++;
    const sistema = String((entrada.messages as Array<{ content: unknown }>)[0].content);
    const k = /Diretor Criativo/.test(sistema) ? 'diretor' : /Roteirista/.test(sistema) ? 'roteirista' : /Diretor de Fotografia/.test(sistema) ? 'fotografia' : 'prompts';
    return { response: respostas[k], usage: { prompt_tokens: 1000, completion_tokens: 300 } };
  };
  it('primeira vez roda os 4 agentes; com a memória gravada, roda 0', async () => {
    const memoria: Record<string, unknown> = {};
    const c1 = { n: 0 };
    const r1 = await planejarProducao(falso(c1), pedido(), { feitas: memoria, imagem: async () => null, gravar: async (k, r) => { memoria[k] = r.saida; } });
    expect(r1.erros).toEqual([]);
    expect(c1.n).toBe(4);
    expect(r1.plano.cenas.map((c) => c.produto_id)).toEqual([null, 'p1', 'p2']);
    expect(r1.plano.cenas.every((c) => /no text/.test(c.prompt_cenario))).toBe(true);
    const c2 = { n: 0 };
    await planejarProducao(falso(c2), pedido(), { feitas: { ...memoria }, imagem: async () => null, gravar: async () => {} });
    expect(c2.n).toBe(0);
  });
});
