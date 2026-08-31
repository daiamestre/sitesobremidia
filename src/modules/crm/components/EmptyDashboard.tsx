import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Briefcase, FileText, Users, ArrowUpRight } from 'lucide-react';

interface EmptyDashboardProps {
  userName?: string;
}

export function EmptyDashboard({ userName = 'Representante' }: EmptyDashboardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';

  return (
    <div className="space-y-6 animate-fade-in my-8">
      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl p-8 text-center relative overflow-hidden max-w-4xl mx-auto">
        <div className="absolute right-0 top-0 w-96 h-full bg-gradient-to-l from-primary/10 via-primary/5 to-transparent pointer-events-none" />
        <CardContent className="space-y-6 relative z-10 p-0">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-purple-500/10 border border-primary/30 flex items-center justify-center mx-auto shadow-xl glow-primary">
            <Briefcase className="h-10 w-10 text-primary animate-pulse" />
          </div>

          <div className="space-y-2 max-w-lg mx-auto">
            <h3 className="text-2xl font-display font-extrabold text-white">
              Bem-vindo ao CRM, {userName}!
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              Ainda não existem clientes ativamente cadastrados, propostas veiculadas ou contratos vinculados para sua carteira comercial.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 py-4 text-left">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-bold">1. PROSPECÇÃO</span>
                <Users className="h-4 w-4 text-cyan-400" />
              </div>
              <p className="text-xs text-slate-300">Cadastre seu primeiro prospect, empresa e pontos de interesse.</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-bold">2. NEGOCIAÇÃO</span>
                <FileText className="h-4 w-4 text-purple-400" />
              </div>
              <p className="text-xs text-slate-300">Emita propostas customizadas para ativação digital e publicidade em telas.</p>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-slate-400 font-bold">3. FECHAMENTO</span>
                <ArrowUpRight className="h-4 w-4 text-emerald-400" />
              </div>
              <p className="text-xs text-slate-300">Acompanhe suas comissões recorrentes em tempo real a cada contrato firmado.</p>
            </div>
          </div>

          <div className="pt-2">
            <Button
              onClick={() => navigate(`${basePath}/clientes/novo`)}
              size="lg"
              className="gradient-primary glow-primary font-bold text-base px-8 py-4 h-12 rounded-xl shadow-2xl transition-all duration-300 hover:scale-105 inline-flex items-center gap-2"
            >
              <Plus className="h-5 w-5" />
              <span>+ Cadastrar Seu Primeiro Cliente</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
