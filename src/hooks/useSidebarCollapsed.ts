import { useCallback, useState } from 'react';

/**
 * Menu lateral recolhido/aberto no computador, lembrado por navegador (cada layout tem a sua chave).
 * Abaixo de 1280 px o menu não fica fixo: abre por cima do conteúdo pelo botão do topo (ver layouts).
 */
export function useSidebarCollapsed(key: string): [boolean, () => void] {
  const storageKey = `sidebar-collapsed:${key}`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(storageKey) === '1';
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(storageKey, next ? '1' : '0');
      } catch {
        // armazenamento bloqueado: vale só nesta sessão
      }
      return next;
    });
  }, [storageKey]);

  return [collapsed, toggle];
}
