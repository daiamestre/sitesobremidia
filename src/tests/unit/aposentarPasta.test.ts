/**
 * F-163 — A pasta "Vídeos Esporte" acabou (decisão do proprietário, 08/10/2026): o robô não busca mais vídeos de esporte
 * e a pasta, as mídias e os arquivos do R2 foram apagados. Esportes, Futebol e os campeonatos NÃO são tocados.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PASTAS_VIDEO } from '../../../scripts/conteudo/produtores/videos.mjs';

const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const sql = ler('supabase/migrations/20261309_aposentar_pasta_videos_esporte.sql');

describe('robô: nada de vídeo de esporte', () => {
  it('as buscas de vídeo não incluem mais a pasta de esporte, nem termos de esporte', () => {
    expect(Object.keys(PASTAS_VIDEO)).not.toContain('videos-esporte');
    expect(Object.keys(PASTAS_VIDEO).sort()).toEqual(['cinema', 'curiosidades', 'humor', 'nostalgia', 'turismo']);
    const termos = JSON.stringify(PASTAS_VIDEO).toLowerCase();
    for (const t of ['soccer', 'football', 'basketball', 'volleyball', 'tennis', 'stadium', 'marathon']) expect(termos).not.toContain(t);
  });

  it('o robô garante que a pasta sumiu e apaga os arquivos do R2; não trata mais "videos-esporte" como pasta própria', () => {
    const robo = ler('scripts/conteudo/robo.mjs');
    expect(robo).toContain("const APOSENTADAS = ['videos-esporte'];");
    expect(robo).toContain('await chamar({ aposentar: conteudo })');
    expect(robo).toContain("velho.startsWith('conteudo/')");
    expect(robo).not.toContain("conteudo === 'videos-esporte'");
  });
});

describe('banco e função de borda', () => {
  it('só apaga conteúdos da lista de aposentados e só o robô executa', () => {
    expect(sql).toContain("v_aposentados constant text[] := ARRAY['videos-esporte'];");
    expect(sql).toContain("IF p_conteudo IS NULL OR NOT (p_conteudo = ANY (v_aposentados)) THEN RAISE EXCEPTION 'conteudo_nao_aposentado'; END IF;");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.conteudo_auto_aposentar(text) FROM public, anon, authenticated;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.conteudo_auto_aposentar(text) TO service_role;');
    expect(sql).toContain('SECURITY DEFINER');
  });

  it('só apaga a mídia que não está em mais nenhum lugar (outra pasta, playlist ou playlist de cliente)', () => {
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM public.playlist_items WHERE media_id = v_bi.media_id)');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM public.cliente_playlist_itens WHERE biblioteca_media_id = v_bi.media_id)');
    expect(sql).toContain('NOT EXISTS (SELECT 1 FROM public.biblioteca_itens WHERE media_id = v_bi.media_id)');
  });

  it('só devolve arquivos da área do robô e nunca menciona as pastas de notícias de esporte nem os campeonatos', () => {
    expect(sql).toContain("IF v_bi.file_path LIKE 'conteudo/%' THEN");
    const codigo = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
    for (const intocavel of ["'esportes'", "'futebol'", 'campeonato', 'jogos-rodada']) expect(codigo).not.toContain(intocavel);
  });

  it('a função de borda aceita só a lista de aposentados', () => {
    const edge = ler('supabase/functions/conteudo-automatico/index.ts');
    expect(edge).toContain("const APOSENTADAS = ['videos-esporte'];");
    expect(edge).toContain("if (!APOSENTADAS.includes(corpo.aposentar)) return resposta(400, { error: 'conteudo_nao_aposentado' });");
    expect(edge).toContain("db.rpc('conteudo_auto_aposentar'");
  });
});

describe('documentação do robô', () => {
  it('a receita do robô não lista mais a pasta de esporte', () => {
    expect(ler('.claude/skills/conteudo-automatico/SKILL.md')).not.toMatch(/\| videos-esporte/);
  });
});
