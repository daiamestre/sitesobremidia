-- ==============================================================================
-- FASE 002-B: CORPORATE AUTH FOUNDATION & OWNER GOVERNANCE
-- ==============================================================================
-- 1. ESTRUTURA ORGANIZACIONAL (ORGANIZATIONS)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    cnpj TEXT UNIQUE,
    status TEXT DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- 2. HIERARQUIA CORPORATIVA: ROLES, DEPARTMENTS E PERMISSIONS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(organization_id, name)
);

CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE, -- ex: 'users.create', 'contracts.view'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (role_id, permission_id)
);

-- Compatibilidade e expansão em usuarios
DO $$ 
BEGIN 
    -- Adicionar colunas se não existirem
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'organization_id') THEN
        ALTER TABLE public.usuarios ADD COLUMN organization_id UUID REFERENCES public.organizations(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'department_id') THEN
        ALTER TABLE public.usuarios ADD COLUMN department_id UUID REFERENCES public.departments(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'role_id') THEN
        ALTER TABLE public.usuarios ADD COLUMN role_id UUID REFERENCES public.roles(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'is_owner') THEN
        ALTER TABLE public.usuarios ADD COLUMN is_owner BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'owner_locked') THEN
        ALTER TABLE public.usuarios ADD COLUMN owner_locked BOOLEAN DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'usuarios' AND column_name = 'status') THEN
        ALTER TABLE public.usuarios ADD COLUMN status TEXT DEFAULT 'ACTIVE';
    END IF;
END $$;

-- ==============================================================================
-- 3. CÉREBRO DA POSSE: SYSTEM_OWNERSHIP
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.system_ownership (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
    owner_user_id UUID NOT NULL REFERENCES public.usuarios(id) ON DELETE RESTRICT,
    locked BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    UNIQUE(organization_id, owner_user_id)
);

-- ==============================================================================
-- 4. PROTEÇÃO DO OWNER (TRIGGERS ABSOLUTAS)
-- ==============================================================================

-- 4.1 Impedir DELETE do OWNER na tabela usuarios
CREATE OR REPLACE FUNCTION prevent_owner_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.owner_locked = true THEN
        RAISE EXCEPTION 'Acesso Negado: Impossível excluir a conta OWNER do sistema.';
    END IF;
    
    -- Checa também pelo registro no system_ownership para dupla segurança
    IF EXISTS (SELECT 1 FROM public.system_ownership WHERE owner_user_id = OLD.id) THEN
        RAISE EXCEPTION 'Acesso Negado: Usuário está atrelado a system_ownership e não pode ser excluído.';
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_owner_deletion ON public.usuarios;
CREATE TRIGGER trigger_prevent_owner_deletion
BEFORE DELETE ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION prevent_owner_deletion();


-- 4.2 Impedir UPDATE de campos sensíveis do OWNER na tabela usuarios
CREATE OR REPLACE FUNCTION prevent_owner_downgrade()
RETURNS TRIGGER AS $$
BEGIN
    -- Só protege se a conta já era protegida (owner_locked = true)
    IF OLD.owner_locked = true THEN
        -- Proteção 1: Não pode remover a flag de owner
        IF NEW.is_owner = false THEN
            RAISE EXCEPTION 'Acesso Negado: Não é possível remover o status de OWNER desta conta.';
        END IF;

        -- Proteção 2: Não pode remover o lock
        IF NEW.owner_locked = false THEN
            RAISE EXCEPTION 'Acesso Negado: Não é possível desbloquear as proteções da conta OWNER.';
        END IF;

        -- Proteção 3: Não pode inativar ou bloquear
        IF NEW.ativo = false OR NEW.status != 'ACTIVE' THEN
            RAISE EXCEPTION 'Acesso Negado: Impossível suspender, bloquear ou inativar a conta OWNER.';
        END IF;

        -- Proteção 4: Não pode alterar a role (a menos que seja para mantê-la ou atualizá-la via processo raiz autorizado, mas em regra rejeitamos rebaixamento)
        -- Aqui permitimos mudar role_id SE o novo role_id for de OWNER também, mas por segurança, bloqueamos alteração geral:
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
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_owner_downgrade ON public.usuarios;
CREATE TRIGGER trigger_prevent_owner_downgrade
BEFORE UPDATE ON public.usuarios
FOR EACH ROW
EXECUTE FUNCTION prevent_owner_downgrade();


-- 4.3 Impedir violação direta na tabela system_ownership (Ataque de Impersonação)
CREATE OR REPLACE FUNCTION prevent_system_ownership_tampering()
RETURNS TRIGGER AS $$
BEGIN
    -- Impede DELETE de um ownership lockado
    IF TG_OP = 'DELETE' THEN
        IF OLD.locked = true THEN
            RAISE EXCEPTION 'Acesso Negado: Impossível remover o registro de posse do sistema (SYSTEM OWNERSHIP LOCKED).';
        END IF;
        RETURN OLD;
    END IF;

    -- Impede UPDATE de campos sensíveis de um ownership lockado
    IF TG_OP = 'UPDATE' THEN
        IF OLD.locked = true THEN
            -- Impede destrancar
            IF NEW.locked = false THEN
                RAISE EXCEPTION 'Acesso Negado: Impossível remover a trava do registro de posse do sistema.';
            END IF;
            
            -- Impede trocar de dono
            IF NEW.owner_user_id IS DISTINCT FROM OLD.owner_user_id THEN
                RAISE EXCEPTION 'Acesso Negado: Impossível transferir a posse do sistema (SYSTEM OWNERSHIP LOCKED).';
            END IF;
            
            -- Impede trocar de organização
            IF NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
                RAISE EXCEPTION 'Acesso Negado: Impossível transferir a organização do sistema (SYSTEM OWNERSHIP LOCKED).';
            END IF;
        END IF;
        RETURN NEW;
    END IF;
    
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prevent_system_ownership_tampering ON public.system_ownership;
CREATE TRIGGER trigger_prevent_system_ownership_tampering
BEFORE UPDATE OR DELETE ON public.system_ownership
FOR EACH ROW
EXECUTE FUNCTION prevent_system_ownership_tampering();

-- ==============================================================================
-- 5. CONFIGURAÇÃO INICIAL (SEEDING) DO OWNER jairaniran2@gmail.com
-- ==============================================================================
DO $$
DECLARE
    v_user_id UUID;
    v_org_id UUID;
    v_role_id UUID;
BEGIN
    -- 1. Cria a organização base
    INSERT INTO public.organizations (name, status)
    VALUES ('SOBRE MIDIA PRINCIPAL', 'ACTIVE')
    ON CONFLICT (cnpj) DO NOTHING 
    RETURNING id INTO v_org_id;

    IF v_org_id IS NULL THEN
        SELECT id INTO v_org_id FROM public.organizations WHERE name = 'SOBRE MIDIA PRINCIPAL' LIMIT 1;
    END IF;

    -- 2. Cria a Role OWNER
    INSERT INTO public.roles (name, description)
    VALUES ('OWNER', 'Proprietário Absoluto do Sistema')
    ON CONFLICT (name) DO NOTHING
    RETURNING id INTO v_role_id;

    IF v_role_id IS NULL THEN
        SELECT id INTO v_role_id FROM public.roles WHERE name = 'OWNER' LIMIT 1;
    END IF;

    -- 3. Localiza o usuário alvo
    SELECT id INTO v_user_id FROM public.usuarios WHERE email = 'jairaniran2@gmail.com' LIMIT 1;

    IF v_user_id IS NOT NULL THEN
        -- 4. Atualiza a tabela usuarios
        UPDATE public.usuarios 
        SET is_owner = true,
            owner_locked = true,
            ativo = true,
            status = 'ACTIVE',
            role_id = v_role_id,
            organization_id = v_org_id
        WHERE id = v_user_id;

        -- 5. Cria o vínculo em system_ownership
        INSERT INTO public.system_ownership (organization_id, owner_user_id, locked)
        VALUES (v_org_id, v_user_id, true)
        ON CONFLICT (organization_id, owner_user_id) DO NOTHING;
    END IF;
END $$;
