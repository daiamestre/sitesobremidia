import { useState } from 'react';
import { Download, FileArchive, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  LOGOS_SOBRE_MIDIA, MODELOS_DAS_LOGOS, ZIP_DAS_LOGOS, formatoDaLogo, urlDaLogo,
} from '@/lib/logosSobreMidia';
import { montarZip } from '@/lib/zipSimples';

// quadriculado escuro: mostra o fundo transparente sem esconder a logo de nome branco
const QUADRICULADO = {
  backgroundColor: '#1c1f2e',
  backgroundImage:
    'linear-gradient(45deg, #2a2e42 25%, transparent 25%), linear-gradient(-45deg, #2a2e42 25%, transparent 25%),' +
    'linear-gradient(45deg, transparent 75%, #2a2e42 75%), linear-gradient(-45deg, transparent 75%, #2a2e42 75%)',
  backgroundSize: '20px 20px',
  backgroundPosition: '0 0, 0 10px, 10px -10px, -10px 0',
};

/** F-217: pasta "Logos Sobre Mídia" da galeria — as 9 logos da marca, cada uma com o seu download, e todas em ZIP. */
export function PastaLogosSobreMidia() {
  const [montando, setMontando] = useState(false);
  // o ZIP é montado aqui no navegador com os 9 arquivos da pasta (um ZIP fixo de 10 MB passaria do teto do site)
  const baixarTodas = async () => {
    setMontando(true);
    try {
      const arquivos = await Promise.all(LOGOS_SOBRE_MIDIA.map(async (l) => {
        const r = await fetch(urlDaLogo(l));
        if (!r.ok) throw new Error(`Não foi possível ler ${l.arquivo}.`);
        return { nome: `logos-sobre-midia/${l.arquivo}`, dados: new Uint8Array(await r.arrayBuffer()) };
      }));
      const url = URL.createObjectURL(new Blob([montarZip(arquivos)], { type: 'application/zip' }));
      const a = document.createElement('a');
      a.href = url; a.download = ZIP_DAS_LOGOS; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { toast.error((e as Error).message); } finally { setMontando(false); }
  };
  return (
    <div className="space-y-4" data-testid="pasta-logos">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          As 9 logos da Sobre Mídia, iguais às originais e nítidas. Toque em uma para abrir no tamanho real.
        </p>
        <Button type="button" onClick={() => void baixarTodas()} disabled={montando} className="gradient-primary shrink-0" data-testid="baixar-todas-logos">
          {montando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileArchive className="h-4 w-4 mr-2" />}
          Baixar todas (ZIP)
        </Button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {LOGOS_SOBRE_MIDIA.map((logo) => (
          <Card key={logo.arquivo} className="glass overflow-hidden" data-testid="logo-sobre-midia">
            <a href={urlDaLogo(logo)} target="_blank" rel="noreferrer" className="block aspect-square p-4" style={logo.transparente ? QUADRICULADO : { backgroundColor: '#1c1f2e' }}>
              <img src={urlDaLogo(logo)} alt={logo.nome} loading="lazy" className="h-full w-full object-contain" />
            </a>
            <CardContent className="p-3 space-y-2">
              <div className="min-w-0">
                <p className="font-semibold truncate">{logo.nome}</p>
                <p className="text-xs text-muted-foreground truncate">{MODELOS_DAS_LOGOS[logo.modelo]}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {logo.arquivo} · {logo.largura} × {logo.altura} px · {formatoDaLogo(logo)}
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="w-full">
                <a href={urlDaLogo(logo)} download={logo.arquivo} data-testid={`baixar-${logo.arquivo}`}>
                  <Download className="h-4 w-4 mr-2" />
                  Baixar
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
