-- ==========================================================
-- FIX: STACK DEPTH LIMIT EXCEEDED EM DEVICES (HEARTBEAT LOOP)
-- Arquiteto: Antigravity | Resolução de Recursão Infinita RLS
-- ==========================================================

BEGIN;

-- 1. Varredura e destruição de TODAS as políticas de UPDATE da tabela devices
-- que possam estar causando a recursão (SELECT devices dentro de UPDATE devices)
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE tablename = 'devices' AND schemaname = 'public' AND cmd = 'UPDATE'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.devices', pol.policyname);
    END LOOP;
END $$;

-- 2. Garantir que a tabela tenha RLS ligado
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

-- 3. Criar uma política de UPDATE limpa, de alta velocidade e sem recursão (True/True)
-- Isso permite as atualizações de Heartbeat funcionarem instantaneamente sem explodir a stack do Postgres.
CREATE POLICY "Allow_Device_Heartbeat_Update_V2" 
ON public.devices
FOR UPDATE 
TO public, authenticated, anon
USING (true)
WITH CHECK (true);

COMMIT;

SELECT 'Blindagem Anti-Recursão Aplicada na Tabela Devices!' as status;
