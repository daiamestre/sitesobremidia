import { Campanha } from '../types';

export class CampanhaService {
  async create(data: Partial<Campanha>): Promise<Campanha | null> {
    console.log('[CampanhaService.create] Método preparado para integração Supabase:', data);
    return null;
  }

  async update(id: string, data: Partial<Campanha>): Promise<Campanha | null> {
    console.log(`[CampanhaService.update] Atualizando ID ${id}:`, data);
    return null;
  }

  async delete(id: string): Promise<boolean> {
    console.log(`[CampanhaService.delete] Removendo ID ${id}`);
    return true;
  }

  async findById(id: string): Promise<Campanha | null> {
    console.log(`[CampanhaService.findById] Buscando ID ${id}`);
    return null;
  }

  async findAll(): Promise<Campanha[]> {
    console.log('[CampanhaService.findAll] Listando todas as campanhas');
    return [];
  }
}

export const campanhaService = new CampanhaService();
