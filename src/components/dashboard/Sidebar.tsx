import { NavLink, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useCentralUnread } from '@/hooks/useCentral';
import { supabase } from '@/integrations/supabase/client';
import {
  Image,
  PlaySquare,
  ListVideo,
  Calendar,
  Monitor,
  Link2,
  History,
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Shield,
  LayoutGrid,
  BarChart3,
  Inbox,
  Bell,
  AlertTriangle,
  FileText,
  Briefcase,
  Banknote,
  UserCircle,
} from 'lucide-react';
import { useState, useEffect } from 'react';

const menuItems = [
  { icon: Inbox, label: 'Central', path: '/dashboard/central' },
  { icon: Image, label: 'Minhas Mídias', path: '/dashboard/medias' },
  { icon: ListVideo, label: 'Playlists', path: '/dashboard/playlists' },
  { icon: Monitor, label: 'Telas', path: '/dashboard/screens' },
  { icon: LayoutGrid, label: 'Widgets', path: '/dashboard/widgets' },
  { icon: Calendar, label: 'Agendamento', path: '/dashboard/schedule' },
  { icon: Link2, label: 'Links Externos', path: '/dashboard/links' },
  { icon: BarChart3, label: 'Analytics', path: '/dashboard/analytics' },
  { icon: History, label: 'Histórico', path: '/dashboard/history' },
  { icon: Calendar, label: 'Relatórios', path: '/dashboard/reports' },
];

export function Sidebar({ onNavigate, hideCollapse }: { onNavigate?: () => void; hideCollapse?: boolean } = {}) {
  const [collapsed, setCollapsed] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const { signOut, profile, user, isOwner } = useAuth();
  const location = useLocation();
  const { total: totalNaoLidas } = useCentralUnread();

  // MENSAGENS: entrada logo abaixo de BI & Relatórios (Relatórios) em todos os painéis
  // Central de Cobranças restrita a ADMIN/OWNER (mesma regra do módulo financeiro)
  const menuComMensagens = [
    ...menuItems,
    ...((isAdmin || isOwner)
      ? [{ icon: Banknote, label: 'Central de Cobranças', path: '/financeiro/cobrancas' }]
      : []),
    {
      icon: Bell,
      label: 'Mensagens',
      path: '/dashboard/central',
      badge: totalNaoLidas,
    },
  ];

  useEffect(() => {
    const checkAdmin = async () => {
      if (user) {
        const { data } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .maybeSingle();
        setIsAdmin(!!data);
      }
    };
    checkAdmin();
  }, [user]);

  return (
    <aside
      className={cn(
        'h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <div className="p-4 border-b border-sidebar-border flex items-center justify-between">
        {!collapsed && <Logo size="sm" />}
        {!hideCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="ml-auto"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* User info */}
      {!collapsed && profile && (
        <div className="p-4 border-b border-sidebar-border">
          <p className="font-medium text-sm truncate">{profile.full_name}</p>
          <p className="text-xs text-muted-foreground truncate">{profile.company_name}</p>
        </div>
      )}

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {menuComMensagens.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onNavigate}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
                isActive
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1">{item.label}</span>
                  {'badge' in item && item.badge > 0 && (
                    <span className="min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-2 border-t border-sidebar-border space-y-1">
        {(isAdmin || isOwner) && (
          <NavLink
            to="/workspace/corporate"
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-primary hover:bg-sidebar-accent min-h-[44px]'
            )}
          >
            <Briefcase className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>Área Corporativa</span>}
          </NavLink>
        )}
        {isAdmin && (
          <NavLink
            to="/dashboard/admin/users"
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
              location.pathname === '/dashboard/admin/users'
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            <Shield className="h-5 w-5 flex-shrink-0" />
            {!collapsed && <span>Admin</span>}
          </NavLink>
        )}
        <NavLink
          to="/dashboard/perfil"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
            location.pathname === '/dashboard/perfil'
              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <UserCircle className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Meu Perfil</span>}
        </NavLink>
        <NavLink
          to="/dashboard/settings"
          onClick={onNavigate}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]',
            location.pathname === '/dashboard/settings'
              ? 'bg-sidebar-primary text-sidebar-primary-foreground'
              : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
          )}
        >
          <Settings className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Configurações</span>}
        </NavLink>
        <button
          onClick={signOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-destructive hover:bg-destructive/10 w-full"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}
