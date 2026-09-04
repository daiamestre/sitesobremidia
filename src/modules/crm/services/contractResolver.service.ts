/**
 * SOBRE MÍDIA — Resolver Central de Tipo de Cadastro → Tipo de Contrato
 * FONTE ÚNICA DE VERDADE (P0 §4)
 * GESTOR_MIDIAS → GESTOR (Contrato de Gestão Operacional de Displays e Signage)
 */
export type CadastroType = 'ANUNCIANTE' | 'PONTO_PARCEIRO' | 'GESTOR_MIDIAS';
export type TipoContrato = 'ANUNCIANTE' | 'PARCEIRO' | 'GESTOR';

const MAP: Record<string, TipoContrato | null> = {
  ANUNCIANTE: 'ANUNCIANTE',
  PONTO_PARCEIRO: 'PARCEIRO',
  PARCEIRO: 'PARCEIRO',
  GESTOR_MIDIAS: 'GESTOR',
  GESTOR: 'GESTOR',
};

export function resolveContractTypeFromCadastroType(tipo: CadastroType | string | null | undefined): TipoContrato | null {
  if (!tipo) return null;
  const key = String(tipo).toUpperCase();
  return MAP[key] ?? null;
}

export function isGestorSemContrato(tipo: CadastroType | string | null | undefined): boolean {
  return false;
}


/**
 * PDFs oficiais — preserva nomes originais, expostos via public/official-contracts
 * TEMPLATE oficial (imutável) vs INSTÂNCIA preenchida (R2)
 */
export const OFFICIAL_PDFS = {
  ANUNCIANTE: {
    fileName: 'contrato-anunciante.pdf',
    originalName: 'CONTRATO SOBRE MIDIA ANUNCIANTE EXCLUSIVO (1).pdf',
    publicPath: '/official-contracts/contrato-anunciante.pdf',
    storageKeyPrefix: 'contratos/templates_oficiais',
    pages: 2,
    tipoContrato: 'ANUNCIANTE' as TipoContrato,
  },
  PARCEIRO: {
    fileName: 'contrato-parceria.pdf',
    originalName: 'CONTRATO DE PARCERIA DE MIDIA CORPORATIVA (1).pdf',
    publicPath: '/official-contracts/contrato-parceria.pdf',
    storageKeyPrefix: 'contratos/templates_oficiais',
    pages: 2,
    tipoContrato: 'PARCEIRO' as TipoContrato,
  },
  GESTOR: {
    fileName: 'contrato-gestor.pdf',
    originalName: 'CONTRATO DE GESTÃO DE MÍDIA DIGITAL.pdf',
    publicPath: '/official-contracts/contrato-gestor.pdf',
    storageKeyPrefix: 'contratos/templates_oficiais',
    pages: 2,
    tipoContrato: 'GESTOR' as TipoContrato,
  },
} as const;

export function getOfficialPdfForTipoContrato(tipo: TipoContrato | null): typeof OFFICIAL_PDFS[keyof typeof OFFICIAL_PDFS] | null {
  if (!tipo) return null;
  if (tipo === 'ANUNCIANTE') return OFFICIAL_PDFS.ANUNCIANTE;
  if (tipo === 'PARCEIRO') return OFFICIAL_PDFS.PARCEIRO;
  if (tipo === 'GESTOR') return OFFICIAL_PDFS.GESTOR;
  return null;
}

export function getOfficialPdfForCadastro(tipo: CadastroType | string | null | undefined) {
  const tc = resolveContractTypeFromCadastroType(tipo);
  return getOfficialPdfForTipoContrato(tc);
}
