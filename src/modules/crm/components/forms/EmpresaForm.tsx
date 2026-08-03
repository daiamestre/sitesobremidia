import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Building2, Save, ArrowRight, X, Phone, Mail, MapPin, User, FileText } from 'lucide-react';

interface EmpresaFormProps {
  onNext?: () => void;
}

import { useAuth } from '@/contexts/AuthContext';
import { clienteService } from '../../services/cliente.service';
import { Loader2 } from 'lucide-react';

export function EmpresaForm({ onNext }: EmpresaFormProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { empresaOperadoraId, representante } = useAuth();
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    nomeFantasia: '',
    razaoSocial: '',
    cnpj: '',
    segmento: '',
    telefone: '',
    whatsapp: '',
    email: '',
    cep: '',
    endereco: '',
    numero: '',
    complemento: '',
    bairro: '',
    cidade: '',
    estado: '',
    representanteLegal: '',
    cargo: '',
    observacoes: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSaveDraft = () => {
    toast({
      title: 'Rascunho Salvo!',
      description: 'Os dados da empresa foram salvos localmente.',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empresaOperadoraId || !representante?.id) {
      toast({
        title: 'Sessão inválida',
        description: 'Não foi possível identificar o representante logado.',
        variant: 'destructive',
      });
      return;
    }

    setIsSaving(true);
    const result = await clienteService.create({
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
      logradouro: formData.endereco,
      numero: formData.numero,
      complemento: formData.complemento,
      bairro: formData.bairro,
      cidade: formData.cidade || 'São Paulo',
      estado: formData.estado || 'SP',
      representanteLegal: formData.representanteLegal,
      cargoRepresentante: formData.cargo,
      observacoes: formData.observacoes,
      contatoNome: formData.representanteLegal || formData.nomeFantasia,
      contatoCargo: formData.cargo || 'Responsável',
      contatoEmail: formData.email,
      contatoTelefone: formData.whatsapp,
    });
    setIsSaving(false);

    if (result.success) {
      toast({
        title: 'Cliente Cadastrado com Sucesso!',
        description: 'Os dados foram gravados no banco relacional.',
      });
      if (onNext) onNext();
    } else {
      toast({
        title: 'Erro no Cadastro',
        description: result.error || 'Falha ao gravar cliente.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Card className="w-full border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-2xl rounded-2xl animate-fade-in">
      <CardHeader className="border-b border-white/10 pb-5">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-primary/15 text-primary border border-primary/20">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <CardTitle className="text-xl sm:text-2xl font-display font-extrabold text-white">
              Dados da Empresa
            </CardTitle>
            <CardDescription className="text-slate-300 text-sm mt-0.5">
              Passo 1 de 8: Preencha as informações cadastrais e fiscais do cliente.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 space-y-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Seção 1: Identificação Comercial */}
          <div className="space-y-4">
            <h4 className="text-sm font-bold text-primary tracking-wide uppercase flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Identificação Empresarial
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nomeFantasia" className="text-slate-200 text-xs font-semibold">
                  Nome Fantasia *
                </Label>
                <Input
                  id="nomeFantasia"
                  name="nomeFantasia"
                  placeholder="Ex: Rede DrogaMais"
                  value={formData.nomeFantasia}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="razaoSocial" className="text-slate-200 text-xs font-semibold">
                  Razão Social *
                </Label>
                <Input
                  id="razaoSocial"
                  name="razaoSocial"
                  placeholder="Ex: DrogaMais Medicamentos LTDA"
                  value={formData.razaoSocial}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cnpj" className="text-slate-200 text-xs font-semibold">
                  CNPJ *
                </Label>
                <Input
                  id="cnpj"
                  name="cnpj"
                  placeholder="00.000.000/0001-00"
                  value={formData.cnpj}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="segmento" className="text-slate-200 text-xs font-semibold">
                  Segmento de Atuação
                </Label>
                <Input
                  id="segmento"
                  name="segmento"
                  placeholder="Ex: Farmácia / Saúde"
                  value={formData.segmento}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefone" className="text-slate-200 text-xs font-semibold">
                  Telefone Fixo
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="telefone"
                    name="telefone"
                    placeholder="(11) 3333-4444"
                    value={formData.telefone}
                    onChange={handleChange}
                    className="pl-10 bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsapp" className="text-slate-200 text-xs font-semibold">
                  WhatsApp *
                </Label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-400" />
                  <Input
                    id="whatsapp"
                    name="whatsapp"
                    placeholder="(11) 99999-8888"
                    value={formData.whatsapp}
                    onChange={handleChange}
                    className="pl-10 bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2 lg:col-span-3">
                <Label htmlFor="email" className="text-slate-200 text-xs font-semibold">
                  E-mail Corporativo *
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    placeholder="contato@empresa.com.br"
                    value={formData.email}
                    onChange={handleChange}
                    className="pl-10 bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Seção 2: Endereço */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <h4 className="text-sm font-bold text-primary tracking-wide uppercase flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              Endereço Comercial
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cep" className="text-slate-200 text-xs font-semibold">
                  CEP
                </Label>
                <Input
                  id="cep"
                  name="cep"
                  placeholder="00000-000"
                  value={formData.cep}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2 lg:col-span-2">
                <Label htmlFor="endereco" className="text-slate-200 text-xs font-semibold">
                  Endereço / Logradouro
                </Label>
                <Input
                  id="endereco"
                  name="endereco"
                  placeholder="Av. Paulista"
                  value={formData.endereco}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="numero" className="text-slate-200 text-xs font-semibold">
                  Número
                </Label>
                <Input
                  id="numero"
                  name="numero"
                  placeholder="1000"
                  value={formData.numero}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="complemento" className="text-slate-200 text-xs font-semibold">
                  Complemento
                </Label>
                <Input
                  id="complemento"
                  name="complemento"
                  placeholder="Sala 402"
                  value={formData.complemento}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bairro" className="text-slate-200 text-xs font-semibold">
                  Bairro
                </Label>
                <Input
                  id="bairro"
                  name="bairro"
                  placeholder="Bela Vista"
                  value={formData.bairro}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cidade" className="text-slate-200 text-xs font-semibold">
                  Cidade
                </Label>
                <Input
                  id="cidade"
                  name="cidade"
                  placeholder="São Paulo"
                  value={formData.cidade}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="estado" className="text-slate-200 text-xs font-semibold">
                  Estado (UF)
                </Label>
                <Input
                  id="estado"
                  name="estado"
                  placeholder="SP"
                  value={formData.estado}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>
            </div>
          </div>

          {/* Seção 3: Representante Legal & Observações */}
          <div className="space-y-4 pt-4 border-t border-white/10">
            <h4 className="text-sm font-bold text-primary tracking-wide uppercase flex items-center gap-2">
              <User className="h-4 w-4" />
              Representante Legal & Observações
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="representanteLegal" className="text-slate-200 text-xs font-semibold">
                  Representante Legal
                </Label>
                <Input
                  id="representanteLegal"
                  name="representanteLegal"
                  placeholder="Nome do Sócio ou Diretor"
                  value={formData.representanteLegal}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="cargo" className="text-slate-200 text-xs font-semibold">
                  Cargo
                </Label>
                <Input
                  id="cargo"
                  name="cargo"
                  placeholder="Diretor Comercial / Proprietário"
                  value={formData.cargo}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl h-11"
                />
              </div>

              <div className="space-y-2 sm:col-span-2">
                <Label htmlFor="observacoes" className="text-slate-200 text-xs font-semibold">
                  Observações Gerais
                </Label>
                <Textarea
                  id="observacoes"
                  name="observacoes"
                  rows={3}
                  placeholder="Anotações comerciais, horário de atendimento ou particularidades..."
                  value={formData.observacoes}
                  onChange={handleChange}
                  className="bg-slate-950/60 border-white/10 text-white rounded-xl resize-none"
                />
              </div>
            </div>
          </div>

          {/* BOTÕES INFERIORES */}
          <div className="pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate('/representantes/dashboard')}
              className="w-full sm:w-auto border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl h-11 px-5 gap-2"
            >
              <X className="h-4 w-4" />
              Cancelar
            </Button>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                className="w-full sm:w-auto border-primary/40 text-primary hover:bg-primary/10 rounded-xl h-11 px-5 gap-2 font-semibold"
              >
                <Save className="h-4 w-4" />
                Salvar Rascunho
              </Button>

              <Button
                type="submit"
                disabled={isSaving}
                className="w-full sm:w-auto gradient-primary glow-primary font-bold text-base rounded-xl h-11 px-8 gap-2 shadow-xl hover:scale-105 transition-all"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Salvando no banco...</span>
                  </>
                ) : (
                  <>
                    <span>Continuar</span>
                    <ArrowRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
