/** SOBRE MÍDIA Studio AI — adaptador OpenAI: custo real, transparência verdadeira e textos protegidos no prompt melhorado. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { analisarAlfa, custoDaImagem, faltando, mensagemDoErro, trechosObrigatorios, ErroOpenAI, TAMANHO } from '../../../supabase/functions/_shared/studio/openai';

function imagem(w: number, h: number, alfa: (x: number, y: number) => number) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = 200; d[i + 1] = 30; d[i + 2] = 30; d[i + 3] = alfa(x, y); }
  return d;
}

describe('transparência DE VERDADE', () => {
  it('logo com fundo transparente passa', () => {
    const d = imagem(100, 60, (x, y) => (x > 25 && x < 75 && y > 15 && y < 45 ? 255 : 0));
    expect(analisarAlfa(d, 100, 60, 4).transparente).toBe(true);
  });
  it('"quadriculado" desenhado (tudo opaco) NÃO passa', () => {
    const d = imagem(100, 60, () => 255);
    const r = analisarAlfa(d, 100, 60, 4);
    expect(r.transparente).toBe(false);
    expect(r.cantosLivres).toBe(false);
  });
  it('imagem sem canal alfa (RGB) nunca é transparente', () => {
    expect(analisarAlfa(new Uint8Array(100 * 60 * 3), 100, 60, 3).transparente).toBe(false);
  });
  it('imagem quase toda vazia (sem conteúdo) não passa', () => {
    const d = imagem(100, 60, (x, y) => (x === 50 && y === 30 ? 255 : 0));
    expect(analisarAlfa(d, 100, 60, 4).transparente).toBe(false);
  });
});

describe('custo real a partir do usage oficial', () => {
  it('gpt-image-2: texto US$ 5, imagem de entrada US$ 8, saída US$ 30 por milhão', () => {
    expect(custoDaImagem('gpt-image-2', { input_tokens: 100, output_tokens: 1000, input_tokens_details: { text_tokens: 100, image_tokens: 0 } })).toBe(0.0305);
    expect(custoDaImagem('gpt-image-2', { input_tokens: 1100, output_tokens: 0, input_tokens_details: { text_tokens: 100, image_tokens: 1000 } })).toBe(0.0085);
  });
  it('modelo sem preço conhecido não inventa custo', () => expect(custoDaImagem('modelo-x', { output_tokens: 10 })).toBeNull());
  it('tamanhos oficiais', () => expect(TAMANHO).toEqual({ quadrado: '1024x1024', horizontal: '1536x1024', vertical: '1024x1536' }));
});

describe('prompt melhorado nunca muda o que o cliente pediu', () => {
  it('extrai textos entre aspas e números', () => {
    expect(trechosObrigatorios('Logo "SUPER OFERTA" com R$ 9,99 e 50%')).toEqual(expect.arrayContaining(['SUPER OFERTA', 'R$ 9,99', '50%']));
  });
  it('detecta texto alterado ou traduzido', () => {
    expect(faltando('Logo "PROMOÇÃO RELÂMPAGO"', 'A 3D logo with "FLASH SALE"')).toEqual(['PROMOÇÃO RELÂMPAGO']);
    expect(faltando('Logo "SÓ HOJE" por R$ 4,99', 'Logo 3D dourada "SÓ HOJE" com preço R$ 4,99')).toEqual([]);
  });
});

describe('mensagens de erro claras (sem detalhes internos)', () => {
  it('bloqueio de conteúdo e saldo da plataforma', () => {
    expect(mensagemDoErro(new ErroOpenAI(400, 'moderation_blocked', 'x'))).toMatch(/filtro de conteúdo/);
    expect(mensagemDoErro(new ErroOpenAI(429, 'credit_balance_exhausted', 'x'))).toMatch(/crédito foi devolvido/);
  });
});

describe('banco: créditos imutáveis e preço do dono', () => {
  const sql = fs.readFileSync('supabase/migrations/20261351_studio_ai.sql', 'utf8');
  it('preço padrão R$ 4,99 e saldo nunca negativo', () => {
    expect(sql).toContain('preco_credito_centavos int not null default 499');
    expect(sql).toContain('check (saldo >= 0)');
  });
  it('extrato com gatilho de imutabilidade e chave de idempotência única', () => {
    expect(sql).toMatch(/before update or delete on public\.studio_ai_movimentos/);
    expect(sql).toMatch(/idempotencia text not null unique/);
  });
});
