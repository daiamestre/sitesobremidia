import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { customerCommerceService } from '../../services/customerCommerce.service';
import { ArrowLeft, ArrowRight, CheckCircle2, Megaphone, Calendar, Image as ImageIcon, MapPin, CreditCard, UploadCloud, Monitor } from 'lucide-react';

const STEPS = [
  { id: 1, title: 'Informações Básicas', icon: Megaphone },
  { id: 2, title: 'Mídia e Criativo', icon: ImageIcon },
  { id: 3, title: 'Distribuição', icon: MapPin },
  { id: 4, title: 'Pagamento', icon: CreditCard },
  { id: 5, title: 'Revisão Final', icon: CheckCircle2 }
];

export default function NovaCampanhaPage() {
  const { usuario, empresaOperadoraId } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  // Dados Auxiliares
  const [telasDisponiveis, setTelasDisponiveis] = useState<any[]>([]);
  const [telasSelecionadas, setTelasSelecionadas] = useState<string[]>([]);
  const [midiaFile, setMidiaFile] = useState<File | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    objetivo: 'BRANDING',
    inicio: '',
    fim: '',
    duracao_segundos: '10'
  });

  useEffect(() => {
    if (empresaOperadoraId) {
      customerCommerceService.buscarTelasDisponiveis(empresaOperadoraId).then(data => {
        setTelasDisponiveis(data);
      });
    }
  }, [empresaOperadoraId]);

  const handleNext = () => {
    if (currentStep === 1 && (!formData.titulo || !formData.inicio || !formData.fim)) {
      toast({ title: 'Campos Obrigatórios', description: 'Preencha o título e o período da campanha.', variant: 'destructive' });
      return;
    }
    if (currentStep === 2 && !midiaFile) {
      toast({ title: 'Mídia Ausente', description: 'Faça o upload do seu criativo para continuar.', variant: 'destructive' });
      return;
    }
    if (currentStep === 3 && telasSelecionadas.length === 0) {
      toast({ title: 'Telas não selecionadas', description: 'Selecione ao menos um ponto de exibição.', variant: 'destructive' });
      return;
    }
    setCurrentStep(prev => Math.min(prev + 1, STEPS.length));
  };

  const handleBack = () => {
    setCurrentStep(prev => Math.max(prev - 1, 1));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setMidiaFile(e.target.files[0]);
    }
  };

  const toggleTela = (id: string) => {
    setTelasSelecionadas(prev => 
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    );
  };

  const toggleTodasTelas = () => {
    if (telasSelecionadas.length === telasDisponiveis.length) {
      setTelasSelecionadas([]);
    } else {
      setTelasSelecionadas(telasDisponiveis.map(t => t.id));
    }
  };

  const handleCreate = async (status: 'DRAFT' | 'REVIEW') => {
    if (!usuario?.cliente_id || !usuario?.empresa_operadora_id) return;
    
    setLoading(true);
    try {
      // 1. Criar Campanha em Status DRAFT primeiro (tolerância a falhas)
      const campanhaCriada = await customerCommerceService.criarCampanha(usuario.empresa_operadora_id, usuario.cliente_id, {
        ...formData,
        status: 'DRAFT',
        duracao_segundos: parseInt(formData.duracao_segundos) || 10
      });

      if (!campanhaCriada) throw new Error('Falha ao criar o registro da campanha');

      // 2. Fazer Upload da Mídia
      if (midiaFile) {
        await customerCommerceService.uploadCriativoCampanha(campanhaCriada.id, midiaFile);
      }

      // 3. Vincular Telas
      if (telasSelecionadas.length > 0) {
        await customerCommerceService.vincularTelasACampanha(campanhaCriada.id, telasSelecionadas);
      }

      // 4. Submeter para Revisão via RPC (Aciona o Communication Core)
      if (status === 'REVIEW') {
        const enviado = await customerCommerceService.submeterCampanhaParaRevisao(usuario.empresa_operadora_id, campanhaCriada.id);
        if (!enviado) throw new Error('A campanha foi salva, mas falhou ao enviar para revisão.');
      }

      toast({ 
        title: 'Sucesso!', 
        description: status === 'DRAFT' ? 'Rascunho salvo com segurança.' : 'Campanha enviada para revisão da nossa equipe.'
      });
      navigate('/portal/campanhas');
      
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message || 'Não foi possível salvar a campanha.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-fade-in pb-12">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/portal/campanhas')} className="text-slate-400 hover:text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            Nova Campanha
          </h2>
          <p className="text-slate-400 text-sm">Configure sua campanha, pague e envie para revisão.</p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center justify-between mb-8 relative px-2">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-slate-800 -z-10 -translate-y-1/2"></div>
        {STEPS.map((step) => {
          const Icon = step.icon;
          const isActive = currentStep === step.id;
          const isCompleted = currentStep > step.id;
          return (
            <div key={step.id} className="flex flex-col items-center gap-2 bg-[#0B1120] px-2 sm:px-4">
              <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                isActive ? 'border-primary bg-primary/20 text-primary' : 
                isCompleted ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400' : 
                'border-slate-700 bg-slate-900 text-slate-500'
              }`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className={`text-[10px] sm:text-xs font-medium text-center hidden sm:block ${isActive || isCompleted ? 'text-white' : 'text-slate-500'}`}>
                {step.title}
              </span>
            </div>
          );
        })}
      </div>

      <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <CardContent className="pt-6 min-h-[400px]">
          {/* STEP 1: Informações Básicas */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fade-in">
              <div className="space-y-4">
                <div className="grid gap-2">
                  <Label className="text-slate-300">Título da Campanha</Label>
                  <Input 
                    placeholder="Ex: Ofertas de Primavera 2026" 
                    value={formData.titulo}
                    onChange={e => setFormData({...formData, titulo: e.target.value})}
                    className="bg-slate-900 border-white/10"
                  />
                </div>
                
                <div className="grid gap-2">
                  <Label className="text-slate-300">Objetivo</Label>
                  <Select value={formData.objetivo} onValueChange={v => setFormData({...formData, objetivo: v})}>
                    <SelectTrigger className="bg-slate-900 border-white/10 text-white">
                      <SelectValue placeholder="Selecione..." />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10 text-slate-300">
                      <SelectItem value="BRANDING" className="focus:bg-white/10 focus:text-white">Branding & Institucional</SelectItem>
                      <SelectItem value="PROMO" className="focus:bg-white/10 focus:text-white">Vendas & Ofertas</SelectItem>
                      <SelectItem value="EVENTO" className="focus:bg-white/10 focus:text-white">Divulgação de Evento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label className="text-slate-300">Data de Início</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                      <Input type="date" className="pl-9 bg-slate-900 border-white/10 text-white" value={formData.inicio} onChange={e => setFormData({...formData, inicio: e.target.value})} />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label className="text-slate-300">Data de Fim</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                      <Input type="date" className="pl-9 bg-slate-900 border-white/10 text-white" value={formData.fim} onChange={e => setFormData({...formData, fim: e.target.value})} />
                    </div>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label className="text-slate-300">Descrição (Opcional)</Label>
                  <Textarea 
                    placeholder="Detalhes internos da campanha..." 
                    value={formData.descricao}
                    onChange={e => setFormData({...formData, descricao: e.target.value})}
                    className="bg-slate-900 border-white/10 resize-none text-white"
                    rows={3}
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Mídia */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fade-in py-6">
              <h3 className="text-lg font-bold text-white mb-2">Envie seu Criativo</h3>
              <p className="text-slate-400 text-sm mb-6">Faça o upload do vídeo ou imagem que será exibido nas telas (MP4, PNG ou JPG).</p>
              
              <div className="border-2 border-dashed border-white/10 rounded-2xl p-12 flex flex-col items-center justify-center bg-slate-900/50 hover:bg-slate-800/50 transition-colors relative">
                <Input 
                  type="file" 
                  accept="image/png, image/jpeg, video/mp4"
                  onChange={handleFileChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                {midiaFile ? (
                  <div className="text-center">
                    <CheckCircle2 className="h-12 w-12 text-emerald-400 mx-auto mb-3" />
                    <p className="text-emerald-400 font-medium">{midiaFile.name}</p>
                    <p className="text-slate-400 text-xs mt-1">{(midiaFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <UploadCloud className="h-12 w-12 text-slate-500 mx-auto mb-3" />
                    <p className="text-white font-medium">Clique ou arraste seu arquivo aqui</p>
                    <p className="text-slate-500 text-sm mt-1">Tamanho máximo: 50MB</p>
                  </div>
                )}
              </div>
              
              <div className="grid gap-2 mt-6">
                <Label className="text-slate-300">Duração de exibição do arquivo (segundos)</Label>
                <Input 
                  type="number"
                  min="5"
                  max="60"
                  value={formData.duracao_segundos}
                  onChange={e => setFormData({...formData, duracao_segundos: e.target.value})}
                  className="bg-slate-900 border-white/10 text-white max-w-[150px]"
                />
              </div>
            </div>
          )}

          {/* STEP 3: Distribuição (Telas) */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-white">Selecione as Telas</h3>
                  <p className="text-slate-400 text-sm">Onde você deseja exibir sua campanha?</p>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={toggleTodasTelas}
                  className="border-white/10 bg-slate-900 text-white"
                >
                  {telasSelecionadas.length === telasDisponiveis.length ? 'Desmarcar Todas' : 'Selecionar Todas'}
                </Button>
              </div>

              {telasDisponiveis.length === 0 ? (
                <div className="text-center p-8 border border-white/10 rounded-xl bg-slate-900">
                  <Monitor className="h-8 w-8 text-slate-500 mx-auto mb-3" />
                  <p className="text-slate-300">Nenhuma tela ativa disponível no seu contrato atual.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  {telasDisponiveis.map(tela => (
                    <div 
                      key={tela.id} 
                      className={`flex items-start gap-3 p-3 rounded-xl border transition-colors cursor-pointer ${
                        telasSelecionadas.includes(tela.id) ? 'border-primary bg-primary/10' : 'border-white/10 bg-slate-900 hover:bg-slate-800'
                      }`}
                      onClick={() => toggleTela(tela.id)}
                    >
                      <Checkbox 
                        checked={telasSelecionadas.includes(tela.id)}
                        className={telasSelecionadas.includes(tela.id) ? 'border-primary bg-primary' : 'border-slate-600'}
                      />
                      <div>
                        <p className="text-sm font-medium text-white">{tela.nome}</p>
                        <p className="text-xs text-slate-400">{tela.cidade} - {tela.estado}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Pagamento / Billing (PIX Mock) */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-fade-in py-6">
              <div className="flex flex-col md:flex-row gap-8 items-center justify-center">
                <div className="bg-white p-4 rounded-2xl w-48 h-48 flex items-center justify-center shrink-0">
                  <div className="text-center">
                    {/* Placeholder para QR Code PIX Asaas */}
                    <img src="https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=00020126580014br.gov.bcb.pix013600000000-0000-0000-0000-0000000000005204000053039865802BR5910SOBRE MIDIA6009SAO PAULO62070503***6304" alt="QR Code PIX" className="w-full h-full opacity-80" />
                  </div>
                </div>
                <div className="flex-1 space-y-4 text-center md:text-left">
                  <h3 className="text-xl font-bold text-emerald-400">Pagamento Expresso via PIX</h3>
                  <p className="text-slate-300">
                    Sua campanha engloba <strong className="text-white">{telasSelecionadas.length}</strong> telas durante o período selecionado.
                  </p>
                  <div className="bg-slate-900 border border-white/10 p-4 rounded-xl inline-block text-left w-full max-w-sm">
                    <div className="flex justify-between mb-2">
                      <span className="text-slate-400">Total a pagar</span>
                      <strong className="text-white">R$ {(telasSelecionadas.length * 150.00).toFixed(2).replace('.', ',')}</strong>
                    </div>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      * O QR Code PIX (via Asaas) confirma imediatamente seu faturamento sem precisar de aprovação financeira manual.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Revisão */}
          {currentStep === 5 && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-slate-900 border border-white/10 rounded-xl p-6 space-y-6">
                <h3 className="text-lg font-bold text-white mb-4">Revisão Final</h3>
                
                <div className="grid grid-cols-2 gap-y-6 gap-x-4">
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Título</p>
                    <p className="text-sm font-medium text-white">{formData.titulo}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Objetivo</p>
                    <p className="text-sm font-medium text-white">{formData.objetivo}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Período</p>
                    <p className="text-sm font-medium text-white">{formData.inicio} até {formData.fim}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 mb-1">Duração do Criativo</p>
                    <p className="text-sm font-medium text-white">{formData.duracao_segundos} segundos</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 mb-1">Telas Selecionadas</p>
                    <p className="text-sm font-medium text-white">{telasSelecionadas.length} de {telasDisponiveis.length} telas ativas</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-xs text-slate-500 mb-1">Arquivo Enviado</p>
                    <p className="text-sm font-medium text-emerald-400 flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4" /> {midiaFile?.name || 'Nenhum arquivo'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex gap-3">
                <Megaphone className="h-5 w-5 text-primary shrink-0" />
                <div className="text-sm text-slate-300">
                  <span className="text-white font-medium block mb-1">Passo Final</span>
                  Ao enviar para revisão, faremos o setup oficial e o <strong className="text-white">Communication Core</strong> notificará a matriz para aprovar seu conteúdo.
                </div>
              </div>
            </div>
          )}

        </CardContent>
        
        {/* Footer actions */}
        <div className="p-6 border-t border-white/10 bg-slate-900/50 flex items-center justify-between rounded-b-xl">
          <Button 
            variant="ghost" 
            onClick={handleBack}
            disabled={currentStep === 1 || loading}
            className="text-slate-400 hover:text-white"
          >
            Voltar
          </Button>

          <div className="flex items-center gap-3">
            {currentStep === STEPS.length ? (
              <>
                <Button 
                  variant="outline" 
                  className="border-white/10 bg-slate-900 hover:bg-slate-800 text-white hidden sm:flex"
                  onClick={() => handleCreate('DRAFT')}
                  disabled={loading}
                >
                  Salvar Rascunho
                </Button>
                <Button 
                  className="bg-primary hover:bg-primary/90 text-white gap-2"
                  onClick={() => handleCreate('REVIEW')}
                  disabled={loading}
                >
                  {loading && <div className="w-4 h-4 rounded-full border-2 border-white/20 border-t-transparent animate-spin"></div>}
                  {!loading && <CheckCircle2 className="h-4 w-4" />}
                  Enviar para Revisão
                </Button>
              </>
            ) : (
              <Button 
                className="bg-white text-black hover:bg-white/90 gap-2"
                onClick={handleNext}
              >
                Próximo <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
