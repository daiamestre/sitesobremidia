/**
 * Tabloide Digital (F-178) — galeria "Logo do Cabeçalho".
 * Mostra só as logos cadastradas e aprovadas no catálogo (nada de opção sem arquivo fingindo ser logo). Escolher atualiza o
 * cabeçalho do cartaz na hora; "Confirmar" fecha a escolha e "Desfazer" volta à anterior. O fundo quadriculado existe só aqui
 * na tela, para mostrar a transparência: nunca entra na imagem do cartaz.
 * Cadastrar/arquivar logos é só da central; escolher é de qualquer usuário do editor.
 */
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Archive, Check, Loader2, Sparkles, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  LICENCA_UPLOAD, ehCentral, arquivarSelo, gerarMiniaturaPng, logosDoCabecalho, registrarSelo, validarArquivoDeSelo, type Selo,
} from '@/lib/tabloide/selos';

const QUADRICULADO = { backgroundColor: '#e5e7eb', backgroundImage: 'linear-gradient(45deg,#cbd5e1 25%,transparent 25%,transparent 75%,#cbd5e1 75%),linear-gradient(45deg,#cbd5e1 25%,transparent 25%,transparent 75%,#cbd5e1 75%)', backgroundSize: '16px 16px', backgroundPosition: '0 0,8px 8px' } as const;

export interface GaleriaLogoCabecalhoProps {
  selos: Selo[] | null;
  /** Logo em uso no cabeçalho (null = cabeçalho automático pelo título). */
  escolhidaId: string | null;
  /** A escolha ainda não foi confirmada (dá para desfazer). */
  pendente: boolean;
  usuarioId: string | undefined;
  aoEscolher: (id: string | null) => void;
  aoConfirmar: () => void;
  aoDesfazer: () => void;
  aoRecarregar: () => Promise<void> | void;
}

export function GaleriaLogoCabecalho(p: GaleriaLogoCabecalhoProps) {
  const logos = logosDoCabecalho(p.selos);
  const escolhida = logos.find((l) => l.id === p.escolhidaId) ?? null;
  const [central, setCentral] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [nomeNovo, setNomeNovo] = useState('');

  useEffect(() => { void ehCentral().then(setCentral).catch(() => setCentral(false)); }, []);

  const cadastrar = async (arq: File | undefined) => {
    if (!arq || !p.usuarioId) return;
    if (arq.type !== 'image/png') { toast.error('A logo precisa ser um PNG com fundo transparente.'); return; }
    if (arq.size > 12 * 1024 * 1024) { toast.error('O arquivo tem mais de 12 MB.'); return; }
    const nome = nomeNovo.trim() || arq.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60);
    setEnviando(true);
    try {
      const { largura, altura, alfa } = await validarArquivoDeSelo(arq);
      if (!alfa.transparente) {
        toast.error('Este PNG não tem fundo transparente de verdade (o quadriculado pode fazer parte da imagem). Ele não foi cadastrado.');
        return;
      }
      const slug = `logo-${nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'sem-nome'}`;
      const miniatura = await gerarMiniaturaPng(arq);
      await registrarSelo({
        slug, nome, categoria: 'Logo do Cabeçalho', titulo: nome, blob: arq, largura, altura, alfa, miniatura, tipo: 'LOGO_CABECALHO', ordem: logos.length + 1,
        origem: 'Arquivo cadastrado pela central da empresa', licenca: LICENCA_UPLOAD, clienteId: null, usuarioId: p.usuarioId, origemConhecida: true,
      });
      toast.success(`Logo “${nome}” cadastrada.`);
      setNomeNovo('');
      await p.aoRecarregar();
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível cadastrar a logo.');
    } finally { setEnviando(false); }
  };

  const arquivar = async (logo: Selo) => {
    if (!confirm(`Tirar “${logo.nome}” da galeria? Tabloides que a usam voltam ao cabeçalho automático.`)) return;
    try {
      await arquivarSelo(logo.id);
      if (p.escolhidaId === logo.id) p.aoEscolher(null);
      toast.success('Logo arquivada.');
      await p.aoRecarregar();
    } catch (e) {
      toast.error((e as Error).message || 'Não foi possível arquivar.');
    }
  };

  return (
    <div className="space-y-3" data-testid="galeria-logo-cabecalho">
      <div>
        <p className="text-sm font-semibold">Logo do cabeçalho</p>
        <p className="text-xs text-muted-foreground">Toque numa logo para ver no cabeçalho do cartaz. A arte não é alterada: só entra no tamanho do cabeçalho, sem distorcer.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3" role="listbox" aria-label="Logos do cabeçalho">
        <button type="button" role="option" aria-selected={!p.escolhidaId} onClick={() => p.aoEscolher(null)} data-testid="logo-automatico"
          className={cn('relative flex min-h-[132px] flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed p-2 text-center transition-colors', !p.escolhidaId ? 'border-primary bg-primary/10' : 'hover:bg-muted')}>
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="text-xs font-semibold">Automático</span>
          <span className="text-[10px] leading-tight text-muted-foreground">selo criado com o título do cartaz</span>
          {!p.escolhidaId && <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>}
        </button>

        {p.selos === null ? (
          <div className="col-span-1 flex min-h-[132px] items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-1 h-4 w-4 animate-spin" /> Carregando…</div>
        ) : logos.map((l) => {
          const ativa = l.id === p.escolhidaId;
          return (
            <div key={l.id} className="relative">
              <button type="button" role="option" aria-selected={ativa} onClick={() => p.aoEscolher(l.id)} data-testid={`logo-${l.slug}`}
                className={cn('w-full overflow-hidden rounded-lg border-2 text-left transition-transform hover:scale-[1.02]', ativa ? 'border-primary shadow-[0_0_0_2px_hsl(var(--primary)/.35)]' : 'border-transparent')}>
                <div style={QUADRICULADO} className="flex h-24 items-center justify-center p-1.5">
                  <img src={l.miniatura_url || l.imagem_url} alt={`Logo ${l.nome}`} loading="lazy" crossOrigin="anonymous" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" data-testid="logo-imagem" />
                </div>
                <div className="flex items-center justify-between gap-1 bg-muted/50 px-1.5 py-1">
                  <span className="truncate text-[11px] font-semibold">{l.nome}</span>
                  <span className={cn('shrink-0 text-[10px]', ativa ? 'font-bold text-primary' : 'text-muted-foreground')}>{ativa ? 'Selecionada' : 'Escolher'}</span>
                </div>
              </button>
              {ativa && <span className="pointer-events-none absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="h-3 w-3" /></span>}
              {central && (
                <button type="button" onClick={() => arquivar(l)} aria-label={`Arquivar ${l.nome}`} title="Tirar da galeria (central)" data-testid={`logo-arquivar-${l.slug}`}
                  className="absolute bottom-7 right-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"><Archive className="h-3 w-3" /></button>
              )}
            </div>
          );
        })}
      </div>

      {p.selos !== null && logos.length === 0 && (
        <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground" data-testid="logos-vazio">Ainda não há logos cadastradas. O cabeçalho automático continua funcionando.</p>
      )}

      {p.pendente && (
        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-3" data-testid="logo-confirmacao">
          <p className="text-sm">Logo escolhida: <b>{escolhida?.nome ?? 'Automático'}</b></p>
          <div className="flex gap-2">
            <Button size="sm" onClick={p.aoConfirmar} data-testid="logo-confirmar"><Check className="mr-1 h-4 w-4" /> Confirmar escolha</Button>
            <Button size="sm" variant="ghost" onClick={p.aoDesfazer} data-testid="logo-desfazer">Desfazer</Button>
          </div>
          <p className="text-[11px] text-muted-foreground">A escolha vale para o tabloide ao salvar o rascunho.</p>
        </div>
      )}

      {central && (
        <div className="space-y-2 border-t pt-3" data-testid="logo-cadastro">
          <p className="text-xs text-muted-foreground">Central: para incluir uma nova logo na galeria envie o PNG com fundo transparente. A transparência é conferida na hora; arquivo com fundo ou quadriculado desenhado é recusado.</p>
          <Input value={nomeNovo} onChange={(e) => setNomeNovo(e.target.value)} placeholder="Nome da logo (ex.: Super Oferta)" maxLength={60} aria-label="Nome da nova logo" />
          <label className="inline-flex h-9 cursor-pointer items-center gap-1 rounded-md border px-3 text-sm hover:bg-muted" data-testid="logo-enviar">
            {enviando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Cadastrar logo (PNG)
            <input type="file" accept="image/png" className="hidden" onChange={(e) => { void cadastrar(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
      )}
    </div>
  );
}
