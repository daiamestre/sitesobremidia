import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { montarPagador, mensagemCadastroIncompleto, cpfValido, cnpjValido } from '../../../supabase/functions/_shared/pagadorBoleto';

// F-122 — boleto com o cadastro real do cliente; conciliação em rodízio; "pago" só com confirmação do banco.
const ler = (arquivo: string) => readFileSync(path.join(process.cwd(), arquivo), 'utf8').replace(/\r\n/g, '\n');

const completo = {
  razao_social: '  Mercado   Bom Preço LTDA ', nome_fantasia: 'Bom Preço', cnpj: '11.222.333/0001-81', email: 'financeiro@bompreco.com.br',
  cep: '55002-970', logradouro: 'Rua Duque de Caxias', numero: '120', complemento: 'Loja 2', bairro: 'Centro', cidade: 'Caruaru', estado: 'pe',
};

describe('Pagador do boleto = cadastro real do cliente (F-122)', () => {
  it('empresa com CNPJ: pessoa jurídica, só dígitos, textos limpos', () => {
    const { pagador, faltando } = montarPagador(completo);
    expect(faltando).toEqual([]);
    expect(pagador).toEqual({
      tipoPessoa: 'JURIDICA', nome: 'Mercado Bom Preço LTDA', cpfCnpj: '11222333000181', endereco: 'Rua Duque de Caxias',
      cidade: 'Caruaru', uf: 'PE', cep: '55002970', numero: '120', complemento: 'Loja 2', bairro: 'Centro', email: 'financeiro@bompreco.com.br',
    });
  });

  it('pessoa física com CPF; e-mail inválido e campos opcionais vazios ficam de fora', () => {
    const { pagador } = montarPagador({ ...completo, cnpj: '529.982.247-25', razao_social: null, email: 'sem-arroba', numero: '', complemento: null, bairro: ' ' });
    expect(pagador).toEqual({ tipoPessoa: 'FISICA', nome: 'Bom Preço', cpfCnpj: '52998224725', endereco: 'Rua Duque de Caxias', cidade: 'Caruaru', uf: 'PE', cep: '55002970' });
  });

  it('cadastro incompleto não emite e diz exatamente o que falta', () => {
    const r = montarPagador({ razao_social: 'Loja X', cnpj: '11.222.333/0001-00', cep: '5500', logradouro: '', cidade: 'Caruaru', estado: 'XX' });
    expect(r.pagador).toBeNull();
    expect(r.faltando).toEqual(['CPF/CNPJ válido', 'CEP', 'endereço (rua)', 'estado (UF)']);
    expect(mensagemCadastroIncompleto(r.faltando)).toBe('Cadastro do cliente incompleto para emitir boleto. Complete: CPF/CNPJ válido, CEP, endereço (rua), estado (UF).');
    expect(montarPagador(null)).toEqual({ pagador: null, faltando: ['cadastro do cliente'] });
  });

  it('dígitos verificadores: documento inventado ou repetido é recusado', () => {
    expect(cpfValido('52998224725')).toBe(true);
    expect(cpfValido('52998224724')).toBe(false);
    expect(cpfValido('11111111111')).toBe(false);
    expect(cnpjValido('11222333000181')).toBe(true);
    expect(cnpjValido('11222333000180')).toBe(false);
    expect(cnpjValido('00000000000000')).toBe(false);
  });

  it('limites do banco: nome 100, endereço 100, número 10, bairro 60, cidade 60', () => {
    const { pagador } = montarPagador({ ...completo, razao_social: 'A'.repeat(150), logradouro: 'B'.repeat(150), numero: '1'.repeat(20), bairro: 'C'.repeat(90), cidade: 'D'.repeat(90) });
    expect(pagador?.nome).toHaveLength(100);
    expect(pagador?.endereco).toHaveLength(100);
    expect(pagador?.numero).toHaveLength(10);
    expect(pagador?.bairro).toHaveLength(60);
    expect(pagador?.cidade).toHaveLength(60);
  });
});

describe('Motores do Banco Inter (F-122)', () => {
  const boleto = ler('supabase/functions/inter-billing-engine/index.ts');
  const pix = ler('supabase/functions/inter-pix-engine/index.ts');
  const sql = ler('supabase/migrations/20261288_inter_fila_conciliacao.sql');

  it('boleto não tem mais pagador nem valor fixo de teste', () => {
    for (const proibido of ['85332361076', 'Teste Sandbox', 'Cliente SobreMidia', 'Rua Sandbox', 'sandbox@bancointer.com.br', ': 10.00', '?? 10.00']) {
      expect(boleto).not.toContain(proibido);
    }
    expect(boleto.match(/pagador: cadastro(Publico)?\.pagador,/g)).toHaveLength(2);
    expect(boleto).toContain("code: 'CADASTRO_INCOMPLETO'");
    expect(boleto).toContain("code: 'VALOR_INVALIDO'");
  });

  it('emissão pelo painel confere cadastro e valor ANTES de travar a cobrança; sem reemissão automática', () => {
    expect(boleto.indexOf("code: 'CADASTRO_INCOMPLETO'")).toBeLessThan(boleto.indexOf("inter_status: 'PROCESSING',"));
    expect(boleto).toContain(".or('inter_status.is.null,inter_status.eq.FAILED,inter_status.eq.DRAFT')");
  });

  it('aviso de pago só vira "pago" na cobrança depois que o Inter confirma', () => {
    expect(boleto).toContain('if (target && !avisoDePago) await srv.from(\'contas_receber\').update({ inter_status: normalizedSituacao })');
    expect(boleto).toContain('if (ok && target) await srv.from(\'contas_receber\').update({ inter_status: normalizedSituacao })');
  });

  it('página pública: sem boleto no banco não oferece "baixar PDF" — avisa e orienta PIX/atendimento', () => {
    expect(boleto).toContain('disponivel: !!codigoSolicitacao,');
    expect(boleto).toContain("cadastroPublico && !cadastroPublico.pagador ? 'CADASTRO_INCOMPLETO' : 'INDISPONIVEL_NO_MOMENTO'");
    const pagina = ler('src/pages/PaginaCobranca.tsx');
    expect(pagina).toContain('bankData?.boleto?.disponivel === false ? (');
    expect(pagina).toContain('data-testid="boleto-indisponivel"');
    expect(pagina.indexOf('data-testid="boleto-indisponivel"')).toBeLessThan(pagina.indexOf('Boleto autorizado. Você pode baixar a 2ª via'));
  });

  it('conciliação em rodízio nos dois motores: sem teto fixo de 150, com limite de tempo e marcação de consultado', () => {
    for (const [motor, tipo] of [[boleto, 'BOLETO'], [pix, 'PIX']] as const) {
      expect(motor).toContain(`rpc('fn_inter_proximos_conciliar', { p_tipo: '${tipo}', p_max: 120 })`);
      expect(motor).toContain(`rpc('fn_inter_marcar_conciliado', { p_tipo: '${tipo}'`);
      expect(motor).toContain('if (Date.now() - inicioRodada > 95000) break;');
      expect(motor).not.toContain('.limit(150)');
    }
  });

  it('fila: só o servidor acessa; inválido volta 1 vez por dia; aviso de pagamento na frente no máximo 1 vez por hora', () => {
    expect(sql).toContain('ALTER TABLE public.inter_conciliacao_fila ENABLE ROW LEVEL SECURITY;');
    expect(sql).not.toMatch(/CREATE POLICY/i);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fn_inter_proximos_conciliar(text, integer) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain("WHERE NOT (coalesce(f.invalido, false) AND f.consultado_em > now() - interval '1 day')");
    expect(sql).toContain("f.consultado_em < now() - interval '1 hour') THEN 0 ELSE 1 END");
    expect(sql).toContain('f.consultado_em NULLS FIRST');
  });
});
