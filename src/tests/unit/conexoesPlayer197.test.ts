/** F-197 — conexões painel ↔ Player: versão do app pelo sinal da tela. */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const ler = (p: string) => readFileSync(p, 'utf8');

describe('F-197 · versão do aplicativo no painel', () => {
  it('o banco copia a versão do sinal (screens.version) para app_version', () => {
    const s = ler('supabase/migrations/20261338_versao_do_app_pelo_sinal.sql');
    expect(s).toContain('BEFORE UPDATE OF version ON public.screens');
    expect(s).toContain('NEW.app_version := NEW.version;');
  });
  it('cartão da tela e atualização do aplicativo preferem a versão do sinal', () => {
    expect(ler('src/components/screens/CartaoDaTela.tsx')).toContain('const versao = tela.version || tela.app_version;');
    expect(ler('src/components/screens/AtualizacaoDoAplicativo.tsx')).toContain('const atual = tela.version || tela.app_version || null;');
  });
});
