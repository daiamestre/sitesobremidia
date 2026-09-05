import React, { useState, useMemo, useRef } from 'react';
import {
  PLACEHOLDER_CATALOG,
  PlaceholderInfo,
  PlaceholderCategoria,
  validarPlaceholdersTemplate,
  formatarDataExtensa,
  preencherTemplate,
} from '@/modules/crm/services/contratoDocumento.service';
import { TipoContrato } from '@/modules/crm/services/contractResolver.service';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2, AlertTriangle, FileCode, Eye, BookOpen,
  Plus, Search, Sparkles, Layers, Info
} from 'lucide-react';

interface ReadableContractEditorProps {
  value: string;
  onChange: (value: string) => void;
  tipoContrato?: TipoContrato;
  className?: string;
}

const CATEGORIAS: { key: PlaceholderCategoria; label: string; cor: string }[] = [
  { key: 'CADASTRO', label: 'Cadastro & Partes', cor: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200' },
  { key: 'COMERCIAL', label: 'Comercial & Grade', cor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200' },
  { key: 'FINANCEIRO', label: 'Financeiro & Pagto', cor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200' },
  { key: 'DERIVADO', label: 'Datas & Locais', cor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200' },
  { key: 'SISTEMA', label: 'Sistema & Operação', cor: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 border-slate-200' },
];

export function sanitizeHtmlForPreview(rawHtml: string): string {
  if (!rawHtml) return '';
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*(["']).*?\1/gi, '')
    .replace(/on\w+\s*=\s*[^ >]+/gi, '')
    .replace(/javascript\s*:/gi, 'disabled:')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
}

export function ReadableContractEditor({
  value,
  onChange,
  tipoContrato = 'ANUNCIANTE',
  className = '',
}: ReadableContractEditorProps) {
  const [tabAtiva, setTabAtiva] = useState<'legivel' | 'html' | 'previa'>('legivel');
  const [categoriaFiltro, setCategoriaFiltro] = useState<PlaceholderCategoria | 'TODAS'>('TODAS');
  const [buscaToken, setBuscaToken] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Validação em tempo real
  const validacao = useMemo(() => {
    return validarPlaceholdersTemplate(value || '');
  }, [value]);

  // Lista filtrada do catálogo
  const catalogoFiltrado = useMemo(() => {
    const list = Object.values(PLACEHOLDER_CATALOG);
    return list.filter((item) => {
      const matchCat = categoriaFiltro === 'TODAS' || item.categoria === categoriaFiltro;
      const matchBusca =
        !buscaToken ||
        item.nome.toLowerCase().includes(buscaToken.toLowerCase()) ||
        item.descricao.toLowerCase().includes(buscaToken.toLowerCase());
      return matchCat && matchBusca;
    });
  }, [categoriaFiltro, buscaToken]);

  // Inserção do token no cursor
  const handleInsertPlaceholder = (tokenName: string) => {
    const token = `{{${tokenName}}}`;
    const textarea = textareaRef.current;
    if (!textarea) {
      onChange((value || '') + token);
      return;
    }

    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const currentVal = value || '';
    const updated = currentVal.substring(0, start) + token + currentVal.substring(end);
    onChange(updated);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    }, 50);
  };

  // Amostra de prévia com dados de exemplo resolvidos
  const htmlPreviaResolvida = useMemo(() => {
    if (!value) return '<p class="text-muted-foreground p-4">Nenhum conteúdo para prévia.</p>';
    try {
      const dadosExemplo: Record<string, string> = {
        RAZAO_SOCIAL: 'EMPRESA EXEMPLO LTDA',
        NOME_FANTASIA: 'LOJA MODELO CARUARU',
        CNPJ: '44.899.400/0001-99',
        CPF_CNPJ: '44.899.400/0001-99',
        RESPONSAVEL: 'Carlos Eduardo Oliveira',
        REPRESENTANTE_LEGAL: 'Carlos Eduardo Oliveira',
        NOME_GESTOR: 'Jairan Santos',
        LOGRADOURO: 'Av. Agamenon Magalhães',
        NUMERO: '1019',
        COMPLEMENTO: 'Sala 302',
        BAIRRO: 'Maurício de Nassau',
        CIDADE: 'Caruaru',
        ESTADO: 'PE',
        UF: 'PE',
        CEP: '55012-140',
        ENDERECO_UNIDADE: 'Av. Agamenon Magalhães, 1019 - Maurício de Nassau - Caruaru/PE',
        NOME_UNIDADE: 'Unidade Shopping Caruaru',
        TELEFONE: '(81) 99884-4677',
        WHATSAPP: '(81) 99884-4677',
        EMAIL: 'contato@empresaexemplo.com.br',
        INSTAGRAM: '@empresaexemplo',
        WEBSITE: 'www.empresaexemplo.com.br',
        DATA_INICIO: '05/09/2026',
        DATA_FIM: '05/09/2027',
        DATA_INICIO_VEICULACAO: '05/09/2026',
        DATA_FIM_VEICULACAO: '05/09/2027',
        PERIODO_VEICULACAO: '12 meses',
        DIAS_SEMANA: 'Segunda a Sábado',
        HORARIO_INICIO: '08:00',
        HORARIO_FIM: '22:00',
        PACOTE_VEICULACAO: 'Plano Premium 30s',
        QUANTIDADE_TELAS: '3',
        QTD_TVS: '2',
        QTD_TOTENS: '1',
        QTD_PAINEIS_LED: '0',
        TOTAL_SISTEMAS: '3',
        TITULO_CAMPANHA: 'Campanha Primavera 2026',
        VALOR_MENSAL: 'R$ 1.500,00',
        VALOR_A_VISTA: 'R$ 16.200,00',
        DESCONTO: 'R$ 1.800,00',
        ENTRADA: 'R$ 1.500,00',
        NUMERO_PARCELAS: '12',
        PARCELAMENTO_CARTAO: '12x de R$ 1.350,00',
        VALOR_POR_SISTEMA: 'R$ 500,00',
        FORMA_PAGAMENTO: 'PIX / Boleto Bancário',
        DATA_VENCIMENTO_PRIMEIRA_FATURA: '10/09/2026',
        LOCAL_ASSINATURA: 'Caruaru / PE',
        DATA_ASSINATURA: formatarDataExtensa(new Date()),
        FORO_COMARCA: 'Caruaru',
        NUMERO_CONTRATO: 'CTR-2026-0001',
        VERSAO_CONTRATO: '1',
        TIPO_CONTRATO: tipoContrato,
        ASSINATURA_SOBRE_MIDIA: '',
        ASSINATURA_CONTRATANTE: '',
        ASSINATURA_PARCEIRO: '',
      };

      if (!validacao.valido) {
        return `<div class="p-4 border border-rose-300 bg-rose-50 text-rose-800 rounded">
          <p class="font-bold">⚠️ Prévia bloqueada por tokens não reconhecidos:</p>
          <ul class="list-disc pl-5 mt-2">
            ${validacao.placeholdersDesconhecidos.map((p) => `<li><code>{{${p}}}</code></li>`).join('')}
          </ul>
        </div>`;
      }

      return preencherTemplate(value, dadosExemplo, tipoContrato);
    } catch (e: any) {
      return `<div class="p-4 border border-amber-300 bg-amber-50 text-amber-800 rounded">Erro ao renderizar prévia: ${e.message}</div>`;
    }
  }, [value, validacao, tipoContrato]);

  return (
    <div className={`flex flex-col h-full space-y-3 ${className}`}>
      {/* Barra de Status de Validação */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg border bg-slate-50 dark:bg-slate-900 text-xs">
        <div className="flex items-center gap-2">
          {validacao.valido ? (
            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium">
              <CheckCircle2 className="h-4 w-4" />
              <span>Modelo Válido ({validacao.placeholdersValidos.length} campos identificados)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              <span>
                {validacao.placeholdersDesconhecidos.length} campo(s) desconhecido(s) bloquearão a publicação!
              </span>
            </div>
          )}
        </div>

        {validacao.placeholdersDesconhecidos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {validacao.placeholdersDesconhecidos.map((p) => (
              <Badge key={p} variant="destructive" className="font-mono text-[10px] px-1.5 py-0.5">
                {`{{${p}}}`}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Tabs Principais: Editor Legível (Padrão) | HTML Avançado | Prévia */}
      <Tabs value={tabAtiva} onValueChange={(v) => setTabAtiva(v as any)} className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between border-b pb-2">
          <TabsList className="grid grid-cols-3 w-80">
            <TabsTrigger value="legivel" className="flex items-center gap-1 text-xs">
              <BookOpen className="h-3.5 w-3.5" />
              Editor Legível
            </TabsTrigger>
            <TabsTrigger value="html" className="flex items-center gap-1 text-xs">
              <FileCode className="h-3.5 w-3.5" />
              Código HTML
            </TabsTrigger>
            <TabsTrigger value="previa" className="flex items-center gap-1 text-xs">
              <Eye className="h-3.5 w-3.5" />
              Prévia Real
            </TabsTrigger>
          </TabsList>

          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Clique nos campos abaixo para inseri-los no contrato
          </span>
        </div>

        {/* Tab 1: Editor Legível */}
        <TabsContent value="legivel" className="flex-1 flex flex-col gap-3 min-h-0 mt-2">
          {/* Seletor Rápido de Placeholders */}
          <div className="border rounded-lg p-2.5 bg-slate-50/50 dark:bg-slate-900/50 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={categoriaFiltro === 'TODAS' ? 'default' : 'outline'}
                  className="h-6 text-[11px] px-2"
                  onClick={() => setCategoriaFiltro('TODAS')}
                >
                  Todos ({Object.keys(PLACEHOLDER_CATALOG).length})
                </Button>
                {CATEGORIAS.map((cat) => (
                  <Button
                    key={cat.key}
                    type="button"
                    size="sm"
                    variant={categoriaFiltro === cat.key ? 'default' : 'outline'}
                    className="h-6 text-[11px] px-2"
                    onClick={() => setCategoriaFiltro(cat.key)}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>

              <div className="relative w-44">
                <Search className="h-3 w-3 absolute left-2 top-2 text-muted-foreground" />
                <Input
                  placeholder="Buscar campo..."
                  value={buscaToken}
                  onChange={(e) => setBuscaToken(e.target.value)}
                  className="h-7 text-xs pl-7"
                />
              </div>
            </div>

            {/* Chips de Inserção Rápida */}
            <ScrollArea className="h-20 w-full rounded border bg-white dark:bg-slate-950 p-2">
              <div className="flex flex-wrap gap-1.5">
                {catalogoFiltrado.map((item) => (
                  <button
                    key={item.nome}
                    type="button"
                    title={`${item.descricao} (Origem: ${item.origem})`}
                    onClick={() => handleInsertPlaceholder(item.nome)}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border bg-slate-100 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-blue-900/60 text-slate-700 dark:text-slate-200 transition-colors font-mono"
                  >
                    <Plus className="h-2.5 w-2.5 text-blue-600 dark:text-blue-400" />
                    <span>[{item.nome}]</span>
                  </button>
                ))}
                {catalogoFiltrado.length === 0 && (
                  <span className="text-xs text-muted-foreground p-1">Nenhum campo encontrado com esse filtro.</span>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Área Principal de Edição */}
          <div className="flex-1 flex flex-col min-h-[260px]">
            <Label className="text-xs font-semibold mb-1 text-slate-700 dark:text-slate-300">
              Texto e Estrutura do Contrato (com tokens [CAMPO] legíveis)
            </Label>
            <Textarea
              ref={textareaRef}
              rows={14}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Cole ou redija o modelo de contrato com os campos..."
              className="flex-1 font-mono text-xs leading-relaxed p-3 border rounded-lg resize-none"
            />
          </div>
        </TabsContent>

        {/* Tab 2: Código HTML Avançado */}
        <TabsContent value="html" className="flex-1 flex flex-col gap-2 min-h-0 mt-2">
          <div className="p-2.5 border rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <strong>Modo Técnico Avançado:</strong> Permite editar diretamente a árvore DOM HTML do contrato. Mantenha os placeholders no formato <code>{`{{NOME_DO_CAMPO}}`}</code>.
            </div>
          </div>
          <Textarea
            rows={16}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="flex-1 font-mono text-xs leading-relaxed p-3 border rounded-lg resize-none"
          />
        </TabsContent>

        {/* Tab 3: Prévia em Tempo Real */}
        <TabsContent value="previa" className="flex-1 flex flex-col min-h-0 mt-2">
          <div className="flex-1 overflow-y-auto p-4 border rounded-lg bg-slate-100 dark:bg-slate-900 shadow-inner">
            <div
              className="bg-white dark:bg-slate-950 p-6 md:p-8 rounded-lg border shadow-sm max-w-3xl mx-auto text-slate-900 dark:text-slate-100"
              dangerouslySetInnerHTML={{
                __html: sanitizeHtmlForPreview(htmlPreviaResolvida),
              }}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ReadableContractEditor;
