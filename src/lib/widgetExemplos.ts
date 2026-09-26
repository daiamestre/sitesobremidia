import type { WidgetConfig } from '@/types/models';
import type { OfertaWidgetDados } from '@/lib/ofertaWidget';
import { FEED_AGENCIA_BRASIL_ESPORTES, MODO_DO_MODELO_ESPORTES } from '@/lib/widgetCatalog';

/**
 * Capas da Galeria de Widgets (modelos ainda sem configuração). Mostram o PRÓPRIO modelo desenhado:
 * - dados reais quando existem sem configuração (Relógio, Clima, Esportes, Notícias da Agência Brasil);
 * - texto padrão do modelo (Institucional) ou o estado vazio real ("Anuncie aqui");
 * - Oferta/Social/Instagram: conteúdo de EXEMPLO, sempre com o selo "EXEMPLO" na capa (nunca vai para tela nenhuma).
 */
export interface ExemploCapa { config: WidgetConfig; oferta?: OfertaWidgetDados; exemplo: boolean }

const OFERTA_EXEMPLO: OfertaWidgetDados = {
  id: 'exemplo', titulo: 'Ofertas da semana', descricao: null, status: 'PUBLISHED', data_inicio: '2000-01-01', data_fim: '2999-12-31', vigente: true,
  itens: [{ nome: 'Seu produto aqui', marca: 'Sua marca', unidade: 'un', imagem_url: null, preco_original: 19.9, preco_oferta: 14.9, desconto: 25, destaque: true }],
};

export function exemploDoModelo(templateId: string): ExemploCapa {
  switch (templateId) {
    case 'sports-resultados': case 'sports-proximos': case 'sports-hoje':
      return { config: { modo: MODO_DO_MODELO_ESPORTES[templateId], limite: 4 }, exemplo: false };
    case 'rss-classic':
      return { config: { feedUrl: 'https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml', maxItems: 5, scrollSpeed: 8 }, exemplo: false };
    case 'rss-esportes':
      return { config: { origem: 'agencia-brasil', categoria: 'esportes', feedUrl: FEED_AGENCIA_BRASIL_ESPORTES, maxItems: 5 }, exemplo: false };
    case 'institutional-aviso':
      return {
        config: { selo: 'INFORMAÇÃO', titulo: 'Horário de funcionamento', linhas: [{ rotulo: 'Segunda a sexta', valor: '06:00 — 22:00' }, { rotulo: 'Sábado', valor: '08:00 — 18:00' }] },
        exemplo: true,
      };
    case 'offer-destaque':
      return { config: {}, oferta: OFERTA_EXEMPLO, exemplo: true };
    case 'advertising-campanha':
      return { config: {}, exemplo: false }; // estado real sem campanha: "Anuncie aqui"
    case 'social-post':
      return { config: { rede: 'geral', autor: 'Sua Loja', perfil: 'sualoja', titulo: 'Novidade da semana', texto: 'Conte aqui a novidade e convide o cliente a seguir sua página.' }, exemplo: true };
    case 'instagram-post':
      return { config: { rede: 'instagram', autor: 'Sua Loja', perfil: 'sualoja', titulo: 'Novo post no Instagram', texto: 'Mostre na tela o que você publicou nas redes.' }, exemplo: true };
    default:
      return { config: {}, exemplo: false };
  }
}
