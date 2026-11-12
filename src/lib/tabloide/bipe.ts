/**
 * F-311 (pedido do dono, 12/11/2026): o BIPE do leitor de código de barras, igual ao de uma pistola de mercado — um tom
 * agudo e curto (≈ 2,7 kHz, 90 ms) quando o código é lido e gravado; dois tons graves quando não deu (código inválido ou
 * produto repetido). Feito com Web Audio (sem arquivo de som). O áudio só toca depois de um toque/tecla da pessoa (regra
 * dos navegadores): `prepararBipe()` destrava no primeiro toque.
 */
let contexto: AudioContext | null = null;

function ctx(): AudioContext | null {
  try {
    if (!contexto) {
      const C = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!C) return null;
      contexto = new C();
    }
    if (contexto.state === 'suspended') void contexto.resume();
    return contexto;
  } catch { return null; }
}

/** chamar num toque/tecla da pessoa (abrir a câmera, focar o campo) para o bipe poder tocar depois */
export const prepararBipe = () => { ctx(); };

function tom(c: AudioContext, freq: number, inicio: number, dur: number, volume: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  // ataque e queda rápidos (sem estalo), como o bipe de uma pistola
  g.gain.setValueAtTime(0.0001, inicio);
  g.gain.exponentialRampToValueAtTime(volume, inicio + 0.005);
  g.gain.setValueAtTime(volume, inicio + dur - 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, inicio + dur);
  o.connect(g).connect(c.destination);
  o.start(inicio);
  o.stop(inicio + dur + 0.01);
}

/** bipe de leitura certa (código lido e gravado) */
export function bipe(): void {
  const c = ctx();
  if (c) tom(c, 2730, c.currentTime + 0.005, 0.09, 0.22);
  try { navigator.vibrate?.(60); } catch { /* sem vibração */ }
}

/** bipe de erro (código inválido ou produto repetido): dois tons graves */
export function bipeDeErro(): void {
  const c = ctx();
  if (c) { tom(c, 520, c.currentTime + 0.005, 0.11, 0.2); tom(c, 380, c.currentTime + 0.15, 0.14, 0.2); }
  try { navigator.vibrate?.([40, 60, 40]); } catch { /* sem vibração */ }
}
