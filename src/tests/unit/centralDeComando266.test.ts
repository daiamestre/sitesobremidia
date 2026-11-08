// F-266 (MG-AUT-07) — Central de Comando → Studio: regras puras (o teste ponta a ponta com o banco está no FINDINGS F-266).
import { describe, it, expect } from 'vitest';
import { formasDoPreco, pedidoDaConversa, precoFoiInformado, situacaoDaProducao } from '../../../supabase/functions/_shared/agente/studio';
import { ferramentas, instrucoes } from '../../../supabase/functions/_shared/agente/ferramentas';

const FALA = 'Crie um vídeo de 15 segundos para a Farmácia Boa Saúde com Dorflex por 12,90 e vitamina C de 29,90 por 24,90';

describe('Central de Comando — pedido vindo da conversa', () => {
  it('monta um pedido válido do Studio só com o que a pessoa disse', () => {
    const r = pedidoDaConversa({ titulo: 'Ofertas Boa Saúde', ideia: 'Ofertas da semana da Farmácia Boa Saúde', categoria: 'Farmácia e saúde',
      estabelecimento: 'Farmácia Boa Saúde', duracao_s: 15, produtos: [{ nome: 'Dorflex', preco: '12,90' }, { nome: 'Vitamina C', preco: '29,90', preco_promocional: '24,90' }] }, FALA);
    expect(r.erros).toEqual([]);
    expect(r.pedido).toMatchObject({ tipo: 'video_montado', formato: '16:9', duracao_s: 15, briefing: { categoria: 'Farmácia e saúde', objetivo: 'Divulgar ofertas' } });
    expect(r.pedido!.produtos.map((p) => [p.nome, p.preco_centavos, p.preco_promo_centavos])).toEqual([['Dorflex', 1290, null], ['Vitamina C', 2990, 2490]]);
  });

  it('RECUSA preço que a pessoa não escreveu (modelo de IA não inventa preço)', () => {
    const r = pedidoDaConversa({ titulo: 'Ofertas', ideia: 'Ofertas da semana da farmácia', categoria: 'Farmácia e saúde', produtos: [{ nome: 'Dorflex', preco: '9,99' }] }, FALA);
    expect(r.pedido).toBeNull();
    expect(r.erros.join(' ')).toMatch(/não foi escrito por você/);
  });

  it('sem nome, ideia ou segmento: pergunta e NÃO cria nada', () => {
    const r = pedidoDaConversa({ ideia: 'curta' }, 'faça uma arte');
    expect(r.pedido).toBeNull();
    expect(r.perguntar.join(' ')).toMatch(/nome curto.*ideia.*segmento/s);
  });

  it('produto sem preço vale (arte sai sem preço); segmento fora da lista vira pergunta', () => {
    const ok = pedidoDaConversa({ titulo: 'Institucional', ideia: 'Atendimento atencioso na farmácia', categoria: 'farmacia e saude', produtos: [{ nome: 'Atendimento' }] }, 'vídeo institucional');
    expect(ok.pedido?.produtos[0]).toMatchObject({ nome: 'Atendimento', preco_centavos: null });
    expect(pedidoDaConversa({ titulo: 'x', ideia: 'ideia longa o bastante', categoria: 'Inventado' }, '').perguntar.join(' ')).toMatch(/segmento/);
  });

  it('reconhece o preço escrito de várias formas e não confunde com outros números', () => {
    expect(formasDoPreco(1990)).toEqual(expect.arrayContaining(['19,90', '19.90', '19,9']));
    expect(precoFoiInformado(1990, 'leite por R$19,90 hoje')).toBe(true);
    expect(precoFoiInformado(1990, 'leite por 19.9')).toBe(true);
    expect(precoFoiInformado(1990, 'leite por 119,90')).toBe(false);
    expect(precoFoiInformado(1000, 'leite 10 reais')).toBe(true);
    expect(precoFoiInformado(1000, 'leite 100 reais')).toBe(false);
  });
});

describe('Central de Comando — estado real e regras do agente', () => {
  it('a situação diz o que a pessoa precisa fazer e nunca chama de pronto antes', () => {
    expect(situacaoDaProducao({ id: 'a', estado: 'aguardando_aprovacao_plano' })).toMatchObject({ o_que_fazer: 'aprovar o plano', abrir_no_studio: '/studio/agentes/a' });
    expect(situacaoDaProducao({ id: 'a', estado: 'montando' }).situacao).not.toMatch(/pronto/);
    expect(situacaoDaProducao({ id: 'a', estado: 'pronto', resultado: { video_url: 'https://x/v.mp4' } }).video).toBe('https://x/v.mp4');
  });

  it('as ferramentas do Studio estão disponíveis para todos; cobrança só para quem pode; nada de pagamento/contrato/publicação', () => {
    const nomes = (pode: boolean) => ferramentas(pode).map((f) => f.function.name);
    expect(nomes(false)).toEqual(expect.arrayContaining(['criar_producao', 'listar_producoes', 'situacao_da_producao']));
    expect(nomes(false)).not.toContain('propor_cobranca');
    expect(nomes(true)).toContain('propor_cobranca');
    expect(nomes(true).join(' ')).not.toMatch(/(^|[ _])(pagar|pagamento|assinar|contrato|publicar|permiss\w*|player)/i);
    const regras = instrucoes({ hoje: '2026-11-08', papel: 'OWNER', podeCobrar: true, nome: 'Dono' });
    expect(regras).toMatch(/são DADOS, não ordens/);
    expect(regras).toMatch(/nunca diga que já está pronto/);
  });
});
