import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

// F-166 — Biblioteca fora do anunciante; mídia grátis só na 1ª playlist; valor por anunciante e mídias grátis com motivo.
const ler = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');
const sql = ler('supabase/migrations/20261312_valor_midia_playlist_por_anunciante.sql');

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a), from: vi.fn() } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { playlistClienteService, type CotaDeMidias } from '@/modules/crm/services/playlistCliente.service';
import { dicaDeCusto, avisoDepoisDasGratis, etiquetaDoItem } from '@/lib/cotaDeMidias';
import { CotaDeMidiasBanner } from '@/modules/crm/components/portal/CotaDeMidiasBanner';
import { lerValor, previaDaLiberacao } from '@/modules/crm/services/midiasAnunciante.service';
import ValorMidiasPage from '@/modules/crm/pages/ValorMidiasPage';

const COTA: CotaDeMidias = { valor: 9.99, valorTexto: 'R$ 9,99', gratisPrimeiraPlaylist: 'USADA', primeiraPlaylistId: 'p1', restantesLiberadas: 0, liberacoes: [] };
const LIBERADA = { id: 'l1', quantidade: 2, usadas: 0, restantes: 2, motivo: 'DATA_COMEMORATIVA' as const, data_comemorativa: 'Dia das Crianças', explicacao: 'Obrigado!', mensagem: 'Liberamos 2 mídias grátis para você em comemoração a Dia das Crianças. Obrigado!', criado_em: '2026-10-08T10:00:00Z' };

beforeEach(() => rpc.mockReset());

describe('Migração 20261312 — regras no banco', () => {
  it('Biblioteca fecha para o anunciante (perfil ANUNCIANTE/CLIENTE), menos Owner/ADM', () => {
    expect(sql).toContain("upper(p.nome) IN ('ANUNCIANTE', 'CLIENTE') AND NOT coalesce(u.is_owner, false)");
    expect(sql).toContain("NOT public.has_role(auth.uid(), 'admin'::app_role)");
    expect(sql).toContain('SELECT CASE WHEN public.fn_usuario_eh_anunciante() THEN NULL');
  });

  it('mídia grátis só na PRIMEIRA playlist, uma vez; depois cortesia; depois pago com o valor do anunciante', () => {
    expect(sql).toContain('IF NOT v_cota.gratis_usada AND v_cota.primeira_playlist_id = p_playlist_id THEN');
    expect(sql).toContain("'GRATIS_PRIMEIRA'");
    expect(sql.indexOf("'GRATIS_PRIMEIRA')")).toBeLessThan(sql.indexOf("'CORTESIA', v_lib.id"));
    expect(sql.indexOf("'CORTESIA', v_lib.id")).toBeLessThan(sql.indexOf('INSERT INTO public.contas_receber'));
    expect(sql).toContain('v_valor := public.fn_valor_midia_cliente(v_cliente);');
    expect(sql).not.toContain('19.99, \n'); // o valor da cobrança não é mais fixo
    expect(sql).toContain('v_tenant, v_cliente, NULL, v_valor,');
  });

  it('duas abas não gastam a mesma mídia grátis (trava por anunciante) e a cobrança paga libera UM item da própria playlist/mídia', () => {
    expect(sql.match(/pg_advisory_xact_lock\(hashtextextended\(v_cliente::text, 0\)\)/g)!.length).toBeGreaterThanOrEqual(3);
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS ux_cpi_cobranca ON public.cliente_playlist_itens (cobranca_id) WHERE cobranca_id IS NOT NULL;');
    expect(sql).toContain('Esta cobrança não pertence a esta playlist/mídia.');
    expect(sql).toContain('SELECT * INTO v_conta FROM public.contas_receber WHERE id = p_cobranca_id AND cliente_id = v_cliente;');
    expect(sql).toContain('AND cr.cliente_id = p.cliente_id');
  });

  it('o navegador não escolhe a origem do item nem troca cobrança/mídia', () => {
    expect(sql).toContain("IF current_user IN ('authenticated', 'anon') THEN");
    expect(sql).toContain("NEW.origem := 'PAGA';");
    expect(sql).toContain('CREATE TRIGGER tg_cpi_protege_origem BEFORE INSERT OR UPDATE ON public.cliente_playlist_itens');
  });

  it('publicar exige grátis legítimo ou cobrança PAGA do anunciante', () => {
    expect(sql).toContain("AND COALESCE(i.origem, 'PAGA') = 'PAGA'");
    expect(sql).toContain("cr.id = i.cobranca_id AND cr.cliente_id = v_cliente AND cr.status IN ('PAGA', 'PAGO')");
  });

  it('só Owner/ADM mexe em valor e liberação; liberar exige motivo (data comemorativa exige qual; outro exige explicação)', () => {
    expect(sql).toContain("RAISE EXCEPTION 'Somente Owner ou ADM.'");
    for (const f of ['admin_midias_definir_valor', 'admin_midias_definir_padrao', 'admin_midias_liberar', 'admin_midias_cancelar_liberacao', 'admin_midias_listar_clientes', 'admin_midias_cliente']) {
      expect(sql, f).toContain(`CREATE OR REPLACE FUNCTION public.${f}(`);
    }
    expect(sql).toContain("CONSTRAINT cml_data_obrigatoria CHECK (motivo <> 'DATA_COMEMORATIVA'");
    expect(sql).toContain("CONSTRAINT cml_explicacao_outro CHECK (motivo <> 'OUTRO'");
    expect(sql).toContain('Informe qual é a data comemorativa.');
    expect(sql).toContain('REVOKE ALL ON public.playlist_midia_preco_padrao, public.cliente_preco_midia, public.cliente_midia_cota, public.cliente_midias_liberadas');
  });

  it('o Player não é tocado', () => {
    expect(sql).not.toMatch(/FUNCTION public\.(fn_player_|get_player_)/);
  });
});

describe('Portal do anunciante — sem Biblioteca', () => {
  it('menu, rotas permitidas e rota /portal/biblioteca', () => {
    const layout = ler('src/modules/crm/layout/CustomerPortalLayout.tsx');
    expect(layout).not.toContain('/portal/biblioteca');
    expect(layout).not.toContain('Biblioteca de Mídias');
    const app = ler('src/App.tsx');
    expect(app).not.toContain('BibliotecaPortalPage');
    expect(app).toContain('<Route path="biblioteca" element={<Navigate to="/portal/assets" replace />} />');
  });
  it('a playlist não oferece mais "mídia da biblioteca"', () => {
    const pl = ler('src/modules/crm/pages/portal/PlaylistsClientePage.tsx');
    expect(pl).not.toContain('Selecione uma mídia da biblioteca');
    expect(pl).toContain('cobrancaPendente.valor');
    expect(pl).not.toContain('gerarBrcodePix(cobrancaPendente.codigo, VALOR_VIDEO_ADICIONAL)');
  });
});

describe('Textos da cota', () => {
  it('1ª playlist com mídia grátis disponível', () => {
    const d = dicaDeCusto({ ...COTA, gratisPrimeiraPlaylist: 'DISPONIVEL' }, 'p1');
    expect(d?.tipo).toBe('gratis');
    // outra playlist: não é grátis
    expect(dicaDeCusto({ ...COTA, gratisPrimeiraPlaylist: 'DISPONIVEL' }, 'p2')?.tipo).toBe('paga');
  });
  it('mídias liberadas avisam quanto custa a próxima; sem liberação mostra o valor do anunciante', () => {
    const d = dicaDeCusto({ ...COTA, restantesLiberadas: 2, liberacoes: [LIBERADA] }, 'p2');
    expect(d?.tipo).toBe('liberada');
    expect(d?.texto).toContain('2 mídias grátis liberadas');
    expect(d?.texto.replace(/\u00a0/g, ' ')).toContain('R$ 9,99');
    expect(dicaDeCusto(COTA, 'p2')?.texto.replace(/\u00a0/g, ' ')).toContain('R$ 9,99');
    expect(avisoDepoisDasGratis({ valor: 0 })).toContain('não têm custo');
  });
  it('etiquetas por origem', () => {
    expect(etiquetaDoItem('GRATIS_PRIMEIRA', false)?.texto).toBe('grátis · 1ª playlist');
    expect(etiquetaDoItem('CORTESIA', false)?.texto).toBe('grátis · liberada');
    expect(etiquetaDoItem('PAGA', true)?.texto).toBe('pago');
    expect(etiquetaDoItem(null, false)).toBeNull();
  });
  it('banner: com liberação mostra quantidade, motivo, explicação e o valor da próxima', () => {
    render(<CotaDeMidiasBanner cota={{ ...COTA, restantesLiberadas: 2, liberacoes: [LIBERADA] }} />);
    const b = screen.getByTestId('cota-liberadas').textContent!;
    expect(b).toContain('2 mídias grátis disponíveis');
    expect(b).toContain('Dia das Crianças');
    expect(b).toContain('Obrigado!');
    expect(screen.getByTestId('cota-aviso-proxima').textContent!.replace(/\u00a0/g, ' ')).toContain('R$ 9,99');
  });
  it('banner: sem liberação só mostra a regra', () => {
    render(<CotaDeMidiasBanner cota={{ ...COTA, gratisPrimeiraPlaylist: 'DISPONIVEL' }} />);
    expect(screen.getByTestId('cota-regra').textContent).toContain('1 mídia grátis');
  });
});

describe('Serviço', () => {
  it('lê a cota do banco', async () => {
    rpc.mockResolvedValue({ data: { status: 'OK', valor_midia: 9.99, valor_midia_texto: 'R$ 9,99', gratis_primeira_playlist: 'USADA', primeira_playlist_id: 'p1', liberacoes: [LIBERADA], restantes_liberadas: 2 }, error: null });
    const c = await playlistClienteService.minhaCota();
    expect(rpc).toHaveBeenCalledWith('portal_minha_cota_midias');
    expect(c.valor).toBe(9.99);
    expect(c.restantesLiberadas).toBe(2);
  });
  it('adicionar mídia devolve origem e mensagem do banco', async () => {
    rpc.mockResolvedValue({ data: { cobrado: false, valor: 0, item_liberado: true, origem: 'CORTESIA', mensagem: 'Mídia grátis usada.', restantes_gratis: 1 }, error: null });
    const r = await playlistClienteService.adicionarMidia('p', 'a');
    expect(r).toMatchObject({ cobrado: false, origem: 'CORTESIA', mensagem: 'Mídia grátis usada.', restantesGratis: 1, itemLiberado: true });
  });
  it('lerValor e prévia da mensagem', () => {
    expect(lerValor('9,99')).toBe(9.99);
    expect(lerValor('R$ 19,99')).toBe(19.99);
    expect(lerValor('1.234,50')).toBe(1234.5);
    expect(lerValor('abc')).toBeNull();
    expect(lerValor('-3')).toBeNull();
    const t = previaDaLiberacao({ quantidade: 2, motivo: 'DATA_COMEMORATIVA', dataComemorativa: 'Dia das Mães', explicacao: 'Parabéns', valor: 9.99 });
    expect(t).toContain('2 mídias grátis');
    expect(t).toContain('Dia das Mães');
    expect(t).toContain('Depois dessas 2 mídias, a próxima mídia que você adicionar a uma playlist custa R$ 9,99.');
  });
});

describe('Tela do Owner/ADM', () => {
  const lista = { valor_padrao: 19.99, clientes: [
    { cliente_id: 'c1', nome: 'Anunciante X', valor: 19.99, valor_personalizado: false, gratis_restantes: 0, playlists: 1 },
    { cliente_id: 'c2', nome: 'Anunciante B', valor: 9.99, valor_personalizado: true, gratis_restantes: 2, playlists: 0 },
  ] };
  const detalhe = { valor: 9.99, valor_padrao: 19.99, valor_personalizado: { valor: 9.99, motivo: null, atualizado_em: '2026-10-08T10:00:00Z' }, gratis_primeira_playlist: 'USADA', playlists: 0, midias_pagas: 0, liberacoes: [] };

  function montar() {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'admin_midias_listar_clientes') return { data: lista, error: null };
      if (fn === 'admin_midias_cliente') return { data: detalhe, error: null };
      if (fn === 'admin_midias_liberar') return { data: { ok: true, mensagem: 'x', valor_proxima: 9.99 }, error: null };
      return { data: { ok: true, valor: 9.99 }, error: null };
    });
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter><ValorMidiasPage /></MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('escolhe o anunciante, mostra o valor dele e só libera depois de motivo (e da data, se for data comemorativa)', async () => {
    montar();
    const item = await screen.findByText('Anunciante B');
    fireEvent.click(item);
    await screen.findByTestId('painel-anunciante');
    expect(screen.getByTestId('anunciantes-rapidos').textContent).toContain('personalizado');

    const botao = screen.getByTestId('liberar-gratis') as HTMLButtonElement;
    expect(botao.disabled).toBe(true); // sem motivo
    fireEvent.change(screen.getByTestId('motivo-liberacao'), { target: { value: 'DATA_COMEMORATIVA' } });
    expect(botao.disabled).toBe(true); // falta dizer qual data
    fireEvent.change(screen.getByTestId('data-comemorativa'), { target: { value: 'Dia das Crianças' } });
    expect(botao.disabled).toBe(false);
    expect(screen.getByTestId('previa-liberacao').textContent).toContain('a próxima mídia que você adicionar a uma playlist custa R$ 9,99');

    fireEvent.click(botao);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_midias_liberar', expect.objectContaining({
      p_cliente: 'c2', p_quantidade: 1, p_motivo: 'DATA_COMEMORATIVA', p_data_comemorativa: 'Dia das Crianças',
    })));
  });

  it('salvar valor por anunciante chama o banco só com valor válido e diferente', async () => {
    montar();
    fireEvent.click(await screen.findByText('Anunciante B'));
    await screen.findByTestId('painel-anunciante');
    const salvar = screen.getByTestId('salvar-valor') as HTMLButtonElement;
    await waitFor(() => expect((screen.getByTestId('valor-anunciante') as HTMLInputElement).value).toBe('9,99'));
    expect(salvar.disabled).toBe(true); // igual ao atual
    fireEvent.change(screen.getByTestId('valor-anunciante'), { target: { value: 'abc' } });
    expect(salvar.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('valor-anunciante'), { target: { value: '14,90' } });
    expect(salvar.disabled).toBe(false);
    fireEvent.click(salvar);
    await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_midias_definir_valor', { p_cliente: 'c2', p_valor: 14.9, p_motivo: null }));
  });

  it('rota e menu só para Owner/ADM', () => {
    const app = ler('src/App.tsx');
    expect(app).toContain("<Route path=\"valor-midias\" element={<RequireRole roles={['OWNER', 'ADMIN']}><ValorMidiasPage /></RequireRole>} />");
    const side = ler('src/modules/crm/components/Sidebar.tsx');
    expect(side).toContain("path: '/workspace/valor-midias'");
    expect(side).toContain("label: 'Valor da Mídia para Anunciantes'");
    expect(side.indexOf("'/workspace/valor-midias'")).toBeGreaterThan(side.indexOf('(isOwner || isAdmin)'));
  });
});

describe('Seletor de anunciante: compacto, com lupa e lista completa', () => {
  const muitos = Array.from({ length: 6 }, (_, i) => ({
    cliente_id: 'c' + (i + 1), nome: ['Academia Beta', 'Andreza Ameida', 'Andreza Ameida', 'Café Central', 'Padaria Sol', 'Zeca Motos'][i],
    documento: ['11.111.111/0001-11', '22.222.222/0001-22', '33.333.333/0001-33', '44.444.444/0001-44', '55.555.555/0001-55', '66.666.666/0001-66'][i],
    cidade: 'Caruaru', valor: 19.99, valor_personalizado: false, gratis_restantes: 0, playlists: 0,
  }));
  const detalhe = { valor: 19.99, valor_padrao: 19.99, valor_personalizado: null, gratis_primeira_playlist: 'DISPONIVEL', playlists: 0, midias_pagas: 0, liberacoes: [] };

  function montar() {
    rpc.mockImplementation(async (fn: string) => {
      if (fn === 'admin_midias_listar_clientes') return { data: { valor_padrao: 19.99, clientes: muitos }, error: null };
      if (fn === 'admin_midias_cliente') return { data: detalhe, error: null };
      return { data: { ok: true, valor: 9.99, mensagem: 'x', valor_proxima: 9.99 }, error: null };
    });
    return render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter><ValorMidiasPage /></MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('na tela ficam só 3 anunciantes; "Ver todos" abre o cartão com todos e a busca', async () => {
    montar();
    await screen.findByTestId('anunciantes-rapidos');
    await waitFor(() => expect(screen.getAllByTestId('item-anunciante')).toHaveLength(3));
    expect(screen.queryByTestId('dialogo-anunciantes')).toBeNull();
    fireEvent.click(screen.getByTestId('ver-todos'));
    const dialogo = await screen.findByTestId('dialogo-anunciantes');
    expect(dialogo.querySelectorAll('[data-testid=item-anunciante]')).toHaveLength(6);
  });

  it('clicar na lupa, na barra de pesquisa ou em "Escolher anunciante" abre a lista completa', async () => {
    for (const alvo of ['lupa', 'busca-anunciante', 'abrir-escolha']) {
      const { unmount } = montar();
      await waitFor(() => expect(screen.getAllByTestId('item-anunciante').length).toBeGreaterThan(0));
      fireEvent.click(screen.getByTestId(alvo));
      expect(await screen.findByTestId('dialogo-anunciantes')).toBeTruthy();
      unmount();
    }
  });

  it('pesquisa por nome (sem acento) e por CNPJ', async () => {
    montar();
    await waitFor(() => expect(screen.getAllByTestId('item-anunciante').length).toBe(3));
    fireEvent.click(screen.getByTestId('lupa'));
    const dialogo = await screen.findByTestId('dialogo-anunciantes');
    fireEvent.change(screen.getByTestId('busca-dialogo'), { target: { value: 'cafe' } });
    expect(dialogo.querySelectorAll('[data-testid=item-anunciante]')).toHaveLength(1);
    expect(dialogo.textContent).toContain('Café Central');
    fireEvent.change(screen.getByTestId('busca-dialogo'), { target: { value: 'andreza' } });
    expect(dialogo.querySelectorAll('[data-testid=item-anunciante]')).toHaveLength(2); // nomes repetidos: o CNPJ diferencia
    fireEvent.change(screen.getByTestId('busca-dialogo'), { target: { value: '55.555.555' } });
    expect(dialogo.textContent).toContain('Padaria Sol');
    expect(dialogo.querySelectorAll('[data-testid=item-anunciante]')).toHaveLength(1);
    fireEvent.change(screen.getByTestId('busca-dialogo'), { target: { value: 'zzzz' } });
    expect(dialogo.textContent).toContain('Nenhum anunciante encontrado');
  });

  it('valor e liberação valem para o anunciante escolhido (qualquer um), e trocar de anunciante troca o alvo', async () => {
    montar();
    await waitFor(() => expect(screen.getAllByTestId('item-anunciante').length).toBe(3));
    for (const [nome, id] of [['Zeca Motos', 'c6'], ['Padaria Sol', 'c5']]) {
      fireEvent.click(screen.getByTestId('lupa'));
      const dialogo = await screen.findByTestId('dialogo-anunciantes');
      fireEvent.change(screen.getByTestId('busca-dialogo'), { target: { value: nome } });
      fireEvent.click(dialogo.querySelector('[data-testid=item-anunciante]')!);
      await waitFor(() => expect(screen.queryByTestId('dialogo-anunciantes')).toBeNull());
      const painel = await screen.findByTestId('painel-anunciante');
      expect(painel.textContent).toContain(nome);

      fireEvent.change(screen.getByTestId('valor-anunciante'), { target: { value: '9,99' } });
      fireEvent.click(screen.getByTestId('salvar-valor'));
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_midias_definir_valor', { p_cliente: id, p_valor: 9.99, p_motivo: null }));

      fireEvent.change(screen.getByTestId('motivo-liberacao'), { target: { value: 'PROMOCAO' } });
      fireEvent.click(screen.getByTestId('liberar-gratis'));
      await waitFor(() => expect(rpc).toHaveBeenCalledWith('admin_midias_liberar', expect.objectContaining({ p_cliente: id, p_motivo: 'PROMOCAO', p_quantidade: 1 })));
    }
  });
});
