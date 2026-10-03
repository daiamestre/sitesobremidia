import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

// F-126 a F-131 — segurança global: visões, perfis externos, funções abertas, arquivos, senhas e chaves.
const raiz = process.cwd();
const ler = (arquivo: string) => readFileSync(path.join(raiz, arquivo), 'utf8').replace(/\r\n/g, '\n');
const migracao = (nome: string) => ler(`supabase/migrations/${nome}`);

describe('Visões respeitam a empresa (F-126)', () => {
  const sql = migracao('20261292_visoes_respeitam_empresa.sql');
  it('as 9 visões apontadas passam a seguir a regra de acesso de quem consulta', () => {
    for (const v of ['vw_cobranca_completa', 'v_dre_consolidado', 'vw_industrial_monitoring', 'vw_media_popularity', 'vw_daily_stats', 'dw_dim_player', 'dw_dim_campanha', 'dw_fact_exibicao', 'vw_encartes_publicos']) {
      expect(sql).toMatch(new RegExp(`ALTER VIEW public\\.${v}\\s+SET \\(security_invoker = true\\);`));
    }
  });
  it('visitante anônimo não acessa visões de gestão; nada de permissão nova', () => {
    expect(sql).toContain("EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', v);");
    expect(sql).toContain('REVOKE ALL ON public.mv_daily_stats FROM PUBLIC, anon, authenticated;');
    expect(sql).not.toMatch(/\bGRANT\b/);
  });
});

describe('Perfis externos isolados (F-127)', () => {
  const sql = migracao('20261293_perfis_externos_isolados.sql');
  it('externo = ANUNCIANTE, CLIENTE, PARCEIRO (dono nunca é externo)', () => {
    expect(sql).toContain("IN ('ANUNCIANTE', 'CLIENTE', 'PARCEIRO'));");
    expect(sql).toContain('AND NOT coalesce(u.is_owner, false)');
  });
  it('só regras restritivas nas tabelas internas e comerciais (não libera nada novo)', () => {
    for (const t of ['financeiro_auditoria', 'fluxo_caixa', 'system_events', 'noc_alerts', 'jobs', 'representantes']) expect(sql).toContain(`'${t}'`);
    expect(sql).toContain('AS RESTRICTIVE FOR ALL TO public USING (NOT public.fn_perfil_cliente_externo())');
    expect(sql).toContain('cliente_id = public.get_user_cliente_id()');
    expect(sql.match(/AS RESTRICTIVE/g)!.length).toBeGreaterThanOrEqual(8);
  });
  it('usuários: cada empresa só vê os próprios; externo só a própria equipe', () => {
    expect(sql).toContain('CREATE POLICY usuarios_so_da_propria_empresa ON public.usuarios AS RESTRICTIVE FOR SELECT');
    expect(sql).toContain('AND empresa_operadora_id = public.get_user_tenant_id())');
    expect(sql).not.toContain('fn_usuario_dono_da_plataforma');
  });
  it('auditoria de contratos deixa de ser "true"; comando remoto só em tela própria; auditoria só de acréscimo', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS p_read_contrato_auditoria ON public.contrato_auditoria;');
    expect(sql).not.toMatch(/contrato_auditoria[^;]*USING \(true\)/);
    expect(sql).toContain('CREATE POLICY comando_so_tela_propria ON public.remote_commands AS RESTRICTIVE FOR INSERT');
    expect(sql).toContain('REVOKE UPDATE, DELETE, TRUNCATE ON public.financeiro_auditoria, public.auditoria_logs, public.contrato_auditoria,');
  });
});

describe('Funções sem acesso anônimo (F-129)', () => {
  const sql = migracao('20261294_funcoes_sem_acesso_anonimo.sql');
  it('funções do painel perdem o anônimo; funções só do servidor perdem também o usuário logado', () => {
    expect(sql).toContain("EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.assinatura);");
    expect(sql).toContain("EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f.assinatura);");
    for (const f of ['purge_old_logs', 'gerar_cobrancas_recorrentes', 'rpc_generate_monthly_billing', 'buscar_conta_por_documento']) expect(sql).toContain(`'${f}'`);
  });
  it('funções públicas de propósito não entram na lista (pareamento, cobrança pública, Player)', () => {
    for (const f of ['fn_request_pairing_code', 'fn_check_pairing_status', 'rpc_get_public_billing', 'get_player_playlist_for_screen', 'fn_player_report_telemetry', 'pulse_screen']) {
      expect(sql).not.toContain(`'${f}'`);
    }
  });
  it('criar cobrança/tela e régua de cobrança conferem quem chama; rotina agendada continua passando', () => {
    expect(sql.match(/-- F-129:/g)).toHaveLength(3);
    expect(sql).toContain("IF auth.uid() IS NOT NULL AND coalesce(auth.role(), '') <> 'service_role' THEN");
    expect(sql).toContain('p_empresa_operadora_id IS DISTINCT FROM public.get_user_empresa_operadora_id(auth.uid())');
  });
});

describe('Arquivos, caminho de busca e senhas (F-130/F-131)', () => {
  const sql = migracao('20261295_arquivos_e_caminho_de_busca.sql');
  it('media: só o dono do arquivo ou a gestão altera/apaga; anônimo não envia comprovante', () => {
    expect(sql).toContain("USING (bucket_id = 'media' AND (owner = auth.uid() OR public.fn_eh_owner_ou_admin()));");
    expect(sql).toContain('DROP POLICY IF EXISTS "Enable upload for valid screens" ON storage.objects;');
    expect(sql).toContain("ALTER FUNCTION %s SET search_path TO public, extensions, pg_temp");
  });
  it('senha nova com no mínimo 8 caracteres; login continua aceitando as antigas', () => {
    const auth = ler('src/pages/Auth.tsx');
    expect(auth).toContain("password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),\n});\n\nconst signUpSchema");
    expect(auth).toContain("password: z.string().min(8, 'Senha deve ter pelo menos 8 caracteres'),");
    expect(ler('src/pages/ResetPassword.tsx')).toContain('if (newPassword.length < 8) {');
    expect(ler('supabase/functions/handle-password-reset/index.ts')).toContain('if (newPassword.length < 8) {');
  });
  it('site publica cabeçalhos de segurança', () => {
    const cab = JSON.parse(ler('vercel.json')).headers[0].headers.map((h: { key: string }) => h.key);
    expect(cab).toEqual(expect.arrayContaining(['X-Content-Type-Options', 'X-Frame-Options', 'Referrer-Policy', 'Permissions-Policy']));
  });
});

describe('Nenhuma chave de acesso em arquivo do repositório (F-131)', () => {
  const PADROES = [/sbp_[0-9a-f]{40}/, /vc[pk]_[A-Za-z0-9]{40,}/, /sb_secret_[A-Za-z0-9_-]{20,}/, /gh[pousr]_[A-Za-z0-9]{36,}/, /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/];
  it('arquivos rastreados pelo git não contêm chave de gestão, de deploy nem chave privada', () => {
    const rastreados = execSync('git ls-files', { cwd: raiz, maxBuffer: 1 << 26 }).toString().split('\n')
      .filter((f) => f && !/\.(png|jpe?g|webp|gif|ico|apk|ttf|woff2?|mp4|pdf|zip|jar|lock)$/i.test(f) && !f.startsWith('node_modules/'));
    const achados: string[] = [];
    for (const f of rastreados) {
      let texto = '';
      try { if (statSync(path.join(raiz, f)).size > 3_000_000) continue; texto = readFileSync(path.join(raiz, f), 'utf8'); } catch { continue; }
      if (PADROES.some((p) => p.test(texto))) achados.push(f);
    }
    expect(achados).toEqual([]);
  }, 60_000);
  it('chave de serviço (service_role) nunca aparece no código do site nem do Player', () => {
    const olhar = (dir: string, achados: string[]) => {
      for (const nome of readdirSync(path.join(raiz, dir))) {
        if (['node_modules', 'build', '.gradle', 'tests'].includes(nome)) continue;
        const rel = `${dir}/${nome}`;
        const st = statSync(path.join(raiz, rel));
        if (st.isDirectory()) olhar(rel, achados);
        else if (/\.(ts|tsx|js|kt|xml|properties)$/.test(nome) && st.size < 2_000_000) {
          const m = readFileSync(path.join(raiz, rel), 'utf8').match(/eyJ[A-Za-z0-9_-]{15,}\.([A-Za-z0-9_-]{20,})\.[A-Za-z0-9_-]{10,}/g) || [];
          for (const jwt of m) {
            try { if (JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role === 'service_role') achados.push(rel); } catch { /* não é JWT */ }
          }
        }
      }
    };
    const achados: string[] = [];
    olhar('src', achados); olhar('api', achados); olhar('native-android-player', achados);
    expect(achados).toEqual([]);
  }, 60_000);
  it('rascunhos locais ficam fora do git e o cofre vence variável antiga do Windows', () => {
    const ignore = ler('.gitignore');
    expect(ignore).toContain('\nscratch/\n');
    expect(ignore).toContain('\ntokens.env\n');
    expect(ler('scripts/ops/segredos.mjs')).toContain("if (m && m[2]) process.env[m[1]] = m[2]");
  });
});
