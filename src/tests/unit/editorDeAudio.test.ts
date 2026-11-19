// Pedido do dono (18/11/2026): EDITOR DE ÁUDIO completo no Studio, só owner/ADM — cortar, colar, apagar, dividir, aparar,
// efeitos, tom/velocidade e baixar em MP3/WAV.
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  abrirEspaco, apagarIntervalo, apararClipe, clipesNoIntervalo, colar, copiarIntervalo, dividirFaixa, fimDaFaixa, fimDoProjeto, ganhoDoClipeEm,
  novaFaixa, novoClipe, projetoVazio, trocarSomDosClipes, faixasAudiveis, type Faixa,
} from '@/lib/studio/audio/projeto';
import {
  aparaSilencio, deTrasParaFrente, duracaoDoSom, esticarTempo, fade, gerarTom, juntar, mudarTom, normalizar, paraMono, pico,
  portaDeRuido, reamostrar, recortar, rms, volume, calcularPicos, type Som,
} from '@/lib/studio/audio/som';
import { codificar, codificarMp3, codificarWav, lerMarcaDoStudio, lerWav } from '@/lib/studio/audio/arquivos';
import { EFEITOS, GRUPOS, valoresPadrao } from '@/lib/studio/audio/efeitos';

const SR = 8000;
const faixaCom = (...clipes: Array<[number, number]>): Faixa => {
  const f = novaFaixa(projetoVazio());
  return { ...f, clipes: clipes.map(([ini, dur], i) => novoClipe(`som${i}`, `c${i}`, dur, ini)) };
};
/** frequência dominante por cruzamentos de zero */
const frequencia = (s: Som) => { const c = s.canais[0]; let z = 0; for (let i = 1; i < c.length; i++) if (c[i - 1] < 0 && c[i] >= 0) z++; return (z * s.sr) / c.length; };

describe('editor de áudio: edição na linha do tempo', () => {
  it('dividir parte o clipe em dois, com o 2º continuando do ponto certo do som', () => {
    const f = dividirFaixa(faixaCom([1, 4]), 2.5);
    expect(f.clipes).toHaveLength(2);
    expect(f.clipes[0]).toMatchObject({ inicio: 1, duracao: 1.5, deslocamento: 0 });
    expect(f.clipes[1]).toMatchObject({ inicio: 2.5, duracao: 2.5, deslocamento: 1.5 });
  });
  it('apagar um trecho puxa o resto para trás; copiar e colar devolve o trecho no lugar', () => {
    const f = faixaCom([0, 10]);
    const copia = copiarIntervalo(f, 2, 5);
    expect(copia).toHaveLength(1); expect(copia[0]).toMatchObject({ inicio: 0, duracao: 3, deslocamento: 2 });
    const sem = apagarIntervalo(f, 2, 5);
    expect(fimDaFaixa(sem)).toBeCloseTo(7);
    const volta = colar(sem, 2, copia, true);
    expect(fimDaFaixa(volta)).toBeCloseTo(10);
    expect(volta.clipes.map((c) => [c.inicio, c.deslocamento, c.duracao])).toEqual([[0, 0, 2], [2, 2, 3], [5, 5, 5]]);
  });
  it('aparar pela borda nunca passa do som guardado nem do zero', () => {
    const c = { ...novoClipe('s', 'x', 4, 2), deslocamento: 1 };
    expect(apararClipe(c, 'fim', 100, 6)).toMatchObject({ duracao: 5 });
    expect(apararClipe(c, 'inicio', 0, 6)).toMatchObject({ inicio: 1, deslocamento: 0, duracao: 5 });
    expect(apararClipe(c, 'inicio', 3, 6)).toMatchObject({ inicio: 3, deslocamento: 2, duracao: 3 });
  });
  it('efeito que muda a duração (velocidade) empurra os clipes de depois', () => {
    const f = faixaCom([0, 4], [5, 2]);
    const { faixa, dentro } = clipesNoIntervalo(f, 1, 3);
    expect(dentro).toHaveLength(1);
    const g = trocarSomDosClipes(faixa, [{ id: dentro[0].id, somId: 'novo', duracao: 1 }]);
    expect(g.clipes.find((c) => c.somId === 'novo')).toMatchObject({ inicio: 1, duracao: 1, deslocamento: 0 });
    expect(g.clipes.map((c) => c.inicio)).toEqual([0, 1, 2, 4]);
  });
  it('fades e volume do clipe; solo e mudo decidem quem toca', () => {
    const c = { ...novoClipe('s', 'x', 4, 0), fadeEntrada: 1, fadeSaida: 2, ganhoDb: 0 };
    expect(ganhoDoClipeEm(c, 0.5)).toBeCloseTo(0.5); expect(ganhoDoClipeEm(c, 2)).toBeCloseTo(1); expect(ganhoDoClipeEm(c, 3)).toBeCloseTo(0.5);
    const p = { ...projetoVazio(), faixas: [{ ...faixaCom([0, 1]), solo: true }, faixaCom([0, 3]), { ...faixaCom([0, 2]), mudo: true }] };
    expect(faixasAudiveis(p)).toHaveLength(1);
    expect(fimDoProjeto(p)).toBe(3);
  });
});

describe('editor de áudio: o som', () => {
  const tom = gerarTom(SR, 1, 200, 'seno', 0.5, 2);
  it('recortar, juntar, volume, normalizar, inverter e mono', () => {
    expect(duracaoDoSom(recortar(tom, 0.25, 0.75))).toBeCloseTo(0.5);
    expect(duracaoDoSom(juntar(tom, tom))).toBeCloseTo(2);
    expect(pico(volume(tom, -6))).toBeCloseTo(0.25, 2);
    expect(pico(normalizar(tom, -1))).toBeCloseTo(Math.pow(10, -1 / 20), 3);
    expect(deTrasParaFrente(tom).canais[0][0]).toBe(tom.canais[0][SR - 1]);
    expect(paraMono(tom).canais).toHaveLength(1);
  });
  it('fade de entrada começa no silêncio; porta de ruído abaixa o chiado nas pausas', () => {
    const f = fade(tom, 'entrada', 'linear');
    expect(Math.abs(f.canais[0][0])).toBe(0);
    const chiado = { sr: SR, canais: [Float32Array.from({ length: SR }, () => (Math.random() * 2 - 1) * 0.001)] };
    expect(rms(portaDeRuido(chiado, -40, -40))).toBeLessThan(rms(chiado) * 0.2);
  });
  it('aparar silêncio tira as pontas mudas', () => {
    const s = juntar(juntar({ sr: SR, canais: [new Float32Array(SR), new Float32Array(SR)] }, tom), { sr: SR, canais: [new Float32Array(SR), new Float32Array(SR)] });
    expect(duracaoDoSom(aparaSilencio(s, -50, 0))).toBeCloseTo(1, 1);
  });
  it('velocidade sem mudar o tom (WSOLA) muda a duração e mantém a frequência; mudar o tom mantém a duração', () => {
    const lento = esticarTempo(tom, 1.5);
    expect(duracaoDoSom(lento)).toBeCloseTo(1.5, 2);
    expect(frequencia(lento)).toBeGreaterThan(180); expect(frequencia(lento)).toBeLessThan(220);
    const agudo = mudarTom(tom, 12);
    expect(duracaoDoSom(agudo)).toBeCloseTo(1, 3);
    expect(frequencia(agudo)).toBeGreaterThan(360); expect(frequencia(agudo)).toBeLessThan(440);
    const disco = reamostrar(tom, 2);
    expect(duracaoDoSom(disco)).toBeCloseTo(0.5, 2); expect(frequencia(disco)).toBeGreaterThan(380);
  });
  it('picos para desenhar a onda em qualquer zoom', () => {
    const p = calcularPicos(tom, 128);
    expect(p.max.length).toBe(Math.ceil(SR / 128));
    expect(Math.max(...p.max)).toBeCloseTo(0.5, 1);
  });
});

describe('editor de áudio: baixar', () => {
  const tom = gerarTom(44100, 0.5, 440, 'seno', 0.5, 2);
  it('WAV 16/24/32 bits vai e volta igual', () => {
    for (const bits of [16, 24, 32] as const) {
      const w = codificarWav(tom, bits);
      expect(String.fromCharCode(...w.subarray(0, 4))).toBe('RIFF');
      const l = lerWav(w);
      expect(l.sr).toBe(44100); expect(l.canais).toHaveLength(2); expect(l.canais[0].length).toBe(tom.canais[0].length);
      expect(Math.abs(l.canais[0][1000] - tom.canais[0][1000])).toBeLessThan(bits === 16 ? 1e-4 : 1e-6);
    }
  });
  it('MP3 de verdade (cabeçalho de quadro MPEG) e do tamanho esperado para a taxa', () => {
    const m = codificarMp3(tom, 192);
    const i = m.findIndex((b, k) => b === 0xff && (m[k + 1] & 0xe0) === 0xe0);
    expect(i).toBeGreaterThanOrEqual(0);
    const esperado = (192000 / 8) * 0.5;
    expect(m.length).toBeGreaterThan(esperado * 0.8); expect(m.length).toBeLessThan(esperado * 1.4);
  });
});

describe('F-323: a marca "Editado no SOBRE MÍDIA Studio"', () => {
  const tom = gerarTom(44100, 0.3, 440, 'seno', 0.5, 2);
  const marca = { nome: 'Chamada {Fecha} Mês', codigo: 'audio-123', versao: 3, editadoEm: '2026-11-18T15:00:00.000Z' };
  it('MP3 e WAV saem marcados e o editor reconhece a marca; o som continua igual', () => {
    const mp3 = codificar(tom, 'mp3', 192, marca).bytes;
    expect(String.fromCharCode(...mp3.subarray(0, 3))).toBe('ID3');
    expect(lerMarcaDoStudio(mp3)).toEqual(marca);
    const wav = codificar(tom, 'wav16', 0, marca).bytes;
    expect(lerMarcaDoStudio(wav)).toEqual(marca);
    const l = lerWav(wav); expect(l.canais[0].length).toBe(tom.canais[0].length);
    expect(lerMarcaDoStudio(codificarWav(tom, 16))).toBeNull();
    expect(lerMarcaDoStudio(codificarMp3(tom, 128))).toBeNull();
  });
  it('a marca diz só a verdade: editado no Studio, sem declarar direitos autorais nem disfarçar o conteúdo', () => {
    const src = fs.readFileSync('src/lib/studio/audio/arquivos.ts', 'utf8');
    expect(src).toContain('Editado no SOBRE MÍDIA Studio');
    expect(src).not.toMatch(/'TCOP'|ICOP|direitos reservados/i);
  });
});

describe('editor de áudio: efeitos e acesso', () => {
  it('a lista de efeitos é completa, com ajustes válidos e prévia', () => {
    expect(EFEITOS.length).toBeGreaterThanOrEqual(25);
    for (const g of GRUPOS) expect(EFEITOS.some((e) => e.grupo === g), g).toBe(true);
    for (const e of EFEITOS) {
      const v = valoresPadrao(e);
      for (const a of e.ajustes) if (a.tipo === 'numero') { expect(v[a.id]).toBeGreaterThanOrEqual(a.min); expect(v[a.id]).toBeLessThanOrEqual(a.max); }
    }
    for (const id of ['volume', 'normalizar', 'compressor', 'limitador', 'porta', 'equalizador', 'parametrico', 'passa-alta', 'passa-baixa', 'voz-de-radio', 'eco', 'reverb', 'tom', 'tempo', 'velocidade', 'fade-entrada', 'fade-saida', 'inverter'])
      expect(EFEITOS.some((e) => e.id === id), id).toBe(true);
  });
  it('os efeitos sem Web Audio rodam de verdade', async () => {
    const tom = gerarTom(SR, 0.5, 300, 'seno', 0.4, 2);
    for (const id of ['volume', 'normalizar', 'porta', 'fade-entrada', 'fade-saida', 'tom', 'tempo', 'velocidade', 'inverter', 'fase', 'mono', 'trocar-canais', 'dc', 'aparar-silencio']) {
      const e = EFEITOS.find((x) => x.id === id)!;
      const s = await e.aplicar(tom, valoresPadrao(e));
      expect(s.canais[0].length, id).toBeGreaterThan(0);
    }
  });
  it('só owner/ADM: item no menu e a página volta ao início para os outros; microfone liberado no site', () => {
    const menu = fs.readFileSync('src/components/studioai/StudioAILayout.tsx', 'utf8');
    expect(menu).toContain("...(interno ? [{ nome: 'Editor de áudio', to: '/studio/editor-de-audio'");
    const pag = fs.readFileSync('src/pages/studioai/EditorDeAudioPage.tsx', 'utf8');
    expect(pag).toContain("if (saldo.data?.paga !== false) return <Navigate to=\"/studio\" replace />");
    expect(fs.readFileSync('src/App.tsx', 'utf8')).toContain('<Route path="editor-de-audio" element={<StudioEditorDeAudio />} />');
    expect(fs.readFileSync('vercel.json', 'utf8')).toContain('microphone=(self)');
  });
  it('F-322: salvar com nome na Pasta de Áudios, salvar por cima (versão), abrir para reeditar, duplicar, baixar e apagar', () => {
    const g = fs.readFileSync('src/lib/studio/audio/guardar.ts', 'utf8');
    for (const f of ['listarPasta', 'salvarNaPasta', 'lerDaPasta', 'renomearNaPasta', 'apagarDaPasta']) expect(g).toContain(`export async function ${f}`);
    const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
    for (const t of ['Salvar na Biblioteca de Áudios', 'Nome do áudio', 'Nome das faixas', 'Salvar por cima (versão', 'Salvar como novo', 'Abrir e editar', 'Duplicar', '> MP3', 'Biblioteca de Áudios'])
      expect(e, t).toContain(t);
  });
});

describe('F-324: cursor e gestos do dedo', () => {
  const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
  it('a linha amarela usa a rolagem e o zoom de AGORA (antes sumia quando a tela rolava no play)', () => {
    expect(e).toContain('const x = t * zoomRef.current - (el?.scrollLeft ?? 0)');
    expect(e).toContain('x = pos * zoomRef.current');
  });
  it('no dedo: deslizar rola, segurar ~0,4 s e arrastar marca, toque só põe o cursor', () => {
    expect(e).toContain("tipo: 'espera'");
    expect(e).toContain("gesto.current = { tipo: 'rolar'");
    expect(e).toMatch(/acao\(\); try \{ navigator\.vibrate/);
    expect(e).toContain('}, 380);');
  });
  it('o triângulo da linha amarela arrasta o cursor e rola sozinho na borda da tela', () => {
    expect(e).toContain('data-testid="editor-audio-triangulo"');
    expect(e).toContain('data-testid="editor-audio-linha-pegar"');
    expect(e).toContain('const pegarCursor');
    expect(e).toContain('const dv = velocidadeNaBorda(v);');
  });
});

describe('F-325: cortar na linha amarela e arrastar a parte para qualquer lugar', () => {
  const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
  it('"Cortar" sem trecho marcado corta o clipe onde está a linha amarela', () => {
    expect(e).toContain('const tc = cursorRef.current, p0 = projetoRef.current;');
    expect(e).toContain('dividirFaixa(x, tc)');
    expect(e).toContain('rotulo="Cortar"');
  });
  it('arrastar: para outra faixa, para a área de faixa nova e, solto em cima de áudio, entra no meio empurrando o resto', () => {
    expect(e).toContain('data-nova-faixa="1"');
    expect(e).toContain('Solte aqui para criar uma faixa nova');
    expect(e).toContain('const aberta = abrirEspaco(sem, c.inicio, c.duracao)');
    expect(e).toContain('const rolarArrastando');
    expect(e).toContain("(dedo && clipeSel === sob.id)");
  });
  it('abrir espaço + pôr a parte = inserir no meio (o resto anda para frente)', () => {
    const f = faixaCom([0, 10]);
    const aberta = abrirEspaco(f, 4, 2);
    expect(aberta.clipes.map((c) => [c.inicio, c.duracao])).toEqual([[0, 4], [6, 6]]);
  });
});

describe('F-326: a linha amarela inteira pega o cursor e o áudio acompanha na borda', () => {
  const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
  it('a linha toda (não só o triângulo) é pegável, e escondida não pega toque', () => {
    expect(e).toContain('data-testid="editor-audio-linha-pegar"');
    expect(e).toContain("linha.current.style.visibility = x < -1 || x > w + 1 ? 'hidden' : 'visible'");
  });
  it('na borda o áudio rola pela animação e, se ela atrasar, a cada movimento do dedo', () => {
    expect(e).toContain('const passoDaBorda');
    expect(e).toContain('if (performance.now() - gg.ultimo > 60) passoDaBorda(gg)');
    expect(e).toContain('zona = 36;');
  });
});

describe('F-327: rolagem na borda mais rápida, acelerando', () => {
  it('começa rápida e acelera até ~80 px por quadro enquanto segura', () => {
    const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
    expect(e).toContain('function velocidadeNaBorda');
    expect(e).toContain('(3 + 9 * Math.abs(v)) * (1 + 0.5 * k)');
  });
});

describe('F-328: Biblioteca de Áudios no sistema, rascunhos e nova edição', () => {
  const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
  const s = fs.readFileSync('src/lib/studio/audio/sistema.ts', 'utf8');
  const m = fs.readFileSync('supabase/migrations/20261366_studio_audio_edicoes.sql', 'utf8');
  it('salvos e rascunhos ficam no sistema, cada conta só vê os seus; sons vão uma vez para a pasta da conta', () => {
    expect(m).toContain("check (tipo in ('salvo', 'rascunho'))");
    expect(m).toContain('using (usuario_id = auth.uid())');
    expect(s).toContain('/studio-audio/${id}.wav');
    expect(s).toContain('const faltam = usados.filter((id) => !o.urls.has(id))');
  });
  it('salvar limpa a tela; "Nova edição" guarda o da tela como rascunho; parado 30 min vira rascunho com o botão de voltar', () => {
    expect(e).toContain('export const PARADO_MS = 30 * 60 * 1000');
    expect(e).toContain("await guardarNoSistema('salvo', comoNovo);\n      setSalvarAberto(false); limparTela();");
    expect(e).toContain("const novoProjeto = () => { void arquivarERecomecar('nova'); };");
    expect(e).toContain('Voltar a editar de onde parei');
    expect(e).toContain("{a === 'salvo' ? 'Salvos' : 'Rascunhos'}");
  });
});

describe('F-329: no celular nenhum campo faz o iPhone dar zoom (tela grande e cortada depois de salvar)', () => {
  it('todo campo do editor no celular usa 16 px', () => {
    const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
    expect(e).toContain('[&_input]:![font-size:16px]');
    expect(e).toContain("meta.content = 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover'");
  });
});

describe('F-330: o som não some no iPhone', () => {
  it('lê os arquivos sem abrir tocador; recria/acorda o tocador no play e toca no silencioso', () => {
    const a = fs.readFileSync('src/lib/studio/audio/arquivos.ts', 'utf8');
    expect(a).toContain('const ctx = new Off(2, 1, 44100);');
    expect(a).not.toContain('const ctx = new Ctx();');
    const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
    expect(e).toContain("audio.current.ctx.state === 'closed'");
    expect(e).toContain("sessao.type = 'playback'");
    expect(e).toContain('mudo.start(0)');
  });
});

describe('F-331: no celular, tocar escolhe o clipe e arrastar move na hora', () => {
  const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
  it('toque escolhe; arrastar move (sem segurar); vazio rola; marcar trecho só com o botão; Desmarcar limpa', () => {
    expect(e).toContain('const escolher = () => { if (sob && dentro) setClipeSel(sob.id)');
    expect(e).toContain('Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 8');
    expect(e).toContain("const [marcandoTrecho, setMarcandoTrecho] = useState(false)");
    expect(e).toContain('rotulo="Desmarcar"');
    expect(e).not.toContain('rotulo="Tesoura"');
  });
});

describe('F-332: o clipe obedece o dedo no celular', () => {
  const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
  it('borda do arrasto de clipe estreita e com o dedo parado; olha através da linha amarela; teste completo existe', () => {
    expect(e).toContain('zona = 28;');
    expect(e).toContain('performance.now() - g.bordaDesde > 300');
    expect(e).toContain('document.elementsFromPoint(g.x, g.y)');
    expect(fs.existsSync('scripts/ops/testar-editor-audio.mjs')).toBe(true);
  });
});

describe('F-333: passar o dedo no clipe rola; só segurar e arrastar move', () => {
  it('no clipe, o gesto espera: deslizar = rolar, segurar = mover/aparar, toque = escolher', () => {
    const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
    expect(e).toContain('PASSAR O DEDO no clipe ROLA a linha do tempo');
    expect(e).toContain('setClipeSel(sob.id); setSel(null); marcarHistorico();');
    expect(e).toContain('}, escolher);');
  });
});

describe('F-334: tocar fora do clipe desmarca', () => {
  it('toque fora (régua, vazio, resto da página) tira a escolha; botões de ação e painéis mantêm', () => {
    const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
    expect(e).toContain("el.closest('[data-testid=editor-audio-pista], [data-mantem-escolha]')");
    expect(e).toContain('data-mantem-escolha className="fixed inset-x-0 bottom-0');
  });
});

describe('F-335: o app no celular pega a versão nova sozinho', () => {
  it('procura atualização ao voltar para a tela e a cada 5 min, e recarrega quando a versão nova assume', () => {
    const p = fs.readFileSync('src/hooks/usePWA.ts', 'utf8');
    expect(p).toContain('setInterval(procurar, 5 * 60 * 1000)');
    expect(p).toContain("document.addEventListener('visibilitychange'");
    expect(p).toContain("navigator.serviceWorker.addEventListener('controllerchange'");
  });
});

describe('F-337: pinça não mexe na linha amarela', () => {
  it('os dedos são contados na linha do tempo inteira; 2 dedos = pinça; a linha volta e fica no mesmo ponto da onda', () => {
    const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
    expect(e).toContain('onPointerDownCapture={(e) => {');
    expect(e).toContain("if (g?.tipo === 'cursor') { cancelAnimationFrame(g.raf); moverCursor(g.cursor0); }");
    expect(e).toContain('posicionarLinha(cursorRef.current); });');
  });
});

describe('F-338: puxadores nas pontas do clipe escolhido', () => {
  it('duas alças com o tempo; arrastar apara na hora; contam como parte do clipe (não desmarcam)', () => {
    const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
    expect(e).toContain('const pegarPuxador = ');
    expect(e).toContain('<div key={lado} data-mantem-escolha role="slider"');
    expect(e).toContain('if (!gesto.current) dedos.current.clear();');
  });
});

describe('F-339: alças pequenas e proporcionais', () => {
  it('traço de 4 a 8 px conforme o clipe; toque invisível de 18 px; tempo só ao puxar', () => {
    const e = fs.readFileSync('src/components/studio/audio/EditorDeAudio.tsx', 'utf8');
    expect(e).toContain('Math.max(4, Math.min(8, Math.round((c.duracao * zoom) / 12)))');
    expect(e).toContain('{puxando === lado &&');
  });
});
