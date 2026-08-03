import { useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LogOut, Briefcase, Construction, TrendingUp, Users, Target, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function RepresentantesDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleLogout = () => {
    toast({
      title: 'Sessão encerrada',
      description: 'Você saiu da Área do Representante.',
    });
    navigate('/representantes');
  };

  const upcomingFeatures = [
    { icon: Users, title: 'Gestão de Leads & Clientes', desc: 'Acompanhamento completo da carteira' },
    { icon: TrendingUp, title: 'Funil de Vendas', desc: 'Pipeline comercial interativo e métricas' },
    { icon: Target, title: 'Comissões & Metas', desc: 'Relatórios de fechamento em tempo real' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col relative overflow-hidden">
      {/* Background Glow Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-accent/10 rounded-full blur-[140px]" />
      </div>

      {/* Top Header */}
      <header className="relative z-10 border-b border-border/50 backdrop-blur-md bg-slate-950/80">
        <div className="container mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size="md" />
            <Badge variant="outline" className="border-primary/40 text-primary bg-primary/10 px-3 py-1 gap-1.5 hidden sm:flex">
              <Briefcase className="h-3.5 w-3.5" />
              Área do Representante
            </Badge>
          </div>

          <Button 
            onClick={handleLogout} 
            variant="outline" 
            className="border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500 hover:text-red-300 font-semibold gap-2 transition-all rounded-xl"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 container mx-auto px-4 py-12 flex flex-col items-center justify-center max-w-4xl">
        <Card className="w-full border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden animate-fade-in text-center p-6 sm:p-10">
          <CardHeader className="pb-4 items-center">
            <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center glow-primary mb-4 shadow-lg">
              <Construction className="h-8 w-8 text-white animate-bounce" />
            </div>

            <Badge className="bg-amber-500/10 text-amber-400 border-amber-500/30 px-3 py-1 text-xs font-semibold mb-2">
              <Clock className="h-3.5 w-3.5 mr-1" />
              Em Breve
            </Badge>

            <CardTitle className="text-3xl sm:text-4xl font-display font-extrabold text-white">
              CRM Comercial - Em Desenvolvimento
            </CardTitle>
            <CardDescription className="text-slate-300 text-base max-w-lg mx-auto mt-2">
              Estamos construindo uma plataforma comercial completa para nossos representantes e parceiros.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-8 pt-4">
            {/* Features preview */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-left">
              {upcomingFeatures.map((feat) => (
                <div key={feat.title} className="p-4 rounded-xl border border-white/10 bg-slate-950/60">
                  <div className="p-2.5 rounded-lg bg-primary/15 w-fit text-primary mb-3">
                    <feat.icon className="h-5 w-5" />
                  </div>
                  <h4 className="font-bold text-white text-sm mb-1">{feat.title}</h4>
                  <p className="text-xs text-slate-400">{feat.desc}</p>
                </div>
              ))}
            </div>

            <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
              <p className="text-xs text-slate-400">
                Sua conta de representante já está estruturada para o lançamento do módulo.
              </p>
              <Button 
                onClick={handleLogout} 
                className="gradient-primary glow-primary font-bold px-6 py-2.5 rounded-xl text-sm"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sair da Área Comercial
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/50 py-6 text-center text-xs text-slate-500">
        © 2024 SOBRE MÍDIA. Módulo Comercial do Representante.
      </footer>
    </div>
  );
}
