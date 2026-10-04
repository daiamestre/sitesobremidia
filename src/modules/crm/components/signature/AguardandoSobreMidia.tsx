import { useCallback, useEffect, useState } from 'react';
import { Building2, Loader2, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SignatureCaptureModal } from './SignatureCaptureModal';
import { assinarPelaEmpresa } from './AssinaturaEmpresa';
import type { SignatureCaptureResult } from '../../types/assinatura.types';

export interface ContratoAguardandoEmpresa {
  contrato_id: string;
  numero_contrato: string | null;
  tipo_contrato: string | null;
  parte: string | null;
  criado_em: string;
  cliente_assinou_em: string | null;
}

/** Contratos com documento gerado que ainda não têm a assinatura da Sobre Mídia (só dono/administrador vê). */
export async function listarAguardandoEmpresa(): Promise<ContratoAguardandoEmpresa[]> {
  const { data, error } = await supabase.rpc('fn_contratos_aguardando_empresa' as never);
  if (error) return [];
  return (data as unknown as ContratoAguardandoEmpresa[]) ?? [];
}

const ROTULO_TIPO: Record<string, string> = { ANUNCIANTE: 'Anunciante', PARCEIRO: 'Ponto parceiro', GESTOR: 'Gestor de mídias' };

/**
 * F-139 — Fila "Aguardando assinatura Sobre Mídia" da Central de Assinatura.
 * Igual à fila do cliente, mas para a assinatura da empresa: o dono ou o administrador assina aqui.
 */
export function AguardandoSobreMidia({ onAssinado, onContagem }: { onAssinado?: () => void; onContagem?: (n: number) => void }) {
  const { usuario } = useAuth();
  const [itens, setItens] = useState<ContratoAguardandoEmpresa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [alvo, setAlvo] = useState<ContratoAguardandoEmpresa | null>(null);
  const [gravando, setGravando] = useState<string | null>(null);
  const [mostrarTodos, setMostrarTodos] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const lista = await listarAguardandoEmpresa();
    setItens(lista);
    onContagem?.(lista.length);
    setCarregando(false);
  }, [onContagem]);

  useEffect(() => { void carregar(); }, [carregar]);

  const aoCapturar = async (r: SignatureCaptureResult) => {
    const c = alvo;
    setAlvo(null);
    if (!c || r.action !== 'SIGNED') return;
    setGravando(c.contrato_id);
    const res = await assinarPelaEmpresa(c.contrato_id, { nome: r.signer.nome, metodo: r.method === 'TYPED' ? 'TYPED' : 'DRAWN', imagem: r.signatureDataUrl ?? null });
    setGravando(null);
    if (!res.ok) { toast.error(res.erro); return; }
    toast.success(`Contrato ${c.numero_contrato || ''} assinado pela Sobre Mídia.`);
    await carregar();
    onAssinado?.();
  };

  const visiveis = mostrarTodos ? itens : itens.slice(0, 8);

  return (
    <Card className="border border-white/10 bg-slate-900/80 backdrop-blur-xl shadow-xl rounded-2xl" data-testid="fila-sobre-midia">
      <CardHeader className="pb-3 border-b border-white/10">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <Building2 className="h-4 w-4 text-sky-400" /> Aguardando assinatura Sobre Mídia ({itens.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-2 text-xs">
        {carregando ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : itens.length === 0 ? (
          <div className="text-center py-4 text-slate-500">Nenhum contrato aguardando a assinatura da Sobre Mídia.</div>
        ) : (
          <>
            {visiveis.map((c) => (
              <div key={c.contrato_id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 space-y-0.5">
                  <strong className="text-white font-mono block text-[11px]">Contrato: {c.numero_contrato || '—'}</strong>
                  <span className="block text-[11px] text-slate-300 truncate">{c.parte || '—'}</span>
                  <span className="block text-[10px] text-slate-400">
                    {ROTULO_TIPO[String(c.tipo_contrato || '').toUpperCase()] || c.tipo_contrato || 'Contrato'} · criado em {new Date(c.criado_em).toLocaleDateString('pt-BR')}
                  </span>
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30 text-[10px]">Aguardando Sobre Mídia</Badge>
                    {c.cliente_assinou_em
                      ? <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">Cliente já assinou</Badge>
                      : <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">Aguardando cliente</Badge>}
                  </div>
                </div>
                <Button size="sm" className="shrink-0 gap-1.5 h-8 text-xs" disabled={gravando === c.contrato_id} onClick={() => setAlvo(c)} data-testid="assinar-na-fila">
                  {gravando === c.contrato_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />} Assinar
                </Button>
              </div>
            ))}
            {itens.length > 8 && (
              <Button variant="ghost" size="sm" className="w-full text-xs text-slate-300" onClick={() => setMostrarTodos((v) => !v)}>
                {mostrarTodos ? 'Mostrar menos' : `Mostrar todos (${itens.length})`}
              </Button>
            )}
          </>
        )}
      </CardContent>

      {alvo && (
        <SignatureCaptureModal
          isOpen={!!alvo}
          onClose={() => setAlvo(null)}
          onCapture={aoCapturar}
          signer={{ nome: usuario?.nome || '', email: usuario?.email || '' }}
          contratoNumero={alvo.numero_contrato || ''}
          tipoContrato={alvo.tipo_contrato || 'ANUNCIANTE'}
          tituloDocumento="Assinatura da Sobre Mídia"
        />
      )}
    </Card>
  );
}
