import { Copy, Eye, Film, Folder, FolderInput, ImageIcon, ListPlus, Monitor, MoreVertical, Music, Pencil, Play, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { duracaoCurta, ROTULO_TIPO, type MidiaBiblioteca } from '@/lib/biblioteca';

export interface AcoesAdminMidia {
  onEditar: (m: MidiaBiblioteca) => void;
  onMover: (m: MidiaBiblioteca) => void;
  onDuplicar: (m: MidiaBiblioteca) => void;
  onExcluir: (m: MidiaBiblioteca) => void;
}

/** Cartão de mídia da Biblioteca: as ações pertencem à mídia (não à pasta). */
export function MidiaBibliotecaCard({ midia, mostrarPasta, onPreview, onPlaylist, onTela, admin }: {
  midia: MidiaBiblioteca;
  mostrarPasta?: boolean;
  onPreview: (m: MidiaBiblioteca) => void;
  onPlaylist: (m: MidiaBiblioteca) => void;
  onTela: (m: MidiaBiblioteca) => void;
  admin?: AcoesAdminMidia | null;
}) {
  const capa = midia.thumbnail_url || (midia.file_type === 'image' ? midia.file_url : null);
  const duracao = duracaoCurta(midia.duration_ms);
  const IconeTipo = midia.file_type === 'video' ? Film : midia.file_type === 'audio' ? Music : ImageIcon;
  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md" data-testid="midia-biblioteca-card">
      <button type="button" onClick={() => onPreview(midia)} className="relative aspect-video w-full overflow-hidden bg-black" aria-label={`Pré-visualizar ${midia.nome}`}>
        {capa ? (
          <img src={capa} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 to-zinc-950">
            <IconeTipo className="h-10 w-10 text-white/50" />
          </div>
        )}
        {midia.file_type !== 'image' && (
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/75 px-2 py-0.5 text-xs font-semibold text-white">
            <Play className="h-3 w-3 fill-current" /> {duracao ?? ROTULO_TIPO[midia.file_type] ?? ''}
          </span>
        )}
      </button>
      <div className="flex flex-1 flex-col gap-3 p-3">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 text-sm font-semibold leading-snug" title={midia.nome}>{midia.nome}</p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
              {mostrarPasta ? <><Folder className="h-3 w-3 flex-shrink-0" /> {midia.pasta_nome}</> : (ROTULO_TIPO[midia.file_type] ?? midia.file_type)}
            </p>
          </div>
          {admin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="-mr-1 -mt-1 h-8 w-8 flex-shrink-0" aria-label="Mais ações">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => admin.onEditar(midia)}><Pencil className="mr-2 h-4 w-4" /> Editar</DropdownMenuItem>
                <DropdownMenuItem onClick={() => admin.onMover(midia)}><FolderInput className="mr-2 h-4 w-4" /> Mover</DropdownMenuItem>
                <DropdownMenuItem onClick={() => admin.onDuplicar(midia)}><Copy className="mr-2 h-4 w-4" /> Duplicar em outra pasta</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => admin.onExcluir(midia)} className="text-destructive focus:text-destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {midia.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {midia.tags.slice(0, 4).map((t) => <span key={t} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">#{t}</span>)}
          </div>
        )}
        <div className="mt-auto grid gap-1.5">
          <Button variant="outline" size="sm" onClick={() => onPreview(midia)} className="justify-start"><Eye className="mr-2 h-4 w-4" /> Preview</Button>
          <Button size="sm" onClick={() => onPlaylist(midia)} className="justify-start"><ListPlus className="mr-2 h-4 w-4" /> Adicionar à Playlist</Button>
          <Button variant="secondary" size="sm" onClick={() => onTela(midia)} className="justify-start"><Monitor className="mr-2 h-4 w-4" /> Adicionar à Tela</Button>
        </div>
      </div>
    </div>
  );
}
