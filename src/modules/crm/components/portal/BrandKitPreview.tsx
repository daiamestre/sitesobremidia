import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface BrandKitPreviewProps {
  logoUrl?: string;
  corPrimaria: string;
  corSecundaria: string;
  fontePrimaria: string;
  fonteSecundaria: string;
}

export function BrandKitPreview({
  logoUrl,
  corPrimaria,
  corSecundaria,
  fontePrimaria,
  fonteSecundaria,
}: BrandKitPreviewProps) {
  return (
    <Card className="overflow-hidden border-2" style={{ borderColor: corPrimaria }}>
      {/* Header simulando um App/Encarte */}
      <div 
        className="h-24 p-4 flex items-center justify-between"
        style={{ backgroundColor: corPrimaria, color: corSecundaria }}
      >
        <div className="flex items-center gap-4">
          {logoUrl ? (
            <div className="w-16 h-16 rounded-md bg-white p-1 flex items-center justify-center shadow-sm">
              <img src={logoUrl} alt="Logo do Cliente" className="max-w-full max-h-full object-contain" />
            </div>
          ) : (
            <div className="w-16 h-16 rounded-md bg-white/20 border border-white/40 flex items-center justify-center">
              <span className="text-xs font-medium">Logo</span>
            </div>
          )}
          <div>
            <h3 className="text-xl font-bold" style={{ fontFamily: fontePrimaria }}>Sua Marca</h3>
            <p className="text-sm opacity-90" style={{ fontFamily: fonteSecundaria }}>Identidade Visual</p>
          </div>
        </div>
      </div>

      <CardContent className="p-6 bg-slate-50 dark:bg-slate-900 space-y-6">
        <div className="space-y-2">
          <h4 className="font-semibold text-lg" style={{ fontFamily: fontePrimaria }}>
            Tipografia Primária ({fontePrimaria})
          </h4>
          <p className="text-muted-foreground" style={{ fontFamily: fonteSecundaria }}>
            A fonte secundária ({fonteSecundaria}) será utilizada em corpos de texto, descrições e legendas para garantir a legibilidade.
          </p>
        </div>

        <div className="flex gap-4">
          <button 
            className="px-4 py-2 rounded-md font-medium transition-transform hover:scale-105"
            style={{ backgroundColor: corPrimaria, color: corSecundaria, fontFamily: fontePrimaria }}
          >
            Botão Primário
          </button>
          
          <button 
            className="px-4 py-2 rounded-md font-medium border-2 transition-transform hover:scale-105"
            style={{ 
              borderColor: corPrimaria, 
              color: corPrimaria, 
              backgroundColor: 'transparent',
              fontFamily: fontePrimaria 
            }}
          >
            Botão Secundário
          </button>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg shadow-sm" style={{ backgroundColor: corPrimaria, color: corSecundaria }}>
            <span className="font-mono text-sm block mb-1">Cor Primária</span>
            <span className="font-bold">{corPrimaria}</span>
          </div>
          <div className="p-4 rounded-lg shadow-sm border" style={{ backgroundColor: corSecundaria, color: corPrimaria, borderColor: corPrimaria }}>
            <span className="font-mono text-sm block mb-1">Cor Secundária</span>
            <span className="font-bold">{corSecundaria}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
