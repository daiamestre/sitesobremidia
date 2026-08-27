import { supabase } from '@/integrations/supabase/client';
import { aiService, AIResponse } from './ai.service';

export interface PointSearchResult {
  unidade_id: string;
  nome: string;
  cidade: string;
  estado: string;
  endereco: string;
  rede_nome: string;
  quantidade_telas: number;
  valor_unitario: number;
  distancia_km?: number;
  disponibilidade: 'DISPONIVEL' | 'INDISPONIVEL';
}

export interface PointSearchFilters {
  query?: string;
  cidade?: string;
  estado?: string;
  bairro?: string;
  tipo_estabelecimento?: string;
  raio_km?: number;
  lat?: number;
  lng?: number;
}

class AIPointSearchService {
  async searchWithAI(naturalLanguageQuery: string, empresaOperadoraId?: string): Promise<PointSearchResult[]> {
    const { data: pontos } = await supabase.rpc('listar_estabelecimentos_disponiveis');
    if (!pontos || pontos.length === 0) return [];

    const prompt = `
Você é um assistente inteligente do SOBRE MÍDIA para busca de pontos de mídia.
O usuário perguntou: "${naturalLanguageQuery}"

Aqui estão os pontos disponíveis no sistema:
${JSON.stringify(pontos.map((p: any) => ({
  id: p.unidade_id,
  nome: p.nome,
  cidade: p.cidade,
  estado: p.estado,
  endereco: p.endereco,
  rede: p.rede_nome,
  telas: p.quantidade_telas,
  valor: p.valor_unitario
})), null, 2)}

Analise a intenção do usuário e retorne APENAS um array JSON com os IDs dos pontos mais relevantes.
Exemplos de intenções:
- "pontos perto de mim" → usar localização se disponível, senão retornar pontos da mesma cidade
- "perto do meu bairro" → filtrar por bairro/cidade
- "perto de supermercados" → filtrar por tipo de estabelecimento (rede)
- "quero atingir pessoas próximas da minha empresa" → usar localização do usuário

Retorne apenas: ["id1", "id2", ...] ou [] se nenhum for relevante.
`;

    try {
      const response = await aiService.askExecutiveCopilot(prompt, empresaOperadoraId);
      const relevantIds = JSON.parse(response.answer.trim());
      
      if (!Array.isArray(relevantIds)) return [];
      
      return pontos
        .filter((p: any) => relevantIds.includes(p.unidade_id))
        .map((p: any) => ({
          unidade_id: p.unidade_id,
          nome: p.nome,
          cidade: p.cidade,
          estado: p.estado,
          endereco: p.endereco,
          rede_nome: p.rede_nome,
          quantidade_telas: p.quantidade_telas,
          valor_unitario: p.valor_unitario,
          disponibilidade: 'DISPONIVEL' as const,
        }));
    } catch {
      return this.searchWithFilters({ query: naturalLanguageQuery }, empresaOperadoraId);
    }
  }

  async searchWithFilters(filters: PointSearchFilters, empresaOperadoraId?: string): Promise<PointSearchResult[]> {
    const query = supabase.rpc('listar_estabelecimentos_disponiveis');
    
    const { data: pontos, error } = await query;
    if (error || !pontos) return [];

    let results = pontos as PointSearchResult[];

    if (filters.query) {
      const q = filters.query.toLowerCase();
      results = results.filter(p => 
        p.nome.toLowerCase().includes(q) ||
        p.cidade.toLowerCase().includes(q) ||
        p.estado.toLowerCase().includes(q) ||
        p.endereco.toLowerCase().includes(q) ||
        p.rede_nome.toLowerCase().includes(q)
      );
    }

    if (filters.cidade) {
      results = results.filter(p => p.cidade.toLowerCase() === filters.cidade!.toLowerCase());
    }

    if (filters.estado) {
      results = results.filter(p => p.estado.toLowerCase() === filters.estado!.toLowerCase());
    }

    if (filters.bairro) {
      results = results.filter(p => p.endereco.toLowerCase().includes(filters.bairro!.toLowerCase()));
    }

    if (filters.tipo_estabelecimento) {
      results = results.filter(p => p.rede_nome.toLowerCase().includes(filters.tipo_estabelecimento!.toLowerCase()));
    }

    return results;
  }

  async getNearbyPoints(lat: number, lng: number, raioKm: number = 10, empresaOperadoraId?: string): Promise<PointSearchResult[]> {
    const { data: pontos } = await supabase.rpc('listar_estabelecimentos_disponiveis');
    if (!pontos) return [];

    // O RPC não retorna coordenadas (lat/lng), então não há base para o filtro por raio
    return pontos as PointSearchResult[];
  }

  private calcularDistancia(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * Math.PI / 180;
  }
}

export const aiPointSearchService = new AIPointSearchService();