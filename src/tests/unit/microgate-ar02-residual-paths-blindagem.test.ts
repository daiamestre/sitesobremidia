import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContratoModelosAdminService } from '@/modules/crm/services/contratoModelosAdmin.service';
import { supabase } from '@/integrations/supabase/client';
import * as fs from 'fs';
import * as path from 'path';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

describe('MICRO-GATE AR-02 — Blindagem dos Caminhos Residuais de Templates', () => {
  let service: ContratoModelosAdminService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ContratoModelosAdminService();
  });

  describe('1. Blindagem de criarNovaVersao()', () => {
    it('CT-AR02-VER-01: Invoca exclusivamente a RPC fn_criar_nova_versao_contrato_template e nunca chama supabase.from()', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          template_id: 'tpl-v2-uuid-1234',
          versao: 2,
          is_new_version: true,
        },
        error: null,
      } as any);

      const res = await service.criarNovaVersao('tpl-orig-id', '<div>[Razão Social do Contratante] v2</div>', 'Modelo Editado');

      expect(supabase.rpc).toHaveBeenCalledWith('fn_criar_nova_versao_contrato_template', {
        p_template_id: 'tpl-orig-id',
        p_novo_conteudo_html: '<div>[Razão Social do Contratante] v2</div>',
        p_novo_nome: 'Modelo Editado',
      });

      // GARANTIA AR-02: NUNCA deve chamar supabase.from() para fallback de INSERT ou UPDATE
      expect(supabase.from).not.toHaveBeenCalled();

      expect(res.success).toBe(true);
      expect(res.templateId).toBe('tpl-v2-uuid-1234');
      expect(res.versao).toBe(2);
    });

    it('CT-AR02-VER-02: Retorna erro controlado se a RPC falhar sem tentar fallback inseguro', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Acesso Negado: template pertence a outro tenant.',
        },
        error: null,
      } as any);

      const res = await service.criarNovaVersao('tpl-orig-id', '<div>[Razão Social do Contratante]</div>');

      expect(supabase.rpc).toHaveBeenCalledTimes(1);
      expect(supabase.from).not.toHaveBeenCalled();
      expect(res.success).toBe(false);
      expect(res.error).toBe('Acesso Negado: template pertence a outro tenant.');
    });

    it('CT-AR02-VER-03: Trata erro de rede/PostgREST retornado pela RPC com mensagem clara', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: null,
        error: { message: 'database connection error' },
      } as any);

      const res = await service.criarNovaVersao('tpl-orig-id', '<div>[Razão Social do Contratante]</div>');

      expect(supabase.from).not.toHaveBeenCalled();
      expect(res.success).toBe(false);
      expect(res.error).toContain('Falha ao processar nova versão: database connection error');
    });
  });

  describe('2. Blindagem de toggleAtivo()', () => {
    it('CT-AR02-TOG-01: Invoca exclusivamente a RPC fn_toggle_contrato_template_ativo para desativação atômica', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          template_id: 'tpl-123',
          ativo: false,
        },
        error: null,
      } as any);

      const res = await service.toggleAtivo('tpl-123', false);

      expect(supabase.rpc).toHaveBeenCalledWith('fn_toggle_contrato_template_ativo', {
        p_template_id: 'tpl-123',
        p_ativo: false,
      });

      // GARANTIA AR-02: NUNCA deve chamar supabase.from()
      expect(supabase.from).not.toHaveBeenCalled();
      expect(res.success).toBe(true);
    });

    it('CT-AR02-TOG-02: Invoca exclusivamente a RPC fn_toggle_contrato_template_ativo para ativação', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: true,
          template_id: 'tpl-123',
          ativo: true,
        },
        error: null,
      } as any);

      const res = await service.toggleAtivo('tpl-123', true);

      expect(supabase.rpc).toHaveBeenCalledWith('fn_toggle_contrato_template_ativo', {
        p_template_id: 'tpl-123',
        p_ativo: true,
      });

      expect(supabase.from).not.toHaveBeenCalled();
      expect(res.success).toBe(true);
    });

    it('CT-AR02-TOG-03: Retorna erro controlado caso a RPC rejeite a alteração de status', async () => {
      vi.mocked(supabase.rpc).mockResolvedValueOnce({
        data: {
          success: false,
          error: 'Acesso Negado: Apenas o OWNER pode alterar o status de templates globais.',
        },
        error: null,
      } as any);

      const res = await service.toggleAtivo('tpl-global-id', false);

      expect(supabase.from).not.toHaveBeenCalled();
      expect(res.success).toBe(false);
      expect(res.error).toBe('Acesso Negado: Apenas o OWNER pode alterar o status de templates globais.');
    });
  });

  describe('3. Teste Estático de Antirregressão (Código-Fonte)', () => {
    it('CT-AR02-STAT-01: Garante que NENHUM arquivo no diretório src/ executa insert/update/delete/upsert direto em contrato_templates', () => {
      const srcDir = path.resolve(process.cwd(), 'src');
      const filesWithForbiddenWrites: { file: string; match: string }[] = [];

      function scanDir(dir: string) {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== 'tests' && entry.name !== 'node_modules') {
              scanDir(fullPath);
            }
          } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
            const content = fs.readFileSync(fullPath, 'utf8');
            const pattern = /\.from\(['"]contrato_templates['"]\)\s*\.\s*(insert|update|delete|upsert)/g;
            let match;
            while ((match = pattern.exec(content)) !== null) {
              filesWithForbiddenWrites.push({
                file: path.relative(process.cwd(), fullPath),
                match: match[0],
              });
            }
          }
        }
      }

      scanDir(srcDir);

      expect(filesWithForbiddenWrites).toEqual([]);
    });
  });
});
