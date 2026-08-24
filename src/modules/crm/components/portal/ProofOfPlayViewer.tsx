import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tv, CheckCircle2, MapPin, Loader2, ImageOff, WifiOff } from 'lucide-react';
import { customerPortalService, ProofOfPlayItem } from '../../services/customerPortal.service';

export function ProofOfPlayViewer() {
  const [itens, setItens] = useState<ProofOfPlayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    customerPortalService
      .getProofOfPlayList()
      .then((data) => {
        if (!ativo) return;
        setItens(data);
        setErro(false);
        setLoading(false);
      })
      .catch(() => {
        if (!ativo) return;
        setErro(true);
        setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, []);

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Tv className="h-4 w-4 text-emerald-400" /> Transmissões Ao Vivo & Proof of Play
          </span>
          <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
            {loading ? 'Carregando' : `${itens.length} comprovantes`}
          </Badge>
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">
          Comprovação contínua de exibição com fotos e logs de execução nas telas da sua operadora.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4 space-y-3 text-xs">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Carregando comprovantes...
          </div>
        ) : erro ? (
          <div className="flex items-center gap-2 py-6 text-rose-400">
            <WifiOff className="h-4 w-4" /> Não foi possível carregar os comprovantes.
          </div>
        ) : itens.length === 0 ? (
          <div className="flex items-center gap-2 py-6 text-slate-400">
            <ImageOff className="h-4 w-4" /> Nenhum comprovante de exibição registrado até o momento.
          </div>
        ) : (
          itens.map((item) => (
            <div key={item.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between gap-3">
              <div className="space-y-0.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <strong className="text-white truncate">{item.screenName || item.deviceName || 'Tela não identificada'}</strong>
                  {(item.cidade || item.estado) && (
                    <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                      <MapPin className="h-3 w-3 shrink-0" /> {[item.cidade, item.estado].filter(Boolean).join(' - ')}
                    </span>
                  )}
                </div>
                <span className="text-[10px] text-slate-500 block truncate">
                  {item.enderecoInstalacao || 'Endereço não informado'}
                  {item.capturedAt ? ` · ${new Date(item.capturedAt).toLocaleString('pt-BR')}` : ''}
                </span>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1 shrink-0">
                <CheckCircle2 className="h-3 w-3" /> Exibido
              </Badge>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}