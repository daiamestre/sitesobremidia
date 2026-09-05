import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('MICRO-GATE 05.1: Auditoria e Validação das Rotas de Perfil', () => {
  const appFile = fs.readFileSync(path.join(process.cwd(), 'src', 'App.tsx'), 'utf8');

  it('App.tsx registra lazy imports para as 4 páginas canônicas de perfil', () => {
    expect(appFile).toContain('const MeuPerfilOwnerPage = lazyWithRetry(() => import("./pages/perfil/MeuPerfilOwnerPage"));');
    expect(appFile).toContain('const MeuPerfilRepresentantePage = lazyWithRetry(() => import("./pages/perfil/MeuPerfilRepresentantePage"));');
    expect(appFile).toContain('const MeuPerfilGestorPage = lazyWithRetry(() => import("./pages/perfil/MeuPerfilGestorPage"));');
    expect(appFile).toContain('const MeuPerfilAnunciantePage = lazyWithRetry(() => import("./pages/perfil/MeuPerfilAnunciantePage"));');
  });

  it('Rota /workspace/perfil está conectada a MeuPerfilOwnerPage (não AdminUsers)', () => {
    const workspaceSection = appFile.match(/<Route path="\/workspace"[\s\S]*?<\/Route>/);
    expect(workspaceSection).toBeTruthy();
    expect(workspaceSection![0]).toMatch(/<Route path="perfil" element={<MeuPerfilOwnerPage \/>}/);
    expect(workspaceSection![0]).not.toMatch(/<Route path="perfil" element={<AdminUsers \/>}/);
  });

  it('Rota /representantes/perfil está conectada a MeuPerfilRepresentantePage (não AdminUsers)', () => {
    const repSection = appFile.match(/<Route path="\/representantes"[\s\S]*?<\/Route>/);
    expect(repSection).toBeTruthy();
    expect(repSection![0]).toMatch(/<Route path="perfil" element={<MeuPerfilRepresentantePage \/>}/);
    expect(repSection![0]).not.toMatch(/<Route path="perfil" element={<AdminUsers \/>}/);
  });

  it('Rota /dashboard/perfil existe sob /dashboard conectada a MeuPerfilGestorPage', () => {
    const dashSection = appFile.match(/<Route path="\/dashboard"[\s\S]*?<\/Route>/);
    expect(dashSection).toBeTruthy();
    expect(dashSection![0]).toMatch(/<Route path="perfil" element={<MeuPerfilGestorPage \/>}/);
  });

  it('Rota /portal/perfil existe sob /portal conectada a MeuPerfilAnunciantePage', () => {
    const portalSection = appFile.match(/<Route path="\/portal"[\s\S]*?<\/Route>/);
    expect(portalSection).toBeTruthy();
    expect(portalSection![0]).toMatch(/<Route path="perfil" element={<MeuPerfilAnunciantePage \/>}/);
  });

  it('AdminUsers permanece registrado exclusivamente para administração (/dashboard/admin/users)', () => {
    expect(appFile).toContain('<Route path="admin/users" element={<AdminUsers />} />');
  });
});
