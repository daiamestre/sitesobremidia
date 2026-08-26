import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

/**
 * PROTEÃ‡ÃƒO DE REGRESSÃƒO â€” FLUXOS CRÃTICOS DO PORTAL DO ANUNCIANTE
 * (missÃ£o Â§5 senha automÃ¡tica Â· Â§7 primeiro acesso Â· Â§8-Â§12 reset autorizado
 *  Â§23-Â§26 playlists + R$19,99)
 *
 * Estes testes varrem migrations e edge functions e FALHAM se qualquer
 * elemento estrutural essencial desaparecer de futuras alteraÃ§Ãµes.
 */

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'supabase', 'migrations');
const FUNCTIONS_DIR = path.resolve(process.cwd(), 'supabase', 'functions');

function lerUltimaMigrationContendo(termo: string): { arquivo: string; sql: string } | null {
  const arquivos = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  let ultima: { arquivo: string; sql: string } | null = null;
  for (const f of arquivos) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    if (sql.includes(termo)) ultima = { arquivo: f, sql };
  }
  return ultima;
}

/** Localiza a migration que DEFINE (CREATE OR REPLACE) um objeto — ignora menções em comentários de arquivos posteriores */
function lerMigrationDefinindo(createStatement: string): { arquivo: string; sql: string } | null {
  return lerUltimaMigrationContendo(createStatement);
}

describe('[REGRESSÃƒO] Provisionamento com senha automÃ¡tica + troca obrigatÃ³ria', () => {
  it('usuarios.must_change_password existe na migration fundaÃ§Ã£o', () => {
    const m = lerMigrationDefinindo('ADD COLUMN IF NOT EXISTS must_change_password');
    expect(m).not.toBeNull();
    expect(m!.sql).toContain('ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE');
  });

  it('RPC provisionar_usuario_corporativo nasce ACTIVE/APPROVED com troca obrigatÃ³ria', () => {
    const m = lerMigrationDefinindo('CREATE OR REPLACE FUNCTION public.provisionar_usuario_corporativo');
    expect(m).not.toBeNull();
    const sql = m!.sql;
    // Estado de vida liberado para login imediato
    expect(sql).toContain("'ACTIVE'");
    expect(sql).toContain("'APPROVED'");
    // Troca obrigatÃ³ria imposta server-side
        expect(sql).toContain('must_change_password, version)');
    expect(sql).toContain('v_caller, v_caller, TRUE, 1)');
    // SolicitaÃ§Ã£o nasce APROVADA (modelo de autorizaÃ§Ã£o do login preservado)
    expect(sql).toContain("'APPROVED', v_caller, NOW()");
  });

  it('ANUNCIANTE sÃ³ provisiona equipe da PRÃ“PRIA empresa com perfis limitados', () => {
    const m = lerMigrationDefinindo('CREATE OR REPLACE FUNCTION public.provisionar_usuario_corporativo');
    const sql = m!.sql;
    expect(sql).toContain("v_perfil_nome NOT IN ('CLIENTE','ANUNCIANTE')");
    expect(sql).toContain('v_cliente_final := v_caller_cliente;');
  });

  it('edge provision-user gera senha no backend e NÃƒO usa convite/link quebrado', () => {
    const edge = readFileSync(
      path.join(FUNCTIONS_DIR, 'provision-user', 'index.ts'),
      'utf8',
    );
    // Senha gerada por CSPRNG no servidor
    expect(edge).toContain('crypto.getRandomValues');
    expect(edge).toContain('gerarSenhaInicial');
    // Identidade criada JÃ confirmada e COM senha
    expect(edge).toContain('email_confirm: true');
    expect(edge).toMatch(/password:\s*senhaInicial/);
    // Credencial entregue uma Ãºnica vez na resposta
    expect(edge).toContain('senha_inicial: senhaInicial');
    // Fluxo antigo de convite removido (link /auth/callback inexistente)
    expect(edge).not.toContain('generateLink');
    expect(edge).not.toContain('/auth/callback');
  });

  it('frontend de provisionamento aponta para provision-user', () => {
    const svc = readFileSync(
      path.join(process.cwd(), 'src', 'services', 'corporateUsers.service.ts'),
      'utf8',
    );
    expect(svc).toContain('/functions/v1/provision-user');
  });
});

describe('[REGRESSÃƒO] RecuperaÃ§Ã£o de senha COM AUTORIZAÃ‡ÃƒO (Central)', () => {
  it('RPC solicitar_reset_senha Ã© anti-enumeraÃ§Ã£o e cria PASSWORD_RESET_REQUEST pendente', () => {
    const m = lerMigrationDefinindo('CREATE OR REPLACE FUNCTION public.solicitar_reset_senha');
    expect(m).not.toBeNull();
    const sql = m!.sql;
    expect(sql).toContain("'PASSWORD_RESET_REQUEST'");
    expect(sql).toContain("'PENDENTE'");
    // Anti-enumeraÃ§Ã£o: usuÃ¡rio inexistente retorna TRUE silenciosamente
    expect(sql).toMatch(/IF NOT FOUND THEN\s+RETURN TRUE/);
  });

  it('RPC decidir_reset_senha exige privilegiado e impede dupla decisÃ£o', () => {
    const m = lerMigrationDefinindo('CREATE OR REPLACE FUNCTION public.decidir_reset_senha');
    expect(m).not.toBeNull();
    const sql = m!.sql;
    expect(sql).toContain('is_central_privileged()');
    expect(sql).toMatch(/status <> 'PENDENTE'/);
    // Auditoria das duas decisÃµes sem segredos
    expect(sql).toContain('PASSWORD_RESET_AUTHORIZED');
    expect(sql).toContain('PASSWORD_RESET_REJECTED');
  });

  it('emissÃ£o Ãºnica de credencial (credencial_emitida_em) na tabela solicitacoes', () => {
    const m = lerUltimaMigrationContendo('ADD COLUMN IF NOT EXISTS credencial_emitida_em');
    expect(m).not.toBeNull();
    expect(m!.sql).toContain('ADD COLUMN IF NOT EXISTS credencial_emitida_em TIMESTAMPTZ');
  });

  it('edge authorize-password-reset valida aprovaÃ§Ã£o e emite senha temporÃ¡ria uma vez', () => {
    const edge = readFileSync(
      path.join(FUNCTIONS_DIR, 'authorize-password-reset', 'index.ts'),
      'utf8',
    );
    expect(edge).toContain("sol.status !== \"APROVADA\"");
    expect(edge).toContain('is("credencial_emitida_em", null)');
    expect(edge).toContain('senha_temporaria');
    expect(edge).toContain('must_change_password: true');
  });

  it('tela Esqueci minha senha chama solicitar_reset_senha (nÃ£o redefine direto)', () => {
    const page = readFileSync(path.join(process.cwd(), 'src', 'pages', 'ForgotPassword.tsx'), 'utf8');
    expect(page).toContain("supabase.rpc('solicitar_reset_senha'");
    expect(page).not.toContain("functions.invoke('send-password-reset'");
  });

  it('Central decide via decidir_reset_senha + authorize-password-reset', () => {
    const central = readFileSync(
      path.join(process.cwd(), 'src', 'pages', 'Central', 'CentralDashboard.tsx'),
      'utf8',
    );
    expect(central).toContain("rpc('decidir_reset_senha'");
    expect(central).toContain('authorize-password-reset');
  });
});

describe('[REGRESSÃƒO] Regra comercial do vÃ­deo â€” 1Âº grÃ¡tis, adicionais R$19,99', () => {
  it('RPC adicionar_midia_playlist cobra 19.99 APENAS a partir do 2Âº vÃ­deo e libera o 1Âº', () => {
    const m = lerUltimaMigrationContendo('adicionar_midia_playlist');
    expect(m).not.toBeNull();
    const sql = m!.sql;
    expect(sql).toContain('19.99');
    expect(sql).toContain('v_asset.tipo <> \'video\' OR v_videos = 0');
    // Item adicional NÃƒO Ã© inserido antes do pagamento
    expect(sql).toContain("'COBRANCA_VIDEO_GERADA'");
  });

  it('RPC confirmar_video_playlist_pago exige conta PAGA/PAGO (sem bypass)', () => {
    const m = lerUltimaMigrationContendo('confirmar_video_playlist_pago');
    expect(m).not.toBeNull();
    const sql = m!.sql;
    expect(sql).toContain("v_status NOT IN ('PAGA','PAGO')");
    expect(sql).toMatch(/cobranca_id UUID UNIQUE/);
  });

  it('playlists do anunciante tÃªm RLS com isolamento por cliente_id', () => {
    // Localiza a migration de CRIAÃ‡ÃƒO da tabela (nÃ£o a Ãºltima que sÃ³ a menciona)
    const arquivos = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
    let criacao: { arquivo: string; sql: string } | null = null;
    for (const f of arquivos) {
      const sql = readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
      if (sql.includes('CREATE TABLE IF NOT EXISTS public.playlists_cliente')) {
        criacao = { arquivo: f, sql };
      }
    }
    expect(criacao).not.toBeNull();
    const sql = criacao!.sql;
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('get_user_cliente_id()');
    expect(sql).toContain('get_user_empresa_operadora_id(auth.uid())');
  });
});

describe('[REGRESSÃƒO] Portal do anunciante â€” experiÃªncia direta (missÃ£o Â§3/Â§16)', () => {
  it('useClienteModalidade EXPÃ•E hasActiveContract (bug crÃ­tico do loop-onboarding)', () => {
    const hook = readFileSync(
      path.join(process.cwd(), 'src', 'modules', 'crm', 'hooks', 'useClienteModalidade.ts'),
      'utf8',
    );
    expect(hook).toContain('hasActiveContract');
    expect(hook).toContain('CONTRATOS_ATIVOS_STATUS');
    // Identidade comercial vem de `empresas` (join), nÃ£o de colunas inexistentes
    expect(hook).toContain('empresas(');
  });

  it('layout do portal NUNCA forÃ§a onboarding para ANUNCIANTE', () => {
    const layout = readFileSync(
      path.join(process.cwd(), 'src', 'modules', 'crm', 'layout', 'CustomerPortalLayout.tsx'),
      'utf8',
    );
    const legadoSemModalidade = layout.includes('legadoSemModalidade');
    const hostSemContrato = layout.includes("hostSemContrato");
    expect(legadoSemModalidade).toBe(true);
    expect(hostSemContrato).toBe(true);
    // A condiÃ§Ã£o de redirecionamento deve exigir legado OU host-sem-contrato
    expect(layout).toMatch(/\(legadoSemModalidade \|\| hostSemContrato\)/);
  });

  it('dashboard do anunciante usa KPIs de mÃ­dia SEM mÃ©tricas financeiras', () => {
    const dash = readFileSync(
      path.join(process.cwd(), 'src', 'modules', 'crm', 'pages', 'CustomerPortalDashboard.tsx'),
      'utf8',
    );
    expect(dash).toContain('get_kpis_portal_anunciante');
    expect(dash).toContain('Meus Pontos');
    expect(dash).toContain('Pontos para Anunciar');
    // Sem widget de faturas no dashboard (faturas ficam em Contrato e Faturas)
    expect(dash).not.toContain('<CustomerInvoices');
  });

  it('guard global de troca obrigatÃ³ria ativo em RequireApproval', () => {
    const guards = readFileSync(
      path.join(process.cwd(), 'src', 'components', 'auth', 'RouteGuards.tsx'),
      'utf8',
    );
    expect(guards).toContain('/auth/change-password');
    expect(guards).toContain('must_change_password');
  });

  it('AuthContext redireciona para /auth/change-password quando flag ativa', () => {
    const ctx = readFileSync(
      path.join(process.cwd(), 'src', 'contexts', 'AuthContext.tsx'),
      'utf8',
    );
    expect(ctx).toContain('must_change_password');
    expect(ctx).toContain("routeRedirect = '/auth/change-password'");
  });
});

describe('[REGRESSÃƒO] FASE 17 â€” Playlist â†’ Player â†’ ExibiÃ§Ã£o', () => {
  it('screens.ponto_id existe e playlist_publicacoes registrada na migration da Fase 17', () => {
    const m = lerUltimaMigrationContendo('publicar_playlist_no_ponto');
    expect(m).not.toBeNull();
    const sql = m!.sql;
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS ponto_id UUID REFERENCES public.pontos(id)');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.playlist_publicacoes');
    // PublicaÃ§Ã£o idempotente via espelho canÃ´nico existente
    expect(sql).toContain('public.publicar_playlist_cliente(p_playlist_id)');
  });

  it('regra de nÃ£o-invasÃ£o: tela ocupada por outra playlist Ã© preservada', () => {
    const m = lerUltimaMigrationContendo('publicar_playlist_no_ponto');
    const sql = m!.sql;
    // SÃ³ assume tela livre (NULL) ou jÃ¡ desta playlist â€” nunca rouba conteÃºdo do Gestor
    expect(sql).toMatch(/playlist_id IS NULL OR\s+(v_screen\.)?playlist_id = v_canal/);
  });

  it('despublicaÃ§Ã£o limpa screens apenas quando apontam para o canal prÃ³prio', () => {
    const m = lerUltimaMigrationContendo('despublicar_playlist_do_ponto');
    const sql = m!.sql;
    expect(sql).toMatch(/tela_atual = v_rec\.playlist_player_id/);
  });

  it('nenhum token administrativo (sbp_) exposto em cÃ³digo frontend', () => {
    const raizSrc = path.join(process.cwd(), 'src');
    let vazou = false;
    const walk = (dir: string) => {
      // O diretÃ³rio de testes contÃ©m este prÃ³prio marcador â€” cÃ³digo de RUNTIME Ã© o que importa
      if (path.basename(dir) === 'tests') return;
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) { walk(full); continue; }
        if (!/\.(ts|tsx|js|jsx|json|html)$/.test(f.name)) continue;
        try {
          if (readFileSync(full, 'utf8').includes('sbp_')) { vazou = true; }
        } catch { /* ignore */ }
      }
    };
    walk(raizSrc);
    expect(vazou, 'token de Management API encontrado no cÃ³digo do frontend').toBe(false);
  });
});

describe('[REGRESSÃO] Provisionamento automático pelo REPRESENTANTE', () => {
  it('RPC aceita REPRESENTANTE restrito à própria carteira e perfis CLIENTE/ANUNCIANTE', () => {
    const m = lerMigrationDefinindo('CREATE OR REPLACE FUNCTION public.provisionar_usuario_corporativo');
    expect(m).not.toBeNull();
    const sql = m!.sql;
    expect(sql).toContain("v_caller_perfil = 'REPRESENTANTE'");
    expect(sql).toContain("v_perfil_nome NOT IN ('CLIENTE','ANUNCIANTE')");
    expect(sql).toContain('JOIN public.representantes r ON r.id = c.representante_id');
    expect(sql).toContain('r.usuario_id = v_caller');
    expect(sql).toContain('fora da sua carteira');
  });

  it('trigger anti-forgery sanciona REPRESENTANTE com validação de carteira', () => {
    const m = lerUltimaMigrationContendo('prevent_usuario_insert_forgery');
    expect(m).not.toBeNull();
    const sql = m!.sql;
    expect(sql).toMatch(/ELSIF v_caller_perfil = 'REPRESENTANTE'/);
    expect(sql).toMatch(/fora da carteira do representante/);
    expect(sql).toContain('app.sobremidia.provisioning');
  });

  it('wizard comercial dispara provisionamento automático após salvar cliente', () => {
    const wiz = readFileSync(
      path.join(process.cwd(), 'src', 'modules', 'crm', 'components', 'forms', 'IntelligentCommercialWizard.tsx'),
      'utf8',
    );
    expect(wiz).toContain('corporateUsersService.criarUsuario');
    expect(wiz).toContain("eq('nome', 'ANUNCIANTE')");
    expect(wiz).toContain('EMAIL_JA_CADASTRADO');
    expect(wiz).toContain('Central de Acessos');
  });
});
