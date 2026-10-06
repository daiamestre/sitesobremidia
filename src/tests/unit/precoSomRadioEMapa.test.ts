/**
 * F-150 — Preço por zona, som só na mídia principal, Rádio Comércio, gráfico por zona e mapa automático da rede.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { doBanco, novaZona, paraSalvar } from '@/lib/layoutZonas';
import {
  ALTURA_DO_MAPA, APROXIMACAO_DAS_CIDADES, LARGURA_DO_MAPA, caixaDoEstado, caminhoDoEstado, detalheDaContagem, montarPresenca, normalizarNome, projetar,
  type LinhaDePresenca, type Municipios,
} from '@/lib/redePresenca';
import { duracaoDaFaixa, duracaoTotal, modoDeSomDaTela, proximaFaixa } from '@/lib/radio';
import { assinaturaDaRadio, mapRadioPayload } from '@/components/player/RadioDoPlayer';

const sql = readFileSync('supabase/migrations/20261306_preco_por_zona_som_radio_e_presenca.sql', 'utf8');
const trecho = (inicio: string, fim: string) => { const a = sql.indexOf(inicio); expect(a).toBeGreaterThan(-1); return sql.slice(a, sql.indexOf(fim, a + inicio.length)); };

describe('preço por zona', () => {
  it('o valor da zona vai para o banco com duas casas; vazio = vale o valor da tela', () => {
    const z = novaZona({ x: 0, y: 0, largura: 480, altura: 1080 }, [], 1920, 1080);
    expect(z.valor_anuncio).toBeNull();
    expect(paraSalvar([{ ...z, valor_anuncio: 149.899 }])[0].valor_anuncio).toBe(149.9);
    expect(paraSalvar([{ ...z, valor_anuncio: null }])[0].valor_anuncio).toBeNull();
    expect(doBanco({ id: 'a', numero: 2, x: 0, y: 0, largura: 10, altura: 10, valor_anuncio: '149.90' }).valor_anuncio).toBe(149.9);
    expect(doBanco({ id: 'a', numero: 2, x: 0, y: 0, largura: 10, altura: 10, valor_anuncio: null }).valor_anuncio).toBeNull();
  });

  it('o campo de valor aparece no painel da zona (na hora de criar a zona)', () => {
    const editor = readFileSync('src/components/screens/EditorDeZonas.tsx', 'utf8');
    expect(editor).toContain('data-testid="valor-da-zona"');
    expect(editor).toContain('Valor para anunciar nesta zona (R$ por mês)');
  });

  it('anunciar numa zona com valor próprio cobra o valor da zona, só com a cobrança ainda pendente', () => {
    const f = trecho('CREATE OR REPLACE FUNCTION public.anunciar_no_ponto_na_zona', '$$;');
    expect(f).toContain("IF v_r->>'origem' = 'PORTAL' AND v_sem_preco = 0 AND v_preco > 0 THEN");
    expect(f).toContain("c.status = 'PENDENTE'");
    expect(sql).toContain("'valor', z.valor_anuncio)");
  });
});

describe('som: só a mídia principal, comandado pela tela', () => {
  it('zona nunca tem som (editor, envio e banco)', () => {
    const z = novaZona({ x: 0, y: 0, largura: 100, altura: 100 }, [], 1920, 1080);
    expect(paraSalvar([{ ...z, audio: true }])[0].audio).toBe(false);
    expect(doBanco({ id: 'a', numero: 1, x: 0, y: 0, largura: 1, altura: 1, audio: true }).audio).toBe(false);
    expect(readFileSync('src/components/screens/EditorDeZonas.tsx', 'utf8')).not.toContain('Som desta zona');
    expect(sql).toContain('UPDATE public.layout_zones SET audio = false WHERE audio;');
    expect(trecho('CREATE OR REPLACE FUNCTION public.fn_salvar_layout_da_tela(', '$$;')).toContain("v_principal, false, coalesce((z->>'anuncios_pagos')::boolean, true), v_playlist,");
  });

  it('o Player web deixa as zonas mudas; só a principal segue a chave de som da tela', () => {
    const zonas = readFileSync('src/components/player/ZonasDoPlayer.tsx', 'utf8');
    expect(zonas).toContain('{...(zona.principal && somLiberado ? { muted: false } : {})}');
    expect(zonas).not.toContain('zona.audio');
  });

  it('quem liga o som é a tela; com a rádio ligada, as mídias ficam mudas', () => {
    expect(sql).toContain("'audio_enabled', (COALESCE(v_screen.audio_enabled, false) AND NOT COALESCE(v_screen.radio_ativa, false)),");
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS radio_ativa boolean NOT NULL DEFAULT false');
  });

  it('as três opções do painel', () => {
    expect(modoDeSomDaTela({})).toBe('MUDO'); // toda tela nasce sem áudio
    expect(modoDeSomDaTela({ audio_enabled: false, radio_ativa: false })).toBe('MUDO');
    expect(modoDeSomDaTela({ audio_enabled: true })).toBe('MIDIAS');
    expect(modoDeSomDaTela({ audio_enabled: true, radio_ativa: true, radio_playlist_id: 'r1' })).toBe('RADIO');
    expect(modoDeSomDaTela({ radio_ativa: true, radio_playlist_id: null })).toBe('MUDO'); // rádio sem playlist não toca
    const cartao = readFileSync('src/components/radio/SomDaTela.tsx', 'utf8');
    for (const t of ['data-testid={`som-${m.toLowerCase()}`}', 'Adicionar áudio nesta tela']) expect(cartao).toContain(t);
  });
});

describe('Rádio Comércio', () => {
  it('ordem das faixas: em sequência, ou sorteada sem repetir a que acabou de tocar', () => {
    expect(proximaFaixa(3, 0, false)).toBe(1);
    expect(proximaFaixa(3, 2, false)).toBe(0);
    expect(proximaFaixa(1, 0, true)).toBe(0);
    expect(proximaFaixa(0, 0, false)).toBe(-1);
    for (let atual = 0; atual < 4; atual++) for (const s of [0, 0.3, 0.6, 0.999]) {
      const n = proximaFaixa(4, atual, true, () => s);
      expect(n).not.toBe(atual);
      expect(n).toBeGreaterThanOrEqual(0); expect(n).toBeLessThan(4);
    }
  });

  it('duração por faixa e total', () => {
    expect(duracaoDaFaixa(185000)).toBe('3:05');
    expect(duracaoDaFaixa(null)).toBe('—');
    expect(duracaoTotal([{ duracao_ms: 180000 }, { duracao_ms: 300000 }])).toBe('8 min');
    expect(duracaoTotal([{ duracao_ms: 3600000 }, { duracao_ms: 720000 }])).toBe('1 h 12 min');
    expect(duracaoTotal([])).toBe('—');
  });

  it('contrato do Player: só faixas com endereço válido; sem rádio, sem acesso ou inválido = silêncio', () => {
    const r = mapRadioPayload({ status: 'SUCCESS', radio: { playlist_id: 'p', volume: 140, embaralhar: true, faixas: [
      { id: 'a', url: 'https://x/a.mp3' }, { id: 'b', url: null }, { id: 'c', url: 'javascript:alert(1)' }, { url: 'https://x/sem-id.mp3' }] } })!;
    expect(r.faixas).toEqual([{ id: 'a', url: 'https://x/a.mp3' }]);
    expect(r.volume).toBe(100);
    expect(r.embaralhar).toBe(true);
    expect(mapRadioPayload({ status: 'SEM_RADIO' })).toBeNull();
    expect(mapRadioPayload({ status: 'SEM_ACESSO' })).toBeNull();
    expect(mapRadioPayload({ status: 'SUCCESS', radio: { playlist_id: 'p', faixas: [] } })).toBeNull();
    expect(mapRadioPayload('lixo')).toBeNull();
    expect(assinaturaDaRadio(null)).toBe('');
    expect(assinaturaDaRadio(r)).toBe(assinaturaDaRadio({ ...r, volume: 10 })); // mudar o volume não reinicia a rádio
  });

  it('banco: só áudio entra na rádio; só o aparelho da tela recebe; tabelas fechadas para quem não tem login', () => {
    expect(sql).toContain("m.id = radio_playlist_itens.media_id AND m.file_type = 'audio'");
    expect(trecho('CREATE OR REPLACE FUNCTION public.get_player_radio_for_screen', '$$;')).toContain('v_tela.bound_device_id IS DISTINCT FROM p_device_id');
    expect(sql).toContain('REVOKE ALL ON public.radio_playlists, public.radio_playlist_itens FROM anon, public;');
    expect(trecho('CREATE OR REPLACE FUNCTION public.fn_definir_som_da_tela', '$$;')).toContain('IF NOT public.fn_pode_gerir_layout_da_tela(p_screen) THEN');
  });

  it('página e menu existem', () => {
    expect(readFileSync('src/App.tsx', 'utf8')).toContain('<Route path="radio" element={<RadioComercio />} />');
    expect(readFileSync('src/components/dashboard/Sidebar.tsx', 'utf8')).toContain("label: 'Rádio Comércio', path: '/dashboard/radio'");
  });
});

describe('gráfico de exibições por zona', () => {
  it('tela inteira, tela principal (tela cheia + zona principal) ou uma zona', () => {
    const f = trecho('CREATE OR REPLACE FUNCTION public.fn_playback_stats_zona', '$$;');
    expect(f).toContain('p_zona IS NULL');
    expect(f).toContain('(p_zona = 0 AND coalesce(pl.zona_numero, 0) IN (0, pr.numero))');
    expect(f).toContain('(p_zona > 0 AND pl.zona_numero = p_zona AND p_zona <> pr.numero)');
    expect(f).toContain('public.exibicoes_diarias'); // o histórico antigo também entra
    const tela = readFileSync('src/pages/dashboard/ScreenDetails.tsx', 'utf8');
    expect(tela).toContain("queryKey: ['screen-stats', resolvedId, statsPeriod, statsZona]");
    expect(tela).toContain('<SeletorDeZonaDoGrafico telaId={resolvedId} valor={statsZona} onChange={setStatsZona} />');
  });
});

describe('mapa automático da rede', () => {
  const municipios: Municipios = {
    PE: [['Caruaru', -8.285, -35.97], ['Recife', -8.047, -34.877], ['Santa Cruz do Capibaribe', -7.948, -36.206], ['Cachoeirinha', -8.487, -36.24]],
    SP: [['São Paulo', -23.533, -46.64]],
    RS: [['Cachoeirinha', -29.947, -51.101]],
  };
  const l = (cidade: string | null, uf: string | null, a = 0, p = 0, g = 0): LinhaDePresenca => ({ cidade, uf, anunciantes: a, pontos: p, gestores: g, total: a + p + g });

  it('o exemplo do proprietário: quantidade em cada cidade e o total no estado', () => {
    const r = montarPresenca([l('Recife', 'PE', 5), l('Caruaru', 'PE', 8, 1, 1), l('Santa Cruz do Capibaribe', 'PE', 4)], municipios);
    const pe = r.estados[0];
    expect(pe.uf).toBe('PE');
    expect(pe.total).toBe(19);
    expect(pe.cidades.map((c) => [c.nome, c.total])).toEqual([['Caruaru', 10], ['Recife', 5], ['Santa Cruz do Capibaribe', 4]]);
    expect(detalheDaContagem(pe.cidades[0])).toBe('8 anunciantes · 1 gestor de mídias · 1 ponto parceiro');
    expect(r.total.total).toBe(19);
    expect(r.cidades).toBe(3);
  });

  it('grafias diferentes da mesma cidade se somam; cidade sem UF vale quando o nome é único no Brasil', () => {
    const r = montarPresenca([l('Sao Paulo', 'SP', 57), l('São Paulo', 'SP', 16), l(' SÃO PAULO ', null, 27), l('Caruaru', null, 8), l('caruaru', 'pe', 2)], municipios);
    expect(r.estados.find((e) => e.uf === 'SP')!.cidades).toEqual([expect.objectContaining({ nome: 'São Paulo', total: 100 })]);
    expect(r.estados.find((e) => e.uf === 'PE')!.cidades[0]).toMatchObject({ nome: 'Caruaru', total: 10 });
    expect(normalizarNome(' São  Paulo ')).toBe('sao paulo');
  });

  it('nome repetido em vários estados sem UF não é chutado; cidade desconhecida conta só no estado', () => {
    const r = montarPresenca([l('Cachoeirinha', null, 3), l('Cidade Que Não Existe', 'PE', 2), l(null, 'SP', 1), l('Cachoeirinha', 'RS', 4)], municipios);
    expect(r.naoLocalizados).toBe(3);
    const pe = r.estados.find((e) => e.uf === 'PE')!;
    expect([pe.total, pe.cidades.length, pe.semCidade]).toEqual([2, 0, 2]);
    expect(r.estados.find((e) => e.uf === 'SP')!.semCidade).toBe(1);
    expect(r.estados.find((e) => e.uf === 'RS')!.cidades[0]).toMatchObject({ nome: 'Cachoeirinha', total: 4 });
  });

  it('projeção: norte em cima, leste à direita, tudo dentro do desenho', () => {
    const [xRecife, yRecife] = projetar(-34.877, -8.047);
    const [xPortoAlegre, yPortoAlegre] = projetar(-51.23, -30.03);
    const [xRioBranco] = projetar(-67.81, -9.97);
    expect(yRecife).toBeLessThan(yPortoAlegre);
    expect(xRioBranco).toBeLessThan(xRecife);
    for (const v of [xRecife, xPortoAlegre, xRioBranco]) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(LARGURA_DO_MAPA); }
    for (const v of [yRecife, yPortoAlegre]) { expect(v).toBeGreaterThan(0); expect(v).toBeLessThan(ALTURA_DO_MAPA); }
    expect(APROXIMACAO_DAS_CIDADES).toBeGreaterThan(1);
  });

  it('os arquivos do mapa: 27 estados com contorno e os municípios do Brasil', () => {
    const ufs = JSON.parse(readFileSync('public/geo/brasil-ufs.json', 'utf8')) as Array<{ uf: string; nome: string; aneis: number[][][] }>;
    const mun = JSON.parse(readFileSync('public/geo/brasil-municipios.json', 'utf8')) as Municipios;
    expect(ufs).toHaveLength(27);
    expect(ufs.every((u) => /^[A-Z]{2}$/.test(u.uf) && u.aneis.length >= 1 && u.aneis[0].length >= 8)).toBe(true);
    expect(Object.keys(mun)).toHaveLength(27);
    expect(Object.values(mun).reduce((s, a) => s + a.length, 0)).toBeGreaterThan(5500);
    const pe = ufs.find((u) => u.uf === 'PE')!;
    expect(caminhoDoEstado(pe.aneis).startsWith('M')).toBe(true);
    // Caruaru cai dentro da caixa de Pernambuco no desenho
    const caruaru = mun.PE.find((m) => m[0] === 'Caruaru')!;
    const [x, y] = projetar(caruaru[2], caruaru[1]);
    const caixa = caixaDoEstado(pe.aneis);
    expect(x).toBeGreaterThan(caixa.x); expect(x).toBeLessThan(caixa.x + caixa.largura);
    expect(y).toBeGreaterThan(caixa.y); expect(y).toBeLessThan(caixa.y + caixa.altura);
  });

  it('os números saem do cadastro (anunciantes, gestores e pontos parceiros) e só números vão a público', () => {
    const f = trecho('CREATE OR REPLACE FUNCTION public.fn_rede_presenca()', 'GRANT EXECUTE ON FUNCTION public.fn_rede_presenca()');
    for (const fonte of ['FROM public.clientes c', 'FROM public.pontos p', "upper(pf.nome) = 'GESTOR'"]) expect(f).toContain(fonte);
    expect(f).toContain("jsonb_build_object('cidade', x.cidade, 'uf', x.uf, 'anunciantes', x.anunciantes, 'pontos', x.pontos,");
    for (const proibido of ['nome_fantasia', 'razao_social', 'cnpj', 'email', 'telefone', 'logradouro', 'valor']) expect(f.toLowerCase()).not.toContain(proibido);
    // o gestor novo grava cidade e estado separados no cadastro
    expect(readFileSync('src/services/prospeccao.service.ts', 'utf8')).toContain('cidade: dados.cidade?.trim() || null,');
  });
});
