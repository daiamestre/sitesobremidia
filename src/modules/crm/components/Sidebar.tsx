import { Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { useCrmSession } from '../contexts/CrmSessionContext';
import { useCentralUnread } from '@/hooks/useCentral';
import { useRbac } from '@/hooks/useRbac';
import { corporateUsersService } from '@/services/corporateUsers.service';
import { 
  Home, 
  Users, 
  FileText, 
  FileCheck, 
  Tv, 
  MapPin, 
  Calendar, 
  DollarSign, 
  BarChart3, 
  Settings, 
  User, 
  LogOut,
  ChevronRight,
  Briefcase,
  Bell,
  ShieldCheck,
  UserCog,
  TrendingUp
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function CrmSidebar() {
  const location = useLocation();
  const { userName, userEmail, userInitials, userCargo, handleCrmLogout, isLoggingOut } = useCrmSession();
  const { total: totalNaoLidas } = useCentralUnread();
  const { isOwner } = useRbac();
  const [minhasPermissoes, setMinhasPermissoes] = useState<string[]>([]);

  // Central de Acessos é delegada: visível apenas para OWNER ou quem possui
  // users.view delegado (ADMIN por perfil sem delegação não acessa a Central).
  useEffect(() => {
    let ativo = true;
    corporateUsersService
      .getMyPermissions()
      .then((p) => {
        if (ativo) setMinhasPermissoes(p);
      })
      .catch(() => {
        if (ativo) setMinhasPermissoes([]);
      });
    return () => {
      ativo = false;
    };
  }, []);

  const podeVerCentralAcessos = isOwner || minhasPermissoes.includes('users.view');
  const podeVerDesempenhoRepresentantes = isOwner || minhasPermissoes.includes('representantes.view_performance');

  // Determine base path dynamically
  const basePath = location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
  const isWorkspace = basePath === '/workspace';

  const navItems = [
    // Dashboard aponta para rotas existentes em CADA painel (corrige o 404 do
    // painel de representantes: /representantes/corporate não existe)
    { label: 'Dashboard', icon: Home, path: isWorkspace ? '/workspace/corporate' : '/representantes/dashboard' },
    // Grupo Comercial (apenas no workspace corporativo): gestão de representantes
    // + desempenho real, integrada à Central de Acessos.
    ...(isWorkspace
      ? [
          { label: 'Comercial', header: true as const },
          { label: 'Representantes', icon: UserCog, path: '/workspace/representantes' },
          ...(podeVerDesempenhoRepresentantes
            ? [{ label: 'Desempenho', icon: TrendingUp, path: '/workspace/representantes/desempenho' }]
            : []),
        ]
      : []),
    { label: 'Clientes', icon: Users, path: `${basePath}/clientes` },
    { label: 'Propostas', icon: FileText, path: `${basePath}/propostas` },
    { label: 'Contratos', icon: FileCheck, path: `${basePath}/contratos` },
    { label: 'Campanhas', icon: Tv, path: `${basePath}/campanhas` },
    // Pontos de Exibição: /workspace/screens existe; no painel de representantes a rota é /representantes/pontos
    { label: 'Pontos de Exibição', icon: MapPin, path: isWorkspace ? '/workspace/screens' : '/representantes/pontos' },
    { label: 'Agenda', icon: Calendar, path: `${basePath}/agenda` },
    { label: 'Financeiro', icon: DollarSign, path: `${basePath}/financeiro` },
    { label: 'BI & Relatórios', icon: BarChart3, path: `${basePath}/bi` },
    // MENSAGENS: entra logo abaixo de BI & Relatórios em todos os painéis
    { label: 'Mensagens', icon: Bell, path: `${basePath}/central`, badge: totalNaoLidas },
    { label: 'Configurações', icon: Settings, path: `${basePath}/configuracoes` },
    { label: 'Meu Perfil', icon: User, path: `${basePath}/perfil` },
  ];

  // Central de Acessos: item administrativo delegado (OWNER ou users.view)
  if (isWorkspace && podeVerCentralAcessos) {
    navItems.splice(14, 0, {
      label: 'Central de Acessos',
      icon: ShieldCheck,
      path: '/workspace/usuarios',
    });
  }

  return (
    <aside className="w-64 bg-slate-950 border-r border-white/10 flex flex-col justify-between h-screen sticky top-0 z-30 select-none">
      <div>
        {/* Top Logo */}
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <Logo size="sm" />
          <span className="text-[10px] font-bold tracking-wider uppercase bg-primary/20 text-primary px-2 py-0.5 rounded-full border border-primary/30">
            CRM
          </span>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-170px)] custom-scrollbar">
          {navItems.map((item) => {
            if ('header' in item && item.header) {
              return (
                <div
                  key={item.label}
                  className="px-3.5 pt-3 pb-1 text-[10px] font-bold tracking-widest uppercase text-slate-500 select-none"
                >
                  {item.label}
                </div>
              );
            }
            const isActive = location.pathname === item.path || 
              (item.path !== '/representantes/dashboard' && location.pathname.startsWith(item.path)) &&
              !(item.path === '/workspace/representantes' && location.pathname.startsWith('/workspace/representantes/desempenho'));
            
            return (
              <Link key={item.path} to={item.path}>
                <div
                  className={cn(
                    'flex items-center justify-between px-3.5 py-2.5 rounded-xl font-medium text-sm transition-all duration-200 group',
                    isActive
                      ? 'bg-primary text-white font-bold shadow-lg shadow-primary/25 glow-primary'
                      : 'text-slate-300 hover:bg-slate-900 hover:text-white'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <item.icon
                      className={cn(
                        'h-4 w-4 transition-colors',
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-primary'
                      )}
                    />
                    <span>{item.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {'badge' in item && item.badge > 0 && (
                      <span className="min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                    {isActive && <ChevronRight className="h-4 w-4 opacity-80" />}
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Profile & Logout */}
      <div className="p-3 border-t border-white/10 bg-slate-900/50">
        <div className="flex items-center gap-3 p-2 mb-2 rounded-xl bg-slate-900/80 border border-white/5">
          <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0" title={userEmail}>
            {userInitials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-white truncate" title={userName}>{userName}</p>
            <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
              <Briefcase className="h-3 w-3 text-primary" />
              {userCargo}
            </p>
          </div>
        </div>

        <Button
          onClick={handleCrmLogout}
          disabled={isLoggingOut}
          variant="outline"
          className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/60 hover:text-red-300 font-semibold text-xs h-9 rounded-xl justify-center gap-2 transition-all"
        >
          <LogOut className="h-3.5 w-3.5" />
          {isLoggingOut ? 'Encerrando...' : 'Sair do CRM'}
        </Button>
      </div>
    </aside>
  );
}
