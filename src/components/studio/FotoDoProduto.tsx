// F-359 (dono, 24/11/2026: "não admito produto com fundo branco, nem nas prévias, nem nas capas, nem na criação"):
// miniatura de PRODUTO em qualquer tela do Studio. Mostra a foto só depois de passar pelo MESMO recorte das artes
// (carregarImagemDoProduto): foto com fundo opaco tem o fundo tirado; enquanto isso aparece só um marcador discreto.
import { useEffect, useState } from 'react';
import { carregarImagemDoProduto } from '@/lib/studio/desenhar';

interface Props { src: string; alt?: string; className?: string }

export function FotoDoProduto({ src, alt = '', className = 'h-full w-full object-contain' }: Props) {
  const [pronta, setPronta] = useState<string | null>(null);
  useEffect(() => {
    let vivo = true;
    setPronta(null);
    void carregarImagemDoProduto(src).then((i) => { if (vivo) setPronta(i?.src ?? null); });
    return () => { vivo = false; };
  }, [src]);
  if (!pronta) return <span className={`${className} block animate-pulse rounded bg-white/5`} aria-label={alt || 'carregando foto do produto'} />;
  return <img src={pronta} alt={alt} className={className} />;
}
