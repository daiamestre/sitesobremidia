/**
 * F-144 — Minha Marca: capa (a mesma do perfil) e imagem que o Player mostra depois do login.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const ler = (p: string) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const pagina = ler('src/pages/dashboard/MinhaMarca.tsx');
const perfil = ler('src/components/perfil/MeuPerfilBase.tsx');
const migracao = ler('supabase/migrations/20261302_marca_usa_foto_de_perfil.sql');
const player = ler('native-android-player/app/src/main/java/com/antigravity/player/util/MarcaDoGestor.kt');

describe('F-144 — Minha Marca', () => {
  it('a capa de Minha Marca é a mesma do perfil (mesmo serviço, sem coluna nova)', () => {
    expect(pagina).toContain('perfilService.uploadCapa(arquivo)');
    expect(pagina).toContain('perfilService.removerCapa()');
    expect(pagina).toContain('usuario?.capa_url');
    expect(pagina).toContain('data-testid="capa-marca"');
    expect(migracao).not.toMatch(/ADD COLUMN/i);
  });

  it('o gestor de mídias também vê a capa em "Meu Perfil"', () => {
    expect(perfil).toMatch(/const temCapa = .*perfilNome === 'GESTOR'.*variante === 'GESTOR'/);
  });

  it('o Player recebe o logo; sem logo, a foto de perfil — e nunca a capa', () => {
    expect(migracao).toContain("'logo_url', coalesce(m.logo_url, CASE WHEN u.avatar_url ~ '^https://' THEN u.avatar_url END)");
    const corpo = migracao.slice(migracao.indexOf('CREATE OR REPLACE FUNCTION')); // sem os comentários do cabeçalho
    expect(corpo).not.toMatch(/capa/i);
    expect(player).not.toMatch(/capa/i);
    expect(migracao).toContain('m.usuario_id = auth.uid() AND m.usar_no_player');
  });

  it('a prévia mostra a mesma imagem que o Player vai mostrar', () => {
    expect(pagina).toContain('const imagemDaMarca = m.logo_url || fotoDePerfil;');
    expect(pagina).toMatch(/previa-marca-player[\s\S]*\{imagemDaMarca\s*\n\s*\? <img src=\{imagemDaMarca\}/);
  });
});
