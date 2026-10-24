/**
 * F-209 — launcher: fundo (cor/capa), mídias Enviadas x Biblioteca, envio do computador/celular e o visual novo na prévia.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const chamadas: { metodo: string; args: unknown[] }[] = [];
let resposta: unknown[] = [];
function consulta() {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'or', 'like', 'eq', 'order', 'limit', 'ilike', 'in']) {
    q[m] = (...args: unknown[]) => { chamadas.push({ metodo: m, args }); return q; };
  }
  (q as { then: unknown }).then = (ok: (v: unknown) => unknown) => ok({ data: resposta, error: null });
  return q;
}
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => consulta(), rpc: vi.fn() } }));

import { buscarMidias, midiasPorId, configPadrao } from '@/services/launcher.service';

describe('F-209 mídias da launcher', () => {
  beforeEach(() => { chamadas.length = 0; resposta = []; });

  it('separa Enviadas e Biblioteca (o robô de conteúdo não esconde mais as enviadas)', async () => {
    await buscarMidias('', 'enviadas');
    expect(chamadas).toContainEqual({ metodo: 'eq', args: ['biblioteca', false] });
    chamadas.length = 0;
    await buscarMidias('', 'biblioteca');
    expect(chamadas).toContainEqual({ metodo: 'eq', args: ['biblioteca', true] });
  });

  it('capa só aceita imagem', async () => {
    await buscarMidias('', 'enviadas', true);
    expect(chamadas).toContainEqual({ metodo: 'or', args: ['file_type.ilike.image%'] });
  });

  it('mídias pelos ids voltam na ordem pedida', async () => {
    resposta = [{ id: 'b', name: 'B' }, { id: 'a', name: 'A' }];
    const m = await midiasPorId(['a', 'b']);
    expect(m.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('configuração padrão sem cor nem capa', () => {
    const c = configPadrao('emp');
    expect(c.fundo_cor).toBeNull();
    expect(c.capa_media_id).toBeNull();
  });
});

describe('F-209 página da launcher', () => {
  const src = readFileSync(resolve(__dirname, '../../modules/corporate/pages/LauncherPage.tsx'), 'utf-8');
  it('fundo: padrão, cor ou capa', () => {
    expect(src).toContain('data-testid="fundo-launcher"');
    expect(src).toContain('type="color"');
    expect(src).toContain('capa_media_id: m[0].id');
  });
  it('seletor com Enviadas, Biblioteca e Upload do aparelho (F-213: componente próprio)', () => {
    const seletor = readFileSync(resolve(__dirname, '../../components/launcher/SeletorDeMidiasLauncher.tsx'), 'utf-8');
    expect(src).toContain('<SeletorDeMidiasLauncher');
    expect(seletor).toContain("['enviadas', 'Enviadas'], ['biblioteca', 'Biblioteca']");
    expect(seletor).toContain('<MediaUploadDialog');
    expect(seletor).toContain('onUploadedIds={async (ids) => {');
  });
  it('prévia com selo App Oficial, Sobre Mídia Player e Menu (Menu só com o nome, centralizado)', () => {
    expect(src).toContain('App Oficial');
    expect(src).toContain('Sobre Mídia Player');
    expect(src).toContain('justify-center gap-[1.1cqw] rounded-[2.3cqw]');
    expect(src).not.toContain('Apps · Loja · Ajustes');
    expect(src).not.toContain('Launcher original</span>');
  });
  it('a função do aparelho entrega a cor e a capa', () => {
    const sql = readFileSync(resolve(__dirname, '../../../supabase/migrations/20261348_launcher_fundo_cor_e_capa.sql'), 'utf-8');
    expect(sql).toContain("'fundo_cor'");
    expect(sql).toContain("'capa', v_capa");
    expect(sql).not.toContain('ROW(v_empresa');
  });
});
