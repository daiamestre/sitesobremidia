import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CentralService } from '@/services/central.service';

// ─── Testes: CentralService — Central de Comunicação & Inteligência ─────────

const db = vi.hoisted(() => {
  const state = {
    responses: {} as Record<string, { data?: any; error?: any; count?: number; single?: any; maybeSingle?: any }>,
    queries: [] as Array<{ table: string; ops: string[] }>,
    currentUser: null as Record<string, any> | null,
  };

  const makeUser = (id: string) => ({
    id,
    aud: 'authenticated',
    email: '',
    app_metadata: {},
    user_metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
  });

  const makeChain = (table: string) => {
    const q = { table, ops: [] as string[] };
    state.queries.push(q);
    const chain: Record<string, any> = {
      select: vi.fn((...args: any[]) => { q.ops.push(`select:${String(args[0])}`); return chain; }),
      insert: vi.fn((...args: any[]) => { q.ops.push(`insert:${JSON.stringify(args[0])}`); return chain; }),
      update: vi.fn((...args: any[]) => { q.ops.push(`update:${JSON.stringify(args[0])}`); return chain; }),
      eq: vi.fn((...args: any[]) => { q.ops.push(`eq:${args[0]}:${args[1]}`); return chain; }),
      order: vi.fn((...args: any[]) => { q.ops.push(`order:${args[0]}:${args[1]}`); return chain; }),
      range: vi.fn((...args: any[]) => { q.ops.push(`range:${args[0]}-${args[1]}`); return chain; }),
      limit: vi.fn((...args: any[]) => { q.ops.push(`limit:${args[0]}`); return chain; }),
      single: vi.fn(() => Promise.resolve(state.responses[table]?.single ?? { data: null, error: null })),
      maybeSingle: vi.fn(() => Promise.resolve(state.responses[table]?.maybeSingle ?? { data: null, error: null })),
      then: (resolve: (value: any) => any) => resolve(state.responses[table] ?? { data: [], error: null }),
    };
    return chain;
  };

  const supabaseStub = {
    from: vi.fn((table: string) => makeChain(table)),
    rpc: vi.fn(),
    channel: vi.fn(),
    removeChannel: vi.fn(),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: state.currentUser }, error: null })),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  };

  return { state, makeUser, supabaseStub };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: db.supabaseStub,
}));

describe('CentralService', () => {
  let service: CentralService;
  let responses: typeof db.state.responses;
  let queries: typeof db.state.queries;

  beforeEach(() => {
    service = new CentralService();
    Object.keys(db.state.responses).forEach((key) => delete db.state.responses[key]);
    db.state.queries.length = 0;
    db.state.currentUser = null;
    responses = db.state.responses;
    queries = db.state.queries;
  });

  it('deve ser instanciado corretamente', () => {
    expect(service).toBeInstanceOf(CentralService);
  });

  describe('listarNotificacoes', () => {
    it('deve filtrar por canal IN_APP, ordenar por created_at e retornar lista', async () => {
      responses['notificacoes_central'] = {
        data: [
          { id: 'n-1', titulo: 'Alerta 1', prioridade: 'CRITICO' },
          { id: 'n-2', titulo: 'Info 2', prioridade: 'INFORMATIVO' },
        ],
      };

      const result = await service.listarNotificacoes();

      expect(result).toHaveLength(2);
      expect(result[0].titulo).toBe('Alerta 1');
      const q = queries[0];
      expect(q.table).toBe('notificacoes_central');
      expect(q.ops).toContain('eq:canal:IN_APP');
      expect(q.ops.some((op) => op.startsWith('order:created_at'))).toBe(true);
    });

    it('deve aplicar filtros de prioridade, status e paginação', async () => {
      responses['notificacoes_central'] = { data: [] };

      await service.listarNotificacoes({ prioridade: 'IMPORTANTE', status: 'NAO_LIDA', pagina: 2, itensPorPagina: 25 });

      const q = queries[0];
      expect(q.ops).toContain('eq:prioridade:IMPORTANTE');
      expect(q.ops).toContain('eq:status_notificacao:NAO_LIDA');
      expect(q.ops).toContain('range:25-49');
    });

    it('deve retornar [] em caso de erro sem lançar exceção', async () => {
      responses['notificacoes_central'] = { error: { message: 'fail' } };

      const result = await service.listarNotificacoes();

      expect(result).toEqual([]);
    });
  });

  describe('contarNaoLidas', () => {
    it('deve contar apenas notificações NAO_LIDA do canal IN_APP', async () => {
      responses['notificacoes_central'] = { count: 3, error: null };

      const count = await service.contarNaoLidas();

      expect(count).toBe(3);
      const q = queries[0];
      expect(q.ops).toContain('eq:canal:IN_APP');
      expect(q.ops).toContain('eq:status_notificacao:NAO_LIDA');
    });

    it('deve retornar 0 em caso de erro', async () => {
      responses['notificacoes_central'] = { error: { message: 'fail' } };

      expect(await service.contarNaoLidas()).toBe(0);
    });
  });

  describe('marcarComoLida / marcarTodasComoLidas / resolverNotificacao', () => {
    it('marcarComoLida deve atualizar lida e status_notificacao para LIDA', async () => {
      responses['notificacoes_central'] = { error: null };

      const ok = await service.marcarComoLida('n-1');

      expect(ok).toBe(true);
      const q = queries[0];
      expect(q.ops.some((op) => op.includes('"lida":true') && op.includes('"status_notificacao":"LIDA"'))).toBe(true);
      expect(q.ops).toContain('eq:id:n-1');
    });

    it('marcarTodasComoLidas deve atualizar apenas NAO_LIDA', async () => {
      responses['notificacoes_central'] = { error: null };

      const ok = await service.marcarTodasComoLidas();

      expect(ok).toBe(true);
      const q = queries[0];
      expect(q.ops).toContain('eq:canal:IN_APP');
      expect(q.ops).toContain('eq:status_notificacao:NAO_LIDA');
    });

    it('resolverNotificacao deve gravar resolvida_em e status RESOLVIDA', async () => {
      responses['notificacoes_central'] = { error: null };

      const ok = await service.resolverNotificacao('n-1');

      expect(ok).toBe(true);
      const q = queries[0];
      expect(q.ops.some((op) => op.includes('"status_notificacao":"RESOLVIDA"') && op.includes('resolvida_em'))).toBe(true);
    });

    it('deve retornar false quando a atualização falha', async () => {
      responses['notificacoes_central'] = { error: { message: 'rls denied' } };

      expect(await service.marcarComoLida('n-1')).toBe(false);
    });
  });

  describe('criarNotificacao', () => {
    it('deve persistir protocolo completo com defaults INFORMATIVO/INFO/NAO_LIDA', async () => {
      responses['notificacoes_central'] = { error: null };

      const ok = await service.criarNotificacao({
        usuarioId: 'u-1',
        empresaId: 'e-1',
        tipoEvento: 'NOVO_CLIENTE',
        titulo: 'Novo cliente cadastrado',
        mensagem: 'Cliente XYZ aguarda aprovação',
      });

      expect(ok).toBe(true);
      const q = queries[0];
      const insertOp = q.ops.find((op) => op.startsWith('insert:'))!;
      expect(insertOp).toContain('"canal":"IN_APP"');
      expect(insertOp).toContain('"prioridade":"INFORMATIVO"');
      expect(insertOp).toContain('"severidade":"INFO"');
      expect(insertOp).toContain('"status_notificacao":"NAO_LIDA"');
      expect(insertOp).toContain('"status_envio":"SENT"');
      expect(insertOp).toContain('"destinatario_contato":"u-1"');
    });

    it('deve aceitar prioridade/severidade/rota/entidade customizadas', async () => {
      responses['notificacoes_central'] = { error: null };

      await service.criarNotificacao({
        usuarioId: 'u-1',
        empresaId: 'e-1',
        tipoEvento: 'APROVACAO_PROPOSTA',
        titulo: 'Proposta aguardando decisão',
        mensagem: 'Decida agora',
        prioridade: 'CRITICO',
        severidade: 'ALERTA',
        rotaDestino: '/workspace/propostas',
        entidadeTipo: 'PROPOSTA',
        entidadeId: 'p-99',
      });

      const q = queries[0];
      const insertOp = q.ops.find((op) => op.startsWith('insert:'))!;
      expect(insertOp).toContain('"prioridade":"CRITICO"');
      expect(insertOp).toContain('"severidade":"ALERTA"');
      expect(insertOp).toContain('"rota_destino":"/workspace/propostas"');
      expect(insertOp).toContain('"entidade_relacionada_tipo":"PROPOSTA"');
      expect(insertOp).toContain('"entidade_relacionada_id":"p-99"');
    });

    it('deve retornar false em caso de erro de RLS', async () => {
      responses['notificacoes_central'] = { error: { message: 'new row violates row-level security policy' } };

      expect(await service.criarNotificacao({ usuarioId: 'u-1', empresaId: 'e-1', tipoEvento: 'T', titulo: 't', mensagem: 'm' })).toBe(false);
    });
  });

  describe('solicitações (decisão aprovar/rejeitar)', () => {
    it('criarSolicitacao deve usar usuário autenticado como solicitante quando não informado', async () => {
      db.state.currentUser = db.makeUser('u-auth-1');
      responses['solicitacoes'] = { single: { data: { id: 'sol-1' }, error: null } };

      const result = await service.criarSolicitacao({ empresaId: 'e-1', tipo: 'NOVO_CLIENTE', titulo: 'Novo cliente' });

      expect(result.success).toBe(true);
      expect(result.id).toBe('sol-1');
      const q = queries[0];
      const insertOp = q.ops.find((op) => op.startsWith('insert:'))!;
      expect(insertOp).toContain('"solicitante_id":"u-auth-1"');
      expect(insertOp).toContain('"status":"PENDENTE"');
    });

    it('aprovarSolicitacao deve registrar responsável, motivo e data, apenas em PENDENTE', async () => {
      responses['solicitacoes'] = { error: null };

      const ok = await service.aprovarSolicitacao('sol-1', 'u-admin-1', 'Documentos OK');

      expect(ok).toBe(true);
      const q = queries[0];
      expect(q.ops.some((op) => op.includes('"status":"APROVADA"') && op.includes('"responsavel_id":"u-admin-1"') && op.includes('"decisao_motivo":"Documentos OK"') && op.includes('decisao_data'))).toBe(true);
      expect(q.ops).toContain('eq:id:sol-1');
      expect(q.ops).toContain('eq:status:PENDENTE');
    });

    it('rejeitarSolicitacao deve registrar motivo obrigatório', async () => {
      responses['solicitacoes'] = { error: null };

      const ok = await service.rejeitarSolicitacao('sol-1', 'u-admin-1', 'Dados inconsistentes');

      expect(ok).toBe(true);
      const q = queries[0];
      expect(q.ops.some((op) => op.includes('"status":"REJEITADA"') && op.includes('"decisao_motivo":"Dados inconsistentes"'))).toBe(true);
    });

    it('deve retornar false quando decisão falha (ex.: já decidida)', async () => {
      responses['solicitacoes'] = { error: { message: 'no rows matched' } };

      expect(await service.aprovarSolicitacao('sol-1', 'u-admin-1')).toBe(false);
    });
  });

  describe('chat individual e em grupo', () => {
    it('criarConversa deve incluir o criador nos participantes e deduplicar', async () => {
      db.state.currentUser = db.makeUser('u-auth-1');
      responses['conversas'] = { single: { data: { id: 'conv-1' }, error: null } };
      responses['conversa_participantes'] = { error: null };

      const result = await service.criarConversa({ empresaId: 'e-1', tipo: 'GRUPO', nome: 'Campanha Verão', participanteIds: ['u-2', 'u-auth-1'] });

      expect(result.success).toBe(true);
      expect(result.id).toBe('conv-1');
      const partQ = queries[1];
      expect(partQ.table).toBe('conversa_participantes');
      const insertOp = partQ.ops.find((op) => op.startsWith('insert:'))!;
      expect(insertOp).toContain('u-auth-1');
      expect(insertOp).toContain('u-2');
      expect(insertOp.split('u-auth-1').length - 1).toBe(1);
      expect(insertOp.split('u-2').length - 1).toBe(1);
    });

    it('enviarMensagem deve herdar a empresa da conversa e usar remetente autenticado', async () => {
      db.state.currentUser = db.makeUser('u-auth-1');
      responses['conversas'] = { maybeSingle: { data: { empresa_operadora_id: 'e-1' }, error: null } };
      responses['conversa_mensagens'] = { single: { data: { id: 'msg-1' }, error: null } };

      const result = await service.enviarMensagem('conv-1', 'Olá time!');

      expect(result.success).toBe(true);
      expect(result.id).toBe('msg-1');
      const q = queries[1];
      expect(q.table).toBe('conversa_mensagens');
      const insertOp = q.ops.find((op) => op.startsWith('insert:'))!;
      expect(insertOp).toContain('"conversa_id":"conv-1"');
      expect(insertOp).toContain('"empresa_operadora_id":"e-1"');
      expect(insertOp).toContain('"remetente_id":"u-auth-1"');
      expect(insertOp).toContain('"mensagem":"Olá time!"');
    });

    it('enviarMensagem deve falhar quando o usuário não está autenticado', async () => {
      const result = await service.enviarMensagem('conv-1', 'teste');

      expect(result.success).toBe(false);
    });

    it('marcarConversaLida deve atualizar ultima_leitura do próprio usuário', async () => {
      db.state.currentUser = db.makeUser('u-auth-1');
      responses['conversa_participantes'] = { error: null };

      const ok = await service.marcarConversaLida('conv-1');

      expect(ok).toBe(true);
      const q = queries[0];
      expect(q.ops.some((op) => op.includes('ultima_leitura'))).toBe(true);
      expect(q.ops).toContain('eq:conversa_id:conv-1');
      expect(q.ops).toContain('eq:usuario_id:u-auth-1');
    });
  });

  describe('eventos do sistema', () => {
    it('registrarEvento deve usar created_by do usuário autenticado por padrão', async () => {
      db.state.currentUser = db.makeUser('u-auth-1');
      responses['eventos'] = { error: null };

      const ok = await service.registrarEvento({ empresaId: 'e-1', tipoEvento: 'CONTRATO_ASSINADO', entidadeOrigem: 'CONTRATO', entidadeId: 'ctr-1' });

      expect(ok).toBe(true);
      const q = queries[0];
      expect(q.table).toBe('eventos');
      const insertOp = q.ops.find((op) => op.startsWith('insert:'))!;
      expect(insertOp).toContain('"created_by":"u-auth-1"');
      expect(insertOp).toContain('"entidade_origem":"CONTRATO"');
    });
  });

  describe('getFeedUnificado', () => {
    it('deve consolidar notificações, solicitações pendentes e alertas críticos', async () => {
      responses['notificacoes_central'] = {
        data: [
          { id: 'n-1', titulo: 'Crítico', severidade: 'CRITICO', status_notificacao: 'NAO_LIDA', prioridade: 'CRITICO' },
          { id: 'n-2', titulo: 'Alerta', severidade: 'ALERTA', status_notificacao: 'NAO_LIDA', prioridade: 'ATENCAO' },
          { id: 'n-3', titulo: 'Info', severidade: 'INFO', status_notificacao: 'LIDA', prioridade: 'INFORMATIVO' },
        ],
      };
      responses['solicitacoes'] = {
        data: [
          { id: 'sol-1', status: 'PENDENTE' },
          { id: 'sol-2', status: 'APROVADA' },
        ],
      };
      responses['notificacoes_central'] = { ...responses['notificacoes_central'], count: 2, error: null };

      const feed = await service.getFeedUnificado();

      expect(feed.notificacoes).toHaveLength(3);
      expect(feed.solicitacoes).toHaveLength(2);
      expect(feed.totalNaoLidas).toBe(2);
      expect(feed.totalPendentes).toBe(1);
      expect(feed.totalAlertas).toBe(2);
    });
  });
});
