import { useState, type MouseEvent } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

export type TipoExcluivel =
  | 'PROPOSTA' | 'PEDIDO_INSERCAO' | 'PRODUCAO' | 'AGENDAMENTO' | 'CAMPANHA'
  | 'REPRESENTANTE' | 'PONTO_PARCEIRO' | 'COBRANCA' | 'CONTATO'
  | 'NOTA_FISCAL' | 'COMISSAO' | 'CHAMADO' | 'USUARIO';

const ROTULO: Record<TipoExcluivel, string> = {
  PROPOSTA: 'proposta', PEDIDO_INSERCAO: 'pedido de inserção', PRODUCAO: 'produção', AGENDAMENTO: 'agendamento',
  CAMPANHA: 'campanha', REPRESENTANTE: 'representante', PONTO_PARCEIRO: 'ponto parceiro', COBRANCA: 'cobrança', CONTATO: 'contato',
  NOTA_FISCAL: 'nota fiscal', COMISSAO: 'comissão', CHAMADO: 'chamado', USUARIO: 'usuário',
};

/** Chama a exclusão central do banco (fn_excluir_registro). Devolve erro em português, pronto para mostrar. */
export async function excluirRegistro(tipo: TipoExcluivel, id: string): Promise<{ ok: boolean; arquivado: boolean; erro?: string; aviso?: string }> {
  if (tipo === 'USUARIO') {
    // F-140: usuário (funcionário, gestor de mídias, membro da equipe) — o servidor confere a permissão, arquiva o
    // cadastro e encerra a conta de login.
    const { data, error } = await supabase.functions.invoke('excluir-usuario', { body: { usuarioId: id } });
    const corpo = (data ?? null) as { ok?: boolean; error?: string; aviso?: string } | null;
    if (error || !corpo?.ok) {
      let motivo = corpo?.error || '';
      if (!motivo && error && typeof (error as { context?: { json?: () => Promise<unknown> } }).context?.json === 'function') {
        try { motivo = ((await (error as { context: { json: () => Promise<{ error?: string }> } }).context.json())?.error) || ''; } catch { /* sem corpo */ }
      }
      return { ok: false, arquivado: false, erro: motivo || 'Não foi possível excluir o usuário.' };
    }
    return { ok: true, arquivado: true, aviso: corpo.aviso };
  }
  const { data, error } = await supabase.rpc('fn_excluir_registro' as never, { p_tipo: tipo, p_id: id } as never);
  if (error) return { ok: false, arquivado: false, erro: error.message || 'Não foi possível excluir.' };
  return { ok: true, arquivado: (data as { modo?: string } | null)?.modo === 'ARQUIVADO' };
}

interface Props {
  tipo: TipoExcluivel;
  id: string;
  /** Nome que aparece na confirmação (ex.: número da proposta, nome do representante). */
  nome?: string;
  /** Chamado depois de excluir, para a tela recarregar a lista. */
  onExcluido?: () => void;
  /** 'icone' = só a lixeira (para linhas de tabela); 'texto' = lixeira + "Excluir". */
  formato?: 'icone' | 'texto';
  className?: string;
  /** Aviso extra na confirmação (ex.: o que mais será removido junto). */
  aviso?: string;
}

/**
 * F-136 — Botão de excluir padrão do sistema: confirma antes, mostra o motivo quando o banco recusa
 * (pagamento recebido, anúncio no ar, etc.) e só diz "excluído" quando de fato excluiu.
 */
export function BotaoExcluir({ tipo, id, nome, onExcluido, formato = 'icone', className, aviso }: Props) {
  const [aberto, setAberto] = useState(false);
  const [excluindo, setExcluindo] = useState(false);
  const rotulo = ROTULO[tipo];

  const abrir = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); setAberto(true); };

  const confirmar = async (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExcluindo(true);
    const r = await excluirRegistro(tipo, id);
    setExcluindo(false);
    if (!r.ok) { toast.error(r.erro); return; }
    setAberto(false);
    toast.success(tipo === 'USUARIO'
      ? 'Usuário excluído: o acesso foi encerrado e o histórico foi preservado.'
      : r.arquivado
        ? `${rotulo.charAt(0).toUpperCase() + rotulo.slice(1)} removido(a) das listas. O histórico foi preservado.`
        : `${rotulo.charAt(0).toUpperCase() + rotulo.slice(1)} excluído(a).`);
    if (r.aviso) toast.warning(r.aviso);
    onExcluido?.();
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={formato === 'icone' ? 'icon' : 'sm'}
        onClick={abrir}
        aria-label={`Excluir ${rotulo}${nome ? ` ${nome}` : ''}`}
        title={`Excluir ${rotulo}`}
        data-testid="botao-excluir"
        className={cn(
          'text-rose-400 hover:bg-rose-500/10 hover:text-rose-300',
          formato === 'icone' ? 'h-8 w-8' : 'h-8 gap-1.5 px-2.5',
          className,
        )}
      >
        <Trash2 className="h-4 w-4" />
        {formato === 'texto' && <span>Excluir</span>}
      </Button>

      <AlertDialog open={aberto} onOpenChange={(v) => { if (!excluindo) setAberto(v); }}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()}>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {rotulo}?</AlertDialogTitle>
            <AlertDialogDescription>
              {nome ? <>Você está excluindo <strong className="text-foreground">{nome}</strong>. </> : null}
              Esta ação não pode ser desfeita.{aviso ? ` ${aviso}` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmar}
              disabled={excluindo}
              data-testid="confirmar-exclusao"
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {excluindo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
