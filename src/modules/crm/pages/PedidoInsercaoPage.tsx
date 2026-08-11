import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { piService, PICompleto, PIStatus, PIPrioridade } from '../services/pi.service';
import { contratoService } from '../services/contrato.service';
import { PIHeader } from '../components/pi/PIHeader';
import { PIStatusTimeline } from '../components/pi/PIStatusTimeline';
import { PILocationSelector } from '../components/pi/PILocationSelector';
import { PIHistory } from '../components/pi/PIHistory';
import { PIObservationCard } from '../components/pi/PIObservationCard';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  FileCheck, 
  ArrowLeft, 
  Loader2, 
  CheckCircle2, 
  FileText, 
  Plus, 
  XCircle, 
  Layers,
  Send,
  Building2
} from 'lucide-react';

export default function PedidoInsercaoPage() {
  const { contratoId, piId } = useParams<{ contratoId?: string; piId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { empresaOperadoraId, user } = useAuth();

  const [pi, setPI] = useState<PICompleto | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Form State para Emissão de Novo PI
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    prioridade: 'MEDIA' as PIPrioridade,
    inicioVeiculacao: new Date().toISOString().split('T')[0],
    fimVeiculacao: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    quantidadePecas: 1,
    observacoes: '',
  });

  const loadData = useCallback(async () => {
    setLoading(true);
    if (piId) {
      const data = await piService.getPI(piId);
      setPI(data);
    } else if (contratoId) {
      // Pré-carrega dados do contrato para emissão
      const ctr = await contratoService.findByPropostaId(contratoId);
      if (ctr) {
        setFormData((prev) => ({
          ...prev,
          titulo: `Campanha de Mídia - ${ctr.empresa?.nome_fantasia || 'Cliente'}`,
        }));
      }
    }
    setLoading(false);
  }, [piId, contratoId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Emissão de Novo PI
  const handleCreatePI = async () => {
    if (!empresaOperadoraId) return;

    setIsSubmitting(true);
    let clienteId = pi?.cliente_id;
    let propostaId = pi?.proposta_id;

    if (contratoId) {
      const ctr = await contratoService.findByPropostaId(contratoId);
      if (ctr) {
        clienteId = ctr.cliente_id;
        propostaId = ctr.proposta_id;
      }
    }

    if (!clienteId) {
      toast({ title: 'Erro', description: 'Cliente não localizado para a emissão do PI.', variant: 'destructive' });
      setIsSubmitting(false);
      return;
    }

    const res = await piService.createPI(
      {
        empresaOperadoraId,
        clienteId,
        contratoId,
        propostaId,
        titulo: formData.titulo,
        descricao: formData.descricao,
        prioridade: formData.prioridade,
        inicioVeiculacao: formData.inicioVeiculacao,
        fimVeiculacao: formData.fimVeiculacao,
        quantidadePecas: Number(formData.quantidadePecas),
        observacoes: formData.observacoes,
      },
      user?.id
    );

    setIsSubmitting(false);

    if (res.success && res.piId) {
      toast({
        title: 'Pedido de Inserção Emitido!',
        description: `PI ${res.numeroPI} criado com sucesso no núcleo operacional.`,
      });
      const basePath = window.location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
      navigate(`${basePath}/pi/${res.piId}`);
    } else {
      toast({
        title: 'Erro ao emitir PI',
        description: res.error || 'Falha ao criar Pedido de Inserção.',
        variant: 'destructive',
      });
    }
  };

  // Alteração de Status no Workflow
  const handleStatusChange = async (newStatus: PIStatus) => {
    if (!pi) return;
    const res = await piService.changeStatus(pi.id, newStatus, `Status alterado manualmente pelo operador`, user?.id);
    if (res.success) {
      toast({ title: 'Status Atualizado', description: `PI avançado para a etapa ${newStatus}.` });
      loadData();
    }
  };

  // Adicionar Observação
  const handleAddObservation = async (conteudo: string) => {
    if (!pi) return;
    await piService.addObservation(pi.id, conteudo, user?.id);
    toast({ title: 'Observação Adicionada', description: 'Instrução gravada com sucesso.' });
    loadData();
  };

  // Adicionar Local
  const handleAddLocation = async (unidadeId: string) => {
    if (!pi) return;
    await piService.addLocation(pi.id, unidadeId, user?.id);
    toast({ title: 'Ponto Adicionado', description: 'Unidade vinculada à transmissão.' });
    loadData();
  };

  // Remover Local
  const handleRemoveLocation = async (localId: string) => {
    if (!pi) return;
    await piService.removeLocation(localId, pi.id, user?.id);
    toast({ title: 'Ponto Removido', description: 'Vínculo removido da transmissão.' });
    loadData();
  };

  // Geração do PDF no Cloudflare R2
  const handleGeneratePDF = async () => {
    if (!pi) return;
    setIsGeneratingPdf(true);
    const res = await piService.generatePIPDF(pi.id, user?.id);
    setIsGeneratingPdf(false);

    if (res.success) {
      toast({
        title: 'PDF do PI Gerado!',
        description: 'Artefato definitivo armazenado no Cloudflare R2 Storage.',
      });
      loadData();
    } else {
      toast({ title: 'Erro ao gerar PDF', description: res.error || 'Falha no R2 Storage.', variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      {/* Top Bar Navigation */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2.5 rounded-xl bg-primary/15 text-primary border border-primary/20">
              <Layers className="h-6 w-6" />
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">
              {pi ? `Pedido de Inserção (${pi.numero_pi})` : 'Emissão de Pedido de Inserção (PI)'}
            </h2>
            <Badge className="bg-primary/20 text-primary border-primary/30 ml-2">FASE 7.5-A</Badge>
          </div>
          <p className="text-slate-300 text-xs">
            Transição Comercial ➔ Operação: Gestão de Mídias, Locais, Status e R2 Artifacts
          </p>
        </div>

        <Button variant="outline" onClick={() => {
          const basePath = window.location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
          navigate(`${basePath}/pi`);
        }} className="border-slate-700 text-slate-300 rounded-xl gap-2 text-xs">
          <ArrowLeft className="h-4 w-4" />
          Voltar para Carteira
        </Button>
      </div>

      {/* MODO A: DETALHES E WORKFLOW DO PI JÁ EXISTENTE */}
      {pi ? (
        <div className="space-y-6">
          {/* Header Resumo */}
          <PIHeader pi={pi} />

          {/* Stepper Timeline de Status */}
          <PIStatusTimeline currentStatus={pi.status} onStatusChange={handleStatusChange} />

          {/* Grid de Conteúdo Operacional */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <PILocationSelector
              locais={pi.locais || []}
              onAddLocation={handleAddLocation}
              onRemoveLocation={handleRemoveLocation}
            />

            <PIObservationCard
              observacoes={pi.observacoes_list || []}
              onAddObservation={handleAddObservation}
            />
          </div>

          {/* Histórico Registrado */}
          <PIHistory historico={pi.historico || []} />

          {/* Barra de Ações Operacionais */}
          <div className="p-4 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl flex flex-wrap items-center justify-between gap-3">
            <Button
              variant="outline"
              onClick={() => piService.cancelPI(pi.id, 'Cancelado pelo operador', user?.id).then(loadData)}
              className="border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs rounded-xl gap-1.5"
            >
              <XCircle className="h-4 w-4" />
              Cancelar PI
            </Button>

            <Button
              onClick={handleGeneratePDF}
              disabled={isGeneratingPdf}
              className="gradient-primary glow-primary font-bold rounded-xl text-xs px-6 h-10 gap-2 shadow-xl"
            >
              {isGeneratingPdf ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Gerando PDF no R2...</span>
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  <span>Gerar PDF Oficial do PI</span>
                </>
              )}
            </Button>
          </div>
        </div>
      ) : (
        /* MODO B: FORMULÁRIO DE EMISSÃO DE NOVO PI */
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <FileCheck className="h-5 w-5 text-primary" />
              Preencha os Dados Operacionais do Pedido de Inserção
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Informe o briefing, prioridade e período de exibição da campanha.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs text-slate-200 font-semibold">Nome / Título da Campanha *</Label>
                <Input
                  value={formData.titulo}
                  onChange={(e) => setFormData((p) => ({ ...p, titulo: e.target.value }))}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Prioridade Operacional</Label>
                <Select
                  value={formData.prioridade}
                  onValueChange={(val: any) => setFormData((p) => ({ ...p, prioridade: val }))}
                >
                  <SelectTrigger className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10 text-white">
                    <SelectItem value="BAIXA">Baixa</SelectItem>
                    <SelectItem value="MEDIA">Média (Padrão)</SelectItem>
                    <SelectItem value="ALTA">Alta</SelectItem>
                    <SelectItem value="URGENTE">URGENTE</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Quantidade de Peças / Vinhetas</Label>
                <Input
                  type="number"
                  value={formData.quantidadePecas}
                  onChange={(e) => setFormData((p) => ({ ...p, quantidadePecas: Number(e.target.value) }))}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Data Início da Veiculação</Label>
                <Input
                  type="date"
                  value={formData.inicioVeiculacao}
                  onChange={(e) => setFormData((p) => ({ ...p, inicioVeiculacao: e.target.value }))}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Data Fim da Veiculação</Label>
                <Input
                  type="date"
                  value={formData.fimVeiculacao}
                  onChange={(e) => setFormData((p) => ({ ...p, fimVeiculacao: e.target.value }))}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs text-slate-200 font-semibold">Briefing & Instruções de Produção</Label>
                <Textarea
                  placeholder="Descreva as orientações técnicas, formato de vídeo e regras para a equipe de produção..."
                  value={formData.observacoes}
                  onChange={(e) => setFormData((p) => ({ ...p, observacoes: e.target.value }))}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl min-h-[100px] text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-white/10">
              <Button
                onClick={handleCreatePI}
                disabled={isSubmitting}
                className="gradient-primary glow-primary font-bold rounded-xl px-8 h-12 shadow-xl hover:scale-105 transition-all gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Emitindo PI no Banco...</span>
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    <span>Emitir Pedido de Inserção (PI)</span>
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
