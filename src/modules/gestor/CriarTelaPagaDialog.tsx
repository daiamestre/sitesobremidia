import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, QrCode, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import {
  criarCobrancaTela, criarTelaPosPagamento, gerarBrcodePix, statusCobranca,
} from '../services/telaPago.service';

const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function CriarTelaPagaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { usuario, empresaOperadoraId } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [cobranca, setCobranca] = useState<{ cobranca_id: string; codigo: string } | null>(null);
  const [nome, setNome] = useState('');
  const [localizacao, setLocalizacao] = useState('');
  const [orientacao, setOrientacao] = useState<'horizontal' | 'vertical'>('vertical');
  const [capaUrl, setCapaUrl] = useState('');
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const { data: status, refetch: refetchStatus, isRefetching } = useQuery({
    queryKey: ['tela-paga-status', cobranca?.cobranca_id],
    queryFn: () => statusCobranca(cobranca!.cobranca_id),
    enabled: !!cobranca,
    refetchInterval: open && cobranca ? 8000 : false,
  });

  const brcode = useMemo(
    () => (cobranca ? gerarBrcodePix(cobranca.codigo, 22.99) : ''),
    [cobranca]
  );

  const handleGerar = async () => {
    setErro(null);
    try {
      const c = await criarCobrancaTela(empresaOperadoraId || '', usuario?.id);
      setCobranca({ cobranca_id: c.cobranca_id, codigo: c.codigo });
      toast({ title: 'Cobrança gerada', description: `Código ${c.codigo} — aguardando pagamento PIX` });
    } catch (e: any) {
      setErro(e?.message || 'Falha ao gerar cobrança');
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(brcode);
      toast({ title: 'PIX copia e cola copiado' });
    } catch {
      toast({ title: 'Não foi possível copiar', variant: 'destructive' });
    }
  };

  const handleCriarTela = async () => {
    if (!cobranca) return;
    setErro(null);
    setCriando(true);
    try {
      await criarTelaPosPagamento({
        empresaOperadoraId: empresaOperadoraId || '',
        cobrancaId: cobranca.cobranca_id,
        nome, localizacao, orientacao, capaUrl, usuarioId: usuario?.id,
      });
      toast({ title: 'Tela liberada e criada', description: `Pagamento ${cobranca.codigo} conciliado.` });
      qc.invalidateQueries({ queryKey: ['screens'] });
      onOpenChange(false);
      setCobranca(null); setNome(''); setLocalizacao(''); setCapaUrl('');
    } catch (e: any) {
      setErro(e?.message || 'Falha ao criar tela');
    } finally {
      setCriando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-white/10 text-slate-200 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <QrCode className="h-5 w-5 text-emerald-400" /> Nova Tela — R$ 22,99
          </DialogTitle>
        </DialogHeader>

        {!cobranca ? (
          <div className="space-y-4 py-2 text-sm text-slate-300">
            <p>Cada nova tela custa <strong className="text-white">{brl(22.99)}</strong> (pagamento único via PIX). Uploads de mídias permanecem gratuitos.</p>
            <Button onClick={handleGerar} className="w-full bg-primary hover:bg-primary/90 text-white gap-2">
              <QrCode className="h-4 w-4" /> Gerar PIX da cobrança
            </Button>
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="p-3 rounded-xl bg-slate-950/60 border border-white/10 space-y-1">
              <div className="flex items-center justify-between">
                <span className="font-mono text-emerald-400 text-sm">{cobranca.codigo}</span>
                <Badge className={
                  status === 'PAGAMENTO CONFIRMADO'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                }>
                  {status ?? 'AGUARDANDO PAGAMENTO'}
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 break-all font-mono">{brcode}</p>
              <Button size="sm" variant="outline" onClick={copiar} className="border-slate-700 text-slate-300 text-xs gap-1">
                Copiar PIX copia e cola
              </Button>
            </div>

            {status === 'PAGAMENTO CONFIRMADO' && (
              <>
                <div className="grid gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-400">Nome da tela *</Label>
                    <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Hotel Maxsuel — Recepção" className="bg-slate-950 border-slate-700" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-400">Localização</Label>
                      <Input value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} className="bg-slate-950 border-slate-700" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-slate-400">Formato</Label>
                      <Select value={orientacao} onValueChange={(v) => setOrientacao(v as 'horizontal' | 'vertical')}>
                        <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
                        <SelectContent className="bg-slate-950 border-slate-700">
                          <SelectItem value="vertical">9:16 Vertical</SelectItem>
                          <SelectItem value="horizontal">16:9 Horizontal</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-slate-400">Foto de capa (URL do storage)</Label>
                    <Input value={capaUrl} onChange={(e) => setCapaUrl(e.target.value)} placeholder="https://..." className="bg-slate-950 border-slate-700" />
                  </div>
                </div>
                <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Pagamento conciliado no servidor — liberação autorizada.
                </p>
              </>
            )}

            {status !== 'PAGAMENTO CONFIRMADO' && (
              <Button variant="outline" size="sm" onClick={() => refetchStatus()} disabled={isRefetching} className="gap-2 w-full">
                {isRefetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Verificar pagamento
              </Button>
            )}
          </div>
        )}

        {erro && <p className="text-xs text-rose-400">{erro}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-slate-700 text-slate-300">Fechar</Button>
          <Button
            onClick={handleCriarTela}
            disabled={criando || !cobranca || status !== 'PAGAMENTO CONFIRMADO' || !nome.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-2"
          >
            {criando && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar tela liberada
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
