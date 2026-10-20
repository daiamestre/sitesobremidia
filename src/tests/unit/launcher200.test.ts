import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { appOcultoNaLauncher, nomeDaRegra, OCULTOS_PADRAO, regraQueOculta } from '@/lib/launcherApps';
import { temLauncher } from '@/components/screens/LauncherDaTela';

const ler = (p: string) => fs.readFileSync(p, 'utf8');

describe('F-200 launcher Sobre Mídia', () => {
  it('esconde YouTube, Netflix e apps de TV e mostra os outros (mesma regra do Player)', () => {
    const oculto = (p: string, n: string) => appOcultoNaLauncher(p, n, OCULTOS_PADRAO, []);
    expect(oculto('com.google.android.youtube', 'YouTube')).toBe(true);
    expect(oculto('com.netflix.mediaclient', 'Netflix')).toBe(true);
    expect(oculto('com.exemplo.canais', 'TV ao vivo')).toBe(true);
    expect(oculto('org.xbmc.kodi', 'Kodi')).toBe(true);
    expect(oculto('com.android.chrome', 'Chrome')).toBe(false);
    expect(oculto('com.teamviewer.host.market', 'TeamViewer Host')).toBe(false);
    expect(appOcultoNaLauncher('com.netflix.mediaclient', 'Netflix', OCULTOS_PADRAO, ['com.netflix.mediaclient'])).toBe(false);
    expect(regraQueOculta('com.exemplo.canais', 'TV ao vivo', OCULTOS_PADRAO)).toBe('re:\\btv\\b');
    expect(nomeDaRegra('re:\\btv\\b')).toContain('apps de TV');
  });

  it('as regras padrão do painel e do Player são as mesmas', () => {
    const kotlin = ler('native-android-player/app/src/main/java/com/antigravity/player/launcher/LauncherPolicy.kt');
    for (const r of OCULTOS_PADRAO) expect(kotlin).toContain(`"${r.replace(/\\/g, '\\\\')}"`);
    const sql = ler('supabase/migrations/20261342_launcher_sobre_midia.sql');
    for (const r of OCULTOS_PADRAO) expect(sql).toContain(`'${r}'`);
  });

  it('comandos da launcher só a partir do Player 5.8.0 e só para dono/ADM', () => {
    expect(temLauncher('5.8.0-MicroGate')).toBe(true);
    expect(temLauncher('5.7.10-MicroGate')).toBe(false);
    expect(temLauncher(null)).toBe(false);
    const comp = ler('src/components/screens/LauncherDaTela.tsx');
    expect(comp).toContain("isOwner || perfilNome === 'OWNER' || perfilNome === 'ADMIN'");
    expect(ler('supabase/migrations/20261343_launcher_so_dono_e_adm.sql')).toContain('NOT public.fn_biblioteca_admin()');
  });

  it('página, menu, rota e Minha Marca ligados', () => {
    expect(ler('src/App.tsx')).toContain('<Route path="launcher" element={<RequireRole roles={[\'OWNER\', \'ADMIN\']}><LauncherPage /></RequireRole>} />');
    expect(ler('src/modules/crm/components/Sidebar.tsx')).toContain("label: 'Launcher', icon: Smartphone, path: '/workspace/launcher'");
    expect(ler('src/pages/dashboard/ScreenDetails.tsx')).toContain('<LauncherDaTela');
    expect(ler('src/pages/dashboard/MinhaMarca.tsx')).toContain('launcher Sobre Mídia');
  });
});
