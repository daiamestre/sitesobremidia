import fs from 'fs';
import { execSync } from 'child_process';
import crypto from 'crypto';
import path from 'path';

// Gerar identidade efêmera e segura para o teste
const E2E_TENANT_ID = '22345678-1234-1234-1234-123456789012';
const E2E_USER_ID = '12345678-1234-1234-1234-123456789012';
const E2E_EMAIL = `e2e-owner-${Date.now()}@sobremidia-e2e.local`;
const E2E_PASSWORD = crypto.randomBytes(16).toString('hex');

// Gravar credenciais localmente para uso EXCLUSIVO do Playwright
// Este arquivo será lido pelo playwright.config.ts
fs.writeFileSync('.env.e2e.local', `TEST_USER_EMAIL=${E2E_EMAIL}\nTEST_USER_PASSWORD=${E2E_PASSWORD}\n`);
console.log(`[E2E Bootstrap] Credentials generated for ephemeral user: ${E2E_EMAIL}`);

// Gerar SQL seguro para provisionamento administrativo sem expor Service Role Key
const sql = `
DO $$
DECLARE
    new_user_id uuid := '${E2E_USER_ID}';
    v_tenant_id uuid := '${E2E_TENANT_ID}';
BEGIN
    -- Provisiona o usuário E2E na auth.users
    IF EXISTS (SELECT 1 FROM auth.users WHERE id = new_user_id) THEN
        UPDATE auth.users SET 
            email = '${E2E_EMAIL}',
            encrypted_password = crypt('${E2E_PASSWORD}', gen_salt('bf'))
        WHERE id = new_user_id;
    ELSE
        INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
        VALUES (
            new_user_id,
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            '${E2E_EMAIL}',
            crypt('${E2E_PASSWORD}', gen_salt('bf')),
            now(),
            now(),
            now(),
            '{"provider":"email","providers":["email"]}',
            '{}',
            now(),
            now(),
            '',
            '',
            '',
            ''
        );
    END IF;
    
    -- Provisiona o Tenant isolado
    INSERT INTO public.empresa_operadora (id, nome, nome_fantasia, cnpj, status, email, telefone)
    VALUES (v_tenant_id, 'E2E Tenant Automático', 'E2E Test', '00000000000191', 'ACTIVE', '${E2E_EMAIL}', '11999999999')
    ON CONFLICT (id) DO UPDATE SET status = 'ACTIVE', email = '${E2E_EMAIL}';

    -- Atualiza ou insere o perfil público, garantindo que o status seja ACTIVE/APPROVED
    IF EXISTS (SELECT 1 FROM public.usuarios WHERE id = new_user_id) THEN
        UPDATE public.usuarios SET status = 'ACTIVE', ativo = true, empresa_operadora_id = v_tenant_id, email = '${E2E_EMAIL}', perfil_id = v_perfil_id WHERE id = new_user_id;
    ELSE
        INSERT INTO public.usuarios (id, empresa_operadora_id, email, nome, ativo, is_owner, status, perfil_id)
        VALUES (new_user_id, v_tenant_id, '${E2E_EMAIL}', 'OWNER', true, true, 'ACTIVE', v_perfil_id);
    END IF;

    -- Provisiona o Representante Comercial para permitir Wizard
    IF NOT EXISTS (SELECT 1 FROM public.representantes WHERE usuario_id = new_user_id) THEN
        INSERT INTO public.representantes (empresa_operadora_id, usuario_id, cpf_cnpj)
        VALUES (v_tenant_id, new_user_id, '00000000000');
    END IF;
END $$;
`;

const tempSqlFile = path.resolve('scripts/e2e/temp_bootstrap.sql');
fs.writeFileSync(tempSqlFile, sql);

console.log('[E2E Bootstrap] Executing remote provisioning via Supabase CLI (autenticação segura do desenvolvedor)...');
try {
    // Usando CLI auth session (sem requerer .env secrets) para aplicar no projeto LINKED
    execSync(`cmd.exe /c "npx supabase db query --linked < scripts\\\\e2e\\\\temp_bootstrap.sql"`, { stdio: 'inherit' });
    console.log('[E2E Bootstrap] Provisionamento Concluído com Sucesso!');
} catch (error) {
    console.error('[E2E Bootstrap] Falha no provisionamento autônomo:', error.message);
    process.exit(1);
} finally {
    if (fs.existsSync(tempSqlFile)) {
        fs.unlinkSync(tempSqlFile);
    }
}
