import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tv, ArrowLeft, MapPin, Search, Store, Monitor, Activity, AlertTriangle, Clock, DollarSign, TrendingUp, Users, Layers, Eye, Plus } from 'lucide-react';
import { pontosRedeService, type PontoRede, type PontosStats } from '@/services/pontosRede.service';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];

export default function OccupancyDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<PontosStats|null>(null);
  const [periodo, setPeriodo] = useState<'hoje'|'7d'|'30d'|'mes'>('30d');
  const [tab, setTab] = useState('meus');
  const [busca, setBusca] = useState('');
  const [fCidade, setFCidade] = useState('');
  const [fCategoria, setFCategoria] = useState('');
  const [fDisp, setFDisp] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [meusPontos, setMeusPontos] = useState<PontoRede[]>([]);
  const [redePontos, setRedePontos] = useState<PontoRede[]>([]);
  const [detalhe, setDetalhe] = useState<PontoRede|null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(()=>{ (async()=>{
    setLoading(true);
    const [s, meus, rede] = await Promise.all([
      pontosRedeService.fetchPontosStats(periodo),
      pontosRedeService.fetchPontosRede(undefined,true),
      pontosRedeService.fetchPontosRede(),
    ]);
    setStats(s); setMeusPontos(meus); setRedePontos(rede); setLoading(false);
  })(); },[periodo]);

  const filtrar = (list:PontoRede[]) => list.filter(p=>{
    if(busca && ![p.nome,p.bairro,p.cidade,p.categoria].some(v=> (v??'').toLowerCase().includes(busca.toLowerCase()))) return false;
    if(fCidade && (p.cidade??'').toLowerCase()!==fCidade.toLowerCase()) return false;
    if(fCategoria && (p.categoria??'').toLowerCase()!==fCategoria.toLowerCase()) return false;
    if(fDisp && p.disponibilidade!==fDisp) return false;
    if(fStatus && p.status_operacional!==fStatus) return false;
    return true;
  });
  const listaMeus = useMemo(()=>filtrar(meusPontos),[meusPontos,busca,fCidade,fCategoria,fDisp,fStatus]);
  const listaRede = useMemo(()=>filtrar(redePontos),[redePontos,busca,fCidade,fCategoria,fDisp,fStatus]);

  const catData = useMemo(()=>{
    const m:Record<string,number>={};
    redePontos.forEach(p=>{ const k=p.categoria||'Outros'; m[k]=(m[k]||0)+1;});
    return Object.entries(m).map(([name,value])=>({name,value})).slice(0,6);
  },[redePontos]);
  const cidadeData = useMemo(()=>{
    const m:Record<string,number>={};
    redePontos.forEach(p=>{ const k=p.cidade||'—'; m[k]=(m[k]||0)+1;});
    return Object.entries(m).map(([name,value])=>({name,value})).slice(0,6);
  },[redePontos]);

  const CardMini = ({label,value,icon:Icon,color}:{label:string;value:string|number;icon:any;color:string})=>(
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl">
      <CardContent className="p-4 flex items-center justify-between">
        <div><span className="text-slate-400 text-xs font-semibold block">{label}</span><strong className={`text-xl font-bold ${color}`}>{value}</strong></div>
        <div className="p-2.5 rounded-xl bg-white/5 border border-white/10"><Icon className={`h-5 w-5 ${color}`}/></div>
      </CardContent>
    </Card>
  );

  const Tabela = ({data}:{data:PontoRede[]})=>(
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider border-b border-white/10"><tr>
          <th className="py-2 px-3 text-left">Estabelecimento</th><th className="py-2 px-3">Cidade</th><th className="py-2 px-3">Bairro</th><th className="py-2 px-3">Categoria</th><th className="py-2 px-3">Status</th><th className="py-2 px-3 text-center">Telas</th><th className="py-2 px-3">Disponibilidade</th><th className="py-2 px-3">Ações</th>
        </tr></thead>
        <tbody className="divide-y divide-white/5 text-slate-200">
          {data.length===0? <tr><td colSpan={8} className="py-10 text-center text-slate-500">Nenhum ponto encontrado</td></tr> :
          data.map(p=>(
            <tr key={p.id} className="hover:bg-white/5">
              <td className="py-2 px-3 font-semibold text-white flex items-center gap-2">{p.foto_url? <img src={p.foto_url} alt="" className="h-8 w-8 rounded object-cover"/>:<Store className="h-4 w-4 text-slate-500"/>}{p.nome}</td>
              <td className="py-2 px-3">{p.cidade||'—'}</td>
              <td className="py-2 px-3">{p.bairro||'—'}</td>
              <td className="py-2 px-3">{p.categoria||'—'}</td>
              <td className="py-2 px-3"><Badge variant="outline" className={p.status_operacional==='ATIVO'?'bg-emerald-500/20 text-emerald-400 border-emerald-500/30':'bg-amber-500/20 text-amber-400 border-amber-500/30'}>{p.status_operacional}</Badge></td>
              <td className="py-2 px-3 text-center font-mono">{p.quantidade_telas} <span className="text-slate-500">({p.telas_ativas??p.quantidade_telas} ativas)</span></td>
              <td className="py-2 px-3"><Badge variant="outline" className={p.disponibilidade==='DISPONIVEL'?'bg-emerald-500/20 text-emerald-400':'bg-amber-500/20 text-amber-400'}>{p.disponibilidade}</Badge></td>
              <td className="py-2 px-3"><Button size="sm" variant="ghost" className="h-7 text-xs" onClick={()=>setDetalhe(p)}><Eye className="h-3 w-3 mr-1"/>Detalhes</Button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap"><Tv className="h-6 w-6 text-amber-400"/><h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">Centro de Controle — Rede de Pontos de Exibição</h2><Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">FASE 9.2 DW</Badge></div>
          <p className="text-slate-300 text-xs">Meus Pontos + Rede SOBRE MÍDIA — controle operacional e comercial para prospecção</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={()=>navigate('/representantes/prospeccao/ponto-parceiro')} className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 rounded-xl"><Plus className="h-4 w-4"/>Novo Ponto Parceiro</Button>
          <Button variant="outline" onClick={()=>navigate('/representantes/analytics')} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs"><ArrowLeft className="h-4 w-4"/>Voltar</Button>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {(['hoje','7d','30d','mes'] as const).map(p=> <Button key={p} size="sm" variant={periodo===p?'default':'outline'} onClick={()=>setPeriodo(p)} className="rounded-full text-xs">{p==='hoje'?'Hoje':p==='7d'?'7 dias':p==='30d'?'30 dias':'Mês atual'}</Button>)}
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <CardMini label="Total de Pontos" value={stats.totalPontos} icon={Store} color="text-white"/>
          <CardMini label="Meus Pontos" value={stats.meusPontos} icon={Users} color="text-purple-400"/>
          <CardMini label="Pontos Ativos" value={stats.pontosAtivos} icon={Activity} color="text-emerald-400"/>
          <CardMini label="Em Implantação" value={stats.emImplantacao} icon={Clock} color="text-amber-400"/>
          <CardMini label="Pendentes Aprovação" value={stats.pendentes} icon={AlertTriangle} color="text-orange-400"/>
          <CardMini label="Suspensos" value={stats.suspensos} icon={AlertTriangle} color="text-red-400"/>
          <CardMini label="Total de Telas" value={stats.totalTelas} icon={Monitor} color="text-sky-400"/>
          <CardMini label="Telas Ativas" value={stats.telasAtivas} icon={Tv} color="text-emerald-400"/>
          <CardMini label="Telas Offline" value={stats.telasOffline} icon={Monitor} color="text-red-400"/>
          <CardMini label="Disponíveis" value={stats.disponiveis} icon={Layers} color="text-emerald-400"/>
          <CardMini label="Ocupados" value={stats.ocupados} icon={Layers} color="text-amber-400"/>
          <CardMini label="Novos no período" value={stats.novosNoPeriodo} icon={TrendingUp} color="text-purple-400"/>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border border-white/10 bg-slate-900/80 rounded-2xl"><CardContent className="p-4"><span className="text-slate-400 text-xs font-semibold block">Taxa Média de Ocupação</span><strong className="text-xl font-bold text-amber-400">{stats?.taxaOcupacao ?? 78.4}%</strong><span className="text-xs text-slate-500"> ocupados vs. rede</span></CardContent></Card>
        <Card className="border border-white/10 bg-slate-900/80 rounded-2xl"><CardContent className="p-4"><span className="text-slate-400 text-xs font-semibold block">Tempo Disponível Comercializável</span><strong className="text-xl font-bold text-emerald-400">{stats? (100-stats.taxaOcupacao).toFixed(1):21.6}%</strong></CardContent></Card>
        <Card className="border border-white/10 bg-slate-900/80 rounded-2xl"><CardContent className="p-4"><span className="text-slate-400 text-xs font-semibold block">Receita Média por Tela</span><strong className="text-xl font-bold text-purple-400">R$ {stats?.receitaMediaPorTela.toLocaleString('pt-BR')}/mês</strong></CardContent></Card>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="bg-slate-900/80 border border-white/10"><TabsTrigger value="meus" className="data-[state=active]:bg-purple-600 data-[state=active]:text-white">Meus Pontos ({listaMeus.length})</TabsTrigger><TabsTrigger value="rede" className="data-[state=active]:bg-sky-600 data-[state=active]:text-white">Rede SOBRE MÍDIA ({listaRede.length})</TabsTrigger></TabsList>

        <div className="mt-4 p-4 rounded-2xl border border-white/10 bg-slate-900/60 flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1"><Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/><Input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar por nome, bairro, cidade, categoria…" className="pl-9 bg-slate-950 border-white/10 text-white"/></div>
          <select value={fCidade} onChange={e=>setFCidade(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-sm"><option value="">Todas cidades</option>{[...new Set(redePontos.map(p=>p.cidade).filter(Boolean))].map(c=> <option key={c!} value={c!}>{c}</option>)}</select>
          <select value={fCategoria} onChange={e=>setFCategoria(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-sm"><option value="">Todas categorias</option>{[...new Set(redePontos.map(p=>p.categoria).filter(Boolean))].map(c=> <option key={c!} value={c!}>{c}</option>)}</select>
          <select value={fDisp} onChange={e=>setFDisp(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-sm"><option value="">Disponibilidade</option><option value="DISPONIVEL">Disponível</option><option value="RESERVADO">Reservado</option><option value="INDISPONIVEL">Indisponível</option></select>
          <select value={fStatus} onChange={e=>setFStatus(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-950 border border-white/10 text-white text-sm"><option value="">Status</option><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option><option value="MANUTENCAO">Manutenção</option></select>
        </div>

        <TabsContent value="meus" className="mt-4">
          <Card className="border border-white/10 bg-slate-900/80 rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10"><CardTitle className="text-white flex items-center gap-2"><Store className="h-5 w-5 text-purple-400"/>Meus Pontos — carteira do representante</CardTitle></CardHeader>
            <CardContent className="p-0">{loading? <div className="py-10 text-center text-slate-400">Carregando…</div>: <Tabela data={listaMeus}/>}</CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="rede" className="mt-4 space-y-4">
          <Card className="border border-white/10 bg-slate-900/80 rounded-2xl overflow-hidden">
            <CardHeader className="border-b border-white/10"><CardTitle className="text-white flex items-center gap-2"><MapPin className="h-5 w-5 text-sky-400"/>Rede de Pontos SOBRE MÍDIA — prospecção</CardTitle></CardHeader>
            <CardContent className="p-0">{loading? <div className="py-10 text-center text-slate-400">Carregando…</div>: <Tabela data={listaRede}/>}</CardContent>
          </Card>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="border border-white/10 bg-slate-900/80 rounded-2xl"><CardHeader><CardTitle className="text-white text-sm">Distribuição por Categoria</CardTitle></CardHeader><CardContent className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={catData}><XAxis dataKey="name" tick={{fontSize:10, fill:'#94a3b8'}}/><YAxis tick={{fill:'#94a3b8'}}/><Tooltip/><Bar dataKey="value" fill="#6366f1"/></BarChart></ResponsiveContainer></CardContent></Card>
            <Card className="border border-white/10 bg-slate-900/80 rounded-2xl"><CardHeader><CardTitle className="text-white text-sm">Distribuição Geográfica</CardTitle></CardHeader><CardContent className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={cidadeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>{cidadeData.map((_,i)=><Cell key={i} fill={COLORS[i%COLORS.length]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer></CardContent></Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={!!detalhe} onOpenChange={()=>setDetalhe(null)}>
        <DialogContent className="bg-slate-950 text-white border-white/10 max-w-2xl">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="h-5 w-5 text-primary"/>{detalhe?.nome}</DialogTitle></DialogHeader>
          {detalhe && <div className="space-y-3 text-sm">
            {detalhe.foto_url && <img src={detalhe.foto_url} alt="" className="w-full h-48 object-cover rounded-xl border border-white/10"/>}
            <div className="grid grid-cols-2 gap-3">
              <div><span className="text-slate-400">Categoria</span><p className="font-semibold">{detalhe.categoria||'—'}</p></div>
              <div><span className="text-slate-400">Status</span><p><Badge>{detalhe.status_operacional}</Badge> <Badge variant="outline">{detalhe.disponibilidade}</Badge></p></div>
              <div className="col-span-2"><span className="text-slate-400">Endereço</span><p>{[detalhe.logradouro, detalhe.bairro, detalhe.cidade, detalhe.estado].filter(Boolean).join(', ')||'—'} {detalhe.cep? `CEP ${detalhe.cep}`:''}</p></div>
              <div><span className="text-slate-400">Telas</span><p>{detalhe.quantidade_telas} (ativas: {detalhe.telas_ativas??detalhe.quantidade_telas})</p></div>
              <div><span className="text-slate-400">Valor</span><p>{detalhe.valor_anuncio? `R$ ${Number(detalhe.valor_anuncio).toLocaleString('pt-BR')}/${detalhe.periodicidade.toLowerCase()}`:'sob consulta'}</p></div>
              <div className="col-span-2"><span className="text-slate-400">Regras comerciais</span><p className="whitespace-pre-wrap text-slate-300">{detalhe.regras_comerciais||'—'}</p></div>
              <div className="col-span-2"><span className="text-slate-400">Descrição</span><p className="text-slate-300">{detalhe.descricao||'—'}</p></div>
            </div>
            <div className="flex justify-end gap-2 pt-2"><Button variant="outline" onClick={()=>setDetalhe(null)}>Fechar</Button><Button onClick={()=>{ setDetalhe(null); navigate('/representantes/prospeccao/ponto-parceiro');}}>Novo Ponto</Button></div>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
