export class AnomalyService {
  async detectNetworkAnomalies(empresaOperadoraId: string): Promise<any[]> {
    return [
      {
        id: 'anom-01',
        tipo: 'QUEDA_DE_HEARTBEAT',
        gravidade: 'BAIXA',
        origem: 'PLAYER_ENGINE',
        confianca: 99.8,
        status: 'ANALISADA',
        mensagem: 'Player #18 apresentou oscilação de ping (latência 140ms), sem perda de Proof-of-Play.',
      },
    ];
  }
}

export const anomalyService = new AnomalyService();
