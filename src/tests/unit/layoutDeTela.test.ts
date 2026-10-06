/**
 * F-147 — Divisão da tela em zonas: geometria, regras e contrato do Player web.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  arrastoVale, dividir, estiloDaZona, limitarZona, marcarUnica, naGrade, novaZona, paraSalvar, paresSobrepostos, percentual,
  proximoItemLivre, proximoNumero, redimensionarLayout, telaLogicaPadrao, validarLayout, zonaDoArrasto, zonasDaDivisao, type Zona,
} from '@/lib/layoutZonas';
import { assinaturaDoLayout, mapLayoutPayload } from '@/components/player/playerLayout';
import type { MediaItem } from '@/components/player/playerPlaylist';

const W = 1920; const H = 1080;

describe('tela lógica', () => {
  it('lê o cadastro da tela: rótulos de formato, resolução real e orientação', () => {
    expect(telaLogicaPadrao('16x9', 'landscape')).toEqual({ largura: 1920, altura: 1080 });
    expect(telaLogicaPadrao('9x16', 'portrait')).toEqual({ largura: 1080, altura: 1920 });
    expect(telaLogicaPadrao('1080x1920', 'PORTRAIT')).toEqual({ largura: 1080, altura: 1920 });
    expect(telaLogicaPadrao('3840x960', null)).toEqual({ largura: 3840, altura: 960 });
    expect(telaLogicaPadrao(null, 'PORTRAIT')).toEqual({ largura: 1080, altura: 1920 });
    expect(telaLogicaPadrao(undefined, undefined)).toEqual({ largura: 1920, altura: 1080 });
  });
});

describe('criar zona clicando e arrastando', () => {
  it('o arrasto vira um retângulo em pixels, em qualquer direção, sem sair da tela', () => {
    expect(zonaDoArrasto({ x: 100, y: 50 }, { x: 580, y: 950 }, W, H)).toEqual({ x: 100, y: 50, largura: 480, altura: 900 });
    expect(zonaDoArrasto({ x: 580, y: 950 }, { x: 100, y: 50 }, W, H)).toEqual({ x: 100, y: 50, largura: 480, altura: 900 });
    expect(zonaDoArrasto({ x: 1800, y: 1000 }, { x: 2500, y: 1500 }, W, H)).toEqual({ x: 1800, y: 1000, largura: 120, altura: 80 });
  });

  it('um clique sem arrastar não cria zona', () => {
    expect(arrastoVale(zonaDoArrasto({ x: 10, y: 10 }, { x: 12, y: 13 }, W, H))).toBe(false);
    expect(arrastoVale({ x: 0, y: 0, largura: 200, altura: 100 })).toBe(true);
  });

  it('as medidas ao lado: pixels e percentual da tela (25% lateral = 480 px de 1920)', () => {
    const p = percentual({ x: 1440, y: 0, largura: 480, altura: 1080 }, W, H);
    expect(p).toEqual({ x: 75, y: 0, largura: 25, altura: 100, area: 25 });
    expect(naGrade(487, 10)).toBe(490);
    expect(naGrade(487, 0)).toBe(487);
  });

  it('posição em tela usa a mesma conta no editor e no Player', () => {
    expect(estiloDaZona({ x: 1440, y: 0, largura: 480, altura: 1080 }, W, H)).toEqual({ left: '75%', top: '0%', width: '25%', height: '100%' });
  });
});

describe('regras das zonas', () => {
  it('zona nunca sai da tela nem fica menor que o mínimo', () => {
    expect(limitarZona({ x: 1900, y: -5, largura: 400, altura: 2 }, W, H)).toEqual({ x: 1520, y: 0, largura: 400, altura: 16 });
  });

  it('numeração: menor número livre; a primeira zona nasce principal', () => {
    expect(proximoNumero([{ numero: 1 }, { numero: 3 }])).toBe(2);
    const a = novaZona({ x: 0, y: 0, largura: 100, altura: 100 }, [], W, H);
    const b = novaZona({ x: 100, y: 0, largura: 100, altura: 100 }, [a], W, H);
    expect([a.numero, a.principal, b.numero, b.principal]).toEqual([1, true, 2, false]);
  });

  it('divisão pronta 75% + 25% à direita cobre a tela inteira sem sobrepor', () => {
    const [grande, lateral] = dividir('LATERAL_DIREITA', W, H, 0.25);
    expect(grande).toEqual({ x: 0, y: 0, largura: 1440, altura: 1080 });
    expect(lateral).toEqual({ x: 1440, y: 0, largura: 480, altura: 1080 });
    const zonas = zonasDaDivisao('QUATRO', W, H);
    expect(zonas).toHaveLength(4);
    expect(paresSobrepostos(zonas)).toEqual([]);
    expect(zonas.reduce((s, z) => s + z.largura * z.altura, 0)).toBe(W * H);
  });

  it('uma só principal e uma só com som; a principal não guarda playlist própria', () => {
    let zonas = zonasDaDivisao('LATERAL_DIREITA', W, H);
    zonas = zonas.map((z, i) => (i === 1 ? { ...z, playlist_id: 'pl-2' } : z));
    zonas = marcarUnica(zonas, zonas[1].chave, 'principal', true);
    expect(zonas.map((z) => z.principal)).toEqual([false, true]);
    expect(zonas[1].playlist_id).toBeNull();
    zonas = marcarUnica(zonas, zonas[0].chave, 'audio', true);
    zonas = marcarUnica(zonas, zonas[1].chave, 'audio', true);
    expect(zonas.map((z) => z.audio)).toEqual([false, true]);
  });

  it('validação em português: fora do limite, número repetido, sem zonas', () => {
    const z = (n: number, extra: Partial<Zona> = {}): Zona => ({ ...novaZona({ x: 0, y: 0, largura: 100, altura: 100 }, [], W, H), numero: n, principal: false, ...extra });
    expect(validarLayout({ largura: W, altura: H, cor_fundo: '#000000', zonas: [] })).toContain('Crie pelo menos uma zona.');
    expect(validarLayout({ largura: W, altura: H, cor_fundo: '#000000', zonas: [z(1), z(1)] })).toContain('A zona 1 está repetida.');
    expect(validarLayout({ largura: W, altura: H, cor_fundo: '#000000', zonas: [z(1, { x: 1900 })] })).toContain('A zona 1 passa do limite da tela.');
    expect(validarLayout({ largura: W, altura: H, cor_fundo: '#000000', zonas: [z(1), z(2)] })).toEqual([]);
  });

  it('muitas zonas (90) são aceitas', () => {
    const zonas: Zona[] = [];
    for (let i = 0; i < 90; i++) zonas.push(novaZona({ x: (i % 10) * 192, y: Math.floor(i / 10) * 120, largura: 192, altura: 120 }, zonas, W, H));
    expect(validarLayout({ largura: W, altura: H, cor_fundo: '#000000', zonas })).toEqual([]);
    expect(paresSobrepostos(zonas)).toEqual([]);
  });

  it('mudar o tamanho da tela mantém a proporção das zonas', () => {
    const l = redimensionarLayout({ largura: W, altura: H, cor_fundo: '#000000', zonas: zonasDaDivisao('LATERAL_DIREITA', W, H) }, 3840, 2160);
    expect(l.zonas.map((z) => [z.x, z.largura, z.altura])).toEqual([[0, 2880, 2160], [2880, 960, 2160]]);
  });

  it('o que vai para o banco: a principal sai sem playlist e sem campos do editor', () => {
    const zonas = zonasDaDivisao('LATERAL_DIREITA', W, H).map((z, i) => ({ ...z, playlist_id: `pl-${i}` }));
    const enviado = paraSalvar(zonas);
    expect(enviado[0]).toMatchObject({ numero: 1, principal: true, playlist_id: null, x: 0, largura: 1440 });
    expect(enviado[1]).toMatchObject({ numero: 2, principal: false, playlist_id: 'pl-1' });
    expect(enviado[0]).not.toHaveProperty('chave');
  });
});

describe('Player: a mesma mídia nunca em duas zonas ao mesmo tempo', () => {
  const itens = [{ mediaId: 'a' }, { mediaId: 'b' }, { mediaId: 'c' }];
  it('pula a mídia que outra zona está mostrando', () => {
    expect(proximoItemLivre(itens, -1, new Set())).toBe(0);
    expect(proximoItemLivre(itens, 0, new Set(['b']))).toBe(2);
    expect(proximoItemLivre(itens, 2, new Set(['a']))).toBe(1);
  });
  it('se tudo está em uso, a zona espera (não repete)', () => {
    expect(proximoItemLivre([{ mediaId: 'a' }], 0, new Set(['a']))).toBe(-1);
    expect(proximoItemLivre([], 0, new Set())).toBe(-1);
  });
  it('zona com um item só repete o próprio item', () => {
    expect(proximoItemLivre([{ mediaId: 'a' }], 0, new Set())).toBe(0);
  });
});

describe('contrato do Player web (get_player_layout_for_screen)', () => {
  const principais: MediaItem[] = [{ id: 'i1', mediaId: 'm1', url: 'https://x/1.mp4', type: 'video', duration: 15 }];
  const resposta = {
    status: 'SUCCESS',
    layout: {
      id: 'L', versao: 3, largura: 1920, altura: 1080, cor_fundo: '#000000',
      zonas: [
        { id: 'z1', numero: 1, x: 0, y: 0, largura: 1440, altura: 1080, ordem_z: 0, modo_encaixe: 'CONTER', principal: true, audio: true, playlist: null },
        { id: 'z2', numero: 2, x: 1440, y: 0, largura: 480, altura: 1080, ordem_z: 1, modo_encaixe: 'COBRIR', principal: false, audio: false,
          playlist: { id: 'p2', name: 'Lateral', audio_enabled: false, playlist_items: [
            { id: 'i2', position: 0, duration: 8, media: { id: 'm2', name: 'oferta', file_url: 'https://x/2.jpg', file_type: 'image' }, widget: null },
            { id: 'i3', position: 1, duration: 10, media: null, widget: { id: 'w1' } } ] } },
        { id: 'z3', numero: 3, x: 0, y: 0, largura: 10, altura: 10, principal: false, playlist: null },
      ],
    },
  };

  it('a zona principal toca a playlist da tela; as outras, a própria (widgets ficam de fora no Player web)', () => {
    const l = mapLayoutPayload(resposta, principais, 'https://base')!;
    expect([l.largura, l.altura, l.versao]).toEqual([1920, 1080, 3]);
    expect(l.zonas.map((z) => [z.numero, z.principal, z.modoEncaixe, z.itens.map((i) => i.mediaId)])).toEqual([
      [1, true, 'CONTER', ['m1']], [2, false, 'COBRIR', ['m2']], [3, false, 'CONTER', []],
    ]);
  });

  it('sem divisão, sem acesso ou resposta inválida: null (o Player segue em tela cheia)', () => {
    expect(mapLayoutPayload({ status: 'SEM_LAYOUT' }, principais, 'b')).toBeNull();
    expect(mapLayoutPayload({ status: 'SEM_ACESSO' }, principais, 'b')).toBeNull();
    expect(mapLayoutPayload('isto não é json', principais, 'b')).toBeNull();
    expect(mapLayoutPayload({ status: 'SUCCESS', layout: { id: 'L', largura: 0, altura: 0, zonas: [] } }, principais, 'b')).toBeNull();
    expect(mapLayoutPayload(null, principais, 'b')).toBeNull();
  });

  it('a assinatura muda quando uma zona muda de lugar ou de conteúdo', () => {
    const a = mapLayoutPayload(resposta, principais, 'https://base');
    const movida = JSON.parse(JSON.stringify(resposta)); movida.layout.zonas[1].x = 1400;
    const b = mapLayoutPayload(movida, principais, 'https://base');
    expect(assinaturaDoLayout(a)).not.toBe(assinaturaDoLayout(b));
    expect(assinaturaDoLayout(a)).toBe(assinaturaDoLayout(mapLayoutPayload(resposta, principais, 'https://base')));
    expect(assinaturaDoLayout(null)).toBe('');
  });
});

describe('banco e Player: garantias fixas', () => {
  const sql = readFileSync('supabase/migrations/20261303_layout_de_tela_e_zonas.sql', 'utf8');
  const motor = readFileSync('src/components/player/PlayerEngine.tsx', 'utf8');
  const zonasPlayer = readFileSync('src/components/player/ZonasDoPlayer.tsx', 'utf8');

  it('a função atual do Player não é alterada pela migração', () => {
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.get_player_playlist_for_screen/);
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.get_player_layout_for_screen(p_identifier text, p_device_id text)');
  });

  it('layout por tela, gravação só pelas funções, anônimo sem acesso às tabelas', () => {
    expect(sql).toContain('screen_id uuid NOT NULL UNIQUE REFERENCES public.screens(id) ON DELETE CASCADE');
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE ON public.screen_layouts, public.layout_zones FROM authenticated;');
    expect(sql).toContain('REVOKE ALL ON public.screen_layouts, public.layout_zones FROM anon, public;');
    expect(sql).toContain('CHECK (NOT principal OR playlist_id IS NULL)');
  });

  it('só o aparelho vinculado à tela recebe o layout; tela bloqueada não recebe', () => {
    expect(sql).toContain('v_tela.bound_device_id IS DISTINCT FROM p_device_id');
    expect(sql).toContain('coalesce(v_tela.bloqueada_por_inadimplencia, false)');
  });

  it('prova de exibição por zona', () => {
    expect(sql).toContain('ALTER TABLE public.playback_logs ADD COLUMN IF NOT EXISTS zona_id uuid;');
    expect(zonasPlayer).toContain('zona_id: zona.id, zona_numero: zona.numero');
  });

  it('Player web grava a prova de exibição pela função segura (a tabela continua fechada para quem não tem login)', () => {
    const registrador = readFileSync('src/utils/offlineLogger.ts', 'utf8');
    const prova = readFileSync('supabase/migrations/20261304_prova_de_exibicao_do_player_web.sql', 'utf8');
    expect(registrador).toContain('/rest/v1/rpc/fn_player_registrar_exibicoes');
    expect(registrador).not.toContain('/rest/v1/playback_logs');
    expect(prova).toContain('v_tela.bound_device_id IS DISTINCT FROM p_device_id');
    expect(prova).toContain('WHERE n <= 200');
    expect(prova).not.toMatch(/GRANT .* ON (TABLE )?public.playback_logs TO anon/i);
    // a zona só vale se for da própria tela
    expect(prova).toContain('z.layout_id = (SELECT l.id FROM public.screen_layouts l WHERE l.screen_id = v_tela.id)');
  });

  it('Player web: pergunta pelo layout só depois do SUCCESS e não mostra aviso sobre as zonas', () => {
    // duas consultas: (1) tela sem playlist principal (zonas com conteúdo próprio) e (2) depois do SUCCESS
    expect(motor.split("'get_player_layout_for_screen'").length - 1).toBe(2);
    expect(motor.indexOf("'get_player_layout_for_screen'")).toBeGreaterThan(motor.indexOf('if (NO_CONTENT_CODES.has(result.code)) {'));
    expect(motor.lastIndexOf("'get_player_layout_for_screen'")).toBeGreaterThan(motor.indexOf('setScreenOrientation(result.orientation)'));
    expect(motor).toContain('if (falhou && layoutRef.current) { setIsLoading(false); return; }');
    expect(zonasPlayer).not.toMatch(/Sincronizando|Tempo Excedido|Tela reativada|kiosk/i);
  });
});
