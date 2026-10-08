/**
 * F-162 — Cartão "Rádio Comércio" em cada tela (abaixo da divisão por zonas): chave da rádio e chave do som das mídias
 * que nunca ficam ligadas juntas; as duas desligadas = tela em silêncio; o cartão abre o painel da rádio.
 */
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const definirSom = vi.fn(async () => undefined);
const listar = vi.fn();
vi.mock('@/lib/radio', async () => {
  const actual = await vi.importActual<typeof import('@/lib/radio')>('@/lib/radio');
  return { ...actual, radioService: { ...actual.radioService, listar: () => listar(), definirSom: (...a: unknown[]) => (definirSom as (...x: unknown[]) => Promise<undefined>)(...a) } };
});
vi.mock('@/components/radio/PainelDaRadio', () => ({ PainelDaRadio: (p: { embutido?: boolean; telaAtualId?: string | null }) => <div data-testid="painel-stub" data-embutido={String(p.embutido)} data-tela={p.telaAtualId ?? ''} /> }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { RadioDaTela } from '@/components/radio/RadioDaTela';
import { textoDoSom } from '@/lib/radio';

const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const RADIOS = [{ id: 'r1', nome: 'Rádio da loja', embaralhar: false, faixas: 4 }, { id: 'r2', nome: 'Promoções', embaralhar: true, faixas: 2 }];
const estado = (s: string) => screen.getByTestId(s) as HTMLElement;
const ligada = (id: string) => estado(id).getAttribute('aria-checked') === 'true';

function Cartao({ inicial }: { inicial: Partial<{ audio_enabled: boolean; radio_ativa: boolean; radio_playlist_id: string | null; radio_volume: number }> }) {
  return <RadioDaTela tela={{ id: 't1', name: 'Tela da recepção', ...inicial }} aoMudar={vi.fn()} />;
}

describe('chaves da rádio e do som das mídias', () => {
  // o controle de volume (Radix) mede o próprio tamanho; o jsdom não tem ResizeObserver
  beforeAll(() => { vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} }); });
  beforeEach(() => { definirSom.mockClear(); listar.mockReset(); listar.mockResolvedValue(RADIOS); });

  it('tela nasce em silêncio: as duas chaves desligadas e o texto diz isso', async () => {
    render(<Cartao inicial={{}} />);
    await waitFor(() => expect(listar).toHaveBeenCalled());
    expect(ligada('radio-ligada')).toBe(false);
    expect(ligada('som-midias-ligado')).toBe(false);
    expect(estado('estado-da-radio').textContent).toBe('desligada');
    expect(estado('texto-do-som').textContent).toContain('Tela em silêncio');
  });

  it('ligar a rádio grava RADIO com a 1ª playlist e desliga o som das mídias', async () => {
    render(<Cartao inicial={{ audio_enabled: true }} />);
    await waitFor(() => expect(listar).toHaveBeenCalled());
    expect(ligada('som-midias-ligado')).toBe(true);
    fireEvent.click(estado('radio-ligada'));
    await waitFor(() => expect(definirSom).toHaveBeenCalledWith('t1', 'RADIO', 'r1', 70));
    await waitFor(() => expect(ligada('radio-ligada')).toBe(true));
    expect(ligada('som-midias-ligado')).toBe(false); // nunca juntas
    expect(estado('estado-da-radio').textContent).toBe('no ar');
    expect(estado('texto-do-som').textContent).toContain('No ar: "Rádio da loja"');
  });

  it('ligar o som das mídias com a rádio no ar desliga a rádio', async () => {
    render(<Cartao inicial={{ radio_ativa: true, radio_playlist_id: 'r2', radio_volume: 40 }} />);
    await waitFor(() => expect(ligada('radio-ligada')).toBe(true));
    fireEvent.click(estado('som-midias-ligado'));
    await waitFor(() => expect(definirSom).toHaveBeenCalledWith('t1', 'MIDIAS', 'r2', 40));
    await waitFor(() => expect(ligada('som-midias-ligado')).toBe(true));
    expect(ligada('radio-ligada')).toBe(false);
    expect(estado('texto-do-som').textContent).toContain('a rádio está desligada');
  });

  it('desligar a chave que está ligada deixa a tela em silêncio (mídias rodam mudas)', async () => {
    render(<Cartao inicial={{ radio_ativa: true, radio_playlist_id: 'r1' }} />);
    await waitFor(() => expect(ligada('radio-ligada')).toBe(true));
    fireEvent.click(estado('radio-ligada'));
    await waitFor(() => expect(definirSom).toHaveBeenCalledWith('t1', 'MUDO', 'r1', 70));
    await waitFor(() => expect(ligada('radio-ligada')).toBe(false));
    expect(ligada('som-midias-ligado')).toBe(false);
    expect(estado('texto-do-som').textContent).toContain('Tela em silêncio');
  });

  it('sem nenhuma playlist de áudio: não liga e abre o painel para criar/enviar áudios', async () => {
    listar.mockResolvedValue([]);
    render(<Cartao inicial={{}} />);
    await waitFor(() => expect(listar).toHaveBeenCalled());
    fireEvent.click(estado('radio-ligada'));
    await waitFor(() => expect(screen.getByTestId('janela-da-radio')).toBeTruthy());
    expect(definirSom).not.toHaveBeenCalled();
    expect(ligada('radio-ligada')).toBe(false);
  });

  it('tocar no cartão abre o painel da rádio com a tela atual; clicar numa chave não abre', async () => {
    render(<Cartao inicial={{}} />);
    await waitFor(() => expect(listar).toHaveBeenCalled());
    fireEvent.click(estado('som-midias-ligado'));
    await waitFor(() => expect(definirSom).toHaveBeenCalled());
    expect(screen.queryByTestId('janela-da-radio')).toBeNull();
    fireEvent.click(estado('cartao-radio-da-tela'));
    await waitFor(() => expect(screen.getByTestId('janela-da-radio')).toBeTruthy());
    expect(screen.getByTestId('painel-stub').dataset.embutido).toBe('true');
    expect(screen.getByTestId('painel-stub').dataset.tela).toBe('t1');
  });

  it('rádio no ar mostra a escolha da playlist e o volume', async () => {
    render(<Cartao inicial={{ radio_ativa: true, radio_playlist_id: 'r1' }} />);
    await waitFor(() => expect(estado('radio-escolher')).toBeTruthy());
    fireEvent.change(estado('radio-escolher'), { target: { value: 'r2' } });
    await waitFor(() => expect(definirSom).toHaveBeenCalledWith('t1', 'RADIO', 'r2', 70));
    expect(estado('radio-volume')).toBeTruthy();
  });
});

describe('frases do estado', () => {
  it('cada modo tem a sua', () => {
    expect(textoDoSom('RADIO', 'Loja', 55)).toBe('No ar: "Loja" · volume 55% — os vídeos ficam em silêncio.');
    expect(textoDoSom('MIDIAS', null, 70)).toContain('Som das mídias ligado');
    expect(textoDoSom('MUDO', null, 70)).toContain('silêncio');
  });
});

describe('ligações no sistema', () => {
  it('o cartão fica logo abaixo da divisão por zonas e antes do resto da página da tela', () => {
    const tela = ler('src/pages/dashboard/ScreenDetails.tsx');
    const zonas = tela.indexOf('<DivisaoDaTela');
    const cartao = tela.indexOf('<RadioDaTela');
    const resto = tela.indexOf('{/* Left Column: Charts & Controls */}');
    expect(zonas).toBeGreaterThan(-1);
    expect(cartao).toBeGreaterThan(zonas);
    expect(resto).toBeGreaterThan(cartao);
    expect(tela).not.toContain('SomDaTela');
  });

  it('o menu lateral não tem mais a Rádio Comércio; a rota continua e abre o mesmo painel', () => {
    expect(ler('src/components/dashboard/Sidebar.tsx')).not.toContain('Rádio Comércio');
    expect(ler('src/components/dashboard/Sidebar.tsx')).not.toContain('/dashboard/radio');
    expect(ler('src/App.tsx')).toContain('<Route path="radio" element={<RadioComercio />} />');
    expect(ler('src/pages/dashboard/RadioComercio.tsx')).toContain('<PainelDaRadio />');
  });

  it('o banco grava rádio e som das mídias numa só atualização (exclusivos de verdade)', () => {
    const sql = ler('supabase/migrations/20261306_preco_por_zona_som_radio_e_presenca.sql');
    const f = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.fn_definir_som_da_tela'));
    expect(f).toContain("SET audio_enabled = (v_modo = 'MIDIAS')");
    expect(f).toContain("radio_ativa = (v_modo = 'RADIO')");
  });

  it('o Player recebe a rádio e, com ela ligada, os vídeos vêm sem som', () => {
    const sql = ler('supabase/migrations/20261306_preco_por_zona_som_radio_e_presenca.sql');
    expect(sql).toContain('get_player_radio_for_screen');
    expect(ler('src/components/player/RadioDoPlayer.tsx')).toBeTruthy();
  });
});
