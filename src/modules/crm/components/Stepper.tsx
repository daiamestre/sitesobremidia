import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StepperStepId } from '../types';

interface StepperProps {
  currentStep: StepperStepId;
  onStepClick?: (step: StepperStepId) => void;
}

export const STEPS = [
  { id: 1 as StepperStepId, label: 'Empresa' },
  { id: 2 as StepperStepId, label: 'Responsável' },
  { id: 3 as StepperStepId, label: 'Campanha' },
  { id: 4 as StepperStepId, label: 'Locais' },
  { id: 5 as StepperStepId, label: 'Plano' },
  { id: 6 as StepperStepId, label: 'Pagamento' },
  { id: 7 as StepperStepId, label: 'Assinatura' },
  { id: 8 as StepperStepId, label: 'Resumo' },
];

export function CrmStepper({ currentStep, onStepClick }: StepperProps) {
  return (
    <div className="w-full bg-slate-900/80 border border-white/10 backdrop-blur-xl p-4 sm:p-5 rounded-2xl shadow-xl overflow-x-auto custom-scrollbar mb-6">
      <div className="flex items-center justify-between min-w-[700px]">
        {STEPS.map((step, index) => {
          const isCompleted = step.id < currentStep;
          const isCurrent = step.id === currentStep;

          return (
            <div key={step.id} className="flex items-center flex-1 last:flex-initial">
              {/* Step Circle & Label */}
              <button
                type="button"
                onClick={() => onStepClick && onStepClick(step.id)}
                className="flex items-center gap-2.5 group focus:outline-none"
              >
                <div
                  className={cn(
                    'w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs transition-all duration-300 shadow-md',
                    isCompleted
                      ? 'bg-emerald-500 text-white glow-emerald'
                      : isCurrent
                      ? 'gradient-primary text-white glow-primary ring-4 ring-primary/20 scale-110'
                      : 'bg-slate-950 border border-white/10 text-slate-500 group-hover:border-white/30'
                  )}
                >
                  {isCompleted ? <Check className="h-4 w-4 stroke-[3]" /> : step.id}
                </div>
                <span
                  className={cn(
                    'text-xs font-semibold whitespace-nowrap transition-colors',
                    isCurrent
                      ? 'text-white font-bold'
                      : isCompleted
                      ? 'text-slate-300'
                      : 'text-slate-500'
                  )}
                >
                  {step.label}
                </span>
              </button>

              {/* Connecting Line */}
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'h-[2px] flex-1 mx-3 rounded-full transition-colors',
                    step.id < currentStep ? 'bg-emerald-500/80' : 'bg-white/10'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
