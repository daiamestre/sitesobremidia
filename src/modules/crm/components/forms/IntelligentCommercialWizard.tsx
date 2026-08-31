import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { clienteService, ClienteCompleto } from '../../services/cliente.service';
import { clienteFormSchema, UFS_VALIDAS, normalizarCnpj, normalizarCep } from '../../validators/cliente.validator';
import { StatusCliente } from '../../types/enums';
import { propostaService } from '../../services/proposta.service';
import { auditService } from '../../services/audit.service';
import { corporateUsersService } from '@/services/corporateUsers.service';
import { prospeccaoService } from '@/services/prospeccao.service';
import { SelecaoPontosParceiros } from '../prospeccao/SelecaoPontosParceiros';
import { supabase } from '@/integrations/supabase/client';
import type { CrmRole } from '../../types/rbac.types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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
  Briefcase,
  Info,
  AlertTriangle,
} from 'lucide-react';

type FormaPagamento = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'BANK_TRANSFER';

interface WizardFormState {
  // Empresa
  nomeFantasia: string;
  razaoSocial: string;
  cnpj: string;
  segmento: string;
  telefone: string;
  whatsapp: string;
  email: string;
  // Endereço
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
  // Responsável
  representanteLegal: string;
  cargoRepresentante: string;
  // Comercial (cliente)
  status: StatusCliente;
  observacoes: string;
  // Contato
  contatoNome: string;
  contatoCargo: string;
  contatoEmail: string;
  contatoTelefone: string;
  // Mídia & Negociação
  tituloCampanha: string;
  duracaoSegundos: number;
  quantidadeTelas: number;
  dataInicio: string;
  dataFim: string;
  valorMensal: number;
  formaPagamento: FormaPagamento;
  observacoesProposta: string;
}

const STEP_LABELS = ['1. Cliente & Endereço', '2. Unidade & Contato', '3. Pontos Parceiros', '4. Mídia & Negociação', '5. Revisão & Salvar'];

function formatCpfCnpj(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function formatCep(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatTelefone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Mapeia o perfil do usuário para o CrmRole oficial do módulo de auditoria. */
function mapPerfilParaCrmRole(perfilNome: string | null): CrmRole {
  const p = (perfilNome || 'REPRESENTANTE').toUpperCase();
  if (p === 'OWNER' || p === 'ADMIN') return 'ADMIN';
  if (p === 'GERENTE') return 'GERENTE';
  if (p === 'FINANCEIRO') return 'FINANCEIRO';
  if (p === 'DESIGNER') return 'DESIGNER';
  return 'REPRESENTANTE';
}

export function IntelligentCommercialWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const basePath = location.pathname.startsWith('/workspace') ? '/workspace' : '/representantes';
  const { toast } = useToast();
  const { user, empresaOperadoraId, representante, isOwner, perfilNome } = useAuth();

  const [step, setStep] = useState(1);
  // Seleção de PONTOS PARCEIROS na prospecção (missão Â§7-Â§10) â€” sincronizada
  // via RPC selecionar_pontos_prospeccao após a criação do cliente.
  const [pontosSelecionados, setPontosSelecionados] = useState<Set<string>>(new Set());
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Provisionamento automático do acesso do anunciante (Fechamento Comercial)
  type EstadoProvisionamento =
    | { estado: 'ok'; senhaInicial: string; login: string }
    | { estado: 'ja_existe'; login: string }
    | { estado: 'sem_email' }
    | { estado: 'falhou'; detalhe: string };
  const [provisionando, setProvisionando] = useState(false);
  const [provisionamento, setProvisionamento] = useState<EstadoProvisionamento | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Busca e Seleção de Cliente Existente
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ClienteCompleto[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isExistingClientSelected, setIsExistingClientSelected] = useState(false);
  const [selectedCliente, setSelectedCliente] = useState<ClienteCompleto | null>(null);

  // Form State Unificado â€” NENHUM dado é descartado entre etapas
  const [formData, setFormData] = useState<WizardFormState>({
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
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    representanteLegal: '',
    cargoRepresentante: '',
    status: StatusCliente.PROSPECT,
    observacoes: '',
    contatoNome: '',
    contatoCargo: '',
    contatoEmail: '',
    contatoTelefone: '',
    tituloCampanha: '',
    duracaoSegundos: 0,
    quantidadeTelas: 0,
    dataInicio: new Date().toISOString().split('T')[0],
    dataFim: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    valorMensal: 0,
    formaPagamento: 'PIX',
    observacoesProposta: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
if (name === 'cnpj') {
      setFormData((prev) => ({ ...prev, cnpj: formatCpfCnpj(value) }));
    }
    if (name === 'cep') {
      setFormData((prev) => ({ ...prev, cep: formatCep(value) }));
      return;
    }
    if (name === 'whatsapp' || name === 'telefone' || name === 'contatoTelefone') {
      setFormData((prev) => ({ ...prev, [name]: formatTelefone(value) }));
      return;
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: Number(value || 0) }));
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
        (emp?.cnpj || '').replace(/\D/g, '').includes(term.replace(/\D/g, ''))
      );
    });
    setSearchResults(filtered);
    setIsSearching(false);
  };

  // Seleciona cliente existente e preenche form (a proposta continua sendo criada)
  const handleSelectClient = (c: ClienteCompleto) => {
    const emp = c.empresas?.[0];
    const ct = emp?.contatos?.find((x) => x.is_principal) ?? emp?.contatos?.[0];

    setSelectedCliente(c);
    setIsExistingClientSelected(true);
    setErrors({});
    setFormData((prev) => ({
      ...prev,
      nomeFantasia: emp?.nome_fantasia || '',
      razaoSocial: emp?.razao_social || '',
      cnpj: emp?.cnpj || '',
      segmento: emp?.segmento || '',
      telefone: emp?.telefone || '',
      whatsapp: emp?.whatsapp || '',
      email: emp?.email || '',
      cep: emp?.cep || '',
      logradouro: emp?.logradouro || '',
      numero: emp?.numero || '',
      complemento: emp?.complemento || '',
      bairro: emp?.bairro || '',
      cidade: emp?.cidade || '',
      estado: emp?.estado || '',
      representanteLegal: emp?.representante_legal || '',
      cargoRepresentante: emp?.cargo_representante || '',
      status: (c.status as StatusCliente) || StatusCliente.PROSPECT,
      observacoes: emp?.observacoes || '',
      contatoNome: ct?.nome || emp?.representante_legal || '',
      contatoCargo: ct?.cargo || '',
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

  // Validação de campos obrigatórios da Etapa 1 (feedback antecipado; validação total na Etapa 4)
  // Cliente já existente na carteira não passa por validação cadastral: os dados vêm do banco real.
  const validateStep1 = (): boolean => {
    if (isExistingClientSelected) return true;
    const parsed = clienteFormSchema.safeParse(formData);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const field = String(issue.path[0] || 'form');
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      toast({
        title: 'Corrija os campos destacados',
        description: 'Há campos obrigatórios ou inválidos nos dados do cliente.',
        variant: 'destructive',
      });
      return false;
    }
    setErrors({});
    return true;
  };

  // Finaliza atendimento comercial criando cliente (quando novo) e proposta
  const handleFinishWizard = async () => {
    if (!empresaOperadoraId) {
      toast({
        title: 'Sessão inválida',
        description: 'Não foi possível validar o tenant (empresa operadora). Refaça o login.',
        variant: 'destructive',
      });
      return;
    }

    if (!representante?.id && !isOwner) {
      toast({
        title: 'Sessão inválida',
        description: 'Não foi possível validar o representante. Refaça o login.',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    let finalClienteId = selectedCliente?.id;

    // 0. Validação completa dos dados do cliente antes de qualquer gravação
    if (!isExistingClientSelected || !finalClienteId) {
      const parsed = clienteFormSchema.safeParse(formData);
      if (!parsed.success) {
        setIsSubmitting(false);
        const fieldErrors: Record<string, string> = {};
        parsed.error.issues.forEach((issue) => {
          const field = String(issue.path[0] || 'form');
          if (!fieldErrors[field]) fieldErrors[field] = issue.message;
        });
        setErrors(fieldErrors);
        setStep(1);
        toast({
          title: 'Dados do cliente inválidos',
          description: 'Corrija os campos destacados antes de salvar.',
          variant: 'destructive',
        });
        return;
      }
    }

    // 0.1 Validação comercial (proposta)
    if (!formData.tituloCampanha.trim() || formData.tituloCampanha.trim().length < 2) {
      setIsSubmitting(false);
      setStep(4);
        toast({ title: 'Título da campanha obrigatório', description: 'Informe o título da campanha na etapa de Mídia.', variant: 'destructive' });
      return;
    }
    if (!formData.quantidadeTelas || formData.quantidadeTelas < 1) {
      setIsSubmitting(false);
      setStep(4);
        toast({ title: 'Quantidade de telas inválida', description: 'Informe ao menos 1 tela/ponto na etapa de Mídia.', variant: 'destructive' });
      return;
    }
    if (!formData.valorMensal || formData.valorMensal <= 0) {
      setIsSubmitting(false);
      setStep(4);
        toast({ title: 'Valor mensal inválido', description: 'Informe o valor mensal da negociação.', variant: 'destructive' });
      return;
    }
    if (formData.dataFim < formData.dataInicio) {
      setIsSubmitting(false);
      setStep(4);
        toast({ title: 'Vigência inválida', description: 'A data final não pode ser anterior à data inicial.', variant: 'destructive' });
      return;
    }

    // 1. Se for cliente novo, cria no PostgreSQL via RPC atômica
    if (!isExistingClientSelected || !finalClienteId) {
      const resCliente = await clienteService.create({
        empresaOperadoraId,
        representanteId: isOwner ? null : (representante?.id ?? null),
        status: formData.status,
        razaoSocial: formData.razaoSocial || formData.nomeFantasia,
        nomeFantasia: formData.nomeFantasia,
        cnpj: normalizarCnpj(formData.cnpj),
        segmento: formData.segmento,
        telefone: formData.telefone.replace(/\D/g, ''),
        whatsapp: formData.whatsapp.replace(/\D/g, ''),
        email: formData.email,
        cep: normalizarCep(formData.cep),
        logradouro: formData.logradouro,
        numero: formData.numero,
        complemento: formData.complemento,
        bairro: formData.bairro,
        cidade: formData.cidade,
        estado: formData.estado.toUpperCase(),
        representanteLegal: formData.representanteLegal,
        cargoRepresentante: formData.cargoRepresentante,
        observacoes: formData.observacoes,
        contatoNome: formData.contatoNome,
        contatoCargo: formData.contatoCargo,
        contatoEmail: formData.contatoEmail,
        contatoTelefone: formData.contatoTelefone.replace(/\D/g, ''),
      });

      if (!resCliente.success || !resCliente.clienteId) {
        setIsSubmitting(false);
        toast({
          title: 'Erro ao cadastrar cliente',
          description: resCliente.error || 'Falha ao salvar cliente no PostgreSQL.',
          variant: 'destructive',
        });
        return;
      }
      finalClienteId = resCliente.clienteId;

      // Auditoria: registro da criação do cliente
      await auditService.log({
        userId: user?.id || '',
        userEmail: user?.email || '',
        userRole: mapPerfilParaCrmRole(perfilNome),
        empresaOperadoraId,
        entidadeTipo: 'cliente',
        entidadeId: resCliente.clienteId,
        acao: 'INSERT',
        statusNovo: formData.status,
        observacoes: `Cliente criado via Novo Cliente (wizard comercial)${isOwner ? ' â€” OWNER sem representante' : ''}`,
        dadosAlterados: {
          nome_fantasia: formData.nomeFantasia,
          razao_social: formData.razaoSocial || formData.nomeFantasia,
          cnpj: normalizarCnpj(formData.cnpj),
          representante_id: representante?.id || null,
        },
      });
    }

    // 1.5 Sincroniza a seleção de PONTOS PARCEIROS (missão §7-§10).
    if (finalClienteId && pontosSelecionados.size > 0) {
      try {
        await prospeccaoService.selecionarPontos(finalClienteId, Array.from(pontosSelecionados));
      } catch (errSync) {
        console.error('[Wizard] Falha ao sincronizar pontos de prospecção:', errSync);
        toast({ title: 'Atenção', description: 'Cliente salvo, mas houve falha ao vincular os pontos selecionados. Vincule-os novamente no detalhe do cliente.', variant: 'destructive' });
      }
    }

    // 1.6 P0 — VÍNCULO AUTOMÁTICO CONTRATO DE ANUNCIANTE (sem proposta obrigatória) — BLOQUEANTE §7
    {
      const { contratoService } = await import('../../services/contrato.service');
      const ctRes = await contratoService.ensureContractForCadastro({ cadastroType: 'ANUNCIANTE', clienteId: finalClienteId!, usuarioResponsavelId: user?.id || '' });
      if (!ctRes.success) {
        setIsSubmitting(false);
        toast({ title: 'Falha ao criar contrato de Anunciante', description: ctRes.error || 'Não foi possível vincular o contrato. Finalização bloqueada (§7).', variant: 'destructive' });
        return;
      }
    }

    // 2. Grava a proposta comercial atrelada ao cliente e ao representante
    const resProp = await propostaService.create({
      empresaOperadoraId,
      clienteId: finalClienteId,
      representanteId: isOwner ? null : (representante?.id ?? null),
      tituloCampanha: formData.tituloCampanha,
      duracaoSegundos: Number(formData.duracaoSegundos),
      quantidadeTelas: Number(formData.quantidadeTelas),
      valorMensal: Number(formData.valorMensal),
      formaPagamento: formData.formaPagamento,
      dataInicio: formData.dataInicio,
      dataFim: formData.dataFim,
      observacoes: formData.observacoesProposta,
    });

    setIsSubmitting(false);

    if (resProp.success) {
      // Auditoria: registro da criação da proposta
      await auditService.log({
        userId: user?.id || '',
        userEmail: user?.email || '',
        userRole: mapPerfilParaCrmRole(perfilNome),
        empresaOperadoraId,
        entidadeTipo: 'cliente',
        entidadeId: finalClienteId,
        acao: 'INSERT',
        statusNovo: 'DRAFT',
        observacoes: `Proposta ${resProp.numeroProposta} criada via Novo Cliente${isOwner ? ' â€” OWNER' : ''}`,
        dadosAlterados: {
          numero_proposta: resProp.numeroProposta,
          titulo: formData.tituloCampanha,
          valor_mensal: formData.valorMensal,
          forma_pagamento: formData.formaPagamento,
        },
      });

      toast({
        title: 'Cliente Cadastrado com Sucesso!',
        description: `Cliente persistido no PostgreSQL e proposta ${resProp.numeroProposta} gerada.`,
      });

      // ============================================================
      // 3. PROVISIONAMENTO AUTOMÁTICO DO ACESSO DO ANUNCIANTE
      // (fecha o ciclo: REPRESENTANTE â†’ CADASTRO â†’ ACESSO CRIADO)
      // Idempotente: EMAIL_JA_CADASTRADO não é erro de fluxo.
      // Falha NÃO desfaz o cadastro â€” orientamos a Central de Acessos.
      // ============================================================
      const emailLogin = (formData.email || '').trim().toLowerCase();
      if (!emailLogin) {
        setProvisionamento({ estado: 'sem_email' });
        return;
      }

      setProvisionando(true);
      try {
        const { data: perfilAnun, error: perfErr } = await supabase
          .from('perfis')
          .select('id')
          .eq('nome', 'ANUNCIANTE')
          .maybeSingle();
        if (perfErr || !perfilAnun?.id) throw new Error('Perfil ANUNCIANTE indisponível.');

        // P0 §5/§6: provisionamento DIRETO com senha inicial backend (não fluxo de aprovação)
        const r = await corporateUsersService.provisionarUsuarioDireto({
          nome: formData.nomeFantasia || formData.razaoSocial || formData.contatoNome || 'Anunciante',
          email: emailLogin,
          telefone: formData.telefone || undefined,
          perfilId: perfilAnun.id,
          clienteId: finalClienteId,
        });

        if (r.success && r.senha_inicial) {
          setProvisionamento({ estado: 'ok', senhaInicial: r.senha_inicial, login: emailLogin });
          setProvisionando(false);
          return; // diálogo de credencial controla o fechamento/navegação
        }
        if (r.error === 'EMAIL_JA_CADASTRADO') {
          setProvisionamento({ estado: 'ja_existe', login: emailLogin });
          setProvisionando(false);
          return;
        }
        // Falha de login é BLOQUEANTE §7 — não finaliza
        setProvisionamento({ estado: 'falhou', detalhe: r.error ?? 'erro desconhecido' });
        setProvisionando(false);
        toast({ title: 'Falha ao criar login do Anunciante', description: r.error || 'Não foi possível criar o acesso. Finalização bloqueada (§7).', variant: 'destructive' });
        return;
      } catch (e: any) {
        console.error('[Wizard] provisionamento do acesso falhou:', e?.message);
        setProvisionamento({ estado: 'falhou', detalhe: e?.message ?? 'erro desconhecido' });
        setProvisionando(false);
        toast({ title: 'Falha ao criar login do Anunciante', description: e?.message || 'Erro inesperado no provisionamento. Finalização bloqueada.', variant: 'destructive' });
        return;
      }
    } else {
      toast({
        title: 'Cliente criado, mas falha na proposta',
        description: resProp.error || 'O cliente foi persistido; revise a proposta diretamente no CRM.',
        variant: 'destructive',
      });
      navigate(`${basePath}/clientes/${finalClienteId}`);
    }
  };

  const numeroFormatado = (v: number) => Number(v || 0).toLocaleString('pt-BR');
  const valorFormatado = (v: number) =>
    Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

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
                Novo Cliente â€” Cadastro Completo
              </h2>
              <p className="text-slate-300 text-xs mt-0.5">
                Cliente, Unidade, Contato e Negociação â†’ Revisão e Salvamento real no PostgreSQL
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className="bg-primary/20 text-primary border-primary/30 px-3 py-1 font-bold text-xs">
              Etapa {step} de 4
            </Badge>
            <Button variant="outline" size="sm" onClick={() => navigate(`${basePath}/clientes/novo`)} className="border-white/10 text-slate-300 hover:text-white text-xs h-8">
              Voltar ao Gate
            </Button>
            <Button variant="ghost" size="sm" onClick={() => navigate(`${basePath}/clientes`)} className="text-slate-400 hover:text-white text-xs h-8">
              Cancelar
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2 pt-2">
          {STEP_LABELS.map((label, idx) => {
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

      {/* STEP 1: CLIENTE + ENDEREÃ‡O */}
      {step === 1 && (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Etapa 1: Cliente + Endereço
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Localize um cliente já cadastrado ou preencha todos os dados cadastrais da empresa, endereço, responsável e status comercial.
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

            {/* Bloco: Empresa */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10">
              <h4 className="text-xs font-bold text-primary uppercase mb-4 flex items-center gap-2">
                <Building2 className="h-4 w-4" /> Empresa
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Nome Fantasia *</Label>
                  <Input
                    name="nomeFantasia"
                    value={formData.nomeFantasia}
                    onChange={handleChange}
                    placeholder="Ex: Farmácia DrogaMais"
                    className={`bg-slate-950/60 border-white/10 text-white rounded-xl h-11 ${errors.nomeFantasia ? 'border-rose-500' : ''}`}
                  />
                  {errors.nomeFantasia && <p className="text-[11px] text-rose-400">{errors.nomeFantasia}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Razão Social *</Label>
                  <Input
                    name="razaoSocial"
                    value={formData.razaoSocial}
                    onChange={handleChange}
                    placeholder="Ex: DrogaMais LTDA"
                    className={`bg-slate-950/60 border-white/10 text-white rounded-xl h-11 ${errors.razaoSocial ? 'border-rose-500' : ''}`}
                  />
                  {errors.razaoSocial && <p className="text-[11px] text-rose-400">{errors.razaoSocial}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">CNPJ / CPF</Label>
                  <Input
                    name="cnpj"
                    value={formData.cnpj}
                    onChange={handleChange}
                    placeholder="Digite o CPF ou CNPJ (opcional)"
                    className={`bg-slate-950/60 border-white/10 text-white rounded-xl h-11 ${errors.cnpj ? 'border-rose-500' : ''}`}
                  />
                  {errors.cnpj && <p className="text-[11px] text-rose-400">{errors.cnpj}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">WhatsApp Comercial *</Label>
                  <Input
                    name="whatsapp"
                    value={formData.whatsapp}
                    onChange={handleChange}
                    placeholder="(11) 99999-8888"
                    className={`bg-slate-950/60 border-white/10 text-white rounded-xl h-11 ${errors.whatsapp ? 'border-rose-500' : ''}`}
                  />
                  {errors.whatsapp && <p className="text-[11px] text-rose-400">{errors.whatsapp}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">E-mail Corporativo *</Label>
                  <Input
                    name="email"
                    type="email"
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="contato@empresa.com"
                    className={`bg-slate-950/60 border-white/10 text-white rounded-xl h-11 ${errors.email ? 'border-rose-500' : ''}`}
                  />
                  {errors.email && <p className="text-[11px] text-rose-400">{errors.email}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Segmento</Label>
                  <Input
                    name="segmento"
                    value={formData.segmento}
                    onChange={handleChange}
                    placeholder="Ex: Varejo Farmacêutico"
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Telefone Fixo</Label>
                  <Input
                    name="telefone"
                    value={formData.telefone}
                    onChange={handleChange}
                    placeholder="(81) 3222-0000"
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
              </div>
            </div>

            {/* Bloco: Endereço */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10">
              <h4 className="text-xs font-bold text-primary uppercase mb-4 flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Endereço
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">CEP</Label>
                  <Input
                    name="cep"
                    value={formData.cep}
                    onChange={handleChange}
                    placeholder="50720-001"
                    className={`bg-slate-950/60 border-white/10 text-white rounded-xl h-11 ${errors.cep ? 'border-rose-500' : ''}`}
                  />
                  {errors.cep && <p className="text-[11px] text-rose-400">{errors.cep}</p>}
                </div>

                <div className="space-y-2 lg:col-span-2">
                  <Label className="text-xs text-slate-200 font-semibold">Logradouro / Rua</Label>
                  <Input
                    name="logradouro"
                    value={formData.logradouro}
                    onChange={handleChange}
                    placeholder="Ex: Av. Paulista"
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Número</Label>
                  <Input
                    name="numero"
                    value={formData.numero}
                    onChange={handleChange}
                    placeholder="Ex: 1000"
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Complemento</Label>
                  <Input
                    name="complemento"
                    value={formData.complemento}
                    onChange={handleChange}
                    placeholder="Ex: Loja 04"
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Bairro</Label>
                  <Input
                    name="bairro"
                    value={formData.bairro}
                    onChange={handleChange}
                    placeholder="Ex: Bela Vista"
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Cidade</Label>
                  <Input
                    name="cidade"
                    value={formData.cidade}
                    onChange={handleChange}
                    placeholder="Ex: São Paulo"
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Estado (UF) *</Label>
                  <Select
                    value={formData.estado}
                    onValueChange={(v) => setFormData((prev) => ({ ...prev, estado: v }))}
                  >
                    <SelectTrigger className={`bg-slate-950/60 border-white/10 text-white rounded-xl h-11 ${errors.estado ? 'border-rose-500' : ''}`}>
                      <SelectValue placeholder="UF" />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-800 border-white/10 max-h-72">
                      {UFS_VALIDAS.map((uf) => (
                        <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errors.estado && <p className="text-[11px] text-rose-400">{errors.estado}</p>}
                </div>
              </div>
            </div>

            {/* Bloco: Responsável */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10">
              <h4 className="text-xs font-bold text-primary uppercase mb-4 flex items-center gap-2">
                <User className="h-4 w-4" /> Responsável
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Representante Legal</Label>
                  <Input
                    name="representanteLegal"
                    value={formData.representanteLegal}
                    onChange={handleChange}
                    placeholder="Ex: João da Silva"
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Cargo do Representante</Label>
                  <Input
                    name="cargoRepresentante"
                    value={formData.cargoRepresentante}
                    onChange={handleChange}
                    placeholder="Ex: Sócio-Administrador"
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
              </div>
            </div>

            {/* Bloco: Comercial */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10">
              <h4 className="text-xs font-bold text-primary uppercase mb-4 flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Comercial
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(val) => setFormData((prev) => ({ ...prev, status: val as StatusCliente }))}
                  >
                    <SelectTrigger className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-slate-900 border-white/10 text-white">
                      {Object.values(StatusCliente).map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs text-slate-200 font-semibold">Observações</Label>
                  <Input
                    name="observacoes"
                    value={formData.observacoes}
                    onChange={handleChange}
                    placeholder="Anotações cadastrais do cliente"
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-white/10">
              <Button onClick={() => { if (validateStep1()) setStep(2); }} className="gradient-primary glow-primary font-bold rounded-xl px-6 gap-2">
                <span>Proximo: Unidade & Contato</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: UNIDADE + CONTATO */}
      {step === 2 && (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              Etapa 2: Unidade & Contato
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Estabelecimento do cliente (persistido em empresas) e responsável direto pelas aprovações, contrato e cobranças.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold text-primary uppercase flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Unidade / Estabelecimento
                </h4>
                <Button size="sm" variant="ghost" onClick={() => setStep(1)} className="text-xs text-primary">
                  Alterar dados na Etapa 1
                </Button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-400 font-semibold">Nome da Unidade</Label>
                  <p className="text-sm font-bold text-white">{formData.nomeFantasia || 'â€”'}</p>
                </div>
                <div className="space-y-1 lg:col-span-2">
                  <Label className="text-[11px] text-slate-400 font-semibold">Endereço do Estabelecimento</Label>
                  <p className="text-sm text-slate-200">
                    {[formData.logradouro, formData.numero, formData.complemento, formData.bairro].filter(Boolean).join(', ') || 'â€”'}
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-400 font-semibold">CEP</Label>
                  <p className="text-sm text-slate-200">{formData.cep || 'â€”'}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-400 font-semibold">Cidade / UF</Label>
                  <p className="text-sm text-slate-200">{formData.cidade || 'â€”'}{formData.estado ? `/${formData.estado}` : ''}</p>
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px] text-slate-400 font-semibold">CNPJ</Label>
                  <p className="text-sm text-slate-200">{formData.cnpj || 'â€”'}</p>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10">
              <h4 className="text-xs font-bold text-primary uppercase mb-4 flex items-center gap-2">
                <User className="h-4 w-4" /> Contato Principal
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Nome do Contato</Label>
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
                    type="email"
                    value={formData.contatoEmail}
                    onChange={handleChange}
                    placeholder="carlos@empresa.com"
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Telefone / WhatsApp</Label>
                  <Input
                    name="contatoTelefone"
                    value={formData.contatoTelefone}
                    onChange={handleChange}
                    placeholder="(11) 98888-7777"
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-6 border-t border-white/10">
              <Button variant="outline" onClick={() => setStep(1)} className="border-slate-700 text-slate-300 rounded-xl gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button onClick={() => setStep(3)} className="gradient-primary glow-primary font-bold rounded-xl px-6 gap-2">
                <span>Proximo: Pontos Parceiros</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: MÍDIA & NEGOCIAÃ‡ÃO */}
      
      {/* STEP 3: PONTOS PARCEIROS (missao Â§7-Â§10) */}
      {step === 3 && (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <MapPin className="h-5 w-5 text-emerald-400" />
              Etapa 3: Pontos Parceiros
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Em quantos estabelecimentos o cliente deseja divulgar sua marca? Selecione os pontos
              parceiros disponiveis (validacao final no servidor).
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-5 space-y-4">
            <SelecaoPontosParceiros value={pontosSelecionados} onChange={setPontosSelecionados} />
            {selectedCliente?.id && (
              <p className="text-[11px] text-amber-400/90">
                Cliente existente selecionado: a selecao substituira a lista de prospeccao atual deste cliente.
              </p>
            )}
          </CardContent>
          <div className="px-6 pb-5 flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep(2)} className="border-slate-700 text-slate-300 rounded-xl gap-2">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <Button onClick={() => setStep(4)} className="gradient-primary glow-primary font-bold rounded-xl px-6 gap-2">
              <span>Proximo: Midia & Negociacao</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <Tv className="h-5 w-5 text-primary" />
              Etapa 4: Mídia & Negociação
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Defina a campanha, telas/pontos, vigência e as condições comerciais da proposta.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10">
              <h4 className="text-xs font-bold text-primary uppercase mb-4 flex items-center gap-2">
                <Tv className="h-4 w-4" /> Mídia / Campanha
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label className="text-xs text-slate-200 font-semibold">Título da Campanha *</Label>
                  <Input
                    name="tituloCampanha"
                    value={formData.tituloCampanha}
                    onChange={handleChange}
                    placeholder="Ex: Campanha de Lançamento 2026"
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Qtd. Telas / Pontos *</Label>
                  <Input
                    name="quantidadeTelas"
                    type="number"
                    min={1}
                    value={formData.quantidadeTelas}
                    onChange={handleNumberChange}
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Duração da Mídia (Segundos)</Label>
                  <Input
                    name="duracaoSegundos"
                    type="number"
                    min={0}
                    value={formData.duracaoSegundos}
                    onChange={handleNumberChange}
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Data Início</Label>
                  <Input
                    name="dataInicio"
                    type="date"
                    value={formData.dataInicio}
                    onChange={handleChange}
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Data Fim</Label>
                  <Input
                    name="dataFim"
                    type="date"
                    value={formData.dataFim}
                    onChange={handleChange}
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10">
              <h4 className="text-xs font-bold text-primary uppercase mb-4 flex items-center gap-2">
                <DollarSign className="h-4 w-4" /> Negociação / Condições Comerciais
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Valor Mensal (R$) *</Label>
                  <Input
                    name="valorMensal"
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.valorMensal}
                    onChange={handleNumberChange}
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-slate-200 font-semibold">Forma de Pagamento</Label>
                  <Select
                    value={formData.formaPagamento}
                    onValueChange={(val) => setFormData((p) => ({ ...p, formaPagamento: val as FormaPagamento }))}
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
                <div className="space-y-2 sm:col-span-2 lg:col-span-3">
                  <Label className="text-xs text-slate-200 font-semibold">Observações da Proposta</Label>
                  <Input
                    name="observacoesProposta"
                    value={formData.observacoesProposta}
                    onChange={handleChange}
                    placeholder="Condições adicionais, escopo de veiculação, etc."
                    className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between pt-6 border-t border-white/10">
              <Button variant="outline" onClick={() => setStep(2)} className="border-slate-700 text-slate-300 rounded-xl gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button onClick={() => setStep(5)} className="gradient-primary glow-primary font-bold rounded-xl px-6 gap-2">
                <span>Proximo: Revisao & Salvamento</span>
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 4: REVISÃO + SALVAMENTO */}
      {step === 5 && (
        <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl">
          <CardHeader className="border-b border-white/10">
            <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="h-5 w-5 text-emerald-400" />
              Etapa 5: Revisão e Salvamento
            </CardTitle>
            <CardDescription className="text-slate-300 text-xs">
              Revise exatamente o que será gravado no PostgreSQL. Nenhum campo é descartado entre as etapas.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-1.5">
                <h4 className="text-xs font-bold text-primary uppercase mb-2">Cliente</h4>
                <p className="text-sm font-bold text-white">{formData.nomeFantasia || 'â€”'}</p>
                <p className="text-xs text-slate-300">Razao Social: {formData.razaoSocial || 'â€”'}</p>
                <p className="text-xs text-slate-300">CNPJ: {formData.cnpj || 'â€”'}</p>
                <p className="text-xs text-slate-400">Segmento: {formData.segmento || 'â€”'}</p>
                <p className="text-xs text-slate-400">Status: {formData.status}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1"><Phone className="h-3 w-3" /> {formData.telefone || 'â€”'}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1"><Phone className="h-3 w-3" /> {formData.whatsapp || 'â€”'}</p>
                <p className="text-xs text-slate-400 flex items-center gap-1 break-all"><Mail className="h-3 w-3" /> {formData.email || 'â€”'}</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-1.5">
                <h4 className="text-xs font-bold text-primary uppercase mb-2">Endereço</h4>
                <p className="text-xs text-slate-300">
                  {[formData.logradouro, formData.numero, formData.complemento, formData.bairro].filter(Boolean).join(', ') || 'â€”'}
                </p>
                <p className="text-xs text-slate-300">CEP: {formData.cep || 'â€”'}</p>
                <p className="text-xs text-slate-300">{formData.cidade || 'â€”'}{formData.estado ? `/${formData.estado}` : ''}</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-1.5">
                <h4 className="text-xs font-bold text-primary uppercase mb-2">Responsável</h4>
                <p className="text-xs text-slate-300">Representante Legal: {formData.representanteLegal || 'â€”'}</p>
                <p className="text-xs text-slate-300">Cargo: {formData.cargoRepresentante || 'â€”'}</p>
                {formData.observacoes && <p className="text-xs text-slate-400 whitespace-pre-wrap">Obs: {formData.observacoes}</p>}
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-1.5">
                <h4 className="text-xs font-bold text-primary uppercase mb-2">Unidade</h4>
                <p className="text-sm font-bold text-white">{formData.nomeFantasia || 'â€”'}</p>
                <p className="text-xs text-slate-300">
                  {[formData.logradouro, formData.numero, formData.complemento, formData.bairro].filter(Boolean).join(', ') || 'â€”'}
                </p>
                <p className="text-xs text-slate-300">CEP: {formData.cep || 'â€”'}</p>
                <p className="text-xs text-slate-300">{formData.cidade || 'â€”'}{formData.estado ? `/${formData.estado}` : ''}</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-1.5">
                <h4 className="text-xs font-bold text-primary uppercase mb-2">Contato</h4>
                <p className="text-xs text-slate-300">Nome: {formData.contatoNome || 'â€”'}</p>
                <p className="text-xs text-slate-300">Cargo: {formData.contatoCargo || 'â€”'}</p>
                <p className="text-xs text-slate-300">E-mail: {formData.contatoEmail || 'â€”'}</p>
                <p className="text-xs text-slate-300">Telefone: {formData.contatoTelefone || 'â€”'}</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-1.5">
                <h4 className="text-xs font-bold text-emerald-400 uppercase mb-2">Mídia</h4>
                <p className="text-sm font-bold text-white">{formData.tituloCampanha || 'â€”'}</p>
                <p className="text-xs text-slate-300">Telas / Pontos: {numeroFormatado(formData.quantidadeTelas)} unidades</p>
                <p className="text-xs text-slate-300">Duração: {formData.duracaoSegundos ? `${formData.duracaoSegundos}s` : 'â€”'}</p>
                <p className="text-xs text-slate-300">Vigência: {formData.dataInicio} â†’ {formData.dataFim}</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 space-y-1.5">
                <h4 className="text-xs font-bold text-emerald-400 uppercase mb-2">Negociação</h4>
                <p className="text-sm font-bold text-white">{valorFormatado(formData.valorMensal)}</p>
                <p className="text-xs text-slate-300">Forma de Pagamento: {formData.formaPagamento}</p>
                {formData.observacoesProposta && <p className="text-xs text-slate-400 whitespace-pre-wrap">Obs: {formData.observacoesProposta}</p>}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-slate-950/80 border border-white/10 flex gap-3 items-start">
              <Info className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400">
                {isOwner
                  ? ' Este cadastro será salvo como OWNER (representante_id NULL, conforme regra de autonomia administrativa).'
                  : ` Este cadastro será vinculado ao representante autenticado (${representante?.id || 'â€”'}).`}
              </p>
            </div>

            <div className="flex justify-between pt-6 border-t border-white/10">
              <Button variant="outline" onClick={() => setStep(4)} className="border-slate-700 text-slate-300 rounded-xl gap-2">
                <ArrowLeft className="h-4 w-4" /> Voltar
              </Button>
              <Button
                onClick={handleFinishWizard}
                disabled={isSubmitting}
                className="gradient-primary glow-primary font-bold rounded-xl px-8 h-12 shadow-xl hover:scale-105 transition-all gap-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Gravando no PostgreSQL...</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-5 w-5" />
                    <span>{isExistingClientSelected ? 'Salvar Proposta do Cliente' : 'Cadastrar Cliente & Salvar Proposta'}</span>
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================
          CREDENCIAL INICIAL â€” acesso provisionado automaticamente.
          Exibida UMA única vez ao representante para entrega ao cliente.
          ============================================================ */}
      {provisionamento && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-modal
          data-testid="dialog-credencial-anunciante"
        >
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-6 text-slate-100 shadow-2xl space-y-4">
            {provisionamento.estado === 'ok' && (
              <>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-emerald-400" />
                  <h3 className="text-lg font-bold">Acesso do anunciante criado!</h3>
                </div>
                <p className="text-sm text-slate-400">
                  O login do cliente foi provisionado automaticamente. A Central de Comunicação
                  já registrou a mensagem de boas-vindas para o anunciante.
                </p>
                <div className="rounded-xl border border-white/10 bg-slate-950/70 p-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3">
                    <span className="text-slate-500">Login (e-mail)</span>
                    <span className="font-mono select-all">{provisionamento.login}</span>
                  </div>
                  <div className="flex justify-between gap-3 items-center">
                    <span className="text-slate-500">Senha inicial</span>
                    <code
                      data-testid="senha-inicial-valor"
                      className="font-mono tracking-wider select-all bg-white/5 px-2 py-1 rounded"
                    >
                      {provisionamento.senhaInicial}
                    </code>
                  </div>
                </div>
                <ul className="text-xs text-slate-500 list-disc pl-4 space-y-1">
                  <li>Entregue estas credenciais ao cliente por canal confiável.</li>
                  <li>No primeiro login ele será obrigado a definir uma nova senha.</li>
                  <li>Esta senha não será exibida novamente pelo sistema.</li>
                </ul>
                <Button
                  className="w-full"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        `Login: ${provisionamento.login}\nSenha inicial: ${provisionamento.senhaInicial}`,
                      );
                      toast({ title: 'Credenciais copiadas.' });
                    } catch {
                      toast({ title: 'Não foi possível copiar.', variant: 'destructive' });
                    }
                  }}
                  variant="outline"
                >
                  Copiar credenciais
                </Button>
              </>
            )}

            {provisionamento.estado === 'ja_existe' && (
              <>
                <div className="flex items-center gap-2">
                  <Info className="h-6 w-6 text-sky-400" />
                  <h3 className="text-lg font-bold">Acesso já existente</h3>
                </div>
                <p className="text-sm text-slate-400">
                  Já existe um acesso para o e-mail{' '}
                  <span className="font-mono">{provisionamento.login}</span>. Nenhum usuário duplicado
                  foi criado. Se o cliente perdeu a senha, utilize â€œEsqueci minha senhaâ€ na tela de login.
                </p>
              </>
            )}

            {provisionamento.estado === 'sem_email' && (
              <>
                <div className="flex items-center gap-2">
                  <Info className="h-6 w-6 text-amber-400" />
                  <h3 className="text-lg font-bold">Cadastro sem e-mail de acesso</h3>
                </div>
                <p className="text-sm text-slate-400">
                  O cadastro foi concluído, mas sem e-mail informado não é possível criar o login
                  automaticamente. Use a Central de Acessos quando tiver o e-mail do cliente.
                </p>
              </>
            )}

            {provisionamento.estado === 'falhou' && (
              <>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-6 w-6 text-rose-400" />
                  <h3 className="text-lg font-bold">Acesso não provisionado</h3>
                </div>
                <p className="text-sm text-slate-400">
                  O cadastro e a proposta foram salvos com sucesso, porém a criação automática do
                  acesso falhou. Detalhe técnico: {provisionamento.detalhe}
                </p>
                <p className="text-xs text-slate-500">
                  Requisição registrada para auditoria. Você pode repetir o provisionamento pela
                  Central de Acessos (operação é segura contra duplicidade).
                </p>
              </>
            )}

            <Button
              className="w-full mt-2"
              data-testid="btn-concluir-pos-provisionamento"
              disabled={provisionando}
              onClick={() => navigate(`${basePath}/clientes`)}
            >
              Concluir
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}