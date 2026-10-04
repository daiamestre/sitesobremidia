import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Clock, Loader2, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SignatureCaptureModal } from './SignatureCaptureModal';
import type { SignatureCaptureResult } from '../../types/assinatura.types';

/** Grava a assinatura da Sobre Mídia (dono/administrador) num contrato. Erro já vem em português. */
export async function assinarPelaEmpresa(
  contratoId: string,
  dados: { nome: string; metodo?: 'DRAWN' | 'TYPED'; imagem?: string | null },
): Promise<{ ok: boolean; erro?: string; signatario?: string }> {
  const { data, error } = await supabase.rpc('fn_assinar_contrato_pela_empresa' as never, {
    p_contrato: contratoId,
    p_dados: {
      nome: dados.nome,
      metodo: dados.metodo || 'DRAWN',
      imagem: dados.imagem || null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    },
  } as never);
  if (error) return { ok: false, erro: error.message || 'Não foi possível registrar a assinatura.' };
  return { ok: true, signatario: (data as { signatario?: string } | null)?.signatario };
}

interface EstadoDaAssinatura { assinadoEm: string | null; signatario: string | null; numero: string | null; tipo: string | null }

interface Props {
  contratoId: string | null | undefined;
  /** Chamado depois que a empresa assina (para a tela recarregar listas/contadores). */
  onAssinado?: () => void;
  className?: string;
}

/**
 * F-139 — Assinatura da SOBRE MÍDIA no contrato.
 * Usado no cadastro de anunciante, gestor de mídias e ponto parceiro: o dono ou o administrador pode assinar na hora
 * ou deixar para depois (o contrato fica em "Aguardando assinatura Sobre Mídia" na Central de Assinatura).
 */
export function AssinaturaEmpresa({ contratoId, onAssinado, className }: Props) {
  const { usuario, isOwner, perfilNome } = useAuth();
  const podeAssinar = !!usuario?.is_owner || isOwner || perfilNome === 'OWNER' || perfilNome === 'ADMIN';
  const [estado, setEstado] = useState<EstadoDaAssinatura | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [modal, setModal] = useState(false);
  const [gravando, setGravando] = useState(false);

  const carregar = useCallback(async () => {
    if (!contratoId) { setEstado(null); return; }
    setCarregando(true);
    const { data } = await supabase.from('contratos')
      .select('numero_contrato, tipo_contrato, empresa_assinado_em, empresa_signatario_nome' as never)
      .eq('id', contratoId).maybeSingle();
    const c = data as { numero_contrato?: string; tipo_contrato?: string; empresa_assinado_em?: string | null; empresa_signatario_nome?: string | null } | null;
    setEstado({ assinadoEm: c?.empresa_assinado_em ?? null, signatario: c?.empresa_signatario_nome ?? null, numero: c?.numero_contrato ?? null, tipo: c?.tipo_contrato ?? null });
    setCarregando(false);
  }, [contratoId]);

  useEffect(() => { void carregar(); }, [carregar]);

  const aoCapturar = async (r: SignatureCaptureResult) => {
    setModal(false);
    if (!contratoId || r.action !== 'SIGNED') return;
    setGravando(true);
    const res = await assinarPelaEmpresa(contratoId, { nome: r.signer.nome, metodo: r.method === 'TYPED' ? 'TYPED' : 'DRAWN', imagem: r.signatureDataUrl ?? null });
    setGravando(false);
    if (!res.ok) { toast.error(res.erro); return; }
    toast.success('Contrato assinado pela Sobre Mídia.');
    await carregar();
    onAssinado?.();
  };

  if (!contratoId) return null;
  const assinado = !!estado?.assinadoEm;

  return (
    <div className={`rounded-xl border p-3 sm:p-4 ${assinado ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'} ${className ?? ''}`} data-testid="assinatura-empresa">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-bold text-white">Assinatura da Sobre Mídia</p>
          {carregando ? (
            <p className="flex items-center gap-2 text-xs text-slate-400"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Verificando…</p>
          ) : assinado ? (
            <>
              <Badge className="border-emerald-500/30 bg-emerald-500/20 text-emerald-300"><CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Assinado pela Sobre Mídia</Badge>
              <p className="text-xs text-slate-300">
                {estado?.signatario} · {new Date(estado!.assinadoEm!).toLocaleString('pt-BR')}
              </p>
            </>
          ) : (
            <>
              <Badge className="border-amber-500/30 bg-amber-500/20 text-amber-300"><Clock className="mr-1 h-3.5 w-3.5" /> Aguardando assinatura Sobre Mídia</Badge>
              <p className="text-xs text-slate-400">
                {podeAssinar
                  ? 'Você pode assinar agora ou deixar para depois, pela Central de Assinatura.'
                  : 'O dono ou o administrador assina pela Sobre Mídia na Central de Assinatura.'}
              </p>
            </>
          )}
        </div>
        {!assinado && podeAssinar && !carregando && (
          <Button type="button" onClick={() => setModal(true)} disabled={gravando} className="shrink-0 gap-2" data-testid="assinar-pela-empresa">
            {gravando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenLine className="h-4 w-4" />} Assinar pela Sobre Mídia
          </Button>
        )}
      </div>

      {modal && (
        <SignatureCaptureModal
          isOpen={modal}
          onClose={() => setModal(false)}
          onCapture={aoCapturar}
          signer={{ nome: usuario?.nome || '', email: usuario?.email || '' }}
          contratoNumero={estado?.numero || ''}
          tipoContrato={estado?.tipo || 'ANUNCIANTE'}
          tituloDocumento="Assinatura da Sobre Mídia"
        />
      )}
    </div>
  );
}
