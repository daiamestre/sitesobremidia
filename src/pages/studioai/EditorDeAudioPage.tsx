/**
 * Pedido do dono (18/11/2026): EDITOR DE ÁUDIO completo no Studio — SÓ owner/ADM (uso interno) veem o item no menu e entram
 * aqui; os outros perfis voltam para o início do Studio (mesma regra da Biblioteca de Loop e do Acervo).
 */
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { meuSaldo } from '@/lib/studioai/api';
import { EditorDeAudio } from '@/components/studio/audio/EditorDeAudio';

export default function EditorDeAudioPage() {
  const saldo = useQuery({ queryKey: ['studio-ai-saldo'], queryFn: meuSaldo, staleTime: 30_000 });
  if (saldo.isLoading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-[#B04DFF]" /></div>;
  if (saldo.data?.paga !== false) return <Navigate to="/studio" replace />;
  return <EditorDeAudio />;
}
