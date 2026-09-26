import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SportsWidget } from '@/components/player/SportsWidget';
import { RssWidget } from '@/components/player/RssWidget';
import { MODO_DO_MODELO_ESPORTES, WIDGET_TEMPLATES } from '@/lib/widgetCatalog';

const MODELOS = ['sports-resultados', 'sports-proximos', 'sports-hoje', 'rss-esportes'];

/**
 * Conteúdo automático na Biblioteca (Content Library): esportes e notícias que o SOBRE MÍDIA atualiza sozinho.
 * Não é um segundo caminho até a tela: "Usar" abre o widget no modelo certo (Widgets) e ele segue o fluxo de sempre
 * (Playlist -> Tela -> Player). Os dados vêm do Sports Engine / motor de notícias (dados globais já validados).
 */
export function ConteudoAutomatico() {
  const navigate = useNavigate();
  return (
    <section className="space-y-3" data-testid="conteudo-automatico">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5 text-primary" /> Conteúdo automático SOBRE MÍDIA</h2>
        <p className="text-sm text-muted-foreground">
          Resultados, próximos jogos e notícias de esportes atualizados sozinhos. Só entra o que duas fontes confirmam; horário de Brasília.
        </p>
      </div>
      <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(15rem,1fr))]">
        {MODELOS.map((id) => {
          const t = WIDGET_TEMPLATES.find((x) => x.id === id);
          if (!t) return null;
          return (
            <div key={id} className="flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm" data-testid={`automatico-${id}`}>
              <div className="pointer-events-none aspect-video w-full overflow-hidden" aria-hidden>
                {t.tipo === 'sports'
                  ? <SportsWidget config={{ modo: MODO_DO_MODELO_ESPORTES[id], limite: 4 }} className="h-full w-full" />
                  : <RssWidget origem="agencia-brasil" categoria="esportes" maxItems={5} className="h-full w-full" />}
              </div>
              <div className="flex flex-1 flex-col p-3">
                <p className="font-semibold">{t.nome}</p>
                <p className="mt-1 flex-1 text-xs text-muted-foreground">{t.descricao}</p>
                <Button size="sm" className="mt-3" onClick={() => navigate(`/dashboard/widgets?modelo=${id}`)} data-testid={`usar-${id}`}>
                  Usar em uma playlist
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
