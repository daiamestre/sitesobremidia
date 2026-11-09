/**
 * F-276 — REMOVEDOR DE FUNDO SOBRE MÍDIA (profissional, sem cota e sem custo).
 * O mesmo tipo de IA que a Cloudflare usa no recorte (BiRefNet_lite, licença MIT; versão de 512 px feita para o navegador,
 * studioludens/birefnet-lite-512 — as de 1024 px estouram a memória do navegador),
 * rodando NO NAVEGADOR de quem cria o encarte: separa o produto de qualquer fundo (prateleira, mesa, cenário, sombra), não só
 * de fundo liso. Entra quando a Cloudflare não recorta (cota do mês acabou ou ela não respondeu) e o fundo não é liso.
 * - Placa de vídeo do aparelho (WebGPU) quando existe: 1 a 3 s por foto; senão processador (WASM): 15 a 40 s.
 * - O modelo (98 MB com placa de vídeo, 192 MB sem) é baixado UMA vez e fica guardado no navegador (Cache Storage).
 * - O resultado passa pela mesma inspeção e acabamento do recorte da nuvem (finalizarRecorte): reprovado nunca é entregue.
 */
import { apagarSelosSoltos } from './recorte';

const MODELO = 'studioludens/birefnet-lite-512';

type Pronto = { modelo: (e: Record<string, unknown>) => Promise<Record<string, any>>; processador: (img: unknown) => Promise<{ pixel_values: unknown }>; RawImage: any };
let carregando: Promise<Pronto> | null = null;

async function placaDeVideo(): Promise<boolean> {
  try {
    const gpu = (navigator as unknown as { gpu?: { requestAdapter: () => Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

/** Carrega a IA uma vez por sessão (o arquivo do modelo fica no cache do navegador entre sessões). */
export function carregarRemovedor(): Promise<Pronto> {
  carregando ??= (async () => {
    const { AutoModel, AutoProcessor, RawImage, env } = await import('@huggingface/transformers');
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    const gpu = await placaDeVideo();
    // placa de vídeo: meia precisão (rápido); processador: precisão cheia — o WASM não roda a meia precisão
    let modelo;
    try {
      modelo = gpu ? await AutoModel.from_pretrained(MODELO, { device: 'webgpu', dtype: 'fp16' }) : null;
    } catch {
      modelo = null;
    }
    modelo ??= await AutoModel.from_pretrained(MODELO, { device: 'wasm', dtype: 'fp32' });
    const processador = await AutoProcessor.from_pretrained(MODELO);
    return { modelo: modelo as unknown as Pronto['modelo'], processador: processador as unknown as Pronto['processador'], RawImage };
  })().catch((e) => { carregando = null; throw e; });
  return carregando;
}

/**
 * Aplica a máscara da IA (0–255) como transparência. Pontos quase invisíveis somem e quase cheios ficam cheios: contorno limpo,
 * sem véu cinza no fundo, mantendo a borda suave (cabelo, vidro, plástico transparente).
 */
export function aplicarMascara(rgba: Uint8ClampedArray, mascara: ArrayLike<number>): void {
  for (let i = 0, p = 3; i < mascara.length; i++, p += 4) {
    const m = mascara[i];
    rgba[p] = m < 10 ? 0 : m > 245 ? 255 : Math.round(((m - 10) / 235) * 255);
  }
}

/**
 * Tira o fundo da foto com a IA e devolve o PNG no tamanho da foto (até `ladoMax`), sem cortar — o formato que
 * finalizarRecorte inspeciona contra a original. null se não deu (sem internet para baixar o modelo, foto não abriu…).
 */
export async function removerFundoProfissional(url: string, ladoMax = 1400, caixa?: { left: number; top: number; width: number; height: number } | null): Promise<Blob | null> {
  try {
    const { modelo, processador, RawImage } = await carregarRemovedor();
    const original = await RawImage.fromURL(url);
    const escala = Math.min(1, ladoMax / Math.max(original.width, original.height));
    const imagem = escala < 1 ? await original.resize(Math.round(original.width * escala), Math.round(original.height * escala)) : original;
    const { pixel_values } = await processador(imagem);
    const saida = await modelo({ input_image: pixel_values });
    const logits = saida.logits ?? saida.output_image;
    const mascara = await RawImage.fromTensor(logits[0].sigmoid().mul(255).to('uint8')).resize(imagem.width, imagem.height);
    const w = imagem.width, h = imagem.height;
    const rgba = imagem.rgba().data as Uint8ClampedArray;
    const pixels = new Uint8ClampedArray(rgba);
    aplicarMascara(pixels, mascara.data);
    // selo de propaganda solto e o que está fora da caixa do link (c=) não fazem parte do produto
    apagarSelosSoltos(pixels, w, h);
    if (caixa) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (x < caixa.left || y < caixa.top || x >= caixa.left + caixa.width || y >= caixa.top + caixa.height) pixels[(y * w + x) * 4 + 3] = 0;
    }
    const tela = document.createElement('canvas');
    tela.width = w;
    tela.height = h;
    const ctx = tela.getContext('2d');
    if (!ctx) return null;
    ctx.putImageData(new ImageData(pixels, w, h), 0, 0);
    return await new Promise<Blob | null>((ok) => tela.toBlob(ok, 'image/png'));
  } catch {
    return null;
  }
}
