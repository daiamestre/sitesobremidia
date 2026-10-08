import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom';

// F-167 — avisos respeitam o que o usuário já viu; "excluir" = lido + some da tela (nada é apagado).
const ler = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const sql = ler('supabase/migrations/20261313_avisos_vistos_e_dispensar.sql');

const banco = vi.hoisted(() => ({ vistos: [] as Array<{ chave: string; assinatura: string }>, chamadas: [] as Array<[string, unknown]> }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: vi.fn(async (fn: string, args?: Record<string, unknown>) => {
      banco.chamadas.push([fn, args]);
      if (fn === 'aviso_listar_vistos') return { data: banco.vistos, error: null };
      if (fn === 'aviso_registrar_visto') {
        banco.vistos = [...banco.vistos.filter((v) => v.chave !== args!.p_chave), { chave: String(args!.p_chave), assinatura: String(args!.p_assinatura) }];
        return { data: true, error: null };
      }
      return { data: null, error: null };
    }),
  },
}));

import { AlertStrip } from '@/components/central/AlertStrip';
import { VigiaDeAvisosVistos } from '@/components/central/VigiaDeAvisosVistos';
import { assinaturaDoAlerta, caminhoDoLink, esquecerAlertasExibidos, alertaEstaVisto } from '@/lib/avisosVistos';
import type { Alerta } from '@/lib/dashboardResumo';

const FATURAS: Alerta = { id: 'faturas', nivel: 'critico', titulo: '14 faturas vencidas', detalhe: 'pague para manter a campanha no ar', link: '/portal/financeiro' };
const MENSAGENS: Alerta = { id: 'mensagens', nivel: 'atencao', titulo: '4 mensagens não lidas', detalhe: 'Mensagens', link: '/portal/central' };
const OK: Alerta = { id: 'tudo-ok', nivel: 'ok', titulo: 'Tudo em dia', detalhe: 'nenhuma fatura pendente', link: '/portal/financeiro' };

function montar(alertas: Alerta[], inicial = '/portal') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[inicial]}>
        <VigiaDeAvisosVistos />
        <Routes>
          <Route path="/portal" element={<><AlertStrip alertas={alertas} /><Link to="/portal/financeiro">ir</Link></>} />
          <Route path="/portal/financeiro" element={<div>financeiro<Link to="/portal">voltar</Link></div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => { banco.vistos = []; banco.chamadas = []; esquecerAlertasExibidos(); });

describe('Alertas da faixa do topo respeitam o que o usuário já viu', () => {
  it('assinatura muda quando a situação muda (então o alerta volta sozinho)', () => {
    expect(assinaturaDoAlerta(FATURAS)).toBe('14 faturas vencidas|pague para manter a campanha no ar');
    expect(alertaEstaVisto(FATURAS, [{ chave: 'faturas', assinatura: assinaturaDoAlerta(FATURAS) }])).toBe(true);
    expect(alertaEstaVisto({ ...FATURAS, titulo: '15 faturas vencidas' }, [{ chave: 'faturas', assinatura: assinaturaDoAlerta(FATURAS) }])).toBe(false);
    expect(alertaEstaVisto(OK, [{ chave: 'tudo-ok', assinatura: assinaturaDoAlerta(OK) }])).toBe(false); // "tudo em dia" nunca é dispensado
    expect(caminhoDoLink('/portal/central?aba=suporte#x')).toBe('/portal/central');
  });

  it('botão X dispensa o alerta, guarda no banco e ele não volta com a mesma situação', async () => {
    montar([FATURAS, MENSAGENS]);
    expect(await screen.findByTestId('alerta-faturas')).toBeTruthy();
    fireEvent.click(screen.getByTestId('dispensar-faturas'));
    await waitFor(() => expect(screen.queryByTestId('alerta-faturas')).toBeNull());
    expect(screen.getByTestId('alerta-mensagens')).toBeTruthy(); // os outros continuam
    expect(banco.chamadas).toContainEqual(['aviso_registrar_visto', { p_chave: 'faturas', p_assinatura: assinaturaDoAlerta(FATURAS) }]);
  });

  it('já visto no banco (outro aparelho) não aparece; situação diferente aparece de novo', async () => {
    banco.vistos = [{ chave: 'faturas', assinatura: assinaturaDoAlerta(FATURAS) }];
    const { unmount } = montar([FATURAS]);
    await waitFor(() => expect(screen.queryByTestId('alerta-faturas')).toBeNull());
    unmount();
    montar([{ ...FATURAS, titulo: '15 faturas vencidas' }]);
    expect(await screen.findByTestId('alerta-faturas')).toBeTruthy();
  });

  it('abrir a tela para onde o alerta aponta conta como ter visto: ao voltar, o alerta sumiu', async () => {
    montar([FATURAS, MENSAGENS]);
    await screen.findByTestId('alerta-faturas');
    fireEvent.click(screen.getByTestId('alerta-faturas')); // vai para /portal/financeiro
    await screen.findByText('financeiro');
    await waitFor(() => expect(banco.chamadas.some(([fn, a]) => fn === 'aviso_registrar_visto' && (a as { p_chave: string }).p_chave === 'faturas')).toBe(true));
    fireEvent.click(screen.getByText('voltar'));
    await screen.findByTestId('alerta-mensagens');
    await waitFor(() => expect(screen.queryByTestId('alerta-faturas')).toBeNull());
  });

  it('"Tudo em dia" não tem botão de dispensar', async () => {
    montar([OK]);
    await screen.findByTestId('alerta-tudo-ok');
    expect(screen.queryByTestId('dispensar-tudo-ok')).toBeNull();
  });

  it('se todos os alertas foram vistos a faixa inteira some', async () => {
    banco.vistos = [{ chave: 'faturas', assinatura: assinaturaDoAlerta(FATURAS) }];
    montar([FATURAS]);
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Alertas de hoje' })).toBeNull());
  });
});

describe('Migração 20261313 — avisos', () => {
  it('só o dono do aviso lê/dispensa; nada é apagado', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS dispensada_em timestamptz');
    expect(sql.match(/WHERE usuario_id = auth\.uid\(\)/g)!.length).toBeGreaterThanOrEqual(2);
    expect(sql).not.toMatch(/DELETE FROM public\.notificacoes_central/);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.central_notificacoes_dispensar(uuid[]) FROM PUBLIC, anon;');
  });
  it('fatura paga/cancelada baixa os avisos de cobrança dela (e os atrasados já quitados)', () => {
    expect(sql).toContain("IF NEW.status IN ('PAGA', 'PAGO', 'CANCELADA', 'CANCELADO')");
    expect(sql).toContain("tipo_evento <> 'FATURA_COLECTION_PAID'");
    expect(sql).toContain('CREATE TRIGGER tg_fatura_quitada_resolve_avisos AFTER UPDATE OF status ON public.contas_receber');
    expect(sql).toContain('UPDATE public.notificacoes_central n');
  });
  it('alerta visto é por usuário + assinatura e a tabela é fechada ao navegador', () => {
    expect(sql).toContain('PRIMARY KEY (usuario_id, chave)');
    expect(sql).toContain('REVOKE ALL ON public.aviso_visto FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('WHERE v.usuario_id = auth.uid()');
  });
});

describe('Telas: cada aviso tem botão para excluir (dispensar)', () => {
  it('sino do CRM, Central e Central do anunciante', () => {
    const header = ler('src/modules/crm/components/Header.tsx');
    expect(header).toContain('data-testid="dispensar-notificacao"');
    expect(header).toContain("status: 'NAO_LIDA'"); // o sino só mostra o que ainda não foi lido
    expect(header).toContain('centralService.dispensarNotificacoes');
    expect(ler('src/pages/Central/CentralDashboard.tsx')).toContain('data-testid="dispensar-notificacao"');
    const anunciante = ler('src/modules/crm/pages/portal/CentralAnunciantePage.tsx');
    expect(anunciante).toContain('data-testid="dispensar-aviso"');
    expect(anunciante).toContain(".is('dispensada_em', null)");
  });
  it('o App monta o vigia de visitas uma vez, dentro do roteador', () => {
    const app = ler('src/App.tsx');
    expect(app).toContain('<VigiaDeAvisosVistos />');
    expect(app.indexOf('<BrowserRouter>')).toBeLessThan(app.indexOf('<VigiaDeAvisosVistos />'));
  });
});
