import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { clienteService, ClienteCompleto } from '../../services/cliente.service';
import { propostaService } from '../../services/proposta.service';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { 
  Building2, 
  Search, 
  CheckCircle2, 
  User, 
  MapPin, 
  Phone, 
  Mail, 
  Plus, 
  ArrowRight, 
  ArrowLeft, 
  Loader2, 
  Tv, 
  DollarSign, 
  FileText,
  Briefcase
} from 'lucide-react';

export function IntelligentCommercialWizard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { empresaOperadoraId, representante } = useAuth();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Busca e Seleção de Cliente Existente
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ClienteCompleto[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isExistingClientSelected, setIsExistingClientSelected] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<ClienteCompleto | null>(null);

  // Form State Unificado
  const [formData, setFormData] = useState({
    // Cliente / Empresa
    nomeFantasia: '',
    razaoSocial: '',
    cnpj: '',
    segmento: '',
    telefone: '',
    whatsapp: '',
    email: '',
    cep: '',
    logradouro: '',
    numero: '',
    bairro: '',
    cidade: '',
    estado: '',
    
    // Unidade / Estabelecimento
    nomeUnidade: '',
    enderecoUnidade: '',
    
    // Contato Principal
    contatoNome: '',
    contatoCargo: '',
    contatoEmail: '',
    contatoTelefone: '',

    // Dados Comerciais & Mídia
    tituloCampanha: '',
    duracaoSegundos: 0,
    quantidadeTelas: 0,
    dataInicio: new Date().toISOString().split('T')[0],
    dataFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    
    // Condições Comerciais
    valorMensal: 0,
    formaPagamento: 'PIX' as 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'BANK_TRANSFER',
    observacoes: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  // Executa busca de clientes existentes
  const handleSearchClients = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    const all = await clienteService.findAll(empresaOperadoraId || undefined, representante?.id || undefined);
    const filtered = all.filter((c) => {
      const emp = c.empresas?.[0];
      const term = searchQuery.toLowerCase();
      return (
        (emp?.nome_fantasia || '').toLowerCase().includes(term) ||
        (emp?.razao_social || '').toLowerCase().includes(term) ||
        (emp?.cnpj || '').includes(term)
      );
    });
    setSearchResults(filtered);
    setIsSearching(false);
  };

  // Seleciona cliente existente e preenche form
  const handleSelectClient = (c: ClienteCompleto) => {
    const emp = c.empresas?.[0];
    const ct = emp?.contatos?.[0];

    setSelectedCliente(c);
    setIsExistingClientSelected(true);
    setFormData((prev) => ({
      ...prev,
      nomeFantasia: emp?.nome_fantasia || '',
      razaoSocial: emp?.razao_social || '',
      cnpj: emp?.cnpj || '',
      segmento: emp?.segmento || 'Geral',
      telefone: emp?.telefone || '',
      whatsapp: emp?.whatsapp || '',
      email: emp?.email || '',
      cidade: emp?.cidade || 'São Paulo',
      estado: emp?.estado || 'SP',
      contatoNome: ct?.nome || emp?.representante_legal || '',
      contatoCargo: ct?.cargo || 'Gerente',
      contatoEmail: ct?.email || emp?.email || '',
      contatoTelefone: ct?.telefone || emp?.whatsapp || '',
    }));

    toast({
      title: 'Cliente Selecionado!',
      description: `Cliente #${c.codigo_cliente} (${emp?.nome_fantasia}) selecionado.`,
    });
  };

  const handleClearSelectedClient = () => {
    setSelectedCliente(null);
    setIsExistingClientSelected(false);
  };

  // Finaliza atendimento comercial criando/vinculando cliente e proposta
  const handleFinishWizard = async () => {
    console.log("handleFinishWizard INICIADO");
    console.log({ empresaOperadoraId, representanteId: representante?.id });
    
    if (!empresaOperadoraId || !representante?.id) {
      console.log("REJEITADO: Sessão inválida");
      toast({
        title: 'Sessão inválida',
        description: 'Não foi possível validar o representante.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    let finalClienteId = selectedCliente?.id;
    console.log("Prosseguindo com wizard...");

    // 1. Se for cliente novo, cria no PostgreSQL via clienteService
    if (!isExistingClientSelected || !finalClienteId) {
      console.log("Criando novo cliente...");
      const resCliente = await clienteService.create({
        empresaOperadoraId,
        representanteId: representante.id,
        razaoSocial: formData.razaoSocial || formData.nomeFantasia,
        nomeFantasia: formData.nomeFantasia,
        cnpj: formData.cnpj,
        segmento: formData.segmento,
        telefone: formData.telefone,
        whatsapp: formData.whatsapp,
        email: formData.email,
        cep: formData.cep,
        logradouro: formData.logradouro,
        numero: formData.numero,
        bairro: formData.bairro,
        cidade: formData.cidade,
        estado: formData.estado,
        contatoNome: formData.contatoNome,
        contatoCargo: formData.contatoCargo,
        contatoEmail: formData.contatoEmail,
        contatoTelefone: formData.contatoTelefone,
      });

      if (!resCliente.success || !resCliente.clienteId) {
        setIsSubmitting(false);
        toast({
          title: 'Erro ao cadastrar cliente',
          description: resCliente.error || 'Falha ao salvar cliente.',
          variant: 'destructive',
        });
        return;
      }
      finalClienteId = resCliente.clienteId;
    }

    // 2. Grava a proposta comercial atrelada ao cliente e ao representante
    const resProp = await propostaService.create({
      empresaOperadoraId,
      clienteId: finalClienteId,
      representanteId: representante.id,
      tituloCampanha: formData.tituloCampanha,
      duracaoSegundos: Number(formData.duracaoSegundos),
      quantidadeTelas: Number(formData.quantidadeTelas),
      valorMensal: Number(formData.valorMensal),
      formaPagamento: formData.formaPagamento,
      dataInicio: formData.dataInicio,
      dataFim: formData.dataFim,
      observacoes: formData.observacoes,
    });

    setIsSubmitting(false);

    if (resProp.success) {
      toast({
        title: 'Atendimento Comercial Concluído!',
        description: `Proposta ${resProp.numeroProposta} gerada no CRM com sucesso.`,
      });
      navigate('/representantes/clientes');
    } else {
      toast({
        title: 'Erro na Proposta',
        description: resProp.error || 'Falha ao gerar proposta comercial.',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-fade-in pb-12">
      {/* Header Stepper Navigation */}
      <div className="p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/15 text-primary border border-primary/20">
              <Briefcase className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-display font-extrabold text-white">
                Formulário Comercial Inteligente
              </h2>
              <p className="text-slate-300 text-xs mt-0.5">
                Atendimento Unificado ➔ Cliente, Estabelecimento, Contato e Proposta Comercial
              </p>
            </div>
          </div>
          <Badge className="bg-primary/20 text-primary border-primary/30 px-3 py-1 font-bold text-xs">
            Etapa {step} de 5
          </Badge>
        </div>

        {/* Dynamic Wizard Steps Bar */}
        <div className="grid grid-cols-5 gap-2 pt-2">
          {['1. Cliente', '2. Unidade', '3. Contato', '4. Mídia', '5. Revisão'].map((label, idx) => {
            const stepNum = idx + 1;
            const active = step === stepNum;
            const completed = step > stepNum;
            return (
              <div 
                key={label} 
                onClick={() => completed && setStep(stepNum)}
                className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                  active ? 'bg-primary/20 border-primary text-primary font-bold shadow-lg' :
                  completed ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-semibold' :
                  'bg-slate-950/40 border-white/5 text-slate-500'
                }`}
              >
                <div className="text-[11px] truncate">{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* STEP 1: CLIENTE & EMPRESA (SELEÇÃO OU CADASTRO) */}
      {step === 1 && (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Etapa 1: Cliente & Empresa
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Localize um cliente já cadastrado ou preencha as informações do novo cliente comercial.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {/* Opção A: Buscar Cliente Existente */}
            <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-3">
              <Label className="text-xs font-bold text-primary uppercase">Buscar Cliente Cadastrado na Carteira</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    placeholder="Digite nome fantasia, razão social ou CNPJ..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 bg-slate-900 border-white/10 text-white rounded-xl h-10 text-xs"
                  />
                </div>
                <Button onClick={handleSearchClients} disabled={isSearching} className="gradient-primary text-xs font-bold px-4 h-10">
                  {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Buscar'}
                </Button>
              </div>

              {searchResults.length > 0 && (
                <div className="mt-3 space-y-2 max-h-40 overflow-y-auto pr-1">
                  {searchResults.map((c) => {
                    const emp = c.empresas?.[0];
                    return (
                      <div 
                        key={c.id} 
                        onClick={() => handleSelectClient(c)}
                        className="p-2.5 rounded-lg bg-slate-900 border border-white/10 hover:border-primary cursor-pointer flex items-center justify-between transition-all"
                      >
                        <div>
                          <span className="text-xs font-bold text-white mr-2">#{c.codigo_cliente}</span>
                          <span className="text-xs text-slate-200">{emp?.nome_fantasia || emp?.razao_social}</span>
                          <span className="text-[11px] text-slate-400 block">{emp?.cnpj} - {emp?.cidade}/{emp?.estado}</span>
                        </div>
                        <Button size="sm" variant="ghost" className="text-xs text-primary">Selecionar</Button>
                      </div>
                    );
                  })}
                </div>
              )}

              {isExistingClientSelected && selectedCliente && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-xs font-bold text-emerald-400">
                      Cliente Selecionado: #{selectedCliente.codigo_cliente} - {formData.nomeFantasia} ({formData.cnpj})
                    </span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={handleClearSelectedClient} className="text-xs text-slate-400 hover:text-white">
                    Trocar / Novo
                  </Button>
                </div>
              )}
            </div>

            {/* Opção B: Dados da Empresa (Preenchidos ou Editáveis) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Nome Fantasia *</Label>
                <Input
                  name="nomeFantasia"
                  value={formData.nomeFantasia}
                  onChange={handleChange}
                  placeholder="Ex: Farmácia DrogaMais"
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Razão Social *</Label>
                <Input
                  name="razaoSocial"
                  value={formData.razaoSocial}
                  onChange={handleChange}
                  placeholder="Ex: DrogaMais LTDA"
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">CNPJ *</Label>
                <Input
                  name="cnpj"
                  value={formData.cnpj}
                  onChange={handleChange}
                  placeholder="00.000.000/0001-00"
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">WhatsApp Comercial *</Label>
                <Input
                  name="whatsapp"
                  value={formData.whatsapp}
                  onChange={handleChange}
                  placeholder="(11) 99999-8888"
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">E-mail Corporativo *</Label>
                <Input
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="contato@empresa.com"
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Cidade / Estado</Label>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    name="cidade"
                    value={formData.cidade}
                    onChange={handleChange}
                    className="col-span-2 bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                  <Input
                    name="estado"
                    value={formData.estado}
                    onChange={handleChange}
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-white/10">
              <Button onClick={() => setStep(2)} className="gradient-primary glow-primary font-bold rounded-xl px-6 gap-2">
                <span>Próximo: Estabelecimento</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: ESTABELECIMENTO / UNIDADE */}
      {step === 2 && (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Etapa 2: Estabelecimento / Unidade Física
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Mapeie o ponto de exibição das telas do cliente.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs text-slate-200 font-semibold">Nome da Unidade / Loja *</Label>
                <Input
                  name="nomeUnidade"
                  value={formData.nomeUnidade}
                  onChange={handleChange}
                  placeholder="Ex: Unidade Matriz - Av. Paulista"
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs text-slate-200 font-semibold">Endereço do Local de Exibição</Label>
                <Input
                  name="enderecoUnidade"
                  value={formData.enderecoUnidade}
                  onChange={handleChange}
                  placeholder="Ex: Av. Paulista, 1000 - Loja 04"
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>
            </div>

            <div className="flex justify-between pt-6 border-t border-white/10">
              <Button variant="outline" onClick={() => setStep(1)} className="border-slate-700 text-slate-300 rounded-xl gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button onClick={() => setStep(3)} className="gradient-primary glow-primary font-bold rounded-xl px-6 gap-2">
                <span>Próximo: Contato</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: CONTATOS */}
      {step === 3 && (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Etapa 3: Contatos Comerciais
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Informe o responsável direto pelas aprovações e contrato.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Nome do Contato Principal *</Label>
                <Input
                  name="contatoNome"
                  value={formData.contatoNome}
                  onChange={handleChange}
                  placeholder="Ex: Carlos Roberto"
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Cargo / Função</Label>
                <Input
                  name="contatoCargo"
                  value={formData.contatoCargo}
                  onChange={handleChange}
                  placeholder="Ex: Gerente Geral"
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">E-mail do Contato</Label>
                <Input
                  name="contatoEmail"
                  value={formData.contatoEmail}
                  onChange={handleChange}
                  placeholder="carlos@empresa.com"
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Telefone / Whats Direct</Label>
                <Input
                  name="contatoTelefone"
                  value={formData.contatoTelefone}
                  onChange={handleChange}
                  placeholder="(11) 98888-7777"
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>
            </div>

            <div className="flex justify-between pt-6 border-t border-white/10">
              <Button variant="outline" onClick={() => setStep(2)} className="border-slate-700 text-slate-300 rounded-xl gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button onClick={() => setStep(4)} className="gradient-primary glow-primary font-bold rounded-xl px-6 gap-2">
                <span>Próximo: Dados de Mídia</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: DADOS DE MÍDIA & PLANO */}
      {step === 4 && (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Tv className="h-5 w-5 text-primary" />
              Etapa 4: Dados da Campanha & Telas
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Defina a quantidade de telas, tempo de veiculação e vigência.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2 sm:col-span-2">
                <Label className="text-xs text-slate-200 font-semibold">Título da Campanha *</Label>
                <Input
                  name="tituloCampanha"
                  value={formData.tituloCampanha}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Qtd. Telas / Painéis *</Label>
                <Input
                  name="quantidadeTelas"
                  type="number"
                  value={formData.quantidadeTelas}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Valor Mensal (R$) *</Label>
                <Input
                  name="valorMensal"
                  type="number"
                  value={formData.valorMensal}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Forma de Pagamento</Label>
                <Select 
                  value={formData.formaPagamento} 
                  onValueChange={(val: any) => setFormData(p => ({ ...p, formaPagamento: val }))}
                >
                  <SelectTrigger className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-white/10 text-white">
                    <SelectItem value="PIX">PIX à Vista</SelectItem>
                    <SelectItem value="BOLETO">Boleto Faturado</SelectItem>
                    <SelectItem value="CREDIT_CARD">Cartão de Crédito</SelectItem>
                    <SelectItem value="BANK_TRANSFER">Transferência Bancária</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-200 font-semibold">Duração da Mídia (Segundos)</Label>
                <Input
                  name="duracaoSegundos"
                  type="number"
                  value={formData.duracaoSegundos}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>
            </div>

            <div className="flex justify-between pt-6 border-t border-white/10">
              <Button variant="outline" onClick={() => setStep(3)} className="border-slate-700 text-slate-300 rounded-xl gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button onClick={() => setStep(5)} className="gradient-primary glow-primary font-bold rounded-xl px-6 gap-2">
                <span>Próximo: Revisão</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 5: REVISÃO & CONCLUSÃO */}
      {step === 5 && (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-400" />
              Etapa 5: Resumo e Emissão da Proposta Comercial
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Revise todos os dados coletados antes de gravar o atendimento no PostgreSQL.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-2">
                <h4 className="text-xs font-bold text-primary uppercase">Empresa & Cliente</h4>
                <p className="text-sm font-bold text-white">{formData.nomeFantasia}</p>
                <p className="text-xs text-slate-300">CNPJ: {formData.cnpj}</p>
                <p className="text-xs text-slate-400">Cidade: {formData.cidade}/{formData.estado}</p>
                <p className="text-xs text-slate-400">Contato: {formData.contatoNome} ({formData.contatoTelefone || formData.whatsapp})</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-2">
                <h4 className="text-xs font-bold text-emerald-400 uppercase">Campanha & Negociação</h4>
                <p className="text-sm font-bold text-white">{formData.tituloCampanha}</p>
                <p className="text-xs text-slate-300">Telas / Pontos: {formData.quantidadeTelas} unidades</p>
                <p className="text-xs text-slate-300">Valor Mensal: R$ {Number(formData.valorMensal).toLocaleString('pt-BR')}</p>
                <p className="text-xs text-slate-400">Pagamento: {formData.formaPagamento}</p>
              </div>
            </div>

            <div className="flex justify-between pt-6 border-t border-white/10">
              <Button variant="outline" onClick={() => setStep(4)} className="border-slate-700 text-slate-300 rounded-xl gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button 
                onClick={handleFinishWizard} 
                disabled={isSubmitting}
                className="gradient-primary glow-primary font-bold rounded-xl px-8 h-12 shadow-xl hover:scale-105 transition-all"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    <span>Gravando no PostgreSQL...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="mr-2 h-5 w-5" />
                    <span>Finalizar Atendimento & Salvar Proposta</span>
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
