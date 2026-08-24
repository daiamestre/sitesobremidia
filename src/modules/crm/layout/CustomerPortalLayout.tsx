import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCentralUnread } from '@/hooks/useCentral';
import { useClienteModalidade } from '../hooks/useClienteModalidade';
import {
  LayoutDashboard, MapPin, Tv, DollarSign, LogOut, FileText,
  Calendar, Target, BarChart2, Bell, ShoppingBasket, BadgePercent,
  TrendingUp, Rocket, Menu, X, Loader2, Building2, Palette, FolderOpen, BookOpen
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { MobileBottomNav } from '@/components/portal/MobileBottomNav';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  somente?: ('ANUNCIANTE' | 'HOST' | 'HIBRIDO')[];
}

export default function CustomerPortalLayout() {
  const { user, usuario, signOut } = useAuth();
  const location = useLocation();
  const { total: totalNaoLidas } = useCentralUnread();
  const { modalidade, cliente, isLoading: loadingModalidade, isAnunciante, isHost, hasActiveContract } = useClienteModalidade();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Definição completa dos itens de navegação com restrição por modalidade
  const allNavItems: NavItem[] = useMemo(() => [
    { name: 'Dashboard',      path: '/portal',              icon: LayoutDashboard },
    { name: 'Contrato',       path: '/portal/contrato',     icon: FileText },
    // ANUNCIANTE + HÍBRIDO
    { name: 'Produtos',       path: '/portal/produtos',     icon: ShoppingBasket,  somente: ['ANUNCIANTE', 'HIBRIDO'] },
    { name: 'Ofertas',        path: '/portal/ofertas',      icon: BadgePercent,    somente: ['ANUNCIANTE', 'HIBRIDO'] },
    { name: 'Minhas Campanhas', path: '/portal/campanhas',  icon: Tv,             somente: ['ANUNCIANTE', 'HIBRIDO'] },
    // HOST + HÍBRIDO
    { name: 'Minha Rede',     path: '/portal/minha-rede',   icon: MapPin,          somente: ['HOST', 'HIBRIDO'] },
    { name: 'Ocupação da Rede', path: '/portal/ocupacao',   icon: Target,         somente: ['HOST', 'HIBRIDO'] },
    { name: 'Receita',        path: '/portal/receita',      icon: DollarSign,      somente: ['HOST', 'HIBRIDO'] },
    // TODOS
    { name: 'Brand Kit',      path: '/portal/brand-kit',    icon: Palette },
    { name: 'Asset Library',  path: '/portal/assets',       icon: FolderOpen },
    { name: 'Encarte Digital',path: '/portal/encarte',      icon: BookOpen,        somente: ['ANUNCIANTE', 'HIBRIDO'] },
    { name: 'Meus Pontos',    path: '/portal/pontos',       icon: MapPin,          somente: ['ANUNCIANTE', 'HIBRIDO'] }, 
    { name: 'Inserções/Dia',  path: '/portal/insercoes',    icon: Calendar },
    { name: 'Financeiro',     path: '/portal/financeiro',   icon: DollarSign },
    // ANUNCIANTE + HÍBRIDO
    { name: 'Expansão',       path: '/portal/expansao',     icon: TrendingUp,      somente: ['ANUNCIANTE', 'HIBRIDO'] },
    { name: 'Onboarding',     path: '/portal/onboarding',   icon: Rocket },
    { name: 'Mensagens',      path: '/portal/central',      icon: Bell,            badge: totalNaoLidas },
  ], [totalNaoLidas]);

  if (!user || !usuario || !usuario.cliente_id) {
    return <Navigate to="/auth" replace />;
  }

  // Filtrar navegação por modalidade
  const navItems = allNavItems.filter((item) => {
    if (!item.somente || !modalidade) return true; // sem restrição ou modalidade ainda não carregada
    return item.somente.includes(modalidade as 'ANUNCIANTE' | 'HOST' | 'HIBRIDO');
  });

  // PROTEÇÃO DE ROTA (Ocultação visual + Proteção lógica)
  if (!loadingModalidade) {
    // 1. Forçar Onboarding se não houver contrato ativo
    if (!hasActiveContract && location.pathname !== '/portal/onboarding') {
      console.warn('[Security] Cliente sem contrato ativo. Forçando onboarding.');
      return <Navigate to="/portal/onboarding" replace />;
    }

    // 2. Proteção por modalidade
    if (modalidade) {
      const currentNavItem = allNavItems.find(item => 
        location.pathname === item.path || (item.path !== '/portal' && location.pathname.startsWith(item.path))
      );
      
      if (currentNavItem && currentNavItem.somente && !currentNavItem.somente.includes(modalidade as 'ANUNCIANTE' | 'HOST' | 'HIBRIDO')) {
        console.warn(`[Security] Rota ${location.pathname} não permitida para modalidade ${modalidade}`);
        return <Navigate to="/portal" replace />;
      }
    }
  }

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/portal' && location.pathname.startsWith(path));

  const nomeCliente = cliente?.nome_fantasia || cliente?.razao_social || usuario.nome;

  // Badge de modalidade
  const modalidadeBadgeColor = {
    ANUNCIANTE: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    HOST: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    HIBRIDO: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  };

  const NavLinks = ({ onClick }: { onClick?: () => void }) => (
    <>
      {navItems.map((item) => {
        const active = isActive(item.path);
        return (
          <Link key={item.path} to={item.path} onClick={onClick}>
            <Button
              variant="ghost"
              className={cn(
                'text-sm gap-2 rounded-xl transition-all w-full justify-start md:justify-center',
                active
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              )}
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              <span>{item.name}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className="min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center ml-auto">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </Button>
          </Link>
        );
      })}
    </>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-slate-950/90 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4 gap-4">
          {/* Logo + Modalidade */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              SOBRE MÍDIA
            </h1>
            {modalidade && !loadingModalidade && (
              <Badge className={cn('text-[10px] border', modalidadeBadgeColor[modalidade])}>
                {modalidade}
              </Badge>
            )}
            {loadingModalidade && (
              <Loader2 className="h-3 w-3 animate-spin text-slate-500" />
            )}
          </div>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-1 overflow-x-auto flex-1 justify-center">
            <NavLinks />
          </nav>

          {/* Usuário + Sair + Mobile Menu Toggle */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <div className="hidden sm:flex items-center gap-2">
              <Building2 className="h-3 w-3 text-slate-400" />
              <span className="text-sm font-medium text-slate-300 max-w-[120px] truncate">
                {nomeCliente}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={signOut}
              className="border-white/10 text-slate-300 hover:bg-rose-500/10 hover:text-rose-400 gap-2 rounded-xl hidden sm:flex"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Drawer Nav */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-white/10 bg-slate-950/95 backdrop-blur-xl px-4 py-3 space-y-1 max-h-[70vh] overflow-y-auto">
            <NavLinks onClick={() => setMobileMenuOpen(false)} />
            <div className="pt-3 border-t border-white/10 flex items-center justify-between">
              <span className="text-sm text-slate-400">{nomeCliente}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={signOut}
                className="text-rose-400 hover:bg-rose-500/10 gap-2"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </Button>
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto p-4 sm:p-6 overflow-hidden mb-16 md:mb-0">
        <Outlet context={{ modalidade, cliente, isAnunciante, isHost }} />
      </main>
      
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav 
        navItems={navItems} 
        isActive={isActive} 
        onMenuClick={() => setMobileMenuOpen(true)} 
      />
    </div>
  );
}
