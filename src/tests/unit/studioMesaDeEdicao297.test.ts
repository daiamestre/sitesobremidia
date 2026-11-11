/**
 * F-297 (pedido do dono, 10/11/2026): o palco de ofertas vira uma MESA DE EDIÇÃO como nos aplicativos de vídeo.
 * - UMA visualização só: a arte animada continua a primeira coisa que se vê; ao mexer na linha do tempo, o MESMO lugar
 *   mostra o vídeo naquele instante (não existe mais a segunda prévia "Vídeo do palco" embaixo);
 * - a LATERAL DIREITA (botões de edição) rola só na altura da arte;
 * - a LINHA DO TEMPO fica embaixo, de largura inteira (também por baixo da lateral), à vista junto com a arte;
 * - a arte diminui para tudo caber na tela; as ferramentas do clipe escolhido abrem no topo da lateral.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const palco = fs.readFileSync('src/components/studio/PalcoDeOfertas.tsx', 'utf8');
const video = fs.readFileSync('src/pages/studioai/VideoEditorPage.tsx', 'utf8');

describe('F-297: mesa de edição do palco', () => {
  it('uma visualização só: a prévia do vídeo entra no lugar da arte', () => {
    expect(palco).toContain('data-testid="palco-previa-video"');
    expect(palco).toContain("const [vista, setVista] = useState<'palco' | 'video'>('palco');");
    expect(palco).toContain("{vista === 'palco' && (docNaTela && docSel ? (");
    expect(palco).not.toContain('<h2 className="flex items-center gap-2 px-1 text-sm font-bold text-white"><Clapperboard');
    expect(video).toContain('{mesa.previa && createPortal(previa, mesa.previa)}');
  });
  it('a lateral rola só na altura da arte e a linha do tempo fica embaixo, de largura inteira', () => {
    expect(palco).toContain('data-testid="palco-mesa"');
    expect(palco).toContain("h-[calc(100dvh-96px)]");
    expect(palco).toMatch(/<aside ref=\{lateral\} className="min-h-0 min-w-0 space-y-2 overflow-y-auto/);
    const fimDaLateral = palco.indexOf('</aside>');
    const linha = palco.indexOf('data-testid="palco-editor-video"');
    expect(fimDaLateral).toBeGreaterThan(0);
    expect(linha).toBeGreaterThan(fimDaLateral);
    expect(palco).toContain("aoUsar: () => setVista('video')");
  });
  it('a arte se ajusta à altura que sobra (cabe tudo na tela) e a fila fica de lado no computador', () => {
    expect(palco).toContain("min(100cqw, calc(100cqh * 0.5625))");
    expect(palco).toContain("containerType: 'size'");
    expect(palco).toContain("'lg:flex-row-reverse'");
  });
  it('o clipe escolhido abre as ferramentas no topo da lateral; tocar no vídeo parado abre a edição do produto', () => {
    expect(palco).toContain('ref={setSlotFerramentas}');
    expect(video).toContain('createPortal(<div className="space-y-2" data-testid="video-ferramentas-na-lateral">');
    expect(video).toContain('mesa.aoTocarNaTela(q.clipe.nome, ev, q.clipe.documento)');
    expect(palco).toContain('clipeEmFoco: sel?.nome ?? null');
  });
  it('o editor de vídeo sozinho (/studio/video) continua com a prévia e as ferramentas dele', () => {
    expect(video).toContain('{transporte(false)}');
    expect(video).toContain('{ferramentasDoEscolhido}');
    expect(video).toContain('useEffect(() => {\n    if (!telaEl) return;');
  });
});
