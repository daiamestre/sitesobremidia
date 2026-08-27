import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { clienteService, ClienteCompleto, ClientePayload } from '../services/cliente.service';
import { clienteFormSchema } from '../validators/cliente.validator';
import { StatusCliente } from '../types/enums';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, Building2, Loader2, Save, User } from 'lucide-react';

export default function EditarClientePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { empresaOperadoraId, representante, isOwner } = useAuth();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cliente, setCliente] = useState<ClienteCompleto | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
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
    observacoes: '',
    contatoNome: '',
    contatoCargo: '',
    contatoEmail: '',
    contatoTelefone: '',
    status: 'PROSPECT' as StatusCliente,
  });

  useEffect(() => {
    const load = async () => {
      if (!id) return;
      setLoading(true);
      const data = await clienteService.findById(id);
      setLoading(false);

      if (!data) {
        toast({
          title: 'Cliente não encontrado',
          description: 'O registro não existe ou você não tem permissão para visualizá-lo.',
          variant: 'destructive',
        });
        navigate('/representantes/clientes');
        return;
      }

      setCliente(data);
      const emp = data.empresas?.[0];
      const ct = emp?.contatos?.find((c) => c.is_principal) ?? emp?.contatos?.[0];
      setForm({
        nomeFantasia: emp?.nome_fantasia || '',
        razaoSocial: emp?.razao_social || '',
        cnpj: emp?.cnpj || '',
        segmento: emp?.segmento || '',
        telefone: emp?.telefone || '',
        whatsapp: emp?.whatsapp || '',
        email: emp?.email || '',
        cep: (emp?.cep || '').replace(/\D/g, ''),
        logradouro: emp?.logradouro || '',
        numero: emp?.numero || '',
        complemento: emp?.complemento || '',
        bairro: emp?.bairro || '',
        cidade: emp?.cidade || '',
        estado: emp?.estado || '',
        representanteLegal: emp?.representante_legal || '',
        cargoRepresentante: emp?.cargo_representante || '',
        observacoes: emp?.observacoes || '',
        contatoNome: ct?.nome || emp?.representante_legal || '',
        contatoCargo: ct?.cargo || '',
        contatoEmail: ct?.email || emp?.email || '',
        contatoTelefone: ct?.telefone || emp?.whatsapp || '',
        status: (data.status as StatusCliente) || StatusCliente.PROSPECT,
      });
    };
    load();
  }, [id, navigate, toast]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    const parsed = clienteFormSchema.safeParse(form);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.issues.forEach((issue) => {
        const field = String(issue.path[0] || 'form');
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      });
      setErrors(fieldErrors);
      toast({
        title: 'Corrija os campos destacados',
        description: 'Há campos obrigatórios ou inválidos no formulário.',
        variant: 'destructive',
      });
      return;
    }
    setErrors({});

    if (!id || !empresaOperadoraId || (!representante?.id && !isOwner)) {
      toast({
        title: 'Sessão inválida',
        description: 'Não foi possível validar o representante. Refaça o login.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    const payload: ClientePayload = {
      empresaOperadoraId,
      representanteId: representante?.id ?? null,
      status: form.status,
      ...parsed.data,
      razaoSocial: form.razaoSocial || parsed.data.razaoSocial || '',
      nomeFantasia: form.nomeFantasia || parsed.data.nomeFantasia || '',
      whatsapp: form.whatsapp || parsed.data.whatsapp || '',
      email: form.email || parsed.data.email || '',
      cidade: form.cidade || parsed.data.cidade || '',
      estado: form.estado || parsed.data.estado || '',
    };
    const result = await clienteService.update(id, payload);
    setSaving(false);

    if (result.success) {
      toast({
        title: 'Cliente Atualizado!',
        description: 'Os dados foram persistidos no PostgreSQL com sucesso.',
      });
      navigate(`/representantes/clientes/${cliente?.codigo_cliente ?? id}`);
    } else {
      toast({
        title: 'Erro ao salvar',
        description: result.error || 'Falha ao atualizar o cliente.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 rounded-2xl border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl sm:text-3xl font-display font-extrabold text-white">
              Editar Cliente
            </h2>
            {cliente && (
              <span className="text-xs font-mono text-primary bg-primary/15 border border-primary/30 rounded-lg px-2 py-1">
                #{cliente.codigo_cliente}
              </span>
            )}
          </div>
          <p className="text-slate-300 text-sm">
            Atualize os dados da empresa e do contato principal. As alterações são persistidas no Supabase PostgreSQL.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => navigate(`/representantes/clientes/${cliente?.codigo_cliente ?? id}`)}
          className="border-white/10 text-slate-300 hover:text-white rounded-xl gap-2"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
      </div>

      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="border-b border-white/10">
          <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" /> Dados da Empresa
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Campos obrigatórios marcados com *
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Nome Fantasia *</Label>
              <Input
                name="nomeFantasia"
                value={form.nomeFantasia}
                onChange={handleChange}
                className={`bg-slate-950/60 border-white/10 text-white rounded-xl h-11 ${errors.nomeFantasia ? 'border-rose-500' : ''}`}
              />
              {errors.nomeFantasia && <p className="text-[11px] text-rose-400">{errors.nomeFantasia}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Razão Social *</Label>
              <Input
                name="razaoSocial"
                value={form.razaoSocial}
                onChange={handleChange}
                className={`bg-slate-950/60 border-white/10 text-white rounded-xl h-11 ${errors.razaoSocial ? 'border-rose-500' : ''}`}
              />
              {errors.razaoSocial && <p className="text-[11px] text-rose-400">{errors.razaoSocial}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">CNPJ / CPF</Label>
              <Input
                name="cnpj"
                value={form.cnpj}
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
                value={form.whatsapp}
                onChange={handleChange}
                className={`bg-slate-950/60 border-white/10 text-white rounded-xl h-11 ${errors.whatsapp ? 'border-rose-500' : ''}`}
              />
              {errors.whatsapp && <p className="text-[11px] text-rose-400">{errors.whatsapp}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">E-mail Corporativo *</Label>
              <Input
                name="email"
                type="email"
                value={form.email}
                onChange={handleChange}
                className={`bg-slate-950/60 border-white/10 text-white rounded-xl h-11 ${errors.email ? 'border-rose-500' : ''}`}
              />
              {errors.email && <p className="text-[11px] text-rose-400">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Segmento</Label>
              <Input
                name="segmento"
                value={form.segmento}
                onChange={handleChange}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Telefone Fixo</Label>
              <Input
                name="telefone"
                value={form.telefone}
                onChange={handleChange}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">CEP</Label>
              <Input
                name="cep"
                value={form.cep}
                onChange={handleChange}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Logradouro</Label>
              <Input
                name="logradouro"
                value={form.logradouro}
                onChange={handleChange}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Número</Label>
              <Input
                name="numero"
                value={form.numero}
                onChange={handleChange}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Complemento</Label>
              <Input
                name="complemento"
                value={form.complemento}
                onChange={handleChange}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Bairro</Label>
              <Input
                name="bairro"
                value={form.bairro}
                onChange={handleChange}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Cidade</Label>
              <Input
                name="cidade"
                value={form.cidade}
                onChange={handleChange}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Estado (UF)</Label>
              <Input
                name="estado"
                value={form.estado}
                onChange={handleChange}
                maxLength={2}
                className={`bg-slate-950/60 border-white/10 text-white rounded-xl h-11 uppercase ${errors.estado ? 'border-rose-500' : ''}`}
              />
              {errors.estado && <p className="text-[11px] text-rose-400">{errors.estado}</p>}
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Representante Legal</Label>
              <Input
                name="representanteLegal"
                value={form.representanteLegal}
                onChange={handleChange}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Cargo do Representante</Label>
              <Input
                name="cargoRepresentante"
                value={form.cargoRepresentante}
                onChange={handleChange}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Status</Label>
              <Select value={form.status} onValueChange={(val) => setForm((p) => ({ ...p, status: val as StatusCliente }))}>
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
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-slate-200 font-semibold">Observações</Label>
            <Input
              name="observacoes"
              value={form.observacoes}
              onChange={handleChange}
              className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border border-white/10 bg-slate-900/70 backdrop-blur-xl shadow-xl rounded-2xl">
        <CardHeader className="border-b border-white/10">
          <CardTitle className="text-xl font-bold text-white flex items-center gap-2">
            <User className="h-5 w-5 text-primary" /> Contato Principal
          </CardTitle>
          <CardDescription className="text-slate-400 text-xs">
            Responsável direto pelas aprovações, contrato e cobranças
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Nome do Contato</Label>
              <Input
                name="contatoNome"
                value={form.contatoNome}
                onChange={handleChange}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Cargo / Função</Label>
              <Input
                name="contatoCargo"
                value={form.contatoCargo}
                onChange={handleChange}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">E-mail do Contato</Label>
              <Input
                name="contatoEmail"
                type="email"
                value={form.contatoEmail}
                onChange={handleChange}
                className={`bg-slate-950/60 border-white/10 text-white rounded-xl h-11 ${errors.contatoEmail ? 'border-rose-500' : ''}`}
              />
              {errors.contatoEmail && <p className="text-[11px] text-rose-400">{errors.contatoEmail}</p>}
            </div>
            <div className="space-y-2">
              <Label className="text-xs text-slate-200 font-semibold">Telefone / WhatsApp</Label>
              <Input
                name="contatoTelefone"
                value={form.contatoTelefone}
                onChange={handleChange}
                className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button
          variant="outline"
          onClick={() => navigate(`/representantes/clientes/${cliente?.codigo_cliente ?? id}`)}
          className="border-slate-700 text-slate-300 rounded-xl"
        >
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving}
          className="gradient-primary glow-primary font-bold rounded-xl px-8 h-11 shadow-xl hover:scale-105 transition-all gap-2"
        >
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Salvando no PostgreSQL...
            </>
          ) : (
            <>
              <Save className="h-4 w-4" /> Salvar Alterações
            </>
          )}
        </Button>
      </div>
    </div>
  );
}