import { Outlet, Navigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { LayoutDashboard, MapPin, Tv, DollarSign, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CustomerPortalLayout() {
  const { user, usuario, signOut } = useAuth();
  const location = useLocation();

  if (!user || !usuario || !usuario.cliente_id) {
    return <Navigate to="/auth" replace />;
  }

  const navItems = [
    { name: 'Dashboard', path: '/portal', icon: LayoutDashboard },
    { name: 'Meus Pontos', path: '/portal/pontos', icon: MapPin },
    { name: 'Minhas Campanhas', path: '/portal/campanhas', icon: Tv },
    { name: 'Financeiro', path: '/portal/financeiro', icon: DollarSign },
  ];

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col">
      <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-slate-950/80 backdrop-blur-xl">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">
              SOBRE MÍDIA
            </h1>
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const isActive = location.pathname === item.path || (item.path !== '/portal' && location.pathname.startsWith(item.path));
                return (
                  <Link key={item.path} to={item.path}>
                    <Button 
                      variant="ghost" 
                      className={`text-sm gap-2 rounded-xl transition-all ${isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'}`}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.name}
                    </Button>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-medium text-slate-300 hidden sm:inline-block">
              {usuario.nome}
            </span>
            <Button variant="outline" size="sm" onClick={signOut} className="border-white/10 text-slate-300 hover:bg-rose-500/10 hover:text-rose-400 gap-2 rounded-xl">
              <LogOut className="h-4 w-4" />
              Sair
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto p-4 sm:p-6 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
