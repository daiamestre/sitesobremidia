import { useState } from 'react';
import { Camera, Loader2, Monitor, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** F-109 — Cada tela do ponto parceiro, cadastrada pelo representante (ou OWNER/ADMIN/gestor). */
export interface TelaDoPonto {
  local: string;
  detalhe: string;
  orientacao: 'horizontal' | 'vertical';
  polegadas: string;
  valor: string;
  foto_url: string;
}

export const telaVazia = (): TelaDoPonto => ({ local: '', detalhe: '', orientacao: 'horizontal', polegadas: '', valor: '', foto_url: '' });

const numero = (v: string) => Number(String(v).replace(/\./g, '').replace(',', '.'));

/** Mensagem de erro (ou null) — local, foto e valor são obrigatórios em cada tela. */
export function validarTelas(telas: TelaDoPonto[]): string | null {
  if (!telas.length) return 'Cadastre ao menos uma tela do ponto.';
  for (let i = 0; i < telas.length; i++) {
    const t = telas[i];
    if (t.local.trim().length < 2) return `Tela ${i + 1}: informe onde a tela fica (ex.: balcão, caixa, entrada).`;
    if (!t.foto_url) return `Tela ${i + 1}: tire ou envie a foto da tela instalada.`;
    // F-119: R$ 0,00 = tela grátis (o anunciante coloca a mídia sem pagar); o campo não pode ficar vazio
    if (!String(t.valor).trim() || !(numero(t.valor) >= 0)) return `Tela ${i + 1}: informe o valor para anunciar nesta tela (R$ 0,00 = grátis).`;
  }
  return null;
}

export const telasParaEnvio = (telas: TelaDoPonto[]) => telas.map((t) => ({
  local: t.local.trim(), detalhe: t.detalhe.trim() || null, orientacao: t.orientacao,
  polegadas: t.polegadas ? Number(t.polegadas) : null, valor: numero(t.valor), foto_url: t.foto_url,
}));

export function TelasDoPontoEditor({ telas, onChange, enviarFoto }: {
  telas: TelaDoPonto[];
  onChange: (t: TelaDoPonto[]) => void;
  /** envia a imagem e devolve o endereço público */
  enviarFoto: (arquivo: File) => Promise<string | null>;
}) {
  const [enviando, setEnviando] = useState<number | null>(null);
  const mudar = (i: number, campo: keyof TelaDoPonto, valor: string) =>
    onChange(telas.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)));

  return (
    <div className="space-y-3" data-testid="telas-do-ponto">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold text-white">Telas do ponto ({telas.length})</Label>
        <Button type="button" size="sm" variant="outline" className="gap-1 rounded-xl border-white/10 text-slate-200"
          onClick={() => onChange([...telas, telaVazia()])}>
          <Plus className="h-4 w-4" /> Adicionar tela
        </Button>
      </div>
      <p className="text-xs text-slate-400">Para cada tela: onde ela fica, a foto dela instalada e o valor para anunciar. Valor R$ 0,00 deixa a tela grátis para os anunciantes. O sistema cria a tela parceira ao finalizar o cadastro.</p>

      {telas.map((t, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-white/10 bg-slate-950/50 p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-slate-200"><Monitor className="h-4 w-4 text-primary" /> Tela {i + 1}</span>
            {telas.length > 1 && (
              <button type="button" onClick={() => onChange(telas.filter((_, j) => j !== i))} aria-label={`Remover tela ${i + 1}`}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
            )}
          </div>
          <div className="flex gap-3">
            <label className={cn('flex h-24 w-32 flex-shrink-0 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-dashed text-xs',
              t.foto_url ? 'border-transparent' : 'border-white/20 text-slate-400 hover:bg-white/5')}>
              {enviando === i ? <Loader2 className="h-5 w-5 animate-spin" />
                : t.foto_url ? <img src={t.foto_url} alt={`Foto da tela ${i + 1}`} className="h-full w-full object-cover" />
                : <><Camera className="mb-1 h-5 w-5" /> Foto da tela *</>}
              <input type="file" accept="image/*" capture="environment" className="hidden" disabled={enviando !== null}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  setEnviando(i);
                  try { const url = await enviarFoto(f); if (url) mudar(i, 'foto_url', url); } finally { setEnviando(null); }
                }} />
            </label>
            <div className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs text-slate-300">Onde fica a tela *</Label>
                <Input value={t.local} onChange={(e) => mudar(i, 'local', e.target.value)} placeholder="Ex.: Balcão de atendimento"
                  className="h-10 rounded-xl border-white/10 bg-slate-950/60 text-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-300">Valor para anunciar (R$/mês) *</Label>
                <Input inputMode="decimal" value={t.valor} onChange={(e) => mudar(i, 'valor', e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="149,90"
                  className="h-10 rounded-xl border-white/10 bg-slate-950/60 text-white" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-300">Tamanho (polegadas)</Label>
                <Input inputMode="numeric" value={t.polegadas} onChange={(e) => mudar(i, 'polegadas', e.target.value.replace(/\D/g, '').slice(0, 3))} placeholder="43"
                  className="h-10 rounded-xl border-white/10 bg-slate-950/60 text-white" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr] sm:items-end">
            <div className="flex gap-1 rounded-xl border border-white/10 p-1">
              {(['horizontal', 'vertical'] as const).map((o) => (
                <button key={o} type="button" onClick={() => mudar(i, 'orientacao', o)} aria-pressed={t.orientacao === o}
                  className={cn('rounded-lg px-3 py-1.5 text-xs font-medium', t.orientacao === o ? 'bg-primary text-primary-foreground' : 'text-slate-300 hover:bg-white/5')}>
                  {o === 'horizontal' ? 'Deitada' : 'Em pé'}
                </button>
              ))}
            </div>
            <Input value={t.detalhe} onChange={(e) => mudar(i, 'detalhe', e.target.value)} placeholder="Detalhe (opcional): ex. na parede atrás do balcão, na altura dos olhos"
              className="h-10 rounded-xl border-white/10 bg-slate-950/60 text-white" />
          </div>
        </div>
      ))}
    </div>
  );
}
