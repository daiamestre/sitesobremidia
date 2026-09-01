import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { Button } from '@/components/ui/button';
import { RotateCcw, Undo2, PenTool, CheckCircle2 } from 'lucide-react';
import { CanvasSignaturePadRef } from '../../types/assinatura.types';

export interface CanvasSignaturePadProps {
  onStrokeChange?: (isEmpty: boolean) => void;
  lineColor?: string;
  strokeWidth?: number;
  height?: number | string;
  className?: string;
  showControls?: boolean;
}

interface Point {
  x: number;
  y: number;
  pressure?: number;
}

type Stroke = Point[];

export const CanvasSignaturePad = forwardRef<CanvasSignaturePadRef, CanvasSignaturePadProps>(
  (
    {
      onStrokeChange,
      lineColor = '#0f172a',
      strokeWidth = 2.5,
      height = 200,
      className = '',
      showControls = true,
    },
    ref
  ) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [strokes, setStrokes] = useState<Stroke[]>([]);
    const strokesRef = useRef<Stroke[]>([]);
    const currentStrokeRef = useRef<Stroke | null>(null);
    const isDrawingRef = useRef(false);
    const activePointerIdRef = useRef<number | null>(null);
    const [hasContent, setHasContent] = useState(false);

    // Keep strokesRef in sync with strokes state
    useEffect(() => {
      strokesRef.current = strokes;
      const empty = strokes.length === 0;
      setHasContent(!empty);
      onStrokeChange?.(empty);
    }, [strokes, onStrokeChange]);

    // Redraw all strokes on canvas with high DPI support
    const redrawCanvas = useCallback(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
      const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { width: 400, height: 200 };
      const cssWidth = Math.max(rect.width || 400, 50);
      const cssHeight = Math.max(rect.height || 200, 50);

      // Ensure proper internal canvas dimensions matching CSS size * DPR
      if (canvas.width !== Math.floor(cssWidth * dpr) || canvas.height !== Math.floor(cssHeight * dpr)) {
        canvas.width = Math.floor(cssWidth * dpr);
        canvas.height = Math.floor(cssHeight * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      ctx.strokeStyle = lineColor;
      ctx.fillStyle = lineColor;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = strokeWidth;

      const allStrokes = strokesRef.current;
      for (const stroke of allStrokes) {
        if (stroke.length === 0) continue;

        if (stroke.length === 1) {
          // Single point / dot
          ctx.beginPath();
          ctx.arc(stroke[0].x, stroke[0].y, strokeWidth / 2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);

        if (stroke.length === 2) {
          ctx.lineTo(stroke[1].x, stroke[1].y);
        } else {
          for (let i = 1; i < stroke.length - 1; i++) {
            const midX = (stroke[i].x + stroke[i + 1].x) / 2;
            const midY = (stroke[i].y + stroke[i + 1].y) / 2;
            ctx.quadraticCurveTo(stroke[i].x, stroke[i].y, midX, midY);
          }
          const last = stroke[stroke.length - 1];
          const secondLast = stroke[stroke.length - 2];
          ctx.quadraticCurveTo(secondLast.x, secondLast.y, last.x, last.y);
        }
        ctx.stroke();
      }

      ctx.restore();
    }, [lineColor, strokeWidth]);

    // Handle responsive container resize safely
    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      try {
        if (typeof ResizeObserver === 'function') {
          const observer = new ResizeObserver(() => {
            redrawCanvas();
          });
          observer.observe(container);
          return () => {
            try {
              observer.disconnect();
            } catch {
              // Graceful catch
            }
          };
        }
      } catch {
        // Fallback when ResizeObserver is not a constructor in mock environments
      }

      const handleResize = () => redrawCanvas();
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }, [redrawCanvas]);

    // Pointer event handlers (Touch + Stylus + Mouse unified)
    const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.isPrimary === false) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Capture pointer for continuous tracking outside canvas boundaries
      try {
        if (typeof canvas.setPointerCapture === 'function') {
          canvas.setPointerCapture(e.pointerId);
        }
      } catch {
        // Fallback for environments where setPointerCapture might be unavailable
      }

      activePointerIdRef.current = e.pointerId;
      isDrawingRef.current = true;

      const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
      const point: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure: e.pressure || 0.5,
      };

      currentStrokeRef.current = [point];

      // Draw immediate initial dot
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.fillStyle = lineColor;
        ctx.beginPath();
        ctx.arc(point.x, point.y, strokeWidth / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || e.pointerId !== activePointerIdRef.current) return;
      const canvas = canvasRef.current;
      if (!canvas || !currentStrokeRef.current) return;

      const rect = canvas.getBoundingClientRect ? canvas.getBoundingClientRect() : { left: 0, top: 0 };
      const point: Point = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        pressure: e.pressure || 0.5,
      };

      const stroke = currentStrokeRef.current;
      const prevPoint = stroke[stroke.length - 1];

      // Minimum displacement filter to prevent redundant micro-points
      const dist = Math.hypot(point.x - prevPoint.x, point.y - prevPoint.y);
      if (dist < 1.2) return;

      stroke.push(point);

      // Direct incremental drawing for ultra-low latency responsiveness
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
        ctx.save();
        ctx.scale(dpr, dpr);
        ctx.strokeStyle = lineColor;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = strokeWidth;

        if (stroke.length >= 3) {
          const p0 = stroke[stroke.length - 3];
          const p1 = stroke[stroke.length - 2];
          const p2 = stroke[stroke.length - 1];
          const mid1X = (p0.x + p1.x) / 2;
          const mid1Y = (p0.y + p1.y) / 2;
          const mid2X = (p1.x + p2.x) / 2;
          const mid2Y = (p1.y + p2.y) / 2;

          ctx.beginPath();
          ctx.moveTo(mid1X, mid1Y);
          ctx.quadraticCurveTo(p1.x, p1.y, mid2X, mid2Y);
          ctx.stroke();
        } else if (stroke.length === 2) {
          ctx.beginPath();
          ctx.moveTo(prevPoint.x, prevPoint.y);
          ctx.lineTo(point.x, point.y);
          ctx.stroke();
        }
        ctx.restore();
      }
    };

    const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawingRef.current || e.pointerId !== activePointerIdRef.current) return;
      const canvas = canvasRef.current;
      if (canvas) {
        try {
          if (typeof canvas.releasePointerCapture === 'function') {
            canvas.releasePointerCapture(e.pointerId);
          }
        } catch {
          // Graceful catch
        }
      }

      isDrawingRef.current = false;
      activePointerIdRef.current = null;

      if (currentStrokeRef.current && currentStrokeRef.current.length > 0) {
        const completedStroke = currentStrokeRef.current;
        currentStrokeRef.current = null;
        setStrokes((prev) => [...prev, completedStroke]);
      }
    };

    // Public Imperative Methods (Ref)
    const isEmpty = useCallback(() => {
      return strokesRef.current.length === 0;
    }, []);

    const clear = useCallback(() => {
      strokesRef.current = [];
      currentStrokeRef.current = null;
      isDrawingRef.current = false;
      activePointerIdRef.current = null;
      setStrokes([]);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      setHasContent(false);
      onStrokeChange?.(true);
    }, [onStrokeChange]);

    const undo = useCallback(() => {
      setStrokes((prev) => {
        if (prev.length === 0) return prev;
        const next = prev.slice(0, prev.length - 1);
        strokesRef.current = next;
        return next;
      });
      setTimeout(() => redrawCanvas(), 0);
    }, [redrawCanvas]);

    // Crop signature to bounding box with padding and export transparent PNG
    const getCroppedCanvas = useCallback((): HTMLCanvasElement | null => {
      const allStrokes = strokesRef.current;
      if (allStrokes.length === 0) return null;

      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      for (const stroke of allStrokes) {
        for (const pt of stroke) {
          if (pt.x < minX) minX = pt.x;
          if (pt.y < minY) minY = pt.y;
          if (pt.x > maxX) maxX = pt.x;
          if (pt.y > maxY) maxY = pt.y;
        }
      }

      if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
        return null;
      }

      const padding = 16;
      const rawWidth = Math.max(1, maxX - minX);
      const rawHeight = Math.max(1, maxY - minY);

      const cropWidth = rawWidth + padding * 2;
      const cropHeight = rawHeight + padding * 2;

      const dpr = typeof window !== 'undefined' ? Math.max(2, window.devicePixelRatio || 2) : 2;
      const offscreen = document.createElement('canvas');
      offscreen.width = Math.round(cropWidth * dpr);
      offscreen.height = Math.round(cropHeight * dpr);

      const ctx = offscreen.getContext('2d');
      if (!ctx) return null;

      ctx.scale(dpr, dpr);
      ctx.strokeStyle = lineColor;
      ctx.fillStyle = lineColor;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = strokeWidth;

      const offsetX = -minX + padding;
      const offsetY = -minY + padding;

      for (const stroke of allStrokes) {
        if (stroke.length === 0) continue;

        if (stroke.length === 1) {
          ctx.beginPath();
          ctx.arc(stroke[0].x + offsetX, stroke[0].y + offsetY, strokeWidth / 2, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(stroke[0].x + offsetX, stroke[0].y + offsetY);

        if (stroke.length === 2) {
          ctx.lineTo(stroke[1].x + offsetX, stroke[1].y + offsetY);
        } else {
          for (let i = 1; i < stroke.length - 1; i++) {
            const midX = (stroke[i].x + stroke[i + 1].x) / 2 + offsetX;
            const midY = (stroke[i].y + stroke[i + 1].y) / 2 + offsetY;
            ctx.quadraticCurveTo(stroke[i].x + offsetX, stroke[i].y + offsetY, midX, midY);
          }
          const last = stroke[stroke.length - 1];
          const secondLast = stroke[stroke.length - 2];
          ctx.quadraticCurveTo(secondLast.x + offsetX, secondLast.y + offsetY, last.x + offsetX, last.y + offsetY);
        }
        ctx.stroke();
      }

      return offscreen;
    }, [lineColor, strokeWidth]);

    const toPngBlob = useCallback((): Promise<Blob | null> => {
      return new Promise((resolve) => {
        const cropped = getCroppedCanvas();
        if (!cropped) {
          resolve(null);
          return;
        }
        if (typeof cropped.toBlob === 'function') {
          cropped.toBlob((blob) => {
            resolve(blob);
          }, 'image/png');
        } else {
          // Fallback if toBlob is not defined
          const dataUrl = cropped.toDataURL ? cropped.toDataURL('image/png') : '';
          const blob = new Blob([dataUrl], { type: 'image/png' });
          resolve(blob);
        }
      });
    }, [getCroppedCanvas]);

    const toDataUrl = useCallback((): string | null => {
      const cropped = getCroppedCanvas();
      if (!cropped) return null;
      return cropped.toDataURL ? cropped.toDataURL('image/png') : null;
    }, [getCroppedCanvas]);

    useImperativeHandle(
      ref,
      () => ({
        isEmpty,
        clear,
        undo,
        toPngBlob,
        toDataUrl,
      }),
      [isEmpty, clear, undo, toPngBlob, toDataUrl]
    );

    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {/* Canvas Area Container */}
        <div
          ref={containerRef}
          className="relative w-full rounded-xl bg-white border border-slate-300 shadow-inner overflow-hidden select-none"
          style={{ height, touchAction: 'none' }}
        >
          {/* Watermark Guidelines / Signature line */}
          <div className="absolute inset-0 pointer-events-none flex flex-col justify-end px-6 pb-6 select-none opacity-60">
            <div className="w-full border-b border-dashed border-slate-400/80 mb-1 flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                <PenTool className="h-3 w-3 text-slate-400" />
                Assine sobre a linha (Dedo, Caneta Stylus ou Mouse)
              </span>
              <span className="text-[10px] text-slate-400 uppercase tracking-widest font-mono">
                Assinatura Oficial
              </span>
            </div>
          </div>

          {/* Interactive HTML5 Canvas with Pointer Events */}
          <canvas
            ref={canvasRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUpOrCancel}
            onPointerCancel={handlePointerUpOrCancel}
            className="w-full h-full cursor-crosshair block relative z-10"
            style={{ touchAction: 'none' }}
            aria-label="Área de assinatura digital manuscrita"
          />

          {/* Status Indicator */}
          {hasContent && (
            <div className="absolute top-2 right-2 z-20 pointer-events-none flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-bold shadow-sm animate-fade-in">
              <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              Traçado Registrado
            </div>
          )}
        </div>

        {/* Toolbar Controls */}
        {showControls && (
          <div className="flex items-center justify-between text-xs pt-1">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={undo}
                disabled={!hasContent}
                className="h-8 px-2.5 text-xs text-slate-300 border-slate-700 bg-slate-800/80 hover:bg-slate-700 hover:text-white rounded-lg gap-1.5"
                title="Desfazer último traço"
              >
                <Undo2 className="h-3.5 w-3.5" />
                <span>Desfazer</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={clear}
                disabled={!hasContent}
                className="h-8 px-2.5 text-xs text-rose-300 border-rose-900/40 bg-rose-950/20 hover:bg-rose-900/30 hover:text-rose-200 rounded-lg gap-1.5"
                title="Limpar toda a área de assinatura"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Limpar</span>
              </Button>
            </div>
            <span className="text-[11px] text-slate-400">
              {hasContent ? `${strokes.length} traço(s)` : 'Aguardando traço...'}
            </span>
          </div>
        )}
      </div>
    );
  }
);

CanvasSignaturePad.displayName = 'CanvasSignaturePad';
