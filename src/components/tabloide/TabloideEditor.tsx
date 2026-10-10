/**
 * Tabloide Digital (F-172, F-177) — o ambiente de criação.
 * Barra lateral de botões (Produtos, Temas, Datas, Selos 3D, Sua Logo, Empresa, Formato) como nos criadores de encarte:
 * o cliente digita "produto + preço"; o sistema acha a foto (catálogo compartilhado primeiro), monta o cartaz no tema do
 * segmento e deixa baixar, imprimir ou enviar para as mídias (portal do anunciante e painel da equipe usam esta mesma tela).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  BadgePercent, CalendarDays, Crown, Download, Image as ImageIcon, LayoutGrid, Loader2, Palette, Plus, Printer, Save, Send,
  ShoppingBasket, Sparkles, Store, Trash2, Upload, Wand2,
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
import { FORMATOS, SEGMENTOS, formatoPorId, segmentoPorId, temaPorId, temasDeDatas, temasDoSegmento, TEMAS, type SegmentoId } from '@/lib/tabloide/temas';
import { GRADES_FIXAS, montarPaginas, rotuloGrade } from '@/lib/tabloide/grade';
import { buscarCandidatos, buscarNoCatalogo, completarImagens, gerarImagemIA, prepararImagem, salvarNoCatalogo, type CandidatoImagem } from '@/lib/tabloide/imagens';
import { chaveCanonica } from '@/lib/tabloide/chave';
import { baixarBlob, imprimirBlobs, nomeDeArquivo, renderizarPaginaEmPng } from '@/lib/tabloide/exportar';
import { tabelaTabloide } from '@/lib/tabloide/db';
import { proximasDatas, rotuloDaData } from '@/lib/tabloide/datas';
import { ajustarElemento, duplicarElemento, listarSelos, novoElemento, resolverLogoCabecalho, type ElementoLivre, type Selo } from '@/lib/tabloide/selos';
import { TabloideCanvas } from './TabloideCanvas';
import { PainelSelos } from './PainelSelos';
import { GaleriaLogoCabecalho } from './GaleriaLogoCabecalho';

export interface TabloideEditorProps {
  contexto: 'portal' | 'painel';
  clienteId?: string | null;
  empresaPadrao?: string;
  logoPadrao?: string | null;
  segmentoPadrao?: string | null;
}

interface Rascunho { id: string; nome: string; updated_at: string }

const BOTOES = [
  { id: 'produtos', rotulo: 'Produtos', icone: ShoppingBasket },
  { id: 'temas', rotulo: 'Temas', icone: Palette },
  { id: 'datas', rotulo: 'Datas', icone: CalendarDays },
  { id: 'cabecalho', rotulo: 'Cabeçalho', icone: Crown },
  { id: 'selos', rotulo: 'Selos 3D', icone: BadgePercent },
  { id: 'logo', rotulo: 'Sua Logo', icone: ImageIcon },
  { id: 'empresa', rotulo: 'Empresa', icone: Store },
  { id: 'formato', rotulo: 'Formato', icone: LayoutGrid },
] as const;
type Aba = (typeof BOTOES)[number]['id'];

/** Descobre o segmento do cadastro do cliente (texto livre) entre os do Tabloide. */
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

export function TabloideEditor({ contexto, clienteId = null, empresaPadrao = '', logoPadrao = null, segmentoPadrao = null }: TabloideEditorProps) {
  const { user } = useAuth();
  const segInicial = useMemo(() => segmentoDoCadastro(segmentoPadrao), [segmentoPadrao]);

  const [aba, setAba] = useState<Aba>('produtos');
  const [segmentoId, setSegmentoId] = useState<SegmentoId>(segInicial);
  const [temaId, setTemaId] = useState<string>(() => temasDoSegmento(segInicial)[0]?.id ?? 'ofertao');
  const [formatoId, setFormatoId] = useState<string>('tv-h');
  const [grade, setGrade] = useState<string>('auto');
  const [destaques, setDestaques] = useState<0 | 1 | 2>(0);
  const [texto, setTexto] = useState('');
  const [produtos, setProdutos] = useState<ProdutoTabloide[]>([]);
  const [titulo, setTitulo] = useState(() => segmentoPorId(segInicial).titulo);
  const [subtitulo, setSubtitulo] = useState(() => segmentoPorId(segInicial).subtitulo);
  const [validade, setValidade] = useState('');
  const [empresa, setEmpresa] = useState(empresaPadrao);
  const [logoUrl, setLogoUrl] = useState<string | null>(logoPadrao);
  const [mostrarLogo, setMostrarLogo] = useState(true);
  const [enviandoLogo, setEnviandoLogo] = useState(false);
  const [seloUrl, setSeloUrl] = useState<string | null>(null);
  // logo escolhida na galeria "Logo do Cabeçalho" (identificador estável do catálogo; null = cabeçalho automático)
  const [logoCabecalhoId, setLogoCabecalhoId] = useState<string | null>(null);
  const [logoAnteriorId, setLogoAnteriorId] = useState<string | null>(null);
  const [logoPendente, setLogoPendente] = useState(false);
  const seloAvulsoAnterior = useRef<string | null>(null);
  const [selos, setSelos] = useState<Selo[] | null>(null);
  const [elementos, setElementos] = useState<ElementoLivre[]>([]);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);
  const [novosBuscando, setNovosBuscando] = useState<string[]>([]);
  const buscandoFotos = novosBuscando.length > 0;
  const [ocupado, setOcupado] = useState<null | 'baixar' | 'enviar' | 'salvar' | 'imprimir'>(null);
  const [nomeTabloide, setNomeTabloide] = useState('Meu tabloide');
  const [tabloideId, setTabloideId] = useState<string | null>(null);
  const [rascunhos, setRascunhos] = useState<Rascunho[]>([]);
  const [trocando, setTrocando] = useState<ProdutoTabloide | null>(null);

  const tentados = useRef<Set<string>>(new Set());
  const tituloEditado = useRef(false);
  const palco = useRef<HTMLDivElement>(null);
  const [largPalco, setLargPalco] = useState(700);

  useEffect(() => { if (empresaPadrao && !empresa) setEmpresa(empresaPadrao); }, [empresaPadrao]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (logoPadrao && !logoUrl) setLogoUrl(logoPadrao); }, [logoPadrao]); // eslint-disable-line react-hooks/exhaustive-deps

  const formato = formatoPorId(formatoId);
  const tema = temaPorId(temaId);
  const segmento = segmentoPorId(segmentoId);
  // antes de o cliente digitar, a prévia mostra o exemplo do segmento (só para ver o estilo; não é exportado)
  const exemploBase = useMemo(() => lerLista(segmento.exemplo), [segmento]);
  const [fotosExemplo, setFotosExemplo] = useState<Map<string, ImagemProduto>>(new Map());
  // as fotos do exemplo vêm do catálogo compartilhado (uma consulta, sem busca externa)
  useEffect(() => {
    let ativo = true;
    void buscarNoCatalogo(exemploBase.map((p) => p.nome)).then((m) => { if (ativo) setFotosExemplo(m); }).catch(() => undefined);
    return () => { ativo = false; };
  }, [exemploBase]);
  const exemplo = useMemo(() => exemploBase.map((p) => ({ ...p, imagem: fotosExemplo.get(chaveCanonica(p.nome)) ?? null })), [exemploBase, fotosExemplo]);
  const paginas = useMemo(() => montarPaginas(produtos.length ? produtos : exemplo, formato, grade, destaques), [produtos, exemplo, formato, grade, destaques]);
  const paginaAtual = Math.min(pagina, paginas.length - 1);

  useEffect(() => {
    const el = palco.current;
    if (!el) return;
    const medir = () => setLargPalco(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const escala = Math.max(0.1, Math.min(largPalco / formato.largura, (typeof window !== 'undefined' ? window.innerHeight * 0.68 : 600) / formato.altura));
  const escalaRef = useRef(escala);
  escalaRef.current = escala;

  const recarregarSelos = useCallback(async () => { setSelos(await listarSelos()); }, []);
  useEffect(() => { void recarregarSelos(); }, [recarregarSelos]);
  // a logo vem do catálogo pelo identificador; id que não existe mais ou foi arquivada => cabeçalho automático, sem quebrar
  const logoEscolhida = useMemo(() => resolverLogoCabecalho(selos, logoCabecalhoId), [selos, logoCabecalhoId]);
  const cabecalhoUrl = logoEscolhida ? logoEscolhida.imagem_url : logoCabecalhoId && selos === null ? null : seloUrl;

  const listarRascunhos = useCallback(async () => {
    const { data } = await tabelaTabloide('tabloides').select('id, nome, updated_at').is('deleted_at', null).order('updated_at', { ascending: false }).limit(30);
    setRascunhos((data as Rascunho[]) ?? []);
  }, []);
  useEffect(() => { void listarRascunhos(); }, [listarRascunhos]);

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
    const lidos = lerLista(texto);
    if (!lidos.length) { toast.error('Digite pelo menos um produto, um por linha. Exemplo: Arroz 5kg 25,90'); return; }
    const mesclados = mesclarListas(produtos, lidos);
    setProdutos(mesclados);
    setPagina(0);
    void procurarFotos(mesclados);
  };

  const trocarLista = (n: ProdutoTabloide[]) => { setProdutos(n); setTexto(n.map(paraLinha).join('\n')); };
  const atualizar = (id: string, mudanca: Partial<ProdutoTabloide>) => trocarLista(produtos.map((p) => (p.id === id ? { ...p, ...mudanca } : p)));
  const remover = (id: string) => trocarLista(produtos.filter((p) => p.id !== id));

  const escolherSegmento = (id: SegmentoId) => {
    setSegmentoId(id);
    setTemaId(temasDoSegmento(id)[0]?.id ?? temaId);
    if (!tituloEditado.current) { setTitulo(segmentoPorId(id).titulo); setSubtitulo(segmentoPorId(id).subtitulo); }
  };

  // ---- logo do cabeçalho (galeria) ----
  const escolherLogoCabecalho = (id: string | null) => {
    if (id === logoCabecalhoId) return;
    if (!logoPendente) { setLogoAnteriorId(logoCabecalhoId); seloAvulsoAnterior.current = seloUrl; }
    setLogoCabecalhoId(id);
    setSeloUrl(null); // a escolha da galeria substitui um selo avulso antigo (guardado para o "Desfazer")
    setLogoPendente(true);
  };
  const confirmarLogoCabecalho = () => { setLogoPendente(false); toast.success('Logo do cabeçalho definida. Salve o rascunho para guardar.'); };
  const desfazerLogoCabecalho = () => { setLogoCabecalhoId(logoAnteriorId); setSeloUrl(seloAvulsoAnterior.current); setLogoPendente(false); };

  // ---- selos livres no cartaz (camadas) ----
  const inserirSelo = (selo: Selo) => {
    const e = novoElemento(selo, { cx: 0.5, cy: 0.5 });
    setElementos((l) => [...l, e]);
    setSelecionadoId(e.id);
  };
  const atualizarElemento = (id: string, mudanca: Partial<ElementoLivre>) => setElementos((l) => l.map((e) => (e.id === id ? ajustarElemento({ ...e, ...mudanca }) : e)));
  const duplicarElementoPorId = (id: string) => {
    const orig = elementos.find((e) => e.id === id);
    if (!orig) return;
    const copia = duplicarElemento(orig);
    setElementos((l) => [...l, copia]);
    setSelecionadoId(copia.id);
  };
  const excluirElemento = useCallback((id: string) => {
    setElementos((l) => l.filter((e) => e.id !== id));
    setSelecionadoId((atual) => (atual === id ? null : atual));
  }, []);
  const usarElementoNoCabecalho = (id: string) => {
    const e = elementos.find((x) => x.id === id);
    if (!e) return;
    setSeloUrl(e.url);
    setLogoCabecalhoId(null);
    excluirElemento(id);
    toast.success('Selo colocado no cabeçalho.');
  };

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
      setElementos((l) => l.map((x) => (x.id === a.id ? ajustarElemento({ ...x, cx: a.cx + dx, cy: a.cy + dy }) : x)));
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

  const propsDaPagina = (i: number) => ({
    formato, tema, segmento, titulo, subtitulo, validade, empresa,
    logoUrl: mostrarLogo ? logoUrl : null, seloUrl: cabecalhoUrl, elementos, pagina: paginas[i], numeroPagina: i + 1, totalPaginas: paginas.length,
  });

  const gerarPngs = async (): Promise<Blob[]> => {
    // a logo do cabeçalho vem do catálogo: garante que ele já carregou antes de desenhar a imagem final
    let urlDoCabecalho = cabecalhoUrl;
    if (logoCabecalhoId && selos === null) urlDoCabecalho = resolverLogoCabecalho(await listarSelos(), logoCabecalhoId)?.imagem_url ?? seloUrl;
    const out: Blob[] = [];
    for (let i = 0; i < paginas.length; i++) out.push(await renderizarPaginaEmPng({ ...propsDaPagina(i), seloUrl: urlDoCabecalho }));
    return out;
  };

  const baixar = async () => {
    if (!produtos.length) { toast.error('Monte o cartaz primeiro.'); return; }
    setOcupado('baixar');
    try {
      const pngs = await gerarPngs();
      pngs.forEach((b, i) => baixarBlob(b, nomeDeArquivo(nomeTabloide, i + 1, pngs.length)));
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
        const nome = `${nomeTabloide}${pngs.length > 1 ? ` - página ${i + 1}` : ''}`;
        const caminho = `${user.id}/${contexto === 'portal' ? 'portal' : 'tabloide'}/${Date.now()}-tabloide-${i + 1}.png`;
        const { publicUrl, filePath } = await uploadToR2(pngs[i], caminho, 'image/png', user.id);
        if (contexto === 'portal') {
          if (!clienteId || !tenant) throw new Error('Cadastro do anunciante não encontrado.');
          const { data: asset, error } = await supabase.from('cliente_assets').insert({
            cliente_id: clienteId, empresa_operadora_id: tenant, nome, tipo: 'imagem', mime_type: 'image/png',
            object_url: publicUrl, tamanho: pngs[i].size, usuario_id: user.id,
          } as never).select('id').single();
          if (error) throw error;
          if (asset) void supabase.functions.invoke('analisar-midia', { body: { asset_id: (asset as { id: string }).id } });
        } else {
          const { error } = await supabase.from('media').insert({
            user_id: user.id, name: nome, file_path: filePath, file_url: publicUrl, file_type: 'image',
            file_size: pngs[i].size, mime_type: 'image/png', aspect_ratio: proporcao, thumbnail_url: publicUrl,
          } as never);
          if (error) throw error;
        }
      }
      toast.success(contexto === 'portal' ? 'Enviado! O cartaz aparece em "Minhas mídias" depois da análise.' : 'Enviado para as suas mídias.');
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível enviar o cartaz.');
    } finally { setOcupado(null); }
  };

  const config = () => ({ titulo, subtitulo, validade, empresa, mostrarLogo, destaques, texto, seloUrl, logoCabecalhoId, elementos });

  const salvar = async () => {
    setLogoPendente(false); // salvar vale como confirmar
    setOcupado('salvar');
    try {
      const linha = { nome: nomeTabloide.trim() || 'Meu tabloide', formato: formatoId, tema: temaId, segmento: segmentoId, grade, produtos, config: config(), cliente_id: clienteId };
      if (tabloideId) {
        const { error } = await tabelaTabloide('tabloides').update(linha as never).eq('id', tabloideId);
        if (error) throw error;
      } else {
        const { data, error } = await tabelaTabloide('tabloides').insert(linha as never).select('id').single();
        if (error) throw error;
        setTabloideId((data as { id: string }).id);
      }
      toast.success('Rascunho salvo.');
      void listarRascunhos();
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível salvar.');
    } finally { setOcupado(null); }
  };

  const abrir = async (id: string) => {
    const { data, error } = await tabelaTabloide('tabloides').select('*').eq('id', id).single();
    if (error || !data) { toast.error('Não foi possível abrir o rascunho.'); return; }
    const d = data as any;
    const c = d.config ?? {};
    setTabloideId(d.id); setNomeTabloide(d.nome); setFormatoId(d.formato); setTemaId(d.tema); setSegmentoId(d.segmento); setGrade(d.grade);
    setProdutos(d.produtos ?? []); setTexto(c.texto ?? (d.produtos ?? []).map(paraLinha).join('\n'));
    setTitulo(c.titulo ?? ''); setSubtitulo(c.subtitulo ?? ''); setValidade(c.validade ?? ''); setEmpresa(c.empresa ?? empresaPadrao);
    setMostrarLogo(c.mostrarLogo ?? true); setDestaques(c.destaques ?? 0); setSeloUrl(c.seloUrl ?? null); setLogoCabecalhoId(typeof c.logoCabecalhoId === 'string' ? c.logoCabecalhoId : null); setLogoPendente(false); setPagina(0);
    setElementos(Array.isArray(c.elementos) ? (c.elementos as ElementoLivre[]).map(ajustarElemento) : []); setSelecionadoId(null);
    tituloEditado.current = true;
    // produto que já tem foto não busca de novo; o que ficou sem foto no rascunho é procurado agora (catálogo primeiro)
    const doRascunho: ProdutoTabloide[] = d.produtos ?? [];
    doRascunho.filter((p) => p.imagem).forEach((p) => tentados.current.add(p.id));
    doRascunho.filter((p) => !p.imagem).forEach((p) => tentados.current.delete(p.id));
    toast.success('Rascunho aberto.');
    void procurarFotos(doRascunho);
  };

  const excluir = async () => {
    if (!tabloideId || !confirm('Excluir este rascunho?')) return;
    const { error } = await tabelaTabloide('tabloides').update({ deleted_at: new Date().toISOString() } as never).eq('id', tabloideId);
    if (error) { toast.error('Não foi possível excluir.'); return; }
    setTabloideId(null); setNomeTabloide('Meu tabloide'); toast.success('Rascunho excluído.'); void listarRascunhos();
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

  const enviarLogo = async (arq: File | undefined) => {
    if (!arq || !user?.id) return;
    if (!arq.type.startsWith('image/')) { toast.error('Escolha um arquivo de imagem (PNG, JPG ou WebP).'); return; }
    if (arq.size > 4 * 1024 * 1024) { toast.error('A logo tem mais de 4 MB. Escolha uma menor.'); return; }
    setEnviandoLogo(true);
    try {
      const ext = (arq.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '');
      const { publicUrl } = await uploadToR2(arq, `${user.id}/tabloide/logo-${Date.now()}.${ext}`, arq.type, user.id);
      setLogoUrl(publicUrl);
      setMostrarLogo(true);
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível enviar a logo.');
    } finally { setEnviandoLogo(false); }
  };

  const escolherData = (temaDaData: string, tituloDaData: string, subtituloDaData: string) => {
    setTemaId(temaDaData);
    tituloEditado.current = true;
    setTitulo(tituloDaData);
    setSubtitulo(subtituloDaData);
    setSeloUrl(null);
    toast.success('Tema da data aplicado.');
  };

  const datas = useMemo(() => proximasDatas(), []);

  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-3 p-3 md:p-5" data-testid="tabloide-editor">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Sparkles className="h-6 w-6 text-primary" /> Tabloide Digital</h1>
          <p className="text-sm text-muted-foreground">Digite o produto e o preço. O sistema coloca a foto e monta o cartaz.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {rascunhos.length > 0 && (
            <select aria-label="Abrir um rascunho" className="h-9 rounded-md border bg-background px-2 text-sm" value="" onChange={(e) => e.target.value && abrir(e.target.value)}>
              <option value="">Abrir rascunho…</option>
              {rascunhos.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          )}
          <Input aria-label="Nome do tabloide" className="h-9 w-44" value={nomeTabloide} onChange={(e) => setNomeTabloide(e.target.value)} />
          <Button variant="outline" size="sm" onClick={salvar} disabled={ocupado !== null} data-testid="tabloide-salvar">
            {ocupado === 'salvar' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Salvar rascunho
          </Button>
          {tabloideId && <Button variant="ghost" size="icon" onClick={excluir} aria-label="Excluir rascunho"><Trash2 className="h-4 w-4" /></Button>}
        </div>
      </div>

      <div className="grid grid-cols-[72px_minmax(0,1fr)] items-start gap-3 lg:grid-cols-[76px_390px_minmax(0,1fr)]">
        {/* barra lateral de botões */}
        <nav className="flex flex-col gap-1 rounded-xl border bg-slate-950/70 p-1.5" aria-label="Ferramentas do tabloide" data-testid="tabloide-barra">
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

        {/* painel da ferramenta */}
        <section className="min-w-0 space-y-3 rounded-xl border bg-card p-4" data-testid="tabloide-painel">
          {aba === 'produtos' && (
            <div className="space-y-3">
              <label className="text-sm font-semibold" htmlFor="tabloide-texto">Digite um produto por linha, com o preço</label>
              <Textarea id="tabloide-texto" data-testid="tabloide-texto" rows={7} value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder={segmento.exemplo} className="font-mono text-sm" />
              <div className="flex flex-wrap gap-2">
                <Button onClick={montarCartaz} data-testid="tabloide-montar"><Wand2 className="mr-1 h-4 w-4" /> Montar cartaz</Button>
                <Button variant="outline" onClick={() => setTexto(segmento.exemplo)} type="button">Usar exemplo de {segmento.nome.toLowerCase()}</Button>
              </div>
              <p className="text-xs text-muted-foreground">Aceita: <i>Arroz 5kg 25,90</i> · <i>Picanha kg R$ 49,90</i> · <i>Leite de 6,50 por 4,99</i></p>
              {buscandoFotos && <p className="flex items-center gap-2 text-sm text-primary" data-testid="tabloide-procurando"><Loader2 className="h-4 w-4 animate-spin" /> Produto novo para o sistema: procurando a foto de {novosBuscando.length === 1 ? novosBuscando[0] : `${novosBuscando.length} produtos`}…</p>}

              {produtos.length > 0 && (
                <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1" data-testid="tabloide-lista">
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
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-semibold">Qual é o seu comércio?</p>
                <div className="grid grid-cols-2 gap-2" data-testid="tabloide-segmentos">
                  {SEGMENTOS.map((s) => (
                    <button key={s.id} type="button" onClick={() => escolherSegmento(s.id)}
                      className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors', segmentoId === s.id ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted')}>
                      <span className="text-xl">{s.emoji}</span><span className="leading-tight">{s.nome}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Estilo do cartaz — {segmento.nome}</p>
                <div className="grid grid-cols-3 gap-2" data-testid="tabloide-temas">
                  {temasDoSegmento(segmentoId).concat(TEMAS.filter((t) => t.grupo === 'mercado' && segmentoId !== 'mercado')).map((t) => (
                    <TemaMiniatura key={t.id} id={t.id} ativo={temaId === t.id} aoEscolher={setTemaId} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {aba === 'datas' && (
            <div className="space-y-3" data-testid="painel-datas">
              <p className="text-sm font-semibold">Datas comemorativas</p>
              <p className="text-xs text-muted-foreground">Toque na data para aplicar o tema, o título e a frase prontos.</p>
              <ul className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
                {datas.map(({ item, data, dias }) => {
                  const t = temaPorId(item.temaId);
                  return (
                    <li key={item.id}>
                      <button type="button" onClick={() => escolherData(item.temaId, item.titulo, item.subtitulo)} data-testid={`data-${item.id}`}
                        className={cn('flex w-full items-center gap-3 rounded-lg border p-2 text-left hover:bg-muted', temaId === item.temaId && titulo === item.titulo ? 'border-primary bg-primary/10' : '')}>
                        <span className="flex h-12 w-16 shrink-0 items-center justify-center rounded-md text-xl" style={{ background: t.fundo }}>{t.emoji}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">{item.nome}</span>
                          <span className="block text-xs text-muted-foreground">{rotuloDaData(data)} · {dias === 0 ? 'é hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="text-xs text-muted-foreground">Mais estilos de data nos temas: {temasDeDatas().length} desenhos próprios.</p>
            </div>
          )}

          {aba === 'cabecalho' && (
            <GaleriaLogoCabecalho
              selos={selos}
              escolhidaId={logoEscolhida ? logoEscolhida.id : null}
              pendente={logoPendente}
              usuarioId={user?.id}
              aoEscolher={escolherLogoCabecalho}
              aoConfirmar={confirmarLogoCabecalho}
              aoDesfazer={desfazerLogoCabecalho}
              aoRecarregar={recarregarSelos}
            />
          )}

          {aba === 'selos' && (
            <PainelSelos
              selos={selos}
              aoRecarregar={recarregarSelos}
              contexto={contexto}
              clienteId={clienteId}
              usuarioId={user?.id}
              titulo={titulo}
              elementos={elementos}
              selecionadoId={selecionadoId}
              aoInserir={inserirSelo}
              aoSelecionar={setSelecionadoId}
              aoAtualizar={atualizarElemento}
              aoDuplicar={duplicarElementoPorId}
              aoExcluir={excluirElemento}
              aoUsarNoCabecalho={usarElementoNoCabecalho}
              aoEscolherTitulo={(tp) => { tituloEditado.current = true; setTitulo(tp); setSeloUrl(null); }}
            />
          )}

          {aba === 'logo' && (
            <div className="space-y-3" data-testid="painel-logo">
              <p className="text-sm font-semibold">Sua logo</p>
              <div className="flex h-32 items-center justify-center rounded-lg border bg-white p-2">
                {logoUrl ? <img src={logoUrl} alt="Sua logo" crossOrigin="anonymous" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" /> : <span className="text-sm text-muted-foreground">Nenhuma logo ainda</span>}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground" data-testid="tabloide-enviar-logo">
                  {enviandoLogo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} {logoUrl ? 'Trocar a logo' : 'Enviar a logo'}
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => { void enviarLogo(e.target.files?.[0]); e.target.value = ''; }} />
                </label>
                {logoUrl && <Button variant="ghost" size="sm" onClick={() => setLogoUrl(null)}>Remover</Button>}
              </div>
              {logoUrl && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mostrarLogo} onChange={(e) => setMostrarLogo(e.target.checked)} /> Mostrar a logo no cartaz</label>}
            </div>
          )}

          {aba === 'empresa' && (
            <div className="space-y-3" data-testid="painel-empresa">
              <Campo rotulo="Título do cartaz"><Input value={titulo} onChange={(e) => { tituloEditado.current = true; setTitulo(e.target.value); }} maxLength={40} /></Campo>
              <Campo rotulo="Frase abaixo do título"><Input value={subtitulo} onChange={(e) => { tituloEditado.current = true; setSubtitulo(e.target.value); }} maxLength={60} /></Campo>
              <Campo rotulo="Nome da sua loja"><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={50} /></Campo>
              <Campo rotulo="Validade (aparece no rodapé)"><Input value={validade} onChange={(e) => setValidade(e.target.value)} placeholder="Ex.: Ofertas válidas até 15/11 ou enquanto durarem os estoques" maxLength={90} /></Campo>
            </div>
          )}

          {aba === 'formato' && (
            <div className="space-y-4" data-testid="painel-formato">
              <div className="space-y-2">
                {FORMATOS.map((f) => (
                  <button key={f.id} type="button" onClick={() => { setFormatoId(f.id); setPagina(0); }}
                    className={cn('flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm', formatoId === f.id ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted')}>
                    <span>{f.nome}</span><span className="text-xs text-muted-foreground">{f.detalhe}</span>
                  </button>
                ))}
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Distribuição dos produtos</p>
                <div className="flex flex-wrap gap-1.5" data-testid="tabloide-grades">
                  {['auto', ...GRADES_FIXAS].map((g) => (
                    <button key={g} type="button" onClick={() => { setGrade(g); setPagina(0); }}
                      className={cn('rounded-md border px-2.5 py-1 text-xs', grade === g ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted')}>{rotuloGrade(g)}</button>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Produtos em destaque (grandes, no topo)</p>
                <div className="flex gap-2">
                  {([0, 1, 2] as const).map((d) => (
                    <button key={d} type="button" onClick={() => setDestaques(d)}
                      className={cn('rounded-md border px-3 py-1 text-sm', destaques === d ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted')}>{d === 0 ? 'Nenhum' : d}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>

        {/* prévia */}
        <section className="col-span-2 min-w-0 space-y-3 lg:col-span-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1.5 font-semibold">Modelo:
              <select aria-label="Modelo" className="h-9 rounded-md border bg-background px-2 text-sm font-normal" value={formatoId} onChange={(e) => { setFormatoId(e.target.value); setPagina(0); }} data-testid="tabloide-modelo">
                {FORMATOS.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-1.5 font-semibold">Grade:
              <select aria-label="Grade" className="h-9 rounded-md border bg-background px-2 text-sm font-normal" value={grade} onChange={(e) => { setGrade(e.target.value); setPagina(0); }} data-testid="tabloide-grade">
                {['auto', ...GRADES_FIXAS].map((g) => <option key={g} value={g}>{rotuloGrade(g)}</option>)}
              </select>
            </label>
          </div>
          <div ref={palco} className="w-full" data-testid="tabloide-palco" onPointerDown={() => setSelecionadoId(null)}>
            <div className="overflow-hidden rounded-xl border bg-black/40 shadow-lg" style={{ width: formato.largura * escala, height: formato.altura * escala, maxWidth: '100%' }}>
              <div style={{ width: formato.largura, height: formato.altura, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
                <TabloideCanvas {...propsDaPagina(paginaAtual)} selecionadoId={selecionadoId} aoPonteiroElemento={aoPonteiroElemento} />
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
              {ocupado === 'enviar' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} {contexto === 'portal' ? 'Enviar para minhas mídias' : 'Enviar para a biblioteca de mídias'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">As fotos são ilustrativas: foto real do produto quando existe (catálogo da empresa, Open Food Facts, Wikimedia), banco de imagens para frescos e, quando não há foto real, imagem criada por IA (produto genérico, sem marca). Clique na foto do produto para trocar, criar com IA ou enviar a sua.</p>
        </section>
      </div>

      {trocando && <TrocarFoto produto={trocando} aoFechar={() => setTrocando(null)} aoEscolher={(img) => trocarFoto(trocando, img)} />}
    </div>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return <label className="block space-y-1 text-sm"><span className="font-semibold">{rotulo}</span>{children}</label>;
}

function TemaMiniatura({ id, ativo, aoEscolher }: { id: string; ativo: boolean; aoEscolher: (id: string) => void }) {
  const t = temaPorId(id);
  return (
    <button type="button" onClick={() => aoEscolher(id)} data-testid={`tabloide-tema-${id}`} aria-pressed={ativo}
      className={cn('overflow-hidden rounded-lg border-2 text-left transition-transform hover:scale-[1.03]', ativo ? 'border-primary' : 'border-transparent')}>
      <div style={{ background: t.fundo }} className="h-14 p-1.5">
        <div style={{ background: t.faixa, color: t.tituloCor }} className="rounded px-1 py-0.5 text-center text-[9px] font-black">{t.emoji} OFERTAS</div>
        <div className="mt-1 flex justify-center gap-1">
          <div style={{ background: t.cartao, borderColor: t.cartaoBorda }} className="h-5 w-6 rounded-sm border" />
          <div style={{ background: t.cartao, borderColor: t.cartaoBorda }} className="h-5 w-6 rounded-sm border" />
        </div>
      </div>
      <div className="truncate bg-muted/50 px-1.5 py-1 text-[11px] font-semibold">{t.nome}</div>
    </button>
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
