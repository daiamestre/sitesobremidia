import fs from 'fs';
import path from 'path';
import os from 'os';

async function fixTelemetryTable() {
    const tokenFile = path.join(os.tmpdir(), 'sb_token2.tmp');
    const token = fs.readFileSync(tokenFile, 'utf-8').trim();

    const sql = `
    -- 1. DROP NOT NULL CONSTRAINTS ON player_heartbeats
    ALTER TABLE public.player_heartbeats ALTER COLUMN player_id DROP NOT NULL;
    ALTER TABLE public.player_heartbeats ALTER COLUMN empresa_operadora_id DROP NOT NULL;

    -- 2. MAKE fn_player_report_telemetry ROBUST
    CREATE OR REPLACE FUNCTION public.fn_player_report_telemetry(
      p_screen_id uuid,
      p_cpu_usage numeric DEFAULT NULL,
      p_memory_usage numeric DEFAULT NULL,
      p_temp_celsius numeric DEFAULT NULL,
      p_storage_free_mb bigint DEFAULT NULL,
      p_versao_app text DEFAULT NULL,
      p_ip_address text DEFAULT NULL
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
    DECLARE
      v_uid uuid := auth.uid();
      v_screen public.screens%ROWTYPE;
      v_player uuid;
      v_tenant uuid;
    BEGIN
      SELECT * INTO v_screen FROM public.screens WHERE id = p_screen_id LIMIT 1;
      IF v_screen.id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'screen_not_found');
      END IF;

      -- Update last ping and metrics directly on screens
      UPDATE public.screens 
      SET last_ping_at = now(),
          last_ip = COALESCE(p_ip_address, last_ip)
      WHERE id = p_screen_id;

      -- Insert into heartbeats safely
      BEGIN
        INSERT INTO public.player_heartbeats (
          screen_id, ip_address,
          cpu_usage, memory_usage, temp_celsius, storage_free_mb,
          versao_app, status_ping, ping_at
        ) VALUES (
          p_screen_id, p_ip_address,
          p_cpu_usage, p_memory_usage, p_temp_celsius, p_storage_free_mb,
          p_versao_app, 'ONLINE', now()
        );
      EXCEPTION WHEN OTHERS THEN
        -- Non critical log failure
        NULL;
      END;

      RETURN jsonb_build_object('ok', true);
    END;
    $$;

    GRANT EXECUTE ON FUNCTION public.fn_player_report_telemetry(uuid, numeric, numeric, numeric, bigint, text, text) TO anon, authenticated, service_role;
    NOTIFY pgrst, 'reload schema';
    `;

    console.log('[+] Fixing telemetry table and RPC in DB...');
    const res = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
    });

    console.log('Status:', res.status, await res.text());
}

fixTelemetryTable().catch(console.error);
