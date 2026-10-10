/**
 * F-178 — Logo do Cabeçalho do Tabloide Digital: catálogo, galeria, seleção, prévia, persistência e reabertura,
 * referência inválida, permissões e cadastro das próximas logos.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';

const h = vi.hoisted(() => ({
  central: false,
  selos: [] as unknown[],
  rascunhos: [] as unknown[],
  rascunhoCompleto: null as unknown,
  inseridos: [] as Array<{ tabela: string; payload: any }>,
}));

/** Cadeia de consulta falsa: qualquer método devolve ela mesma e, ao ser aguardada, responde conforme a tabela e o verbo. */
function cadeia(tabela: string) {
  let verbo = 'select';
  const resposta = () => {
    if (tabela === 'tabloide_selos') return { data: h.selos, error: null };
    if (tabela === 'tabloide_catalogo') return { data: [], error: null };
    if (tabela === 'tabloides') {
      if (verbo === 'insert') return { data: { id: 'rascunho-1' }, error: null };
      if (verbo === 'update') return { data: null, error: null };
      return { data: h.rascunhoCompleto ?? h.rascunhos, error: null };
    }
    return { data: [], error: null };
  };
  const alvo: any = new Proxy(function () { /* alvo */ }, {
    get(_t, prop) {
      if (prop === 'then') return (ok: (v: unknown) => unknown, err: (e: unknown) => unknown) => Promise.resolve(resposta()).then(ok, err);
      if (prop === 'insert' || prop === 'update') return (payload: unknown) => { verbo = String(prop); h.inseridos.push({ tabela, payload }); return alvo; };
      if (prop === 'select') return () => alvo;
      return () => alvo;
    },
  });
  return alvo;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (t: string) => cadeia(t),
    rpc: async (nome: string) => ({ data: nome === 'is_central_privileged' ? h.central : null, error: null }),
    functions: { invoke: async () => ({ data: { candidatos: [] }, error: null }) },
    auth: { getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }) },
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/r2Upload', () => ({ uploadToR2: async () => ({ publicUrl: 'https://r2/x.png', filePath: 'x.png' }) }));

import { GaleriaLogoCabecalho } from '@/components/tabloide/GaleriaLogoCabecalho';
import { TabloideEditor } from '@/components/tabloide/TabloideEditor';
import { TabloideCanvas } from '@/components/tabloide/TabloideCanvas';
import { logosDoCabecalho, resolverLogoCabecalho, type Selo } from '@/lib/tabloide/selos';
import { montarPaginas } from '@/lib/tabloide/grade';
import { lerLista } from '@/lib/tabloide/parseProdutos';
import { formatoPorId, segmentoPorId, temaPorId } from '@/lib/tabloide/temas';

const fonte = (p: string) => readFileSync(p, 'utf8');

const base = { largura: 1403, altura: 1121, mime: 'image/png', versao: 1, licenca: 'x', origem: 'x', cliente_id: null, miniatura_url: null };
const selo = (o: Partial<Selo> & { id: string; slug: string; nome: string }): Selo => ({
  ...base, categoria: 'Logo do Cabeçalho', titulo: o.nome, imagem_url: `https://r2/${o.slug}.png`, transparente: true, estado: 'APROVADO', tipo: 'LOGO_CABECALHO', ordem: 0, ...o,
}) as Selo;

const OFERTAS = selo({ id: 'id-ofertas', slug: 'logo-ofertas-da-semana', nome: 'Ofertas da Semana', ordem: 1, miniatura_url: 'https://r2/ofertas-mini.png' });
const SUPER = selo({ id: 'id-super', slug: 'logo-super-oferta', nome: 'Super Oferta', ordem: 2 });
const EM_REVISAO = selo({ id: 'id-rev', slug: 'logo-revisao', nome: 'Em revisão', estado: 'REVISAO' });
const ARQUIVADA = selo({ id: 'id-arq', slug: 'logo-arquivada', nome: 'Arquivada', estado: 'REPROVADO' });
const SEM_ALFA = selo({ id: 'id-sem-alfa', slug: 'logo-sem-alfa', nome: 'Sem transparência', transparente: false });
const SELO_DE_CAMADA = selo({ id: 'id-camada', slug: 'black-friday', nome: 'Black Friday', tipo: 'SELO' });
const DE_ANUNCIANTE = selo({ id: 'id-anunc', slug: 'meu-selo', nome: 'Meu selo', cliente_id: 'cli-1' });
const TODOS = [SUPER, EM_REVISAO, OFERTAS, ARQUIVADA, SEM_ALFA, SELO_DE_CAMADA, DE_ANUNCIANTE];

beforeEach(() => {
  h.central = false; h.selos = TODOS; h.rascunhos = []; h.rascunhoCompleto = null; h.inseridos = [];
  (globalThis as any).ResizeObserver = class { observe() { /* stub */ } disconnect() { /* stub */ } unobserve() { /* stub */ } };
});
afterEach(() => { cleanup(); });

describe('F-178 · catálogo de logos do cabeçalho', () => {
  it('só entram as logos aprovadas, com transparência validada, da empresa e do tipo certo — na ordem da galeria', () => {
    expect(logosDoCabecalho(TODOS).map((l) => l.slug)).toEqual(['logo-ofertas-da-semana', 'logo-super-oferta']);
    expect(logosDoCabecalho(null)).toEqual([]);
    expect(logosDoCabecalho([])).toEqual([]);
  });

  it('a logo é achada pelo identificador estável; id inexistente, arquivado ou nulo vira "automático" (null)', () => {
    expect(resolverLogoCabecalho(TODOS, 'id-ofertas')?.nome).toBe('Ofertas da Semana');
    expect(resolverLogoCabecalho(TODOS, 'nao-existe')).toBeNull();
    expect(resolverLogoCabecalho(TODOS, 'id-arq')).toBeNull();
    expect(resolverLogoCabecalho(TODOS, 'id-rev')).toBeNull();
    expect(resolverLogoCabecalho(TODOS, 'id-camada')).toBeNull();
    expect(resolverLogoCabecalho(TODOS, null)).toBeNull();
    expect(resolverLogoCabecalho(null, 'id-ofertas')).toBeNull();
  });

  it('cadastrar mais logos não exige código novo: o catálogo é o banco e a galeria desenha qualquer quantidade', () => {
    const muitas = Array.from({ length: 11 }, (_, i) => selo({ id: `id-${i}`, slug: `logo-${i}`, nome: `Logo ${i + 1}`, ordem: i + 1 }));
    expect(logosDoCabecalho(muitas)).toHaveLength(11);
    const extra = [...muitas, selo({ id: 'id-12', slug: 'logo-12', nome: 'Logo 12', ordem: 12 })];
    expect(logosDoCabecalho(extra)).toHaveLength(12);
    const galeria = fonte('src/components/tabloide/GaleriaLogoCabecalho.tsx');
    expect(galeria).not.toMatch(/logo-ofertas-da-semana|=== ['"]logo/); // nada de if por logo
  });
});

describe('F-178 · galeria "Logo do Cabeçalho"', () => {
  const props = (o: Partial<React.ComponentProps<typeof GaleriaLogoCabecalho>> = {}) => ({
    selos: TODOS, escolhidaId: null, pendente: false, usuarioId: 'u1',
    aoEscolher: vi.fn(), aoConfirmar: vi.fn(), aoDesfazer: vi.fn(), aoRecarregar: vi.fn(), ...o,
  });

  it('mostra as logos reais cadastradas (com imagem, nome e estado) e nenhuma opção de mentira', () => {
    render(<GaleriaLogoCabecalho {...props()} />);
    const opcoes = screen.getAllByRole('option');
    expect(opcoes).toHaveLength(3); // Automático + 2 logos aprovadas
    expect(screen.getByTestId('logo-logo-ofertas-da-semana')).toBeTruthy();
    expect(screen.getByTestId('logo-logo-super-oferta')).toBeTruthy();
    expect(screen.queryByTestId('logo-logo-revisao')).toBeNull();
    expect(screen.queryByTestId('logo-logo-arquivada')).toBeNull();
    expect(screen.queryByTestId('logo-logo-sem-alfa')).toBeNull();
    expect(screen.queryByText('Black Friday')).toBeNull();
    const imagens = screen.getAllByTestId('logo-imagem') as HTMLImageElement[];
    expect(imagens).toHaveLength(2);
    expect(imagens[0].src).toBe('https://r2/ofertas-mini.png'); // galeria usa a miniatura
    expect(imagens[1].src).toBe('https://r2/logo-super-oferta.png'); // sem miniatura, usa o original
    expect(imagens[0].alt).toBe('Logo Ofertas da Semana');
    expect(screen.getAllByText('Escolher').length).toBe(2);
  });

  it('o cartão "Automático" é a opção que já existia (selo pelo título), rotulada como tal, sem imagem de logo', () => {
    render(<GaleriaLogoCabecalho {...props()} />);
    const auto = screen.getByTestId('logo-automatico');
    expect(within(auto).queryByRole('img')).toBeNull();
    expect(auto.textContent).toContain('selo criado com o título do cartaz');
    expect(auto.getAttribute('aria-selected')).toBe('true'); // nenhuma logo escolhida = automático
  });

  it('escolher chama o editor com o identificador estável, e a logo em uso aparece destacada', () => {
    const p = props();
    const { rerender } = render(<GaleriaLogoCabecalho {...p} />);
    fireEvent.click(screen.getByTestId('logo-logo-ofertas-da-semana'));
    expect(p.aoEscolher).toHaveBeenCalledWith('id-ofertas');
    rerender(<GaleriaLogoCabecalho {...p} escolhidaId="id-ofertas" />);
    expect(screen.getByTestId('logo-logo-ofertas-da-semana').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('logo-logo-super-oferta').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('logo-automatico').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByText('Selecionada')).toBeTruthy();
    fireEvent.click(screen.getByTestId('logo-automatico'));
    expect(p.aoEscolher).toHaveBeenLastCalledWith(null);
  });

  it('escolha pendente mostra Confirmar e Desfazer, e cada botão chama a ação certa', () => {
    const p = props({ escolhidaId: 'id-super', pendente: true });
    render(<GaleriaLogoCabecalho {...p} />);
    expect(screen.getByTestId('logo-confirmacao').textContent).toContain('Super Oferta');
    fireEvent.click(screen.getByTestId('logo-confirmar'));
    fireEvent.click(screen.getByTestId('logo-desfazer'));
    expect(p.aoConfirmar).toHaveBeenCalledTimes(1);
    expect(p.aoDesfazer).toHaveBeenCalledTimes(1);
  });

  it('sem logos cadastradas: avisa e mantém só o automático (nada inventado)', () => {
    render(<GaleriaLogoCabecalho {...props({ selos: [] })} />);
    expect(screen.getByTestId('logos-vazio')).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(1);
  });

  it('a galeria é uma grade que se reorganiza (celular, tablet e computador)', () => {
    render(<GaleriaLogoCabecalho {...props()} />);
    expect(screen.getByRole('listbox').className).toMatch(/grid-cols-2/);
    expect(screen.getByRole('listbox').className).toMatch(/sm:grid-cols-3/);
    expect(screen.getByTestId('logo-logo-ofertas-da-semana').className).toContain('w-full');
  });

  it('permissões: quem não é da central NÃO vê cadastro nem arquivar; a central vê', async () => {
    h.central = false;
    const { unmount } = render(<GaleriaLogoCabecalho {...props()} />);
    await new Promise((r) => setTimeout(r, 30));
    expect(screen.queryByTestId('logo-cadastro')).toBeNull();
    expect(screen.queryByTestId('logo-arquivar-logo-ofertas-da-semana')).toBeNull();
    // e mesmo assim consegue escolher
    fireEvent.click(screen.getByTestId('logo-logo-ofertas-da-semana'));
    unmount();
    h.central = true;
    render(<GaleriaLogoCabecalho {...props()} />);
    await waitFor(() => expect(screen.getByTestId('logo-cadastro')).toBeTruthy());
    expect(screen.getByTestId('logo-arquivar-logo-ofertas-da-semana')).toBeTruthy();
  });
});

describe('F-178 · cabeçalho do cartaz', () => {
  const [pagina] = montarPaginas(lerLista('Arroz 5kg 25,90'), formatoPorId('tv-h'), 'auto', 0);
  const canvasProps = (seloUrl: string | null) => ({
    formato: formatoPorId('tv-h'), tema: temaPorId('ofertao'), segmento: segmentoPorId('mercado'), titulo: 'Ofertas da Semana', subtitulo: 'Só hoje',
    validade: '', empresa: 'Loja', pagina, numeroPagina: 1, totalPaginas: 1, seloUrl,
  });

  it('a logo escolhida entra no cabeçalho inteira: proporção original, sem filtro, sem corte e com a transparência do PNG', () => {
    render(<TabloideCanvas {...canvasProps('https://r2/logo.png')} />);
    const img = document.querySelector('img[data-logo-cabecalho]') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.src).toBe('https://r2/logo.png');
    expect(img.style.objectFit).toBe('contain');
    expect(img.style.width).toBe('auto');
    expect(img.style.filter).toBe('');
    expect(img.style.background).toBe('');
    expect(img.getAttribute('crossorigin')).toBe('anonymous'); // exportação em PNG precisa disso
    expect(document.querySelector('canvas[data-testid="tabloide-selo"]')).toBeNull(); // não desenha o automático por baixo
  });

  it('sem logo escolhida, o cabeçalho automático continua igual', () => {
    render(<TabloideCanvas {...canvasProps(null)} />);
    expect(document.querySelector('canvas[data-testid="tabloide-selo"]')).toBeTruthy();
    expect(document.querySelector('img[data-logo-cabecalho]')).toBeNull();
  });

  it('se o arquivo da logo não carregar, volta ao selo automático em vez de ficar vazio', () => {
    render(<TabloideCanvas {...canvasProps('https://r2/quebrada.png')} />);
    fireEvent.error(document.querySelector('img[data-logo-cabecalho]') as HTMLImageElement);
    expect(document.querySelector('img[data-logo-cabecalho]')).toBeNull();
    expect(document.querySelector('canvas[data-testid="tabloide-selo"]')).toBeTruthy();
    expect(screen.getAllByTestId('tabloide-cartao').length).toBeGreaterThan(0); // o resto do cartaz segue de pé
  });
});

describe('F-178 · fluxo real no editor (selecionar, prévia, salvar, reabrir)', () => {
  const abrirGaleria = async () => {
    render(<TabloideEditor contexto="painel" />);
    fireEvent.click(await screen.findByTestId('tabloide-aba-cabecalho'));
    return screen.findByTestId('logo-logo-ofertas-da-semana');
  };

  it('a barra lateral tem o botão do cabeçalho e a galeria mostra a primeira logo real', async () => {
    const cartao = await abrirGaleria();
    expect(cartao).toBeTruthy();
    expect(screen.getByTestId('tabloide-aba-cabecalho').getAttribute('aria-pressed')).toBe('true');
  });

  it('selecionar atualiza o cabeçalho na hora; confirmar fecha; editar outras coisas não tira a logo', async () => {
    const cartao = await abrirGaleria();
    expect(document.querySelector('img[data-logo-cabecalho]')).toBeNull();
    fireEvent.click(cartao);
    await waitFor(() => expect((document.querySelector('[data-testid="tabloide-canvas"] img[data-logo-cabecalho]') as HTMLImageElement)?.src).toBe('https://r2/logo-ofertas-da-semana.png'));
    expect(screen.getByTestId('logo-confirmacao')).toBeTruthy();
    fireEvent.click(screen.getByTestId('logo-confirmar'));
    expect(screen.queryByTestId('logo-confirmacao')).toBeNull();
    // mexe em outro elemento do tabloide (nome da loja): a logo continua
    fireEvent.click(screen.getByTestId('tabloide-aba-empresa'));
    const nomeLoja = screen.getByText('Nome da sua loja').parentElement!.querySelector('input') as HTMLInputElement;
    fireEvent.change(nomeLoja, { target: { value: 'Mercado Bom Preço' } });
    expect(document.querySelector('[data-testid="tabloide-canvas"] img[data-logo-cabecalho]')).toBeTruthy();
    expect(document.querySelector('[data-testid="tabloide-canvas"]')!.textContent).toContain('Mercado Bom Preço');
  });

  it('Desfazer volta à escolha anterior', async () => {
    const cartao = await abrirGaleria();
    fireEvent.click(cartao);
    await screen.findByTestId('logo-confirmacao');
    fireEvent.click(screen.getByTestId('logo-desfazer'));
    await waitFor(() => expect(document.querySelector('[data-testid="tabloide-canvas"] img[data-logo-cabecalho]')).toBeNull());
    expect(screen.getByTestId('logo-automatico').getAttribute('aria-selected')).toBe('true');
  });

  it('Desfazer devolve também o selo avulso antigo do rascunho (nada se perde)', async () => {
    h.rascunhos = [{ id: 'r4', nome: 'Com selo avulso', updated_at: '2026-10-10' }];
    render(<TabloideEditor contexto="painel" />);
    const lista = await screen.findByLabelText('Abrir um rascunho');
    h.rascunhoCompleto = { id: 'r4', nome: 'Com selo avulso', formato: 'tv-h', tema: 'ofertao', segmento: 'mercado', grade: 'auto', produtos: [], config: { titulo: 'Ofertas', subtitulo: '', seloUrl: 'https://r2/selo-antigo.png' } };
    fireEvent.change(lista, { target: { value: 'r4' } });
    await waitFor(() => expect((document.querySelector('img[data-logo-cabecalho]') as HTMLImageElement)?.src).toBe('https://r2/selo-antigo.png'));
    fireEvent.click(screen.getByTestId('tabloide-aba-cabecalho'));
    fireEvent.click(await screen.findByTestId('logo-logo-ofertas-da-semana'));
    await waitFor(() => expect((document.querySelector('img[data-logo-cabecalho]') as HTMLImageElement)?.src).toBe('https://r2/logo-ofertas-da-semana.png'));
    fireEvent.click(screen.getByTestId('logo-desfazer'));
    await waitFor(() => expect((document.querySelector('img[data-logo-cabecalho]') as HTMLImageElement)?.src).toBe('https://r2/selo-antigo.png'));
  });

  it('salvar guarda o IDENTIFICADOR da logo (não a imagem nem uma URL solta) em tabloides.config', async () => {
    fireEvent.click(await abrirGaleria());
    fireEvent.click(screen.getByTestId('tabloide-salvar'));
    await waitFor(() => expect(h.inseridos.some((i) => i.tabela === 'tabloides' && i.payload?.config)).toBe(true));
    const linha = h.inseridos.find((i) => i.tabela === 'tabloides')!.payload;
    expect(linha.config.logoCabecalhoId).toBe('id-ofertas');
    expect(linha.config.seloUrl).toBeNull(); // nenhuma URL avulsa competindo com o catálogo
    expect(JSON.stringify(linha.config)).not.toContain('https://r2/logo-ofertas-da-semana.png');
  });

  it('reabrir o tabloide traz a mesma logo (e a marca na galeria)', async () => {
    h.rascunhos = [{ id: 'r1', nome: 'Meu tabloide', updated_at: '2026-10-10' }];
    h.rascunhoCompleto = null;
    render(<TabloideEditor contexto="painel" />);
    const lista = await screen.findByLabelText('Abrir um rascunho');
    h.rascunhoCompleto = { id: 'r1', nome: 'Meu tabloide', formato: 'tv-h', tema: 'ofertao', segmento: 'mercado', grade: 'auto', produtos: [], config: { titulo: 'Ofertas', subtitulo: '', logoCabecalhoId: 'id-super', elementos: [] } };
    fireEvent.change(lista, { target: { value: 'r1' } });
    await waitFor(() => expect((document.querySelector('[data-testid="tabloide-canvas"] img[data-logo-cabecalho]') as HTMLImageElement)?.src).toBe('https://r2/logo-super-oferta.png'));
    fireEvent.click(screen.getByTestId('tabloide-aba-cabecalho'));
    expect((await screen.findByTestId('logo-logo-super-oferta')).getAttribute('aria-selected')).toBe('true');
  });

  it('referência inválida (logo que não existe mais) não quebra: cabeçalho automático e editor funcionando', async () => {
    h.rascunhos = [{ id: 'r2', nome: 'Antigo', updated_at: '2026-10-10' }];
    render(<TabloideEditor contexto="painel" />);
    const lista = await screen.findByLabelText('Abrir um rascunho');
    h.rascunhoCompleto = { id: 'r2', nome: 'Antigo', formato: 'tv-h', tema: 'ofertao', segmento: 'mercado', grade: 'auto', produtos: [], config: { titulo: 'Ofertas', subtitulo: '', logoCabecalhoId: 'logo-apagada' } };
    fireEvent.change(lista, { target: { value: 'r2' } });
    await waitFor(() => expect(document.querySelector('[data-testid="tabloide-canvas"] canvas[data-testid="tabloide-selo"]')).toBeTruthy());
    expect(document.querySelector('img[data-logo-cabecalho]')).toBeNull();
    fireEvent.click(screen.getByTestId('tabloide-aba-cabecalho'));
    expect((await screen.findByTestId('logo-automatico')).getAttribute('aria-selected')).toBe('true');
  });

  it('rascunhos antigos com selo avulso (seloUrl) continuam mostrando o selo', async () => {
    h.rascunhos = [{ id: 'r3', nome: 'Velho', updated_at: '2026-10-10' }];
    render(<TabloideEditor contexto="painel" />);
    const lista = await screen.findByLabelText('Abrir um rascunho');
    h.rascunhoCompleto = { id: 'r3', nome: 'Velho', formato: 'tv-h', tema: 'ofertao', segmento: 'mercado', grade: 'auto', produtos: [], config: { titulo: 'Ofertas', subtitulo: '', seloUrl: 'https://r2/selo-antigo.png' } };
    fireEvent.change(lista, { target: { value: 'r3' } });
    await waitFor(() => expect((document.querySelector('[data-testid="tabloide-canvas"] img[data-logo-cabecalho]') as HTMLImageElement)?.src).toBe('https://r2/selo-antigo.png'));
  });
});

describe('F-178 · exportação, banco e cadastro das próximas logos', () => {
  it('prévia e exportação usam o MESMO desenho do cartaz; a exportação resolve a logo pelo catálogo antes de fotografar', () => {
    const exportar = fonte('src/lib/tabloide/exportar.tsx');
    expect(exportar).toContain('<TabloideCanvas {...props} />');
    expect(exportar).toContain('aguardarImagens(palco)');
    const editor = fonte('src/components/tabloide/TabloideEditor.tsx');
    expect(editor).toContain('renderizarPaginaEmPng({ ...propsDaPagina(i), seloUrl: urlDoCabecalho })');
    expect(editor).toContain('resolverLogoCabecalho(await listarSelos(), logoCabecalhoId)');
    expect(editor).toContain('logoCabecalhoId, elementos });'); // vai para tabloides.config
    expect(editor).toContain('setLogoCabecalhoId(typeof c.logoCabecalhoId');
    expect(editor).toContain('seloUrl: cabecalhoUrl'); // a prévia usa a URL resolvida do catálogo
  });

  it('a migração reaproveita tabloide_selos (sem tabela nova) e não enfraquece a segurança', () => {
    const sql = fonte('supabase/migrations/20261323_tabloide_logos_cabecalho.sql');
    expect(sql).toContain('ALTER TABLE public.tabloide_selos');
    expect(sql).not.toMatch(/CREATE TABLE/i);
    expect(sql).toContain("CHECK (tipo IN ('SELO', 'LOGO_CABECALHO'))");
    expect(sql).not.toMatch(/DROP POLICY|DISABLE ROW LEVEL SECURITY|GRANT .* TO anon/i);
  });

  it('o cadastro das logos recusa PNG sem transparência real, confere os bytes gravados e nunca altera o original', () => {
    const script = fonte('scripts/ops/cadastrar-logo-cabecalho.mjs');
    expect(script).toContain('não tem fundo transparente de verdade');
    expect(script).toContain('process.exit(1)');
    expect(script).toContain('bytes idênticos');
    expect(script).toContain("await enviar(`tabloide-logos/${slug}-v${versao}-${marca}.png`, original, 'image/png')");
    expect(script).toContain('o arquivo original NUNCA é alterado');
    expect(script).not.toMatch(/sharp\(original\)\.(?!resize)[a-z]+\([^)]*\)\.toFile/);
    expect(script).not.toMatch(/cfat_|[0-9a-f]{32}/); // nenhuma chave dentro do script
  });

  it('a galeria só deixa a central cadastrar/arquivar; a escolha é livre e não mexe em permissão', () => {
    const galeria = fonte('src/components/tabloide/GaleriaLogoCabecalho.tsx');
    expect(galeria).toContain('ehCentral()');
    expect(galeria).toContain('{central && (');
    expect(galeria).toContain("if (!alfa.transparente)");
    const selos = fonte('src/lib/tabloide/selos.ts');
    expect(selos).toContain("estado: 'REPROVADO'");
    expect(fonte('supabase/migrations/20261322_tabloide_selos.sql')).toMatch(/cliente_id IS NULL AND public\.is_central_privileged\(\)/);
  });
});
