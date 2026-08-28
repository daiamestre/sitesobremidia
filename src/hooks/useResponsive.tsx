import * as React from "react";

/**
 * Hook centralizado responsivo — FASE 10
 * Prioridade: CSS media queries + pointer/touch, NÃO User-Agent.
 * Não espalhar window.innerWidth pela aplicação.
 * Preserva compatibilidade com useIsMobile existente.
 */

export type Breakpoint = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";

// Breakpoints alinhados ao Tailwind padrão + projeto (mesma matriz da FASE 2)
export const BREAKPOINTS = {
  xs: 0,      // 0-319  (mobile pequeno)
  sm: 640,    // 640px  (mobile grande -> tablet)
  md: 768,    // 768px  (tablet)
  lg: 1024,   // 1024px (tablet grande / notebook)
  xl: 1280,   // 1280px (notebook)
  "2xl": 1536 // 1536px (desktop)
} as const;

export interface ResponsiveState {
  breakpoint: Breakpoint;
  width: number;
  isMobile: boolean;      // < 768
  isTablet: boolean;      // 768 - 1023
  isDesktop: boolean;     // >= 1024
  isLargeDesktop: boolean;// >= 1280
  isPortrait: boolean;
  isLandscape: boolean;
  isTouch: boolean;       // coarse pointer
  isSmallMobile: boolean; // < 375
}

function getBreakpoint(width: number): Breakpoint {
  if (width >= BREAKPOINTS["2xl"]) return "2xl";
  if (width >= BREAKPOINTS.xl) return "xl";
  if (width >= BREAKPOINTS.lg) return "lg";
  if (width >= BREAKPOINTS.md) return "md";
  if (width >= BREAKPOINTS.sm) return "sm";
  return "xs";
}

function getState(): ResponsiveState {
  if (typeof window === "undefined") {
    return {
      breakpoint: "lg",
      width: 1024,
      isMobile: false,
      isTablet: false,
      isDesktop: true,
      isLargeDesktop: false,
      isPortrait: false,
      isLandscape: true,
      isTouch: false,
      isSmallMobile: false,
    };
  }
  const width = window.innerWidth;
  const height = window.innerHeight;
  const bp = getBreakpoint(width);
  const isTouch = window.matchMedia("(pointer: coarse)").matches;
  return {
    breakpoint: bp,
    width,
    isMobile: width < 768,
    isTablet: width >= 768 && width < 1024,
    isDesktop: width >= 1024,
    isLargeDesktop: width >= 1280,
    isPortrait: height > width,
    isLandscape: width >= height,
    isTouch,
    isSmallMobile: width < 375,
  };
}

export function useResponsive(): ResponsiveState {
  const [state, setState] = React.useState<ResponsiveState>(() => getState());

  React.useEffect(() => {
    const onResize = () => setState(getState());
    // matchMedia listeners cobrem os principais breakpoints + orientação + pointer
    const mqls: MediaQueryList[] = [
      window.matchMedia("(max-width: 767px)"),
      window.matchMedia("(min-width: 768px) and (max-width: 1023px)"),
      window.matchMedia("(min-width: 1024px)"),
      window.matchMedia("(orientation: portrait)"),
      window.matchMedia("(pointer: coarse)"),
    ];
    // resize como fallback para width exato
    window.addEventListener("resize", onResize);
    mqls.forEach((mql) => mql.addEventListener("change", onResize));
    // garantir estado inicial atualizado
    onResize();
    return () => {
      window.removeEventListener("resize", onResize);
      mqls.forEach((mql) => mql.removeEventListener("change", onResize));
    };
  }, []);

  return state;
}

// Re-export compatível para consumo existente
export { useIsMobile } from "./use-mobile";
