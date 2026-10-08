import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { alertasVistosAoAbrir, avisosVistosKey, registrarAvisoVisto, type AvisoVisto } from '@/lib/avisosVistos';

/** F-167 — Abrir a tela para onde um alerta aponta conta como ter visto o alerta (some da faixa do topo até a situação mudar). */
export function VigiaDeAvisosVistos() {
  const { pathname } = useLocation();
  const qc = useQueryClient();

  useEffect(() => {
    const vistos = alertasVistosAoAbrir(pathname);
    if (vistos.length === 0) return;
    qc.setQueryData<AvisoVisto[]>(avisosVistosKey, (atual = []) => [
      ...atual.filter((v) => !vistos.some((n) => n.chave === v.chave)),
      ...vistos,
    ]);
    void Promise.all(vistos.map((v) => registrarAvisoVisto(v.chave, v.assinatura)));
  }, [pathname, qc]);

  return null;
}
