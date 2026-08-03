export interface PontoDeExibicao {
  id: string;
  nomePonto: string;
  tipoPonto: 'tv_corporativa' | 'painel_led' | 'display_digital' | 'totem';
  endereco: string;
  cidade: string;
  estado: string;
  resolucao: string;
  ativo: boolean;
  screenId?: string;
  createdAt: string;
  updatedAt: string;
}
