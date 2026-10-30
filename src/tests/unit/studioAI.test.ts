/** SOBRE MÍDIA Studio AI — adaptador OpenAI: custo real, transparência verdadeira e textos protegidos no prompt melhorado. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { analisarAlfa, custoDaImagem, faltando, mensagemDoErro, trechosObrigatorios, ErroOpenAI, TAMANHO } from '../../../supabase/functions/_shared/studio/openai';

function imagem(w: number, h: number, alfa: (x: number, y: number) => number) {
  const d = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = 200; d[i + 1] = 30; d[i + 2] = 30; d[i + 3] = alfa(x, y); }
  return d;
}

describe('transparência DE VERDADE', () => {
  it('logo com fundo transparente passa', () => {
    const d = imagem(100, 60, (x, y) => (x > 25 && x < 75 && y > 15 && y < 45 ? 255 : 0));
    expect(analisarAlfa(d, 100, 60, 4).transparente).toBe(true);
  });
  it('"quadriculado" desenhado (tudo opaco) NÃO passa', () => {
    const d = imagem(100, 60, () => 255);
    const r = analisarAlfa(d, 100, 60, 4);
    expect(r.transparente).toBe(false);
    expect(r.cantosLivres).toBe(false);
  });
  it('imagem sem canal alfa (RGB) nunca é transparente', () => {
    expect(analisarAlfa(new Uint8Array(100 * 60 * 3), 100, 60, 3).transparente).toBe(false);
  });
  it('imagem quase toda vazia (sem conteúdo) não passa', () => {
    const d = imagem(100, 60, (x, y) => (x === 50 && y === 30 ? 255 : 0));
    expect(analisarAlfa(d, 100, 60, 4).transparente).toBe(false);
  });
});

describe('custo real a partir do usage oficial', () => {
  it('gpt-image-2: texto US$ 5, imagem de entrada US$ 8, saída US$ 30 por milhão', () => {
    expect(custoDaImagem('gpt-image-2', { input_tokens: 100, output_tokens: 1000, input_tokens_details: { text_tokens: 100, image_tokens: 0 } })).toBe(0.0305);
    expect(custoDaImagem('gpt-image-2', { input_tokens: 1100, output_tokens: 0, input_tokens_details: { text_tokens: 100, image_tokens: 1000 } })).toBe(0.0085);
  });
  it('modelo sem preço conhecido não inventa custo', () => expect(custoDaImagem('modelo-x', { output_tokens: 10 })).toBeNull());
  it('tamanhos oficiais', () => expect(TAMANHO).toEqual({ quadrado: '1024x1024', horizontal: '1536x1024', vertical: '1024x1536' }));
});

describe('prompt melhorado nunca muda o que o cliente pediu', () => {
  it('extrai textos entre aspas e números', () => {
    expect(trechosObrigatorios('Logo "SUPER OFERTA" com R$ 9,99 e 50%')).toEqual(expect.arrayContaining(['SUPER OFERTA', 'R$ 9,99', '50%']));
  });
  it('detecta texto alterado ou traduzido', () => {
    expect(faltando('Logo "PROMOÇÃO RELÂMPAGO"', 'A 3D logo with "FLASH SALE"')).toEqual(['PROMOÇÃO RELÂMPAGO']);
    expect(faltando('Logo "SÓ HOJE" por R$ 4,99', 'Logo 3D dourada "SÓ HOJE" com preço R$ 4,99')).toEqual([]);
  });
});

describe('mensagens de erro claras (sem detalhes internos)', () => {
  it('bloqueio de conteúdo e saldo da plataforma', () => {
    expect(mensagemDoErro(new ErroOpenAI(400, 'moderation_blocked', 'x'))).toMatch(/filtro de conteúdo/);
    expect(mensagemDoErro(new ErroOpenAI(429, 'credit_balance_exhausted', 'x'))).toMatch(/crédito foi devolvido/);
  });
});

describe('banco: créditos imutáveis e preço do dono', () => {
  const sql = fs.readFileSync('supabase/migrations/20261351_studio_ai.sql', 'utf8');
  it('preço padrão R$ 4,99 e saldo nunca negativo', () => {
    expect(sql).toContain('preco_credito_centavos int not null default 499');
    expect(sql).toContain('check (saldo >= 0)');
  });
  it('extrato com gatilho de imutabilidade e chave de idempotência única', () => {
    expect(sql).toMatch(/before update or delete on public\.studio_ai_movimentos/);
    expect(sql).toMatch(/idempotencia text not null unique/);
  });
});

describe('F-219: Studio para todos, modelos só owner/ADM, todos pagam (menos owner/ADM)', () => {
  const ler = (f: string) => fs.readFileSync(f, 'utf8');
  it('"Sobre Mídia Studio" está nos três menus laterais, sem restrição de perfil', () => {
    const portal = ler('src/modules/crm/layout/CustomerPortalLayout.tsx');
    const grupoPrincipal = portal.slice(portal.indexOf("label: 'Principal'"), portal.indexOf("label: 'Minhas Mídias'"));
    expect(grupoPrincipal).toContain("{ name: 'Sobre Mídia Studio', path: '/studio'");
    expect(grupoPrincipal).not.toContain('somente');
    const painel = ler('src/components/dashboard/Sidebar.tsx');
    const itensFixos = painel.slice(painel.indexOf('const menuItems = ['), painel.indexOf('];', painel.indexOf('const menuItems = [')));
    expect(itensFixos).toContain("label: 'Sobre Mídia Studio', path: '/studio'");
    expect(ler('src/modules/crm/components/Sidebar.tsx')).toContain("{ label: 'Sobre Mídia Studio', icon: Clapperboard, path: '/studio' }");
  });
  it('banco: todos usam, owner/ADM não pagam, só owner/ADM criam modelos, cobrança visível só ao dono', () => {
    const sql = ler('supabase/migrations/20261353_studio_ai_todos.sql');
    expect(sql).toMatch(/u\.empresa_operadora_id is not null\s*\n\s*from public\.usuarios/);
    expect(sql).toContain("if e.admin then raise exception 'Owner e administradores criam sem cobrança.'");
    expect(sql).toContain("Só o proprietário e os administradores adicionam modelos.");
    expect(sql).toContain("'Studio AI (user ' || auth.uid()::text || ')");
    expect(sql).toMatch(/create policy so_o_proprio on public\.contas_receber as restrictive/);
  });
  it('a função cobra todos menos owner/ADM e libera sozinha o PIX pago', () => {
    const fn = ler('supabase/functions/studio-ai/index.ts');
    expect(fn).toContain('const cobrar = !e.admin;');
    expect(fn).toContain("srv.rpc('studio_ai_creditar_pagas')");
  });
});

// F-220 — Agente Analista de Referências (Cloudflare, instruções no banco)
import { INSTRUCOES_PADRAO, custoDaGeracao, tamanhoDaImagem, validarAnalise } from '../../../supabase/functions/_shared/studio/agente-referencia';

describe('F-220 agente de referências', () => {
  it('mantém a proporção da referência dentro do teto de 6 blocos de 512 px', () => {
    expect(tamanhoDaImagem(1080, 1350)).toEqual({ width: 1024, height: 1280 });
    expect(tamanhoDaImagem(1920, 1080)).toEqual({ width: 1536, height: 864 });
    for (const [w, h] of [[1000, 1000], [1080, 1920], [3000, 900], [500, 4000]]) {
      const t = tamanhoDaImagem(w, h);
      expect(Math.ceil(t.width / 512) * Math.ceil(t.height / 512)).toBeLessThanOrEqual(6);
      expect(Math.max(t.width, t.height)).toBeLessThanOrEqual(1536);
      expect(t.width % 16 + t.height % 16).toBe(0);
    }
  });

  it('calcula o custo do lucid-origin pela tabela oficial', () => {
    expect(custoDaGeracao(1024, 1280, 25)).toEqual({ neurons: 6 * 636 + 300, usd: 0.045 });
  });

  it('recusa prompt curto e exige cada texto lido entre aspas no prompt', () => {
    const base = 'x'.repeat(400);
    expect(validarAnalise({ prompt: 'curto', textos: [], proporcao: 'vertical', observacoes: '' }).length).toBeGreaterThan(0);
    expect(validarAnalise({ prompt: base, textos: ['BLACK'], proporcao: 'vertical', observacoes: '' })[0]).toContain('"BLACK"');
    expect(validarAnalise({ prompt: base + ' "BLACK"', textos: ['BLACK'], proporcao: 'vertical', observacoes: '' })).toEqual([]);
  });

  it('a migração guarda o agente no banco, versionado e só owner/ADM editam', () => {
    const sql = fs.readFileSync('supabase/migrations/20261354_studio_agentes.sql', 'utf8');
    expect(sql).toContain('analista-referencias');
    expect(sql).toContain('studio_agente_salvar');
    expect(sql).toContain('Método obrigatório');
    expect(INSTRUCOES_PADRAO).toContain('Ignore e NÃO descreva');
  });

  it('o Worker limita o lucid-origin a 1536 px e 30 passos', () => {
    const w = fs.readFileSync('cloudflare/tabloide-ia/worker.js', 'utf8');
    expect(w).toContain("'@cf/leonardo/lucid-origin'");
    expect(w).toMatch(/> 1536[\s\S]*> 30/);
  });
});

describe('F-220 formato real da referência', () => {
  it('diz ao agente o formato pelo tamanho do arquivo', async () => {
    const { formatoDe, mensagensDoAgente } = await import('../../../supabase/functions/_shared/studio/agente-referencia');
    expect(formatoDe(1024, 1280)).toBe('vertical');
    expect(formatoDe(1920, 1080)).toBe('horizontal');
    expect(formatoDe(1000, 1020)).toBe('quadrado');
    const m = mensagensDoAgente('x', 'data:image/jpeg;base64,AA', null, 1024, 1280);
    expect(JSON.stringify(m)).toContain('vertical (1024×1280 px)');
  });
});
