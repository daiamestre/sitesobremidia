import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { RssWidget } from "@/components/player/RssWidget";
import { WeatherFuturista } from "@/components/player/WeatherFuturista";
import { ClockFuturista } from "@/components/player/ClockFuturista";
import { InstitutionalWidget } from "@/components/player/InstitutionalWidget";
import { OfferWidget } from "@/components/player/OfferWidget";
import { AdvertisingWidget } from "@/components/player/AdvertisingWidget";
import { SocialWidget } from "@/components/player/SocialWidget";
import { YouTubeWidget } from "@/components/player/YouTubeWidget";
import { SportsWidget } from "@/components/player/SportsWidget";
import { coresDoConfig } from "@/lib/widgetPaletas";
import "@/components/player/Player.css";

const WidgetPlayer = () => {
    const { id } = useParams();
    const [widget, setWidget] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWidget = async () => {
            if (!id) return;
            const { data, error } = await supabase
                .from('widgets')
                .select('*')
                .eq('id', id)
                .single();

            if (data) {
                setWidget(data);
            }
            setLoading(false);
        };

        fetchWidget();
    }, [id]);

    if (loading) return (
        <div className="h-screen w-full flex items-center justify-center bg-black">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
    );

    if (!widget) return (
        <div className="h-screen w-full flex items-center justify-center bg-black text-white">
            Widget não encontrado
        </div>
    );

    const renderWidget = () => {
        const config = widget.config || {};
        const commonProps = {
            className: "w-full h-full",
            backgroundImage: config.backgroundImageLandscape || config.backgroundImagePortrait || null
        };

        switch (widget.widget_type) {
            case 'social':
            case 'instagram':
                return <SocialWidget widgetType={widget.widget_type} config={config} backgroundImage={commonProps.backgroundImage} className="w-full h-full" />;
            case 'youtube':
                return <YouTubeWidget config={config} className="w-full h-full" />;
            case 'advertising':
                return <AdvertisingWidget config={config} backgroundImage={commonProps.backgroundImage} className="w-full h-full" />;
            case 'offer':
                return <OfferWidget config={config} backgroundImage={commonProps.backgroundImage} className="w-full h-full" />;
            case 'institutional':
                return <InstitutionalWidget config={config} backgroundImage={commonProps.backgroundImage} className="w-full h-full" />;
            // Relógio e Clima: modelo único (Futurista), nas cores escolhidas no widget
            case 'clock':
                return <ClockFuturista {...commonProps} cores={coresDoConfig(config)} showDate={config.showDate !== false} showSeconds={config.showSeconds === true} />;
            case 'weather':
                return <WeatherFuturista {...commonProps} cores={coresDoConfig(config)} latitude={config.latitude} longitude={config.longitude} locationName={config.locationName} />;
            case 'sports':
                return <SportsWidget {...commonProps} config={config} cores={coresDoConfig(config)} dados={config.esportes ?? null} />;
            case 'rss':
                return (
                    <RssWidget
                        {...commonProps}
                        feedUrl={config.feedUrl ?? config.url}
                        maxItems={config.maxItems ?? config.itemsCount}
                        origem={config.origem}
                        categoria={config.categoria}
                        noticias={config.noticias ?? null}
                    />
                );
            default:
                return <div>Widget "{widget.name}" não suportado em modo standalone</div>;
        }
    };

    return (
        <div className="h-screen w-full overflow-hidden bg-black relative">
            {/* Background images if configured */}
            {widget.config?.backgroundImageLandscape && (
                <img
                    src={widget.config.backgroundImageLandscape}
                    className="absolute inset-0 w-full h-full object-cover"
                    alt=""
                />
            )}
            <div className="relative z-10 w-full h-full">
                {renderWidget()}
            </div>
        </div>
    );
};

export default WidgetPlayer;
