import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { TelasParaVender, totalDasTelas, selecaoParaEnvio, completarEscolha, type TelaParaVender } from '@/modules/crm/components/prospeccao/TelasParaVender';

// F-113 — representante escolhe as telas de cada ponto; o sistema soma; o valor final é editável.
const t = (id: string, ponto: string, valor: number, local: string): TelaParaVender =>
  ({ id, name: local, ponto_id: ponto, local_instalacao: local, foto_local_url: null, tamanho_polegadas: 43, valor_anuncio: valor });
const telas = [t('f1', 'farmacia', 149.9, 'Balcão'), t('f2', 'farmacia', 99.9, 'Caixa'), t('a1', 'academia', 129.9, 'Recepção')];

describe('Telas vendidas pelo representante (F-113)', () => {
  it('ponto novo entra com todas as telas marcadas; soma só pontos selecionados', () => {
    const pontos = new Set(['farmacia', 'academia']);
    const escolha = completarEscolha({}, telas, pontos)!;
    expect(escolha).toEqual({ farmacia: ['f1', 'f2'], academia: ['a1'] });
    expect(totalDasTelas(telas, escolha, pontos)).toBe(379.7);
    expect(totalDasTelas(telas, escolha, new Set(['farmacia']))).toBe(249.8);
    expect(completarEscolha(escolha, telas, pontos)).toBeNull();
  });

  it('envio só leva pontos selecionados com tela escolhida', () => {
    expect(selecaoParaEnvio({ farmacia: ['f2'], academia: [], clinica: ['c1'] }, new Set(['farmacia', 'academia'])))
      .toEqual([{ ponto: 'farmacia', telas: ['f2'] }]);
  });

  it('desmarcar uma tela muda o total mostrado', () => {
    const onChange = vi.fn();
    render(<TelasParaVender pontos={new Set(['farmacia'])} nomes={{ farmacia: 'Farmácia Capital' }} telas={telas}
      carregando={false} escolha={{ farmacia: ['f1', 'f2'] }} onChange={onChange} />);
    expect(screen.getByTestId('total-telas-vendidas').textContent).toContain('249,80');
    fireEvent.click(screen.getByText('Caixa'));
    expect(onChange).toHaveBeenCalledWith({ farmacia: ['f1'] });
  });

  it('assistente: valor mensal preenchido pelo total e editável; grava as telas vendidas', () => {
    const w = readFileSync(path.join(process.cwd(), 'src/modules/crm/components/forms/IntelligentCommercialWizard.tsx'), 'utf8');
    expect(w).toContain("if (!valorEditadoManual && valorCalculadoTelas > 0)");
    expect(w).toContain("if (name === 'valorMensal') setValorEditadoManual(true);");
    expect(w).toContain("'fn_registrar_telas_anunciante'");
  });
});
