import { useClienteModalidade } from '@/modules/crm/hooks/useClienteModalidade';
import { TabloideEditor } from '@/components/tabloide/TabloideEditor';
import { Skeleton } from '@/components/ui/skeleton';

/** F-172: Tabloide Digital do anunciante — só digita produto e preço. */
export default function TabloidePage() {
  const { cliente, isLoading } = useClienteModalidade();
  if (isLoading) return <div className="p-6"><Skeleton className="h-96 w-full" /></div>;
  return (
    <TabloideEditor
      contexto="portal"
      clienteId={cliente?.id ?? null}
      empresaPadrao={cliente?.nome_fantasia || cliente?.razao_social || ''}
      logoPadrao={cliente?.brand_logo_url ?? null}
      segmentoPadrao={cliente?.segmento ?? null}
    />
  );
}
