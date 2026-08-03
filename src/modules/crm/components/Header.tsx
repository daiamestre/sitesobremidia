import { Link, useNavigate } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Search, 
  Bell, 
  Plus, 
  Briefcase
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

export function CrmHeader() {
  const navigate = useNavigate();
  const { userInitials, userName, userEmail } = useCrmSession();

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
        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-slate-300 hover:text-white hover:bg-white/10 rounded-xl"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-primary rounded-full ring-2 ring-slate-950 animate-pulse" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80 bg-slate-950 border-white/10 text-white rounded-xl p-2">
            <DropdownMenuLabel className="font-bold text-sm">Notificações Comerciais</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem className="p-3 text-xs focus:bg-slate-900 focus:text-white rounded-lg cursor-pointer">
              <div>
                <p className="font-bold text-white">Proposta Aprovada</p>
                <p className="text-slate-400">Academia FitLife aprovou o plano Anual.</p>
                <span className="text-[10px] text-primary mt-1 block">Há 15 minutos</span>
              </div>
            </DropdownMenuItem>
            <DropdownMenuItem className="p-3 text-xs focus:bg-slate-900 focus:text-white rounded-lg cursor-pointer">
              <div>
                <p className="font-bold text-white">Nova Visita Agendada</p>
                <p className="text-slate-400">Reunião presencial amanhã às 14:00.</p>
                <span className="text-[10px] text-primary mt-1 block">Há 1 hora</span>
              </div>
            </DropdownMenuItem>
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
          onClick={() => navigate('/representantes/clientes/novo')}
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
