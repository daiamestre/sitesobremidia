import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  PLACEHOLDER_CATALOG,
  PlaceholderInfo,
  PlaceholderCategoria,
  validarPlaceholdersTemplate,
  formatarDataExtensa,
  preencherTemplate,
  getCanonicalTemplateForTipo,
  isTemplateCompleto,
} from '@/modules/crm/services/contratoDocumento.service';
import { TipoContrato } from '@/modules/crm/services/contractResolver.service';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2, AlertTriangle, Eye, BookOpen,
  Plus, Search, Bold, Italic, Underline, ArrowDown, Move
} from 'lucide-react';

interface ReadableContractEditorProps {
  value: string;
  onChange: (value: string) => void;
  tipoContrato?: TipoContrato;
  className?: string;
}

export const CATEGORIAS: { key: PlaceholderCategoria; label: string; cor: string }[] = [
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
 * Cria o elemento HTML do chip do token para inserção na árvore visual.
 * O elemento é não-editável diretamente (contenteditable="false") e arrastável (draggable="true")
 * para permitir que o usuário reposicione dentro do documento ou remova clicando no botão 'x'.
 */
export function createTokenChipHtml(tokenName: string): string {
  const label = HUMAN_TOKEN_LABELS[tokenName] || tokenName;
  const isDesconhecido = !PLACEHOLDER_CATALOG[tokenName];

  if (isDesconhecido) {
    return `<span class="contract-token-chip inline-flex items-center gap-1 px-2 py-0.5 rounded border border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300 dark:border-rose-700 text-xs font-semibold select-none align-baseline mx-0.5 cursor-grab" contenteditable="false" draggable="true" data-token="${tokenName}" title="Campo não reconhecido: ${tokenName}">[${tokenName} — Não Reconhecido]<button type="button" class="remove-token-btn cursor-pointer font-bold hover:text-rose-600 px-0.5 bg-transparent border-0 inline text-xs leading-none" title="Remover este campo">&times;</button></span>`;
  }

  return `<span class="contract-token-chip inline-flex items-center gap-1 px-2 py-0.5 rounded border border-blue-300 bg-blue-50 text-blue-800 dark:bg-blue-950/70 dark:text-blue-300 dark:border-blue-700 text-xs font-semibold select-none align-baseline mx-0.5 cursor-grab hover:ring-1 hover:ring-blue-400" contenteditable="false" draggable="true" data-token="${tokenName}" title="Campo: ${label} (arraste para reposicionar ou clique no &times; para remover)">[${label}]<button type="button" class="remove-token-btn cursor-pointer font-bold hover:text-rose-600 px-0.5 bg-transparent border-0 inline text-xs leading-none" title="Remover este campo">&times;</button></span>`;
}

/**
 * Converte HTML canônico do template (contendo {{TOKEN}})
 * em HTML visual para edição direta no documento (com chips humanos não-editáveis).
 */
export function templateToVisualHtml(templateHtml: string): string {
  if (!templateHtml) return '';
  return templateHtml.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_match, token) => {
    return createTokenChipHtml(token);
  });
}

/**
 * Converte o HTML editado visualmente de volta para o template canônico interno,
 * substituindo os chips de tokens pelos seus placeholders correspondentes {{TOKEN}}.
 */
export function visualHtmlToTemplate(visualHtml: string): string {
  if (!visualHtml) return '';
  return visualHtml.replace(/<span[^>]*data-token=["']([A-Za-z0-9_]+)["'][^>]*>[\s\S]*?<\/span>/gi, '{{$1}}');
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
  const lastCanonicalValueRef = useRef<string>('');
  const draggedElementRef = useRef<HTMLElement | null>(null);

  // Template oficial canônico de fallback absoluto para garantir que NUNCA nasça vazio
  const canonicalPadrao = useMemo(() => {
    return getCanonicalTemplateForTipo(tipoContrato);
  }, [tipoContrato]);

  // Conteúdo canônico efetivo (garantia absoluta contra documentos em branco ou incompletos)
  const canonicalEfetivo = useMemo(() => {
    if (!value || value.trim().length < 200 || !isTemplateCompleto(value, tipoContrato)) {
      return canonicalPadrao;
    }
    return value;
  }, [value, canonicalPadrao, tipoContrato]);

  // Validação em tempo real baseada no conteúdo canônico
  const validacao = useMemo(() => {
    return validarPlaceholdersTemplate(canonicalEfetivo);
  }, [canonicalEfetivo]);

  // Lista filtrada do catálogo de placeholders (55 campos categorizados)
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

  // Sincroniza o DOM do editor visual quando o template value mudar externamente ou nascer
  useEffect(() => {
    if (!editorRef.current) return;
    const currentEditorCanonical = visualHtmlToTemplate(editorRef.current.innerHTML);

    if (canonicalEfetivo !== currentEditorCanonical && canonicalEfetivo !== lastCanonicalValueRef.current) {
      editorRef.current.innerHTML = templateToVisualHtml(canonicalEfetivo);
      lastCanonicalValueRef.current = canonicalEfetivo;

      // Se o valor de entrada estava vazio ou incompleto, notifica o pai com o template oficial completo imediatamente
      if (!value || value.trim().length < 200 || !isTemplateCompleto(value, tipoContrato)) {
        onChange(canonicalEfetivo);
      }
    }
  }, [canonicalEfetivo, value, tipoContrato, onChange]);

  // Trata input no editor visual e atualiza o estado canônico
  const handleEditorInput = () => {
    if (!editorRef.current) return;
    const visualHtml = editorRef.current.innerHTML;
    const canonical = visualHtmlToTemplate(visualHtml);
    lastCanonicalValueRef.current = canonical;
    onChange(canonical);
  };

  // Trata cliques no editor, permitindo remoção direta de chips pelo botão 'x'
  const handleEditorClick = (e: React.MouseEvent) => {
    const removeBtn = (e.target as HTMLElement)?.closest('.remove-token-btn');
    if (removeBtn) {
      e.preventDefault();
      e.stopPropagation();
      const chip = removeBtn.closest('.contract-token-chip');
      chip?.remove();
      handleEditorInput();
      return;
    }
  };

  /**
   * Insere um chip de token no ponto exato fornecido (por coordenadas ou cursor ativo)
   */
  const insertTokenAtPoint = (tokenName: string, clientX?: number, clientY?: number) => {
    const chipHtml = `${createTokenChipHtml(tokenName)}&nbsp;`;
    const editor = editorRef.current;
    if (!editor) return;

    editor.focus();

    let range: Range | null = null;
    if (clientX !== undefined && clientY !== undefined) {
      if (document.caretRangeFromPoint) {
        range = document.caretRangeFromPoint(clientX, clientY);
      } else if ((document as any).caretPositionFromPoint) {
        const pos = (document as any).caretPositionFromPoint(clientX, clientY);
        if (pos) {
          range = document.createRange();
          range.setStart(pos.offsetNode, pos.offset);
          range.collapse(true);
        }
      }
    }

    if (range && editor.contains(range.startContainer)) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);

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
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    } else {
      // Se não há coordenadas válidas de drop, usa a seleção atual do editor
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
        const curRange = sel.getRangeAt(0);
        curRange.deleteContents();
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = chipHtml;
        const frag = document.createDocumentFragment();
        let node: ChildNode | null;
        let lastNode: ChildNode | null = null;
        while ((node = tempDiv.firstChild)) {
          lastNode = frag.appendChild(node);
        }
        curRange.insertNode(frag);
        if (lastNode) {
          curRange.setStartAfter(lastNode);
          curRange.collapse(true);
          sel.removeAllRanges();
          sel.addRange(curRange);
        }
      } else {
        // Se o cursor não estiver no editor, anexa no final do documento
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = chipHtml;
        while (tempDiv.firstChild) {
          editor.appendChild(tempDiv.firstChild);
        }
      }
    }

    handleEditorInput();
  };

  // Inserção por clique
  const handleInsertPlaceholder = (tokenName: string) => {
    insertTokenAtPoint(tokenName);
  };

  // Drag over no documento: permite soltar e exibe o ponto de inserção
  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('application/x-contract-token')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';

      // Posiciona visualmente o caret onde o usuário está passando o mouse
      if (document.caretRangeFromPoint) {
        const range = document.caretRangeFromPoint(e.clientX, e.clientY);
        if (range && editorRef.current?.contains(range.startContainer)) {
          const sel = window.getSelection();
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
    }
  };

  // Drop no corpo do documento
  const handleDrop = (e: React.DragEvent) => {
    const tokenName = e.dataTransfer.getData('application/x-contract-token');
    if (!tokenName) return;

    e.preventDefault();
    e.stopPropagation();

    // Se for movimentação interna de um chip existente dentro do documento, remove a ocorrência anterior
    const isInternal = e.dataTransfer.getData('application/x-internal-move') === 'true';
    if (isInternal && draggedElementRef.current) {
      draggedElementRef.current.remove();
      draggedElementRef.current = null;
    }

    insertTokenAtPoint(tokenName, e.clientX, e.clientY);
  };

  // Início de drag a partir de um chip existente no editor (reordenamento/movimentação livre)
  const handleEditorDragStart = (e: React.DragEvent) => {
    const target = (e.target as HTMLElement)?.closest('[data-token]');
    if (target) {
      const tokenName = target.getAttribute('data-token');
      if (tokenName) {
        e.dataTransfer.setData('text/plain', `{{${tokenName}}}`);
        e.dataTransfer.setData('application/x-contract-token', tokenName);
        e.dataTransfer.setData('application/x-internal-move', 'true');
        e.dataTransfer.effectAllowed = 'move';
        draggedElementRef.current = target as HTMLElement;
      }
    }
  };

  // Drop na área inferior do documento (garante inserção sem restrições na parte final)
  const handleDropAtBottom = (e: React.DragEvent) => {
    const tokenName = e.dataTransfer.getData('application/x-contract-token');
    if (!tokenName) return;

    e.preventDefault();
    e.stopPropagation();

    const isInternal = e.dataTransfer.getData('application/x-internal-move') === 'true';
    if (isInternal && draggedElementRef.current) {
      draggedElementRef.current.remove();
      draggedElementRef.current = null;
    }

    const editor = editorRef.current;
    if (!editor) return;

    const chipHtml = `<p style="margin: 8px 0;">${createTokenChipHtml(tokenName)}</p>`;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = chipHtml;
    while (tempDiv.firstChild) {
      editor.appendChild(tempDiv.firstChild);
    }

    editor.focus();
    handleEditorInput();
  };

  // Clicar na área inferior para posicionar o cursor no final do documento
  const handleFocusBottom = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  // Executa comandos básicos de formatação rica
  const executeFormatting = (command: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false);
    handleEditorInput();
  };

  // Amostra de prévia com dados de exemplo resolvidos (EXATAMENTE a mesma folha documental)
  const htmlPreviaResolvida = useMemo(() => {
    const conteudo = canonicalEfetivo;
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

      return preencherTemplate(conteudo, dadosExemplo, tipoContrato);
    } catch (e: any) {
      return `<div class="p-4 border border-amber-300 bg-amber-50 text-amber-800 rounded">Erro ao renderizar prévia: ${e.message}</div>`;
    }
  }, [canonicalEfetivo, validacao, tipoContrato]);

  return (
    <div className={`flex flex-col h-full w-full min-h-0 overflow-hidden bg-background ${className}`}>
      {/* Top Bar de Ferramentas: Formatação Textual, Abas e Status de Validação */}
      <div className="w-full bg-white dark:bg-slate-950 px-4 py-2 border-b flex flex-wrap items-center justify-between gap-3 text-xs shrink-0 shadow-2xs z-10">
        {/* Lado Esquerdo: Ferramentas de Formatação e Controles Rápidos */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => executeFormatting('bold')}
            title="Negrito (Ctrl+B)"
          >
            <Bold className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => executeFormatting('italic')}
            title="Itálico (Ctrl+I)"
          >
            <Italic className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0"
            onClick={() => executeFormatting('underline')}
            title="Sublinhado (Ctrl+U)"
          >
            <Underline className="h-4 w-4" />
          </Button>

          <div className="h-4 w-px bg-border mx-1" />

          {/* Abas: Editor Visual vs Prévia Real */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg border">
            <button
              type="button"
              onClick={() => setTabAtiva('editor')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                tabAtiva === 'editor'
                  ? 'bg-white dark:bg-slate-900 text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Editor do Documento</span>
            </button>
            <button
              type="button"
              onClick={() => setTabAtiva('previa')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-all ${
                tabAtiva === 'previa'
                  ? 'bg-white dark:bg-slate-900 text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Eye className="h-3.5 w-3.5" />
              <span>Prévia Real</span>
            </button>
          </div>
        </div>

        {/* Lado Direito: Status de Validação e Dica Operacional */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400 text-[11px] hidden lg:flex">
            <Move className="h-3 w-3 text-blue-500" />
            <span>Arraste campos do painel lateral para qualquer lugar do documento</span>
          </div>

          <div>
            {validacao.valido ? (
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Modelo Válido ({validacao.placeholdersValidos.length} campos)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/50 px-2.5 py-1 rounded-full border border-rose-200 dark:border-rose-800">
                <AlertTriangle className="h-3.5 w-3.5" />
                <span>{validacao.placeholdersDesconhecidos.length} campo(s) desconhecido(s)</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Corpo Principal: Layout de 2 Colunas (Documento Dominante à Esquerda + Painel Lateral de Campos à Direita) */}
      <div className="flex-1 flex flex-row min-h-0 w-full overflow-hidden">
        {/* COLUNA ESQUERDA: Área Dominante de Edição do Documento / Prévia */}
        <div className="flex-1 flex flex-col h-full min-h-0 bg-slate-100/90 dark:bg-slate-900/90 overflow-hidden">
          {tabAtiva === 'editor' ? (
            /* Viewport de Rolagem Vertical Ampla e Irrestrita */
            <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
              <div className="max-w-4xl mx-auto space-y-6">
                {/* Folha do Documento Editável (WYSIWYG Direto) */}
                <div
                  ref={editorRef}
                  contentEditable
                  suppressContentEditableWarning
                  onInput={handleEditorInput}
                  onBlur={handleEditorInput}
                  onClick={handleEditorClick}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDragStart={handleEditorDragStart}
                  className="bg-white dark:bg-slate-950 p-8 md:p-14 rounded-lg border border-slate-200 dark:border-slate-800 shadow-md text-slate-900 dark:text-slate-100 min-h-[1400px] pb-32 focus:outline-none focus:ring-2 focus:ring-primary/20 leading-relaxed font-sans text-sm"
                />

                {/* Área Inferior Dinâmica e Acessível para Soltar ou Adicionar Conteúdo ao Final */}
                <div
                  onDragOver={handleDragOver}
                  onDrop={handleDropAtBottom}
                  onClick={handleFocusBottom}
                  className="p-8 border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-primary text-slate-500 hover:text-primary rounded-xl text-center text-xs transition-all cursor-pointer bg-white/70 dark:bg-slate-950/70 flex flex-col items-center justify-center gap-2 shadow-sm mb-32"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                    <ArrowDown className="h-4 w-4 text-primary" />
                    <span>Região Inferior do Contrato</span>
                  </div>
                  <p className="text-xs text-muted-foreground max-w-lg">
                    Solte campos aqui para inseri-los no final do contrato, ou clique para posicionar o cursor e redigir novas cláusulas, anexos ou assinaturas adicionais.
                  </p>
                  <span className="text-[11px] px-3 py-1 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 font-medium">
                    Superfície de Altura Livre • Espaço para Todo o Contrato
                  </span>
                </div>
              </div>
            </div>
          ) : (
            /* Prévia Real com Dados de Amostra */
            <div className="flex-1 overflow-y-auto p-4 md:p-8 scroll-smooth">
              <div className="max-w-4xl mx-auto pb-32">
                <div
                  className="bg-white dark:bg-slate-950 p-8 md:p-14 rounded-lg border border-slate-200 dark:border-slate-800 shadow-md text-slate-900 dark:text-slate-100 leading-relaxed font-sans text-sm min-h-[1400px]"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeHtmlForPreview(htmlPreviaResolvida),
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* COLUNA DIREITA: Painel Lateral Auxiliar de Campos Arrastáveis */}
        <div className="w-80 md:w-88 shrink-0 h-full border-l bg-card dark:bg-slate-950 flex flex-col min-h-0 shadow-lg z-10">
          {/* Header do Painel Lateral */}
          <div className="p-3.5 border-b bg-slate-50/80 dark:bg-slate-900/80 shrink-0 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Move className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <span className="text-xs font-bold text-foreground">Campos Disponíveis</span>
              </div>
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0.2">
                {catalogoFiltrado.length} de {Object.keys(PLACEHOLDER_CATALOG).length}
              </Badge>
            </div>

            {/* Campo de Busca Rápida */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                placeholder="Buscar campo..."
                value={buscaToken}
                onChange={(e) => setBuscaToken(e.target.value)}
                className="h-8 text-xs pl-8 bg-white dark:bg-slate-900"
              />
            </div>

            {/* Filtro por Categorias */}
            <div className="flex flex-wrap gap-1 pt-0.5">
              <button
                type="button"
                onClick={() => setCategoriaFiltro('TODAS')}
                className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                  categoriaFiltro === 'TODAS'
                    ? 'bg-blue-600 text-white border-blue-600 font-medium'
                    : 'bg-slate-100 dark:bg-slate-800 text-muted-foreground hover:text-foreground border-transparent'
                }`}
              >
                Todas
              </button>
              {CATEGORIAS.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => setCategoriaFiltro(cat.key)}
                  className={`text-[10px] px-2 py-0.5 rounded-full border transition-all ${
                    categoriaFiltro === cat.key
                      ? 'bg-blue-600 text-white border-blue-600 font-medium'
                      : 'bg-slate-100 dark:bg-slate-800 text-muted-foreground hover:text-foreground border-transparent'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Lista Vertical de Tokens Arrastáveis (Scroll Independente) */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-1.5 min-h-0">
            {catalogoFiltrado.map((item) => {
              const labelHumano = HUMAN_TOKEN_LABELS[item.nome] || item.nome;
              return (
                <button
                  key={item.nome}
                  type="button"
                  draggable={true}
                  title={`${item.descricao} (Origem: ${item.origem}) — Clique para inserir no cursor ou arraste para o documento`}
                  onClick={() => handleInsertPlaceholder(item.nome)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', `{{${item.nome}}}`);
                    e.dataTransfer.setData('application/x-contract-token', item.nome);
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  className="w-full text-left p-2 rounded-lg border bg-white dark:bg-slate-900/90 hover:bg-blue-50 dark:hover:bg-blue-950/60 hover:border-blue-300 dark:hover:border-blue-700 transition-all flex items-start gap-2 group cursor-grab active:cursor-grabbing select-none shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      [{labelHumano}]
                    </div>
                    <div className="text-[10px] text-muted-foreground line-clamp-1">
                      {item.descricao}
                    </div>
                  </div>
                </button>
              );
            })}

            {catalogoFiltrado.length === 0 && (
              <div className="text-center py-8 text-xs text-muted-foreground">
                Nenhum campo encontrado com o filtro atual.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default ReadableContractEditor;
