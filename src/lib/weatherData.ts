/**
 * Camada de DADOS do clima (separada dos modelos visuais): Open-Meteo (sem chave) + nome do local (BigDataCloud).
 * Mesma fonte e mesmos parâmetros do Android Player (NativeWidgetEngine.loadWeather), para a prévia bater com a tela.
 */

export type IconeClima = 'sol' | 'lua' | 'parcial' | 'nuvem' | 'nevoa' | 'chuva' | 'neve' | 'tempestade';

export interface DiaPrevisao { dia: string; max: number; min: number; code: number }
export interface DadosClima {
  temp: number; sensacao: number; umidade: number; ventoKmh: number; code: number; isDay: boolean;
  max: number | null; min: number | null; dias: DiaPrevisao[];
}

export function descreverClima(code: number, isDay: boolean): { texto: string; icone: IconeClima } {
  if (code === 0) return { texto: 'Céu limpo', icone: isDay ? 'sol' : 'lua' };
  if (code === 1 || code === 2) return { texto: 'Parcialmente nublado', icone: isDay ? 'parcial' : 'nuvem' };
  if (code === 3) return { texto: 'Nublado', icone: 'nuvem' };
  if (code === 45 || code === 48) return { texto: 'Nevoeiro', icone: 'nevoa' };
  if (code >= 51 && code <= 57) return { texto: 'Garoa', icone: 'chuva' };
  if (code >= 61 && code <= 67) return { texto: 'Chuva', icone: 'chuva' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { texto: 'Neve', icone: 'neve' };
  if (code >= 80 && code <= 82) return { texto: 'Pancadas de chuva', icone: 'chuva' };
  if (code >= 95 && code <= 99) return { texto: 'Tempestade', icone: 'tempestade' };
  return { texto: 'Tempo indisponível', icone: 'nuvem' };
}

const DIAS = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];
/** "HOJE" no primeiro; depois a sigla do dia da semana da data (yyyy-MM-dd, calendário puro). */
export function rotuloDia(iso: string, indice: number): string {
  if (indice === 0) return 'HOJE';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] ?? iso.slice(5);
}

/** Resposta da Open-Meteo -> dados do widget (null se não houver "current"). */
export function parseOpenMeteo(body: unknown): DadosClima | null {
  const b = body as { current?: Record<string, number>; daily?: Record<string, Array<number | string>> };
  const c = b?.current;
  if (!c || typeof c.temperature_2m !== 'number') return null;
  const d = b.daily;
  const dias: DiaPrevisao[] = (d?.time || []).map((t, i) => ({
    dia: String(t),
    max: Math.round(Number(d?.temperature_2m_max?.[i])),
    min: Math.round(Number(d?.temperature_2m_min?.[i])),
    code: Number(d?.weather_code?.[i] ?? 0),
  })).filter((x) => Number.isFinite(x.max) && Number.isFinite(x.min));
  return {
    temp: Math.round(c.temperature_2m),
    sensacao: Math.round(c.apparent_temperature ?? c.temperature_2m),
    umidade: Math.round(c.relative_humidity_2m ?? 0),
    ventoKmh: Math.round(c.wind_speed_10m ?? 0),
    code: c.weather_code ?? 0,
    isDay: (c.is_day ?? 1) === 1,
    max: dias[0]?.max ?? null,
    min: dias[0]?.min ?? null,
    dias,
  };
}

export async function buscarClima(lat: number, lon: number, signal?: AbortSignal): Promise<DadosClima | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
    + '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=6&timezone=America%2FSao_Paulo';
  const r = await fetch(url, { signal });
  if (!r.ok) return null;
  return parseOpenMeteo(await r.json());
}

/** "Recife — PE" a partir das coordenadas (mesma regra do Player: ignora "Região Metropolitana de ..."). */
export async function nomeDoLocal(lat: number, lon: number, signal?: AbortSignal): Promise<string | null> {
  try {
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`, { signal });
    if (!r.ok) return null;
    const o = await r.json();
    const nome = [o.city, o.locality, o.principalSubdivision].find((x: string) => x && !/^Região/i.test(x));
    const uf = String(o.principalSubdivisionCode || '').split('-')[1];
    return nome ? (uf && uf.length === 2 ? `${nome} — ${uf}` : nome) : null;
  } catch {
    return null;
  }
}
