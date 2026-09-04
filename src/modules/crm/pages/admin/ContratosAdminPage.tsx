import React, { useState, useEffect, useCallback } from 'react';
import {
  contratoModelosAdminService,
  ContratoTemplateAdminRecord,
} from '@/modules/crm/services/contratoModelosAdmin.service';
import { TipoContrato } from '@/modules/crm/services/contractResolver.service';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  FileText, Plus, CheckCircle2, Clock, Shield, Star,
  Eye, RefreshCw, Loader2, Edit3, Power, AlertCircle, Copy
} from 'lucide-react';

export function sanitizeHtmlForPreview(rawHtml: string): string {
  if (!rawHtml) return '';
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*(["']).*?\1/gi, '')
    .replace(/on\w+\s*=\s*[^ >]+/gi, '')
    .replace(/javascript\s*:/gi, 'disabled:')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
}

export function ContratosAdminPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [tipoAtivo, setTipoAtivo] = useState<TipoContrato>('ANUNCIANTE');
  const [modelos, setModelos] = useState<ContratoTemplateAdminRecord[]>([]);

  // Modais State
  const [previewTemplate, setPreviewTemplate] = useState<ContratoTemplateAdminRecord | null>(null);
  const [novaVersaoTemplate, setNovaVersaoTemplate] = useState<ContratoTemplateAdminRecord | null>(null);
  const [novoModeloOpen, setNovoModeloOpen] = useState(false);

  // Form State para Nova Versão / Novo Modelo
  const [formNome, setFormNome] = useState('');
  const [formCodigo, setFormCodigo] = useState('');
  const [formConteudo, setFormConteudo] = useState('');
  const [formDescricao, setFormDescricao] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const carregarModelos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await contratoModelosAdminService.fetchModelos(tipoAtivo);
      setModelos(data);
    } catch (err) {
      toast({
        title: 'Erro ao carregar modelos',
        description: 'Não foi possível carregar os modelos de contrato.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [tipoAtivo, toast]);

  useEffect(() => {
    carregarModelos();
  }, [carregarModelos]);

  const handleDefinirPadrao = async (id: string) => {
    try {
      const res = await contratoModelosAdminService.definirComoPadrao(id);
      if (!res.success) {
        toast({ title: 'Falha ao definir padrão', description: res.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Modelo Padrão Definido!', description: 'O modelo de contrato foi marcado como padrão de onboarding.' });
      carregarModelos();
    } catch (err) {
      toast({ title: 'Erro inesperado', description: String(err), variant: 'destructive' });
    }
  };

  const handleToggleAtivo = async (id: string, ativoAtual: boolean) => {
    try {
      const res = await contratoModelosAdminService.toggleAtivo(id, !ativoAtual);
      if (!res.success) {
        toast({ title: 'Falha ao alterar status', description: res.error, variant: 'destructive' });
        return;
      }
      toast({ title: 'Status Atualizado', description: `Modelo ${!ativoAtual ? 'ativado' : 'desativado'} com sucesso.` });
      carregarModelos();
    } catch (err) {
      toast({ title: 'Erro inesperado', description: String(err), variant: 'destructive' });
    }
  };

  const handleAbrirNovaVersao = (tpl: ContratoTemplateAdminRecord) => {
    setNovaVersaoTemplate(tpl);
    setFormNome(tpl.nome);
    setFormConteudo(tpl.conteudo_html);
  };

  const handleSalvarNovaVersao = async () => {
    if (!novaVersaoTemplate) return;
    setIsSubmitting(true);
    try {
      const res = await contratoModelosAdminService.criarNovaVersao(
        novaVersaoTemplate.id,
        formConteudo,
        formNome
      );

      if (!res.success) {
        toast({ title: 'Falha ao criar versão', description: res.error, variant: 'destructive' });
        return;
      }

      toast({
        title: 'Nova Versão Criada!',
        description: `Modelo atualizado para a versão ${res.versao} e definido como padrão.`,
      });

      setNovaVersaoTemplate(null);
      carregarModelos();
    } catch (err) {
      toast({ title: 'Erro inesperado', description: String(err), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSalvarNovoModelo = async () => {
    if (!formNome || !formCodigo || !formConteudo) {
      toast({ title: 'Campos obrigatórios', description: 'Preencha Nome, Código e Conteúdo.', variant: 'destructive' });
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await contratoModelosAdminService.criarModelo({
        tipoContrato: tipoAtivo,
        codigoTemplate: formCodigo,
        nome: formNome,
        descricao: formDescricao,
        conteudoHtml: formConteudo,
        isDefault: true,
      });

      if (!res.success) {
        toast({ title: 'Falha ao criar modelo', description: res.error, variant: 'destructive' });
        return;
      }

      toast({ title: 'Modelo Criado!', description: 'O novo modelo de contrato foi registrado como padrão.' });
      setNovoModeloOpen(false);
      setFormNome('');
      setFormCodigo('');
      setFormConteudo('');
      setFormDescricao('');
      carregarModelos();
    } catch (err) {
      toast({ title: 'Erro inesperado', description: String(err), variant: 'destructive' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" />
            Gestão Administrativa de Contratos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Administre os modelos de contrato, versões ativas e definidores de padrão por tipo de cadastro.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={carregarModelos} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>

          <Button
            size="sm"
            onClick={() => {
              setFormNome('');
              setFormCodigo(`TPL-${tipoAtivo}-V1`);
              setFormConteudo(`<h2>CONTRATO DE ${tipoAtivo}</h2><p>Inserir cláusulas contratuais aqui...</p>`);
              setFormDescricao('');
              setNovoModeloOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-2" />
            Novo Modelo
          </Button>
        </div>
      </div>

      {/* Tabs por Tipo de Contrato */}
      <Tabs value={tipoAtivo} onValueChange={(v) => setTipoAtivo(v as TipoContrato)} className="space-y-6">
        <TabsList className="grid grid-cols-3 max-w-md">
          <TabsTrigger value="ANUNCIANTE" className="flex items-center gap-2">
            Anunciantes
          </TabsTrigger>
          <TabsTrigger value="PARCEIRO" className="flex items-center gap-2">
            Pontos Parceiros
          </TabsTrigger>
          <TabsTrigger value="GESTOR" className="flex items-center gap-2">
            Gestores
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tipoAtivo} className="space-y-4">
          {loading ? (
            <div className="flex items-center justify-center p-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : modelos.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3 opacity-50" />
              <h3 className="text-lg font-medium text-foreground">Nenhum modelo cadastrado</h3>
              <p className="text-sm text-muted-foreground mt-1 mb-4">
                Não existem modelos cadastrados para a categoria {tipoAtivo}.
              </p>
              <Button size="sm" onClick={() => setNovoModeloOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Modelo
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {modelos.map((tpl) => (
                <Card
                  key={tpl.id}
                  className={`relative flex flex-col justify-between transition-all ${
                    tpl.is_default ? 'border-primary/50 bg-primary/5 shadow-sm' : 'border-border/60'
                  }`}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <Badge variant={tpl.empresa_operadora_id ? 'outline' : 'secondary'} className="text-[10px]">
                        {tpl.empresa_operadora_id ? 'Tenant Específico' : 'Global'}
                      </Badge>

                      <div className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px] bg-background">
                          v{tpl.versao}
                        </Badge>
                        {tpl.is_default && (
                          <Badge className="bg-emerald-600 text-white text-[10px] flex items-center gap-1">
                            <Star className="h-3 w-3 fill-current" /> Padrão
                          </Badge>
                        )}
                      </div>
                    </div>

                    <CardTitle className="text-base font-semibold line-clamp-1">{tpl.nome}</CardTitle>
                    <CardDescription className="text-xs font-mono text-muted-foreground mt-1">
                      {tpl.codigo_template}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-4 text-xs text-muted-foreground flex-1">
                    {tpl.descricao && <p className="line-clamp-2 italic">{tpl.descricao}</p>}

                    <div className="flex items-center justify-between border-t border-border/40 pt-3 text-[11px]">
                      <span>Aplicado em:</span>
                      <span className="font-semibold text-foreground">
                        {tpl.total_contratos_aplicados || 0} contrato(s)
                      </span>
                    </div>
                  </CardContent>

                  {/* Ações */}
                  <div className="p-4 pt-0 border-t border-border/40 flex items-center justify-between gap-2 mt-auto">
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Visualizar Preview"
                        onClick={() => setPreviewTemplate(tpl)}
                      >
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        title="Criar Nova Versão"
                        onClick={() => handleAbrirNovaVersao(tpl)}
                      >
                        <Edit3 className="h-4 w-4 text-blue-500" />
                      </Button>

                      <Button
                        size="icon"
                        variant="ghost"
                        title={tpl.ativo ? 'Desativar Modelo' : 'Ativar Modelo'}
                        onClick={() => handleToggleAtivo(tpl.id, tpl.ativo)}
                      >
                        <Power className={`h-4 w-4 ${tpl.ativo ? 'text-emerald-500' : 'text-slate-400'}`} />
                      </Button>
                    </div>

                    {!tpl.is_default && tpl.ativo && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs text-primary border-primary/30 hover:bg-primary/10"
                        onClick={() => handleDefinirPadrao(tpl.id)}
                      >
                        <Star className="h-3.5 w-3.5 mr-1" />
                        Tornar Padrão
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal Preview Sanitizado */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Preview: {previewTemplate?.nome} (v{previewTemplate?.versao})
            </DialogTitle>
            <DialogDescription className="font-mono text-xs">
              Código: {previewTemplate?.codigo_template} | Tipo: {previewTemplate?.tipo_contrato}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-4 border rounded-md bg-white text-black text-xs font-serif leading-relaxed">
            <div
              dangerouslySetInnerHTML={{
                __html: sanitizeHtmlForPreview(previewTemplate?.conteudo_html || '<p>Sem conteúdo HTML.</p>'),
              }}
            />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              Fechar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Nova Versão / Edição */}
      <Dialog open={!!novaVersaoTemplate} onOpenChange={() => setNovaVersaoTemplate(null)}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5 text-blue-500" />
              Criar Nova Versão para: {novaVersaoTemplate?.nome}
            </DialogTitle>
            <DialogDescription className="text-xs">
              A nova versão assumirá o padrão automaticamente. Contratos celebrados anteriormente continuarão vinculados à v{novaVersaoTemplate?.versao} histórica.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto pr-2 flex-1">
            <div className="space-y-1">
              <Label className="text-xs">Nome do Modelo</Label>
              <Input value={formNome} onChange={(e) => setFormNome(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Conteúdo HTML do Modelo</Label>
              <Textarea
                rows={12}
                className="font-mono text-xs"
                value={formConteudo}
                onChange={(e) => setFormConteudo(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNovaVersaoTemplate(null)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarNovaVersao} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar Nova Versão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Novo Modelo */}
      <Dialog open={novoModeloOpen} onOpenChange={setNovoModeloOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Criar Novo Modelo de Contrato ({tipoAtivo})
            </DialogTitle>
            <DialogDescription className="text-xs">
              O novo modelo será registrado e marcado como padrão de onboarding para a categoria {tipoAtivo}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 overflow-y-auto pr-2 flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">Nome do Modelo</Label>
                <Input
                  placeholder="Ex: Contrato Anunciante 2026"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Código do Template (Exclusivo)</Label>
                <Input
                  placeholder="Ex: TPL-ANUNCIANTE-2026"
                  value={formCodigo}
                  onChange={(e) => setFormCodigo(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Descrição Opcional</Label>
              <Input
                placeholder="Descrição resumida da finalidade do modelo"
                value={formDescricao}
                onChange={(e) => setFormDescricao(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Conteúdo HTML do Modelo</Label>
              <Textarea
                rows={10}
                className="font-mono text-xs"
                value={formConteudo}
                onChange={(e) => setFormConteudo(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoModeloOpen(false)} disabled={isSubmitting}>
              Cancelar
            </Button>
            <Button onClick={handleSalvarNovoModelo} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Salvar e Definir Padrão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
