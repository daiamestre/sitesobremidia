import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const LinkPlayer = () => {
    const { id } = useParams();
    const [link, setLink] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLink = async () => {
            if (!id) return;
            const { data, error } = await supabase
                .from('external_links')
                .select('*')
                .eq('id', id)
                .single();

            if (data) {
                setLink(data);
            }
            setLoading(false);
        };

        fetchLink();
    }, [id]);

    if (loading) return (
        <div className="h-screen w-full flex items-center justify-center bg-black">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
    );

    if (!link) return (
        <div className="h-screen w-full flex items-center justify-center bg-black text-white">
            Link não encontrado
        </div>
    );

    return (
        <div className="h-screen w-full bg-black">
            <iframe
                src={link.url}
                className="w-full h-full border-none"
                title={link.title}
                allow="autoplay; encrypted-media; fullscreen"
            />
        </div>
    );
};

export default LinkPlayer;
