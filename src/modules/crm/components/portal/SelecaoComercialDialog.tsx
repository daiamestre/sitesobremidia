import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/utils/formatters';
import {
  Loader2,
  Tag,
  AlertTriangle,
  CheckCircle2,
  Plus,
  ShoppingBag,
  Info,
  MapPin,
} from 'lucide-react';
import {
  pontoPrecosService,
  PERIODICIDADES_COMERCIAIS,
  type PeriodicidadeComercial,
  type ResolucaoPreco,
} from '@/modules/crm/services/pontoPrecos.service';
import {
  composicaoComercialService,
  type ComposicaoItemResult,
  type ValidacaoItemResult,
} from '@/modules/crm/services/composicaoComercial.service';


export interface PontoComercialTarget {
  ponto_id: string;
  nome: string;
  categoria?: string | null;
  cidade?: string | null;
  estado?: string | null;
  bairro?: string | null;
  foto_url?: string | null;
}

export interface ItemComposicaoComUI extends ComposicaoItemResult {
  ponto_nome?: string;
  observacoes_ui?: string | null;
}

interface SelecaoComercialDialogProps {
  ponto: PontoComercialTarget | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdicionarItem: (item: ItemComposicaoComUI) => void;
  composicaoAtual: ItemComposicaoComUI[];
}

const PERIODICIDADE_LABELS: Record<PeriodicidadeComercial, string> = {
  MENSAL: 'Mensal',
  BIMESTRAL: 'Bimestral',
  TRIMESTRAL: 'Trimestral',
  SEMESTRAL: 'Semestral',
  ANUAL: 'Anual',
};

export function SelecaoComercialDialog({
  ponto,
  open,
  onOpenChange,
  onAdicionarItem,
  composicaoAtual,
}: SelecaoComercialDialogProps) {
  const [loading, setLoading] = useState(false);
  const [periodicidadesDisponiveis, setPeriodicidadesDisponiveis] = useState<
    PeriodicidadeComercial[]
  >([]);
  const [periodicidadeSelecionada, setPeriodicidadeSelecionada] = useState<
    PeriodicidadeComercial | ''
  >('');
  const [resolucaoPreco, setResolucaoPreco] = useState<ResolucaoPreco | null>(null);
  const [descontoInput, setDescontoInput] = useState('0');
  const [observacoesInput, setObservacoesInput] = useState('');
  const [itemMontado, setItemMontado] = useState<ComposicaoItemResult | null>(null);
  const [validacao, setValidacao] = useState<ValidacaoItemResult | null>(null);
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  // Carrega periodicidades reais ativas do ponto
  const carregarPeriodicidades = useCallback(async (pontoId: string) => {
    setLoading(true);
    setErroMsg(null);
    try {
      const disponiveis = await pontoPrecosService.obterTodasPeriodicidadesDisponiveis(pontoId);
      // Filtra estritamente periodicidades comerciais (exclui UNICO e qualquer outra inválida)
      const validas = disponiveis.filter((p) =>
        (PERIODICIDADES_COMERCIAIS as readonly string[]).includes(p)
      );

      setPeriodicidadesDisponiveis(validas);

      if (validas.length > 0) {
        const primeira = validas[0];
        setPeriodicidadeSelecionada(primeira);
        await atualizarPrecoEItem(pontoId, primeira, 0);
      } else {
        setPeriodicidadeSelecionada('');
        setResolucaoPreco({
          encontrado: false,
          motivo:
            'Nenhuma periodicidade comercial possui preço ativo cadastrado para este ponto.',
        });
        setItemMontado(null);
        setValidacao(null);
      }
    } catch (err: any) {
      console.error('[SelecaoComercialDialog] Erro ao carregar periodicidades:', err);
      setErroMsg(err?.message || 'Falha ao consultar a matriz de preços.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Atualiza resolução de preço e montagem do item
  const atualizarPrecoEItem = async (
    pontoId: string,
    periodicidade: string,
    descontoVal: number
  ) => {
    try {
      const res = await pontoPrecosService.resolverPreco(pontoId, periodicidade);
      setResolucaoPreco(res);

      if (!res.encontrado) {
        setItemMontado(null);
        setValidacao(null);
        return;
      }

      // IMPORTANTE: Assinatura original do service preservada -> montarItem(pontoId, periodicidade, desconto)
      const item = await composicaoComercialService.montarItem(
        pontoId,
        periodicidade,
        descontoVal
      );

      setItemMontado(item);

      if (item) {
        const val = composicaoComercialService.validarItem(item);
        setValidacao(val);
      } else {
        setValidacao(null);
      }
    } catch (err: any) {
      console.error('[SelecaoComercialDialog] Erro ao resolver preço:', err);
      setErroMsg(err?.message || 'Erro ao processar precificação.');
    }
  };

  // Effect para inicialização ao abrir o modal
  useEffect(() => {
    if (open && ponto?.ponto_id) {
      setDescontoInput('0');
      setObservacoesInput('');
      carregarPeriodicidades(ponto.ponto_id);
    }
  }, [open, ponto?.ponto_id, carregarPeriodicidades]);

  // Handler de alteração de periodicidade
  const handlePeriodicidadeChange = async (p: PeriodicidadeComercial) => {
    if (!ponto) return;
    setPeriodicidadeSelecionada(p);
    const descontoNum = parseFloat(descontoInput.replace(',', '.')) || 0;
    await atualizarPrecoEItem(ponto.ponto_id, p, descontoNum);
  };

  // Handler de alteração de desconto
  const handleDescontoChange = async (valStr: string) => {
    setDescontoInput(valStr);
    if (!ponto || !periodicidadeSelecionada) return;
    const descontoNum = parseFloat(valStr.replace(',', '.')) || 0;
    await atualizarPrecoEItem(ponto.ponto_id, periodicidadeSelecionada, descontoNum);
  };

  // Handler de confirmação
  const handleAdicionar = () => {
    if (!itemMontado || !validacao?.valido || !ponto) return;

    const itemComUI: ItemComposicaoComUI = {
      ...itemMontado,
      ponto_nome: ponto.nome,
      observacoes_ui: observacoesInput.trim() || null,
    };

    onAdicionarItem(itemComUI);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-950 border border-white/10 text-white max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl text-white">
            <Tag className="h-5 w-5 text-primary" /> Seleção Comercial — {ponto?.nome}
          </DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">
            Selecione a periodicidade desejada e consulte a matriz de preços oficial.
            Regras de snapshot e descontos são validadas pela camada de aplicação.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-slate-400">Consultando matriz de preços por ponto...</p>
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Informações do Ponto */}
            <Card className="border border-white/10 bg-slate-900/60 p-3">
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                  <MapPin className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-white text-sm">{ponto?.nome}</p>
                  <p className="text-xs text-slate-400">
                    {[ponto?.bairro, ponto?.cidade, ponto?.estado].filter(Boolean).join(' — ') ||
                      'Localização cadastrada'}
                  </p>
                  {ponto?.categoria && (
                    <Badge variant="outline" className="mt-1 text-[10px] border-white/10">
                      {ponto.categoria}
                    </Badge>
                  )}
                </div>
              </div>
            </Card>

            {erroMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{erroMsg}</span>
              </div>
            )}

            {/* Seleção de Periodicidade Comercial */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold text-slate-300">
                1. Periodicidades Comerciais Disponíveis
              </Label>

              {periodicidadesDisponiveis.length === 0 ? (
                <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>
                    Nenhuma periodicidade comercial possui preço ativo cadastrado para este ponto.
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {PERIODICIDADES_COMERCIAIS.map((p) => {
                    const disponivel = periodicidadesDisponiveis.includes(p);
                    const selecionada = periodicidadeSelecionada === p;

                    return (
                      <Button
                        key={p}
                        type="button"
                        variant={selecionada ? 'default' : 'outline'}
                        disabled={!disponivel}
                        onClick={() => handlePeriodicidadeChange(p)}
                        className={`h-11 justify-start text-xs font-medium ${
                          !disponivel
                            ? 'opacity-40 border-white/5 cursor-not-allowed text-slate-500'
                            : selecionada
                            ? 'bg-primary text-white border-primary font-bold'
                            : 'border-white/10 bg-slate-900 hover:bg-slate-800 text-slate-200'
                        }`}
                      >
                        <span className="truncate">{PERIODICIDADE_LABELS[p]}</span>
                        {!disponivel && (
                          <span className="ml-auto text-[9px] text-slate-500">Sem preço</span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Estado: Sem Preço */}
            {resolucaoPreco && !resolucaoPreco.encontrado && (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
                <div className="flex items-center gap-2 font-bold">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>Preço Indisponível</span>
                </div>
                <p className="text-slate-300">{resolucaoPreco.motivo}</p>
              </div>
            )}

            {/* Estado: Preço Encontrado & Detalhes Comerciais */}
            {resolucaoPreco?.encontrado && itemMontado && (
              <div className="space-y-4 pt-2 border-t border-white/10">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-slate-900 border border-white/10">
                    <span className="text-xs text-slate-400">Preço de Tabela (Matriz)</span>
                    <p className="text-lg font-bold text-white">
                      {formatCurrency(itemMontado.valor_tabela)}
                    </p>
                    <span className="text-[10px] text-slate-500">Snapshot imutável</span>
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-white/10">
                    <span className="text-xs text-slate-400">Subtotal Resultante</span>
                    <p className="text-lg font-bold text-emerald-400">
                      {formatCurrency(itemMontado.subtotal)}
                    </p>
                    <span className="text-[10px] text-slate-500">
                      {itemMontado.desconto > 0
                        ? `Com desconto de ${formatCurrency(itemMontado.desconto)}`
                        : 'Sem desconto'}
                    </span>
                  </div>
                </div>

                {/* Desconto Monetário */}
                <div className="space-y-2">
                  <Label className="text-xs text-slate-300 flex items-center justify-between">
                    <span>Desconto Monetário (R$)</span>
                    <span className="text-[10px] text-slate-500">
                      Máximo permitido: {formatCurrency(itemMontado.valor_tabela)}
                    </span>
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max={itemMontado.valor_tabela}
                    value={descontoInput}
                    onChange={(e) => handleDescontoChange(e.target.value)}
                    placeholder="0,00"
                    className="bg-slate-900 border-white/10 text-white"
                  />
                </div>

                {/* Observações da UI (Camada Visual) */}
                <div className="space-y-2">
                  <Label className="text-xs text-slate-300">Observações do Item (Opcional)</Label>
                  <Input
                    value={observacoesInput}
                    onChange={(e) => setObservacoesInput(e.target.value)}
                    placeholder="Ex.: Campanha de final de ano"
                    className="bg-slate-900 border-white/10 text-white"
                  />
                </div>

                {/* Validação do Item */}
                {validacao && !validacao.valido && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs space-y-1">
                    <div className="font-bold flex items-center gap-1">
                      <AlertTriangle className="h-3.5 w-3.5" /> Item Inválido
                    </div>
                    <ul className="list-disc pl-4 space-y-0.5">
                      {validacao.erros.map((e, idx) => (
                        <li key={idx}>{e}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {/* Resumo da Composição Acumulada */}
            {composicaoAtual.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-900/40 border border-white/5 space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
                  <span className="flex items-center gap-1">
                    <ShoppingBag className="h-3.5 w-3.5 text-primary" /> Composição Atual (
                    {composicaoAtual.length} item{composicaoAtual.length > 1 ? 'ns' : ''})
                  </span>
                  <span className="text-emerald-400 font-bold">
                    Total: {formatCurrency(composicaoAtual.reduce((acc, i) => acc + i.subtotal, 0))}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-white/10 text-slate-300"
          >
            Cancelar
          </Button>

          <Button
            type="button"
            disabled={
              loading ||
              !resolucaoPreco?.encontrado ||
              !itemMontado ||
              !validacao?.valido
            }
            onClick={handleAdicionar}
            className="bg-gradient-to-r from-primary to-teal-500 text-white font-bold"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Adicionar à Composição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
