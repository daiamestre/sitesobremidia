import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, ArrowLeft } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useCrmSession } from '../../contexts/CrmSessionContext';

interface FormStepProps {
  onBack?: () => void;
}

export function ResumoForm({ onBack }: FormStepProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { userName } = useCrmSession();

  const handleFinish = () => {
    toast({
      title: 'Cliente Cadastrado com Sucesso!',
      description: 'A proposta comercial e os dados foram salvos no CRM.',
    });
    navigate('/representantes/dashboard');
  };

  return (
    <Card className="w-full border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl animate-fade-in text-center p-6 sm:p-8">
      <CardHeader className="items-center pb-4">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mb-3 glow-emerald">
          <CheckCircle className="h-8 w-8" />
        </div>
        <CardTitle className="text-2xl sm:text-3xl font-display font-extrabold text-white">
          Resumo & Finalização
        </CardTitle>
        <CardDescription className="text-slate-300 text-sm max-w-md mx-auto">
          Passo 8 de 8: Revise todos os dados e conclua o cadastro do novo cliente no CRM.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-4">
        <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10 text-left max-w-lg mx-auto space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Status da Proposta:</span>
            <span className="text-emerald-400 font-bold">Pronta para Envio</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Representante Responsável:</span>
            <span className="text-white font-semibold">{userName}</span>
          </div>
        </div>

        <div className="pt-6 border-t border-white/10 flex items-center justify-between max-w-lg mx-auto">
          <Button variant="outline" onClick={onBack} className="border-slate-700 text-slate-300 rounded-xl gap-2">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          <Button onClick={handleFinish} className="gradient-primary glow-primary font-bold text-base px-8 py-3 rounded-xl shadow-xl">
            Finalizar Cadastro
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
