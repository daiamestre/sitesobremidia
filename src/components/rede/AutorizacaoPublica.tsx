import { useEffect, useState } from 'react';
import { Globe } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Switch } from '@/components/ui/switch';

/**
 * F-148 — Autorização para o cliente aparecer em "Nossos Clientes" e no mapa da página inicial.
 * Só o dono e o administrador veem e mudam; o padrão é NÃO aparecer. Em público saem apenas nome, logo, cidade e UF.
 */
export function AutorizacaoPublica({ clienteId }: { clienteId: string }) {
  const { perfilNome, isOwner } = useAuth();
  const pode = isOwner || perfilNome === 'OWNER' || perfilNome === 'ADMIN';
  const [exibir, setExibir] = useState<boolean | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (!pode) return;
    let vivo = true;
    supabase.from('clientes').select('exibir_publicamente' as never).eq('id', clienteId).maybeSingle().then(({ data }) => {
      if (vivo) setExibir(((data as unknown as { exibir_publicamente?: boolean } | null)?.exibir_publicamente) === true);
    });
    return () => { vivo = false; };
  }, [clienteId, pode]);

  if (!pode || exibir === null) return null;

  const mudar = async (v: boolean) => {
    setSalvando(true);
    const { error } = await supabase.rpc('fn_definir_cliente_publico' as never, { p_cliente: clienteId, p_exibir: v } as never);
    setSalvando(false);
    if (error) { toast.error(error.message); return; }
    setExibir(v);
    toast.success(v ? 'Cliente autorizado: aparece em "Nossos Clientes" na página inicial.' : 'Cliente retirado de "Nossos Clientes".');
  };

  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4" data-testid="autorizacao-publica">
      <span className="flex min-w-0 items-start gap-3">
        <Globe className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <span>
          <span className="block text-sm font-semibold text-white">Mostrar em "Nossos Clientes"</span>
          <span className="block text-xs text-slate-400">Aparece na página inicial e no mapa da rede só com nome, logo, cidade e estado. Nenhum dado de contrato, valor ou contato é mostrado.</span>
        </span>
      </span>
      <Switch checked={exibir} disabled={salvando} onCheckedChange={mudar} aria-label='Mostrar em "Nossos Clientes"' />
    </label>
  );
}
