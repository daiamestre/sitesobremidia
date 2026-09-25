import { Building2, Database, ShieldCheck, Zap } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/** Informações técnicas do ambiente (antes ocupavam a tela inicial do Owner/Admin). Só para OWNER/ADMIN. */
export function SystemInfoCard() {
  const itens = [
    { icon: Building2, rotulo: 'Organização', valor: 'SOBRE MÍDIA', detalhe: 'Tenant principal ativo' },
    { icon: Zap, rotulo: 'Banco de dados (RLS)', valor: 'Zero Trust', detalhe: 'Isolamento por empresa (multi-tenant)' },
    { icon: Database, rotulo: 'Armazenamento de mídia', valor: 'Cloudflare R2', detalhe: 'Mídias servidas por CDN' },
    { icon: ShieldCheck, rotulo: 'Sessão atual', valor: 'Owner / Admin', detalhe: 'Acesso total liberado' },
  ];
  return (
    <Card className="glass" data-testid="system-info-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /> Sistema</CardTitle>
        <CardDescription>Informações técnicas do ambiente</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
        {itens.map(({ icon: Icon, rotulo, valor, detalhe }) => (
          <div key={rotulo} className="min-w-0 rounded-xl border border-border/60 p-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" />{rotulo}</p>
            <p className="mt-1 truncate font-semibold">{valor}</p>
            <p className="truncate text-xs text-muted-foreground">{detalhe}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
