import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { telaOnlineAgora, aparelhoDaTela, saudeDoAparelho } from '@/lib/statusDoAparelho';
import { resumirTelas } from '@/components/screens/CartoesDasTelas';

const ler = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
const AGORA = new Date('2026-10-18T05:00:00Z').getTime();
const haMin = (m: number) => new Date(AGORA - m * 60_000).toISOString();

describe('F-193 — cada tela mostra o PRÓPRIO online', () => {
  it('online = ativa, com aparelho pareado e sinal dela nos últimos 3 minutos', () => {
    expect(telaOnlineAgora({ bound_device_id: 'h', last_ping_at: haMin(1) }, null, AGORA)).toBe(true);
    expect(telaOnlineAgora({ bound_device_id: 'h', last_ping_at: haMin(10) }, null, AGORA)).toBe(false);
    expect(telaOnlineAgora({ bound_device_id: null, last_ping_at: haMin(1) }, null, AGORA)).toBe(false);
    expect(telaOnlineAgora({ bound_device_id: 'h', is_active: false, last_ping_at: haMin(1) }, null, AGORA)).toBe(false);
    // telemetria do próprio aparelho também conta
    expect(telaOnlineAgora({ bound_device_id: 'h', last_ping_at: haMin(20) }, haMin(1), AGORA)).toBe(true);
  });

  it('o quadro do aparelho nunca mostra o aparelho/saúde de outra tela', () => {
    const outro = { id: 'R4', identity_hash: 'hash-da-recepcao' };
    expect(aparelhoDaTela(outro, 'hash-da-dcasa')).toBeNull();
    expect(aparelhoDaTela(outro, 'hash-da-recepcao')).toBe(outro);
    expect(saudeDoAparelho({ device_id: 'R4' }, 'dcasa')).toBeNull();
    expect(saudeDoAparelho({ device_id: 'dcasa' }, 'dcasa')).toEqual({ device_id: 'dcasa' });
  });

  it('a página da tela não guarda aparelho de outra tela e o selo usa a mesma regra do topo', () => {
    const pg = ler('src/pages/dashboard/ScreenDetails.tsx');
    expect(pg).not.toContain('setDeviceInfo(');
    expect(pg).not.toContain('setDeviceHealth(');
    expect(pg).toContain('const isOnline = telaOnlineAgora(screen, deviceHealth?.last_seen);');
    expect(pg).toContain("getHealthStatusLabel(isOnline ? 'ONLINE' : 'OFFLINE')");
    // rótulo em cima, valor embaixo (antes "TipoTABLET" grudado)
    expect(pg).not.toContain('<div className="space-y-1"><span className="text-muted-foreground">');
  });

  it('Voltar da página da tela volta para onde o usuário estava (lista de anunciantes)', () => {
    const pg = ler('src/pages/dashboard/ScreenDetails.tsx');
    expect(pg).toContain('if (idx > 0) navigate(-1); else navigate(\'/dashboard/screens?secao=anunciantes\');');
    expect(pg).not.toContain("onClick={() => navigate('/dashboard/screens')}");
  });
});

describe('F-193 — cartões da página Telas', () => {
  it('resumo por cartão: total, online, offline, ativas, sem playlist, sem aparelho', () => {
    const r = resumirTelas([
      { bound_device_id: 'a', last_ping_at: haMin(1), playlist_id: 'p' },
      { bound_device_id: 'b', last_ping_at: haMin(30), playlist_id: null },
      { bound_device_id: null, last_ping_at: null, is_active: false, playlist: { name: 'x' } },
    ], AGORA);
    expect(r).toEqual({ total: 3, online: 1, offline: 2, ativas: 2, semPlaylist: 1, semAparelho: 1 });
  });

  it('cartões lado a lado com capa editável e o mapa da rede abaixo', () => {
    const c = ler('src/components/screens/CartoesDasTelas.tsx');
    expect(c).toContain('grid grid-cols-2');
    expect(c).toContain("supabase.auth.updateUser({ data: { capas_telas: novas } })");
    expect(c).toContain('trocar-capa-');
    const pg = ler('src/pages/dashboard/Screens.tsx');
    expect(pg).toContain('<CartoesDasTelas');
    expect(pg).toContain('<MapaDaRede />');
  });
});
