/**
 * Tabloide Digital (F-177) — "LOGOS DE OFERTAS 3D": biblioteca permanente de selos promocionais com transparência verdadeira.
 * Pesquisar, filtrar por categoria, ver antes, inserir no cartaz e controlar a camada (mover no cartaz, tamanho, giro,
 * duplicar, excluir). Excluir a camada NUNCA exclui o selo da biblioteca.
 */
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, Sparkles, Trash2, Upload, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  CATEGORIAS, LICENCA_UPLOAD, ORIGEM_UPLOAD, ehCentral, registrarSelo, semearBibliotecaInicial, validarArquivoDeSelo,
  type ElementoLivre, type Selo,
} from '@/lib/tabloide/selos';
import { TITULOS_PRONTOS } from '@/lib/tabloide/temas';

/** Fundo quadriculado só na tela (para ver a transparência); nunca faz parte do arquivo. */
const QUADRICULADO = { backgroundColor: '#e5e7eb', backgroundImage: 'linear-gradient(45deg,#cbd5e1 25%,transparent 25%,transparent 75%,#cbd5e1 75%),linear-gradient(45deg,#cbd5e1 25%,transparent 25%,transparent 75%,#cbd5e1 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,8px 8px' } as const;

export interface PainelSelosProps {
  contexto: 'portal' | 'painel';
  clienteId: string | null;
  usuarioId: string | undefined;
  titulo: string;
  elementos: ElementoLivre[];
  selecionadoId: string | null;
  aoInserir: (selo: Selo) => void;
  aoSelecionar: (id: string | null) => void;
  aoAtualizar: (id: string, mudanca: Partial<ElementoLivre>) => void;
  aoDuplicar: (id: string) => void;
  aoExcluir: (id: string) => void;
  aoUsarNoCabecalho: (id: string) => void;
  aoEscolherTitulo: (titulo: string) => void;
  /** Lista do catálogo (carregada pelo editor, compartilhada com a galeria de logos do cabeçalho). */
  selos: Selo[] | null;
  aoRecarregar: () => Promise<void> | void;
}

export function PainelSelos(p: PainelSelosProps) {
  const selos = p.selos;
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState('');
  const [previa, setPrevia] = useState<Selo | null>(null);
  const [central, setCentral] = useState(false);
  const [gerando, setGerando] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const carregar = async () => { await p.aoRecarregar(); };
  useEffect(() => { void ehCentral().then(setCentral).catch(() => setCentral(false)); }, []);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return (selos ?? []).filter((s) => s.tipo === 'SELO' && s.estado === 'APROVADO' && (!categoria || s.categoria === categoria) && (!q || `${s.nome} ${s.categoria}`.toLowerCase().includes(q)));
  }, [selos, busca, categoria]);
  const emRevisao = (selos ?? []).filter((s) => s.tipo === 'SELO' && s.estado !== 'APROVADO' && s.cliente_id);
  const selecionado = p.elementos.find((e) => e.id === p.selecionadoId) ?? null;

  const gerarBiblioteca = async () => {
    if (!p.usuarioId) return;
    setGerando('Preparando…');
    try {
      const r = await semearBibliotecaInicial(p.usuarioId, (feito, total, titulo) => setGerando(`Desenhando ${feito + 1}/${total}: ${titulo}`));
      toast.success(`Biblioteca pronta: ${r.aprovados} selos aprovados${r.revisao.length ? `, ${r.revisao.length} em revisão (${r.revisao.join(', ')})` : ''}.`);
      await carregar();
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível gerar a biblioteca.');
    } finally { setGerando(null); }
  };

  const enviar = async (arq: File | undefined) => {
    if (!arq || !p.usuarioId) return;
    if (arq.type !== 'image/png' && arq.type !== 'image/webp') { toast.error('Envie o selo em PNG (ou WebP) com fundo transparente.'); return; }
    if (arq.size > 6 * 1024 * 1024) { toast.error('O selo tem mais de 6 MB. Escolha um menor.'); return; }
    setEnviando(true);
    try {
      const { largura, altura, alfa } = await validarArquivoDeSelo(arq);
      const nome = arq.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60) || 'Meu selo';
      const slug = `meu-${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'selo'}-${Date.now().toString(36)}`;
      const selo = await registrarSelo({
        slug, nome, categoria: 'Meus selos', titulo: nome, blob: arq, largura, altura, alfa,
        origem: ORIGEM_UPLOAD, licenca: LICENCA_UPLOAD, clienteId: p.contexto === 'portal' ? p.clienteId : null, usuarioId: p.usuarioId, origemConhecida: false,
      });
      if (selo.estado === 'APROVADO') toast.success('Selo enviado.');
      else toast.warning(alfa.transparente ? 'Selo enviado e aguardando revisão (a origem e a licença não são verificadas).' : 'Este PNG não tem fundo transparente de verdade (o quadriculado faz parte da imagem?). Ele ficou em revisão e não vai para o cartaz.');
      await carregar();
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível enviar o selo.');
    } finally { setEnviando(false); }
  };

  return (
    <div className="space-y-4" data-testid="painel-selos">
      <div className="space-y-1">
        <p className="text-sm font-semibold">Cabeçalho automático</p>
        <p className="text-xs text-muted-foreground">O selo 3D do topo é criado sozinho com o título. Toque para trocar:</p>
        <div className="flex flex-wrap gap-2" data-testid="tabloide-titulos-prontos">
          {TITULOS_PRONTOS.map((tp) => (
            <button key={tp} type="button" onClick={() => p.aoEscolherTitulo(tp)}
              className={cn('rounded-md border px-3 py-1.5 text-sm', p.titulo.toLowerCase() === tp.toLowerCase() ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted')}>{tp}</button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Logos de ofertas 3D</p>
        <Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar: Black Friday, Liquidação…" aria-label="Pesquisar selos" data-testid="selos-busca" />
        <div className="flex flex-wrap gap-1.5" data-testid="selos-categorias">
          <button type="button" onClick={() => setCategoria('')} className={cn('rounded-full border px-2.5 py-1 text-xs', !categoria ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted')}>Todas</button>
          {CATEGORIAS.map((c) => (
            <button key={c} type="button" onClick={() => setCategoria(categoria === c ? '' : c)} className={cn('rounded-full border px-2.5 py-1 text-xs', categoria === c ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted')}>{c}</button>
          ))}
        </div>

        {selos === null ? (
          <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando a biblioteca…</p>
        ) : filtrados.length === 0 ? (
          <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground" data-testid="selos-vazio">
            {(selos ?? []).filter((s) => s.tipo === 'SELO').length === 0 ? 'A biblioteca ainda está vazia.' : 'Nenhum selo encontrado para essa pesquisa.'}
            {central && (selos ?? []).filter((s) => s.tipo === 'SELO').length === 0 && ' Use o botão abaixo para criar os 20 selos iniciais.'}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2" data-testid="selos-grade">
            {filtrados.map((s) => (
              <button key={s.id} type="button" onClick={() => setPrevia(s)} data-testid={`selo-${s.slug}`}
                className={cn('overflow-hidden rounded-lg border-2 text-left transition-transform hover:scale-[1.02]', previa?.id === s.id ? 'border-primary' : 'border-transparent')}>
                <div style={QUADRICULADO} className="flex h-20 items-center justify-center p-1">
                  <img src={s.imagem_url} alt={s.nome} loading="lazy" crossOrigin="anonymous" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
                </div>
                <div className="truncate bg-muted/50 px-1.5 py-1 text-[11px] font-semibold">{s.nome}</div>
              </button>
            ))}
          </div>
        )}

        {previa && (
          <div className="space-y-2 rounded-lg border bg-background/60 p-3" data-testid="selo-previa">
            <div style={QUADRICULADO} className="flex h-36 items-center justify-center rounded-md p-2">
              <img src={previa.imagem_url} alt={previa.nome} crossOrigin="anonymous" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
            </div>
            <p className="text-sm font-semibold">{previa.nome}</p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {previa.categoria} · {previa.largura}×{previa.altura} · versão {previa.versao} · {previa.transparente ? 'transparência validada' : 'transparência NÃO validada'}<br />
              Origem: {previa.origem}{previa.licenca ? ` · ${previa.licenca}` : ''}
            </p>
            <Button className="w-full" onClick={() => { p.aoInserir(previa); toast.success('Selo colocado no cartaz. Arraste para mover.'); }} data-testid="selo-inserir">
              <Wand2 className="mr-1 h-4 w-4" /> Inserir no cartaz
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <p className="text-sm font-semibold">Selos neste cartaz ({p.elementos.length})</p>
        {p.elementos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum ainda. Escolha um selo acima e toque em “Inserir no cartaz”.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5" data-testid="selos-no-cartaz">
            {p.elementos.map((e) => (
              <button key={e.id} type="button" onClick={() => p.aoSelecionar(e.id)}
                className={cn('rounded-md border px-2 py-1 text-xs', p.selecionadoId === e.id ? 'border-primary bg-primary/10 font-semibold' : 'hover:bg-muted')}>{e.nome}</button>
            ))}
          </div>
        )}
        {selecionado && (
          <div className="space-y-2 rounded-lg border bg-background/60 p-3" data-testid="selo-controles">
            <p className="text-xs text-muted-foreground">Arraste o selo no cartaz para posicionar.</p>
            <label className="block text-xs font-semibold">Tamanho ({Math.round(selecionado.w * 100)}%)
              <input type="range" min={6} max={95} value={Math.round(selecionado.w * 100)} onChange={(e) => p.aoAtualizar(selecionado.id, { w: Number(e.target.value) / 100 })} className="w-full" aria-label="Tamanho do selo" data-testid="selo-tamanho" />
            </label>
            <label className="block text-xs font-semibold">Giro ({selecionado.rot}°)
              <input type="range" min={-45} max={45} value={selecionado.rot} onChange={(e) => p.aoAtualizar(selecionado.id, { rot: Number(e.target.value) })} className="w-full" aria-label="Giro do selo" data-testid="selo-giro" />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => p.aoDuplicar(selecionado.id)} data-testid="selo-duplicar"><Copy className="mr-1 h-4 w-4" /> Duplicar</Button>
              <Button size="sm" variant="outline" onClick={() => p.aoUsarNoCabecalho(selecionado.id)} data-testid="selo-cabecalho"><Sparkles className="mr-1 h-4 w-4" /> Usar no cabeçalho</Button>
              <Button size="sm" variant="ghost" onClick={() => p.aoExcluir(selecionado.id)} data-testid="selo-excluir" aria-label="Tirar do cartaz"><Trash2 className="mr-1 h-4 w-4" /> Tirar do cartaz</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Tirar do cartaz não apaga o selo da biblioteca.</p>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t pt-3">
        <p className="text-xs text-muted-foreground">Tem um selo seu (PNG com fundo transparente)? Se tiver licença de uso, envie. A transparência é conferida na hora; a origem e a licença ficam registradas como “declarada pelo usuário”.</p>
        <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted" data-testid="tabloide-enviar-selo">
          {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Enviar meu selo (PNG)
          <input type="file" accept="image/png,image/webp" className="hidden" onChange={(e) => { void enviar(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {emRevisao.length > 0 && <p className="text-xs text-amber-500" data-testid="selos-em-revisao">{emRevisao.length} selo(s) seu(s) em revisão: {emRevisao.map((s) => s.nome).join(', ')}.</p>}
        {central && (
          <div className="space-y-1">
            <Button size="sm" variant="secondary" onClick={gerarBiblioteca} disabled={!!gerando} data-testid="selos-gerar">
              {gerando ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} {(selos ?? []).some((s) => s.tipo === 'SELO') ? 'Redesenhar os selos da empresa' : 'Criar os 20 selos iniciais'}
            </Button>
            {gerando && <p className="text-xs text-primary">{gerando}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
