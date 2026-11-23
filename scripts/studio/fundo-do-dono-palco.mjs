// F-357 (pedido do dono, 23/11/2026) — FUNDO DE PALCO enviado pelo dono (arte em pé, 9:16), para a criação de vídeo.
// A arte do dono entra como ELE mandou (só ajustada ao tamanho do palco em pé, 1080×1920, sem recorte nem mudança de cor).
// Ele não manda o fundo deitado (16:9): o deitado é a MESMA arte inteira no centro, com as laterais preenchidas pela própria
// arte desfocada e escurecida (nada da arte é cortado). Se o dono mandar a versão deitada, ela substitui esta.
// A logo é sempre uma camada (o fundo não tem logo gravada), então "-st" (sem logo) é o mesmo arquivo.
// Uso: node scripts/studio/fundo-do-dono-palco.mjs <imagem em pé> <id> [imagem deitada]
import fs from 'node:fs';
import sharp from 'sharp';

const [emPe, id, deitada] = process.argv.slice(2);
if (!emPe || !/^[a-z0-9-]+$/.test(id ?? '')) { console.error('Uso: node scripts/studio/fundo-do-dono-palco.mjs <imagem em pé> <id> [imagem deitada]'); process.exit(1); }
const PASTA = 'public/studio/palco';
const webp = (s) => s.webp({ quality: 92, effort: 6 });

const v = await sharp(emPe).resize(1080, 1920, { fit: 'fill', kernel: 'lanczos3' }).toBuffer(); // mesma proporção (940×1672 ≈ 9:16)
await webp(sharp(v)).toFile(`${PASTA}/${id}-v.webp`);
fs.copyFileSync(`${PASTA}/${id}-v.webp`, `${PASTA}/${id}-v-st.webp`);

let h;
if (deitada) h = await sharp(deitada).resize(1920, 1080, { fit: 'cover' }).toBuffer();
else {
  const lados = await sharp(v).resize(1920, 1080, { fit: 'cover' }).blur(28).modulate({ brightness: 0.55 }).toBuffer();
  const meio = await sharp(v).resize({ height: 1080 }).toBuffer();
  const m = await sharp(meio).metadata();
  h = await sharp(lados).composite([{ input: meio, left: Math.round((1920 - m.width) / 2), top: 0 }]).toBuffer();
}
await webp(sharp(h)).toFile(`${PASTA}/${id}-h.webp`);
fs.copyFileSync(`${PASTA}/${id}-h.webp`, `${PASTA}/${id}-h-st.webp`);
fs.mkdirSync('../fundos-do-dono-originais', { recursive: true });
fs.copyFileSync(emPe, `../fundos-do-dono-originais/${id}-v${emPe.slice(emPe.lastIndexOf('.'))}`);
console.log(`ok ${id}: ${PASTA}/${id}-{v,h}(-st).webp`);
