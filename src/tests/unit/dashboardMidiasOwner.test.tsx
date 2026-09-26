/** Frente 5: dashboard do Gestor de Mídias para Owner/ADM (dados da empresa). Resumo de TESTE no formato da RPC. */
import { describe, it, expect } from 'vitest';
import { montarAlertasMidias, versaoAnterior, type ResumoMidiasOwner } from '@/lib/dashboardResumoMidias';

const base = (o: Partial<ResumoMidiasOwner> = {}): ResumoMidiasOwner => ({
  status: 'OK', gerado_em: '2026-09-26T12:00:00Z', parametros: { offline_min: 10 },
  telas: { total: 3, online: 3, offline: 0, sem_playlist: 0, offline_itens: [], sem_playlist_itens: [], versoes: [{ versao: '5.6.1-MicroGate', qtd: 3 }] },
  exibicoes: { hoje: 120, semana: 900, serie_7d: [] },
  playlists: { total: 2, em_uso: 2, recentes: [] },
  midias: { total: 10, videos: 8, imagens: 2, semana: 1 },
  biblioteca: { pastas: 7, itens: 53, videos: 51, imagens: 2 },
  widgets: { total: 4, ativos: 4, em_playlists: 2, por_tipo: { clock: 2, sports: 2 } },
  conteudo: { esportes_publicados: 1253, esportes_ultima: null, esportes_fontes_com_falha: 0, noticias_ativas: 11, noticias_ultima: null, noticias_saude: 'HEALTHY' },
  ...o,
});

describe('dashboard de mídias do Owner/ADM', () => {
  it('versão do Player: anterior à 5.6.1 (ou desconhecida) é desatualizada', () => {
    expect(versaoAnterior('5.5.9-MicroGate')).toBe(true);
    expect(versaoAnterior('5.6.0-MicroGate')).toBe(true);
    expect(versaoAnterior('5.6.1-MicroGate')).toBe(false);
    expect(versaoAnterior('5.10.0')).toBe(false);
    expect(versaoAnterior('desconhecida')).toBe(true);
  });

  it('tudo em ordem -> alerta "Tudo funcionando"', () => {
    expect(montarAlertasMidias(base()).map((a) => a.id)).toEqual(['tudo-ok']);
  });

  it('telas offline, sem playlist, Player antigo, fonte instável, sem exibição e mensagens viram alertas', () => {
    const r = base({
      telas: { total: 4, online: 2, offline: 2, sem_playlist: 1, offline_itens: [], sem_playlist_itens: [],
        versoes: [{ versao: '5.5.9-MicroGate', qtd: 1 }, { versao: 'desconhecida', qtd: 1 }, { versao: '5.6.1-MicroGate', qtd: 2 }] },
      exibicoes: { hoje: 0, semana: 10, serie_7d: [] },
      conteudo: { esportes_publicados: 10, esportes_ultima: null, esportes_fontes_com_falha: 1, noticias_ativas: 0, noticias_ultima: null, noticias_saude: 'FAILED' },
    });
    const a = montarAlertasMidias(r, 3);
    expect(a.map((x) => x.id)).toEqual(['telas', 'sem-playlist', 'player-antigo', 'conteudo', 'sem-exibicao', 'mensagens']);
    expect(a.find((x) => x.id === 'player-antigo')?.titulo).toBe('2 aparelhos com Player desatualizado');
    expect(a.find((x) => x.id === 'telas')?.nivel).toBe('critico');
  });
});
