import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, ExternalLink, Gift, Loader2, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { enviarImagemR2 } from '@/lib/enviarImagem';

/**
 * F-119 — Criar uma tela nova no ponto parceiro ou editar uma tela existente (OWNER/ADMIN).
 * Valor R$ 0,00 = tela grátis: o anunciante coloca a mídia sem pagar. A gravação é a RPC fn_salvar_tela_parceira
 * (cria/edita, recalcula a ficha do ponto e a tela aparece na pasta do ponto em Telas).
 */
export interface TelaParceiraEditavel {
  id: string; name: string; local_instalacao: string | null; foto_local_url: string | null; orientation: string | null;
  tamanho_polegadas: number | null; valor_anuncio: number | null; codigo_operacional?: string | null; custom_id?: string | null;
}

const paraTexto = (v: number | null | undefined) => (v === null || v === undefined ? '' : Number(v).toFixed(2).replace('.', ','));

export function TelaParceiraDialog({ aberto, onFechar, pontoId, tela, onSalvo }: {
  aberto: boolean; onFechar: () => void; pontoId: string; tela: TelaParceiraEditavel | null; onSalvo: () => void;
}) {
  const [local, setLocal] = useState('');
  const [foto, setFoto] = useState('');
  const [orientacao, setOrientacao] = useState<'landscape' | 'portrait'>('landscape');
  const [polegadas, setPolegadas] = useState('');
  const [valor, setValor] = useState('');
  const [subindo, setSubindo] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const arquivo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!aberto) return;
    setLocal(tela?.local_instalacao ?? '');
    setFoto(tela?.foto_local_url ?? '');
    setOrientacao(tela?.orientation === 'portrait' ? 'portrait' : 'landscape');
    setPolegadas(tela?.tamanho_polegadas ? String(tela.tamanho_polegadas) : '');
    setValor(tela ? paraTexto(tela.valor_anuncio) : '');
    setErro(null);
  }, [aberto, tela]);

  const enviar = async (f: File | undefined) => {
    if (!f) return;
    setSubindo(true); setErro(null);
    try { setFoto(await enviarImagemR2(f, 'pontos')); } catch (e) { setErro((e as Error).message); } finally { setSubindo(false); }
  };

  const salvar = async () => {
    if (local.trim().length < 2) return setErro('Informe onde a tela fica no estabelecimento.');
    if (!valor.trim()) return setErro('Informe o valor da tela (R$ 0,00 = grátis).');
    setSalvando(true); setErro(null);
    const { error } = await supabase.rpc('fn_salvar_tela_parceira' as never, {
      p_ponto: pontoId, p_tela: tela?.id ?? null,
      p_dados: { local: local.trim(), foto_url: foto || null, orientacao: orientacao, polegadas: polegadas || null, valor: valor.replace(/\./g, '').replace(',', '.') },
    } as never);
    setSalvando(false);
    if (error) return setErro(error.message);
    toast.success(tela ? 'Tela atualizada.' : 'Tela criada: ela já aparece na pasta do ponto em Telas.');
    onSalvo();
    onFechar();
  };

  const gratis = valor.trim() !== '' && Number(valor.replace(/\./g, '').replace(',', '.')) === 0;
  const codigo = tela?.codigo_operacional || tela?.custom_id || tela?.id;

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && !salvando && onFechar()}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tela ? 'Editar tela' : 'Nova tela no ponto'}</DialogTitle>
          <DialogDescription>{tela ? tela.name : 'A tela nova entra na pasta do ponto em Telas, aguardando a grade.'}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4" data-testid="form-tela-parceira">
          <div className="space-y-2">
            <Label>Foto do local da tela</Label>
            <div className="relative overflow-hidden rounded-xl border bg-muted">
              {foto ? <img src={foto} alt="Local da tela" className="aspect-video w-full object-cover" />
                : <div className="flex aspect-video items-center justify-center"><Monitor className="h-10 w-10 text-muted-foreground" /></div>}
              <Button type="button" size="sm" variant="secondary" className="absolute bottom-2 right-2 gap-1" disabled={subindo} onClick={() => arquivo.current?.click()}>
                {subindo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />} {foto ? 'Trocar foto' : 'Enviar foto'}
              </Button>
              <input ref={arquivo} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { enviar(e.target.files?.[0]); e.target.value = ''; }} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tela-local">Onde fica a tela *</Label>
            <Input id="tela-local" value={local} onChange={(e) => setLocal(e.target.value)} placeholder="Ex.: Balcão de atendimento" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Posição</Label>
              <div className="grid grid-cols-2 gap-1 rounded-lg border p-1">
                {(['landscape', 'portrait'] as const).map((o) => (
                  <button key={o} type="button" onClick={() => setOrientacao(o)}
                    className={`rounded-md px-2 py-1.5 text-xs font-medium ${orientacao === o ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}>
                    {o === 'landscape' ? 'Deitada' : 'Em pé'}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tela-pol">Tamanho (polegadas)</Label>
              <Input id="tela-pol" inputMode="numeric" value={polegadas} onChange={(e) => setPolegadas(e.target.value.replace(/\D/g, ''))} placeholder="43" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tela-valor">Valor para anunciar (R$/mês) *</Label>
            <div className="flex gap-2">
              <Input id="tela-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value.replace(/[^0-9.,]/g, ''))} placeholder="149,90" />
              <Button type="button" variant={gratis ? 'default' : 'outline'} className="flex-shrink-0 gap-1" onClick={() => setValor('0')}>
                <Gift className="h-4 w-4" /> Grátis
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {gratis ? 'Tela grátis: o anunciante coloca a mídia sem pagar (vai ao ar quando a mídia for aprovada).' : 'R$ 0,00 deixa a tela grátis para os anunciantes.'}
            </p>
          </div>

          {tela && (
            <Link to={`/dashboard/screens/${codigo}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              Abrir o painel da tela (grade e mídias) <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          )}
          {erro && <p className="text-sm text-destructive">{erro}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={salvando} onClick={onFechar}>Cancelar</Button>
          <Button disabled={salvando || subindo} onClick={salvar} className="gap-2">
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />} {tela ? 'Salvar tela' : 'Criar tela'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
