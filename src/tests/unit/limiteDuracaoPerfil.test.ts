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
  it('F-191: o limite da conta (definido pelo dono/ADM) vale no lugar do limite do perfil', () => {
    expect(limiteDoPerfil('GESTOR', 60)).toBe(60_500);
    expect(limiteDoPerfil('ANUNCIANTE', 45)).toBe(45_500);
    expect(limiteDoPerfil('GESTOR', null)).toBe(30_500);
    expect(limiteDoPerfil('OWNER', 10)).toBeNull();
    const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20261332_limite_video_por_conta.sql'), 'utf8');
    expect(sql).toContain('IF NEW.duration_ms > v_limite_conta * 1000 + 500 THEN');
    expect(sql).toContain('AND auth.uid() IS NOT NULL AND NOT public.fn_pode_ver_todas_as_contas() THEN');
    expect(sql).toContain("UPDATE public.usuarios SET limite_video_segundos = 60 WHERE id = 'f6fe7c99-efb9-47d7-8788-585568ba1086';");
    const tela = readFileSync(path.join(process.cwd(), 'src/components/media/MediaUploadDialog.tsx'), 'utf8');
    expect(tela).toContain('Math.floor(limiteGestorMs / 1000)'); // 30,5 s aparece como 30, não 31
  });
});
