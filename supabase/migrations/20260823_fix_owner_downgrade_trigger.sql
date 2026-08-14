-- ============================================================
-- MIGRATION 20260823 — Correção do trigger prevent_owner_downgrade
-- SOBRE MÍDIA ERP
--
-- Bug pré-existente: o trigger disparava a proteção "remover status
-- de OWNER" para QUALQUER UPDATE em linhas com owner_locked=true,
-- mesmo quando a conta NÃO era owner (is_owner=false). Isso impedia
-- a gestão de usuários comuns (ex.: desativar um representante).
--
-- Correção: todas as proteções de downgrade passam a ser condicionadas
-- a OLD.is_owner = true (a conta realmente é OWNER). O bloqueio de
-- desbloqueio permanece para contas owner com owner_locked=true.
--
-- Idempotente: seguro para reexecução.
-- ============================================================

CREATE OR REPLACE FUNCTION public.prevent_owner_downgrade()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    -- Protege apenas contas que JÁ SÃO OWNER (não dispara em contas comuns,
    -- mesmo que possuam owner_locked residual = true)
    IF OLD.is_owner = true THEN
        -- Proteção 1: Não pode remover a flag de owner
        IF NEW.is_owner = false THEN
            RAISE EXCEPTION 'Acesso Negado: Não é possível remover o status de OWNER desta conta.';
        END IF;

        -- Proteção 2: Não pode remover o lock
        IF OLD.owner_locked = true AND NEW.owner_locked = false THEN
            RAISE EXCEPTION 'Acesso Negado: Não é possível desbloquear as proteções da conta OWNER.';
        END IF;

        -- Proteção 3: Não pode inativar ou bloquear
        IF NEW.ativo = false OR NEW.status != 'ACTIVE' THEN
            RAISE EXCEPTION 'Acesso Negado: Impossível suspender, bloquear ou inativar a conta OWNER.';
        END IF;

        -- Proteção 4: Não pode alterar o role_id
        IF NEW.role_id IS DISTINCT FROM OLD.role_id THEN
            RAISE EXCEPTION 'Acesso Negado: Impossível alterar o role_id da conta OWNER.';
        END IF;

        -- Proteção 5: Não pode trocar de organização
        IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
            RAISE EXCEPTION 'Acesso Negado: Impossível alterar a organization_id da conta OWNER.';
        END IF;

        -- Proteção 6: Não pode trocar de departamento
        IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
            RAISE EXCEPTION 'Acesso Negado: Impossível alterar o department_id da conta OWNER.';
        END IF;

        -- Proteção 7: Não pode alterar o email
        IF NEW.email IS DISTINCT FROM OLD.email THEN
            RAISE EXCEPTION 'Acesso Negado: Impossível alterar o email da conta OWNER.';
        END IF;
    END IF;

    RETURN NEW;
END;
$function$;
