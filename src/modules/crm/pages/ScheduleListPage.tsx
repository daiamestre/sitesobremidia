import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { agendamentoService, AgendamentoCompleto } from '../services/agendamento.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Calendar as CalendarIcon, Search, Eye, Loader2, Plus, Tv } from 'lucide-react';

export default function ScheduleListPage() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();
  const [schedules, setSchedules] = useState<AgendamentoCompleto[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchSchedules = useCallback(async () => {
    setLoading(true);
    const data = await agendamentoService.listSchedules(empresaOperadoraId || undefined);
    setSchedules(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const filtered = schedules.filter((s) => {
    const term = searchTerm.toLowerCase();
    return s.titulo.toLowerCase().includes(term) || (s.pedido_insercao?.numero_pi || '').toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-display font-extrabold text-white">Agendamento da Rede de Exibição</h2>
            <Badge className="bg-primary/20 text-primary border-primary/30 ml-2">FASE 7.5-C</Badge>
          </div>
          <p className="text-slate-300 text-sm">
            Programação Oficial de Mídia Signage, Validação de Conflitos e Grade por Tela.
          </p>
        </div>

        <Button
          onClick={() => navigate('/representantes/agendamento/calendario')}
          className="gradient-primary glow-primary font-bold text-xs px-5 py-2.5 rounded-xl shadow-xl gap-2"
        >
          <CalendarIcon className="h-4 w-4" />
          Ver Calendário Completo
        </Button>
      </div>

      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
          <div>
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Tv className="h-5 w-5 text-primary" />
              Agendamentos da Rede ({filtered.length})
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Conexão direta com Supabase PostgreSQL (Tabelas agendamentos e grade_exibicao)
            </CardDescription>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por título ou PI..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-slate-950/80 border-white/10 text-white rounded-xl h-10 text-xs"
            />
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs space-y-2">
              <p>Nenhum agendamento de exibição registrado.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow className="border-white/10">
                    <TableHead className="text-slate-300">Programação / Título</TableHead>
                    <TableHead className="text-slate-300">PI Vinculado</TableHead>
                    <TableHead className="text-slate-300">Período de Transmissão</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-right text-slate-300">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow key={s.id} className="border-white/10 hover:bg-white/5">
                      <TableCell>
                        <div className="font-bold text-white text-sm">{s.titulo}</div>
                        <span className="text-xs text-slate-400">{s.grade?.length || 1} Ponto(s) / Player(s)</span>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-purple-500/20 text-purple-400 font-mono text-[11px]">
                          {s.pedido_insercao?.numero_pi || 'PI'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-slate-300">
                        {new Date(s.inicio).toLocaleDateString('pt-BR')} até {new Date(s.fim).toLocaleDateString('pt-BR')}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-primary/20 text-primary border-primary/30">{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/representantes/agendamento/${s.id}`)}
                          className="border-primary/30 text-primary hover:bg-primary/10 text-xs gap-1 h-8"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Abrir Agendamento
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
