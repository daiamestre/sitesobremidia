-- Relógio e Clima: MODELO ÚNICO (Futurista) com cores à escolha e imagem de fundo opcional.
--
-- Decisão do proprietário (2026-09-26): "O Relógio Futurista tem que ser o único tema de relógio"; o Clima segue o
-- mesmo comportamento. O painel grava em widgets.config: template (futurista), paleta (id), corBase (Personalizada) e
-- cores {c1,c2,c3,brilho,selo,seloTexto} já resolvidas — o Player Android lê config.cores (novas paletas sem APK).
--
-- Dados existentes: relógios/climas sem modelo ("Relógio + Data"/"Clima" clássicos) ou sem cores passam ao Futurista
-- na paleta padrão (roxo SOBRE MÍDIA), MANTENDO a imagem de fundo e as demais configurações. O gatilho existente
-- tr_widgets_touch_playlists avisa as telas (Realtime) e elas se atualizam sozinhas.
--
-- Estado anterior (2026-09-26, para ROLLBACK):
--   e9382c06-c157-4623-8c52-de189140d748 "HORA HOTEL"        clock   template = null (clássico), sem cores
--   82f4ae8a-577a-42fa-89ee-7613b1ae7a4b "Relógio padrão "   clock   template = null (clássico), sem cores
--   4dcb2b9e-38d5-45df-baf6-f569c7d3bd3b "Relógio academia"  clock   template = clock-futurista, sem cores
--   afd3783c-ad04-4bae-b519-b6368adba265 "Academia clima"    weather template = weather-futurista, sem cores
-- ROLLBACK: UPDATE widgets SET config = config - 'paleta' - 'cores' WHERE id IN (os 4 acima);
--           UPDATE widgets SET config = config - 'template' WHERE id IN ('e9382c06-c157-4623-8c52-de189140d748','82f4ae8a-577a-42fa-89ee-7613b1ae7a4b');

UPDATE public.widgets
SET config = coalesce(config, '{}'::jsonb)
        || jsonb_build_object('template', CASE widget_type WHEN 'clock' THEN 'clock-futurista' ELSE 'weather-futurista' END)
        || CASE WHEN coalesce(config, '{}'::jsonb) ? 'cores' THEN '{}'::jsonb
                ELSE jsonb_build_object('paleta', 'sobremidia',
                                        'cores', jsonb_build_object('c1', '#22004A', 'c2', '#5D1BFF', 'c3', '#8A2EFF',
                                                                    'brilho', '#B04DFF', 'selo', '#FFD400', 'seloTexto', '#22004A'))
           END,
    updated_at = now()
WHERE widget_type IN ('clock', 'weather')
  AND (coalesce(config->>'template', '') NOT IN ('clock-futurista', 'weather-futurista')
       OR NOT (coalesce(config, '{}'::jsonb) ? 'cores'));
