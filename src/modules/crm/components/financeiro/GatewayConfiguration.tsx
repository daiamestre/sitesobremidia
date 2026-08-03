import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Landmark, ShieldCheck } from 'lucide-react';

export function GatewayConfiguration() {
  const gateways = [
    { nome: 'Banco do Brasil', provedor: 'BANCO_DO_BRASIL', status: 'Ativo' },
    { nome: 'Asaas', provedor: 'ASAAS', status: 'Ativo' },
    { nome: 'Gerencianet / Efí', provedor: 'GERENCIANET', status: 'Ativo' },
    { nome: 'Stripe', provedor: 'STRIPE', status: 'Inativo' },
    { nome: 'Mercado Pago', provedor: 'MERCADO_PAGO', status: 'Ativo' },
  ];

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Landmark className="h-4 w-4 text-purple-400" /> Provedores de Gateway Configurados
          </span>
          <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">Multi-Gateway</Badge>
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs">Integração desacoplada para cobrança de boletos, PIX e cartão.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        {gateways.map((g) => (
          <div key={g.provedor} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <strong className="text-white font-semibold">{g.nome}</strong>
            </div>
            <Badge className={g.status === 'Ativo' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-700 text-slate-400'}>
              {g.status}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
