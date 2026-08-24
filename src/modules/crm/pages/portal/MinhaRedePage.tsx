import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useClienteModalidade } from '../../hooks/useClienteModalidade';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MapPin, Tv, Activity, Building2, MonitorPlay, CheckCircle2, AlertCircle, Wifi, WifiOff } from 'lucide-react';

// Mock data until the relation HOST -> Unidades is fully mapped in DB
const MOCK_ESTABELECIMENTOS = [
  {
    id: '1',
    nome: 'Supermercado Central - Matriz',
    cidade: 'São Paulo',
    estado: 'SP',
    status: 'ATIVO',
    telas: [
      { id: 't1', nome: 'Tela Corredor 1', status: 'ONLINE', ocupacao: 85, lastPing: 'Agora' },
      { id: 't2', nome: 'Tela Caixa', status: 'ONLINE', ocupacao: 90, lastPing: 'Há 2 min' },
    ]
  },
  {
    id: '2',
    nome: 'Supermercado Central - Filial Sul',
    cidade: 'São Paulo',
    estado: 'SP',
    status: 'ATIVO',
    telas: [
      { id: 't3', nome: 'Tela Entrada', status: 'OFFLINE', ocupacao: 0, lastPing: 'Há 2 horas' },
    ]
  }
];

export default function MinhaRedePage() {
  const { isHost } = useClienteModalidade();
  const [estabelecimentos] = useState(MOCK_ESTABELECIMENTOS);

  if (!isHost) {
    return (
      <div className="flex items-center justify-center h-[60vh] text-slate-400">
        <div className="text-center space-y-4">
          <AlertCircle className="h-12 w-12 mx-auto text-slate-600" />
          <h2 className="text-xl font-bold text-white">Acesso Restrito</h2>
          <p>Esta página é exclusiva para clientes da modalidade HOST (Hospedadores de Telas).</p>
        </div>
      </div>
    );
  }

  const totalTelas = estabelecimentos.reduce((acc, est) => acc + est.telas.length, 0);
  const telasOnline = estabelecimentos.reduce((acc, est) => acc + est.telas.filter(t => t.status === 'ONLINE').length, 0);

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      {/* Header */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" /> Minha Rede de Telas
          </h2>
          <p className="text-slate-400 text-sm mt-1">Gerencie seus estabelecimentos e o status das telas hospedadas.</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <MapPin className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Estabelecimentos</p>
              <h3 className="text-2xl font-bold text-white">{estabelecimentos.length}</h3>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple-500/20 text-purple-400 border border-purple-500/30">
              <Tv className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Total de Telas</p>
              <h3 className="text-2xl font-bold text-white">{totalTelas}</h3>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Activity className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium text-slate-400">Telas Online</p>
              <h3 className="text-2xl font-bold text-white">{telasOnline} <span className="text-sm font-normal text-slate-400">/ {totalTelas}</span></h3>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lista de Estabelecimentos */}
      <div className="space-y-4">
        {estabelecimentos.map((est) => (
          <Card key={est.id} className="border border-white/10 bg-slate-900/70 overflow-hidden">
            <CardHeader className="bg-slate-950/50 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-lg text-white">{est.nome}</CardTitle>
                    <CardDescription className="flex items-center gap-1 mt-1">
                      <MapPin className="h-3 w-3" /> {est.cidade}, {est.estado}
                    </CardDescription>
                  </div>
                </div>
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  {est.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-slate-900/50">
                  <TableRow className="border-white/10">
                    <TableHead className="text-slate-300">Tela</TableHead>
                    <TableHead className="text-slate-300 text-center">Status</TableHead>
                    <TableHead className="text-slate-300 text-center">Ocupação Atual</TableHead>
                    <TableHead className="text-slate-300 text-right">Último Ping</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {est.telas.map((tela) => (
                    <TableRow key={tela.id} className="border-white/10 hover:bg-white/5 transition-colors">
                      <TableCell className="font-medium text-slate-200 flex items-center gap-2">
                        <MonitorPlay className="h-4 w-4 text-slate-400" />
                        {tela.nome}
                      </TableCell>
                      <TableCell className="text-center">
                        {tela.status === 'ONLINE' ? (
                          <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 gap-1">
                            <Wifi className="h-3 w-3" /> Online
                          </Badge>
                        ) : (
                          <Badge className="bg-rose-500/10 text-rose-400 border-rose-500/20 gap-1">
                            <WifiOff className="h-3 w-3" /> Offline
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-sm font-semibold text-slate-200">{tela.ocupacao}%</span>
                          <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div 
                              className={`h-full rounded-full ${tela.ocupacao > 80 ? 'bg-emerald-500' : tela.ocupacao > 40 ? 'bg-amber-500' : 'bg-slate-500'}`} 
                              style={{ width: `${tela.ocupacao}%` }} 
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm text-slate-400">
                        {tela.lastPing}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
