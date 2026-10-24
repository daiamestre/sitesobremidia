// servidor local só para o desenho da logo: entrega as páginas de realce (realce-logo.html, realce-capa-pwa.html,
// realce-icone.html, ampliar-ia.html) e grava os PNG/WebP enviados pela página
const http = require('http'); const fs = require('fs'); const path = require('path');
const pasta = __dirname;
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url.startsWith('/salvar?')) {
    const nome = new URL(req.url, 'http://x').searchParams.get('nome').replace(/[^a-z0-9_.-]/gi, '');
    const partes = []; req.on('data', (d) => partes.push(d)); req.on('end', () => {
      const b64 = Buffer.concat(partes).toString().replace(/^data:image\/[a-z]+;base64,/, ''); // PNG ou WebP
      fs.writeFileSync(path.join(pasta, nome), Buffer.from(b64, 'base64')); res.end('ok ' + nome);
    }); return;
  }
  const f = path.join(pasta, req.url === '/' ? 'logo.html' : req.url.slice(1).split('?')[0]);
  if (!fs.existsSync(f)) { res.statusCode = 404; return res.end('404'); }
  res.setHeader('Content-Type', f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.webp') ? 'image/webp' : 'image/png'); res.end(fs.readFileSync(f));
}).listen(8771, '127.0.0.1', () => console.log('pronto 8771'));
