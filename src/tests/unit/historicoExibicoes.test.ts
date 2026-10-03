import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// F-123 — comprovante de exibição permanente (resumo diário) e históricos técnicos com prazo.
const sql = readFileSync(path.join(process.cwd(), 'supabase/migrations/20261289_historico_exibicoes_e_retencao.sql'), 'utf8').replace(/\r\n/g, '\n');

describe('Histórico de exibições e retenção (F-123)', () => {
  it('a faxina resume ANTES de apagar, na mesma operação (não perde nem conta em dobro)', () => {
    expect(sql).toContain('WITH apagadas AS (\n    DELETE FROM public.playback_logs\n     WHERE started_at < now() - interval \'20 days\'\n    RETURNING');
    expect(sql).toContain('ON CONFLICT (dia, screen_id, media_id) DO UPDATE');
    expect(sql).toContain('SET exibicoes = e.exibicoes + EXCLUDED.exibicoes,');
    expect(sql).toContain("(a.started_at AT TIME ZONE 'America/Sao_Paulo')::date AS dia");
  });

  it('relatórios somam linhas recentes + resumo; por hora usa só as linhas recentes', () => {
    expect(sql.match(/FROM public\.exibicoes_diarias ed/g)).toHaveLength(2);
    expect(sql).toContain("WHERE p_bucket IS DISTINCT FROM 'hour'");
    expect(sql).toContain('SELECT x.screen_id, sum(x.total)::bigint AS total, max(x.last_at) AS last_at');
  });

  it('resumo: lê quem já pode ler as exibições da tela; ninguém grava pelo painel; faxina só pelo servidor', () => {
    expect(sql).toContain('ALTER TABLE public.exibicoes_diarias ENABLE ROW LEVEL SECURITY;');
    expect(sql).toContain('FOR SELECT TO authenticated USING (public.fn_player_can_access_screen_text(screen_id));');
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.exibicoes_diarias FROM authenticated;');
    expect(sql.match(/CREATE POLICY/g)).toHaveLength(1);
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.delete_old_logs() FROM PUBLIC, anon, authenticated;');
  });

  it('históricos técnicos têm prazo; falha ao limpar o histórico das rotinas não impede a faxina', () => {
    expect(sql).toContain("DELETE FROM public.player_heartbeats WHERE ping_at < now() - interval '15 days';");
    expect(sql).toContain("DELETE FROM public.device_telemetry WHERE recorded_at < now() - interval '30 days';");
    expect(sql).toContain("DELETE FROM cron.job_run_details WHERE end_time < now() - interval '14 days';");
    expect(sql).toContain('EXCEPTION WHEN OTHERS THEN');
    // auditoria e segurança não são apagadas
    expect(sql).not.toMatch(/DELETE FROM public\.(auditoria_logs|security_logs|financeiro_auditoria)/);
  });

  it('índices repetidos saem; os que os relatórios usam ficam', () => {
    expect(sql.match(/DROP INDEX IF EXISTS/g)).toHaveLength(5);
    for (const fica of ['idx_playback_logs_started;', 'idx_playback_logs_screen_date;', 'idx_pbl_player', 'idx_pbl_agend']) {
      expect(sql).not.toContain('DROP INDEX IF EXISTS public.' + fica);
    }
  });
});
