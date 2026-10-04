import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

/** Caminho da página "Meu Perfil" conforme a área em que o usuário está. */
export function caminhoDoPerfil(pathname: string): string {
  if (pathname.startsWith('/workspace')) return '/workspace/perfil';
  if (pathname.startsWith('/representantes')) return '/representantes/perfil';
  if (pathname.startsWith('/portal')) return '/portal/perfil';
  return '/dashboard/perfil';
}

export function iniciais(nome?: string | null): string {
  const partes = (nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return 'U';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

/**
 * F-134 — Círculo do perfil no cabeçalho: mostra a foto do usuário (ou as iniciais) e abre "Meu Perfil".
 * Fica logo depois do botão de menu, à esquerda.
 */
export function AvatarCabecalho({ className, nomeDaSessao, iniciaisDaSessao }: { className?: string; nomeDaSessao?: string; iniciaisDaSessao?: string }) {
  const { usuario, profile, user } = useAuth();
  const location = useLocation();
  const nome = usuario?.nome || nomeDaSessao || profile?.full_name || user?.email || 'Usuário';
  const foto = usuario?.avatar_url || null;
  return (
    <Link
      to={caminhoDoPerfil(location.pathname)}
      aria-label={`Meu perfil — ${nome}`}
      title={`Meu perfil — ${nome}`}
      data-testid="avatar-cabecalho"
      className={cn(
        'flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-bold text-white shadow-md ring-2 ring-white/10 transition hover:ring-primary/60 focus:outline-none focus-visible:ring-primary',
        !foto && 'gradient-primary',
        className,
      )}
    >
      {foto
        ? <img src={foto} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
        : <span aria-hidden="true">{iniciaisDaSessao || iniciais(nome)}</span>}
    </Link>
  );
}
