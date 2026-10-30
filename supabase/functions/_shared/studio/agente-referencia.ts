// SOBRE MÍDIA Studio AI — AGENTE ANALISTA DE REFERÊNCIAS (F-220).
// O usuário manda a imagem de referência; o agente (modelo de visão da Cloudflare, na conta da SOBRE MÍDIA — sem Claude,
// sem Gemini, sem NotebookLM) descreve a composição inteira e escreve o prompt; a Cloudflare (lucid-origin) cria a imagem.
// As instruções VIVAS ficam no banco (studio_agentes, versionadas, editáveis por owner/ADM); este texto é a versão 1 e
// a reserva se o banco não responder.

export const MODELO_VISAO = '@cf/meta/llama-4-scout-17b-16e-instruct';
export const MODELO_IMAGEM = '@cf/leonardo/lucid-origin';
export const SLUG_AGENTE = 'analista-referencias';

export const INSTRUCOES_PADRAO = `Você é o Analista de Referências da SOBRE MÍDIA, diretor de arte de publicidade para TVs de lojas.
Você recebe UMA imagem de referência e escreve, em INGLÊS, um prompt para um gerador de imagens (Leonardo Lucid Origin) recriar a MESMA composição em qualidade ultra realista e alta resolução.
Método obrigatório (siga na ordem):
1. Formato e enquadramento: vertical, horizontal ou quadrado; câmera (frontal, de baixo, de cima), lente aparente e profundidade de campo.
2. Composição de cima para baixo e da esquerda para a direita: diga ONDE está cada elemento (top center, upper left corner, bottom center, behind the title, floating on the right side…), o tamanho relativo e o que está na frente ou atrás.
3. Textos visíveis: copie cada texto EXATAMENTE, letra por letra, entre aspas duplas ("BLACK" / "FRIDAY"), e descreva a tipografia: espessura, cantos, material (chrome, glossy plastic, gold, neon), cor, extrusão 3D, contorno, brilho, placa ou faixa por trás.
4. Objetos e produtos: descreva forma, material e cor de cada um, de forma GENÉRICA (nunca escreva marcas, logotipos ou nomes de fabricantes).
5. Iluminação e cor: de onde vem a luz, cor da luz, contraluz, reflexos, neon, partículas, bokeh, contraste; paleta principal.
6. Fundo e chão: ambiente, profundidade, reflexos.
7. Estilo final: palavras de acabamento (ultra realistic 3D advertising render, cinematic lighting, sharp focus, high detail).
Ignore e NÃO descreva: marcas d'água, ícones de site (coroa de "premium", botões, setas de interface), logotipos de marcas e textos minúsculos ilegíveis.
Não invente textos que não existem na imagem. Não inclua pessoas reais identificáveis.
O prompt deve ter entre 600 e 1800 caracteres, em um único parágrafo em inglês.`;

export interface AnaliseReferencia { prompt: string; textos: string[]; proporcao: 'vertical' | 'horizontal' | 'quadrado'; observacoes: string }

export const SCHEMA_ANALISE = {
  type: 'object', required: ['prompt', 'textos', 'proporcao', 'observacoes'],
  properties: {
    prompt: { type: 'string' },
    textos: { type: 'array', items: { type: 'string' } },
    proporcao: { type: 'string', enum: ['vertical', 'horizontal', 'quadrado'] },
    observacoes: { type: 'string' },
  },
};

/** Mensagens para o modelo de visão (a imagem vai como data URL). */
/** Formato real da imagem (o modelo de visão confunde vertical e horizontal; o tamanho vem do arquivo). */
export const formatoDe = (largura: number, altura: number) => (largura > altura * 1.05 ? 'horizontal' : altura > largura * 1.05 ? 'vertical' : 'quadrado');

export function mensagensDoAgente(instrucoes: string, imagemDataUrl: string, pedido: string | null, largura = 0, altura = 0) {
  const formato = largura > 0 && altura > 0 ? ` A imagem é ${formatoDe(largura, altura)} (${largura}×${altura} px): use exatamente esse formato no prompt e em proporcao.` : '';
  return [
    { role: 'system', content: instrucoes },
    { role: 'user', content: [
      { type: 'text', text: `Analise a imagem de referência e responda em JSON: prompt (em inglês, seguindo o método), textos (cada texto visível, exatamente como aparece), proporcao, observacoes (em português, curtas: o que o gerador pode errar).${formato}${pedido ? ` Ajuste pedido pelo cliente (aplique no prompt): ${pedido.slice(0, 400)}` : ''}` },
      { type: 'image_url', image_url: { url: imagemDataUrl } },
    ] },
  ];
}

/** Validação do que o agente devolveu: prompt completo e cada texto lido presente, entre aspas, no prompt. */
export function validarAnalise(a: AnaliseReferencia): string[] {
  const erros: string[] = [];
  const p = String(a?.prompt ?? '');
  if (p.length < 300) erros.push('O prompt ficou curto demais: descreva a composição inteira seguindo o método.');
  if (p.length > 2000) erros.push('O prompt passou de 2000 caracteres: resuma mantendo posições, textos e luz.');
  if (!['vertical', 'horizontal', 'quadrado'].includes(a?.proporcao)) erros.push('Proporção inválida.');
  for (const t of (a?.textos ?? []).filter((x) => x && x.trim().length > 1)) {
    if (!p.includes(`"${t.trim()}"`)) erros.push(`O texto "${t.trim()}" precisa aparecer exatamente, entre aspas, dentro do prompt.`);
  }
  return erros;
}

/**
 * Tamanho da imagem na proporção da referência, dentro do teto de custo (no máximo 6 blocos de 512 px no lucid-origin,
 * ≈ 4 mil neurons), lados múltiplos de 16 e até 1536 px.
 */
export function tamanhoDaImagem(largura: number, altura: number): { width: number; height: number } {
  const r = largura > 0 && altura > 0 ? largura / altura : 1;
  const proporcao = Math.min(3, Math.max(1 / 3, r));
  let lado = 1536;
  for (; lado >= 512; lado -= 16) {
    const w = proporcao >= 1 ? lado : Math.round((lado * proporcao) / 16) * 16;
    const h = proporcao >= 1 ? Math.round(lado / proporcao / 16) * 16 : lado;
    if (Math.ceil(w / 512) * Math.ceil(h / 512) <= 6) return { width: w, height: h };
  }
  return { width: 1024, height: 1024 };
}

/** Neurons do lucid-origin (preço oficial: 636 por bloco de 512² + 12 por passo) e o dólar equivalente. */
export function custoDaGeracao(width: number, height: number, passos: number) {
  const neurons = Math.ceil(width / 512) * Math.ceil(height / 512) * 636 + passos * 12;
  return { neurons, usd: Math.round(neurons * 0.011) / 1000 };
}
