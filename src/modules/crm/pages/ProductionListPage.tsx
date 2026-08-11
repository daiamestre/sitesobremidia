import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { producaoService, ProducaoCompleta } from '../services/producao.service';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Film, Search, Plus, Eye, Loader2, Calendar } from 'lucide-react';

export default function ProductionListPage() {
  const navigate = useNavigate();
  const { empresaOperadoraId } = useAuth();
  const [producoes, setProducoes] = useState<ProducaoCompleta[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchProducoes = useCallback(async () => {
    setLoading(true);
    const data = await producaoService.listProductions(empresaOperadoraId || undefined);
    setProducoes(data);
    setLoading(false);
  }, [empresaOperadoraId]);

  useEffect(() => {
    fetchProducoes();
  }, [fetchProducoes]);

  const filtered = producoes.filter((p) => {
    const term = searchTerm.toLowerCase();
    const emp = p.cliente?.empresas?.[0];
    return (
      p.titulo.toLowerCase().includes(term) ||
      (emp?.nome_fantasia || '').toLowerCase().includes(term) ||
      (p.pedido_insercao?.numero_pi || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Film className="h-6 w-6 text-primary" />
            <h2 className="text-2xl font-display font-extrabold text-white">Módulo de Produção de Mídia</h2>
            <Badge className="bg-primary/20 text-primary border-primary/30 ml-2">FASE 7.5-B</Badge>
          </div>
          <p className="text-slate-300 text-sm">
            Gestão de Artes, Upload R2, Versionamento, Aprovações e Publicação para Agendamento.
          </p>
        </div>
      </div>

      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4">
          <div>
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Film className="h-5 w-5 text-primary" />
              Produções Operacionais Ativas ({filtered.length})
            </CardTitle>
            <CardDescription className="text-slate-400 text-xs">
              Conectadas diretamente ao Supabase PostgreSQL e R2 Storage
            </CardDescription>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Buscar por título, cliente ou PI..."
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
              <p>Nenhuma produção de mídia cadastrada no momento.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 overflow-hidden">
              <Table>
                <TableHeader className="bg-slate-950">
                  <TableRow className="border-white/10">
                    <TableHead className="text-slate-300">Produção / Campanha</TableHead>
                    <TableHead className="text-slate-300">Cliente / PI</TableHead>
                    <TableHead className="text-slate-300">Mídias Salvas</TableHead>
                    <TableHead className="text-slate-300">Status</TableHead>
                    <TableHead className="text-right text-slate-300">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const emp = p.cliente?.empresas?.[0];
                    return (
                      <TableRow key={p.id} className="border-white/10 hover:bg-white/5">
                        <TableCell>
                          <div className="font-bold text-white text-sm">{p.titulo}</div>
                          <span className="text-xs text-slate-400">Prazo: {p.prazo ? new Date(p.prazo).toLocaleDateString('pt-BR') : 'A definir'}</span>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs text-slate-200 font-semibold">{emp?.nome_fantasia || 'Cliente'}</div>
                          <span className="text-[11px] text-purple-400 font-mono block">{p.pedido_insercao?.numero_pi || 'PI'}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-white/10 text-slate-300 text-xs">
                            {p.midias?.length || 0} Arquivo(s) R2
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-primary/20 text-primary border-primary/30">{p.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              const basePath = window.location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
                              navigate(`${basePath}/campanhas/${p.id}`);
                            }}
                            className="border-primary/30 text-primary hover:bg-primary/10 text-xs gap-1 h-8"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Abrir Produção
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
