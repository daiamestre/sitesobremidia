import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function Logo({ className, size = 'md' }: LogoProps) {
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-4xl',
  };

  return (
    <Link to="/" className={cn('flex items-center gap-2 hover:opacity-80 transition-opacity', className)}>
      <div className="relative">
        <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center glow-primary">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="w-5 h-5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8" />
            <path d="M12 17v4" />
            <polygon points="10 8 16 11.5 10 15 10 8" fill="currentColor" />
          </svg>
        </div>
      </div>
      <span className={cn('font-display font-bold tracking-tight', sizeClasses[size])}>
        <span className="text-foreground">SOBRE</span>
        <span className="bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent"> MÍDIA</span>
      </span>
    </Link>
  );
}
