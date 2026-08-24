import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Menu } from 'lucide-react';
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
  onMenuClick: () => void;
}

export function MobileBottomNav({ navItems, isActive, onMenuClick }: MobileBottomNavProps) {
  // Mobile Bottom Nav deve mostrar um conjunto restrito de ícones para não estourar a tela.
  // Prioridade: Dashboard, Campanhas, Notificações, Financeiro + Botão Mais.
  
  // Encontrar os itens principais na lista permitida do usuário:
  const getNavItem = (path: string) => navItems.find(item => item.path === path);
  
  const bottomNavItems = [
    getNavItem('/portal'),
    getNavItem('/portal/campanhas'),
    getNavItem('/portal/central'),
    getNavItem('/portal/financeiro'),
  ].filter(Boolean) as NavItem[]; // Remove undefined caso o usuário não tenha permissão em algum

  // Limitar a no máximo 4 itens + 1 botão "Mais" (Total 5 botões na barra inferior)
  const displayItems = bottomNavItems.slice(0, 4);

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-slate-950/95 backdrop-blur-xl border-t border-white/10 safe-area-bottom">
      <div className="flex items-center justify-around px-2 py-2">
        {displayItems.map((item) => {
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
        
        {/* Botão MAIS que abre o Drawer Lateral ou Modal já existente */}
        <Button
          variant="ghost"
          onClick={onMenuClick}
          className="flex-1 flex flex-col items-center justify-center gap-1 h-auto py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-white/5"
        >
          <Menu className="h-5 w-5" />
          <span className="text-[10px]">Mais</span>
        </Button>
      </div>
    </div>
  );
}
