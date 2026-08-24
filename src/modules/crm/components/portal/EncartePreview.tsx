import React, { forwardRef } from 'react';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/utils/formatters';

interface EncartePreviewProps {
  cliente: any;
  ofertas: any[];
  titulo: string;
  descricao?: string;
  corPrimaria?: string;
  corSecundaria?: string;
  logoUrl?: string;
}

export const EncartePreview = forwardRef<HTMLDivElement, EncartePreviewProps>(({
  cliente,
  ofertas,
  titulo,
  descricao,
  corPrimaria,
  corSecundaria,
  logoUrl
}, ref) => {
  const primaryColor = corPrimaria || cliente?.brand_cor_primaria || '#5D1BFF';
  const secondaryColor = corSecundaria || cliente?.brand_cor_secundaria || '#22004A';
  const logo = logoUrl || cliente?.brand_logo_url || cliente?.logo_url;
  
  return (
    <div 
      ref={ref} 
      className="bg-white w-full max-w-[800px] mx-auto overflow-hidden shadow-lg print:shadow-none print:w-[210mm] print:h-fit"
      style={{
        fontFamily: cliente?.brand_fonte_primaria || 'Inter, sans-serif'
      }}
    >
      {/* Header */}
      <div 
        className="p-8 text-white flex flex-col items-center justify-center text-center space-y-4 relative"
        style={{ backgroundColor: primaryColor }}
      >
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)`
          }}
        />
        {logo ? (
          <img src={logo} alt={cliente?.razao_social} className="h-20 object-contain z-10 bg-white/10 p-2 rounded-lg backdrop-blur-sm" />
        ) : (
          <h1 className="text-3xl font-bold z-10">{cliente?.nome_fantasia || cliente?.razao_social}</h1>
        )}
        <div className="z-10">
          <h2 className="text-4xl font-black uppercase tracking-wider">{titulo || 'Ofertas Especiais'}</h2>
          {descricao && <p className="mt-2 text-white/80 max-w-lg mx-auto">{descricao}</p>}
        </div>
      </div>

      {/* Grid de Ofertas */}
      <div className="p-8 bg-gray-50/50">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {ofertas.map((oferta, index) => {
            const prod = oferta.produto;
            const desconto = oferta.desconto_percentual || 
              (prod?.preco_venda && oferta.preco_promocional ? 
                Math.round(((prod.preco_venda - oferta.preco_promocional) / prod.preco_venda) * 100) : 0);

            return (
              <Card key={oferta.id || index} className="overflow-hidden border-0 shadow-sm hover:shadow-md transition-shadow bg-white flex flex-col h-full rounded-xl">
                {/* Imagem */}
                <div className="relative aspect-square p-4 flex items-center justify-center bg-white border-b border-gray-100">
                  {prod?.imagem_url ? (
                    <img src={prod.imagem_url} alt={prod.nome} className="object-contain w-full h-full mix-blend-multiply" />
                  ) : (
                    <div className="w-full h-full bg-gray-100 rounded flex items-center justify-center text-gray-400 font-medium">
                      Sem Imagem
                    </div>
                  )}
                  {desconto > 0 && (
                    <div 
                      className="absolute top-2 right-2 text-white text-xs font-bold px-2 py-1 rounded-full shadow-sm"
                      style={{ backgroundColor: '#ef4444' }}
                    >
                      -{desconto}%
                    </div>
                  )}
                </div>
                
                {/* Dados */}
                <div className="p-4 flex flex-col flex-grow text-center">
                  <h3 className="font-bold text-gray-800 line-clamp-2 min-h-[2.5rem] leading-tight text-sm uppercase">
                    {oferta.titulo || prod?.nome}
                  </h3>
                  
                  <div className="mt-auto pt-3">
                    {prod?.preco_venda && prod.preco_venda > (oferta.preco_promocional || 0) && (
                      <div className="text-gray-400 line-through text-xs mb-0.5">
                        De: {formatCurrency(prod.preco_venda)}
                      </div>
                    )}
                    <div 
                      className="text-2xl font-black"
                      style={{ color: secondaryColor }}
                    >
                      {formatCurrency(oferta.preco_promocional || prod?.preco_venda || 0)}
                    </div>
                    {prod?.unidade_medida && (
                      <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider mt-1">
                        Por {prod.unidade_medida}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div 
        className="p-6 text-white text-center text-sm"
        style={{ backgroundColor: secondaryColor }}
      >
        <p className="font-medium opacity-90">{cliente?.razao_social} • Ofertas válidas enquanto durarem os estoques.</p>
      </div>
    </div>
  );
});

EncartePreview.displayName = 'EncartePreview';
