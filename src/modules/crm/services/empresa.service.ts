import { Empresa } from '../types';

export class EmpresaService {
  async create(data: Partial<Empresa>): Promise<Empresa | null> {
    console.log('[EmpresaService.create] Método preparado para integração Supabase:', data);
    return null;
  }

  async update(id: string, data: Partial<Empresa>): Promise<Empresa | null> {
    console.log(`[EmpresaService.update] Atualizando ID ${id}:`, data);
    return null;
  }

  async delete(id: string): Promise<boolean> {
    console.log(`[EmpresaService.delete] Removendo ID ${id}`);
    return true;
  }

  async findById(id: string): Promise<Empresa | null> {
    console.log(`[EmpresaService.findById] Buscando ID ${id}`);
    return null;
  }

  async findAll(): Promise<Empresa[]> {
    console.log('[EmpresaService.findAll] Listando todas as empresas');
    return [];
  }
}

export const empresaService = new EmpresaService();
