import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { UserCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
}

interface MobileBottomNavProps {
  navItems: NavItem[];
  isActive: (path: string) => boolean;
}

const PERFIL: NavItem = { name: 'Perfil', path: '/portal/perfil', icon: UserCircle2 };

export function MobileBottomNav({ navItems, isActive }: MobileBottomNavProps) {
  // Barra inferior do celular: atalhos principais + "Perfil" no canto direito.
  // O menu completo abre pelo botão do canto superior esquerdo (F-101).
  const getNavItem = (path: string) => navItems.find(item => item.path === path);

  const displayItems = [
    getNavItem('/portal'),
    getNavItem('/portal/campanhas'),
    getNavItem('/portal/central'),
    getNavItem('/portal/financeiro'),
  ].filter(Boolean).slice(0, 4) as NavItem[];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-white/10 safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {[...displayItems, PERFIL].map((item) => {
          const active = isActive(item.path);
          return (
            <Link key={item.path} to={item.path} className="flex-1">
              <Button
                variant="ghost"
                className={cn(
                  'w-full flex flex-col items-center justify-center gap-1 h-auto py-2 rounded-xl transition-all',
                  active
                    ? 'text-primary'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                )}
              >
                <div className="relative">
                  <item.icon className="h-5 w-5" />
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="absolute -top-1 -right-2 min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                <span className="text-[10px] truncate max-w-[60px]">{item.name}</span>
              </Button>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
