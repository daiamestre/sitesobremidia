import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Gift, Loader2, Search, Tag, XCircle, CheckCircle2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { brl, MOTIVO_DA_LIBERACAO } from '@/lib/cotaDeMidias';
import {
  midiasAnuncianteService, lerValor, previaDaLiberacao, filtrarAnunciantes,
  type AnuncianteDeMidias, type MotivoDaLiberacao,
} from '../services/midiasAnunciante.service';

/**
 * F-166/F-168 — Valor da mídia para anunciantes (Owner e ADM).
 * Escolha o anunciante, mude quanto ele paga por mídia adicionada à playlist e libere mídias grátis
 * (promoção, data comemorativa, cortesia) com o motivo — o anunciante lê a explicação e o valor da próxima mídia.
 */
const DATAS_SUGERIDAS = ['Dia das Mães', 'Dia dos Pais', 'Dia das Crianças', 'Dia da Mulher', 'Páscoa', 'Natal', 'Ano Novo', 'Black Friday', 'Dia do Cliente', 'Aniversário da cidade', 'Aniversário do estabelecimento'];

export default function ValorMidiasPage() {
  const qc = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [selecionadoId, setSelecionadoId] = useState<string | null>(params.get('cliente'));
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');

  const lista = useQuery({
    queryKey: ['admin-midias-lista'],
    queryFn: () => midiasAnuncianteService.listar(),
  });
  const todos = useMemo(() => lista.data?.clientes ?? [], [lista.data]);
  const escolhido = useMemo(() => todos.find((c) => c.cliente_id === selecionadoId) ?? null, [todos, selecionadoId]);
  const rapidos = useMemo(() => todos.filter((c) => c.cliente_id !== selecionadoId).slice(0, escolhido ? 2 : 3), [todos, selecionadoId, escolhido]);
  const encontrados = useMemo(() => filtrarAnunciantes(todos, busca), [todos, busca]);

  const escolher = (c: AnuncianteDeMidias) => {
    setSelecionadoId(c.cliente_id);
    setParams({ cliente: c.cliente_id }, { replace: true });
    setAberto(false);
    setBusca('');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12" data-testid="pagina-valor-midias">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Tag className="h-6 w-6 text-primary" /> Valor da mídia para anunciantes</h1>
        <p className="text-sm text-slate-400 mt-1">
          Quanto cada anunciante paga por mídia adicionada à playlist, e mídias grátis (promoção, data comemorativa, cortesia).
          A primeira playlist de cada anunciante já tem 1 mídia grátis.
        </p>
      </div>

      <ValorPadrao valorAtual={lista.data?.valor_padrao} onSalvo={() => qc.invalidateQueries({ queryKey: ['admin-midias-lista'] })} />

      <Card className="border-white/10 bg-white/[0.03]" data-testid="escolher-anunciante">
        <CardContent className="p-4 space-y-3">
          <button type="button" onClick={() => setAberto(true)} className="flex w-full items-center justify-between gap-2 text-left" data-testid="abrir-escolha">
            <span className="text-sm font-semibold">Escolher anunciante</span>
            <span className="text-xs text-slate-400">{todos.length > 0 ? todos.length + ' anunciantes' : ''}</span>
          </button>
          <div className="relative">
            <button type="button" onClick={() => setAberto(true)} aria-label="Pesquisar anunciante" data-testid="lupa"
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-white">
              <Search className="h-4 w-4" />
            </button>
            <Input readOnly value="" onClick={() => setAberto(true)} onFocus={() => setAberto(true)} placeholder="Pesquisar pelo nome ou CNPJ"
              className="pl-9 bg-slate-950 border-slate-700 cursor-pointer" data-testid="busca-anunciante" />
          </div>

          {lista.isLoading && <div className="py-3 flex justify-center text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /></div>}
          {lista.isError && <p className="text-sm text-rose-400">Não foi possível carregar os anunciantes.</p>}

          <div className="space-y-1.5" data-testid="anunciantes-rapidos">
            {escolhido && <ItemDeAnunciante c={escolhido} selecionado onEscolher={escolher} />}
            {rapidos.map((c) => <ItemDeAnunciante key={c.cliente_id} c={c} onEscolher={escolher} />)}
          </div>
          {todos.length > 3 && (
            <Button variant="outline" size="sm" className="w-full border-white/10" onClick={() => setAberto(true)} data-testid="ver-todos">
              Ver todos os {todos.length} anunciantes
            </Button>
          )}
        </CardContent>
      </Card>

      <Dialog open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) setBusca(''); }}>
        <DialogContent className="bg-slate-900 border-white/10 text-slate-200 max-w-lg" data-testid="dialogo-anunciantes">
          <DialogHeader>
            <DialogTitle>Escolher anunciante</DialogTitle>
            <DialogDescription>Pesquise pelo nome ou CNPJ e toque no anunciante.</DialogDescription>
          </DialogHeader>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <Input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome ou CNPJ do anunciante"
              className="pl-9 bg-slate-950 border-slate-700" data-testid="busca-dialogo" />
          </div>
          <div className="max-h-[55vh] overflow-y-auto space-y-1.5" data-testid="lista-anunciantes">
            {encontrados.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Nenhum anunciante encontrado.</p>}
            {encontrados.map((c) => <ItemDeAnunciante key={c.cliente_id} c={c} selecionado={c.cliente_id === selecionadoId} onEscolher={escolher} />)}
          </div>
          <p className="text-[11px] text-slate-500">{encontrados.length} de {todos.length} anunciantes</p>
        </DialogContent>
      </Dialog>

      {escolhido ? (
        <PainelDoAnunciante key={escolhido.cliente_id} anunciante={escolhido} onMudou={() => qc.invalidateQueries({ queryKey: ['admin-midias-lista'] })} />
      ) : (
        <Card className="border-dashed border-white/10 bg-white/[0.02]">
          <CardContent className="py-14 text-center text-slate-500">
            <Tag className="h-10 w-10 mx-auto mb-3 text-slate-600" />
            Escolha um anunciante para mudar o valor da mídia ou liberar mídias grátis.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ItemDeAnunciante({ c, selecionado, onEscolher }: { c: AnuncianteDeMidias; selecionado?: boolean; onEscolher: (c: AnuncianteDeMidias) => void }) {
  return (
    <button
      type="button"
      onClick={() => onEscolher(c)}
      data-testid="item-anunciante"
      className={'w-full text-left rounded-lg border p-2.5 transition-colors ' + (selecionado ? 'border-primary bg-primary/10' : 'border-white/10 hover:bg-white/5')}
    >
      <p className="text-sm font-medium truncate">{c.nome}</p>
      {(c.documento || c.cidade) && <p className="text-[11px] text-slate-500 truncate">{[c.documento, c.cidade].filter(Boolean).join(' · ')}</p>}
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
        <Badge variant="outline" className={c.valor_personalizado ? 'border-amber-500/40 text-amber-300' : 'border-white/10 text-slate-400'}>
          {brl(c.valor)}{c.valor_personalizado ? ' · personalizado' : ' · padrão'}
        </Badge>
        {c.gratis_restantes > 0 && <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">{c.gratis_restantes} grátis</Badge>}
        {selecionado && <Badge className="bg-primary/20 text-primary border-primary/30">selecionado</Badge>}
      </div>
    </button>
  );
}

function ValorPadrao({ valorAtual, onSalvo }: { valorAtual?: number; onSalvo: () => void }) {
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (valorAtual !== undefined) setTexto(valorAtual.toFixed(2).replace('.', ',')); }, [valorAtual]);
  const valor = lerValor(texto);

  const salvar = async () => {
    if (valor === null) return toast.error('Informe um valor válido (ex.: 19,99).');
    setSalvando(true);
    try {
      await midiasAnuncianteService.definirPadrao(valor);
      toast.success(`Valor padrão: ${brl(valor)}. Vale para quem não tem valor personalizado.`);
      onSalvo();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally { setSalvando(false); }
  };

  return (
    <Card className="border-white/10 bg-white/[0.03]">
      <CardContent className="py-4 flex flex-col sm:flex-row sm:items-end gap-3">
        <div className="flex-1">
          <Label>Valor padrão da mídia (anunciantes sem valor personalizado)</Label>
          <Input value={texto} onChange={(e) => setTexto(e.target.value)} inputMode="decimal" className="mt-1.5 max-w-[200px] bg-slate-950 border-slate-700" data-testid="valor-padrao" />
        </div>
        <Button onClick={salvar} disabled={salvando || valor === null || valor === valorAtual}>
          {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar valor padrão
        </Button>
      </CardContent>
    </Card>
  );
}

function PainelDoAnunciante({ anunciante, onMudou }: { anunciante: AnuncianteDeMidias; onMudou: () => void }) {
  const qc = useQueryClient();
  const detalhe = useQuery({
    queryKey: ['admin-midias-detalhe', anunciante.cliente_id],
    queryFn: () => midiasAnuncianteService.detalhe(anunciante.cliente_id),
  });
  const atualizar = () => { qc.invalidateQueries({ queryKey: ['admin-midias-detalhe', anunciante.cliente_id] }); onMudou(); };

  const [valorTexto, setValorTexto] = useState('');
  const [motivoValor, setMotivoValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { if (detalhe.data) setValorTexto(detalhe.data.valor.toFixed(2).replace('.', ',')); }, [detalhe.data]);
  const valorNovo = lerValor(valorTexto);

  const salvarValor = async (valor: number | null) => {
    setSalvando(true);
    try {
      const r = await midiasAnuncianteService.definirValor(anunciante.cliente_id, valor, motivoValor);
      toast.success(valor === null ? `Voltou ao valor padrão (${brl(r.valor)}).` : `${anunciante.nome} agora paga ${brl(r.valor)} por mídia.`);
      setMotivoValor('');
      atualizar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível salvar.');
    } finally { setSalvando(false); }
  };

  // ---- liberar mídias grátis
  const [quantidade, setQuantidade] = useState('1');
  const [motivo, setMotivo] = useState<MotivoDaLiberacao | ''>('');
  const [data, setData] = useState('');
  const [explicacao, setExplicacao] = useState('');
  const [liberando, setLiberando] = useState(false);
  const qtd = Number.parseInt(quantidade, 10);
  const qtdOk = Number.isInteger(qtd) && qtd >= 1 && qtd <= 100;
  const pronto = qtdOk && !!motivo && (motivo !== 'DATA_COMEMORATIVA' || data.trim().length > 1) && (motivo !== 'OUTRO' || explicacao.trim().length > 2);
  const valorDaProxima = detalhe.data?.valor ?? anunciante.valor;
  const previa = pronto && motivo
    ? previaDaLiberacao({ quantidade: qtd, motivo, dataComemorativa: data, explicacao, valor: valorDaProxima })
    : null;

  const liberar = async () => {
    if (!pronto || !motivo) return;
    setLiberando(true);
    try {
      await midiasAnuncianteService.liberar({ clienteId: anunciante.cliente_id, quantidade: qtd, motivo, dataComemorativa: data, explicacao });
      toast.success(`${qtd} ${qtd === 1 ? 'mídia liberada' : 'mídias liberadas'} para ${anunciante.nome}.`);
      setQuantidade('1'); setMotivo(''); setData(''); setExplicacao('');
      atualizar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Não foi possível liberar.');
    } finally { setLiberando(false); }
  };

  const cancelar = async (id: string) => {
    try { await midiasAnuncianteService.cancelar(id); toast.success('Liberação cancelada (o que já foi usado continua).'); atualizar(); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível cancelar.'); }
  };

  if (detalhe.isLoading || !detalhe.data) {
    return <Card className="border-white/10 bg-white/[0.03]"><CardContent className="py-16 flex justify-center text-slate-500"><Loader2 className="h-6 w-6 animate-spin" /></CardContent></Card>;
  }
  const d = detalhe.data;

  return (
    <div className="space-y-4" data-testid="painel-anunciante">
      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">{anunciante.nome}</CardTitle>
          <CardDescription className="flex flex-wrap gap-2 text-xs">
            <span>{d.playlists} {d.playlists === 1 ? 'playlist' : 'playlists'}</span>
            <span>· {d.midias_pagas} {d.midias_pagas === 1 ? 'mídia paga' : 'mídias pagas'}</span>
            <span>· mídia grátis da 1ª playlist: <strong className={d.gratis_primeira_playlist === 'USADA' ? 'text-slate-300' : 'text-emerald-400'}>{d.gratis_primeira_playlist === 'USADA' ? 'já usada' : 'disponível'}</strong></span>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3">
            <div>
              <Label>Quanto este anunciante paga por mídia</Label>
              <Input value={valorTexto} onChange={(e) => setValorTexto(e.target.value)} inputMode="decimal" className="mt-1.5 w-[180px] bg-slate-950 border-slate-700" data-testid="valor-anunciante" />
            </div>
            <div className="flex-1">
              <Label>Motivo (opcional, fica no histórico)</Label>
              <Input value={motivoValor} onChange={(e) => setMotivoValor(e.target.value)} placeholder="Ex.: combinado com o anunciante" className="mt-1.5 bg-slate-950 border-slate-700" />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => valorNovo !== null && salvarValor(valorNovo)} disabled={salvando || valorNovo === null || valorNovo === d.valor} data-testid="salvar-valor">
              {salvando && <Loader2 className="h-4 w-4 animate-spin mr-2" />} Salvar valor
            </Button>
            {d.valor_personalizado && (
              <Button variant="outline" onClick={() => salvarValor(null)} disabled={salvando}>Voltar ao padrão ({brl(d.valor_padrao)})</Button>
            )}
          </div>
          <p className="text-xs text-slate-500 flex items-start gap-1.5"><Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            {d.valor_personalizado ? 'Valor personalizado deste anunciante.' : `Está no valor padrão (${brl(d.valor_padrao)}).`} Vale para as próximas mídias; cobranças já geradas não mudam.
          </p>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2"><Gift className="h-4 w-4 text-emerald-400" /> Liberar mídias grátis</CardTitle>
          <CardDescription>O anunciante vê quantas mídias foram liberadas, o motivo e quanto a próxima vai custar.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-3">
            <div>
              <Label>Quantas mídias?</Label>
              <Input value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="mt-1.5 bg-slate-950 border-slate-700" data-testid="quantidade-gratis" />
            </div>
            <div>
              <Label>Por que está liberando? *</Label>
              <select
                value={motivo}
                onChange={(e) => setMotivo(e.target.value as MotivoDaLiberacao | '')}
                className="mt-1.5 w-full px-3 py-2 text-sm rounded-md bg-slate-950 border border-slate-700 text-slate-200"
                data-testid="motivo-liberacao"
              >
                <option value="">Escolha o motivo…</option>
                <option value="PROMOCAO">É uma promoção</option>
                <option value="DATA_COMEMORATIVA">É uma data comemorativa</option>
                <option value="CORTESIA">É uma cortesia</option>
                <option value="OUTRO">Outro motivo</option>
              </select>
            </div>
          </div>
          {motivo === 'DATA_COMEMORATIVA' && (
            <div>
              <Label>Qual é a data comemorativa? *</Label>
              <Input list="datas-comemorativas" value={data} onChange={(e) => setData(e.target.value)} placeholder="Ex.: Dia das Crianças" className="mt-1.5 bg-slate-950 border-slate-700" data-testid="data-comemorativa" />
              <datalist id="datas-comemorativas">{DATAS_SUGERIDAS.map((x) => <option key={x} value={x} />)}</datalist>
            </div>
          )}
          <div>
            <Label>Explique o motivo{motivo === 'OUTRO' ? ' *' : ' (o anunciante vai ler)'}</Label>
            <Textarea value={explicacao} onChange={(e) => setExplicacao(e.target.value)} rows={2} maxLength={300}
              placeholder="Ex.: Obrigado por anunciar com a gente!" className="mt-1.5 bg-slate-950 border-slate-700" data-testid="explicacao-liberacao" />
          </div>
          {previa ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-100" data-testid="previa-liberacao">
              <p className="text-[11px] uppercase tracking-wide text-emerald-300/80 mb-1">Mensagem que o anunciante vai ler</p>
              {previa}
            </div>
          ) : (
            <p className="text-xs text-slate-500">Escolha a quantidade e o motivo para ver a mensagem que o anunciante vai receber.</p>
          )}
          <Button onClick={liberar} disabled={!pronto || liberando} data-testid="liberar-gratis">
            {liberando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Gift className="h-4 w-4 mr-2" />} Liberar mídias grátis
          </Button>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/[0.03]">
        <CardHeader className="pb-2"><CardTitle className="text-base">Histórico de liberações</CardTitle></CardHeader>
        <CardContent className="space-y-2" data-testid="historico-liberacoes">
          {d.liberacoes.length === 0 && <p className="text-sm text-slate-500">Nenhuma liberação ainda.</p>}
          {d.liberacoes.map((l) => {
            const restantes = l.quantidade - l.usadas;
            const ativa = !l.cancelado_em && restantes > 0;
            return (
              <div key={l.id} className="rounded-lg border border-white/10 p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">
                      {l.quantidade} {l.quantidade === 1 ? 'mídia' : 'mídias'} · {MOTIVO_DA_LIBERACAO[l.motivo]}{l.data_comemorativa ? ` (${l.data_comemorativa})` : ''}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{l.mensagem}</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {new Date(l.criado_em).toLocaleString('pt-BR')} · usadas {l.usadas} de {l.quantidade}
                    </p>
                  </div>
                  {l.cancelado_em ? <Badge variant="outline" className="border-rose-500/30 text-rose-300">cancelada</Badge>
                    : restantes === 0 ? <Badge variant="outline" className="border-white/10 text-slate-300"><CheckCircle2 className="h-3 w-3 mr-1" />usada</Badge>
                    : <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">{restantes} disponível</Badge>}
                </div>
                {ativa && (
                  <Button variant="ghost" size="sm" className="mt-2 h-7 text-rose-400 gap-1" onClick={() => cancelar(l.id)}>
                    <XCircle className="h-3.5 w-3.5" /> Cancelar o que não foi usado
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
