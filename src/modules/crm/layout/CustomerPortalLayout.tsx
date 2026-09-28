import { useState, useMemo } from 'react';
import { Outlet, Navigate, Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCentralUnread } from '@/hooks/useCentral';
import { useClienteModalidade, type ModalidadePortal } from '../hooks/useClienteModalidade';
import {
  LayoutDashboard, MapPin, LogOut, FileText,
  Calendar, Megaphone, Library, ListVideo, ImagePlus,
  TrendingUp, Rocket, Menu, X, Loader2, Building2,
  ShoppingBasket, BadgePercent, BookOpen, Settings,
  Briefcase, Home, MessageSquare, LifeBuoy, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { MobileBottomNav } from '@/components/portal/MobileBottomNav';

interface NavItem {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  somente?: ('ANUNCIANTE' | 'HOST' | 'HIBRIDO')[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
  somente?: ('ANUNCIANTE' | 'HOST' | 'HIBRIDO')[];
}

export default function CustomerPortalLayout() {
  const { user, usuario, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { total: totalNaoLidas } = useCentralUnread();
  const { modalidade, cliente, isLoading: loadingModalidade, hasActiveContract } = useClienteModalidade();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, toggleSidebar] = useSidebarCollapsed('portal');
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const isAnuncianteOuHibrido = modalidade === 'ANUNCIANTE' || modalidade === 'HIBRIDO';
  const isHostOuHibrido = modalidade === 'HOST' || modalidade === 'HIBRIDO';

  // ============================================================
  // NAVEGAÇÃO — estrutura SOBRE MÍDIA Portal do Anunciante (missão §5)
  // Sidebar lateral persistente exclusivamente para ANUNCIANTE/HOST/HÍBRIDO.
  // NUNCA expõe links para ERP, CRM, Admin, Representante, Gestor ou Owner.
  // ============================================================
  const navGroups: NavGroup[] = useMemo(() => [
    {
      label: 'Principal',
      items: [
        { name: 'Início',              path: '/portal',            icon: Home },
        { name: 'Mensagens',           path: '/portal/central',    icon: MessageSquare, badge: totalNaoLidas },
        { name: 'Contratos e Faturas', path: '/portal/financeiro', icon: FileText },
      ],
    },
    {
      label: 'Publicidade',
      somente: ['ANUNCIANTE', 'HIBRIDO'],
      items: [
        { name: 'Minhas Campanhas',    path: '/portal/campanhas',     icon: Megaphone },
        { name: 'Nova Campanha',       path: '/portal/nova-campanha', icon: Rocket },
        { name: 'Inserções por Dia',   path: '/portal/insercoes',     icon: Calendar },
        { name: 'Playlists',           path: '/portal/playlists',     icon: ListVideo },
      ],
    },
    {
      label: 'Minhas Mídias',
      somente: ['ANUNCIANTE', 'HIBRIDO'],
      items: [
        { name: 'Minhas Mídias',        path: '/portal/assets',     icon: ImagePlus },
        { name: 'Biblioteca de Mídias', path: '/portal/biblioteca', icon: Library },
      ],
    },
    {
      label: 'Meus Pontos',
      somente: ['ANUNCIANTE', 'HIBRIDO'],
      items: [
        { name: 'Meus Pontos',          path: '/portal/pontos',    icon: MapPin },
        { name: 'Pontos para Anunciar', path: '/portal/expansao',  icon: TrendingUp },
      ],
    },
    {
      label: 'Comércio',
      somente: ['ANUNCIANTE', 'HIBRIDO'],
      items: [
        { name: 'Produtos',        path: '/portal/produtos',  icon: ShoppingBasket },
        { name: 'Ofertas',         path: '/portal/ofertas',   icon: BadgePercent },
        { name: 'Encarte Digital', path: '/portal/encarte',   icon: BookOpen },
      ],
    },
    {
      label: 'Rede (Host)',
      somente: ['HOST', 'HIBRIDO'],
      items: [
        { name: 'Minha Rede',       path: '/portal/minha-rede', icon: MapPin },
        { name: 'Ocupação da Rede', path: '/portal/ocupacao',   icon: LayoutDashboard },
        { name: 'Receita',          path: '/portal/receita',    icon: FileText },
      ],
    },
    {
      label: 'Conta',
      items: [
        { name: 'Meu Perfil',    path: '/portal/perfil',         icon: Briefcase },
        { name: 'Suporte',       path: '/portal/central?aba=suporte', icon: LifeBuoy },
        { name: 'Configurações', path: '/portal/configuracoes',  icon: Settings },
      ],
    },
  ], [totalNaoLidas]);

  // Filtra grupos e itens pela modalidade do cliente
  const itemAllowed = (item: NavItem) =>
    !item.somente || !modalidade || item.somente.includes(modalidade as ModalidadePortal);

  const groupAllowed = (g: NavGroup) =>
    !g.somente || !modalidade || g.somente.includes(modalidade as ModalidadePortal);

  // Lista plana de todos os paths permitidos (para proteção de rota interna)
  const allowedPaths = useMemo(() => {
    const paths = new Set<string>();
    const _itemAllowed = (item: NavItem) =>
      !item.somente || !modalidade || item.somente.includes(modalidade as ModalidadePortal);
    const _groupAllowed = (g: NavGroup) =>
      !g.somente || !modalidade || g.somente.includes(modalidade as ModalidadePortal);
    navGroups.forEach((g) => {
      if (_groupAllowed(g)) {
        g.items.filter(_itemAllowed).forEach((i) => paths.add(i.path));
      }
    });
    // Rotas do portal permitidas por modalidade - Anunciante e Híbrido
    const isAnuncianteOuHibrido = modalidade === 'ANUNCIANTE' || modalidade === 'HIBRIDO';
    if (isAnuncianteOuHibrido) {
      paths.add('/portal');
      paths.add('/portal/contrato');
      paths.add('/portal/onboarding');
      paths.add('/portal/nova-campanha');
      paths.add('/portal/campanhas');
      paths.add('/portal/insercoes');
      paths.add('/portal/playlists');
      paths.add('/portal/pontos');
      paths.add('/portal/expansao');
      paths.add('/portal/financeiro');
      paths.add('/portal/central');
      paths.add('/portal/perfil');
      paths.add('/portal/configuracoes');
      paths.add('/portal/assets');
      paths.add('/portal/biblioteca');
      paths.add('/portal/ofertas');
      paths.add('/portal/produtos');
      paths.add('/portal/encarte');
    }
    return paths;
  }, [navGroups, modalidade]);

  // ============================================================
  // GUARDA DE IDENTIDADE: anunciante DEVE ter cliente_id
  // ============================================================
  if (!user || !usuario || !usuario.cliente_id) {
    return <Navigate to="/auth" replace />;
  }

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/portal' && location.pathname.startsWith(path));

  // ============================================================
  // PROTEÇÃO DE ROTA INTERNA DO PORTAL
  // HOST/HÍBRIDO sem contrato → onboarding
  // Rota desconhecida dentro do portal → /portal
  // ============================================================
  if (!loadingModalidade) {
    const legadoSemModalidade = !modalidade;
    const hostSemContrato =
      (modalidade === 'HOST' || modalidade === 'HIBRIDO') && !hasActiveContract;

    if ((legadoSemModalidade || hostSemContrato) && location.pathname !== '/portal/onboarding') {
      return <Navigate to="/portal/onboarding" replace />;
    }

    // Proteção: rota desconhecida dentro do portal → home do portal
    const isPortalRoute =
      location.pathname === '/portal' ||
      location.pathname === '/portal/onboarding' ||
      [...allowedPaths].some(
        (p) => p !== '/portal' && location.pathname.startsWith(p)
      );

    if (!isPortalRoute) {
      return <Navigate to="/portal" replace />;
    }
  }

  const nomeCliente = cliente?.nome_fantasia || cliente?.razao_social || usuario.nome;

  const modalidadeBadgeColor: Record<string, string> = {
    ANUNCIANTE: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
    HOST: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    HIBRIDO: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  };

  // Items planos para o MobileBottomNav (apenas principais)
  const mobileNavItems = navGroups[0]?.items.filter(itemAllowed) ?? [];

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen w-full max-w-full bg-slate-950 text-white flex flex-col overflow-x-clip">
      {/* ── Header ── */}
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-slate-950/90 backdrop-blur-xl flex-shrink-0">
        <div className="flex h-16 items-center justify-between px-4 gap-4">
          {/* Menu + foto do usuário + Logo + Modalidade (tudo à esquerda) */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <Button
              variant="ghost"
              size="icon"
              className="xl:hidden text-slate-300 hover:text-white hover:bg-white/10 h-9 w-9 flex-shrink-0"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menu"
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              aria-label={sidebarCollapsed ? 'Abrir menu lateral' : 'Recolher menu lateral'}
              title={sidebarCollapsed ? 'Abrir menu lateral' : 'Recolher menu lateral'}
              aria-expanded={!sidebarCollapsed}
              className="hidden xl:inline-flex text-slate-300 hover:text-white hover:bg-white/10 h-9 w-9"
            >
              {sidebarCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
            </Button>
            <Link to="/portal/perfil" className="flex-shrink-0" title="Meu Perfil" aria-label="Meu Perfil">
              {usuario.avatar_url ? (
                <img
                  src={usuario.avatar_url}
                  alt={usuario.nome || 'Foto de perfil'}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-primary/60"
                />
              ) : (
                <span className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-purple-600 ring-2 ring-primary/60 flex items-center justify-center text-white font-bold">
                  {(usuario.nome || nomeCliente || 'A').charAt(0).toUpperCase()}
                </span>
              )}
            </Link>
            <Link to="/portal" className="flex items-center gap-2 min-w-0">
              <h1 className="text-lg sm:text-xl font-bold whitespace-nowrap bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
                SOBRE MÍDIA
              </h1>
            </Link>
            {modalidade && !loadingModalidade && (
              <Badge className={cn('text-[10px] border hidden sm:inline-flex', modalidadeBadgeColor[modalidade])}>
                {modalidade === 'ANUNCIANTE' ? 'Anunciante' : modalidade === 'HIBRIDO' ? 'Híbrido' : 'Host'}
              </Badge>
            )}
            {loadingModalidade && (
              <Loader2 className="h-3 w-3 animate-spin text-slate-500" />
            )}
          </div>

          {/* Nome do cliente à direita — o botão Sair fica só no fim do menu lateral */}
          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
            <span className="text-sm font-medium text-slate-200 max-w-[38vw] sm:max-w-[220px] truncate" title={nomeCliente}>
              {nomeCliente}
            </span>
          </div>
        </div>
      </header>

      {/* ── Layout Principal ── */}
      <div className="flex flex-1 w-full max-w-full overflow-hidden overflow-x-clip min-w-0">
        {/* ── Sidebar Lateral Persistente (desktop) — oculta em mobile para drawer ── */}
        <aside
          className={cn(
            // Menu fixo só a partir de 1280 px (recolhível); abaixo disso abre por cima do conteúdo pelo botão do topo
            'hidden xl:flex bg-slate-950 border-r border-white/10 flex-shrink-0 flex-col overflow-y-auto sticky top-0 h-[calc(100vh-4rem)] z-30 select-none transition-[width] duration-200',
            sidebarCollapsed ? 'w-[72px]' : 'w-64',
          )}
        >
          {/* Navegação por grupos */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto max-h-[calc(100vh-170px)] custom-scrollbar">
            {navGroups.filter(groupAllowed).map((group) => {
              const items = group.items.filter(itemAllowed);
              if (!items.length) return null;
              return (
                <div key={group.label} className="pt-3">
                  {sidebarCollapsed ? (
                    <div className="mx-2 mb-2 border-t border-white/10" aria-hidden />
                  ) : (
                    <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 select-none">
                      {group.label}
                    </p>
                  )}
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <Link
                        key={item.path}
                        to={item.path}
                        onClick={() => setMobileMenuOpen(false)}
                        title={sidebarCollapsed ? item.name : undefined}
                        aria-label={sidebarCollapsed ? item.name : undefined}
                      >
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            'relative w-full gap-2 rounded-xl text-sm transition-all duration-150',
                            sidebarCollapsed ? 'justify-center px-0' : 'justify-start',
                            isActive(item.path)
                              ? 'bg-white/10 text-white font-semibold'
                              : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                          )}
                        >
                          <item.icon className="h-4 w-4 flex-shrink-0" />
                          {!sidebarCollapsed && <span className="truncate">{item.name}</span>}
                          {sidebarCollapsed && item.badge !== undefined && item.badge > 0 && (
                            <span className="absolute top-1 right-2 w-2 h-2 rounded-full bg-primary ring-2 ring-slate-950" />
                          )}
                          {!sidebarCollapsed && item.badge !== undefined && item.badge > 0 && (
                            <span className="min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center ml-auto flex-shrink-0">
                              {item.badge > 99 ? '99+' : item.badge}
                            </span>
                          )}
                        </Button>
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* Seção do usuário no rodapé da sidebar */}
          <div className={cn('border-t border-white/10 bg-slate-900/50 flex-shrink-0', sidebarCollapsed ? 'p-2' : 'p-3')}>
            <div className={cn('flex items-center gap-3 mb-2 rounded-xl bg-slate-900/80 border border-white/5', sidebarCollapsed ? 'p-1.5 justify-center' : 'p-2')}>
              {usuario.avatar_url ? (
                <img src={usuario.avatar_url} alt="" title={user?.email}
                  className="w-9 h-9 rounded-full object-cover shadow-md flex-shrink-0" />
              ) : (
                <div
                  className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-md flex-shrink-0"
                  title={user?.email}
                >
                  {(usuario.nome || 'A').charAt(0).toUpperCase()}
                </div>
              )}
              <div className={cn('min-w-0 flex-1', sidebarCollapsed && 'hidden')}>
                <p className="text-xs font-bold text-white truncate" title={usuario.nome || ''}>
                  {usuario.nome || 'Anunciante'}
                </p>
                <p className="text-[11px] text-slate-400 truncate flex items-center gap-1">
                  <Briefcase className="h-3 w-3 text-primary flex-shrink-0" />
                  {nomeCliente || 'Anunciante'}
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleSignOut}
              disabled={isLoggingOut}
              className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/60 hover:text-red-300 font-semibold text-xs h-9 rounded-xl justify-center gap-2 transition-all"
            >
              <LogOut className="h-3.5 w-3.5" />
              {!sidebarCollapsed && (isLoggingOut ? 'Encerrando...' : 'Sair do Portal')}
            </Button>
          </div>
        </aside>

        {/* ── Menu Mobile (overlay) ── */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-[60] xl:hidden">
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileMenuOpen(false)}
            />
            {/* Drawer */}
            <aside className="absolute left-0 top-0 bottom-0 w-72 bg-slate-950 border-r border-white/10 flex flex-col overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b border-white/10">
                <span className="font-bold text-white">Menu</span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                {navGroups.filter(groupAllowed).map((group) => {
                  const items = group.items.filter(itemAllowed);
                  if (!items.length) return null;
                  return (
                    <div key={group.label} className="pt-3">
                      <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500 select-none">
                        {group.label}
                      </p>
                      <div className="space-y-0.5">
                        {items.map((item) => (
                          <Link
                            key={item.path}
                            to={item.path}
                            onClick={() => setMobileMenuOpen(false)}
                          >
                            <Button
                              variant="ghost"
                              size="sm"
                              className={cn(
                                'w-full justify-start gap-2 rounded-xl text-sm',
                                isActive(item.path)
                                  ? 'bg-white/10 text-white font-semibold'
                                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                              )}
                            >
                              <item.icon className="h-4 w-4 flex-shrink-0" />
                              <span className="truncate">{item.name}</span>
                              {item.badge !== undefined && item.badge > 0 && (
                                <span className="min-w-4 h-4 px-1 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center ml-auto">
                                  {item.badge > 99 ? '99+' : item.badge}
                                </span>
                              )}
                            </Button>
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </nav>
              <div className="p-3 border-t border-white/10">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSignOut}
                  disabled={isLoggingOut}
                  className="w-full border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  {isLoggingOut ? 'Encerrando...' : 'Sair do Portal'}
                </Button>
              </div>
            </aside>
          </div>
        )}

        {/* ── Conteúdo Principal — pb-20 evita sobreposição do MobileBottomNav ── */}
        <main className="flex-1 w-full max-w-full min-w-0 overflow-y-auto overflow-x-clip p-4 sm:p-6 lg:p-8 pb-20 lg:pb-8 box-border">
          <div className="w-full max-w-full min-w-0">
            <Outlet context={{ modalidade, cliente, isAnunciante: isAnuncianteOuHibrido, isHost: isHostOuHibrido }} />
          </div>
        </main>
      </div>

      {/* ── Mobile Bottom Navigation ── */}
      <MobileBottomNav
        navItems={mobileNavItems}
        isActive={isActive}
      />
    </div>
  );
}