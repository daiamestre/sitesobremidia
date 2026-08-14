import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search,
  Bell,
  Plus,
  Briefcase,
  Loader2,
  CheckCircle2,
  Inbox,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCrmSession } from '../contexts/CrmSessionContext';
import { useCentralUnread } from '@/hooks/useCentral';
import { useQuery } from '@tanstack/react-query';
import { centralService } from '@/services/central.service';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/utils/formatters';

export function CrmHeader() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userInitials, userName, userEmail } = useCrmSession();
  const { total: totalNaoLidas } = useCentralUnread();

  const basePath = location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
  const centralPath = `${basePath}/central`;

  const { data: recentes, isLoading: loadingRecentes } = useQuery({
    queryKey: ['central-recentes'],
    queryFn: () => centralService.listarNotificacoes({ itensPorPagina: 8 }),
    staleTime: 20000,
  });

  return (
    <header className="sticky top-0 z-20 bg-slate-950/80 backdrop-blur-md border-b border-white/10 px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
      {/* Left Title & Mobile Brand */}
      <div className="flex items-center gap-3">
        <div className="md:hidden">
          <Logo size="sm" />
        </div>
        <div className="hidden md:flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10 border border-primary/20 text-primary">
            <Briefcase className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display font-extrabold text-white text-lg leading-none">CRM Comercial</h1>
            <p className="text-xs text-slate-400 mt-0.5">Gestão de Vendas & Clientes</p>
          </div>
        </div>
      </div>

      {/* Center Search Bar */}
      <div className="flex-1 max-w-md hidden sm:block">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            type="text"
            placeholder="Pesquisar clientes, propostas ou CNPJ..."
            className="pl-10 bg-slate-900/80 border-white/10 text-white placeholder:text-slate-500 rounded-xl h-10 text-sm focus:border-primary/60 focus:ring-primary/20"
          />
        </div>
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        {/* Notificações — Sino Global conectado à Central (dados reais + realtime) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-slate-300 hover:text-white hover:bg-white/10 rounded-xl"
              aria-label={`Notificações${totalNaoLidas > 0 ? ` (${totalNaoLidas} não lidas)` : ''}`}
            >
              <Bell className="h-5 w-5" />
              {totalNaoLidas > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-slate-950">
                  {totalNaoLidas > 99 ? '99+' : totalNaoLidas}
                </span>
              ) : (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-slate-600 rounded-full ring-2 ring-slate-950" />
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 bg-slate-950 border-white/10 text-white rounded-xl p-2">
            <DropdownMenuLabel className="font-bold text-sm flex items-center justify-between">
              <span>Central de Comunicação</span>
              {totalNaoLidas > 0 && (
                <span className="text-[10px] text-primary font-semibold">{totalNaoLidas} não lidas</span>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />

            {loadingRecentes ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            ) : recentes && recentes.length > 0 ? (
              recentes.slice(0, 5).map((n) => (
                <DropdownMenuItem
                  key={n.id}
                  className="p-3 text-xs focus:bg-slate-900 focus:text-white rounded-lg cursor-pointer flex flex-col items-start gap-1"
                  onClick={() => {
                    centralService.marcarComoLida(n.id);
                    navigate(centralPath);
                  }}
                >
                  <div className="flex items-center gap-2 w-full">
                    <span
                      className={cn(
                        'w-2 h-2 rounded-full flex-shrink-0',
                        n.status_notificacao === 'NAO_LIDA' ? 'bg-primary' : 'bg-slate-600'
                      )}
                    />
                    <p className={cn('font-bold text-white', n.status_notificacao === 'LIDA' && 'text-slate-400 font-semibold')}>
                      {n.titulo}
                    </p>
                    {n.prioridade === 'CRITICO' && (
                      <span className="ml-auto text-[9px] font-bold text-red-400 border border-red-500/40 rounded px-1">CRÍTICO</span>
                    )}
                  </div>
                  <p className="text-slate-400 line-clamp-1 w-full pl-4">{n.mensagem}</p>
                  <span className="text-[10px] text-primary mt-0.5 pl-4">{formatDateTime(n.created_at)}</span>
                </DropdownMenuItem>
              ))
            ) : (
              <div className="py-6 text-center text-xs text-slate-500">
                <Inbox className="h-6 w-6 mx-auto mb-2 opacity-40" />
                Nenhuma notificação no momento.
              </div>
            )}

            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem
              className="text-xs font-semibold text-primary justify-center py-2 focus:bg-slate-900 rounded-lg cursor-pointer"
              onClick={() => navigate(centralPath)}
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
              Abrir Central de Comunicação
            </DropdownMenuItem>
            {totalNaoLidas > 0 && (
              <DropdownMenuItem
                className="text-xs text-slate-300 justify-center py-2 focus:bg-slate-900 rounded-lg cursor-pointer"
                onClick={() => centralService.marcarTodasComoLidas()}
              >
                Marcar todas como lidas
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Representative Avatar */}
        <div className="flex items-center gap-2 pl-2 border-l border-white/10" title={`${userName} (${userEmail})`}>
          <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm shadow-md">
            {userInitials}
          </div>
        </div>

        {/* MAIN TOP RIGHT BUTTON: + Novo Cliente */}
        <Button
          onClick={() => navigate(`${basePath}/clientes/novo`)}
          size="lg"
          className="gradient-primary glow-primary font-bold text-sm px-5 py-2.5 h-10 rounded-xl shadow-xl transition-all duration-300 hover:scale-105 gap-2"
        >
          <Plus className="h-4 w-4" />
          <span>+ Novo Cliente</span>
        </Button>
      </div>
    </header>
  );
}