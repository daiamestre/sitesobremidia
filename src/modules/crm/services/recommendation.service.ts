export class RecommendationService {
  async getSmartRecommendations(empresaOperadoraId: string): Promise<any[]> {
    return [
      {
        id: 'rec-01',
        titulo: 'Expansão de Inventário em Curitiba',
        recomendacao: 'Instalar 2 novos painéis LED na região central de Curitiba. Retorno estimado em R$ 28.000/mês.',
        prioridade: 'ALTA',
        impacto: 'AUMENTO_RECEITA',
      },
      {
        id: 'rec-02',
        titulo: 'Recomendação de Upsell para Cliente #042',
        recomendacao: 'Oferecer 30% a mais de inserções em horário nobre com desconto progressivo de 10%.',
        prioridade: 'MEDIA',
        impacto: 'RETENCAO',
      },
    ];
  }
}

export const recommendationService = new RecommendationService();
