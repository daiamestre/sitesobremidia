/**
 * Cartaz Digital (F-172…F-179) — o ambiente de criação.
 * Menu lateral como nos criadores de encarte (Produtos, Temas, Datas, Sua Logo, Empresa, Fontes, Postar, Encarte, Portal):
 * o cliente digita "produto + preço"; o sistema acha a foto (catálogo compartilhado primeiro) e monta o cartaz.
 * Cada cartaz salvo fica em "Meus cartazes", de onde se imprime um ou vários de uma vez.
 * O portal do anunciante e o painel da equipe usam esta mesma tela.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDays, Download, FileText, FolderOpen, Globe, Image as ImageIcon, Loader2, Palette, PenLine, Plus, Printer, Save, Send, Share2,
  ShoppingBasket, Sparkles, Store, Trash2, Type, Upload, Wand2,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { uploadToR2 } from '@/lib/r2Upload';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  chaveDoProduto, lerLista, mesclarListas, paraLinha, precoParaTexto, lerValor, UNIDADES_DISPONIVEIS,
  type ImagemProduto, type ProdutoTabloide,
} from '@/lib/tabloide/parseProdutos';
import { FORMATOS, USOS_DO_FORMATO, formatoPorId, segmentoPorId, temasDoSegmento, type SegmentoId } from '@/lib/tabloide/temas';
import { GRADES_FIXAS, rotuloGrade } from '@/lib/tabloide/grade';
import { buscarCandidatos, buscarNoCatalogo, completarImagens, gerarImagemIA, prepararImagem, salvarNoCatalogo, type CandidatoImagem } from '@/lib/tabloide/imagens';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { baixarBlob, imprimirBlobs, nomeDeArquivo } from '@/lib/tabloide/exportar';
import { configPadrao, fontesUsadas, propsDasPaginas, textoParaPostar, type CartazParaDesenhar, type ConfigCartaz } from '@/lib/tabloide/cartaz';
import { gerarPngsDoCartaz, listarCartazes, NOME_PADRAO, publicarNoPortal, salvarCartaz, tirarDoPortal, type CartazSalvo } from '@/lib/tabloide/cartazes';
import { carregarFonte } from '@/lib/tabloide/fontes';
import { aplicarPerfil, carregarPerfil, perfilDoCartaz, salvarPerfil, salvarPortal, type PerfilDaLoja, type PortalDaLoja } from '@/lib/tabloide/perfil';
import { ajustarElemento, duplicarElemento, ehCentral, listarSelos, novoElemento, type ElementoLivre, type Selo } from '@/lib/tabloide/selos';
import { TabloideCanvas } from './TabloideCanvas';
import { PainelTemas } from './PainelTemas';
import { PainelDatas, PainelEmpresa, PainelEncarte, PainelFontes, PainelLogo, PainelPortal, PainelPostar } from './PaineisCartaz';
import { MeusCartazes } from './MeusCartazes';

export interface TabloideEditorProps {
  contexto: 'portal' | 'painel';
  clienteId?: string | null;
  empresaPadrao?: string;
  logoPadrao?: string | null;
  segmentoPadrao?: string | null;
}

/** O menu lateral, na mesma ordem dos criadores de encarte. */
export const BOTOES = [
  { id: 'produtos', rotulo: 'Produtos', icone: ShoppingBasket },
  { id: 'temas', rotulo: 'Temas', icone: Palette },
  { id: 'datas', rotulo: 'Datas', icone: CalendarDays },
  { id: 'logo', rotulo: 'Sua Logo', icone: ImageIcon },
  { id: 'empresa', rotulo: 'Empresa', icone: Store },
  { id: 'fontes', rotulo: 'Fontes', icone: Type },
  { id: 'postar', rotulo: 'Postar', icone: Share2 },
  { id: 'encarte', rotulo: 'Encarte', icone: FileText },
  { id: 'portal', rotulo: 'Portal', icone: Globe },
] as const;
type Aba = (typeof BOTOES)[number]['id'];

/** Descobre o segmento do cadastro do cliente (texto livre) entre os do cartaz. */
function segmentoDoCadastro(texto?: string | null): SegmentoId {
  const k = chaveDoProduto(texto ?? '');
  const regras: Array<[RegExp, SegmentoId]> = [
    [/acougue|carne|churrasc/, 'acougue'], [/hortifruti|feira|fruta/, 'hortifruti'], [/padaria|confeitaria/, 'padaria'],
    [/farmacia|drogaria/, 'farmacia'], [/clinica|saude|odonto|medic|laboratorio/, 'clinica'], [/restaurante|marmit|buffet|self/, 'restaurante'],
    [/lanchonete|pizza|hamburg|sorveteria|cafeteria/, 'lanchonete'], [/pet/, 'petshop'], [/constru|ferrag|material/, 'construcao'],
    [/moda|roupa|calcad|loja/, 'moda'], [/bar|adega|distribuidora|cervej/, 'bar'], [/salao|estetica|beleza|barbearia/, 'salao'], [/mercado|supermercado|mercearia|atacado/, 'mercado'],
  ];
  return regras.find(([re]) => re.test(k))?.[1] ?? 'mercado';
}

const PORTAL_VAZIO: PortalDaLoja = { slug: null, cep: null, segmentos: [], visivel: false };

export function TabloideEditor({ contexto, clienteId = null, empresaPadrao = '', logoPadrao = null, segmentoPadrao = null }: TabloideEditorProps) {
  const { user } = useAuth();
  const segInicial = useMemo(() => segmentoDoCadastro(segmentoPadrao), [segmentoPadrao]);

  const perfil = useRef<PerfilDaLoja>({});
  /** Cartaz em branco: padrão do sistema + o que a loja já deixou guardado (dados, fontes, logo). */
  const cfgNovo = useCallback((seg: SegmentoId): ConfigCartaz => {
    const base = configPadrao();
    base.regras.frase = segmentoPorId(seg).subtitulo;
    const c = aplicarPerfil(base, perfil.current);
    if (!c.empresa.nome && empresaPadrao) { c.empresa = { ...c.empresa, nome: empresaPadrao }; c.mostrar = { ...c.mostrar, nome: true }; }
    if (!c.logoMarcaUrl && logoPadrao) c.logoMarcaUrl = logoPadrao;
    return c;
  }, [empresaPadrao, logoPadrao]);

  const [vista, setVista] = useState<'criar' | 'salvos'>('criar');
  const [aba, setAba] = useState<Aba>('produtos');
  const [segmentoId, setSegmentoId] = useState<SegmentoId>(segInicial);
  const [temaId, setTemaId] = useState<string>(() => temasDoSegmento(segInicial)[0]?.id ?? 'ofertao');
  const [formatoId, setFormatoId] = useState<string>('tv-h');
  const [grade, setGrade] = useState<string>('auto');
  const [produtos, setProdutos] = useState<ProdutoTabloide[]>([]);
  const [cfg, setCfg] = useState<ConfigCartaz>(() => cfgNovo(segInicial));
  const [nome, setNome] = useState(NOME_PADRAO);
  const [cartazId, setCartazId] = useState<string | null>(null);
  const [publicado, setPublicado] = useState(false);
  const [selos, setSelos] = useState<Selo[] | null>(null);
  const [central, setCentral] = useState(false);
  const [portal, setPortal] = useState<PortalDaLoja>(PORTAL_VAZIO);
  const [cartazes, setCartazes] = useState<CartazSalvo[] | null>(null);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);
  const [novosBuscando, setNovosBuscando] = useState<string[]>([]);
  const buscandoFotos = novosBuscando.length > 0;
  const [ocupado, setOcupado] = useState<null | 'baixar' | 'enviar' | 'salvar' | 'imprimir' | 'publicar'>(null);
  const [trocando, setTrocando] = useState<ProdutoTabloide | null>(null);

  const tentados = useRef<Set<string>>(new Set());
  const palco = useRef<HTMLDivElement>(null);
  const [largPalco, setLargPalco] = useState(700);

  const mudar = useCallback((m: Partial<ConfigCartaz>) => setCfg((c) => ({ ...c, ...m })), []);
  // o que é "da loja" (dados, fontes, logo) também é guardado no perfil, para valer nos próximos cartazes
  const perfilSujo = useRef(false);
  const mudarPerfil = useCallback((m: Partial<ConfigCartaz>) => { perfilSujo.current = true; setCfg((c) => ({ ...c, ...m })); }, []);

  const formato = formatoPorId(formatoId);
  const segmento = segmentoPorId(segmentoId);

  // ---- alterações não salvas -------------------------------------------------
  const assinatura = useMemo(() => JSON.stringify([nome, formatoId, temaId, segmentoId, grade, produtos, cfg]), [nome, formatoId, temaId, segmentoId, grade, produtos, cfg]);
  const [assinaturaSalva, setAssinaturaSalva] = useState(assinatura);
  const marcarLimpo = useRef(true);
  useEffect(() => { if (marcarLimpo.current) { marcarLimpo.current = false; setAssinaturaSalva(assinatura); } }, [assinatura]);
  const sujo = assinatura !== assinaturaSalva;

  // ---- o que vem do banco ----------------------------------------------------
  const recarregarSelos = useCallback(async () => { setSelos(await listarSelos()); }, []);
  useEffect(() => { void recarregarSelos(); void ehCentral().then(setCentral).catch(() => undefined); }, [recarregarSelos]);

  const recarregarCartazes = useCallback(async () => { if (user?.id) setCartazes(await listarCartazes(user.id)); }, [user?.id]);
  useEffect(() => { void recarregarCartazes(); }, [recarregarCartazes]);

  const cartazIdRef = useRef(cartazId);
  cartazIdRef.current = cartazId;
  const mexeu = useRef(false);
  useEffect(() => {
    let ativo = true;
    void carregarPerfil().then((p) => {
      if (!ativo) return;
      perfil.current = p.dados;
      setPortal(p.portal);
      // o cartaz em branco recebe os dados guardados da loja (se o usuário ainda não mexeu em nada)
      if (!cartazIdRef.current && !mexeu.current) { marcarLimpo.current = true; setCfg((c) => aplicarPerfil(c, p.dados)); }
    }).catch(() => undefined);
    return () => { ativo = false; };
  }, []);

  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const chaveDoPerfil = useMemo(() => JSON.stringify(perfilDoCartaz(cfg)), [cfg]);
  useEffect(() => {
    if (!perfilSujo.current || !user?.id) return;
    const uid = user.id;
    const t = setTimeout(() => {
      perfilSujo.current = false;
      const dados = perfilDoCartaz(cfgRef.current);
      perfil.current = dados;
      salvarPerfil(dados, uid, clienteId).catch(() => toast.error('Não foi possível guardar os dados da loja. O cartaz continua como está.'));
    }, 1200);
    return () => clearTimeout(t);
  }, [chaveDoPerfil, user?.id, clienteId]);

  // a fonte escolhida é baixada só quando entra no cartaz
  useEffect(() => { fontesUsadas(cfg).forEach((f) => { void carregarFonte(f); }); }, [cfg.fontes]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- prévia ----------------------------------------------------------------
  // antes de o cliente digitar, a prévia mostra o exemplo do segmento (só para ver o estilo; não é exportado)
  const exemploBase = useMemo(() => lerLista(segmento.exemplo), [segmento]);
  const [fotosExemplo, setFotosExemplo] = useState<Map<string, ImagemProduto>>(new Map());
  useEffect(() => {
    let ativo = true;
    void buscarNoCatalogo(exemploBase.map((p) => p.nome)).then((m) => { if (ativo) setFotosExemplo(m); }).catch(() => undefined);
    return () => { ativo = false; };
  }, [exemploBase]);
  const exemplo = useMemo(() => exemploBase.map((p) => ({ ...p, imagem: fotosExemplo.get(chaveCanonica(p.nome)) ?? null })), [exemploBase, fotosExemplo]);

  const cartaz: CartazParaDesenhar = useMemo(() => ({ formatoId, temaId, segmentoId, grade, produtos, config: cfg }), [formatoId, temaId, segmentoId, grade, produtos, cfg]);
  const paginas = useMemo(() => {
    const lista = propsDasPaginas(produtos.length ? cartaz : { ...cartaz, produtos: exemplo }, selos);
    // enquanto a biblioteca carrega, não pisca o título em texto no lugar da logo escolhida
    return selos === null ? lista.map((p) => ({ ...p, seloUrl: cfg.seloUrl, semTitulo: !cfg.seloUrl && !cfg.cabecalhoEmTexto })) : lista;
  }, [cartaz, exemplo, selos, produtos.length, cfg.seloUrl, cfg.cabecalhoEmTexto]);
  const paginaAtual = Math.min(pagina, paginas.length - 1);

  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    const medir = () => setLargPalco(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [vista]);
  const escala = Math.max(0.1, Math.min(largPalco / formato.largura, (typeof window !== 'undefined' ? window.innerHeight * 0.66 : 600) / formato.altura));
  const escalaRef = useRef(escala);
  escalaRef.current = escala;

  // ---- produtos e fotos ------------------------------------------------------
  /** Dá foto aos produtos que ainda não têm (uma vez por produto). */
  const procurarFotos = useCallback(async (lista: ProdutoTabloide[]) => {
    const novos = lista.filter((p) => !p.imagem && !tentados.current.has(p.id));
    if (!novos.length) return;
    novos.forEach((p) => tentados.current.add(p.id));
    try {
      // foto já guardada no catálogo da empresa chega na hora; "procurando" aparece só para produto que o sistema nunca viu
      const semFoto = await completarImagens(
        novos,
        (id, imagem) => { if (imagem) setProdutos((atual) => atual.map((p) => (p.id === id ? { ...p, imagem } : p))); },
        (nomesNovos) => { setNovosBuscando(nomesNovos); },
      );
      if (semFoto.length) toast.info(`Sem foto automática: ${semFoto.join(', ')}. Clique na foto do produto para escolher ou enviar a sua.`, { duration: 9000 });
    } finally {
      setNovosBuscando([]);
    }
  }, []);

  const montarCartaz = () => {
    const lidos = lerLista(cfg.texto);
    if (!lidos.length) { toast.error('Digite pelo menos um produto, um por linha. Exemplo: Arroz 5kg 25,90'); return; }
    mexeu.current = true;
    const mesclados = mesclarListas(produtos, lidos);
    setProdutos(mesclados);
    setPagina(0);
    void procurarFotos(mesclados);
  };

  const trocarLista = (n: ProdutoTabloide[]) => { setProdutos(n); mudar({ texto: n.map(paraLinha).join('\n') }); };
  const atualizar = (id: string, mudanca: Partial<ProdutoTabloide>) => trocarLista(produtos.map((p) => (p.id === id ? { ...p, ...mudanca } : p)));
  const remover = (id: string) => trocarLista(produtos.filter((p) => p.id !== id));

  const escolherSegmento = (id: SegmentoId) => {
    const antiga = segmentoPorId(segmentoId).subtitulo;
    setSegmentoId(id);
    setTemaId(temasDoSegmento(id)[0]?.id ?? temaId);
    // a frase sugerida acompanha o segmento, a não ser que o cliente já tenha escrito a dele
    setCfg((c) => (!c.regras.frase || c.regras.frase === antiga ? { ...c, regras: { ...c.regras, frase: segmentoPorId(id).subtitulo } } : c));
  };

  const aplicarData = (temaDaData: string, titulo: string, frase: string) => {
    setTemaId(temaDaData);
    setCfg((c) => ({ ...c, titulo, regras: { ...c.regras, frase, mostrarFrase: true }, cabecalhoEmTexto: c.logoCabecalhoId ? c.cabecalhoEmTexto : true }));
    toast.success('Cores, título e frase da data aplicados.');
  };

  const trocarFoto = async (produto: ProdutoTabloide, imagem: ImagemProduto) => {
    setProdutos((l) => l.map((p) => (p.id === produto.id ? { ...p, imagem } : p)));
    setTrocando(null);
    try {
      // tira o fundo e corta as sobras; o cartaz troca para a versão recortada quando ficar pronta
      const pronta = await prepararImagem(imagem);
      if (pronta !== imagem) setProdutos((l) => l.map((p) => (p.id === produto.id ? { ...p, imagem: pronta } : p)));
      await salvarNoCatalogo(produto.nome, pronta, 'ESCOLHA', true);
    } catch { /* o cartaz já foi atualizado */ }
  };

  // ---- logos soltas no cartaz (camadas) --------------------------------------
  const elementos = cfg.elementos;
  const trocarElementos = useCallback((fn: (l: ElementoLivre[]) => ElementoLivre[]) => setCfg((c) => ({ ...c, elementos: fn(c.elementos) })), []);
  const soltarLogo = (selo: Selo) => {
    const e = novoElemento(selo, { cx: 0.5, cy: 0.5 });
    trocarElementos((l) => [...l, e]);
    setSelecionadoId(e.id);
    toast.success('Logo colocada no cartaz. Arraste na prévia para posicionar.');
  };
  const atualizarElemento = (id: string, m: Partial<ElementoLivre>) => trocarElementos((l) => l.map((e) => (e.id === id ? ajustarElemento({ ...e, ...m }) : e)));
  const duplicarElementoPorId = (id: string) => {
    const orig = elementos.find((e) => e.id === id);
    if (!orig) return;
    const copia = duplicarElemento(orig);
    trocarElementos((l) => [...l, copia]);
    setSelecionadoId(copia.id);
  };
  const excluirElemento = useCallback((id: string) => {
    trocarElementos((l) => l.filter((e) => e.id !== id));
    setSelecionadoId((atual) => (atual === id ? null : atual));
  }, [trocarElementos]);

  const arrasto = useRef<{ id: string; px: number; py: number; cx: number; cy: number; larg: number; alt: number } | null>(null);
  const aoPonteiroElemento = (id: string, ev: React.PointerEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    const e = elementos.find((x) => x.id === id);
    if (!e) return;
    setSelecionadoId(id);
    arrasto.current = { id, px: ev.clientX, py: ev.clientY, cx: e.cx, cy: e.cy, larg: formato.largura, alt: formato.altura };
    const mover = (m: PointerEvent) => {
      const a = arrasto.current;
      if (!a) return;
      const dx = (m.clientX - a.px) / escalaRef.current / a.larg;
      const dy = (m.clientY - a.py) / escalaRef.current / a.alt;
      trocarElementos((l) => l.map((x) => (x.id === a.id ? ajustarElemento({ ...x, cx: a.cx + dx, cy: a.cy + dy }) : x)));
    };
    const soltar = () => {
      arrasto.current = null;
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', soltar);
    };
    window.addEventListener('pointermove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', soltar);
  };
  useEffect(() => {
    const aoTecla = (ev: KeyboardEvent) => {
      if (!selecionadoId || (ev.key !== 'Delete' && ev.key !== 'Backspace')) return;
      const alvo = ev.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;
      excluirElemento(selecionadoId);
    };
    window.addEventListener('keydown', aoTecla);
    return () => window.removeEventListener('keydown', aoTecla);
  }, [selecionadoId, excluirElemento]);

  // ---- imagem final ----------------------------------------------------------
  const gerarPngs = async (): Promise<Blob[]> => gerarPngsDoCartaz(cartaz, selos ?? await listarSelos());

  const baixar = async () => {
    if (!produtos.length) { toast.error('Monte o cartaz primeiro.'); return; }
    setOcupado('baixar');
    try {
      const pngs = await gerarPngs();
      pngs.forEach((b, i) => baixarBlob(b, nomeDeArquivo(nome, i + 1, pngs.length)));
      toast.success(pngs.length > 1 ? `${pngs.length} imagens baixadas.` : 'Imagem baixada.');
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível gerar a imagem.');
    } finally { setOcupado(null); }
  };

  const imprimir = async () => {
    if (!produtos.length) { toast.error('Monte o cartaz primeiro.'); return; }
    setOcupado('imprimir');
    try {
      imprimirBlobs(await gerarPngs());
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível preparar a impressão.');
    } finally { setOcupado(null); }
  };

  const enviarParaMidias = async () => {
    if (!produtos.length) { toast.error('Monte o cartaz primeiro.'); return; }
    if (!user?.id) { toast.error('Sessão expirada. Entre novamente.'); return; }
    setOcupado('enviar');
    try {
      const pngs = await gerarPngs();
      const proporcao = formato.altura > formato.largura ? '9x16' : '16x9';
      const tenant = (await supabase.rpc('get_user_tenant_id')).data as string | null;
      for (let i = 0; i < pngs.length; i++) {
        const titulo = `${nome}${pngs.length > 1 ? ` - página ${i + 1}` : ''}`;
        const caminho = `${user.id}/${contexto === 'portal' ? 'portal' : 'tabloide'}/${Date.now()}-cartaz-${i + 1}.png`;
        const { publicUrl, filePath } = await uploadToR2(pngs[i], caminho, 'image/png', user.id);
        if (contexto === 'portal') {
          if (!clienteId || !tenant) throw new Error('Cadastro do anunciante não encontrado.');
          const { data: asset, error } = await supabase.from('cliente_assets').insert({
            cliente_id: clienteId, empresa_operadora_id: tenant, nome: titulo, tipo: 'imagem', mime_type: 'image/png',
            object_url: publicUrl, tamanho: pngs[i].size, usuario_id: user.id,
          } as never).select('id').single();
          if (error) throw error;
          if (asset) void supabase.functions.invoke('analisar-midia', { body: { asset_id: (asset as { id: string }).id } });
        } else {
          const { error } = await supabase.from('media').insert({
            user_id: user.id, name: titulo, file_path: filePath, file_url: publicUrl, file_type: 'image',
            file_size: pngs[i].size, mime_type: 'image/png', aspect_ratio: proporcao, thumbnail_url: publicUrl,
          } as never);
          if (error) throw error;
        }
      }
      toast.success(contexto === 'portal' ? 'Enviado! O cartaz aparece em "Minhas mídias" para ir às telas.' : 'Enviado para as suas mídias.');
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível enviar o cartaz.');
    } finally { setOcupado(null); }
  };

  // ---- meus cartazes ---------------------------------------------------------
  /** Guarda o cartaz atual e devolve o identificador (null se falhou). */
  const guardar = async (avisar: boolean): Promise<string | null> => {
    try {
      const id = await salvarCartaz(cartazId, { ...cartaz, nome, clienteId });
      setCartazId(id);
      setAssinaturaSalva(assinatura);
      void recarregarCartazes();
      if (avisar) toast.success('Cartaz salvo em "Meus cartazes".');
      return id;
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível salvar.');
      return null;
    }
  };
  const salvar = async () => { setOcupado('salvar'); try { await guardar(true); } finally { setOcupado(null); } };

  const novoCartaz = async () => {
    // o que estava sendo feito não se perde: vai para "Meus cartazes" antes de começar o próximo
    if (sujo && produtos.length) {
      setOcupado('salvar');
      const id = await guardar(false);
      setOcupado(null);
      if (!id) return;
      toast.success(`"${nome}" foi salvo em Meus cartazes.`);
    }
    tentados.current = new Set();
    mexeu.current = false;
    marcarLimpo.current = true;
    setCartazId(null); setPublicado(false); setNome(NOME_PADRAO); setProdutos([]); setCfg(cfgNovo(segmentoId));
    setGrade('auto'); setPagina(0); setSelecionadoId(null); setAba('produtos'); setVista('criar');
  };

  const abrir = (c: CartazSalvo) => {
    marcarLimpo.current = true;
    mexeu.current = true;
    setCartazId(c.id); setPublicado(c.publicado); setNome(c.nome); setFormatoId(c.formatoId); setTemaId(c.temaId);
    setSegmentoId(segmentoPorId(c.segmentoId).id); setGrade(c.grade); setProdutos(c.produtos);
    setCfg({ ...c.config, texto: c.config.texto || c.produtos.map(paraLinha).join('\n'), elementos: c.config.elementos.map(ajustarElemento) });
    setPagina(0); setSelecionadoId(null); setAba('produtos'); setVista('criar');
    // produto que já tem foto não busca de novo; o que ficou sem foto é procurado agora (catálogo primeiro)
    c.produtos.filter((p) => p.imagem).forEach((p) => tentados.current.add(p.id));
    c.produtos.filter((p) => !p.imagem).forEach((p) => tentados.current.delete(p.id));
    void procurarFotos(c.produtos);
  };

  // ---- portal ----------------------------------------------------------------
  const guardarPortal = async (p: PortalDaLoja): Promise<boolean> => {
    if (!user?.id) { toast.error('Sessão expirada. Entre novamente.'); return false; }
    try {
      await salvarPortal(p, perfilDoCartaz(cfg), user.id, clienteId);
      setPortal({ ...p, slug: p.slug || null, cep: (p.cep ?? '').trim() || null });
      toast.success('Dados do portal salvos.');
      return true;
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível salvar.');
      return false;
    }
  };

  const publicar = async () => {
    if (!produtos.length) { toast.error('Monte o cartaz primeiro.'); return; }
    if (!user?.id) { toast.error('Sessão expirada. Entre novamente.'); return; }
    if (!portal.slug) { toast.error('Antes, escolha o nome do endereço da sua página e salve os dados do portal.'); return; }
    setOcupado('publicar');
    try {
      const id = await guardar(false);
      if (!id) return;
      await publicarNoPortal(id, await gerarPngs(), user.id);
      setPublicado(true);
      void recarregarCartazes();
      toast.success(portal.visivel ? 'Cartaz publicado na página da sua loja.' : 'Cartaz publicado. Ligue "Mostrar minha loja no portal" para o link funcionar.');
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível publicar.');
    } finally { setOcupado(null); }
  };

  const tirar = async () => {
    if (!cartazId) return;
    setOcupado('publicar');
    try { await tirarDoPortal(cartazId); setPublicado(false); void recarregarCartazes(); toast.success('Cartaz tirado do portal.'); }
    catch (e) { toast.error((e as Error).message || 'Não foi possível tirar do portal.'); }
    finally { setOcupado(null); }
  };

  const textoDasRedes = useMemo(() => textoParaPostar(cfg, produtos, segmento.titulo), [cfg, produtos, segmento.titulo]);
  const totalSalvos = cartazes?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-3 p-3 md:p-5" data-testid="tabloide-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Sparkles className="h-6 w-6 text-primary" /> Cartaz Digital</h1>
          <p className="text-sm text-muted-foreground">Digite o produto e o preço. O sistema coloca a foto e monta o cartaz.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input aria-label="Nome do cartaz" className="h-9 w-44" value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} data-testid="cartaz-nome" />
          <Button variant="outline" size="sm" onClick={salvar} disabled={ocupado !== null} data-testid="tabloide-salvar">
            {ocupado === 'salvar' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Salvar cartaz
          </Button>
          <Button size="sm" onClick={novoCartaz} disabled={ocupado !== null} data-testid="cartaz-novo"><Plus className="mr-1 h-4 w-4" /> Novo cartaz</Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1 border-b" role="tablist" aria-label="Cartaz Digital">
        {([['criar', 'Criar cartaz', PenLine], ['salvos', `Meus cartazes${totalSalvos ? ` (${totalSalvos})` : ''}`, FolderOpen]] as const).map(([id, rotulo, Icone]) => (
          <button key={id} type="button" role="tab" aria-selected={vista === id} onClick={() => setVista(id)} data-testid={`cartaz-vista-${id}`}
            className={cn('-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-semibold', vista === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            <Icone className="h-4 w-4" /> {rotulo}
          </button>
        ))}
        <span className="ml-auto text-xs text-muted-foreground" data-testid="cartaz-estado">{cartazId ? (sujo ? 'Alterações ainda não salvas' : 'Salvo em Meus cartazes') : 'Cartaz novo (ainda não salvo)'}</span>
      </div>

      {vista === 'salvos' ? (
        <MeusCartazes cartazes={cartazes} selos={selos} clienteId={clienteId} abertoId={cartazId} aoAbrir={abrir} aoNovo={novoCartaz} aoRecarregar={recarregarCartazes}
          aoExcluirAberto={() => { setCartazId(null); setPublicado(false); }} />
      ) : (
        <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-3 lg:grid-cols-[76px_390px_minmax(0,1fr)]">
          {/* menu lateral */}
          <nav className="flex flex-col gap-1 rounded-xl border bg-slate-950/70 p-1.5" aria-label="Ferramentas do cartaz" data-testid="tabloide-barra">
            {BOTOES.map((b) => {
              const Icone = b.icone;
              return (
                <button key={b.id} type="button" onClick={() => setAba(b.id)} data-testid={`tabloide-aba-${b.id}`} aria-pressed={aba === b.id}
                  className={cn('flex flex-col items-center gap-1 rounded-lg px-1 py-2.5 text-[11px] font-semibold leading-tight transition-colors', aba === b.id ? 'bg-primary text-primary-foreground' : 'text-slate-300 hover:bg-slate-800')}>
                  <Icone className="h-5 w-5" />
                  <span className="text-center">{b.rotulo}</span>
                </button>
              );
            })}
          </nav>

          {/* painel da opção escolhida */}
          <section className="max-h-[calc(100vh-150px)] min-w-0 space-y-3 overflow-y-auto rounded-xl border bg-card p-4" data-testid="tabloide-painel">
            {aba === 'produtos' && (
              <div className="space-y-3">
                <label className="text-sm font-semibold" htmlFor="tabloide-texto">Digite um produto por linha, com o preço</label>
                <Textarea id="tabloide-texto" data-testid="tabloide-texto" rows={7} value={cfg.texto} onChange={(e) => { mexeu.current = true; mudar({ texto: e.target.value }); }}
                  placeholder={segmento.exemplo} className="font-mono text-sm" />
                <div className="flex flex-wrap gap-2">
                  <Button onClick={montarCartaz} data-testid="tabloide-montar"><Wand2 className="mr-1 h-4 w-4" /> Montar cartaz</Button>
                  <Button variant="outline" onClick={() => mudar({ texto: segmento.exemplo })} type="button">Usar exemplo de {segmento.nome.toLowerCase()}</Button>
                </div>
                <p className="text-xs text-muted-foreground">Aceita: <i>Arroz 5kg 25,90</i> · <i>Picanha kg R$ 49,90</i> · <i>Leite de 6,50 por 4,99</i></p>
                {buscandoFotos && <p className="flex items-center gap-2 text-sm text-primary" data-testid="tabloide-procurando"><Loader2 className="h-4 w-4 animate-spin" /> Produto novo para o sistema: procurando a foto de {novosBuscando.length === 1 ? novosBuscando[0] : `${novosBuscando.length} produtos`}…</p>}

                {produtos.length > 0 && (
                  <ul className="space-y-2" data-testid="tabloide-lista">
                    {produtos.map((p) => (
                      <li key={p.id} className="flex items-center gap-2 rounded-lg border bg-background/50 p-2">
                        <button type="button" onClick={() => setTrocando(p)} title="Trocar a foto" aria-label={`Trocar a foto de ${p.nome}`}
                          className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white text-2xl">
                          {p.imagem ? <img src={p.imagem.url} alt="" className="h-full w-full object-contain" crossOrigin="anonymous" referrerPolicy="no-referrer" /> : <span className="px-0.5 text-center text-[9px] font-bold leading-tight text-muted-foreground">{novosBuscando.includes(p.nome) ? 'buscando…' : 'foto…'}</span>}
                        </button>
                        <div className="min-w-0 flex-1 space-y-1">
                          <Input aria-label="Nome do produto" className="h-8 text-sm" value={p.nome} onChange={(e) => atualizar(p.id, { nome: e.target.value })} />
                          <div className="flex gap-1">
                            <Input key={`de-${p.id}-${p.precoDe}`} aria-label="Preço de" placeholder="De" className="h-8 w-16 text-xs" defaultValue={precoParaTexto(p.precoDe)} onBlur={(e) => atualizar(p.id, { precoDe: e.target.value ? lerValor(e.target.value) : null })} />
                            <Input key={`pr-${p.id}-${p.preco}`} aria-label="Preço" placeholder="Preço" className="h-8 w-20 text-sm font-semibold" defaultValue={precoParaTexto(p.preco)} onBlur={(e) => atualizar(p.id, { preco: e.target.value ? lerValor(e.target.value) : null })} />
                            <select aria-label="Unidade" className="h-8 min-w-0 flex-1 rounded-md border bg-background px-1 text-xs" value={p.unidade ?? ''} onChange={(e) => atualizar(p.id, { unidade: e.target.value || null })}>
                              <option value="">—</option>
                              {UNIDADES_DISPONIVEIS.map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => remover(p.id)} aria-label={`Remover ${p.nome}`}><Trash2 className="h-4 w-4" /></Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {aba === 'temas' && (
              <PainelTemas selos={selos} central={central} usuarioId={user?.id} clienteId={clienteId} cfg={cfg} mudar={mudar}
                segmentoId={segmentoId} temaId={temaId} aoSegmento={escolherSegmento} aoTema={setTemaId} aoData={aplicarData} aoRecarregar={recarregarSelos}
                aoSoltar={soltarLogo} selecionadoId={selecionadoId} aoSelecionar={setSelecionadoId}
                aoAtualizarElemento={atualizarElemento} aoDuplicarElemento={duplicarElementoPorId} aoExcluirElemento={excluirElemento} />
            )}
            {aba === 'datas' && <PainelDatas cfg={cfg} mudar={mudar} />}
            {aba === 'logo' && <PainelLogo cfg={cfg} mudarPerfil={mudarPerfil} selos={selos} usuarioId={user?.id} clienteId={clienteId} aoRecarregar={recarregarSelos} />}
            {aba === 'empresa' && <PainelEmpresa cfg={cfg} mudarPerfil={mudarPerfil} />}
            {aba === 'fontes' && <PainelFontes cfg={cfg} mudarPerfil={mudarPerfil} />}
            {aba === 'postar' && <PainelPostar texto={textoDasRedes} />}
            {aba === 'encarte' && <PainelEncarte nome={nome} aoNome={setNome} cfg={cfg} mudar={mudar} segmentoId={segmentoId} aoSegmento={escolherSegmento} aoSalvar={salvar} salvando={ocupado === 'salvar'} salvo={!!cartazId} />}
            {aba === 'portal' && <PainelPortal portal={portal} aoSalvarPortal={guardarPortal} aoPublicar={publicar} aoTirar={tirar} publicado={publicado} ocupado={ocupado !== null} />}
          </section>

          {/* prévia */}
          <section className="col-span-2 min-w-0 space-y-3 lg:col-span-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1.5 font-semibold">Modelo:
                <select aria-label="Modelo" className="h-9 rounded-md border bg-background px-2 text-sm font-normal" value={formatoId} onChange={(e) => { setFormatoId(e.target.value); setPagina(0); }} data-testid="tabloide-modelo">
                  {USOS_DO_FORMATO.map((u) => (
                    <optgroup key={u.id} label={u.nome}>
                      {FORMATOS.filter((f) => f.uso === u.id).map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-1.5 font-semibold">Grade:
                <select aria-label="Grade" className="h-9 rounded-md border bg-background px-2 text-sm font-normal" value={grade} onChange={(e) => { setGrade(e.target.value); setPagina(0); }} data-testid="tabloide-grade">
                  {['auto', ...GRADES_FIXAS].map((g) => <option key={g} value={g}>{rotuloGrade(g)}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-1.5 font-semibold">Destaques:
                <select aria-label="Produtos em destaque" className="h-9 rounded-md border bg-background px-2 text-sm font-normal" value={cfg.destaques} onChange={(e) => mudar({ destaques: Number(e.target.value) as 0 | 1 | 2 })} data-testid="tabloide-destaques">
                  <option value={0}>Nenhum</option><option value={1}>1 produto</option><option value={2}>2 produtos</option>
                </select>
              </label>
            </div>
            <div ref={palco} className="w-full" data-testid="tabloide-palco" onPointerDown={() => setSelecionadoId(null)}>
              <div className="overflow-hidden rounded-xl border bg-black/40 shadow-lg" style={{ width: formato.largura * escala, height: formato.altura * escala, maxWidth: '100%' }}>
                <div style={{ width: formato.largura, height: formato.altura, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
                  {paginas[paginaAtual] && <TabloideCanvas {...paginas[paginaAtual]} selecionadoId={selecionadoId} aoPonteiroElemento={aoPonteiroElemento} />}
                </div>
              </div>
            </div>
            {!produtos.length && <p className="text-sm text-muted-foreground" data-testid="tabloide-exemplo">Este é um exemplo de {segmento.nome.toLowerCase()}. Digite os seus produtos e toque em <b>Montar cartaz</b>.</p>}
            {paginas.length > 1 && (
              <div className="flex items-center gap-2 text-sm">
                {paginas.map((_, i) => (
                  <button key={i} type="button" onClick={() => setPagina(i)} className={cn('h-8 w-8 rounded-md border', i === paginaAtual ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted')}>{i + 1}</button>
                ))}
                <span className="text-muted-foreground">{paginas.length} páginas</span>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={baixar} disabled={ocupado !== null || !produtos.length} data-testid="tabloide-baixar">
                {ocupado === 'baixar' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />} Baixar imagem
              </Button>
              <Button variant="outline" onClick={imprimir} disabled={ocupado !== null || !produtos.length} data-testid="tabloide-imprimir">
                {ocupado === 'imprimir' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Printer className="mr-1 h-4 w-4" />} Imprimir
              </Button>
              <Button variant="secondary" onClick={enviarParaMidias} disabled={ocupado !== null || !produtos.length} data-testid="tabloide-enviar">
                {ocupado === 'enviar' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} {contexto === 'portal' ? 'Enviar para minhas mídias (telas)' : 'Enviar para a biblioteca de mídias (telas)'}
              </Button>
            </div>

            <div className="space-y-2 rounded-xl border bg-card p-3" data-testid="modelos-disponiveis">
              <p className="text-sm font-semibold">Modelos disponíveis</p>
              {USOS_DO_FORMATO.map((u) => (
                <div key={u.id} className="flex flex-wrap items-end gap-2">
                  <span className="w-full text-[11px] font-medium uppercase tracking-wide text-muted-foreground sm:w-40">{u.nome}</span>
                  {FORMATOS.filter((f) => f.uso === u.id).map((f) => {
                    const k = 44 / Math.max(f.largura, f.altura);
                    return (
                      <button key={f.id} type="button" onClick={() => { setFormatoId(f.id); setPagina(0); }} aria-pressed={formatoId === f.id} title={f.detalhe} data-testid={`modelo-${f.id}`}
                        className={cn('flex w-[92px] flex-col items-center gap-1 rounded-lg border-2 p-1.5 text-center', formatoId === f.id ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted')}>
                        <span className="flex h-12 items-center justify-center"><span className="rounded-sm border-2 border-current" style={{ width: f.largura * k, height: f.altura * k }} /></span>
                        <span className="text-[11px] font-semibold leading-tight">{f.nome}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">As fotos são ilustrativas: foto real do produto quando existe (catálogo da empresa, Open Food Facts, Wikimedia), banco de imagens para frescos e, quando não há foto real, imagem criada por IA (produto genérico, sem marca). Clique na foto do produto para trocar, criar com IA ou enviar a sua.</p>
          </section>
        </div>
      )}

      {trocando && <TrocarFoto produto={trocando} aoFechar={() => setTrocando(null)} aoEscolher={(img) => trocarFoto(trocando, img)} />}
    </div>
  );
}

function TrocarFoto({ produto, aoFechar, aoEscolher }: { produto: ProdutoTabloide; aoFechar: () => void; aoEscolher: (img: ImagemProduto) => void }) {
  const { user } = useAuth();
  const [termo, setTermo] = useState(produto.nome);
  const [cands, setCands] = useState<CandidatoImagem[] | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [criando, setCriando] = useState(false);

  const criarComIA = async () => {
    setCriando(true);
    try {
      const r = await gerarImagemIA(termo || produto.nome);
      if (r.imagem) aoEscolher(r.imagem); else toast.error(r.motivo || 'A IA não conseguiu criar a imagem agora.');
    } finally { setCriando(false); }
  };

  const buscar = useCallback(async (t: string) => {
    setCands(null);
    setCands(await buscarCandidatos(t));
  }, []);
  useEffect(() => { void buscar(produto.nome); }, [buscar, produto.nome]);

  const enviar = async (arq: File | undefined) => {
    if (!arq || !user?.id) return;
    if (!arq.type.startsWith('image/')) { toast.error('Escolha um arquivo de imagem (JPG, PNG ou WebP).'); return; }
    if (arq.size > 8 * 1024 * 1024) { toast.error('A imagem tem mais de 8 MB. Escolha uma menor.'); return; }
    setEnviando(true);
    try {
      const ext = (arq.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const { publicUrl } = await uploadToR2(arq, `${user.id}/tabloide/${Date.now()}-produto.${ext}`, arq.type, user.id);
      aoEscolher({ url: publicUrl, fonte: 'UPLOAD' });
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível enviar a imagem.');
    } finally { setEnviando(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-w-2xl" data-testid="tabloide-trocar-foto">
        <DialogHeader><DialogTitle>Foto de “{produto.nome}”</DialogTitle></DialogHeader>
        <div className="flex flex-wrap gap-2">
          <Input className="min-w-[160px] flex-1" value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar(termo)} aria-label="Buscar outra foto" />
          <Button variant="outline" onClick={() => buscar(termo)}>Buscar</Button>
          <Button variant="outline" onClick={criarComIA} disabled={criando} data-testid="tabloide-criar-ia" title="Cria um produto genérico, sem marca">
            {criando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} {criando ? 'Criando (até 1 min)…' : 'Criar com IA'}
          </Button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar a minha
            <input type="file" accept="image/*" className="hidden" onChange={(e) => enviar(e.target.files?.[0])} />
          </label>
        </div>
        {cands === null ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Procurando fotos…</p>
        ) : cands.length === 0 ? (
          <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><ImageIcon className="h-4 w-4" /> Não achamos uma foto boa. Tente outro nome ou envie a sua.</p>
        ) : (
          <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
            {cands.map((c) => (
              <button key={c.url} type="button" onClick={() => aoEscolher({ url: c.url, fonte: c.fonte, credito: c.credito })} className="overflow-hidden rounded-lg border bg-white text-left hover:ring-2 hover:ring-primary">
                <img src={c.miniatura} alt={c.legenda} loading="lazy" referrerPolicy="no-referrer" className="aspect-square w-full object-contain" />
                <span className="block truncate bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">{c.legenda || c.fonte}</span>
              </button>
            ))}
          </div>
        )}
        <Button variant="ghost" size="sm" onClick={aoFechar}><Plus className="mr-1 h-4 w-4 rotate-45" /> Fechar</Button>
      </DialogContent>
    </Dialog>
  );
}
