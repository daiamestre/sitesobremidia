/**
 * Tabloide Digital (F-172) — o ambiente de criação.
 * O cliente digita "produto + preço" (um por linha); o sistema acha a foto, monta o cartaz no tema do segmento
 * e deixa baixar em PNG ou enviar para as mídias (portal do anunciante e painel da equipe usam esta mesma tela).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Download, Image as ImageIcon, Loader2, Plus, Save, Send, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react';
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
import { FORMATOS, SEGMENTOS, TEMAS, TITULOS_PRONTOS, formatoPorId, segmentoPorId, temaPorId, temasDeDatas, temasDoSegmento, type SegmentoId } from '@/lib/tabloide/temas';
import { GRADES_FIXAS, montarPaginas, rotuloGrade } from '@/lib/tabloide/grade';
import { buscarCandidatos, completarImagens, gerarImagemIA, prepararImagem, salvarNoCatalogo, type CandidatoImagem } from '@/lib/tabloide/imagens';
import { baixarBlob, nomeDeArquivo, renderizarPaginaEmPng } from '@/lib/tabloide/exportar';
import { tabelaTabloide } from '@/lib/tabloide/db';
import { TabloideCanvas } from './TabloideCanvas';

export interface TabloideEditorProps {
  contexto: 'portal' | 'painel';
  clienteId?: string | null;
  empresaPadrao?: string;
  logoPadrao?: string | null;
  segmentoPadrao?: string | null;
}

interface Rascunho { id: string; nome: string; updated_at: string }

const ABAS = ['Produtos', 'Temas', 'Formato', 'Marca'] as const;
type Aba = (typeof ABAS)[number];

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

  const [aba, setAba] = useState<Aba>('Produtos');
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
  const [seloUrl, setSeloUrl] = useState<string | null>(null);
  const [enviandoSelo, setEnviandoSelo] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [buscandoFotos, setBuscandoFotos] = useState(false);
  const [ocupado, setOcupado] = useState<null | 'baixar' | 'enviar' | 'salvar'>(null);
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
  const exemplo = useMemo(() => lerLista(segmento.exemplo), [segmento]);
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

  const listarRascunhos = useCallback(async () => {
    const { data } = await tabelaTabloide('tabloides').select('id, nome, updated_at').is('deleted_at', null).order('updated_at', { ascending: false }).limit(30);
    setRascunhos((data as Rascunho[]) ?? []);
  }, []);
  useEffect(() => { void listarRascunhos(); }, [listarRascunhos]);

  /** Busca a foto dos produtos que ainda não têm (uma vez por produto). */
  const procurarFotos = useCallback(async (lista: ProdutoTabloide[]) => {
    const novos = lista.filter((p) => !p.imagem && !tentados.current.has(p.id));
    if (!novos.length) return;
    novos.forEach((p) => tentados.current.add(p.id));
    setBuscandoFotos(true);
    try {
      await completarImagens(novos, clienteId, (id, imagem) => {
        if (imagem) setProdutos((atual) => atual.map((p) => (p.id === id ? { ...p, imagem } : p)));
      });
    } finally {
      setBuscandoFotos(false);
    }
  }, [clienteId]);

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

  const propsDaPagina = (i: number) => ({
    formato, tema, segmento, titulo, subtitulo, validade, empresa,
    logoUrl: mostrarLogo ? logoUrl : null, seloUrl, pagina: paginas[i], numeroPagina: i + 1, totalPaginas: paginas.length,
  });

  const gerarPngs = async (): Promise<Blob[]> => {
    const out: Blob[] = [];
    for (let i = 0; i < paginas.length; i++) out.push(await renderizarPaginaEmPng(propsDaPagina(i)));
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

  const config = () => ({ titulo, subtitulo, validade, empresa, mostrarLogo, destaques, texto, seloUrl });

  const salvar = async () => {
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
    setMostrarLogo(c.mostrarLogo ?? true); setDestaques(c.destaques ?? 0); setSeloUrl(c.seloUrl ?? null); setPagina(0);
    tituloEditado.current = true;
    (d.produtos ?? []).forEach((p: ProdutoTabloide) => tentados.current.add(p.id));
    toast.success('Rascunho aberto.');
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
      await salvarNoCatalogo(produto.nome, pronta, clienteId);
    } catch { /* o cartaz já foi atualizado */ }
  };

  const enviarSelo = async (arq: File | undefined) => {
    if (!arq || !user?.id) return;
    if (arq.type !== 'image/png' && arq.type !== 'image/webp') { toast.error('Envie o selo em PNG (ou WebP) com fundo transparente.'); return; }
    if (arq.size > 6 * 1024 * 1024) { toast.error('O selo tem mais de 6 MB. Escolha um menor.'); return; }
    setEnviandoSelo(true);
    try {
      const ext = arq.type === 'image/webp' ? 'webp' : 'png';
      const { publicUrl } = await uploadToR2(arq, `${user.id}/tabloide/selo-${Date.now()}.${ext}`, arq.type, user.id);
      setSeloUrl(publicUrl);
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível enviar o selo.');
    } finally { setEnviandoSelo(false); }
  };

  const botaoAba = (a: Aba) => (
    <button key={a} type="button" onClick={() => setAba(a)} data-testid={`tabloide-aba-${a.toLowerCase()}`}
      className={cn('flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors', aba === a ? 'bg-primary text-primary-foreground' : 'bg-muted/40 text-muted-foreground hover:bg-muted')}>
      {a}
    </button>
  );

  return (
    <div className="mx-auto w-full max-w-[1500px] space-y-4 p-4 md:p-6" data-testid="tabloide-editor">
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
          <Input aria-label="Nome do tabloide" className="h-9 w-48" value={nomeTabloide} onChange={(e) => setNomeTabloide(e.target.value)} />
          <Button variant="outline" size="sm" onClick={salvar} disabled={ocupado !== null} data-testid="tabloide-salvar">
            {ocupado === 'salvar' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Salvar rascunho
          </Button>
          {tabloideId && <Button variant="ghost" size="icon" onClick={excluir} aria-label="Excluir rascunho"><Trash2 className="h-4 w-4" /></Button>}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(320px,440px)_1fr]">
        <div className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex gap-2">{ABAS.map(botaoAba)}</div>

          {aba === 'Produtos' && (
            <div className="space-y-3">
              <label className="text-sm font-semibold" htmlFor="tabloide-texto">Um produto por linha, com o preço</label>
              <Textarea id="tabloide-texto" data-testid="tabloide-texto" rows={7} value={texto} onChange={(e) => setTexto(e.target.value)}
                placeholder={segmento.exemplo} className="font-mono text-sm" />
              <div className="flex flex-wrap gap-2">
                <Button onClick={montarCartaz} data-testid="tabloide-montar"><Wand2 className="mr-1 h-4 w-4" /> Montar cartaz</Button>
                <Button variant="outline" onClick={() => setTexto(segmento.exemplo)} type="button">Usar exemplo de {segmento.nome.toLowerCase()}</Button>
              </div>
              <p className="text-xs text-muted-foreground">Aceita: <i>Arroz 5kg 25,90</i> · <i>Picanha kg R$ 49,90</i> · <i>Leite de 6,50 por 4,99</i></p>
              {buscandoFotos && <p className="flex items-center gap-2 text-sm text-primary"><Loader2 className="h-4 w-4 animate-spin" /> Procurando as fotos dos produtos…</p>}

              {produtos.length > 0 && (
                <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1" data-testid="tabloide-lista">
                  {produtos.map((p) => (
                    <li key={p.id} className="flex items-center gap-2 rounded-lg border bg-background/50 p-2">
                      <button type="button" onClick={() => setTrocando(p)} title="Trocar a foto" aria-label={`Trocar a foto de ${p.nome}`}
                        className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white text-2xl">
                        {p.imagem ? <img src={p.imagem.url} alt="" className="h-full w-full object-contain" crossOrigin="anonymous" referrerPolicy="no-referrer" /> : <span className="px-0.5 text-center text-[9px] font-bold leading-tight text-muted-foreground">{buscandoFotos ? 'buscando…' : 'sem foto'}</span>}
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

          {aba === 'Temas' && (
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
              <div>
                <p className="mb-2 text-sm font-semibold">Datas comemorativas</p>
                <div className="grid grid-cols-3 gap-2">
                  {temasDeDatas().map((t) => <TemaMiniatura key={t.id} id={t.id} ativo={temaId === t.id} aoEscolher={setTemaId} />)}
                </div>
              </div>
            </div>
          )}

          {aba === 'Formato' && (
            <div className="space-y-4">
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

          {aba === 'Marca' && (
            <div className="space-y-3">
              <div className="space-y-1 text-sm">
                <span className="font-semibold">Selo pronto</span>
                <div className="flex flex-wrap gap-2" data-testid="tabloide-titulos-prontos">
                  {TITULOS_PRONTOS.map((tp) => (
                    <button key={tp} type="button" onClick={() => { tituloEditado.current = true; setTitulo(tp); setSeloUrl(null); }}
                      className={cn('rounded-md border px-3 py-1.5 text-sm', titulo.toLowerCase() === tp.toLowerCase() ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted')}>{tp}</button>
                  ))}
                </div>
              </div>
              <Campo rotulo="Título do cartaz"><Input value={titulo} onChange={(e) => { tituloEditado.current = true; setTitulo(e.target.value); }} maxLength={40} /></Campo>
              <Campo rotulo="Frase abaixo do título"><Input value={subtitulo} onChange={(e) => { tituloEditado.current = true; setSubtitulo(e.target.value); }} maxLength={60} /></Campo>
              <Campo rotulo="Validade (aparece no rodapé)"><Input value={validade} onChange={(e) => setValidade(e.target.value)} placeholder="Ex.: Ofertas válidas até 15/11 ou enquanto durarem os estoques" maxLength={90} /></Campo>
              <Campo rotulo="Nome da sua loja"><Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} maxLength={50} /></Campo>
              <div className="space-y-1 text-sm">
                <span className="font-semibold">Selo do título</span>
                <p className="text-xs text-muted-foreground">O selo 3D é criado sozinho a partir do título. Se você tem um selo seu (PNG com fundo transparente, com licença de uso), pode enviar.</p>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted" data-testid="tabloide-enviar-selo">
                    {enviandoSelo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar meu selo (PNG)
                    <input type="file" accept="image/png,image/webp" className="hidden" onChange={(e) => enviarSelo(e.target.files?.[0])} />
                  </label>
                  {seloUrl && <Button type="button" variant="ghost" size="sm" onClick={() => setSeloUrl(null)}>Voltar ao selo 3D automático</Button>}
                </div>
              </div>
              {logoUrl && (
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mostrarLogo} onChange={(e) => setMostrarLogo(e.target.checked)} /> Mostrar a minha logo no cartaz</label>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div ref={palco} className="w-full" data-testid="tabloide-palco">
            <div className="overflow-hidden rounded-xl border bg-black/40 shadow-lg" style={{ width: formato.largura * escala, height: formato.altura * escala, maxWidth: '100%' }}>
              <div style={{ width: formato.largura, height: formato.altura, transform: `scale(${escala})`, transformOrigin: 'top left' }}>
                <TabloideCanvas {...propsDaPagina(paginaAtual)} />
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
            <Button variant="secondary" onClick={enviarParaMidias} disabled={ocupado !== null || !produtos.length} data-testid="tabloide-enviar">
              {ocupado === 'enviar' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />} {contexto === 'portal' ? 'Enviar para minhas mídias' : 'Enviar para a biblioteca de mídias'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">As fotos são ilustrativas: foto real do produto quando existe (catálogo da sua conta e Open Food Facts), banco de imagens para frescos e, quando não há foto real, imagem criada por IA (produto genérico, sem marca). Clique na foto para trocar, criar com IA ou enviar a sua.</p>
        </div>
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
        <div className="flex gap-2">
          <Input value={termo} onChange={(e) => setTermo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar(termo)} aria-label="Buscar outra foto" />
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
