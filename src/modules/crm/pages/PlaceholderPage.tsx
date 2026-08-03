import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import { Plus, Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  description: string;
  badge?: string;
  actionText?: string;
  actionPath?: string;
}

export default function CrmPlaceholderPage({
  title,
  description,
  badge = 'Módulo CRM',
  actionText = '+ Novo Registro',
  actionPath = '/representantes/clientes/novo',
}: PlaceholderPageProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-white">
              {title}
            </h2>
            <Badge className="bg-primary/20 text-primary border-primary/30 ml-2">
              {badge}
            </Badge>
          </div>
          <p className="text-slate-300 text-sm">{description}</p>
        </div>

        {actionText && (
          <Button
            onClick={() => navigate(actionPath)}
            className="gradient-primary glow-primary font-bold text-sm px-5 py-2.5 rounded-xl shadow-xl hover:scale-105 transition-all gap-2"
          >
            <Plus className="h-4 w-4" />
            {actionText}
          </Button>
        )}
      </div>

      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl p-8 sm:p-12 text-center">
        <CardHeader className="items-center pb-4">
          <div className="w-16 h-16 rounded-2xl bg-primary/15 border border-primary/30 text-primary flex items-center justify-center mb-3 glow-primary">
            <Construction className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl font-bold text-white">{title}</CardTitle>
          <CardDescription className="text-slate-300 text-sm max-w-md mx-auto">
            {description} — Esta seção está pronta na arquitetura do CRM e receberá os dados do Supabase.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => navigate('/representantes/clientes/novo')}
            className="gradient-primary glow-primary font-bold rounded-xl px-6 py-2.5"
          >
            Ir para Cadastro de Cliente
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
