import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserCheck, ArrowLeft, ArrowRight, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface FormStepProps {
  onBack?: () => void;
  onNext?: () => void;
}

export function ResponsavelForm({ onBack, onNext }: FormStepProps) {
  const { toast } = useToast();

  return (
    <Card className="w-full border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl animate-fade-in">
      <CardHeader className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-xl sm:text-2xl font-display font-extrabold text-white">
              Responsável Comercial
            </CardTitle>
            <CardDescription className="text-slate-300 text-sm mt-0.5">
              Passo 2 de 8: Defina o contato principal e gestores da conta.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <p className="text-sm text-slate-300">
          Formulário do Responsável preparado para inclusão de contatos comerciais e técnicos.
        </p>

        <div className="pt-6 border-t border-white/10 flex items-center justify-between">
          <Button variant="outline" onClick={onBack} className="border-slate-700 text-slate-300 rounded-xl gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <Button onClick={onNext} className="gradient-primary glow-primary font-bold rounded-xl gap-2">
            Continuar
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
