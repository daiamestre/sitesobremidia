import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { ClockWidget } from "@/components/player/ClockWidget";
import { WeatherWidget } from "@/components/player/WeatherWidgetComponent";
import { RssWidget } from "@/components/player/RssWidget";
import { WeatherFuturista } from "@/components/player/WeatherFuturista";
import { ClockFuturista } from "@/components/player/ClockFuturista";
import { InstitutionalWidget } from "@/components/player/InstitutionalWidget";
import { OfferWidget } from "@/components/player/OfferWidget";
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
            case 'offer':
                return <OfferWidget config={config} backgroundImage={commonProps.backgroundImage} className="w-full h-full" />;
            case 'institutional':
                return <InstitutionalWidget config={config} backgroundImage={commonProps.backgroundImage} className="w-full h-full" />;
            case 'clock':
                if (config.template === 'clock-futurista') {
                    return <ClockFuturista {...commonProps} showDate={config.showDate !== false} showSeconds={config.showSeconds === true} />;
                }
                return (
                    <ClockWidget
                        {...commonProps}
                        showDate={config.showDate !== false}
                        showSeconds={config.showSeconds === true}
                    />
                );
            case 'weather':
                if (config.template === 'weather-futurista') {
                    return <WeatherFuturista {...commonProps} latitude={config.latitude} longitude={config.longitude} locationName={config.locationName} />;
                }
                return (
                    <WeatherWidget
                        {...commonProps}
                        latitude={config.latitude}
                        longitude={config.longitude}
                    />
                );
            case 'rss':
                return (
                    <RssWidget
                        {...commonProps}
                        feedUrl={config.url}
                        maxItems={config.itemsCount}
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
