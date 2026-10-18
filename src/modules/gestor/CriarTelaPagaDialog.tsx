import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { Copy, Loader2, QrCode, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { SeletorDeRotacao } from '@/components/screens/SeletorDeRotacao';
import { CapaDaTela } from '@/components/screens/CapaDaTela';
import { rotacaoPadrao, type Rotacao } from '@/lib/rotacaoTela';
import {
  VALOR_DA_TELA, cobrancaDeTelaEmAberto, conferirPixNoBanco, criarCobrancaTela, criarTelaPosPagamento, emitirPixDaCobranca,
  statusCobranca, type CobrancaTela,
} from './telaPago.service';

const brl = (n: number) => Number(n || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * F-129/F-194 — Nova tela do gestor de mídia: só depois de pagar. Ao abrir, a cobrança já vem pronta com o Pix do
 * Banco Inter (QR Code + copia e cola); a confirmação vem do banco (consulta a cada 8 s) e libera o botão de criar.
 * O banco também recusa tela de gestor sem cobrança paga (trg_screens_gestor_paga).
 */
export function CriarTelaPagaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { user, usuario, empresaOperadoraId } = useAuth();
  const usuarioId = usuario?.id ?? user?.id;
  const { toast } = useToast();
  const qc = useQueryClient();

  const [cobranca, setCobranca] = useState<CobrancaTela | null>(null);
  const [pix, setPix] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [preparando, setPreparando] = useState(false);
  const [nome, setNome] = useState('');
  const [localizacao, setLocalizacao] = useState('');
  const [orientacao, setOrientacao] = useState<'horizontal' | 'vertical'>('horizontal');
  const [rotacao, setRotacao] = useState<Rotacao>(0);
  const [capa, setCapa] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // abre já com a cobrança pronta (reaproveita a que está em aberto) e o Pix do Banco Inter
  const preparar = async () => {
    if (!usuarioId || !empresaOperadoraId) return;
    setErro(null); setPreparando(true);
    try {
      const c = cobranca ?? (await cobrancaDeTelaEmAberto(usuarioId)) ?? (await criarCobrancaTela(empresaOperadoraId, usuarioId));
      setCobranca(c);
      const copiaECola = await emitirPixDaCobranca(c.cobranca_id);
      setPix(copiaECola);
      setQr(await QRCode.toDataURL(copiaECola, { errorCorrectionLevel: 'M', margin: 1, width: 240 }));
    } catch (e) {
      setErro((e as Error).message || 'Falha ao gerar o Pix');
    } finally { setPreparando(false); }
  };
  useEffect(() => { if (open && !pix && !preparando) void preparar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [open]);

  const { data: status, refetch: refetchStatus, isRefetching } = useQuery({
    queryKey: ['tela-paga-status', cobranca?.cobranca_id],
    queryFn: async () => { await conferirPixNoBanco(cobranca!.cobranca_id); return statusCobranca(cobranca!.cobranca_id); },
    enabled: !!cobranca,
    refetchInterval: (q) => (open && cobranca && q.state.data !== 'PAGAMENTO CONFIRMADO' ? 8000 : false),
  });
  const pago = status === 'PAGAMENTO CONFIRMADO';

  const copiar = async () => {
    if (!pix) return;
    try { await navigator.clipboard.writeText(pix); toast({ title: 'Pix copia e cola copiado' }); }
    catch { toast({ title: 'Não foi possível copiar', variant: 'destructive' }); }
  };

  const handleCriarTela = async () => {
    if (!cobranca) return;
    setErro(null); setCriando(true);
    try {
      await criarTelaPosPagamento({
        empresaOperadoraId: empresaOperadoraId || '', cobrancaId: cobranca.cobranca_id,
        nome: nome.trim(), localizacao, orientacao, capaUrl: capa, usuarioId, rotacao,
      });
      toast({ title: 'Tela criada', description: `Pagamento ${cobranca.codigo} confirmado.` });
      qc.invalidateQueries({ queryKey: ['screens'] });
      onOpenChange(false);
      setCobranca(null); setPix(null); setQr(null); setNome(''); setLocalizacao(''); setCapa(null);
    } catch (e) {
      setErro((e as Error).message || 'Falha ao criar tela');
    } finally { setCriando(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle className="flex items-center gap-2"><QrCode className="h-5 w-5 text-emerald-400" /> Nova Tela — {brl(VALOR_DA_TELA)}</DialogTitle>
            <CapaDaTela compacto usuarioId={usuarioId} valor={capa} onMudar={setCapa} />
          </div>
          <DialogDescription>Cada tela nova é paga uma única vez no Pix. Assim que o banco confirmar, o botão "Criar tela" libera.</DialogDescription>
        </DialogHeader>

        {/* Pix pronto */}
        <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3" data-testid="pix-da-tela">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-sm text-emerald-400">{cobranca?.codigo || 'Gerando cobrança…'}</span>
            <Badge className={pago ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-400' : 'border-amber-500/30 bg-amber-500/20 text-amber-400'}>
              {pago ? 'PAGAMENTO CONFIRMADO' : 'AGUARDANDO PAGAMENTO'}
            </Badge>
          </div>
          {preparando && <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Gerando o Pix no Banco Inter…</p>}
          {qr && pix && !pago && (
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
              <img src={qr} alt="QR Code Pix" className="h-44 w-44 rounded-lg bg-white p-1" data-testid="qr-pix" />
              <div className="min-w-0 flex-1 space-y-2">
                <p className="text-xs text-muted-foreground">Abra o app do banco, escolha <strong>Pix → Ler QR Code</strong> ou use o copia e cola. Valor: <strong>{brl(VALOR_DA_TELA)}</strong>.</p>
                <p className="max-h-20 overflow-y-auto break-all rounded bg-background/60 p-2 font-mono text-[10px] text-muted-foreground">{pix}</p>
                <Button size="sm" variant="outline" onClick={copiar} className="w-full gap-1.5"><Copy className="h-3.5 w-3.5" /> Copiar Pix copia e cola</Button>
              </div>
            </div>
          )}
          {pago && <p className="flex items-center gap-1 text-xs text-emerald-400"><ShieldCheck className="h-3.5 w-3.5" /> Pagamento confirmado pelo banco — a tela está liberada.</p>}
          {!pago && cobranca && (
            <Button variant="ghost" size="sm" onClick={() => (pix ? refetchStatus() : preparar())} disabled={isRefetching || preparando} className="w-full gap-2">
              {isRefetching || preparando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {pix ? 'Já paguei — verificar agora' : 'Gerar o Pix de novo'}
            </Button>
          )}
        </div>

        {/* dados da tela (pode preencher enquanto paga) */}
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Nome da tela * <span className="font-normal text-muted-foreground">(é o nome que aparece no Player)</span></Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Hotel Maxsuel — Recepção" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Localização</Label>
              <Input value={localizacao} onChange={(e) => setLocalizacao(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Formato</Label>
              <Select value={orientacao} onValueChange={(v) => { setOrientacao(v as 'horizontal' | 'vertical'); setRotacao(rotacaoPadrao(v === 'vertical' ? '9x16' : '16x9')); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="horizontal">16x9 (Horizontal)</SelectItem>
                  <SelectItem value="vertical">9x16 (Vertical)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Rotação da tela</Label>
            <SeletorDeRotacao valor={rotacao} onMudar={setRotacao} />
          </div>
        </div>

        {erro && <p className="text-xs text-rose-400">{erro}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={handleCriarTela} disabled={criando || !pago || !nome.trim()} className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500">
            {criando && <Loader2 className="h-4 w-4 animate-spin" />}
            Criar tela
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
