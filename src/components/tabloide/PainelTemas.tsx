/**
 * Cartaz Digital (F-179) — painel "Temas": um lugar só para tudo que muda a cara do cartaz.
 *  1. Logo 3D do cabeçalho (a mesma galeria serve para pôr no cabeçalho ou soltar em qualquer ponto do cartaz);
 *  2. Cores do cartaz, por tipo de comércio;
 *  3. Temas (fotos de fundo): "Meus temas", "Temas Grátis" e uma seção por data comemorativa — as seções já existem
 *     vazias e recebem os temas conforme são enviados.
 * Toda imagem enviada é aceita e fica salva na hora. O tema entra na faixa do cabeçalho (como nos encartes) ou no cartaz inteiro.
 */
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Archive, Check, Copy, Loader2, Move, Plus, Search, Trash2, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { ConfigCartaz } from '@/lib/tabloide/cartaz';
import { proximasDatas, rotuloDaData } from '@/lib/tabloide/datas';
import {
  arquivarSelo, enviarParaBiblioteca, GRUPO_MEUS_TEMAS, GRUPO_TEMAS_GRATIS, logosDoCabecalho, resolverImagem, temasDeFoto,
  type ElementoLivre, type Selo, type TipoDeImagem,
} from '@/lib/tabloide/selos';
import { SEGMENTOS, TEMAS, temaPorId, temasDoSegmento, type SegmentoId } from '@/lib/tabloide/temas';

export interface PainelTemasProps {
  selos: Selo[] | null;
  central: boolean;
  usuarioId?: string;
  clienteId: string | null;
  cfg: ConfigCartaz;
  mudar: (m: Partial<ConfigCartaz>) => void;
  segmentoId: SegmentoId;
  temaId: string;
  aoSegmento: (id: SegmentoId) => void;
  aoTema: (id: string) => void;
  /** aplica as cores, o título e a frase de uma data comemorativa */
  aoData: (temaId: string, titulo: string, frase: string) => void;
  aoRecarregar: () => Promise<void>;
  aoSoltar: (selo: Selo) => void;
  selecionadoId: string | null;
  aoSelecionar: (id: string | null) => void;
  aoAtualizarElemento: (id: string, m: Partial<ElementoLivre>) => void;
  aoDuplicarElemento: (id: string) => void;
  aoExcluirElemento: (id: string) => void;
}

const XADREZ = 'repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%) 50% / 16px 16px';
const semAcento = (t: string) => t.normalize('NFD').replace(/[^\w\s-]/g, '').toLowerCase();

/** Botão de envio: escolhe a imagem e ela já entra na biblioteca. */
function Enviar({ rotulo, tipo, categoria, daEmpresa, usuarioId, clienteId, aoPronto, testid, className }: {
  rotulo: string; tipo: TipoDeImagem; categoria: string; daEmpresa: boolean; usuarioId?: string; clienteId: string | null;
  aoPronto: (s: Selo) => void | Promise<void>; testid: string; className?: string;
}) {
  const [enviando, setEnviando] = useState(false);
  const enviar = async (arq: File | undefined) => {
    if (!arq) return;
    if (!usuarioId) { toast.error('Sessão expirada. Entre novamente.'); return; }
    setEnviando(true);
    try {
      const nome = arq.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').trim() || 'Imagem';
      const salvo = await enviarParaBiblioteca({ arquivo: arq, nome, tipo, categoria, usuarioId, clienteId, daEmpresa });
      await aoPronto(salvo);
      toast.success(tipo === 'TEMA' ? 'Tema adicionado e salvo.' : 'Logo adicionada e salva.');
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível enviar a imagem.');
    } finally { setEnviando(false); }
  };
  return (
    <label data-testid={testid} className={cn('flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-primary/50 p-2 text-center text-[11px] font-semibold text-primary hover:bg-primary/5', className)}>
      {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
      <span className="leading-tight">{enviando ? 'Enviando…' : rotulo}</span>
      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={enviando} onChange={(e) => { void enviar(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}

function CoresMiniatura({ id, ativo, aoEscolher, rotulo }: { id: string; ativo: boolean; aoEscolher: () => void; rotulo?: string }) {
  const t = temaPorId(id);
  return (
    <button type="button" onClick={aoEscolher} data-testid={`tabloide-tema-${id}`} aria-pressed={ativo}
      className={cn('overflow-hidden rounded-lg border-2 text-left transition-transform hover:scale-[1.03]', ativo ? 'border-primary' : 'border-transparent')}>
      <div style={{ background: t.fundo }} className="h-14 p-1.5">
        <div style={{ background: t.faixa }} className="h-3 rounded" />
        <div className="mt-1 flex justify-center gap-1">
          <div style={{ background: t.cartao, borderColor: t.cartaoBorda }} className="h-5 w-6 rounded-sm border" />
          <div style={{ background: t.cartao, borderColor: t.cartaoBorda }} className="h-5 w-6 rounded-sm border" />
        </div>
      </div>
      <div className="truncate bg-muted/50 px-1.5 py-1 text-[11px] font-semibold">{rotulo ?? t.nome}</div>
    </button>
  );
}

export function PainelTemas(p: PainelTemasProps) {
  const { selos, central, usuarioId, clienteId, cfg, mudar } = p;
  const [busca, setBusca] = useState('');
  const [paraEmpresa, setParaEmpresa] = useState(true);
  const q = semAcento(busca.trim());
  const bate = (texto: string) => !q || semAcento(texto).includes(q);

  const logos = useMemo(() => logosDoCabecalho(selos), [selos]);
  const temas = useMemo(() => temasDeFoto(selos), [selos]);
  const datas = useMemo(() => proximasDatas(), []);
  const logoAtual = resolverImagem(selos, cfg.logoCabecalhoId, 'LOGO_CABECALHO');
  const temaAtual = resolverImagem(selos, cfg.temaFotoId, 'TEMA');
  const podeGerir = (s: Selo) => (s.dono_id ? s.dono_id === usuarioId : central);

  const arquivar = async (s: Selo) => {
    if (!confirm(`Tirar "${s.nome}" da biblioteca? Os cartazes já prontos não mudam.`)) return;
    try {
      await arquivarSelo(s.id);
      if (cfg.logoCabecalhoId === s.id) mudar({ logoCabecalhoId: null });
      if (cfg.temaFotoId === s.id) mudar({ temaFotoId: null });
      await p.aoRecarregar();
    } catch { toast.error('Não foi possível tirar a imagem.'); }
  };

  const usarNoCabecalho = (s: Selo) => mudar({ logoCabecalhoId: s.id, seloUrl: null, cabecalhoEmTexto: false });
  const selecionado = cfg.elementos.find((e) => e.id === p.selecionadoId) ?? null;

  /** Uma seção de temas (fotos de fundo): sempre aparece, mesmo vazia. */
  const secao = (titulo: string, categoria: string, opcoes: { podeEnviar: boolean; daEmpresa: boolean; legenda?: string; antes?: React.ReactNode }) => {
    const itens = temas.filter((t) => t.categoria === categoria && bate(`${t.nome} ${categoria}`));
    if (q && !itens.length && !bate(titulo)) return null;
    const vazios = Math.max(0, 2 - itens.length - (opcoes.antes ? 1 : 0));
    return (
      <section key={categoria} data-testid="secao-de-temas" data-categoria={categoria}>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">{titulo}</h3>
          {opcoes.legenda && <span className="text-[11px] text-muted-foreground">{opcoes.legenda}</span>}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {opcoes.antes}
          {itens.map((t) => (
            <div key={t.id} className="group relative">
              <button type="button" onClick={() => mudar({ temaFotoId: cfg.temaFotoId === t.id ? null : t.id })} data-testid="tema-foto" aria-pressed={cfg.temaFotoId === t.id} title={t.nome}
                className={cn('block w-full overflow-hidden rounded-lg border-2', cfg.temaFotoId === t.id ? 'border-primary' : 'border-transparent hover:border-primary/40')}>
                <img src={t.miniatura_url || t.imagem_url} alt={t.nome} loading="lazy" className="h-16 w-full object-cover" />
                <span className="block truncate bg-muted/50 px-1.5 py-1 text-left text-[11px] font-semibold">{t.nome}</span>
              </button>
              {podeGerir(t) && (
                <button type="button" onClick={() => arquivar(t)} aria-label={`Tirar o tema ${t.nome}`} className="absolute right-1 top-1 hidden rounded bg-black/70 p-1 text-white group-hover:block">
                  <Archive className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          {opcoes.podeEnviar && (
            <Enviar rotulo="Adicionar tema" tipo="TEMA" categoria={categoria} daEmpresa={opcoes.daEmpresa} usuarioId={usuarioId} clienteId={clienteId}
              testid="tema-adicionar" className="h-[88px]" aoPronto={async (s) => { await p.aoRecarregar(); mudar({ temaFotoId: s.id }); }} />
          )}
          {Array.from({ length: opcoes.podeEnviar ? Math.max(0, vazios - 1) : vazios }).map((_, i) => (
            <div key={`v${i}`} data-testid="tema-vazio" className="flex h-[88px] items-center justify-center rounded-lg border border-dashed text-[11px] text-muted-foreground">Em breve</div>
          ))}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-5" data-testid="painel-temas">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input aria-label="Buscar tema" placeholder="Buscar tema ou logo…" className="pl-8" value={busca} onChange={(e) => setBusca(e.target.value)} data-testid="temas-busca" />
      </div>

      {/* 1. logo 3D do cabeçalho — um caminho só */}
      <section data-testid="galeria-logos">
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold">Logo 3D do cabeçalho</h3>
          <span className="text-[11px] text-muted-foreground">{logos.length} na biblioteca</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {logos.filter((l) => bate(l.nome)).map((l) => {
            const ativa = logoAtual?.id === l.id;
            return (
              <div key={l.id} data-testid="logo-3d" data-ativa={ativa} className={cn('overflow-hidden rounded-lg border-2', ativa ? 'border-primary' : 'border-border')}>
                <button type="button" onClick={() => usarNoCabecalho(l)} aria-pressed={ativa} aria-label={`Usar ${l.nome} no cabeçalho`} className="relative block w-full" style={{ background: XADREZ }}>
                  <img src={l.miniatura_url || l.imagem_url} alt={l.nome} loading="lazy" className="h-20 w-full object-contain p-1" />
                  {ativa && <span className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground"><Check className="h-3 w-3" /></span>}
                </button>
                <div className="flex items-center gap-1 bg-muted/50 px-1.5 py-1">
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold" title={l.nome}>{l.nome}</span>
                  <button type="button" onClick={() => p.aoSoltar(l)} title="Colocar solta no cartaz (arraste para onde quiser)" aria-label={`Colocar ${l.nome} solta no cartaz`} data-testid="logo-soltar" className="rounded p-1 hover:bg-background"><Move className="h-3.5 w-3.5" /></button>
                  {podeGerir(l) && <button type="button" onClick={() => arquivar(l)} title="Tirar da biblioteca" aria-label={`Tirar ${l.nome} da biblioteca`} className="rounded p-1 hover:bg-background"><Archive className="h-3.5 w-3.5" /></button>}
                </div>
              </div>
            );
          })}
          <Enviar rotulo="Enviar minha logo 3D" tipo="LOGO_CABECALHO" categoria="Logos" daEmpresa={central && paraEmpresa} usuarioId={usuarioId} clienteId={clienteId}
            testid="logo-enviar" className="min-h-[108px]" aoPronto={async (s) => { await p.aoRecarregar(); usarNoCabecalho(s); }} />
        </div>
        {central && (
          <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={paraEmpresa} onChange={(e) => setParaEmpresa(e.target.checked)} /> O que eu enviar vale para todos os usuários da empresa
          </label>
        )}
        <div className="mt-2 space-y-1.5 rounded-lg border p-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" data-testid="cabecalho-em-texto" checked={cfg.cabecalhoEmTexto && !logoAtual} onChange={(e) => mudar(e.target.checked ? { cabecalhoEmTexto: true, logoCabecalhoId: null, seloUrl: null } : { cabecalhoEmTexto: false })} />
            <Type className="h-4 w-4" /> Usar título em texto no lugar da logo
          </label>
          <Input aria-label="Título do cartaz" placeholder="Ex.: Ofertas da Semana" maxLength={40} value={cfg.titulo} onChange={(e) => mudar({ titulo: e.target.value })} data-testid="cartaz-titulo" />
        </div>

        {cfg.elementos.length > 0 && (
          <div className="mt-2 space-y-2 rounded-lg border p-2" data-testid="camadas">
            <p className="text-xs font-semibold">Logos soltas no cartaz ({cfg.elementos.length}) — arraste na prévia</p>
            <div className="flex flex-wrap gap-1.5">
              {cfg.elementos.map((e) => (
                <button key={e.id} type="button" onClick={() => p.aoSelecionar(e.id)} aria-pressed={p.selecionadoId === e.id}
                  className={cn('h-12 w-16 overflow-hidden rounded border-2', p.selecionadoId === e.id ? 'border-primary' : 'border-border')} style={{ background: XADREZ }}>
                  <img src={e.url} alt={e.nome} className="h-full w-full object-contain" />
                </button>
              ))}
            </div>
            {selecionado && (
              <div className="space-y-1.5 text-xs">
                <label className="flex items-center gap-2">Tamanho
                  <input type="range" min={6} max={95} value={Math.round(selecionado.w * 100)} onChange={(e) => p.aoAtualizarElemento(selecionado.id, { w: Number(e.target.value) / 100 })} className="flex-1" aria-label="Tamanho da logo" />
                </label>
                <label className="flex items-center gap-2">Giro
                  <input type="range" min={-180} max={180} value={Math.round(selecionado.rot)} onChange={(e) => p.aoAtualizarElemento(selecionado.id, { rot: Number(e.target.value) })} className="flex-1" aria-label="Giro da logo" />
                </label>
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => p.aoDuplicarElemento(selecionado.id)}><Copy className="mr-1 h-3.5 w-3.5" /> Duplicar</Button>
                  <Button size="sm" variant="outline" onClick={() => p.aoExcluirElemento(selecionado.id)} data-testid="camada-excluir"><Trash2 className="mr-1 h-3.5 w-3.5" /> Tirar do cartaz</Button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* 2. cores */}
      <section data-testid="cores-do-cartaz">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">Cores do cartaz</h3>
          <select aria-label="Tipo de comércio" data-testid="tabloide-segmentos" className="h-8 rounded-md border bg-background px-2 text-xs" value={p.segmentoId} onChange={(e) => p.aoSegmento(e.target.value as SegmentoId)}>
            {SEGMENTOS.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2" data-testid="tabloide-temas">
          {temasDoSegmento(p.segmentoId).concat(TEMAS.filter((t) => t.grupo === 'mercado' && p.segmentoId !== 'mercado')).filter((t) => bate(t.nome)).map((t) => (
            <CoresMiniatura key={t.id} id={t.id} ativo={p.temaId === t.id} aoEscolher={() => p.aoTema(t.id)} />
          ))}
        </div>
      </section>

      {/* 3. temas (fotos de fundo) */}
      {temaAtual && (
        <div className="space-y-1.5 rounded-lg border border-primary/40 bg-primary/5 p-2 text-xs" data-testid="tema-em-uso">
          <div className="flex items-center justify-between gap-2">
            <span className="truncate">Tema em uso: <b>{temaAtual.nome}</b></span>
            <Button size="sm" variant="ghost" onClick={() => mudar({ temaFotoId: null })} data-testid="tema-tirar">Tirar o tema</Button>
          </div>
          <div className="flex gap-1.5">
            {([['cabecalho', 'Na faixa do cabeçalho'], ['fundo', 'No cartaz inteiro']] as const).map(([id, rotulo]) => (
              <button key={id} type="button" onClick={() => mudar({ temaModo: id })} aria-pressed={cfg.temaModo === id} data-testid={`tema-modo-${id}`}
                className={cn('flex-1 rounded-md border px-2 py-1.5 font-semibold', cfg.temaModo === id ? 'border-primary bg-primary/10' : 'bg-background hover:bg-muted')}>{rotulo}</button>
            ))}
          </div>
          <p className="text-muted-foreground">Na faixa, a arte fica de ponta a ponta no topo e os produtos vêm embaixo. A arte ideal para a faixa é larga (ex.: 1080 × 480).</p>
        </div>
      )}
      {secao(GRUPO_MEUS_TEMAS, GRUPO_MEUS_TEMAS, { podeEnviar: true, daEmpresa: false, legenda: 'só você vê' })}
      {secao(GRUPO_TEMAS_GRATIS, GRUPO_TEMAS_GRATIS, { podeEnviar: central, daEmpresa: true })}
      {datas.map(({ item, data, dias }) => secao(item.nome, item.nome, {
        podeEnviar: central, daEmpresa: true,
        legenda: `${rotuloDaData(data)} · ${dias === 0 ? 'é hoje' : dias === 1 ? 'amanhã' : `em ${dias} dias`}`,
        antes: bate(item.nome) ? <CoresMiniatura key="cores" id={item.temaId} ativo={p.temaId === item.temaId && cfg.titulo === item.titulo} aoEscolher={() => p.aoData(item.temaId, item.titulo, item.subtitulo)} rotulo="Cores da data" /> : undefined,
      }))}
    </div>
  );
}
