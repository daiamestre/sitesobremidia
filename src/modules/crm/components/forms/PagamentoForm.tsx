import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign, ArrowLeft, ArrowRight } from 'lucide-react';

interface FormStepProps {
  onBack?: () => void;
  onNext?: () => void;
}

export function PagamentoForm({ onBack, onNext }: FormStepProps) {
  return (
    <Card className="w-full border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl animate-fade-in">
      <CardHeader className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
            <DollarSign className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-xl sm:text-2xl font-display font-extrabold text-white">
              Forma de Pagamento
            </CardTitle>
            <CardDescription className="text-slate-300 text-sm mt-0.5">
              Passo 6 de 8: Configure faturamento por Pix, Boleto bancário ou Cartão corporativo.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-6 space-y-6">
        <p className="text-sm text-slate-300">
          Formulário de cobrança financeira e dados para emissão da Nota Fiscal de Serviços.
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
