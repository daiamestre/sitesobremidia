import React, { useState, useMemo, useRef, useEffect } from 'react';
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
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2, AlertTriangle, Eye, BookOpen,
  Plus, Search, Bold, Italic, Underline
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

/**
 * Mapeamento canônico de representação humana para exibição nos documentos em edição.
 * O usuário NUNCA deve ver {{RAZAO_SOCIAL}} ou [RAZAO_SOCIAL] como código,
 * e sim frases e termos humanos em português.
 */
export const HUMAN_TOKEN_LABELS: Record<string, string> = {
  RAZAO_SOCIAL: 'Razão Social do Contratante',
  NOME_FANTASIA: 'Nome Fantasia',
  CNPJ: 'CPF/CNPJ',
  CPF_CNPJ: 'CPF/CNPJ',
  RESPONSAVEL: 'Responsável Legal',
  REPRESENTANTE_LEGAL: 'Representante Legal',
  NOME_GESTOR: 'Nome do Gestor',
  LOGRADOURO: 'Logradouro',
  NUMERO: 'Número',
  COMPLEMENTO: 'Complemento',
  BAIRRO: 'Bairro',
  CIDADE: 'Cidade',
  ESTADO: 'Estado',
  UF: 'UF',
  CEP: 'CEP',
  ENDERECO_UNIDADE: 'Endereço do Contratante',
  NOME_UNIDADE: 'Nome da Unidade',
  TELEFONE: 'Telefone',
  WHATSAPP: 'WhatsApp',
  EMAIL: 'E-mail',
  INSTAGRAM: 'Instagram',
  WEBSITE: 'Website',
  DATA_INICIO: 'Data de Início',
  DATA_FIM: 'Data de Término',
  DATA_INICIO_VEICULACAO: 'Data Início Veiculação',
  DATA_FIM_VEICULACAO: 'Data Fim Veiculação',
  PERIODO_VEICULACAO: 'Período de Veiculação',
  DIAS_SEMANA: 'Dias da Semana',
  HORARIO_INICIO: 'Horário de Início',
  HORARIO_FIM: 'Horário de Término',
  PACOTE_VEICULACAO: 'Pacote de Veiculação',
  QUANTIDADE_TELAS: 'Quantidade de Telas',
  QTD_TVS: 'Qtd de TVs',
  QTD_TOTENS: 'Qtd de Totens',
  QTD_PAINEIS_LED: 'Qtd Painéis de LED',
  TOTAL_SISTEMAS: 'Total de Sistemas',
  TITULO_CAMPANHA: 'Título da Campanha',
  VALOR_MENSAL: 'Valor Mensal',
  VALOR_A_VISTA: 'Valor à Vista',
  DESCONTO: 'Desconto',
  ENTRADA: 'Entrada',
  NUMERO_PARCELAS: 'Número de Parcelas',
  PARCELAMENTO_CARTAO: 'Parcelamento Cartão',
  VALOR_POR_SISTEMA: 'Valor por Sistema',
  FORMA_PAGAMENTO: 'Forma de Pagamento',
  DATA_VENCIMENTO_PRIMEIRA_FATURA: 'Data 1ª Fatura',
  LOCAL_ASSINATURA: 'Cidade / UF',
  DATA_ASSINATURA: 'Data da Assinatura',
  FORO_COMARCA: 'Foro / Comarca',
  NUMERO_CONTRATO: 'Número do Contrato',
  VERSAO_CONTRATO: 'Versão do Contrato',
  TIPO_CONTRATO: 'Tipo do Contrato',
  ASSINATURA_SOBRE_MIDIA: 'Assinatura Sobre Mídia',
  ASSINATURA_CONTRATANTE: 'Assinatura Contratante',
  ASSINATURA_PARCEIRO: 'Assinatura Parceiro',
};

export function sanitizeHtmlForPreview(rawHtml: string): string {
  if (!rawHtml) return '';
  return rawHtml
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+\s*=\s*(["']).*?\1/gi, '')
    .replace(/on\w+\s*=\s*[^ >]+/gi, '')
    .replace(/javascript\s*:/gi, 'disabled:')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');
}

/**
 * Converte HTML canônico do template (contendo {{TOKEN}})
 * em HTML visual para edição direta no documento (com chips humanos não-editáveis).
 */
export function templateToVisualHtml(templateHtml: string): string {
  if (!templateHtml) return '';
  return templateHtml.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, token) => {
    const label = HUMAN_TOKEN_LABELS[token] || token;
    const isDesconhecido = !PLACEHOLDER_CATALOG[token];
    if (isDesconhecido) {
      return `<span class="inline-flex items-center px-2 py-0.5 rounded border border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-700 text-xs font-semibold select-none align-baseline mx-0.5 cursor-not-allowed" contenteditable="false" data-token="${token}" title="Campo não reconhecido: ${token}">[${token} — Não Reconhecido]</span>`;
    }
    return `<span class="contract-token-chip inline-flex items-center px-2 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-700 text-xs font-semibold select-none align-baseline mx-0.5 cursor-default" contenteditable="false" data-token="${token}" title="Campo: ${label}">[${label}]</span>`;
  });
}

/**
 * Converte o HTML editado visualmente de volta para o template canônico interno,
 * substituindo os chips de tokens pelos seus placeholders correspondentes {{TOKEN}}.
 */
export function visualHtmlToTemplate(visualHtml: string): string {
  if (!visualHtml) return '';
  return visualHtml.replace(/<span[^>]*data-token=["']([A-Za-z0-9_]+)["'][^>]*>.*?<\/span>/gi, '{{$1}}');
}

export function ReadableContractEditor({
  value,
  onChange,
  tipoContrato = 'ANUNCIANTE',
  className = '',
}: ReadableContractEditorProps) {
  const [tabAtiva, setTabAtiva] = useState<'editor' | 'previa'>('editor');
  const [categoriaFiltro, setCategoriaFiltro] = useState<PlaceholderCategoria | 'TODAS'>('TODAS');
  const [buscaToken, setBuscaToken] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const lastCanonicalValueRef = useRef<string>(value || '');

  // Validação em tempo real baseada no conteúdo canônico
  const validacao = useMemo(() => {
    return validarPlaceholdersTemplate(value || '');
  }, [value]);

  // Lista filtrada do catálogo de placeholders
  const catalogoFiltrado = useMemo(() => {
    const list = Object.values(PLACEHOLDER_CATALOG);
    return list.filter((item) => {
      const matchCat = categoriaFiltro === 'TODAS' || item.categoria === categoriaFiltro;
      const matchBusca =
        !buscaToken ||
        item.nome.toLowerCase().includes(buscaToken.toLowerCase()) ||
        item.descricao.toLowerCase().includes(buscaToken.toLowerCase()) ||
        (HUMAN_TOKEN_LABELS[item.nome] || '').toLowerCase().includes(buscaToken.toLowerCase());
      return matchCat && matchBusca;
    });
  }, [categoriaFiltro, buscaToken]);

  // Sincroniza o DOM do editor visual quando o template value mudar externamente
  useEffect(() => {
    if (!editorRef.current) return;
    const currentEditorCanonical = visualHtmlToTemplate(editorRef.current.innerHTML);
    if (value !== currentEditorCanonical && value !== lastCanonicalValueRef.current) {
      editorRef.current.innerHTML = templateToVisualHtml(value || '');
      lastCanonicalValueRef.current = value || '';
    }
  }, [value]);

  // Trata input no editor visual
  const handleEditorInput = () => {
    if (!editorRef.current) return;
    const visualHtml = editorRef.current.innerHTML;
    const canonical = visualHtmlToTemplate(visualHtml);
    lastCanonicalValueRef.current = canonical;
    onChange(canonical);
  };

  // Inserção do chip humano no ponto de seleção atual do documento
  const handleInsertPlaceholder = (tokenName: string) => {
    const label = HUMAN_TOKEN_LABELS[tokenName] || tokenName;
    const chipHtml = `<span class="contract-token-chip inline-flex items-center px-2 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-700 text-xs font-semibold select-none align-baseline mx-0.5 cursor-default" contenteditable="false" data-token="${tokenName}" title="Campo: ${label}">[${label}]</span>&nbsp;`;

    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();

    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = chipHtml;
      const frag = document.createDocumentFragment();
      let node: ChildNode | null;
      let lastNode: ChildNode | null = null;
      while ((node = tempDiv.firstChild)) {
        lastNode = frag.appendChild(node);
      }
      range.insertNode(frag);
      if (lastNode) {
        range.setStartAfter(lastNode);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
    } else {
      // Se não houver seleção ativa dentro do editor, adiciona ao final
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = chipHtml;
      while (tempDiv.firstChild) {
        editor.appendChild(tempDiv.firstChild);
      }
    }

    handleEditorInput();
  };

  // Executa comandos básicos de formatação rica
  const executeFormatting = (command: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false);
    handleEditorInput();
  };

  // Amostra de prévia com dados de exemplo resolvidos (EXATAMENTE o mesmo documento, apenas com dados substituídos)
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
          <p class="font-bold">⚠️ Prévia bloqueada por campos não reconhecidos:</p>
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
              <span>Modelo Válido ({validacao.placeholdersValidos.length} campos identificados no documento)</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold">
              <AlertTriangle className="h-4 w-4" />
              <span>
                {validacao.placeholdersDesconhecidos.length} campo(s) desconhecido(s) bloquearão o salvamento!
              </span>
            </div>
          )}
        </div>

        {validacao.placeholdersDesconhecidos.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            {validacao.placeholdersDesconhecidos.map((p) => (
              <Badge key={p} variant="destructive" className="text-[10px] px-1.5 py-0.5">
                {`[Campo Desconhecido: ${p}]`}
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* Tabs Principais: Editor Visual do Documento | Prévia Real (SEM ABA HTML) */}
      <Tabs value={tabAtiva} onValueChange={(v) => setTabAtiva(v as any)} className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between border-b pb-2">
          <TabsList className="grid grid-cols-2 w-72">
            <TabsTrigger value="editor" className="flex items-center gap-1.5 text-xs">
              <BookOpen className="h-3.5 w-3.5" />
              Editor do Documento
            </TabsTrigger>
            <TabsTrigger value="previa" className="flex items-center gap-1.5 text-xs">
              <Eye className="h-3.5 w-3.5" />
              Prévia Real
            </TabsTrigger>
          </TabsList>

          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            Clique no documento para editar cláusulas ou adicione campos pelos botões acima
          </span>
        </div>

        {/* Tab 1: Editor Visual do Documento */}
        <TabsContent value="editor" className="flex-1 flex flex-col gap-3 min-h-0 mt-2">
          {/* Painel de Inserção de Campos Disponíveis */}
          <div className="border rounded-lg p-2.5 bg-slate-50/70 dark:bg-slate-900/70 space-y-2">
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

              <div className="relative w-48">
                <Search className="h-3 w-3 absolute left-2 top-2 text-muted-foreground" />
                <Input
                  placeholder="Buscar campo..."
                  value={buscaToken}
                  onChange={(e) => setBuscaToken(e.target.value)}
                  className="h-7 text-xs pl-7"
                />
              </div>
            </div>

            {/* Botões de Inserção com Nomes Humanos em Português */}
            <ScrollArea className="h-20 w-full rounded border bg-white dark:bg-slate-950 p-2">
              <div className="flex flex-wrap gap-1.5">
                {catalogoFiltrado.map((item) => {
                  const labelHumano = HUMAN_TOKEN_LABELS[item.nome] || item.nome;
                  return (
                    <button
                      key={item.nome}
                      type="button"
                      title={`${item.descricao} (Origem: ${item.origem})`}
                      onClick={() => handleInsertPlaceholder(item.nome)}
                      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full border bg-slate-100 hover:bg-blue-100 dark:bg-slate-800 dark:hover:bg-blue-900/60 text-slate-700 dark:text-slate-200 transition-colors font-medium"
                    >
                      <Plus className="h-2.5 w-2.5 text-blue-600 dark:text-blue-400" />
                      <span>[{labelHumano}]</span>
                    </button>
                  );
                })}
                {catalogoFiltrado.length === 0 && (
                  <span className="text-xs text-muted-foreground p-1">Nenhum campo encontrado com esse filtro.</span>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Área Principal de Edição Visual do Documento */}
          <div className="flex-1 flex flex-col min-h-0 border rounded-lg bg-slate-100/90 dark:bg-slate-900/90 p-3 md:p-4 overflow-y-auto">
            {/* Barra de Formatação Textual */}
            <div className="max-w-3xl w-full mx-auto mb-2 flex items-center justify-between text-xs bg-white dark:bg-slate-950 px-3 py-1.5 rounded-md border shadow-2xs">
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => executeFormatting('bold')}
                  title="Negrito"
                >
                  <Bold className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => executeFormatting('italic')}
                  title="Itálico"
                >
                  <Italic className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0"
                  onClick={() => executeFormatting('underline')}
                  title="Sublinhado"
                >
                  <Underline className="h-3.5 w-3.5" />
                </Button>
              </div>

              <span className="text-[11px] text-muted-foreground font-sans">
                Documento Visual Editável • Digite livremente no texto
              </span>
            </div>

            {/* Folha do Documento Editável (WYSIWYG Direto) */}
            <div className="flex-1 max-w-3xl w-full mx-auto">
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={handleEditorInput}
                onBlur={handleEditorInput}
                className="bg-white dark:bg-slate-950 p-6 md:p-10 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm text-slate-900 dark:text-slate-100 min-h-[520px] focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed font-sans text-sm"
              />
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Prévia Real com Dados de Amostra */}
        <TabsContent value="previa" className="flex-1 flex flex-col min-h-0 mt-2">
          <div className="flex-1 overflow-y-auto p-3 md:p-4 border rounded-lg bg-slate-100/90 dark:bg-slate-900/90 shadow-inner">
            <div className="max-w-3xl w-full mx-auto">
              <div
                className="bg-white dark:bg-slate-950 p-6 md:p-10 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm text-slate-900 dark:text-slate-100 leading-relaxed font-sans text-sm"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtmlForPreview(htmlPreviaResolvida),
                }}
              />
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default ReadableContractEditor;
