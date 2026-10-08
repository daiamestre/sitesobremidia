import { useState } from 'react';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CampoDeSenhaProps {
  id: string;
  value: string;
  onChange: (valor: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  disabled?: boolean;
  /** Mostra o cadeado à esquerda (padrão). */
  comIcone?: boolean;
  className?: string;
  iconClassName?: string;
}

/**
 * F-170 — Campo de senha com o "olhinho": mostra ou oculta a senha digitada.
 * Usado em todos os cartões de login e de criação/redefinição de senha.
 */
export function CampoDeSenha({
  id, value, onChange, placeholder = '••••••••', autoComplete = 'current-password', required, minLength, disabled,
  comIcone = true, className, iconClassName,
}: CampoDeSenhaProps) {
  const [visivel, setVisivel] = useState(false);
  return (
    <div className="relative">
      {comIcone && <Lock className={cn('absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground', iconClassName)} aria-hidden />}
      <Input
        id={id}
        type={visivel ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
        disabled={disabled}
        className={cn(comIcone && 'pl-10', 'pr-11', className)}
      />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={visivel}
        title={visivel ? 'Ocultar senha' : 'Mostrar senha'}
        data-testid={`olhinho-${id}`}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {visivel ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
      </button>
    </div>
  );
}
