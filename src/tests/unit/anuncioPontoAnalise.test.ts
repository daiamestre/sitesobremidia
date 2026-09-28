import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// F-110 — análise da mídia, escolha de telas, pagamento antes de ir ao ar.
const ler = (...p: string[]) => readFileSync(path.join(process.cwd(), ...p), 'utf8');

describe('Anúncio em ponto parceiro (F-110)', () => {
  const sql = ler('supabase', 'migrations', '20261280_anuncio_ponto_analise_pagamento.sql');

  it('mídia nasce pendente; vídeo > 30 s recusado; só sistema/OWNER/ADMIN decidem', () => {
    expect(sql).toContain("NEW.moderacao_status := 'PENDENTE';  -- quem envia nunca escolhe o resultado");
    expect(sql).toContain("coalesce(NEW.duracao, 0) > 30");
    expect(sql).toContain('A análise da mídia só é feita pelo sistema.');
  });

  it('pago → ATIVO (+1 mês); 4 dias de atraso → SUSPENSO; Player respeita telas e ordem de entrada', () => {
    expect(sql).toContain("SET status = 'ATIVO', ativado_em = coalesce(pa.ativado_em, now())");
    expect(sql).toContain("pa.valido_ate + 4 <= v_hoje");
    expect(sql).toContain('AND (pa.telas IS NULL OR v_screen.id = ANY (pa.telas))');
    expect(sql).toContain('ORDER BY coalesce(pa.ativado_em, pa.created_at), pa.id');
  });

  it('robô: sem chave de IA vai para análise manual (nunca aprova sem análise)', () => {
    const robo = ler('supabase', 'functions', 'analisar-midia', 'index.ts');
    expect(robo).toContain("if (!chave) return manual(srv, a, 'Aguardando análise da equipe.');");
    expect(robo).toContain("return manual(srv, a, motivo ? `Robô em dúvida: ${motivo}` : 'Robô em dúvida.');");
  });

  it('Minhas Mídias: envio usa signedUrl (antes falhava), diretrizes e limite de 30 s', () => {
    const pagina = ler('src', 'modules', 'crm', 'pages', 'portal', 'AssetLibraryPage.tsx');
    expect(pagina).toContain('data?.signedUrl');
    expect(pagina).not.toContain('uploadData?.uploadUrl');
    expect(pagina).toContain('<DiretrizesConteudo />');
    expect(pagina).toContain('DURACAO_MAXIMA_VIDEO');
    const diretrizes = ler('src', 'components', 'portal', 'DiretrizesConteudo.tsx');
    expect(diretrizes).toContain('Vídeos com duração máxima de');
    expect(diretrizes).toContain('cunho racista');
  });
});
