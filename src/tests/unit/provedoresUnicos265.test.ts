// F-265 (MG-AUT-05) — fonte única de provedores de IA e política de custo FREE-FIRST.
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import {
  PROVEDORES, ORDEM_TEXTO_GRATIS, provedoresDeTextoGratis, exigeConfirmacao, estimarCusto, textoGratis, statusDosProvedores,
} from '../../../supabase/functions/_shared/ia/provedores';
import * as repasse from '../../../supabase/functions/_shared/studio/provedores';
import { PROVEDORES as DO_AGENTE } from '../../../supabase/functions/_shared/agente/ferramentas';

afterEach(() => vi.unstubAllGlobals());

describe('provedores — fonte única (MG-AUT-05)', () => {
  it('o Studio e o agente-ia leem do MESMO cadastro (não há segunda lista)', () => {
    expect(repasse.PROVEDORES).toBe(PROVEDORES);
    expect(DO_AGENTE.map((p) => p.id)).toEqual([...ORDEM_TEXTO_GRATIS]);
    expect(DO_AGENTE.map((p) => p.nome)).toEqual(['Groq', 'Google AI Studio', 'OpenRouter']);
    for (const p of DO_AGENTE) expect(p.url).toBe(PROVEDORES.find((x) => x.id === p.id)!.chat!.url);
    // nenhuma URL de provedor de texto escrita fora do módulo único
    for (const f of ['supabase/functions/_shared/agente/ferramentas.ts', 'supabase/functions/agente-ia/index.ts', 'supabase/functions/studio-orquestrador/index.ts']) {
      expect(fs.readFileSync(f, 'utf8'), f).not.toMatch(/api\.groq\.com|generativelanguage\.googleapis|openrouter\.ai\/api/);
    }
  });

  it('o caminho automático de texto só tem provedor grátis (sem fallback pago em silêncio)', () => {
    for (const p of provedoresDeTextoGratis()) expect(p.custo).toBe('gratuito_na_cota');
    const env = (k: string) => ({ OPENROUTER_API_KEY: 'x', OPENAI_API_KEY: 'y' } as Record<string, string>)[k];
    expect(textoGratis(env)?.provedor).toBe('openrouter-texto');
    expect(textoGratis(() => undefined)).toBeNull(); // sem chave grátis → nada (nunca cai para pago)
  });

  it('pago exige confirmação e liberação do dono; a estimativa aparece antes', () => {
    const pagos = PROVEDORES.filter((p) => p.custo === 'pago').map((p) => p.id);
    expect(pagos).toEqual(expect.arrayContaining(['cf-lucid-origin', 'video-ia']));
    for (const id of pagos) expect(exigeConfirmacao(PROVEDORES.find((p) => p.id === id)!)).toBe(true);
    expect(exigeConfirmacao(PROVEDORES.find((p) => p.id === 'cf-flux-schnell')!)).toBe(false);
    expect(estimarCusto('cf-flux-schnell', 4)).toMatchObject({ pago: false, neurons: 384, usd: 0 });
    expect(estimarCusto('cf-lucid-origin', 2)).toMatchObject({ pago: true, usd: 0.174 });
    const comChaves = (k: string) => (['TABLOIDE_IA_URL', 'TABLOIDE_IA_SEGREDO'].includes(k) ? 'x' : undefined);
    expect(statusDosProvedores(comChaves).find((p) => p.id === 'cf-lucid-origin')!.disponivel).toBe(false);
    expect(statusDosProvedores((k) => (k === 'STUDIO_PERMITIR_IMAGEM_PAGA' ? '1' : comChaves(k))).find((p) => p.id === 'cf-lucid-origin')!.disponivel).toBe(true);
  });

  it('o executor de texto chama a URL do cadastro com a chave do servidor e devolve o provedor usado', async () => {
    const chamadas: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => { chamadas.push(url); return new Response(JSON.stringify({ choices: [] }), { status: 200 }); }));
    const e = textoGratis((k) => (k === 'GROQ_API_KEY' ? 'k' : undefined))!;
    await e.exec('qualquer', { messages: [] });
    expect(chamadas).toEqual(['https://api.groq.com/openai/v1/chat/completions']);
    expect(e).toMatchObject({ provedor: 'groq-texto', modelo: 'openai/gpt-oss-120b' });
  });
});
