import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Micro-Gate: SOBRE MÍDIA Visual Identity & Canonical Assets', () => {
  const rootDir = path.resolve(__dirname, '../../../');
  const publicDir = path.join(rootDir, 'public');

  it('1. [Canonical Asset] logo-3d.png must exist with exact canonical specs', () => {
    const logoPath = path.join(publicDir, 'logo-3d.png');
    expect(fs.existsSync(logoPath), 'public/logo-3d.png must exist').toBe(true);

    const buf = fs.readFileSync(logoPath);
    expect(buf.length).toBeGreaterThan(50000);
    // PNG signature
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
    expect(buf[2]).toBe(0x4e);
    expect(buf[3]).toBe(0x47);

    // Dimensions: 500x500
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    expect(width).toBe(500);
    expect(height).toBe(500);
  });

  it('2. [Favicon] favicon.ico must exist and have SOBRE MÍDIA branding, not Lovable template', () => {
    const faviconPath = path.join(publicDir, 'favicon.ico');
    expect(fs.existsSync(faviconPath), 'public/favicon.ico must exist').toBe(true);

    const buf = fs.readFileSync(faviconPath);
    // ICO signature: 0x00 0x00 0x01 0x00
    expect(buf[0]).toBe(0x00);
    expect(buf[1]).toBe(0x00);
    expect(buf[2]).toBe(0x01);
    expect(buf[3]).toBe(0x00);

    // Number of embedded images in ICO
    const count = buf.readUInt16LE(4);
    expect(count).toBeGreaterThanOrEqual(1);

    // Must NOT match old Lovable placeholder size (20373 bytes)
    expect(buf.length).not.toBe(20373);
  });

  it('3. [Favicon HTML Tags] index.html must declare canonical favicon.ico and high-res PNGs', () => {
    const indexPath = path.join(rootDir, 'index.html');
    const html = fs.readFileSync(indexPath, 'utf8');

    expect(html).toContain('rel="icon" type="image/x-icon" href="/favicon.ico"');
    expect(html).toContain('rel="shortcut icon" type="image/x-icon" href="/favicon.ico"');
    expect(html).toContain('rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png"');
    expect(html).toContain('rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png"');
    expect(html).toContain('rel="icon" type="image/png" sizes="192x192" href="/pwa-192x192.png"');
  });

  it('4. [PWA Assets] PWA icons and maskable assets must exist in public directory', () => {
    const pwa192 = path.join(publicDir, 'pwa-192x192.png');
    const pwa512 = path.join(publicDir, 'pwa-512x512.png');
    const pwaMaskable = path.join(publicDir, 'pwa-maskable-512x512.png');

    expect(fs.existsSync(pwa192), 'pwa-192x192.png must exist').toBe(true);
    expect(fs.existsSync(pwa512), 'pwa-512x512.png must exist').toBe(true);
    expect(fs.existsSync(pwaMaskable), 'pwa-maskable-512x512.png must exist').toBe(true);
  });

  it('5. [Deployment Guard] .vercelignore must explicitly preserve public assets', () => {
    const ignorePath = path.join(rootDir, '.vercelignore');
    const ignoreContent = fs.readFileSync(ignorePath, 'utf8');

    expect(ignoreContent).toContain('!public/**');
    // Global unconditional *.png must not be present
    const lines = ignoreContent.split('\n').map(l => l.trim());
    expect(lines).not.toContain('*.png');
    expect(lines).not.toContain('*.jpg');
    expect(lines).not.toContain('*.pdf');
  });

  it('6. [Git Guard] .gitignore must explicitly preserve public assets', () => {
    const gitignorePath = path.join(rootDir, '.gitignore');
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8');

    expect(gitignoreContent).toContain('!public/**');
  });

  it('7. [Player Splash] Splash.tsx must consume the canonical /logo-3d.png', () => {
    const splashPath = path.join(rootDir, 'src/components/player/Splash.tsx');
    const splashContent = fs.readFileSync(splashPath, 'utf8');

    expect(splashContent).toContain('src="/logo-3d.png"');
    expect(splashContent).not.toContain('src="/logo.png"');
  });

  it('8. [Vercel Fallback Rewrite] vercel.json must rewrite /logo.png to /logo-3d.png', () => {
    const vercelPath = path.join(rootDir, 'vercel.json');
    const vercelContent = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));

    const rewrite = vercelContent.rewrites.find((r: any) => r.source === '/logo.png');
    expect(rewrite).toBeDefined();
    expect(rewrite.destination).toBe('/logo-3d.png');
  });
});
