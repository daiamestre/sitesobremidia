/**
 * F-192 — totem com imagem de cabeça para baixo: o banco guarda o sentido do giro (90/270) e a playlist leva ao Player 5.7.8.
 * F-194 trocou o interruptor do painel pela rotação em 4 posições (RotacaoDaTela); o giro_quadro acompanha a rotação em pé.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync('supabase/migrations/20261333_giro_do_quadro_por_tela.sql', 'utf8');

describe('F-192 · sentido do giro do totem', () => {
  it('o banco guarda 90 ou 270 (padrão 90) e a playlist leva o valor ao Player', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS giro_quadro integer NOT NULL DEFAULT 90');
    expect(sql).toContain('CHECK (giro_quadro IN (90, 270))');
    expect(sql).toContain("'giro_quadro', coalesce(v_screen.giro_quadro, 90),");
    expect(sql).toContain('ROLLBACK:');
  });

  it('F-194: o giro_quadro acompanha a rotação em pé e a página usa a rotação em 4 posições', () => {
    const s194 = readFileSync('supabase/migrations/20261334_rotacao_4_posicoes_e_tela_paga.sql', 'utf8');
    expect(s194).toContain('IF NEW.rotacao_tela IN (90, 270) THEN NEW.giro_quadro := NEW.rotacao_tela; END IF;');
    expect(readFileSync('src/pages/dashboard/ScreenDetails.tsx', 'utf8')).toContain('<RotacaoDaTela');
  });
});
