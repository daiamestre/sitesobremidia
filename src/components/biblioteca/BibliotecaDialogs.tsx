import { useEffect, useState } from 'react';
import { Folder, Loader2, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  excluirMidiaDefinitivo, excluirPastaDefinitivo, lixeira as carregarLixeira, restaurarMidia, restaurarPasta,
  type LixeiraBiblioteca, type MidiaBiblioteca, type PastaBiblioteca,
} from '@/lib/biblioteca';

/** Mesma regra do banco (fn_biblioteca_nome_valido) — o banco confere de novo. */
export function erroNomePasta(nome: string): string | null {
  const v = nome.trim().replace(/\s+/g, ' ');
  if (!v) return 'Informe o nome da pasta.';
  if (v.length > 80) return 'Use até 80 caracteres.';
  if (/[\\/<>:"|?*\u0000-\u001f]/.test(v)) return 'Não use \\ / < > : " | ? *';
  return null;
}

export function PastaNomeDialog({ open, onOpenChange, titulo, rotulo, inicial, onConfirmar }: {
  open: boolean; onOpenChange: (v: boolean) => void; titulo: string; rotulo: string; inicial?: string;
  onConfirmar: (nome: string) => Promise<void>;
}) {
  const [nome, setNome] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [tocado, setTocado] = useState(false);
  useEffect(() => { if (open) { setNome(inicial ?? ''); setTocado(false); } }, [open, inicial]);
  const erro = erroNomePasta(nome);
  const salvar = async () => {
    setTocado(true);
    if (erro) return;
    setSalvando(true);
    try { await onConfirmar(nome.trim()); onOpenChange(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível salvar'); }
    finally { setSalvando(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); salvar(); }} className="space-y-2">
          <Label htmlFor="nome-pasta">Nome da pasta</Label>
          <Input id="nome-pasta" autoFocus value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} onBlur={() => setTocado(true)} placeholder="Ex.: Vídeos Esporte" data-testid="nome-pasta" />
          {tocado && erro && <p className="text-xs text-destructive">{erro}</p>}
          <DialogFooter className="gap-2 pt-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={salvando} data-testid="confirmar-pasta">{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{rotulo}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PreviewDialog({ midia, onOpenChange }: { midia: MidiaBiblioteca | null; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={!!midia} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{midia?.nome}</DialogTitle>
          <DialogDescription className="flex items-center gap-1"><Folder className="h-3.5 w-3.5" /> {midia?.pasta_nome}</DialogDescription>
        </DialogHeader>
        {midia && (
          <div className="overflow-hidden rounded-lg bg-black">
            {midia.file_type === 'video' && <video src={midia.file_url} poster={midia.thumbnail_url ?? undefined} controls autoPlay muted playsInline className="max-h-[70vh] w-full" />}
            {midia.file_type === 'image' && <img src={midia.file_url} alt={midia.nome} className="max-h-[70vh] w-full object-contain" />}
            {midia.file_type === 'audio' && <audio src={midia.file_url} controls autoPlay className="w-full p-6" />}
          </div>
        )}
        {midia?.descricao && <p className="text-sm text-muted-foreground">{midia.descricao}</p>}
      </DialogContent>
    </Dialog>
  );
}

export function EditarMidiaDialog({ midia, onOpenChange, onSalvar }: {
  midia: MidiaBiblioteca | null; onOpenChange: (v: boolean) => void;
  onSalvar: (titulo: string, descricao: string, tags: string[]) => Promise<void>;
}) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [tags, setTags] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (midia) { setTitulo(midia.nome); setDescricao(midia.descricao ?? ''); setTags(midia.tags.join(', ')); } }, [midia]);
  const salvar = async () => {
    if (!titulo.trim()) { toast.error('Informe o título da mídia.'); return; }
    setSalvando(true);
    try { await onSalvar(titulo.trim(), descricao, tags.split(',').map((t) => t.trim()).filter(Boolean)); onOpenChange(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível salvar'); }
    finally { setSalvando(false); }
  };
  return (
    <Dialog open={!!midia} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Editar mídia</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Título</Label><Input value={titulo} maxLength={200} onChange={(e) => setTitulo(e.target.value)} /></div>
          <div><Label>Descrição</Label><Textarea rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} /></div>
          <div><Label>Tags (separadas por vírgula)</Label><Input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="futebol, gol" /></div>
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Escolher a pasta de destino (Mover / Duplicar mídia). */
export function EscolherPastaDialog({ aberto, titulo, pastas, excluirId, onOpenChange, onEscolher }: {
  aberto: boolean; titulo: string; pastas: PastaBiblioteca[]; excluirId?: string;
  onOpenChange: (v: boolean) => void; onEscolher: (pastaId: string) => Promise<void>;
}) {
  const [salvando, setSalvando] = useState<string | null>(null);
  const escolher = async (id: string) => {
    setSalvando(id);
    try { await onEscolher(id); onOpenChange(false); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível concluir'); }
    finally { setSalvando(null); }
  };
  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{titulo}</DialogTitle><DialogDescription>Escolha a pasta de destino.</DialogDescription></DialogHeader>
        <div className="max-h-80 space-y-1 overflow-y-auto">
          {pastas.filter((p) => p.id !== excluirId).map((p) => (
            <button key={p.id} type="button" disabled={!!salvando} onClick={() => escolher(p.id)}
              className="flex w-full items-center gap-3 rounded-lg border border-border p-3 text-left hover:bg-muted/60 disabled:opacity-60">
              <Folder className="h-4 w-4 text-primary" />
              <span className="flex-1 truncate text-sm font-medium">{p.nome}</span>
              {salvando === p.id && <Loader2 className="h-4 w-4 animate-spin" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ConfirmarDialog({ aberto, titulo, texto, rotulo, destrutivo, onOpenChange, onConfirmar }: {
  aberto: boolean; titulo: string; texto: string; rotulo: string; destrutivo?: boolean;
  onOpenChange: (v: boolean) => void; onConfirmar: () => Promise<void>;
}) {
  const [executando, setExecutando] = useState(false);
  return (
    <AlertDialog open={aberto} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader><AlertDialogTitle>{titulo}</AlertDialogTitle><AlertDialogDescription>{texto}</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={executando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={executando} className={destrutivo ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
            onClick={async (e) => {
              e.preventDefault(); setExecutando(true);
              try { await onConfirmar(); onOpenChange(false); }
              catch (err) { toast.error(err instanceof Error ? err.message : 'Não foi possível concluir'); }
              finally { setExecutando(false); }
            }}>
            {executando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{rotulo}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Lixeira da Biblioteca (Owner/ADM): restaurar ou excluir de vez. Mídia em uso numa playlist é preservada. */
export function LixeiraDialog({ aberto, onOpenChange, onMudou }: { aberto: boolean; onOpenChange: (v: boolean) => void; onMudou: () => void }) {
  const [dados, setDados] = useState<LixeiraBiblioteca | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<{ tipo: 'pasta' | 'midia'; id: string; nome: string } | null>(null);
  const recarregar = () => carregarLixeira().then(setDados).catch((e) => toast.error(e instanceof Error ? e.message : 'Erro ao abrir a Lixeira'));
  useEffect(() => { if (aberto) { setDados(null); recarregar(); } }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  const executar = async (chave: string, acao: () => Promise<unknown>, ok: string) => {
    setOcupado(chave);
    try { await acao(); toast.success(ok); await recarregar(); onMudou(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível concluir'); }
    finally { setOcupado(null); }
  };
  const avisoPurga = (r: { preservadas_em_uso: number }) => {
    if (r.preservadas_em_uso > 0) toast.info(`${r.preservadas_em_uso} mídia(s) continuam nas playlists que já as usam (preservadas).`);
  };

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trash2 className="h-5 w-5" /> Lixeira da Biblioteca</DialogTitle>
          <DialogDescription>Itens excluídos ficam aqui até serem restaurados ou excluídos definitivamente. Mídia já usada em playlists nunca some das telas.</DialogDescription>
        </DialogHeader>
        {!dados && <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>}
        {dados && (
          <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1" data-testid="lixeira">
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pastas ({dados.pastas.length})</p>
              {dados.pastas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma pasta na Lixeira.</p>}
              {dados.pastas.map((p) => (
                <div key={p.id} className="flex items-center gap-3 border-b border-border py-2 last:border-0">
                  <Folder className="h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p.nome}</p><p className="text-xs text-muted-foreground">{p.total} mídia(s)</p></div>
                  <Button size="sm" variant="outline" disabled={!!ocupado} onClick={() => executar(`p${p.id}`, () => restaurarPasta(p.id), `Pasta "${p.nome}" restaurada`)}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restaurar</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={!!ocupado} onClick={() => setConfirmar({ tipo: 'pasta', id: p.id, nome: p.nome })}>Excluir de vez</Button>
                </div>
              ))}
            </section>
            <section>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mídias ({dados.midias.length})</p>
              {dados.midias.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma mídia na Lixeira.</p>}
              {dados.midias.map((m) => (
                <div key={m.item_id} className="flex items-center gap-3 border-b border-border py-2 last:border-0">
                  <div className="h-10 w-16 flex-shrink-0 overflow-hidden rounded bg-black">
                    {(m.thumbnail_url || m.file_type === 'image') && <img src={m.thumbnail_url || m.file_url} alt="" className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{m.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">{m.pasta_nome}{m.pasta_na_lixeira ? ' (pasta na Lixeira)' : ''}{m.usos > 0 ? ` · em ${m.usos} playlist(s)` : ''}</p>
                  </div>
                  <Button size="sm" variant="outline" disabled={!!ocupado || m.pasta_na_lixeira} title={m.pasta_na_lixeira ? 'Restaure a pasta primeiro' : undefined}
                    onClick={() => executar(`m${m.item_id}`, () => restaurarMidia(m.item_id), `"${m.nome}" restaurada`)}>
                    <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restaurar</Button>
                  <Button size="sm" variant="ghost" className="text-destructive" disabled={!!ocupado} onClick={() => setConfirmar({ tipo: 'midia', id: m.item_id, nome: m.nome })}>Excluir de vez</Button>
                </div>
              ))}
            </section>
          </div>
        )}
        <ConfirmarDialog
          aberto={!!confirmar} onOpenChange={(v) => !v && setConfirmar(null)} destrutivo rotulo="Excluir definitivamente"
          titulo={`Excluir "${confirmar?.nome}" de vez?`}
          texto={confirmar?.tipo === 'pasta'
            ? 'A pasta e as referências dela serão apagadas. Arquivos que não estão em nenhuma outra pasta nem playlist também serão removidos do armazenamento.'
            : 'A mídia sai da Biblioteca. Se ela estiver em alguma playlist, continua tocando nas telas (é preservada).'}
          onConfirmar={async () => {
            if (!confirmar) return;
            const alvo = confirmar;
            await executar(`x${alvo.id}`, async () => {
              const r = alvo.tipo === 'pasta' ? await excluirPastaDefinitivo(alvo.id) : await excluirMidiaDefinitivo(alvo.id);
              avisoPurga(r);
            }, 'Excluído definitivamente');
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
