/**
 * F-148 — Zonas: widgets e anúncio por zona no Player web, relatório por zona, painel da rede, "Nossos Clientes" e mapa.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import { itensDaZona, mapLayoutPayload } from '@/components/player/playerLayout';
import { widgetDesenhavel } from '@/components/player/WidgetNaTela';
import type { MediaItem } from '@/components/player/playerPlaylist';
import { GRADE_DO_BRASIL, MapaDoBrasil, NOME_DO_ESTADO } from '@/components/rede/MapaDoBrasil';
import { resumoDoEstabelecimento } from '@/components/rede/RedePorEstabelecimento';

const sql = readFileSync('supabase/migrations/20261305_zonas_relatorio_anuncio_rede_e_clientes.sql', 'utf8');
const trecho = (inicio: string, fim: string) => { const a = sql.indexOf(inicio); return sql.slice(a, sql.indexOf(fim, a + inicio.length)); };

describe('Player web: widgets dentro da zona', () => {
  const brutos = [
    { id: 'i1', position: 0, duration: 8, media: { id: 'm1', file_url: 'https://x/1.jpg', file_type: 'image' }, widget: null },
    { id: 'i2', position: 1, duration: 15, media: null, widget: { id: 'w1', widget_type: 'clock', config: { showDate: true } } },
    { id: 'i3', position: 2, duration: 15, media: null, widget: { id: 'w2', widget_type: 'tipo_que_nao_existe', config: {} } },
  ];

  it('mídia e widget conhecido entram; widget que o Player web não sabe desenhar fica de fora', () => {
    const itens = itensDaZona(brutos, 'https://base', widgetDesenhavel);
    expect(itens.map((i) => [i.id, i.type, i.widgetType ?? null, i.duration])).toEqual([['i1', 'image', null, 8], ['i2', 'widget', 'clock', 15]]);
    expect(itens[1].mediaId).toBe('widget:w1');
  });

  it('tipos que o Player web desenha', () => {
    for (const t of ['clock', 'weather', 'sports', 'sports_news', 'rss', 'offer', 'advertising', 'institutional', 'social', 'instagram', 'youtube']) expect(widgetDesenhavel(t)).toBe(true);
    expect(widgetDesenhavel('qualquer')).toBe(false);
  });

  it('widget não entra na prova de exibição (não é mídia do acervo)', () => {
    const zonas = readFileSync('src/components/player/ZonasDoPlayer.tsx', 'utf8');
    expect(zonas).toContain("if (screenId && item.type !== 'widget') {");
  });
});

describe('anúncio vendido para uma zona', () => {
  const principais: MediaItem[] = [
    { id: 'a-geral', mediaId: 'm1', url: 'https://x/1.jpg', type: 'image', duration: 10 },
    { id: 'a-da-zona-2', mediaId: 'm2', url: 'https://x/2.jpg', type: 'image', duration: 10 },
  ];
  const resposta = (excluir: string[]) => ({ status: 'SUCCESS', layout: { id: 'L', versao: 1, largura: 1920, altura: 1080, cor_fundo: '#000000', zonas: [
    { id: 'z1', numero: 1, x: 0, y: 0, largura: 1440, altura: 1080, principal: true, excluir_itens: excluir, playlist: null },
    { id: 'z2', numero: 2, x: 1440, y: 0, largura: 480, altura: 1080, principal: false,
      playlist: { id: 'z2', playlist_items: [{ id: 'a-da-zona-2', position: 100001, duration: 10, media: { id: 'm2', file_url: 'https://x/2.jpg', file_type: 'image' } }] } },
  ] } });

  it('não se repete na zona principal; aparece só na zona dele', () => {
    const l = mapLayoutPayload(resposta(['a-da-zona-2']), principais, 'https://base', widgetDesenhavel)!;
    expect(l.zonas[0].itens.map((i) => i.id)).toEqual(['a-geral']);
    expect(l.zonas[1].itens.map((i) => i.id)).toEqual(['a-da-zona-2']);
  });

  it('sem nada a excluir, a principal toca a playlist da tela inteira', () => {
    expect(mapLayoutPayload(resposta([]), principais, 'https://base')!.zonas[0].itens).toHaveLength(2);
  });

  it('banco: anúncio geral entra nas zonas que recebem anúncios; o fixado numa zona, só nela', () => {
    expect(sql).toContain('AND ((pa.zona_numero IS NULL AND coalesce(p_com_anuncios, true)) OR (pa.zona_numero IS NOT NULL AND pa.zona_numero = p_zona))');
    expect(sql).not.toMatch(/CREATE OR REPLACE FUNCTION public\.get_player_playlist_for_screen/);
    // anunciar numa zona reaproveita o fluxo de sempre (moderação, valor, cobrança) e exige zona disponível
    expect(sql).toContain('v_r := public.anunciar_no_ponto(p_ponto, p_asset, p_telas);');
    expect(sql).toContain('z.numero = p_zona AND z.visivel AND z.anuncios_pagos');
  });
});

describe('relatório por zona', () => {
  it('o resumo permanente guarda a zona (0 = tela cheia) e a faxina resume por zona', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS zona_numero integer NOT NULL DEFAULT 0');
    expect(sql).toContain('ADD PRIMARY KEY (dia, screen_id, media_id, zona_numero)');
    expect(sql).toContain('ON CONFLICT (dia, screen_id, media_id, zona_numero) DO UPDATE');
    expect(sql).toContain('coalesce(zona_numero, 0) AS zona');
  });
});

describe('painel da rede e mapa', () => {
  it('resumo do estabelecimento no formato pedido', () => {
    expect(resumoDoEstabelecimento({ telas: 6, online: 5, offline: 1 })).toBe('6 telas · 5 online · 1 offline');
    expect(resumoDoEstabelecimento({ telas: 1, online: 0, offline: 1 })).toBe('1 tela · 0 online · 1 offline');
  });

  it('o mapa tem os 27 estados, cada um num lugar próprio', () => {
    const ufs = Object.keys(GRADE_DO_BRASIL);
    expect(ufs).toHaveLength(27);
    expect(ufs.every((u) => NOME_DO_ESTADO[u])).toBe(true);
    expect(new Set(Object.values(GRADE_DO_BRASIL).map(([c, l]) => `${c},${l}`)).size).toBe(27);
    // norte em cima, sul embaixo; litoral nordestino à direita
    expect(GRADE_DO_BRASIL.RR[1]).toBeLessThan(GRADE_DO_BRASIL.RS[1]);
    expect(GRADE_DO_BRASIL.AC[0]).toBeLessThan(GRADE_DO_BRASIL.PE[0]);
  });

  it('destaca só os estados com presença e mostra a quantidade', () => {
    render(<MapaDoBrasil presenca={[{ uf: 'PE', total: 10 }, { uf: 'SP', total: 7 }, { uf: 'XX', total: 3 }]} rotulo="telas" />);
    const mapa = screen.getByTestId('mapa-do-brasil');
    const ativos = [...mapa.querySelectorAll('[data-ativo="sim"]')].map((e) => e.getAttribute('data-uf'));
    expect(ativos.sort()).toEqual(['PE', 'SP']);
    expect(mapa.querySelector('[data-uf="PE"]')!.textContent).toBe('PE10');
    expect(mapa.querySelectorAll('[data-uf]')).toHaveLength(27);
  });

  it('a rede interna não é chamável sem login', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fn_rede_por_estabelecimento(integer) FROM public, anon;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fn_rede_por_uf() FROM public, anon;');
  });
});

describe('"Nossos Clientes": só o autorizado e só o permitido', () => {
  const publica = trecho('CREATE OR REPLACE FUNCTION public.fn_rede_publica()', 'GRANT EXECUTE ON FUNCTION public.fn_rede_publica()');

  it('o padrão é não aparecer; só dono/administrador autoriza', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS exibir_publicamente boolean NOT NULL DEFAULT false');
    expect(trecho('CREATE OR REPLACE FUNCTION public.fn_definir_cliente_publico', '$$;')).toContain('IF NOT public.fn_eh_owner_ou_admin() THEN');
  });

  it('em público saem apenas nome, logo, cidade e UF', () => {
    expect(publica).toContain('WHERE c.exibir_publicamente AND c.deleted_at IS NULL');
    expect(publica).toContain("jsonb_build_object('nome', a.nome, 'logo', CASE WHEN a.logo ~ '^https://' THEN a.logo END, 'cidade', a.cidade, 'uf', a.uf)");
    for (const proibido of ['cnpj', 'email', 'telefone', 'whatsapp', 'logradouro', 'cep', 'valor', 'contrato', 'representante', 'ip_address', 'device']) {
      expect(publica.toLowerCase()).not.toContain(proibido);
    }
  });

  it('a página inicial some com a seção quando não há cliente autorizado', () => {
    const comp = readFileSync('src/components/rede/RedePublica.tsx', 'utf8');
    expect(comp).toContain('if (!dados) return null;');
    expect(comp).toContain('if (Array.isArray(d.clientes) && d.clientes.length > 0)');
  });
});
