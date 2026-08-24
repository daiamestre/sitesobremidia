import fs from 'fs'; import os from 'os'; import path from 'path'; import crypto from 'crypto';
const token = fs.readFileSync(path.join(os.tmpdir(), 'sb_token2.tmp'), 'utf8').trim();
const secret = crypto.randomBytes(24).toString('hex');

// 1) Registrar secret nas Edge Functions
const r1 = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/secrets', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify([{ name: 'BILLING_WORKER_SECRET', value: secret }])
});
console.log('secrets API:', r1.status);

// 2) Guardar no vault para o trigger pg_net despachar jobs
const q = async (query) => {
  const res = await fetch('https://api.supabase.com/v1/projects/bhwsybgsyvvhqtkdqozb/database/query', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const t = await res.text();
  return res.ok ? t : `ERRO ${res.status}: ${t.slice(0,200)}`;
};
console.log('vault upsert:', await q(`SELECT vault.create_secret('${secret}', 'BILLING_WORKER_SECRET')`));

// 3) Trigger de dispatch COLECTION_* → billing-worker
console.log(await q(`
CREATE OR REPLACE FUNCTION public.trg_dispatch_billing_job()
RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
DECLARE v_url TEXT; v_secret TEXT;
BEGIN
  IF NEW.status = 'PENDING' AND NEW.tipo_job LIKE 'COLECTION%' THEN
    SELECT decrypted_secret INTO v_secret FROM vault.decrypted_secrets WHERE name = 'BILLING_WORKER_SECRET' LIMIT 1;
    SELECT value INTO v_url FROM vault.decrypted_secrets WHERE name = 'SUPABASE_URL' OR name = '_url' LIMIT 1;
    IF v_url IS NULL THEN v_url := 'https://bhwsybgsyvvhqtkdqozb.supabase.co'; END IF;
    IF v_secret IS NOT NULL THEN
      PERFORM net.http_post(
        url := v_url || '/functions/v1/billing-worker',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_secret),
        body := jsonb_build_object('job_id', NEW.id)
      );
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'dispatch falhou: %', SQLERRM;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_jobs_dispatch ON public.jobs;
CREATE TRIGGER trg_jobs_dispatch
  AFTER INSERT ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.trg_dispatch_billing_job();
`));
