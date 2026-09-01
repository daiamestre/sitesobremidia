import React, {
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
  useRef,
} from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RotateCcw, CheckCircle2, Type, Sparkles } from 'lucide-react';
import { TypedSignaturePadRef } from '../../types/assinatura.types';

export interface TypedSignaturePadProps {
  initialName?: string;
  onNameChange?: (name: string, isEmpty: boolean) => void;
  className?: string;
}

interface FontOption {
  id: string;
  name: string;
  fontFamily: string;
  styleDescription: string;
  fontSize: number;
}

const FONT_OPTIONS: FontOption[] = [
  {
    id: 'caveat',
    name: 'Fluido & Moderno',
    fontFamily: "'Caveat', cursive, sans-serif",
    styleDescription: 'Caligrafia fluida contemporânea',
    fontSize: 44,
  },
  {
    id: 'dancing',
    name: 'Elegante & Expressivo',
    fontFamily: "'Dancing Script', cursive, sans-serif",
    styleDescription: 'Escrita cursiva elegante e rítmica',
    fontSize: 40,
  },
  {
    id: 'greatvibes',
    name: 'Clássico & Formal',
    fontFamily: "'Great Vibes', 'Alex Brush', cursive, serif",
    styleDescription: 'Assinatura clássica tradicional com floreios',
    fontSize: 42,
  },
];

export const TypedSignaturePad = forwardRef<TypedSignaturePadRef, TypedSignaturePadProps>(
  ({ initialName = '', onNameChange, className = '' }, ref) => {
    const [name, setName] = useState(initialName);
    const nameRef = useRef(initialName);
    const [selectedFontId, setSelectedFontId] = useState<string>('caveat');

    const selectedFont = FONT_OPTIONS.find((f) => f.id === selectedFontId) || FONT_OPTIONS[0];

    useEffect(() => {
      nameRef.current = name;
      const empty = !name.trim();
      onNameChange?.(name.trim(), empty);
    }, [name, onNameChange]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      nameRef.current = val;
      setName(val);
    };

    const handleClear = () => {
      nameRef.current = '';
      setName('');
    };

    // Public Imperative Handle methods
    const isEmpty = useCallback(() => {
      return !nameRef.current.trim();
    }, []);

    const clear = useCallback(() => {
      nameRef.current = '';
      setName('');
    }, []);

    const getSelectedName = useCallback(() => {
      return nameRef.current.trim();
    }, []);

    // Renders the typographic signature to a cropped transparent canvas
    const renderToOffscreenCanvas = useCallback((): HTMLCanvasElement | null => {
      const trimmed = nameRef.current.trim();
      if (!trimmed) return null;

      const dpr = 3; // Ultra high-DPI for crisp PDF rendering
      const fontSize = selectedFont.fontSize;
      const fontFamily = selectedFont.fontFamily;

      // Measurement pass
      const testCanvas = document.createElement('canvas');
      const testCtx = testCanvas.getContext('2d');
      if (!testCtx) return null;

      testCtx.font = `600 ${fontSize}px ${fontFamily}`;
      const metrics = testCtx.measureText ? testCtx.measureText(trimmed) : { width: 150, actualBoundingBoxAscent: 30, actualBoundingBoxDescent: 10 };

      const textWidth = Math.ceil(metrics.width || 150);
      const textHeight = Math.ceil(
        (metrics.actualBoundingBoxAscent || fontSize * 0.8) +
          (metrics.actualBoundingBoxDescent || fontSize * 0.2)
      );

      const paddingX = 24;
      const paddingY = 20;
      const flourishHeight = 12;

      const totalWidth = textWidth + paddingX * 2;
      const totalHeight = textHeight + flourishHeight + paddingY * 2;

      const offscreen = document.createElement('canvas');
      offscreen.width = Math.round(totalWidth * dpr);
      offscreen.height = Math.round(totalHeight * dpr);

      const ctx = offscreen.getContext('2d');
      if (!ctx) return null;

      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, totalWidth, totalHeight);

      // Dark blue-black ink color for realistic signature impression
      const inkColor = '#0f172a';
      ctx.fillStyle = inkColor;
      ctx.strokeStyle = inkColor;

      // Draw text
      ctx.font = `600 ${fontSize}px ${fontFamily}`;
      ctx.textBaseline = 'alphabetic';
      const textX = paddingX;
      const textY = paddingY + (metrics.actualBoundingBoxAscent || fontSize * 0.8);
      if (typeof ctx.fillText === 'function') {
        ctx.fillText(trimmed, textX, textY);
      }

      // Draw elegant baseline flourish stroke
      const lineY = textY + 6;
      const lineWidth = textWidth + 8;
      ctx.lineWidth = 1.8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(textX, lineY);
      if (typeof ctx.quadraticCurveTo === 'function') {
        ctx.quadraticCurveTo(
          textX + lineWidth * 0.45,
          lineY + 3,
          textX + lineWidth * 0.85,
          lineY - 1
        );
        ctx.quadraticCurveTo(
          textX + lineWidth * 0.95,
          lineY - 2,
          textX + lineWidth,
          lineY + 1
        );
      }
      ctx.stroke();

      return offscreen;
    }, [selectedFont]);

    const toPngBlob = useCallback((): Promise<Blob | null> => {
      return new Promise((resolve) => {
        const canvas = renderToOffscreenCanvas();
        if (!canvas) {
          resolve(null);
          return;
        }
        if (typeof canvas.toBlob === 'function') {
          canvas.toBlob((blob) => {
            resolve(blob);
          }, 'image/png');
        } else {
          const dataUrl = canvas.toDataURL ? canvas.toDataURL('image/png') : '';
          const blob = new Blob([dataUrl], { type: 'image/png' });
          resolve(blob);
        }
      });
    }, [renderToOffscreenCanvas]);

    const toDataUrl = useCallback(async (): Promise<string | null> => {
      const canvas = renderToOffscreenCanvas();
      if (!canvas) return null;
      return canvas.toDataURL ? canvas.toDataURL('image/png') : null;
    }, [renderToOffscreenCanvas]);

    useImperativeHandle(
      ref,
      () => ({
        isEmpty,
        clear,
        toPngBlob,
        toDataUrl,
        getSelectedName,
      }),
      [isEmpty, clear, toPngBlob, toDataUrl, getSelectedName]
    );

    return (
      <div className={`space-y-4 ${className}`}>
        {/* Name Input */}
        <div className="space-y-1.5">
          <Label htmlFor="signer-name-input" className="text-xs font-semibold text-slate-300 flex items-center justify-between">
            <span className="flex items-center gap-1.5">
              <Type className="h-3.5 w-3.5 text-primary" /> Digite seu Nome Completo
            </span>
            <span className="text-[11px] font-normal text-slate-400">
              Conforme documento oficial
            </span>
          </Label>
          <Input
            id="signer-name-input"
            type="text"
            value={name}
            onChange={handleInputChange}
            placeholder="Exemplo: João Carlos da Silva"
            maxLength={100}
            className="bg-slate-950 border-slate-700 text-white placeholder:text-slate-500 rounded-xl h-10 text-sm focus:border-primary focus:ring-1 focus:ring-primary"
            autoFocus
          />
        </div>

        {/* Font Style Selection */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Escolha o Estilo Caligráfico
          </Label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {FONT_OPTIONS.map((font) => {
              const isSelected = selectedFontId === font.id;
              return (
                <button
                  key={font.id}
                  type="button"
                  onClick={() => setSelectedFontId(font.id)}
                  className={`p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-1.5 ${
                    isSelected
                      ? 'bg-primary/15 border-primary text-white shadow-md ring-1 ring-primary'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                  }`}
                >
                  <span className="text-[11px] font-bold block">{font.name}</span>
                  <span
                    className="text-base truncate block text-white/90"
                    style={{ fontFamily: font.fontFamily }}
                  >
                    {name.trim() || 'Assinatura'}
                  </span>
                  <span className="text-[9px] text-slate-500 line-clamp-1">
                    {font.styleDescription}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Live Visual Card Preview */}
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold text-slate-300">
            Pré-visualização da Assinatura no Documento:
          </Label>
          <div className="relative w-full min-h-[140px] rounded-xl bg-white border border-slate-300 shadow-inner flex flex-col items-center justify-center p-6 select-none overflow-hidden">
            {name.trim() ? (
              <div className="flex flex-col items-center justify-center animate-fade-in text-center">
                <span
                  className="text-3xl text-slate-900 tracking-wide select-none leading-none mb-1"
                  style={{ fontFamily: selectedFont.fontFamily }}
                >
                  {name.trim()}
                </span>
                {/* Decorative underline */}
                <div className="w-48 h-0.5 bg-gradient-to-r from-transparent via-slate-800 to-transparent my-1" />
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mt-1">
                  (assinatura eletrônica tipográfica)
                </span>
              </div>
            ) : (
              <div className="text-center text-slate-400 py-4">
                <Type className="h-6 w-6 mx-auto mb-1 opacity-40 text-slate-500" />
                <p className="text-xs">Digite seu nome acima para gerar a pré-visualização</p>
              </div>
            )}

            {name.trim() && (
              <div className="absolute top-2 right-2 flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm">
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                Assinatura Válida
              </div>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between text-xs pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleClear}
            disabled={!name.trim()}
            className="h-8 px-2.5 text-xs text-rose-300 border-rose-900/40 bg-rose-950/20 hover:bg-rose-900/30 hover:text-rose-200 rounded-lg gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            <span>Limpar Nome</span>
          </Button>
          <span className="text-[11px] text-slate-400">
            {name.trim() ? `${name.trim().length} caractere(s)` : 'Aguardando digitação...'}
          </span>
        </div>
      </div>
    );
  }
);

TypedSignaturePad.displayName = 'TypedSignaturePad';
