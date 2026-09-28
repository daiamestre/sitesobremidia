import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { limiteDoPerfil } from '@/components/media/MediaUploadDialog';

// F-114 — anunciante 20 s, gestor 30 s, OWNER/ADMIN sem limite (tela e banco).
describe('Limite de duração por perfil', () => {
  it('tela de envio', () => {
    expect(limiteDoPerfil('ANUNCIANTE')).toBe(20_500);
    expect(limiteDoPerfil('cliente')).toBe(20_500);
    expect(limiteDoPerfil('GESTOR')).toBe(30_500);
    expect(limiteDoPerfil('OWNER')).toBeNull();
    expect(limiteDoPerfil('ADMIN')).toBeNull();
    expect(limiteDoPerfil(null)).toBeNull();
  });
  it('banco confere o mesmo limite', () => {
    const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20261284_limite_duracao_por_perfil.sql'), 'utf8');
    expect(sql).toContain("IF v_perfil IN ('ANUNCIANTE', 'CLIENTE') THEN");
    expect(sql).toContain("ELSIF v_perfil = 'GESTOR' AND NEW.duration_ms > 30500 THEN");
    expect(sql).toContain('IF v_owner THEN RETURN NEW; END IF;');
  });
});
