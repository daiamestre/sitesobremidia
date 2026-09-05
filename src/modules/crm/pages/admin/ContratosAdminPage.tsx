import React, { useState, useEffect, useCallback } from 'react';
import {
  contratoModelosAdminService,
  ContratoTemplateAdminRecord,
} from '@/modules/crm/services/contratoModelosAdmin.service';
import { TipoContrato } from '@/modules/crm/services/contractResolver.service';
import {
  validarPlaceholdersTemplate,
  getCanonicalTemplateForTipo,
  isTemplateCompleto,
  CANONICAL_TEMPLATE_HTML_ANUNCIANTE,
  CANONICAL_TEMPLATE_HTML_PARCEIRO,
  CANONICAL_TEMPLATE_HTML_GESTOR,
} from '@/modules/crm/services/contratoDocumento.service';
import { ReadableContractEditor } from '@/modules/crm/components/contracts/ReadableContractEditor';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

  // Garantia absoluta: se o modal de Novo Modelo for aberto, assegura que o conteúdo canônico oficial esteja carregado
  useEffect(() => {
    if (novoModeloOpen) {
      if (!isTemplateCompleto(formConteudo, tipoAtivo)) {
        setFormConteudo(getCanonicalTemplateForTipo(tipoAtivo));
      }
      if (!formNome) {
        setFormNome(
          tipoAtivo === 'ANUNCIANTE'
            ? 'Contrato de Anunciante — Oficial'
            : tipoAtivo === 'PARCEIRO'
            ? 'Contrato de Ponto Parceiro — Oficial'
            : 'Contrato de Gestor de Mídias — Oficial'
        );
      }
      if (!formCodigo) {
        setFormCodigo(`TPL-${tipoAtivo}-${Date.now().toString().slice(-4)}`);
      }
      if (!formDescricao) {
        setFormDescricao(`Modelo oficial completo para ${tipoAtivo}`);
      }
    }
  }, [novoModeloOpen, tipoAtivo, formConteudo, formNome, formCodigo, formDescricao]);

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
    // Se conteúdo for stub ou incompleto, clona o template oficial canônico completo
    if (!isTemplateCompleto(tpl.conteudo_html, tpl.tipo_contrato)) {
      setFormConteudo(getCanonicalTemplateForTipo(tpl.tipo_contrato));
    } else {
      setFormConteudo(tpl.conteudo_html);
    }
  };

  const handleAbrirNovoModelo = () => {
    const nomePadrao =
      tipoAtivo === 'ANUNCIANTE'
        ? 'Contrato de Anunciante — Oficial'
        : tipoAtivo === 'PARCEIRO'
        ? 'Contrato de Ponto Parceiro — Oficial'
        : 'Contrato de Gestor de Mídias — Oficial';

    setFormNome(nomePadrao);
    setFormCodigo(`TPL-${tipoAtivo}-${Date.now().toString().slice(-4)}`);
    setFormDescricao(`Modelo oficial completo para ${tipoAtivo}`);
    setFormConteudo(getCanonicalTemplateForTipo(tipoAtivo));
    setNovoModeloOpen(true);
  };

  const handleSalvarNovaVersao = async () => {
    if (!novaVersaoTemplate) return;

    const validacao = validarPlaceholdersTemplate(formConteudo);
    if (!validacao.valido) {
      toast({
        title: 'Publicação Bloqueada',
        description: `Campo de contrato não reconhecido ou sem origem configurada: ${validacao.placeholdersDesconhecidos.map((p) => `{{${p}}}`).join(', ')}`,
        variant: 'destructive',
      });
      return;
    }

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

    const validacao = validarPlaceholdersTemplate(formConteudo);
    if (!validacao.valido) {
      toast({
        title: 'Publicação Bloqueada',
        description: `Campo de contrato não reconhecido ou sem origem configurada: ${validacao.placeholdersDesconhecidos.map((p) => `{{${p}}}`).join(', ')}`,
        variant: 'destructive',
      });
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

      if (!res.success || !res.templateId) {
        toast({ title: 'Falha ao criar modelo', description: res.error || 'Identificador do modelo não retornado pelo servidor.', variant: 'destructive' });
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

          <Button size="sm" onClick={handleAbrirNovoModelo}>
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
              <Button size="sm" onClick={handleAbrirNovoModelo}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Modelo
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {modelos.map((tpl) => {
                const lenKb = ((tpl.conteudo_html?.length || 0) / 1024).toFixed(1);
                const isOficial = tpl.codigo_template.toUpperCase().includes('OFICIAL');
                const totalPlaceholders = (tpl.conteudo_html?.match(/\{\{([A-Z_0-9]+)\}\}/g) || []).length;

                return (
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
                          {isOficial && (
                            <Badge variant="secondary" className="text-[10px] bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              Oficial
                            </Badge>
                          )}
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
                      <CardDescription className="text-xs font-mono text-muted-foreground mt-1 flex items-center justify-between">
                        <span>{tpl.codigo_template}</span>
                        <span className="text-[11px] font-sans text-muted-foreground">{lenKb} KB • {totalPlaceholders} variáveis</span>
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
                          title="Visualizar Cláusulas e Prévia"
                          onClick={() => setPreviewTemplate(tpl)}
                        >
                          <Eye className="h-4 w-4 text-primary" />
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
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Modal Preview Sanitizado com Visualização Completa de Cláusulas */}
      <Dialog open={!!previewTemplate} onOpenChange={() => setPreviewTemplate(null)}>
        <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <FileText className="h-5 w-5 text-primary" />
                  {previewTemplate?.nome}
                </DialogTitle>
                <DialogDescription className="font-mono text-xs mt-1 flex items-center gap-2">
                  <span>Código: <strong>{previewTemplate?.codigo_template}</strong></span>
                  <span>•</span>
                  <span>Versão: <strong>v{previewTemplate?.versao}</strong></span>
                  <span>•</span>
                  <span>Tipo: <strong>{previewTemplate?.tipo_contrato}</strong></span>
                  {previewTemplate?.is_default && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-600 font-semibold flex items-center gap-1">
                        <CheckCircle2 className="h-3.5 w-3.5 inline" /> Modelo Padrão
                      </span>
                    </>
                  )}
                </DialogDescription>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="text-xs shrink-0"
                onClick={() => {
                  if (previewTemplate?.conteudo_html) {
                    navigator.clipboard.writeText(previewTemplate.conteudo_html);
                    toast({ title: 'HTML Copiado', description: 'Código HTML do contrato copiado para a área de transferência.' });
                  }
                }}
              >
                <Copy className="h-3.5 w-3.5 mr-1" />
                Copiar HTML
              </Button>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 border rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-inner">
            <div
              className="bg-white dark:bg-slate-950 p-6 md:p-8 rounded border border-slate-200 dark:border-slate-800 shadow-sm max-w-3xl mx-auto"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtmlForPreview(previewTemplate?.conteudo_html || '<p>Sem conteúdo HTML.</p>'),
              }}
            />
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {((previewTemplate?.conteudo_html?.length || 0) / 1024).toFixed(1)} KB • Cláusulas Oficiais Ativas
            </div>
            <Button variant="outline" onClick={() => setPreviewTemplate(null)}>
              Fechar Visualização
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editor em Tela Cheia — Nova Versão / Edição */}
      {!!novaVersaoTemplate && (
        <div className="fixed inset-0 z-50 w-screen h-screen bg-background flex flex-col overflow-hidden animate-in fade-in duration-200">
          {/* Top Bar Compacta (52px) */}
          <div className="h-14 px-4 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-4 shrink-0 shadow-md">
            {/* Lado Esquerdo: Título e Versão */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="p-1.5 rounded-md bg-blue-600/30 text-blue-400 border border-blue-500/30">
                <Copy className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Nova Versão</span>
                  <Badge className="text-[10px] px-1.5 py-0 bg-blue-600 text-white">
                    {novaVersaoTemplate.tipo_contrato}
                  </Badge>
                  <span className="text-xs text-slate-400 font-mono">
                    v{(novaVersaoTemplate.versao || 1) + 1} (Padrão)
                  </span>
                </div>
              </div>
            </div>

            {/* Centro: Formulário Inline Compacto */}
            <div className="flex-1 max-w-2xl flex items-center gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Nome da Versão"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  className="h-8 text-xs bg-slate-800 border-slate-700 text-white placeholder:text-slate-400 focus:border-blue-500"
                />
              </div>
              <div className="w-52">
                <Input
                  value={`Código: ${novaVersaoTemplate.codigo_template}`}
                  disabled
                  className="h-8 text-xs bg-slate-800/60 border-slate-700/60 text-slate-400 font-mono"
                />
              </div>
            </div>

            {/* Lado Direito: Ações de Salvar e Fechar */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNovaVersaoTemplate(null)}
                disabled={isSubmitting}
                className="h-8 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSalvarNovaVersao}
                disabled={isSubmitting}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 shadow-xs"
              >
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                Salvar Nova Versão
              </Button>
            </div>
          </div>

          {/* Área do Editor em Tela Cheia (Duas Colunas) */}
          <div className="flex-1 w-full h-full min-h-0 overflow-hidden">
            <ReadableContractEditor
              value={formConteudo || getCanonicalTemplateForTipo(novaVersaoTemplate.tipo_contrato || tipoAtivo)}
              onChange={setFormConteudo}
              tipoContrato={novaVersaoTemplate.tipo_contrato || tipoAtivo}
            />
          </div>
        </div>
      )}

      {/* Editor em Tela Cheia — Novo Modelo */}
      {novoModeloOpen && (
        <div className="fixed inset-0 z-50 w-screen h-screen bg-background flex flex-col overflow-hidden animate-in fade-in duration-200">
          {/* Top Bar Compacta (52px) */}
          <div className="h-14 px-4 bg-slate-900 text-white border-b border-slate-800 flex items-center justify-between gap-4 shrink-0 shadow-md">
            {/* Lado Esquerdo: Título e Tipo */}
            <div className="flex items-center gap-3 shrink-0">
              <div className="p-1.5 rounded-md bg-blue-600/30 text-blue-400 border border-blue-500/30">
                <Plus className="h-4 w-4 text-blue-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-200">Novo Modelo</span>
                  <Badge className="text-[10px] px-1.5 py-0 bg-blue-600 text-white">{tipoAtivo}</Badge>
                </div>
              </div>
            </div>

            {/* Centro: Formulário Inline Compacto (Nome, Código e Descrição) */}
            <div className="flex-1 max-w-3xl flex items-center gap-2">
              <div className="flex-1">
                <Input
                  placeholder="Nome do Modelo (ex: Contrato Anunciante 2026)"
                  value={formNome}
                  onChange={(e) => setFormNome(e.target.value)}
                  className="h-8 text-xs bg-slate-800 border-slate-700 text-white placeholder:text-slate-400 focus:border-blue-500"
                />
              </div>
              <div className="w-48">
                <Input
                  placeholder="Código (ex: TPL-ANUNCIANTE-2026)"
                  value={formCodigo}
                  onChange={(e) => setFormCodigo(e.target.value)}
                  className="h-8 text-xs bg-slate-800 border-slate-700 text-white placeholder:text-slate-400 font-mono focus:border-blue-500"
                />
              </div>
              <div className="w-56 hidden xl:block">
                <Input
                  placeholder="Descrição opcional..."
                  value={formDescricao}
                  onChange={(e) => setFormDescricao(e.target.value)}
                  className="h-8 text-xs bg-slate-800 border-slate-700 text-white placeholder:text-slate-400 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Lado Direito: Ações de Salvar e Fechar */}
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNovoModeloOpen(false)}
                disabled={isSubmitting}
                className="h-8 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={handleSalvarNovoModelo}
                disabled={isSubmitting}
                className="h-8 text-xs bg-blue-600 hover:bg-blue-500 text-white font-semibold px-4 shadow-xs"
              >
                {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />}
                Salvar Modelo
              </Button>
            </div>
          </div>

          {/* Área do Editor em Tela Cheia (Duas Colunas) */}
          <div className="flex-1 w-full h-full min-h-0 overflow-hidden">
            <ReadableContractEditor
              value={formConteudo || getCanonicalTemplateForTipo(tipoAtivo)}
              onChange={setFormConteudo}
              tipoContrato={tipoAtivo}
            />
          </div>
        </div>
      )}
    </div>
  );
}


export default ContratosAdminPage;

