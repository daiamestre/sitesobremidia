import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useClienteModalidade } from '../../hooks/useClienteModalidade';
import {
  Rocket, Loader2, Store, MapPin, Monitor, Calculator, FileSignature,
  CheckCircle2, ArrowLeft, ArrowRight, PenLine, Landmark, Megaphone, CircleDollarSign,
} from 'lucide-react';
import { customerCommerceService } from '../../services/customerCommerce.service';
import { gerarDocumentoContrato, criarEnvelopeInterno, assinarDocumento } from '../../services/contratoDocumento.service';
import { financeiroService } from '../../services/financeiro.service';
import { SignatureCaptureModal } from '../../components/signature/SignatureCaptureModal';
import type { SignatureCaptureResult, SignatureSigner } from '../../types/assinatura.types';
import type { ModalidadeCliente, EstabelecimentoDisponivel, CalculoPreco } from '@/types/customerPortal';
import { formatCurrency } from '@/utils/formatters';

const MODALIDADES: { valor: ModalidadeCliente; titulo: string; descricao: string; icon: typeof Store }[] = [
  { valor: 'ANUNCIANTE', titulo: 'Anunciante', descricao: 'Divulgue sua marca na rede SOBRE MÍDIA.', icon: Megaphone },
  { valor: 'HOST', titulo: 'Host', descricao: 'Receba telas no seu estabelecimento e ganhe por exibição.', icon: Store },
  { valor: 'HIBRIDO', titulo: 'Híbrido', descricao: 'Divulgue e hospede telas ao mesmo tempo.', icon: Landmark },
];

export default function OnboardingPage() {
  const { usuario, empresaOperadoraId } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const { hasActiveContract, isLoading: loadingModalidade } = useClienteModalidade();

  const [step, setStep] = useState(0);
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [modalidade, setModalidade] = useState<ModalidadeCliente | null>(null);
  const [duracaoMeses, setDuracaoMeses] = useState(3);
  const [formaPagamento, setFormaPagamento] = useState('PIX');

  const [estabelecimentos, setEstabelecimentos] = useState<EstabelecimentoDisponivel[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [carregandoEstabs, setCarregandoEstabs] = useState(false);

  const [calculo, setCalculo] = useState<CalculoPreco | null>(null);
  const [carregandoCalculo, setCarregandoCalculo] = useState(false);

  const [assinando, setAssinando] = useState(false);
  const [resultado, setResultado] = useState<{ numero_contrato?: string; assinado: boolean } | null>(null);
  const [createdContratoId, setCreatedContratoId] = useState<string | null>(null);

  // Controle do modal de assinatura digital
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [pendingEnvelopeId, setPendingEnvelopeId] = useState<string | null>(null);
  const [modalSigner, setModalSigner] = useState<SignatureSigner>({ nome: '' });
  const [modalContratoNumero, setModalContratoNumero] = useState('');

  useEffect(() => {
    if (!loadingModalidade && hasActiveContract) {
      navigate('/portal', { replace: true });
    }
  }, [loadingModalidade, hasActiveContract, navigate]);

  const iniciarSessao = async () => {
    if (!modalidade || !empresaOperadoraId) return;
    if (duracaoMeses < 3) {
      toast({ title: 'Duração mínima', description: 'O contrato tem duração mínima de 3 meses.', variant: 'destructive' });
      return;
    }
    let sessao = sessaoId ? { id: sessaoId } : null;
    if (!sessao) {
      sessao = await customerCommerceService.criarSessaoOnboarding(empresaOperadoraId, usuario?.cliente_id || null);
      if (!sessao) {
        toast({ title: 'Erro', description: 'Não foi possível iniciar a sessão.', variant: 'destructive' });
        return;
      }
      setSessaoId(sessao.id);
    }
    await customerCommerceService.atualizarSessaoOnboarding(sessao.id, { modalidade, step: 'ESTABELECIMENTOS', dados: { duracao_meses: duracaoMeses, forma_pagamento: formaPagamento } });
    setCarregandoEstabs(true);
    const data = await customerCommerceService.listarEstabelecimentosDisponiveis();
    setEstabelecimentos(data);
    setCarregandoEstabs(false);
    setStep(1);
  };

  const alternarSelecao = (id: string) => {
    const novo = new Set(selecionados);
    if (novo.has(id)) novo.delete(id);
    else novo.add(id);
    setSelecionados(novo);
  };

  const calcular = async () => {
    if (selecionados.size === 0) {
      toast({ title: 'Nenhum estabelecimento', description: 'Selecione ao menos um estabelecimento.', variant: 'destructive' });
      return;
    }
    setCarregandoCalculo(true);
    const calc = await customerCommerceService.calcularPreco(Array.from(selecionados), duracaoMeses);
    setCarregandoCalculo(false);
    if (!calc.success) {
      toast({ title: 'Erro no cálculo', description: calc.error || 'Falha ao calcular o preço.', variant: 'destructive' });
      return;
    }
    setCalculo(calc);
    setStep(2);
  };

  const criarEAssinar = async () => {
    if (!sessaoId || !calculo || !usuario) return;
    setAssinando(true);
    const resultadoContrato = await customerCommerceService.criarContratoOnboarding(
      sessaoId,
      Array.from(selecionados),
      duracaoMeses,
      formaPagamento
    );
    if (!resultadoContrato.success || !resultadoContrato.contrato_id) {
      setAssinando(false);
      toast({ title: 'Erro', description: resultadoContrato.error || 'Falha ao criar o contrato.', variant: 'destructive' });
      return;
    }
    const contratoId = resultadoContrato.contrato_id;
    setCreatedContratoId(contratoId);
    toast({ title: 'Contrato criado', description: `${resultadoContrato.numero_contrato} — gerando documento oficial...` });

    const doc = await gerarDocumentoContrato(contratoId, usuario.id);
    if (!doc.success || !doc.objectKey) {
      setAssinando(false);
      toast({ title: 'Erro na geração do PDF', description: doc.error || 'Falha ao gerar o documento.', variant: 'destructive' });
      return;
    }

    const envelope = await criarEnvelopeInterno(contratoId, usuario.id);
    if (!envelope.success || !envelope.assinaturaId) {
      setAssinando(false);
      toast({ title: 'Erro no envelope', description: envelope.error || 'Falha ao criar o envelope de assinatura.', variant: 'destructive' });
      return;
    }

    // Configura signatário e abre modal visual (sem assinatura silenciosa)
    const signerData: SignatureSigner = {
      nome: envelope.signatarioNome || usuario.nome,
      email: envelope.signatarioEmail || usuario.email,
      cpfCnpj: envelope.signatarioCpfCnpj || '',
    };
    setModalSigner(signerData);
    setModalContratoNumero(resultadoContrato.numero_contrato || '');
    setPendingEnvelopeId(envelope.assinaturaId);
    setAssinando(false);
    setShowSignatureModal(true);
  };

  const handleSignatureCapture = async (captureResult: SignatureCaptureResult) => {
    setShowSignatureModal(false);
    if (!pendingEnvelopeId || !usuario) return;

    if (captureResult.action === 'SKIPPED') {
      // MICRO-GATE 5.3.1: Acoplamento financeiro de cobrança inicial no onboarding mesmo ao postergar assinatura
      if (createdContratoId) {
        await financeiroService.obterOuCriarCobrancaInicialOnboarding(createdContratoId, usuario.id);
      }
      toast({
        title: 'Assinatura Postergada',
        description: 'Seu contrato foi criado e permanecerá pendente para assinatura posterior no painel.',
      });
      setResultado({ numero_contrato: modalContratoNumero, assinado: false });
      setStep(3);
      return;
    }

    setAssinando(true);
    try {
      const ass = await assinarDocumento(
        pendingEnvelopeId,
        {
          nome: captureResult.signer.nome || modalSigner.nome || usuario.nome,
          email: captureResult.signer.email || modalSigner.email || usuario.email,
          cpfCnpj: captureResult.signer.cpfCnpj || modalSigner.cpfCnpj || '',
          signatureDataUrl: captureResult.signatureDataUrl,
          method: captureResult.method,
        },
        undefined,
        undefined,
        usuario.id
      );

      if (!ass.success) {
        toast({ title: 'Erro na assinatura', description: ass.error || 'Falha ao assinar o documento.', variant: 'destructive' });
        setResultado({ numero_contrato: modalContratoNumero, assinado: false });
        setStep(3);
        return;
      }

      // MICRO-GATE 5.3.1: Acoplamento Financeiro do Onboarding Self-Service pós-assinatura
      if (createdContratoId) {
        const cobRes = await financeiroService.obterOuCriarCobrancaInicialOnboarding(createdContratoId, usuario.id);
        if (cobRes.success) {
          toast({
            title: 'Contrato Assinado & Cobrança Gerada',
            description: `Cobrança de onboarding (${formatCurrency(cobRes.valor || 0)}) vinculada via ${cobRes.formaPagamento}.`,
          });
        }
      }

      toast({ title: 'Contrato assinado!', description: 'Bem-vindo à rede SOBRE MÍDIA. Redirecionando para o painel...' });
      setResultado({ numero_contrato: modalContratoNumero, assinado: true });
      setStep(3);

      setTimeout(() => {
        window.location.assign('/portal');
      }, 2500);
    } catch (err: any) {
      toast({ title: 'Erro', description: err?.message || 'Falha ao processar assinatura.', variant: 'destructive' });
      setResultado({ numero_contrato: modalContratoNumero, assinado: false });
      setStep(3);
    } finally {
      setAssinando(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto animate-fade-in pb-12">
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <Rocket className="h-6 w-6 text-primary" /> Bem-vindo! Vamos configurar sua conta
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Complete seu cadastro para acessar todas as funcionalidades da Plataforma SOBRE MÍDIA.
        </p>
      </div>

      <div className="flex items-center gap-2 text-xs text-slate-500">
        {['Solução', 'Estabelecimentos', 'Preço e revisão', 'Contrato'].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border ${i <= step ? 'bg-primary/20 text-primary border-primary/30' : 'border-white/10 text-slate-500'}`}>
              {i < step ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span>{i + 1}</span>} {label}
            </span>
            {i < 3 && <span className="text-slate-600">—</span>}
          </div>
        ))}
      </div>

      {step === 0 && (
        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-6 space-y-6">
            <div>
              <h3 className="text-lg font-bold text-white mb-1">1. Escolha a modalidade</h3>
              <p className="text-slate-400 text-sm">A modalidade define sua relação com a rede.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {MODALIDADES.map((m) => (
                <button
                  key={m.valor}
                  onClick={() => setModalidade(m.valor)}
                  className={`text-left p-4 rounded-2xl border transition-all ${modalidade === m.valor ? 'border-primary bg-primary/15 shadow-lg shadow-primary/10' : 'border-white/10 bg-slate-950/50 hover:border-white/25'}`}
                >
                  <m.icon className={`h-7 w-7 mb-3 ${modalidade === m.valor ? 'text-primary' : 'text-slate-500'}`} />
                  <p className="font-bold text-white">{m.titulo}</p>
                  <p className="text-xs text-slate-400 mt-1">{m.descricao}</p>
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-300 block mb-2">Duração do contrato (mínimo 3 meses)</label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={3}
                    max={24}
                    value={duracaoMeses}
                    onChange={(e) => setDuracaoMeses(Number(e.target.value))}
                    className="flex-1 accent-purple-500"
                  />
                  <Badge className="bg-primary/20 text-primary border-primary/30 text-sm min-w-12 justify-center">{duracaoMeses} meses</Badge>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-300 block mb-2">Forma de pagamento</label>
                <select
                  value={formaPagamento}
                  onChange={(e) => setFormaPagamento(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white outline-none"
                >
                  {['PIX', 'BOLETO', 'CARTAO_CREDITO', 'DEBITO_RECORRENTE'].map((f) => (
                    <option key={f} value={f}>{f.replace('_', ' ')}</option>
                  ))}
                </select>
              </div>
            </div>

            <Button onClick={iniciarSessao} disabled={!modalidade} className="bg-gradient-to-r from-primary to-purple-500 text-white gap-2">
              <ArrowRight className="h-4 w-4" /> Selecionar estabelecimentos
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <MapPin className="h-5 w-5 text-primary" /> 2. Estabelecimentos disponíveis
                </h3>
                <p className="text-slate-400 text-sm">{estabelecimentos.length} unidades com telas prontas na rede.</p>
              </div>
              <Badge className="bg-primary/20 text-primary border-primary/30">{selecionados.size} selecionados</Badge>
            </div>

            {carregandoEstabs ? (
              <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
            ) : estabelecimentos.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <Store className="h-10 w-10 mx-auto text-slate-600 mb-3" />
                <p>Nenhum estabelecimento disponível no momento.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {estabelecimentos.map((est) => {
                  const ativo = selecionados.has(est.unidade_id);
                  return (
                    <button
                      key={est.unidade_id}
                      onClick={() => alternarSelecao(est.unidade_id)}
                      className={`text-left p-4 rounded-2xl border transition-all ${ativo ? 'border-primary bg-primary/15' : 'border-white/10 bg-slate-950/50 hover:border-white/25'}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <Monitor className={`h-4 w-4 shrink-0 ${ativo ? 'text-primary' : 'text-slate-500'}`} />
                          <span className="font-bold text-white text-sm truncate">{est.nome}</span>
                        </div>
                        {ativo && <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{est.cidade} — {est.estado} · Rede {est.rede_nome}</p>
                      <div className="flex items-center justify-between mt-2 text-xs">
                        <span className="text-slate-500">{est.quantidade_telas} telas</span>
                        <span className="text-emerald-400 font-bold">{formatCurrency(est.valor_unitario)}/mês</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(0)} className="border-white/10 text-slate-300 gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button onClick={calcular} disabled={selecionados.size === 0 || carregandoCalculo} className="bg-gradient-to-r from-primary to-purple-500 text-white gap-2">
                {carregandoCalculo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calculator className="h-4 w-4" />}
                Calcular preço oficial
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && calculo && (
        <Card className="border border-white/10 bg-slate-900/80">
          <CardContent className="p-6 space-y-5">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <CircleDollarSign className="h-5 w-5 text-emerald-400" /> 3. Revisão e preço oficial
              </h3>
              <p className="text-slate-400 text-sm">Valores calculados pela plataforma com base no catálogo de rede.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 text-center">
                <p className="text-slate-500 text-[10px] uppercase">Telas</p>
                <p className="text-2xl font-bold text-white">{calculo.total_telas ?? 0}</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 text-center">
                <p className="text-slate-500 text-[10px] uppercase">Duração</p>
                <p className="text-2xl font-bold text-white">{calculo.duracao_meses ?? 0}<span className="text-sm text-slate-400"> meses</span></p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 text-center">
                <p className="text-slate-500 text-[10px] uppercase">Mensal</p>
                <p className="text-2xl font-bold text-emerald-400">{formatCurrency(calculo.valor_mensal ?? 0)}</p>
              </div>
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 text-center">
                <p className="text-slate-500 text-[10px] uppercase">Total do período</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(calculo.valor_total_periodo ?? 0)}</p>
              </div>
            </div>

            <div className="space-y-2">
              {(calculo.itens || []).map((item) => (
                <div key={item.unidade_id} className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-white/5 text-sm">
                  <div>
                    <p className="text-white font-medium">{item.nome}</p>
                    <p className="text-xs text-slate-500">{item.cidade} — {item.estado} · {item.quantidade_telas} telas</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-400 text-xs">{formatCurrency(item.valor_unitario)}/mês</p>
                    <p className="text-white font-bold">{formatCurrency(item.valor_total)}/mês</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="border-white/10 text-slate-300 gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button onClick={criarEAssinar} disabled={assinando} className="bg-gradient-to-r from-emerald-500 to-teal-500 text-white gap-2">
                {assinando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSignature className="h-4 w-4" />}
                {assinando ? 'Criando contrato e assinando...' : 'Criar contrato e assinar digitalmente'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 3 && (
        <Card className="border border-emerald-500/30 bg-emerald-500/5">
          <CardContent className="p-10 text-center space-y-4">
            <CheckCircle2 className="h-16 w-16 text-emerald-400 mx-auto" />
            <h3 className="text-2xl font-bold text-white">
              {resultado?.assinado ? 'Contrato assinado com sucesso!' : 'Contrato criado — assinatura pendente'}
            </h3>
            <p className="text-slate-400">
              Contrato <strong className="text-white">{resultado?.numero_contrato}</strong> —{' '}
              {resultado?.assinado
                ? 'sua expansão já está em produção. Acompanhe tudo no portal.'
                : 'a assinatura será concluída em breve. Acompanhe o status no Contrato.'}
            </p>
            <div className="flex justify-center gap-3 pt-2">
              <Button variant="outline" onClick={() => window.location.assign('/portal/pontos')} className="border-white/10 text-slate-300 gap-2">
                <MapPin className="h-4 w-4" /> Ver meus pontos
              </Button>
              <Button variant="outline" onClick={() => window.location.assign('/portal/contrato')} className="border-white/10 text-slate-300 gap-2">
                <PenLine className="h-4 w-4" /> Ver contrato
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {showSignatureModal && (
        <SignatureCaptureModal
          isOpen={showSignatureModal}
          onClose={() => setShowSignatureModal(false)}
          onCapture={handleSignatureCapture}
          signer={modalSigner}
          contratoNumero={modalContratoNumero}
          tipoContrato={modalidade || 'ANUNCIANTE'}
          tituloDocumento="Contrato Oficial de Prestação de Serviços"
        />
      )}
    </div>
  );
}